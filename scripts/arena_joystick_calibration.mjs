/**
 * V8.2.1 §10 calibration -- what does the arena joystick actually map to?
 *
 * CASE_A_NAVIGATION says the auto-player never reached the target, so the next
 * question is whether its steering mapping is simply wrong for Arena. This
 * pushes the stick in two known screen directions and measures the resulting
 * world displacement, so the mapping is measured instead of assumed.
 *
 * Usage: node scripts/arena_joystick_calibration.mjs
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
const result = { pushes: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
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
  await sleep(800);

  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  const joy = pt(rect, s.ui.arenaHUD.joystick, 'JOY');

  const pushAndMeasure = async (label, dx, dy) => {
    const before = await page.evaluate(() => window.__BHR_QA__.snapshot().player.position);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joy.x, y: joy.y, id: 11 }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: joy.x + dx, y: joy.y + dy, id: 11 }] });
    await sleep(1400);
    const after = await page.evaluate(() => window.__BHR_QA__.snapshot().player.position);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(600);
    const delta = { dx: after.x - before.x, dz: after.z - before.z };
    result.pushes.push({ label, stick: { dx, dy }, before, after, worldDelta: delta,
      magnitude: Math.hypot(delta.dx, delta.dz) });
    console.log(`${label}: stick(${dx},${dy}) -> world dX=${delta.dx.toFixed(2)} dZ=${delta.dz.toFixed(2)} |d|=${Math.hypot(delta.dx, delta.dz).toFixed(2)}`);
  };

  await pushAndMeasure('STICK_UP', 0, -88);
  await pushAndMeasure('STICK_RIGHT', 88, 0);
  await pushAndMeasure('STICK_DOWN', 0, 88);
  await pushAndMeasure('STICK_LEFT', -88, 0);

  writeFileSync(path.join(outDir, 'joystick_calibration.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log('\nMapping conclusion:');
  for (const p of result.pushes) {
    const angle = Math.atan2(p.worldDelta.dz, p.worldDelta.dx) * 180 / Math.PI;
    console.log(`  ${p.label}: world heading ${angle.toFixed(1)} deg, |d|=${p.magnitude.toFixed(2)}`);
  }
} finally {
  await browser.close();
  server.close();
}
