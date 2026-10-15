/**
 * Pin down which material object the ground tile actually renders with.
 *
 * Three readings have already been wrong here, so this prints every material a
 * MeshRenderer exposes at once -- the prefab slot, the shared material, the
 * render material, and the material the mesh itself carries -- instead of
 * inferring which one wins. Without this the next change is a guess, and the
 * project has a documented failure mode for exactly that: a change that passes
 * every gate because it never reached the render path.
 *
 * Usage: node scripts/probe_ground_material.mjs [WxH]
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
    const describe = (material) => {
      if (!material) return null;
      const texture = material.getProperty ? material.getProperty('mainTexture') : null;
      return {
        name: material.name || '(empty)',
        uuid: material.uuid || null,
        effect: material.effectAsset ? material.effectAsset.name : null,
        mainTexture: texture ? `${texture.width}x${texture.height}` : String(texture),
        mainColor: material.getProperty ? JSON.stringify(material.getProperty('mainColor')) : null,
      };
    };
    const rows = [];
    const walk = (node) => {
      const renderer = node.getComponent ? node.getComponent('cc.MeshRenderer') : null;
      if (renderer && node.activeInHierarchy && /^tile|ground/i.test(node.name)) {
        const mesh = renderer.mesh;
        // `mesh.material` is what the renderer falls back to when its own slots
        // are unset, which is the case the live probe reported.
        const meshMaterial = mesh && mesh.renderingSubMeshes && mesh.renderingSubMeshes.length
          ? mesh.renderingSubMeshes[0].material : null;
        rows.push({
          node: node.name,
          slotRefs: (renderer._materials || []).map((m) => (m && m.__uuid__) || String(m)),
          shared: describe(renderer.material),
          getMaterial0: describe(renderer.getMaterial(0)),
          renderMaterial0: typeof renderer.getRenderMaterial === 'function'
            ? describe(renderer.getRenderMaterial(0)) : 'no such method',
          meshMaterial: describe(meshMaterial),
          meshName: mesh ? mesh.name : null,
        });
      }
      for (const child of node.children) walk(child);
    };
    walk(window.cc.director.getScene());
    return rows;
  });

  console.log(`[ground] ${report.length} ground node(s)`);
  for (const row of report.slice(0, 2)) {
    console.log(`  node=${row.node} mesh=${row.meshName}`);
    console.log(`    slotRefs=${JSON.stringify(row.slotRefs)}`);
    for (const key of ['shared', 'getMaterial0', 'renderMaterial0', 'meshMaterial']) {
      const value = row[key];
      console.log(`    ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    }
  }

  await context.close();
} finally {
  await browser.close();
  server.close();
}
