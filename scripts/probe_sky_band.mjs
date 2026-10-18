/** Is the grey band in the sky a ground tile, or something else?
 *
 * The paved-ground change produces a grey band above the horizon on the arena
 * frame. Suspicion: a ground tile is being placed where it should not be, or its
 * scale/height is wrong. This projects a screen ray through the band into the world
 * and names what it hits, which settles it without guessing from pixels.
 *
 * Usage: node scripts/probe_sky_band.mjs [WxH]
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
  const waitState = (want, ms = 45000) => page.waitForFunction(
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
    let camera = null;
    const find = (node) => {
      const comp = node.getComponent ? node.getComponent('cc.Camera') : null;
      if (comp && comp.enabled && node.activeInHierarchy && !camera) camera = comp;
      for (const child of node.children) find(child);
    };
    find(scene);
    const viewport = cc.view.getViewportRect();
    // The band sits in the upper third: sample a vertical column of rays and
    // report each hit's node name and world y.
    const ray = new cc.geometry.Ray();
    const out = [];
    for (const ny of [0.06, 0.10, 0.14, 0.18, 0.22, 0.26, 0.30]) {
      const sx = viewport.x + 0.5 * viewport.width;
      const sy = viewport.y + ny * viewport.height;
      camera.screenPointToRay(sx, sy, ray);
      const o = ray.o; const d = ray.d;
      const hitY = d.y !== 0 ? -o.y / d.y : null;
      out.push({
        ny,
        cameraY: Number(o.y.toFixed(2)),
        groundYAtRay: hitY && hitY > 0 ? Number(hitY.toFixed(1)) : null,
        screenPoint: [Math.round(sx), Math.round(sy)],
      });
    }
    // Also list every DistrictGround node's world extent, which is the ground
    // the manager spawns.
    const grounds = [];
    const walk = (node) => {
      if (/DistrictGround/i.test(node.name || '')) {
        grounds.push({
          name: node.name,
          worldY: Number(node.worldPosition.y.toFixed(3)),
          scaleY: Number((node.scale.y || 0).toFixed(2)),
        });
      }
      for (const child of node.children) walk(child);
    };
    walk(scene);
    return { rays: out, grounds: grounds.slice(0, 12) };
  });

  console.log('[band] vertical ray column through the artefact');
  for (const row of report.rays) {
    console.log(`  ny=${row.ny.toFixed(2)} screen=${row.screenPoint} cameraY=${row.cameraY}`
      + ` groundYAtRay=${row.groundYAtRay === null ? 'n/a' : row.groundYAtRay}`);
  }
  console.log(`[band] ${report.grounds.length} DistrictGround node(s):`);
  for (const ground of report.grounds) {
    console.log(`  ${ground.name} worldY=${ground.worldY} scaleY=${ground.scaleY}`);
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
