/**
 * Read the arena camera's actual ground coverage from the live run.
 *
 * The arena's buildings sit at radius 15-40 from the cell centre, and the earlier
 * measurement said the camera shows only the middle ~40 of a 64-unit cell. Which
 * of those buildings are actually in frame decides whether the frame reads as a
 * empty plane, so it is measured rather than derived: project every building's
 * world position to screen and report what lands inside.
 *
 * Usage: node scripts/probe_arena_coverage.mjs [WxH]
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
      const ct = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(fp).toLowerCase()] || 'application/octet-stream';
      rep.writeHead(200, { 'Content-Type': ct });
      rep.end(readFileSync(fp));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { server, port } = await serve(buildDirectory);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'] });
try {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('#GameCanvas').evaluate((c) => { const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
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
  const waitState = (want, ms = 60000) => page.waitForFunction((s) => window.__BHR_QA__.snapshot().gameState === s, want, { timeout: ms });

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
    const engine = globalThis.cc || globalThis.__cc__;
    const scene = engine?.director?.getScene?.() || null;
    const camera = scene?.getChildByName('Main Camera')?.getComponent('cc.Camera') || null;
    if (!camera) return { error: 'no camera' };
    const player = (() => {
      const walk = (n) => { if (n.getComponent?.('BlackHoleMachine')) return n; for (const c of n.children) { const h = walk(c); if (h) return h; } return null; };
      return walk(scene);
    })();
    const canvas = document.getElementById('GameCanvas');
    const w = canvas.width, h = canvas.height;

    const find = (root, name) => { if (root.name === name) return root; for (const c of root.children) { const hit = find(c, name); if (hit) return hit; } return null; };
    const cell = find(scene, 'WorldCell_6_0');
    const groups = {};
    if (cell) {
      for (const child of cell.children) {
        if (['Ground', 'Roads', 'Buildings', 'Park', 'Props'].includes(child.name)) {
          groups[child.name] = child.children.length;
        }
      }
    }

    const buildings = [];
    const marker = new engine.Vec3();
    const projected = new engine.Vec3();
    const visit = (node) => {
      const isMesh = /^((Supermarket|Commercial|Residential|Building|Construction|Parking|Warehouse|CityCenter)[A-Za-z]|.*Building)/.test(node.name)
        && (node.getComponentsInChildren?.('cc.MeshRenderer') || []).length > 0;
      if (isMesh && /Building/i.test(node.name)) {
        const world = node.worldPosition;
        const screen = camera.worldToScreen(new engine.Vec3(world.x, world.y, world.z), projected);
        buildings.push({
          name: node.name,
          world: { x: Math.round(world.x), z: Math.round(world.z), radius: Math.round(Math.hypot(world.x, world.z)) },
          screen: { x: Math.round(screen.x), y: Math.round(screen.y) },
          inFrame: screen.x >= 0 && screen.x <= w && screen.y >= 0 && screen.y <= h,
        });
      }
      for (const child of node.children) visit(child);
    };
    if (cell) visit(cell);

    // Ground grid so the camera's coverage is a measurement, not a derivation.
    const grid = [];
    for (let z = 40; z >= -40; z -= 10) {
      const row = [];
      for (let x = -40; x <= 40; x += 10) {
        const screen = camera.worldToScreen(new engine.Vec3(x, 0, z), projected);
        row.push({ x, z, sx: Math.round(screen.x), sy: Math.round(screen.y),
          inFrame: screen.x >= 0 && screen.x <= w && screen.y >= 0 && screen.y <= h });
      }
      grid.push(row);
    }

    return {
      camera: { world: { x: Math.round(camera.node.worldPosition.x), y: Math.round(camera.node.worldPosition.y), z: Math.round(camera.node.worldPosition.z) }, fov: camera.fov, near: camera.near, far: camera.far },
      canvas: { w, h },
      player: player ? { x: Math.round(player.worldPosition.x), z: Math.round(player.worldPosition.z) } : null,
      groups,
      buildings,
      grid,
    };
  });

  if (report.error) { console.log('ERROR', report.error); process.exitCode = 1; }
  else {
    console.log(`camera world=${JSON.stringify(report.camera.world)} fov=${report.camera.fov} canvas=${report.canvas.w}x${report.canvas.h}`);
    console.log(`player at (${report.player.x},${report.player.z})`);
    console.log(`cell groups: ${JSON.stringify(report.groups)}`);
    const visible = report.buildings.filter((b) => b.inFrame);
    console.log(`buildings in frame: ${visible.length} of ${report.buildings.length}`);
    for (const b of report.buildings) console.log(`  ${b.inFrame ? 'IN ' : 'out'} ${b.name.padEnd(30)} radius ${String(b.world.radius).padStart(3)} screen (${b.screen.x},${b.screen.y})`);
    console.log('\nground grid coverage (rows are z, columns x):');
    const grid = report.grid;
    const xs = grid[0].map((c) => c.x);
    console.log('        ' + xs.map((x) => String(x).padStart(5)).join(''));
    for (const row of grid) {
      console.log(`z=${String(row[0].z).padStart(4)} ` + row.map((c) => (c.inFrame ? ' [##]' : ' [--]')).join(''));
    }
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
