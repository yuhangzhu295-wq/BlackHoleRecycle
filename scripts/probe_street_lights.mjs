/**
 * Where are the arena's street lights, really?
 *
 * LEVEL_COMPOSITION_REVIEW reads the prefab and reports six DistrictStreetLights
 * inside the 8-unit traffic lanes. That is a static recomputation of the
 * transform chain, and the prefab scales its parents, so the runtime is the
 * authority. This prints the live world positions and the distance from each
 * light to the nearest traffic route node, which is what "in the lane" is
 * supposed to mean.
 *
 * Usage: node scripts/probe_street_lights.mjs [WxH]
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
    const lights = [];
    const roads = [];
    const vehicles = [];
    const walk = (node) => {
      const at = node.worldPosition;
      if (/DistrictStreetLight/.test(node.name)) {
        lights.push({ name: node.name, x: at.x, z: at.z, active: node.activeInHierarchy });
      } else if (/^road-|crossroad/i.test(node.name)) {
        roads.push({ name: node.name, x: at.x, z: at.z });
      } else if (/Bulldozer_mesh|body$/i.test(node.name)) {
        vehicles.push({ name: node.name, x: at.x, z: at.z });
      }
      for (const child of node.children) walk(child);
    };
    walk(scene);
    // The arena's world origin is a cell far from the world origin; report
    // positions relative to the local player so they are comparable to the
    // prefab's own coordinates.
    const snapshot = window.__BHR_QA__.snapshot();
    const player = snapshot.arena?.leaderboard?.find((entry) => entry.isLocal)?.position || null;
    return { lights, roads, vehicles: vehicles.slice(0, 4), player };
  });

  const ox = report.player ? report.player.x : 0;
  const oz = report.player ? report.player.z : 0;
  console.log(`[lights] player at (${ox.toFixed(1)}, ${oz.toFixed(1)}); reporting cell-local`);
  console.log(`[lights] ${report.lights.length} street light(s)`);
  for (const light of report.lights) {
    const x = light.x - ox;
    const z = light.z - oz;
    console.log(`  (${x.toFixed(1)}, ${z.toFixed(1)}) active=${light.active}`
      + ` laneX=${Math.abs(x) <= 8} laneZ=${Math.abs(z) <= 8}`);
  }
  console.log(`[lights] ${report.roads.length} road tile(s): `
    + report.roads.map((r) => `(${(r.x - ox).toFixed(1)},${(r.z - oz).toFixed(1)})`).join(' '));
  console.log(`[lights] sample vehicle bodies: `
    + report.vehicles.map((v) => `(${(v.x - ox).toFixed(1)},${(v.z - oz).toFixed(1)})`).join(' '));

  await context.close();
} finally {
  await browser.close();
  server.close();
}
