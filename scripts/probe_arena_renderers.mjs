/**
 * Identify every renderer visible in the arena frame by ancestry.
 *
 * The map prefab's Park group has six empty nodes with no renderer, yet the frame
 * shows a black tree line; the Buildings group has meshes but the composition
 * still reads as empty. Dumping the prefab alone cannot answer "what is actually
 * drawn", so this lists every MeshRenderer under the cell in the LIVE tree, with
 * its ancestry and world bounds, and marks which ones cover the frame.
 *
 * Usage: node scripts/probe_arena_renderers.mjs [WxH]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');

const sizeArg = process.argv[2] && /^\d+x\d+$/.test(process.argv[2]) ? process.argv[2] : '390x844';
const [width, height] = sizeArg.split('x').map(Number);

function serve(root) {
  return new Promise((resolve) => {
    const server = createServer((req, rep) => {
      const u = new URL(req.url, 'http://127.0.0.1').pathname;
      const safe = path.normalize(u).replace(/^(\.\.[/\\])+/, '');
      let fp = path.join(root, safe === '/' ? 'index.html' : safe);
      if (!existsSync(fp) || statSync(fp).isDirectory()) {
        if (statSync(fp).isDirectory() && existsSync(path.join(fp, 'index.html'))) fp = path.join(fp, 'index.html');
        else { rep.writeHead(404); rep.end('404'); return; }
      }
      const ct = {
        '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
        '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
      }[path.extname(fp).toLowerCase()] || 'application/octet-stream';
      rep.writeHead(200, { 'Content-Type': ct });
      rep.end(readFileSync(fp));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { server, port } = await serve(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});
try {
  const context = await browser.newContext({
    viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('#GameCanvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(650);
  };
  const at = (node, label) => {
    if (!node?.active || !node?.screen) throw new Error(`invisible: ${label} ${JSON.stringify(node)}`);
    return [rect.left + rect.width * node.screen.x, rect.top + rect.height * node.screen.y];
  };
  const waitState = (want, ms = 60000) => page.waitForFunction(
    (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

  let s = await snapshot();
  await tap(...at(s.ui.start, 'start'));
  await waitState('MODE_SELECT');
  s = await snapshot();
  await tap(...at(s.ui.modeArena, 'modeArena'));
  await waitState('MODE_READY');
  s = await snapshot();
  await tap(...at((s.ui.arenaReady || s.ui.endlessReady).start, 'arenaReady.start'));
  await waitState('ARENA');
  await sleep(2600);

  const report = await page.evaluate(() => {
    const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
    if (!scene) return { error: 'no scene' };
    const find = (root, name) => {
      if (root.name === name) return root;
      for (const child of root.children) {
        const hit = find(child, name);
        if (hit) return hit;
      }
      return null;
    };
    const cell = find(scene, 'WorldCell_6_0');
    if (!cell) return { error: 'WorldCell_6_0 not in the live tree' };

    const rows = [];
    const visit = (node, trail) => {
      const here = trail.concat(node.name);
      for (const renderer of node.getComponents?.('cc.MeshRenderer') || []) {
        const bounds = renderer.model?.worldBounds;
        const material = renderer.material;
        const colour = material?.getProperty?.('mainColor');
        rows.push({
          path: here.join('/'),
          node: node.name,
          size: bounds ? `${Math.round(bounds.halfExtents.x * 2)}x${Math.round(bounds.halfExtents.y * 2)}x${Math.round(bounds.halfExtents.z * 2)}` : '?',
          centre: bounds ? `(${Math.round(bounds.center.x)},${Math.round(bounds.center.y)},${Math.round(bounds.center.z)})` : '?',
          material: material ? (material.name || '(unnamed)') : 'NONE',
          colour: colour ? `${Math.round((colour.x ?? colour.r) * 255)},${Math.round((colour.y ?? colour.g) * 255)},${Math.round((colour.z ?? colour.b) * 255)}` : '-',
          hasTexture: Boolean(material?.getProperty?.('mainTexture')),
          enabled: renderer.enabled,
          active: node.activeInHierarchy,
        });
      }
      for (const child of node.children) visit(child, here);
    };
    visit(cell, []);

    return {
      cellName: cell.name,
      layers: {},
      renderers: rows,
      groupCounts: Object.fromEntries(cell.children.map((c) => [c.name, c.children.length])),
    };
  });

  if (report.error) {
    console.log('ERROR', report.error);
    process.exitCode = 1;
  } else {
    console.log(`cell ${report.cellName} groups ${JSON.stringify(report.groupCounts)}`);
    console.log(`mesh renderers: ${report.renderers.length}`);
    const grouped = {};
    for (const row of report.renderers) {
      const group = row.path.split('/').slice(1, 2)[0] || 'cell';
      (grouped[group] = grouped[group] || []).push(row);
    }
    for (const [group, rows] of Object.entries(grouped)) {
      console.log(`\n=== ${group} (${rows.length}) ===`);
      for (const row of rows.slice(0, 8)) {
        console.log(`  ${row.node.padEnd(28)} ${row.size.padEnd(14)} ${row.centre.padEnd(18)} `
          + `${row.active ? 'ON ' : 'off'} ${row.material} rgba=${row.colour} tex=${row.hasTexture}`);
      }
      if (rows.length > 8) console.log(`  ... ${rows.length - 8} more`);
    }
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
