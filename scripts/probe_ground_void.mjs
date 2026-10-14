/**
 * PHASE 0: find out why the ground stops being drawn past a cell boundary.
 *
 * Localised already: in Endless, driving ~70 units north leaves the lower half of
 * the screen pure black, the seam sits exactly on the cell boundary z=-96, every
 * streamed cell is present and active with a mesh and a material, and it does not
 * recover. So the question is not "is the ground there" but "why is it not drawn".
 *
 * This dumps the things that decide that, for every ground tile in the live tree:
 * layer vs the camera's visibility mask, whether the renderer is enabled, the
 * world bounding box the culler actually uses, and the material's render state.
 *
 * Usage: node scripts/probe_ground_void.mjs [WxH]
 */
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const sizeArg = process.argv[2] && /^\d+x\d+$/.test(process.argv[2]) ? process.argv[2] : '390x844';
const [width, height] = sizeArg.split('x').map(Number);

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();
try {
  const { context, page, cdp, canvasRect } = await openPage(browser, port, { width, height });
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(650);
  };
  const at = (node, label) => {
    if (!node?.active || !node?.screen) throw new Error(`invisible: ${label} ${JSON.stringify(node)}`);
    return [canvasRect.left + canvasRect.width * node.screen.x, canvasRect.top + canvasRect.height * node.screen.y];
  };
  const waitState = (want, ms = 30000) => page.waitForFunction(
    (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

  let s = await snapshot();
  await tap(...at(s.ui.start, 'start'));
  await waitState('MODE_SELECT');
  s = await snapshot();
  await tap(...at(s.ui.modeEndless, 'modeEndless'));
  await waitState('MODE_READY');
  s = await snapshot();
  await tap(...at((s.ui.endlessReady || s.ui.arenaReady).start, 'endlessReady.start'));
  await waitState('PLAYING');
  await sleep(3000);

  // Hold north so the player crosses into the next cell row.
  const centre = at((await snapshot()).ui.runtimeHUD.joystick, 'joystick');
  const held = { x: centre[0], y: centre[1] - 90 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centre[0], y: centre[1] }] });
  await sleep(120);
  const deadline = Date.now() + 9000;
  while (Date.now() < deadline) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [held] });
    await sleep(250);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(2500);
  await page.screenshot({ path: `artifacts/qa/v13/void-${sizeArg}.png` });

  // Read the rule itself at the position that used to be black: the landmark must
  // report hidden here, not merely "the pixels look better".
  const landmarkHere = await page.evaluate(() => {
    const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
    const find = (root, name) => {
      if (root.name === name) return root;
      for (const child of root.children) { const hit = find(child, name); if (hit) return hit; }
      return null;
    };
    const node = find(scene, 'MajadroidConstructionLandmark');
    const player = (() => {
      const walk = (n) => { if (n.getComponent?.('BlackHoleMachine')) return n; for (const c of n.children) { const h = walk(c); if (h) return h; } return null; };
      return walk(scene);
    })();
    if (!node || !player) return { landmark: null, player: null };
    const d = Math.hypot(node.position.x - player.worldPosition.x, node.position.z - player.worldPosition.z);
    return { landmark: { active: node.activeInHierarchy, z: node.position.z }, player: { z: Math.round(player.worldPosition.z) }, distance: Math.round(d) };
  });
  console.log(`\n[landmark] player z=${landmarkHere.player?.z} distance=${landmarkHere.distance} `
    + `active=${landmarkHere.landmark?.active} (must be FALSE inside ` +
    `${50} units, otherwise the black returns)`);

  // Project a ground grid in the SAME moment as that screenshot, so the black
  // region can be read in world coordinates. The boundary is not a constant
  // screen row (568 on the left, 697 on the right), so guessing an interpolation
  // from two projected points is not good enough -- the camera is perspective and
  // the px-per-unit varies with depth.
  const grid = await page.evaluate(() => {
    const engine = globalThis.cc || globalThis.__cc__;
    const scene = engine?.director?.getScene?.() || null;
    const camera = scene?.getChildByName('Main Camera')?.getComponent('cc.Camera') || null;
    if (!camera) return null;
    const rows = [];
    for (let z = -32; z >= -160; z -= 8) {
      const row = [];
      for (let x = -96; x <= 96; x += 32) {
        const screen = camera.worldToScreen(new engine.Vec3(x, 0, z), new engine.Vec3());
        row.push({ x, z, sx: Math.round(screen.x), sy: Math.round(screen.y) });
      }
      rows.push(row);
    }
    return rows;
  });
  if (grid) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`artifacts/qa/v13/ground-grid-${sizeArg}.json`, JSON.stringify(grid, null, 1));
    console.log(`\nground grid -> artifacts/qa/v13/ground-grid-${sizeArg}.json`);
  }

  // The decisive experiment. Every tile reports active, enabled, mesh+material and
  // correct world bounds, and the boundary sits on a TILE seam -- so either the far
  // tiles are not being drawn at all, or they are drawn and something black is on
  // top of them. Hiding every ground tile separates the two: if the black region is
  // the same with the tiles hidden, they were never contributing there.
  // Compare the road meshes that render black against ones that render normally,
  // BEFORE any recolouring. The near field is covered by cell _0_-1's roads, and
  // the same kind of mesh renders grey in the cells further away, so whatever
  // differs is per-instance rather than per-material-kind.
  const roads = await page.evaluate(() => {
    const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
    const out = [];
    const visit = (node) => {
      if (/^road-/.test(node.name)) {
        const renderer = node.getComponent('cc.MeshRenderer');
        const material = renderer?.material;
        const colour = material?.getProperty('mainColor');
        const world = node.worldPosition;
        out.push({
          cell: (() => { let p = node.parent; while (p && !/^WorldCell/.test(p.name)) p = p.parent; return p ? p.name : '?'; })(),
          node: node.name,
          world: { x: Math.round(world.x), z: Math.round(world.z) },
          materialName: material ? (material.name || '(unnamed)') : 'NONE',
          materialUuid: material ? (material.uuid || '(no uuid)') : '-',
          mainColor: colour ? `${Math.round((colour.x ?? colour.r) * 255)},${Math.round((colour.y ?? colour.g) * 255)},${Math.round((colour.z ?? colour.b) * 255)}` : 'n/a',
          hasTexture: Boolean(material?.getProperty('mainTexture')),
          passes: (material?.passes || []).map((pass) => (pass.program || '?') + ':' + (pass.defines?.USE_TEXTURE ? 'T' : '-')).join(' '),
          meshUuid: renderer?.mesh ? (renderer.mesh.uuid || '(no uuid)') : 'NONE',
          meshName: renderer?.mesh ? (renderer.mesh.name || '(unnamed)') : '-',
        });
      }
      for (const child of node.children) visit(child);
    };
    visit(scene);
    return out;
  });
  console.log(`\nroad meshes: ${roads.length}`);
  for (const road of roads.slice(0, 6)) {
    console.log(`  ${road.cell.padEnd(16)} ${road.node.padEnd(20)} world=(${road.world.x},${road.world.z}) `
      + `mat=${road.materialName} colour=${road.mainColor} tex=${road.hasTexture} `
      + `mesh=${road.meshName} passes=[${road.passes}]`);
  }

  // Disable one world group at a time and watch the black region. This predicate
  // needs no decoding -- it asks only "does the black area change" -- so it cannot
  // be fooled by the colour-space conversion that made the encoded run unusable.
  const groups = ['Ground', 'Roads', 'Props', 'Buildings', 'Park', 'TrafficRoutes'];
  const { writeFileSync } = await import('node:fs');
  for (const group of groups) {
    const disabled = await page.evaluate((name) => {
      const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
      let count = 0;
      const visit = (node) => {
        if (node.name === name) {
          for (const renderer of node.getComponentsInChildren?.('cc.MeshRenderer') || []) {
            renderer.enabled = false;
            count += 1;
          }
        }
        for (const child of node.children) visit(child);
      };
      visit(scene);
      return count;
    }, group);
    await sleep(700);
    await page.screenshot({ path: `artifacts/qa/v13/void-without-${group}-${sizeArg}.png` });
    await page.evaluate((name) => {
      const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
      const visit = (node) => {
        if (node.name === name) {
          for (const renderer of node.getComponentsInChildren?.('cc.MeshRenderer') || []) renderer.enabled = true;
        }
        for (const child of node.children) visit(child);
      };
      visit(scene);
    }, group);
    console.log(`  hid ${String(disabled).padStart(4)} renderers of ${group.padEnd(14)} -> void-without-${group}-${sizeArg}.png`);
  }
  writeFileSync(`artifacts/qa/v13/groups-${sizeArg}.json`, JSON.stringify(groups, null, 1));
  console.log(`\ngroup captures written under artifacts/qa/v13/`);

  // Hiding each of the six world groups changed nothing, so the surface covering
  // the black region is NOT part of the streamed static world. List everything
  // else that has geometry over the player, with its ancestry, so it can be named.
  const outsiders = await page.evaluate((groupNames) => {
    const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
    const player = (() => {
      const walk = (node) => {
        if (node.getComponent?.('BlackHoleMachine')) return node;
        for (const child of node.children) { const hit = walk(child); if (hit) return hit; }
        return null;
      };
      return walk(scene);
    })();
    const origin = player ? player.worldPosition : { x: 0, z: 0 };
    const out = [];
    const visit = (node, inGroup) => {
      const here = inGroup || groupNames.includes(node.name);
      for (const renderer of node.getComponents?.('cc.MeshRenderer') || []) {
        if (here) continue;
        const bounds = renderer.model?.worldBounds;
        if (!bounds) continue;
        const near = Math.hypot(bounds.center.x - origin.x, bounds.center.z - origin.z)
          <= bounds.halfExtents.x + bounds.halfExtents.z + 90;
        if (!near) continue;
        const path = (() => { const parts = []; let p = node; while (p && parts.length < 5) { parts.unshift(p.name); p = p.parent; } return parts.join('/'); })();
        out.push({
          path,
          size: `${Math.round(bounds.halfExtents.x * 2)}x${Math.round(bounds.halfExtents.y * 2)}x${Math.round(bounds.halfExtents.z * 2)}`,
          centre: `(${Math.round(bounds.center.x)},${Math.round(bounds.center.y)},${Math.round(bounds.center.z)})`,
          active: node.activeInHierarchy,
          enabled: renderer.enabled,
          scale: node.worldScale.x.toFixed(2),
        });
      }
      for (const child of node.children) visit(child, here);
    };
    visit(scene, false);
    return out;
  }, groups);
  console.log(`\nnon-world geometry near the player: ${outsiders.length}`);
  const bySize = outsiders.map((o) => ({ ...o, area: (o.size.split('x')[0] | 0) * (o.size.split('x')[2] | 0) }))
    .sort((a, b) => b.area - a.area).slice(0, 12);
  for (const item of bySize) {
    console.log(`  ${item.size.padEnd(14)} centre=${item.centre.padEnd(20)} scale=${item.scale.padEnd(7)} `
      + `${item.active ? 'ON ' : 'off'} enabled=${item.enabled}  ${item.path}`);
  }

  // Every pooled CompressibleObject carries a BlobShadow scaled 4.80 -- about
  // 24x19 world units, flat on the ground, stacked wherever the pool left them.
  // Hiding them is the test: if the black region clears, the "unrendered ground"
  // was a pile of overlapping dark decals.
  const shadowsHidden = await page.evaluate(() => {
    const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
    let count = 0;
    const visit = (node) => {
      if (node.name === 'BlobShadow') {
        for (const renderer of node.getComponents?.('cc.MeshRenderer') || []) {
          renderer.enabled = false;
          count += 1;
        }
      }
      for (const child of node.children) visit(child);
    };
    visit(scene);
    return count;
  });
  await sleep(1200);
  await page.screenshot({ path: `artifacts/qa/v13/void-no-blobshadow-${sizeArg}.png` });
  console.log(`\nhid ${shadowsHidden} BlobShadow renderers -> void-no-blobshadow-${sizeArg}.png`);

  // Not the shadows. The other large non-world object over the player is the
  // construction landmark: 15x10x15, sitting 7 units behind the player and 10 units
  // tall, so at this camera height it can fill the bottom of the frame.
  const landmarkHidden = await page.evaluate(() => {
    const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
    let count = 0;
    const visit = (node) => {
      if (/ConstructionLandmark/i.test(node.name)) {
        for (const renderer of node.getComponentsInChildren?.('cc.MeshRenderer') || []) {
          renderer.enabled = false;
          count += 1;
        }
      }
      for (const child of node.children) visit(child);
    };
    visit(scene);
    return count;
  });
  await sleep(1200);
  await page.screenshot({ path: `artifacts/qa/v13/void-no-landmark-${sizeArg}.png` });
  console.log(`hid ${landmarkHidden} construction-landmark renderers -> void-no-landmark-${sizeArg}.png`);

  // With the fix in, the landmark is hidden once the player is inside its skyline
  // range, so it must come BACK when the player returns to the origin -- otherwise
  // the "fix" removed the skyline instead of ranging it. A reload would only show
  // the Home page, which says nothing.
  const centreBack = at((await snapshot()).ui.runtimeHUD.joystick, 'joystick');
  const south = { x: centreBack[0], y: centreBack[1] + 90 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centreBack[0], y: centreBack[1] }] });
  await sleep(120);
  const backDeadline = Date.now() + 9000;
  while (Date.now() < backDeadline) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [south] });
    await sleep(250);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(1500);
  await page.screenshot({ path: `artifacts/qa/v13/verify-return-${sizeArg}.png` });
  const back2 = await snapshot();
  console.log(`drove back to (${Math.round(back2.player.x)},${Math.round(back2.player.z)}) `
    + `-> verify-return-${sizeArg}.png (the skyline must be back)`);

  // Every direction, and the landmark's own visibility at each stop: a fix that
  // only survives a northward walk is not a fix, and the range rule is what the
  // player actually experiences, not the black percentage.
  const landmarkState = () => page.evaluate(() => {
    const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
    const find = (root, name) => {
      if (root.name === name) return root;
      for (const child of root.children) { const hit = find(child, name); if (hit) return hit; }
      return null;
    };
    const node = find(scene, 'MajadroidConstructionLandmark');
    const player = (() => {
      const walk = (n) => { if (n.getComponent?.('BlackHoleMachine')) return n; for (const c of n.children) { const h = walk(c); if (h) return h; } return null; };
      return walk(scene);
    })();
    return {
      landmark: node ? { active: node.activeInHierarchy, position: node.position } : null,
      player: player ? { x: Math.round(player.worldPosition.x), z: Math.round(player.worldPosition.z) } : null,
    };
  });

  const directions = [['east', 90, 0], ['south', 0, 90], ['west', -90, 0], ['north', 0, -90]];
  for (const [label, dx, dy] of directions) {
    const state = await snapshot();
    if (state.gameState !== 'PLAYING') { console.log(`  ${label}: run ended`); break; }
    const centreNow = at(state.ui.runtimeHUD.joystick, 'joystick');
    const target = { x: centreNow[0] + dx, y: centreNow[1] + dy };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centreNow[0], y: centreNow[1] }] });
    await sleep(120);
    const until = Date.now() + 8000;
    while (Date.now() < until) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [target] });
      await sleep(250);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(1200);
    const after = await landmarkState();
    await page.screenshot({ path: `artifacts/qa/v13/direction-${label}-${sizeArg}.png` });
    console.log(`  ${label.padEnd(6)} player=(${after.player.x},${after.player.z}) `
      + `landmark.active=${after.landmark ? after.landmark.active : 'absent'} (at z=${after.landmark ? after.landmark.position.z : '-'})`);
  }


  // The near field is covered by SOMETHING that renders black, and it is not a
  // ground tile. Name it: every renderer whose world bounds contain a point in the
  // black region, with the material state that decides whether it comes out black.
  const culprits = await page.evaluate(() => {
    const engine = globalThis.cc || globalThis.__cc__;
    const scene = engine?.director?.getScene?.() || null;
    const probes = [[0, -60], [0, -70], [20, -65], [-20, -65]];
    const hits = [];
    const visit = (node) => {
      for (const renderer of node.getComponents?.('cc.MeshRenderer') || []) {
        const bounds = renderer.model?.worldBounds;
        if (!bounds) continue;
        const contains = probes.some(([x, z]) => Math.abs(bounds.center.x - x) <= bounds.halfExtents.x
          && Math.abs(bounds.center.z - z) <= bounds.halfExtents.z);
        if (!contains) continue;
        const material = renderer.material;
        const colour = material?.getProperty('mainColor');
        hits.push({
          node: node.name,
          path: (() => { const parts = []; let p = node; while (p && parts.length < 5) { parts.unshift(p.name); p = p.parent; } return parts.join('/'); })(),
          world: { x: Math.round(bounds.center.x), z: Math.round(bounds.center.z) },
          size: { x: Math.round(bounds.halfExtents.x * 2), z: Math.round(bounds.halfExtents.z * 2) },
          material: material ? (material.name || material.uuid || '?') : 'NONE',
          mainColor: colour ? `${colour.x ?? colour.r},${colour.y ?? colour.g},${colour.z ?? colour.b}` : 'n/a',
          hasTexture: Boolean(material?.getProperty('mainTexture')),
          passes: material?.passes?.length ?? 0,
        });
      }
      for (const child of node.children) visit(child);
    };
    visit(scene);
    return hits;
  });
  console.log(`\nrenderers covering the black region: ${culprits.length}`);
  for (const hit of culprits.slice(0, 14)) {
    console.log(`  ${hit.node.padEnd(18)} ${hit.path.slice(0, 58).padEnd(58)} `
      + `world=(${hit.world.x},${hit.world.z}) size=${hit.size.x}x${hit.size.z} `
      + `mat=${hit.material} colour=${hit.mainColor} tex=${hit.hasTexture} passes=${hit.passes}`);
  }

  const report = await page.evaluate(() => {
    const engine = globalThis.cc || globalThis.__cc__;
    const scene = engine?.director?.getScene?.() || null;
    const camera = scene?.getChildByName('Main Camera')?.getComponent('cc.Camera') || null;
    const player = (() => {
      const walk = (node) => {
        if (node.getComponent?.('BlackHoleMachine')) return node;
        for (const child of node.children) { const hit = walk(child); if (hit) return hit; }
        return null;
      };
      return walk(scene);
    })();

    const tiles = [];
    const visit = (node) => {
      if (/^GroundTile/.test(node.name)) {
        const renderer = node.getComponent('cc.MeshRenderer')
          || node.children.map((c) => c.getComponent('cc.MeshRenderer')).find(Boolean);
        const world = node.worldPosition;
        const bounds = renderer?.model?.worldBounds || null;
        tiles.push({
          node: node.name,
          cell: (() => { let p = node.parent; while (p && !/^WorldCell/.test(p.name)) p = p.parent; return p ? p.name : '?'; })(),
          layer: node.layer,
          active: node.activeInHierarchy,
          rendererEnabled: renderer ? renderer.enabled : null,
          world: { x: Math.round(world.x), y: Number(world.y.toFixed(2)), z: Math.round(world.z) },
          scale: Number(node.worldScale.x.toFixed(2)),
          bounds: bounds ? {
            min: { x: Math.round(bounds.center.x - bounds.halfExtents.x), z: Math.round(bounds.center.z - bounds.halfExtents.z) },
            max: { x: Math.round(bounds.center.x + bounds.halfExtents.x), z: Math.round(bounds.center.z + bounds.halfExtents.z) },
          } : 'no-world-bounds',
          visible: renderer?.model?.visFlags ?? renderer?.model?.enabled ?? 'n/a',
        });
      }
      for (const child of node.children) visit(child);
    };
    visit(scene);

    return {
      player: player ? { x: Math.round(player.worldPosition.x), z: Math.round(player.worldPosition.z) } : null,
      camera: camera ? {
        visibility: camera.visibility,
        clearFlags: camera.clearFlags,
        near: camera.near,
        far: camera.far,
        world: { x: Math.round(camera.node.worldPosition.x), y: Math.round(camera.node.worldPosition.y), z: Math.round(camera.node.worldPosition.z) },
      } : null,
      tiles,
    };
  });

  console.log(`player at (${report.player?.x},${report.player?.z})`);
  console.log(`camera ${JSON.stringify(report.camera)}`);
  console.log(`ground tiles: ${report.tiles.length}`);
  for (const tile of report.tiles) {
    console.log(`  ${tile.cell.padEnd(16)} ${tile.node.padEnd(14)} layer=${tile.layer} `
      + `${tile.active ? 'ON ' : 'off'} renderer=${tile.rendererEnabled} scale=${tile.scale} `
      + `world=(${tile.world.x},${tile.world.y},${tile.world.z}) vis=${tile.visible} `
      + `bounds=${typeof tile.bounds === 'string' ? tile.bounds : `x${tile.bounds.min.x}..${tile.bounds.max.x} z${tile.bounds.min.z}..${tile.bounds.max.z}`}`);
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
