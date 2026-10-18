/**
 * Which ground kind is each arena tile actually using, and where is it?
 *
 * The paved-ground swap is supposed to affect the commercial districts only. A
 * frame comparison showed the frame's RIGHT side changed from green to grey, and
 * it must not be a second district's ground quietly becoming paving -- or paving
 * spread over terrain that should stay grass.
 *
 * This reads the live scene: every spawned ground node's name, kind and tile
 * position, plus the district the manager believes it is in.
 *
 * Usage: node scripts/probe_ground_kinds.mjs [WxH]
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
    const scene = window.cc.director.getScene();
    const grounds = [];
    const walk = (node) => {
      const name = node.name || '';
      // The manager names its ground nodes after the KIND it spawned, so the
      // name is the kind. Reading the material's tint besides it proves which
      // material actually reached the renderer.
      if (/DistrictGround|terrainTile/.test(name)) {
        const renderer = node.getComponent('cc.MeshRenderer');
        const material = renderer && (renderer.getMaterial(0) || renderer.material);
        const colour = material && material.getProperty ? material.getProperty('mainColor') : null;
        grounds.push({
          name,
          worldX: Number(node.worldPosition.x.toFixed(1)),
          worldY: Number(node.worldPosition.y.toFixed(2)),
          worldZ: Number(node.worldPosition.z.toFixed(1)),
          tint: colour && colour.r !== undefined
            ? [Math.round(colour.r), Math.round(colour.g), Math.round(colour.b)].join(',')
            : null,
        });
      }
      for (const child of node.children) walk(child);
    };
    walk(scene);
    const snapshot = window.__BHR_QA__.snapshot();
    return {
      grounds,
      infiniteWorld: snapshot.world ? {
        currentCell: snapshot.world.currentCell,
        currentCellSource: snapshot.world.currentCellSource,
        region: snapshot.world.region ?? null,
      } : null,
    };
  });

  const byName = {};
  for (const ground of report.grounds) {
    byName[ground.name] = (byName[ground.name] || 0) + 1;
  }
  console.log('[ground] kinds spawned: %s', JSON.stringify(byName));
  for (const ground of report.grounds.slice(0, 10)) {
    console.log('  %-22s at (%s,%s,%s) tint=%s',
      ground.name, ground.worldX, ground.worldY, ground.worldZ, ground.tint);
  }
  console.log('[ground] world: %s', JSON.stringify(report.infiniteWorld));
  await context.close();
} finally {
  await browser.close();
  server.close();
}
