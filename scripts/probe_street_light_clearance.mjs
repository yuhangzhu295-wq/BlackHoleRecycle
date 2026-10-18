/** Do the three recorded street lights actually block a spawn point?
 *
 * The composition baseline records these as overlapping the rival spawn band. Its
 * radial span comes from the NODE's footprint, which is derived from scale and
 * assumes a square body. A street light is not square: its mesh is a 0.05-wide
 * pole 0.6 tall with a 0.24-deep arm, so at scale 3.8 the POLE is 0.19 wide and
 * the ARM reaches 0.9 sideways. Measuring the node as a square claims 3.8 units
 * across, which is twenty times the pole.
 *
 * This projects the six points against each lamp's real geometry: the pole's
 * centre line, and the arm's extent in the direction that matters.
 *
 * Usage: node scripts/probe_street_light_clearance.mjs [WxH]
 */
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const [width, height] = (process.argv[2] || '390x844').split('x').map(Number);

// From street-light.glb at scale 1: the pole's half-width in x/z, and the arm's
// reach along z (the lamp arm hangs off one side).
const POLE_HALF_X = 0.025;
const POLE_HALF_Z = 0.03;
const ARM_REACH_Z = 0.212;

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

  const report = await page.evaluate((geometry) => {
    const { poleHalfX, poleHalfZ, armReachZ } = geometry;
    const scene = window.cc.director.getScene();
    const lamps = [];
    const walk = (node) => {
      if (/DistrictStreetLight/.test(node.name || '')) {
        // Only the ones in the opening cell matter; the district spawns one set per
        // cell, and the rest are off-frame.
        const p = node.worldPosition;
        if (Math.abs(p.x) < 12 && Math.abs(p.z) < 24) {
          lamps.push({ name: node.name, x: p.x, z: p.z, scale: node.scale.x });
        }
      }
      for (const child of node.children) walk(child);
    };
    walk(scene);

    // The seven rival spawn points, from the match's own ring.
    const spawns = [];
    for (let index = 0; index < 7; index += 1) {
      const angle = (2.0 * Math.PI * index) / 7;
      spawns.push({ index, x: 14.0 * Math.cos(angle), z: 14.0 * Math.sin(angle) });
    }

    const rows = [];
    for (const lamp of lamps) {
      for (const spawn of spawns) {
        // The pole occupies a narrow box; the arm reaches one way along z. A spawn
        // point only conflicts if it lands inside the pole box, or inside the arm
        // when the arm points at it.
        const dx = Math.abs(spawn.x - lamp.x);
        const dz = spawn.z - lamp.z;
        const insidePole = dx <= poleHalfX * lamp.scale && Math.abs(dz) <= poleHalfZ * lamp.scale;
        const insideArm = dz <= 0 && Math.abs(dz) <= armReachZ * lamp.scale
          && dx <= poleHalfZ * lamp.scale;
        if (insidePole || insideArm) {
          rows.push({ lamp, spawn, insidePole, insideArm, dx, dz });
        }
      }
    }
    return { lamps, rows };
  }, { poleHalfX: POLE_HALF_X, poleHalfZ: POLE_HALF_Z, armReachZ: ARM_REACH_Z });

  console.log(`[lamp] ${report.lamps.length} lamps in the opening cell`);
  for (const lamp of report.lamps) {
    console.log(`    ${lamp.name} at (${lamp.x.toFixed(1)}, ${lamp.z.toFixed(1)}) scale ${lamp.scale}`
      + ` -> pole ${(POLE_HALF_X * lamp.scale * 2).toFixed(2)} wide`);
  }
  if (!report.rows.length) {
    console.log('[lamp] PASS: no lamp body occupies any of the seven spawn points.');
  } else {
    console.log(`[lamp] FAIL: ${report.rows.length} conflict(s)`);
    for (const row of report.rows) {
      console.log(`    ${row.lamp.name} vs spawn ${row.spawn.index}:`
        + ` dx=${row.dx.toFixed(2)} dz=${row.dz.toFixed(2)}`
        + ` pole=${row.insidePole} arm=${row.insideArm}`);
    }
    process.exitCode = 1;
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
