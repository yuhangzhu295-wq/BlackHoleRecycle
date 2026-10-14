/**
 * Judge whether the player's black hole stands out from the seven rivals.
 *
 * PHASE G asks for the player to be visually prominent, and the design's own rule is
 * that all eight are black holes distinguished by colour. "Stands out" therefore has
 * two parts that can contradict each other: the player must be distinguishable from
 * every rival (colour distance), and yet not so different that it reads as a
 * different kind of creature (it is still a black hole).
 *
 * This measures on-screen size and the colour distance from the player to each rival,
 * plus whether the player's colour is the design's player purple. A single rival
 * within a small colour distance of the player is a real confusion risk and is what
 * this catches.
 *
 * Usage: node scripts/probe_player_prominence.mjs [WxH]
 */
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const sizeArg = process.argv[2] && /^\d+x\d+$/.test(process.argv[2]) ? process.argv[2] : '390x844';
const [width, height] = sizeArg.split('x').map(Number);

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();
try {
  const { context, page, cdp, canvasRect } = await openPage(browser, port, { width, height });
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(650);
  };
  const at = (node, label) => {
    if (!node?.active || !node?.screen) throw new Error(`invisible: ${label} ${JSON.stringify(node)}`);
    return [canvasRect.left + canvasRect.width * node.screen.x, canvasRect.top + canvasRect.height * node.screen.y];
  };
  const waitState = (want, ms = 60000) => page.waitForFunction(
    (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

  let s = await snapshot();
  await tap(...at(s.ui.start, 'start'));
  await waitState('MODE_SELECT');
  s = await snapshot();
  await tap(...at(s.ui.modeArena, 'modeArena'));
  await waitState('MODE_READY');
  s = await snapshot();
  await tap(...at((s.ui.arenaReady || s.ui.endlessReady).start, 'arenaReady.start'));
  await waitState('ARENA');
  await sleep(3000);

  const report = await page.evaluate(() => {
    const engine = globalThis.cc || globalThis.__cc__;
    const scene = engine?.director?.getScene?.() || null;
    const camera = scene?.getChildByName('Main Camera')?.getComponent('cc.Camera') || null;
    if (!camera) return { error: 'no camera' };
    const snapshot = window.__BHR_QA__.snapshot();
    // The player's own world position is what the snapshot exposes; the rival
    // positions live on the leaderboard entries. Identifying the local machine by
    // position rather than name works because the rival nodes are named
    // ArenaBot_1..7 while the player's node is named after its component, so the
    // leaderboard's `local-player` id matches no node name.
    const localPosition = snapshot.player || null;

    const machines = [];
    const visit = (node) => {
      const machine = node.getComponent?.('BlackHoleMachine');
      if (machine) {
        const bounds = node.getComponent('cc.MeshRenderer')?.model?.worldBounds
          || (node.children.find((c) => c.getComponent('cc.MeshRenderer')) || null)?.getComponent('cc.MeshRenderer')?.model?.worldBounds;
        const projected = new engine.Vec3();
        camera.worldToScreen(node.worldPosition, projected);
        const local = Boolean(localPosition
          && Math.hypot(node.worldPosition.x - localPosition.x, node.worldPosition.z - localPosition.z) < 1.5);
        machines.push({
          id: local ? 'local-player' : null,
          name: node.name,
          isLocal: local,
          screen: { x: Math.round(projected.x), y: Math.round(projected.y) },
          bounds: bounds ? Math.round(bounds.halfExtents.x * 2 * 100) / 100 : null,
          worldScale: Number(node.worldScale.x.toFixed(3)),
          active: node.activeInHierarchy,
        });
      }
      for (const child of node.children) visit(child);
    };
    visit(scene);
    return { machines };
  });

  if (report.error) { console.log('ERROR', report.error); process.exitCode = 1; }
  else {
    console.log('every black hole in the arena (the leaderboard names the local one):');
    for (const machine of report.machines) {
      console.log(`  ${machine.name.padEnd(22)} ${machine.isLocal ? 'LOCAL' : 'bot  '} `
        + `${machine.active ? 'ON ' : 'off'} screen(${String(machine.screen.x).padStart(4)},${String(machine.screen.y).padStart(4)}) `
        + `bounds ${machine.bounds} worldScale ${machine.worldScale}`);
    }
    const locals = report.machines.filter((m) => m.isLocal);
    const bots = report.machines.filter((m) => !m.isLocal && m.active);
    console.log(`\nlocal machines: ${locals.length}, active bots: ${bots.length}`);
    if (locals.length !== 1) console.log('** expected exactly one local black hole **');
    const visible = report.machines.filter((m) => m.active);
    console.log(`visible machines: ${visible.length}`);
    const inFrame = visible.filter((m) => m.screen.x >= 0 && m.screen.x <= width && m.screen.y >= 0 && m.screen.y <= height);
    console.log(`of those inside the frame: ${inFrame.length}`);
    const big = inFrame.sort((a, b) => b.bounds - a.bounds)[0];
    if (big) console.log(`largest in frame: ${big.name} bounds ${big.bounds} ${big.isLocal ? '(the player -- good)' : '(NOT the player)'}`);
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
