/**
 * Capture and dump the two in-game HUDs, for comparison against DESIGN_03/04.
 *
 * `verify:gameplay-visuals` proves the HUD stays in frame; it says nothing about
 * whether the elements the references draw are the elements we draw. This drives
 * a real Endless run and a real Arena run, screenshots each, and prints every
 * node under the HUD page with its position, size and text -- so a missing
 * element, a wrong side, or a label bound to the wrong value is visible as data
 * rather than judged from a picture.
 *
 * Usage: node scripts/probe_gameplay_hud.mjs [WxH]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'v12', 'gameplay');
mkdirSync(outDir, { recursive: true });

const sizeArg = process.argv[2] && /^\d+x\d+$/.test(process.argv[2]) ? process.argv[2] : '390x844';
const [WIDTH, HEIGHT] = sizeArg.split('x').map(Number);

function serve(root) {
  return new Promise((resolve) => {
    const server = createServer((req, rep) => {
      const u = new URL(req.url, 'http://127.0.0.1').pathname;
      const safe = path.normalize(u).replace(/^(\.\.[/\\])+/, '');
      let fp = path.join(root, safe === '/' ? 'index.html' : safe);
      if (!existsSync(fp) || statSync(fp).isDirectory()) {
        if (statSync(fp).isDirectory() && existsSync(path.join(fp, 'index.html'))) fp = path.join(fp, 'index.html');
        else { rep.writeHead(404); rep.end('404'); return; }
      }
      const ct = {
        '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
        '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
      }[path.extname(fp).toLowerCase()] || 'application/octet-stream';
      rep.writeHead(200, { 'Content-Type': ct });
      rep.end(readFileSync(fp));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { server, port } = await serve(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});
try {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
  await sleep(1200);

  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('#GameCanvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(650);
  };
  const at = (node, label) => {
    if (!node?.active || !node?.screen) throw new Error(`invisible: ${label} ${JSON.stringify(node)}`);
    return [rect.left + rect.width * node.screen.x, rect.top + rect.height * node.screen.y];
  };
  const waitState = (want, ms = 30000) => page.waitForFunction(
    (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

  // Dump a HUD page: every descendant with position, size, label text and colour.
  const dumpHud = (pageName) => page.evaluate((name) => {
    const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
    if (!scene) return { error: 'no engine global' };
    const find = (root, wanted) => {
      if (root.name === wanted) return root;
      for (const child of root.children) {
        const hit = find(child, wanted);
        if (hit) return hit;
      }
      return null;
    };
    const hud = find(scene, name);
    if (!hud) return { error: `${name} not in the live tree` };
    const rows = [];
    const walk = (node, depth) => {
      const transform = node.getComponent('cc.UITransform');
      const label = node.getComponent('cc.Label');
      const sprite = node.getComponent('cc.Sprite');
      const frame = sprite?.spriteFrame || null;
      rows.push({
        depth,
        name: node.name,
        active: node.activeInHierarchy,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        w: transform ? Math.round(transform.width) : null,
        h: transform ? Math.round(transform.height) : null,
        text: label ? label.string : null,
        colour: label
          ? `${label.color.r},${label.color.g},${label.color.b}`
          : sprite ? `${sprite.color.r},${sprite.color.g},${sprite.color.b},${sprite.color.a}` : null,
        spriteFrame: frame?.name || null,
        // The declared UITransform size is not what gets drawn: a TRIMMED/RAW
        // sprite renders at its frame's size and ignores it, and a 9-slice
        // renders at the declared size. Without these three the dump cannot tell
        // a bar that is 250 wide from one that draws 500.
        frameSize: frame ? `${Math.round(frame.width)}x${Math.round(frame.height)}` : null,
        sizeMode: sprite ? sprite.sizeMode : null,
        spriteType: sprite ? sprite.type : null,
      });
      for (const child of node.children) walk(child, depth + 1);
    };
    walk(hud, 0);
    return { rows, hudSize: (() => { const t = hud.getComponent('cc.UITransform'); return t ? [t.width, t.height] : null; })() };
  }, pageName);

  const report = {};

  // Drag the joystick from its centre in a direction and HOLD, so the hole is
  // really driven by touch. Returns the before/after state, because "the game
  // runs" and "the game is playable" are different claims: the first is a
  // screenshot, the second needs input to move the player and change the score.
  const driveHold = async (joystickNode, dx, dy, ms) => {
    const centre = at(joystickNode, 'joystick');
    const before = await snapshot();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centre[0], y: centre[1] }] });
    await sleep(120);
    const held = { x: centre[0] + dx, y: centre[1] + dy };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [held] });
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [held] });
      await sleep(250);
    }
    const during = await snapshot();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
    const after = await snapshot();
    return { before, during, after };
  };

  // ---- Endless ------------------------------------------------------------
  let s = await snapshot();
  await tap(...at(s.ui.start, 'start'));
  await waitState('MODE_SELECT');
  s = await snapshot();
  await tap(...at(s.ui.modeEndless, 'modeEndless'));
  await waitState('MODE_READY');
  s = await snapshot();
  await tap(...at((s.ui.endlessReady || s.ui.arenaReady).start, 'endlessReady.start'));
  await waitState('PLAYING');
  await sleep(6000);
  await page.screenshot({ path: path.join(outDir, `endless-hud-${sizeArg}.png`) });
  report.endless = { dump: await dumpHud('EndlessHUD'), snapshot: await snapshot() };
  report.endless.drive = await driveHold((await snapshot()).ui.runtimeHUD.joystick, 0, -90, 9000);
  await page.screenshot({ path: path.join(outDir, `endless-after-drive-${sizeArg}.png`) });

  // ---- Arena --------------------------------------------------------------
  s = await snapshot();
  await tap(...at(s.ui.runtimeHUD.pauseButton, 'runtimeHUD.pauseButton'));
  await sleep(600);
  s = await snapshot();
  await tap(...at(s.ui.formalPages.pauseHome, 'pauseHome'));
  await waitState('HOME', 15000);
  s = await snapshot();
  await tap(...at(s.ui.start, 'start'));
  await waitState('MODE_SELECT');
  s = await snapshot();
  await tap(...at(s.ui.modeArena, 'modeArena'));
  await waitState('MODE_READY');
  s = await snapshot();
  await tap(...at((s.ui.arenaReady || s.ui.endlessReady).start, 'arenaReady.start'));
  await waitState('ARENA');
  // During the 15s combat warmup, not after it: the HUD is torn down the moment
  // the player is defeated and the revive page takes over, which is how the
  // first run of this probe captured the revive page and dumped every HUD node
  // as inactive. The 2.5s here plus the four 3s drives below fit inside the
  // warmup, so the reachability test measures eating rather than being eaten.
  await sleep(2500);
  await page.screenshot({ path: path.join(outDir, `arena-hud-${sizeArg}.png`) });
  report.arena = { dump: await dumpHud('ArenaHUD'), snapshot: await snapshot() };
  // What the player can actually eat, by distance from the spawn. "Spawn has
  // food nearby" is DESIGN_07 point 2, and it is not the same claim as "the
  // cluster table lists a cluster at +-7": the cell only places a handful of
  // cluster items, so a declared cluster can be empty. Tiers come from each
  // object's own template, so "edible at LV1" is read, not assumed.
  const spawnOrigin = (await snapshot()).player.position;
  const edible = await page.evaluate((origin) => {
    const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
    const found = [];
    const walk = (node) => {
      const comp = node.getComponent?.('CompressibleObject') || null;
      if (comp?.template) {
        const p = node.worldPosition;
        found.push({
          type: comp.template.type,
          tier: comp.template.tier,
          mass: comp.template.mass,
          distance: Math.hypot(p.x - origin.x, p.z - origin.z),
        });
      }
      for (const child of node.children) walk(child);
    };
    walk(scene);
    return found;
  }, spawnOrigin);
  report.arena.edible = edible;
  const bands = [[0, 10], [10, 20], [20, 32], [32, 999]];
  console.log('\n  [arena] objects by distance from spawn (LV1 eats T1 only):');
  for (const [lo, hi] of bands) {
    const inBand = edible.filter((o) => o.distance >= lo && o.distance < hi);
    const byTier = {};
    for (const o of inBand) byTier[o.tier] = (byTier[o.tier] || 0) + 1;
    console.log(`    ${String(lo).padStart(3)}-${hi === 999 ? '  ' : String(hi).padStart(2)} units: `
      + `${String(inBand.length).padStart(3)} objects  `
      + Object.entries(byTier).sort().map(([t, n]) => `T${t}:${n}`).join(' '));
  }

  // Drive each cardinal direction in turn. A single blind straight run only
  // proves the line it took was empty, and "the arena player can eat at all"
  // needs the directions tried -- the HUD can be pixel-perfect on a board where
  // nothing is reachable.
  //
  // Run inside the 15s combat warmup on purpose: collection is live the whole
  // time, so this isolates "can the player eat" from "can the player be eaten".
  // A first version ran past the warmup and one direction simply lost 100kg to a
  // larger opponent, which says nothing about whether food is reachable.
  console.log('\n  [arena] a real player driving each direction during the warmup:');
  const directions = [
    ['north', 0, -90], ['east', 90, 0], ['south', 0, 90], ['west', -90, 0],
  ];
  let gained = 0;
  let defeated = false;
  for (const [label, dx, dy] of directions) {
    const state = await snapshot();
    if (state.arena?.localAlive === false || state.gameState !== 'ARENA') {
      defeated = true;
      console.log(`    ${label.padEnd(6)} skipped -- the player was defeated`);
      break;
    }
    const run = await driveHold(state.ui.arenaHUD.joystick, dx, dy, 3000);
    const before = Math.round(run.before.machine?.mass || 0);
    const after = Math.round(run.after.machine?.mass || 0);
    gained += Math.max(0, after - before);
    console.log(`    ${label.padEnd(6)} ${before} -> ${after} kg   moved `
      + `${Math.hypot(run.after.player.x - run.before.player.x, run.after.player.z - run.before.player.z).toFixed(0)}`);
    // The match manager already records why each nearby object was or was not
    // taken. "The player cannot eat" is a symptom; this says which rule refused.
    const trace = run.during.arenaSuctionTrace;
    if (trace) {
      console.log(`           suctionRadius=${trace.playerSuctionRadius} acceptedAny=${trace.localAcceptedAny}`);
      for (const candidate of (trace.nearest || []).slice(0, 3)) {
        console.log(`           ${candidate.templateType ?? candidate.type ?? '?'} `
          + `tier=${candidate.tier} d=${Number(candidate.distance).toFixed(2)} `
          + `-> ${candidate.rejectedReason || 'ACCEPTED'}`);
      }
    }
  }
  console.log(`    total gained while driving: ${gained} kg${defeated ? ' (run cut short by a defeat)' : ''}`);
  // Long enough to leave the 15s combat warmup and cross the opening cell, so
  // "the arena player can move but never eats" is distinguishable from "the
  // drive was too short to reach anything".
  // No second drive here: the direction loop above already covers movement, and
  // a long one after it ran on past a defeat and drove the revive page instead
  // of the arena (the joystick it reaches for is gone by then).
  const afterDrive = await snapshot();
  if (afterDrive.gameState === 'ARENA') {
    await page.screenshot({ path: path.join(outDir, `arena-after-drive-${sizeArg}.png`) });
  }

  for (const [mode, data] of Object.entries(report)) {
    console.log(`\n===== ${mode} HUD =====`);
    if (data.dump.error) { console.log('ERROR', data.dump.error); continue; }
    console.log(`page size ${data.dump.hudSize?.join('x')}`);
    for (const row of data.dump.rows) {
      const parts = [
        '  '.repeat(row.depth) + row.name,
        row.active ? '' : '(off)',
        `@(${row.x},${row.y})`,
        row.w !== null ? `${row.w}x${row.h}` : '',
        row.text !== null ? `label=${JSON.stringify(row.text)}` : '',
        row.spriteFrame ? `frame=${row.spriteFrame}(${row.frameSize} mode=${row.sizeMode} type=${row.spriteType})` : '',
        row.colour && row.text === null ? `rgba=${row.colour}` : '',
      ].filter(Boolean);
      console.log('  ' + parts.join(' '));
    }
    const drive = data.drive;
    if (drive) {
      const p0 = drive.before.player, p1 = drive.after.player;
      const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      console.log(`\n  [playable] joystick held 9s`);
      console.log(`    isDragging during hold : ${drive.during.player.isDragging}`);
      console.log(`    movementInput          : ${JSON.stringify(drive.during.machine?.movementInput)}`);
      console.log(`    position               : (${p0.x.toFixed(1)},${p0.z.toFixed(1)}) -> (${p1.x.toFixed(1)},${p1.z.toFixed(1)})  moved ${moved.toFixed(1)}`);
      console.log(`    mass                   : ${Math.round(drive.before.machine?.mass || 0)} -> ${Math.round(drive.after.machine?.mass || 0)} kg`);
      console.log(`    level                  : ${drive.before.machine?.level} -> ${drive.after.machine?.level}`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
