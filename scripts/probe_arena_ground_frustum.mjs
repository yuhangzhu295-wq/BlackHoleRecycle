/**
 * What world area does the arena camera actually show, on the ground plane?
 *
 * The composition plan needs this and the number it had was wrong: buildings
 * placed at x = +/-20.5 with a 7-unit footprint came out cut by the screen edge,
 * which means the visible x range is narrower than the +/-31 the art-direction
 * spec records. That figure came from measuring ground geometry, not the frustum.
 *
 * This casts a ray through each screen sample and intersects y = 0, which is the
 * only definition that answers "is this thing on screen".
 *
 * Usage: node scripts/probe_arena_ground_frustum.mjs [WxH]
 */
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const [width, height] = (process.argv[2] || '390x844').split('x').map(Number);

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();
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
    if (!node?.active) throw new Error(`cannot tap ${key}`);
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
    const scene = window.cc.director.getScene();
    let camera = null;
    const findCamera = (node) => {
      const comp = node.getComponent ? node.getComponent('cc.Camera') : null;
      if (comp && comp.enabled && node.activeInHierarchy) camera = camera || comp;
      for (const child of node.children) findCamera(child);
    };
    findCamera(scene);
    if (!camera) return { error: 'no active camera' };
    const viewport = window.cc.view.getViewportRect();
    const player = window.__BHR_QA__.snapshot().arena?.leaderboard
      ?.find((entry) => entry.isLocal)?.position || null;
    if (!player) return { error: 'no local player position' };

    const ray = new window.cc.geometry.Ray();
    const hit = new window.cc.Vec3();
    const groundAt = (sx, sy) => {
      camera.screenPointToRay(sx, sy, ray);
      const origin = ray.o;
      const dir = ray.d;
      if (Math.abs(dir.y) < 1e-6) return null;
      const t = -origin.y / dir.y;
      if (t <= 0) return null;
      hit.set(origin.x + dir.x * t, 0, origin.z + dir.z * t);
      return { x: hit.x - player.x, z: hit.z - player.z };
    };

    const samples = {};
    for (const [name, nx, ny] of [
      ['topLeft', 0, 1], ['topRight', 1, 1], ['bottomLeft', 0, 0], ['bottomRight', 1, 0],
      ['midLeft', 0, 0.5], ['midRight', 1, 0.5], ['topMid', 0.5, 1], ['bottomMid', 0.5, 0],
    ]) {
      const at = groundAt(viewport.x + nx * viewport.width, viewport.y + ny * viewport.height);
      samples[name] = at ? { x: Number(at.x.toFixed(2)), z: Number(at.z.toFixed(2)) } : null;
    }
    return { samples, cameraName: camera.node.name };
  });

  if (report.error) {
    console.log('PROBE_ERROR', JSON.stringify(report));
  } else {
    console.log(`[frustum] camera ${report.cameraName}; ground points, relative to the player`);
    for (const [name, at] of Object.entries(report.samples)) {
      console.log(`  ${name.padEnd(12)} ${at ? `(${at.x.toFixed(1)}, ${at.z.toFixed(1)})` : 'no ground hit'}`);
    }
    const left = report.samples.midLeft;
    const right = report.samples.midRight;
    const top = report.samples.topMid;
    const bottom = report.samples.bottomMid;
    if (left && right && top && bottom) {
      console.log(`[frustum] visible ground at mid-height: x ${left.x.toFixed(1)} .. ${right.x.toFixed(1)}`
        + `  (half-width ${Math.abs(right.x - left.x).toFixed(1) / 2})`);
      console.log(`[frustum] visible ground down the centre: z ${top.z.toFixed(1)} .. ${bottom.z.toFixed(1)}`);
    }
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
