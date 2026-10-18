/**
 * Which arena nodes actually draw, where do they land on screen, and what
 * colour do they cover?
 *
 * A review agent reported the arena frame's lower half as holding ~1% building
 * colour while the prefab holds 38 Arena* nodes all inside |x|<=13.5. Those
 * cannot both be true, and the candidates are: the nodes are inactive or have no
 * mesh, they project outside the viewport anyway, or the colour classifier is too
 * strict to recognise a rendered building.
 *
 * This walks the live tree and reports, per node: active, mesh count, world
 * position, and the screen rect of its world AABB corners.
 *
 * Usage: node scripts/probe_arena_nodes.mjs [WxH]
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
    const findCamera = (node) => {
      const comp = node.getComponent ? node.getComponent('cc.Camera') : null;
      if (comp && comp.enabled && node.activeInHierarchy && !camera) camera = comp;
      for (const child of node.children) findCamera(child);
    };
    findCamera(scene);
    const viewport = cc.view.getViewportRect();
    const player = window.__BHR_QA__.snapshot().arena?.leaderboard
      ?.find((entry) => entry.isLocal)?.position || { x: 0, z: 0 };

    const rows = [];
    const walk = (node) => {
      const name = node.name || '';
      if (/^Arena(Wall|Back|Corner|Vista|Far|Tree|Park)/.test(name)) {
        const renderers = node.getComponentsInChildren('cc.MeshRenderer')
          .filter((r) => r.enabled && r.node.activeInHierarchy);
        let minNx = null; let maxNx = null; let minNy = null; let maxNy = null;
        for (const renderer of renderers) {
          const model = renderer.model;
          if (!model || !model.worldBounds) continue;
          const centre = model.worldBounds.center;
          const half = model.worldBounds.halfExtents;
          for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
              for (const sz of [-1, 1]) {
                const at = new cc.Vec3(centre.x + sx * half.x, centre.y + sy * half.y,
                  centre.z + sz * half.z);
                const screen = camera.worldToScreen(at, new cc.Vec3());
                const nx = (screen.x - viewport.x) / viewport.width;
                const ny = (screen.y - viewport.y) / viewport.height;
                if (minNx === null || nx < minNx) minNx = nx;
                if (maxNx === null || nx > maxNx) maxNx = nx;
                if (minNy === null || ny < minNy) minNy = ny;
                if (maxNy === null || ny > maxNy) maxNy = ny;
              }
            }
          }
        }
        const visible = minNx !== null && maxNx > 0 && minNx < 1 && maxNy > 0 && minNy < 1;
        rows.push({
          name,
          world: [Number(node.worldPosition.x.toFixed(1)), Number(node.worldPosition.z.toFixed(1))],
          active: node.activeInHierarchy,
          meshes: renderers.length,
          visible,
          onScreenWidth: minNx === null ? null
            : Number((Math.min(1, maxNx) - Math.max(0, minNx)).toFixed(3)),
          rect: minNx === null ? null : [minNx, maxNx, minNy, maxNy].map((v) => Number(v.toFixed(2))),
        });
      }
      for (const child of node.children) walk(child);
    };
    walk(scene);
    return { rows, player: [player.x, player.z] };
  });

  const buildable = report.rows.filter((row) => /Wall|Back|Corner|Vista|Far/.test(row.name));
  const withMesh = buildable.filter((row) => row.meshes > 0);
  const visible = withMesh.filter((row) => row.visible);
  console.log(`[nodes] player at (${report.player}); ${report.rows.length} Arena* nodes`);
  console.log(`  buildings ${buildable.length}, with a mesh ${withMesh.length}, on screen ${visible.length}`);
  const wide = visible.slice().sort((a, b) => b.onScreenWidth - a.onScreenWidth).slice(0, 8);
  for (const row of wide) {
    console.log(`    ${row.name.padEnd(18)} world ${JSON.stringify(row.world)}`
      + ` covers ${(row.onScreenWidth * 100).toFixed(1)}% of frame width, rect ${JSON.stringify(row.rect)}`);
  }
  const off = withMesh.filter((row) => !row.visible);
  console.log(`  buildings with a mesh but NOT on screen: ${off.length}`);
  for (const row of off.slice(0, 6)) {
    console.log(`    ${row.name.padEnd(18)} world ${JSON.stringify(row.world)} rect ${JSON.stringify(row.rect)}`);
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
