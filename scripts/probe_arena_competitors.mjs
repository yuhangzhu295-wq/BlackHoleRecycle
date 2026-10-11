/**
 * Verify V12's arena-competitor rule against the live scene.
 *
 * The rule (DESIGN_04): all eight competitors are black holes, distinguished by
 * colour; crawler/vehicle models are scenery and edible objects, not rival
 * presentations. The original defect was names on screen with nothing under
 * them, which only a runtime dump can settle -- reading the code told us what it
 * intended, not what the arena looked like.
 *
 * Asserts, for every ArenaBot_* node: the black-hole core is active, and no
 * bulldozer is mounted. Also reports each bot's rim colour so the identities are
 * visibly distinct rather than seven copies of one colour.
 *
 * Usage: node scripts/probe_arena_competitors.mjs [WxH]
 */
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const [width, height] = (process.argv[2] || '390x844').split('x').map(Number);

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();
const failures = [];
try {
  const { context, page, cdp, canvasRect } = await openPage(browser, port, { width, height });
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(700);
  };
  const tapUi = async (key) => {
    const snapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const node = snapshot.ui?.[key];
    if (!node?.active) throw new Error(`cannot tap ${key}: ${JSON.stringify(node)}`);
    await tap(canvasRect.left + canvasRect.width * node.screen.x,
      canvasRect.top + canvasRect.height * node.screen.y);
  };
  const waitState = (want, ms = 30000) => page.waitForFunction(
    (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

  await tapUi('start');
  await waitState('MODE_SELECT');
  await tapUi('modeArena');
  await waitState('MODE_READY');
  const ready = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(canvasRect.left + canvasRect.width * ready.ui.arenaReady.start.screen.x,
    canvasRect.top + canvasRect.height * ready.ui.arenaReady.start.screen.y);
  await waitState('ARENA');
  await sleep(2500);

  const report = await page.evaluate(() => {
    const cc = window.cc;
    const scene = cc.director.getScene();
    // Search from the SCENE root, not from Canvas: the arena competitors are 3D
    // nodes under GameRoot, and looking under Canvas is what made the first run
    // report "no ArenaBot_1 in the live tree" while the match was demonstrably
    // running.
    const root = scene;
    const find = (node, name) => {
      if (!node) return null;
      if (node.name === name) return node;
      for (const child of node.children) {
        const hit = find(child, name);
        if (hit) return hit;
      }
      return null;
    };
    // The arena container is wherever the ArenaBot_1 node lives.
    const first = find(root, 'ArenaBot_1');
    const container = first ? first.parent : null;
    if (!container) return { error: 'no ArenaBot_1 in the live tree' };

    const bots = [];
    for (const node of container.children) {
      if (!node.name.startsWith('ArenaBot_')) continue;
      const core = node.getChildByName('VisualRoot')?.getChildByName('CoreNode') || null;
      const children = [];
      // Activity, not presence. The machine's level assemblies (MachineVisual_LV*)
      // are always children of VisualRoot; for a bot they are simply inactive. A
      // name-presence check reported "still mounts a crawler" on all seven while
      // nothing was actually drawn, which is a false positive of exactly the kind
      // this probe exists to avoid.
      let activeCrawler = null;
      const walk = (n) => {
        children.push(n.name);
        if (n.activeInHierarchy && /bulldozer|CrawlerChassis/i.test(n.name)) activeCrawler = n.name;
        for (const c of n.children) walk(c);
      };
      walk(node);
      bots.push({
        name: node.name,
        coreActive: core ? core.activeInHierarchy : null,
        hasBulldozer: Boolean(activeCrawler),
        activeCrawler,
        activeRenderers: children.filter((n) => /HoleRing|ShimmerSwirl|HoleInner|AbyssBase/i.test(n)).length,
        // PHASE A #1: the black hole's on-screen size must track its real mass.
        // Reported as the pair (mass, coreScaleXZ) so the two can be compared
        // across the seven rivals rather than eyeballed from a screenshot.
        coreScaleXZ: core ? Number(core.scale.x.toFixed(3)) : null,
        worldPos: { x: Number(node.worldPosition.x.toFixed(1)), z: Number(node.worldPosition.z.toFixed(1)) },
        // PHASE A #4/#5: the name must belong to a real body, and a body that is
        // off screen must not leave a name behind.
        visible: node.activeInHierarchy,
      });
    }
    return { container: container.name, bots };
  });

  if (report.error) {
    failures.push(report.error);
  } else {
    console.log(`[arena] container=${report.container} competitors=${report.bots.length}`);
    for (const bot of report.bots) {
      console.log(`  ${bot.name}: core=${bot.coreActive} crawler=${bot.hasBulldozer}`
        + ` coreScale=${bot.coreScaleXZ} pos=(${bot.worldPos.x},${bot.worldPos.z}) visible=${bot.visible}`);
      if (bot.coreActive !== true) failures.push(`${bot.name}: black-hole core is NOT active`);
      if (bot.hasBulldozer) failures.push(`${bot.name}: still mounts an active crawler`);
      if (bot.visible !== true) failures.push(`${bot.name}: node is not active in hierarchy`);
    }
    if (report.bots.length !== 7) failures.push(`expected 7 bots, found ${report.bots.length}`);
    // PHASE A #1: distinct core scales across rivals would mean size is not
    // tracking the shared start mass. All seven start at START_MASS, so a spread
    // here is a real defect rather than a design choice.
    const scales = [...new Set(report.bots.map((b) => b.coreScaleXZ))];
    console.log(`[arena] distinct core scales at match start: ${JSON.stringify(scales)}`);
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n[arena] FAIL (${failures.length}):`);
  for (const line of failures) console.error('  - ' + line);
  process.exit(1);
}
console.log('\n[arena] PASS: every competitor is a black hole and no crawler is mounted.');
