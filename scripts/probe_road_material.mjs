/**
 * What material and texture does the arena's road actually render with?
 *
 * Written because two readings of this had already been wrong. The art spec said
 * the road sampled a five-pixel sliver of the shared atlas; the GLB says it
 * samples a 480x102 region with 67 colours. Then the flat colour in the frame
 * (32% of the play band, #6d7797) is not MAT_ROAD's own `mainColor` (#ced8e9),
 * so "the material has no texture bound" is wrong too. The remaining question is
 * what the renderer is holding, and only the live scene answers it.
 *
 * Usage: node scripts/probe_road_material.mjs [WxH]
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
    const rows = [];
    const seen = new Set();
    const walk = (node) => {
      if (node.getComponent && node.activeInHierarchy) {
        const renderer = node.getComponent('cc.MeshRenderer');
        if (renderer) {
          const material = renderer.getMaterial(0) || renderer.material;
          if (material && !seen.has(material.name + '|' + node.name)) {
            seen.add(material.name + '|' + node.name);
            const texture = material.getProperty ? material.getProperty('mainTexture') : null;
            const mesh = renderer.mesh;
            rows.push({
              node: node.name,
              material: material.name,
              materialUuid: material.uuid || null,
              effect: material.effectAsset ? material.effectAsset.name : null,
              slotUuids: (renderer._materials || []).map((m) => (m && m.__uuid__) || String(m)),
              passes: material.passes ? material.passes.length : null,
              defines: material.passes && material.passes[0]
                ? JSON.stringify(material.passes[0].defines || {}) : null,
              mainColor: material.getProperty ? JSON.stringify(material.getProperty('mainColor')) : null,
              mainTexture: texture
                ? `${texture.name || '(unnamed)'} ${texture.width}x${texture.height}`
                : String(texture),
              tilingOffset: material.getProperty
                ? JSON.stringify(material.getProperty('tilingOffset')) : null,
              meshUuid: mesh ? (mesh._uuid || null) : null,
              // Attribute names live on the vertex bundles, not on `struct`.
              meshUvLayers: mesh && mesh.struct && mesh.struct.vertexBundles
                ? mesh.struct.vertexBundles
                  .flatMap((bundle) => (bundle.attributes || []).map((a) => a.name))
                  .join(',')
                : null,
            });
          }
        }
      }
      for (const child of node.children) walk(child);
    };
    walk(scene);
    return rows;
  });

  const road = report.filter((row) => /road|cross|ground|tile/i.test(row.node)
    || /road|ground|tile/i.test(row.material));
  console.log(`[road] ${report.length} distinct renderer/material pairs; ${road.length} look like road or ground`);
  for (const row of road) {
    console.log(`  node=${row.node} material=${row.material} uuid=${row.materialUuid} effect=${row.effect}`);
    console.log(`    prefabSlotUuids=${JSON.stringify(row.slotUuids)}`);
    console.log(`    mainTexture=${row.mainTexture} mainColor=${row.mainColor}`);
    console.log(`    mesh=${row.meshUuid} uvAttributes=${row.meshUvLayers}`);
    console.log(`    defines=${row.defines}`);
  }
  console.log('\n[road] every material seen:');
  const names = [...new Set(report.map((row) => row.material))].sort();
  for (const name of names) console.log(`  ${name}`);

  await context.close();
} finally {
  await browser.close();
  server.close();
}
