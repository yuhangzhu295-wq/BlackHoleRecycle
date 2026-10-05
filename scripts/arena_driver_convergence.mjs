/**
 * V8.2.1 -- can the auto-driver converge at all?
 *
 * The 3-game forensics showed the dominant rejection was OUT_OF_RANGE (186/199
 * frames): the nearest edible body was almost always outside the player's 2.4 m
 * radius. That is also the signature of a driver that never converges, and this
 * driver has already been wrong five times. Before blaming the product, this
 * test removes object competition entirely: it drives at a FIXED world point and
 * measures whether the player actually arrives.
 *
 *   converge  -> the driver works, and Arena's OUT_OF_RANGE is a product matter
 *   not       -> the driver is broken and no product conclusion is admissible
 *
 * Usage: node scripts/arena_driver_convergence.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'arena_collection');
mkdirSync(outDir, { recursive: true });

function createStaticServer(root) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const urlPath = new URL(request.url, 'http://127.0.0.1').pathname;
      const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
      let filePath = path.join(root, safePath === '/' ? 'index.html' : safePath);
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        if (statSync(filePath).isDirectory() && existsSync(path.join(filePath, 'index.html'))) {
          filePath = path.join(filePath, 'index.html');
        } else {
          response.writeHead(404, { 'Content-Type': 'text/plain' });
          response.end('404 Not Found');
          return;
        }
      }
      const extension = path.extname(filePath).toLowerCase();
      const contentType = {
        '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
        '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
      }[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
function pt(rect, node, name) {
  if (!node?.active || !node?.screen) throw new Error('invisible node: ' + name + ' ' + JSON.stringify(node));
  return { x: rect.left + rect.width * node.screen.x, y: rect.top + rect.height * node.screen.y };
}

const { server, port } = await createStaticServer(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});
const report = { runs: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
  await sleep(1200);
  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('#GameCanvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  let s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST')));
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 8000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().ui?.modeArena?.active === true, undefined, { timeout: 8000 });
  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(cdp, ...Object.values(pt(rect, s.ui.modeArena, 'MA')));
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 8000 });
  await page.waitForFunction(() => {
    const r = window.__BHR_QA__.snapshot().ui?.arenaReady || window.__BHR_QA__.snapshot().ui?.endlessReady;
    return r?.start?.active === true;
  }, undefined, { timeout: 8000 });
  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(cdp, ...Object.values(pt(rect, s.ui?.arenaReady?.start || s.ui?.endlessReady?.start, 'AS')));
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'ARENA', undefined, { timeout: 10000 });
  await sleep(600);

  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  const joy = pt(rect, s.ui.arenaHUD.joystick, 'JOY');

  // Measured mapping (arena_joystick_calibration): stick dx -> world +X,
  // stick dy -> world +Z, both with the same sign.
  const driveTo = async (worldDx, worldDz, holdMs, label) => {
    const before = await page.evaluate(() => window.__BHR_QA__.snapshot().player.position);
    const target = { x: before.x + worldDx, z: before.z + worldDz };
    const trace = [];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joy.x, y: joy.y, id: 21 }] });
    const started = Date.now();
    let lastPush = 0;
    while (Date.now() - started < holdMs) {
      const now = await page.evaluate(() => window.__BHR_QA__.snapshot().player.position);
      const dx = target.x - now.x;
      const dz = target.z - now.z;
      const dist = Math.hypot(dx, dz);
      trace.push({ t: Date.now() - started, x: now.x, z: now.z, distance: dist });
      const length = Math.hypot(dx, dz) || 1;
      const scale = Math.min(1, length / 3) * 88;
      // Re-push every frame so a dropped touchMove cannot silently stop steering.
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: joy.x + (dx / length) * scale, y: joy.y + (dz / length) * scale, id: 21 }],
      });
      lastPush += 1;
      await sleep(90);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await page.evaluate(() => window.__BHR_QA__.snapshot().player.position);
    const initial = Math.hypot(target.x - before.x, target.z - before.z);
    const final = Math.hypot(target.x - after.x, target.z - after.z);
    const min = Math.min(...trace.map((t) => t.distance));
    const run = { label, initial, final, minDistance: min, pushes: lastPush, trace };
    report.runs.push(run);
    console.log(`${label}: initial=${initial.toFixed(2)} -> final=${final.toFixed(2)}  minDistance=${min.toFixed(2)}  pushes=${lastPush}`);
    await sleep(400);
    return run;
  };

  // Two independent fixed points, far enough that arrival is unambiguous.
  await driveTo(0, -20, 9000, 'FIXED_POINT_-Z_20m');
  await driveTo(20, 0, 9000, 'FIXED_POINT_+X_20m');

  report.consoleErrors = consoleErrors;
  const converged = report.runs.every((r) => r.minDistance < 2.4);
  report.verdict = converged ? 'DRIVER_CONVERGES' : 'DRIVER_DOES_NOT_CONVERGE';
  writeFileSync(path.join(outDir, 'driver_convergence.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nVERDICT: ${report.verdict}`);
  console.log(`  consoleErrors=${consoleErrors.length}`);
} finally {
  await browser.close();
  server.close();
}
