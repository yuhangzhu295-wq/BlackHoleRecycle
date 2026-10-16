/**
 * Which arena nodes are actually on screen, and how much of the frame do they cover?
 *
 * The composition plan needs this. A placement table that validates against a
 * nominal "frame x -31..31" is worthless when the camera's real visible ground is
 * a narrow trapezoid -- the first pass placed 41 buildings at x = +/-20.5, every
 * one of them outside the frustum, and the plan printed cleanly.
 *
 * So this projects each node to screen and reports coverage by kind, which is the
 * number that says whether the frame reads as a city.
 *
 * Usage: node scripts/probe_arena_composition.mjs [WxH]
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
    const cc = window.cc;
    const scene = cc.director.getScene();
    let camera = null;
    const findCamera = (node) => {
      const comp = node.getComponent ? node.getComponent('cc.Camera') : null;
      if (comp && comp.enabled && node.activeInHierarchy && !camera) camera = comp;
      for (const child of node.children) findCamera(child);
    };
    findCamera(scene);
    const viewport = cc.view.getViewportRect();

    // Screen rect of a node's world AABB, or null when it has no renderer.
    const screenRectOf = (node) => {
      const renderers = node.getComponentsInChildren('cc.MeshRenderer')
        .filter((r) => r.enabled && r.node.activeInHierarchy);
      if (!renderers.length) return null;
      let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
      for (const renderer of renderers) {
        const model = renderer.model;
        if (!model || !model.worldBounds) continue;
        const bounds = model.worldBounds;
        const centre = bounds.center;
        const half = bounds.halfExtents;
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            for (const sz of [-1, 1]) {
              const at = new cc.Vec3(centre.x + sx * half.x, centre.y + sy * half.y,
                centre.z + sz * half.z);
              const screen = camera.worldToScreen(at, new cc.Vec3());
              const nx = (screen.x - viewport.x) / viewport.width;
              const ny = (screen.y - viewport.y) / viewport.height;
              minX = Math.min(minX, nx); maxX = Math.max(maxX, nx);
              minY = Math.min(minY, ny); maxY = Math.max(maxY, ny);
            }
          }
        }
      }
      if (!Number.isFinite(minX)) return null;
      return { minX, maxX, minY, maxY };
    };

    const rows = [];
    const walk = (node) => {
      const name = node.name || '';
      if (/^(Arena|Supermarket|District)/.test(name)) {
        const rect = screenRectOf(node);
        if (rect) {
          const visible = rect.maxX > 0 && rect.minX < 1 && rect.maxY > 0 && rect.minY < 1;
          rows.push({
            name,
            visible,
            onScreenFraction: Number(Math.max(0, Math.min(1, rect.maxX) - Math.max(0, rect.minX)).toFixed(3)),
            rect: [rect.minX, rect.maxX, rect.minY, rect.maxY].map((v) => Number(v.toFixed(2))),
          });
        }
      }
      for (const child of node.children) walk(child);
    };
    walk(scene);
    return { rows };
  });

  const byKind = {};
  for (const row of report.rows) {
    const kind = /Tree/i.test(row.name) ? 'tree'
      : /Light/i.test(row.name) ? 'light'
        : /Sedan|Van|Truck|Car/i.test(row.name) ? 'vehicle'
          : /Box|Fence|Depot/i.test(row.name) ? 'prop' : 'building';
    byKind[kind] = byKind[kind] || { total: 0, visible: 0 };
    byKind[kind].total += 1;
    if (row.visible) byKind[kind].visible += 1;
  }

  console.log(`[composition] ${report.rows.length} named nodes with a renderer`);
  for (const [kind, counts] of Object.entries(byKind).sort()) {
    console.log(`  ${kind.padEnd(9)} ${counts.visible}/${counts.total} on screen`);
  }
  const offscreen = report.rows.filter((row) => !row.visible);
  console.log(`[composition] ${offscreen.length} off screen:`);
  for (const row of offscreen.slice(0, 20)) {
    console.log(`    ${row.name.padEnd(22)} rect ${JSON.stringify(row.rect)}`);
  }
  const onscreen = report.rows.filter((row) => row.visible)
    .sort((a, b) => b.onScreenFraction - a.onScreenFraction);
  console.log('[composition] widest on-screen coverage:');
  for (const row of onscreen.slice(0, 8)) {
    console.log(`    ${row.name.padEnd(22)} covers ${(row.onScreenFraction * 100).toFixed(1)}% of the frame width`);
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
