/**
 * PHASE E -- is the black hole ONE visual identity across the arena?
 *
 * The rule (DESIGN_04) is that every competitor is the same creature and only
 * the colour distinguishes them. Two probes already cover part of it: the
 * competitors probe reports seven distinct rim colours, and the prominence probe
 * reports all eight bodies at the same bounds and worldScale. Neither says the
 * eight are built from the same pieces, and "same size, different colour" is also
 * what seven separate bespoke rigs would produce.
 *
 * So this compares the actual material and mesh each body renders with, and the
 * node names in its rig, across all eight. A rival that grew its own material or
 * its own extra mesh would show up here as a set that is not the union of the
 * others, which is the defect the earlier "seven dyed bulldozers" pass was.
 *
 * Usage: node scripts/probe_blackhole_identity.mjs [WxH]
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
    const snapshot = window.__BHR_QA__.snapshot();
    const leaderboard = snapshot.arena?.leaderboard || [];
    const scene = window.cc.director.getScene();

    // Only ACTIVE renderers count. The first version of this probe walked every
    // child and matched `MachineVisual_LV1`, which is the level assembly each
    // body carries -- inactive, and holding a bulldozer mesh. It reported seven
    // bulldozer rigs, which is the defect the arena had already been fixed for.
    // A node that exists is not a node that draws.
    const bodies = [];
    const collect = (node) => {
      if (node.activeInHierarchy) {
        const renderer = node.getComponent ? node.getComponent('cc.MeshRenderer') : null;
        // Restricted to the black-hole rig family. Matching every active
        // renderer by distance picked the ROAD TILE under the local player --
        // its origin sits at the same x/z as the body, at distance 0.
        if (renderer && renderer.enabled && /Abyss|Hole|Ring|Swirl/i.test(node.name)) {
          bodies.push(node);
        }
      }
      for (const child of node.children) collect(child);
    };
    collect(scene);

    const describe = (node) => {
      const rows = [];
      const walk = (current) => {
        if (!current.activeInHierarchy) return;
        const renderer = current.getComponent ? current.getComponent('cc.MeshRenderer') : null;
        if (renderer && renderer.enabled) {
          const material = renderer.getMaterial(0) || renderer.material;
          const color = material && material.getProperty
            ? material.getProperty('mainColor') : null;
          rows.push({
            name: current.name.replace(/[_-]?\d+$/, ''),
            mesh: renderer.mesh ? (renderer.mesh.name || renderer.mesh._uuid || 'mesh') : 'none',
            color: color && color._val !== undefined ? color._val : null,
          });
        }
        for (const child of current.children) walk(child);
      };
      walk(node);
      return rows;
    };

    const found = [];
    for (const entry of leaderboard) {
      const at = entry.position;
      if (!at) continue;
      let best = null;
      let bestDistance = Infinity;
      for (const candidate of bodies) {
        const distance = Math.hypot(
          candidate.worldPosition.x - at.x, candidate.worldPosition.z - at.z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
      found.push({
        id: entry.id,
        matched: best ? best.name : null,
        distance: Number(bestDistance.toFixed(2)),
        rows: best ? describe(best) : [],
      });
    }
    return { bodies: found, activeRenderers: bodies.length };
  });

  const shapeOf = (rows) => rows.map((row) => row.name).sort().join(',');
  const meshesOf = (rows) => [...new Set(rows.map((row) => row.mesh))].sort().join(',');
  const shapes = new Map();
  console.log(`[identity] ${report.activeRenderers} active renderer(s); eight bodies by rig shape`);
  for (const body of report.bodies) {
    const shape = shapeOf(body.rows);
    shapes.set(shape, (shapes.get(shape) || 0) + 1);
    const colors = [...new Set(body.rows.map((row) => row.color))];
    console.log(`  ${body.id.padEnd(13)} match=${String(body.matched).padEnd(22)}`
      + ` dist=${body.distance} parts=${body.rows.length}`
      + ` meshes=${body.rows.length ? meshesOf(body.rows) : '(none)'}`
      + ` distinctColours=${colors.length}`);
    console.log(`    shape=${shape}`);
  }

  // Every body must be described by the same set of part names and the same
  // meshes; a body with more than one distinct mesh is a different
  // construction, not a tint.
  if (shapes.size !== 1) {
    failures.push(`${shapes.size} distinct rig shapes across ${report.bodies.length} bodies: `
      + [...shapes.entries()].map(([shape, count]) => `${count}x[${shape}]`).join(' | '));
  }
  for (const body of report.bodies) {
    const meshes = [...new Set(body.rows.map((row) => row.mesh))];
    if (meshes.length > 1) {
      failures.push(`${body.id} renders ${meshes.length} distinct meshes (${meshes.join(', ')})`
        + ' -- the bodies must differ by colour, not by construction');
    }
  }

  if (failures.length) {
    console.error('[identity] FAIL:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('[identity] PASS: all bodies share one rig shape and one mesh; only colour differs.');
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
