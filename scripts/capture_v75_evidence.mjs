import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'portrait');
mkdirSync(outDir, { recursive: true });

// Record and print mtimes
const sourceFiles = [
  path.join(repoRoot, 'cocos', 'assets', 'scenes', 'Game.scene'),
  path.join(repoRoot, 'cocos', 'assets', 'scripts', 'ui', 'ArenaHUDController.ts'),
  path.join(repoRoot, 'cocos', 'assets', 'scripts', 'ui', 'ModeReadyPageController.ts'),
];
const buildIndex = path.join(buildDirectory, 'index.html');

console.log('--- MTIME AUDIT ---');
for (const sf of sourceFiles) {
  const stat = statSync(sf);
  console.log(`Source ${path.basename(sf)}: ${stat.mtime.toISOString()} (${stat.mtimeMs})`);
}
const buildStat = statSync(buildIndex);
console.log(`Build index.html: ${buildStat.mtime.toISOString()} (${buildStat.mtimeMs})`);

function createStaticServer(rootDirectory) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const urlPath = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^[/\\]+/, '');
      const filePath = path.resolve(rootDirectory, relativePath);
      if (!filePath.startsWith(`${rootDirectory}${path.sep}`) && filePath !== path.join(rootDirectory, 'index.html')) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if (!existsSync(filePath)) {
        response.writeHead(404).end('Not found');
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      const contentType = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.wasm': 'application/wasm',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
      }[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { server, port } = await createStaticServer(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});

async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(70);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const snap = (page) => page.evaluate(() => window.__BHR_QA__.snapshot());
function pt(rect, node, name) {
  if (!node?.active || !node?.screen) throw new Error('invisible node: ' + name);
  return { x: rect.left + rect.width * node.screen.x, y: rect.top + rect.height * node.screen.y };
}
async function waitState(page, fn, ms, label) {
  await page.waitForFunction(fn, undefined, { timeout: ms }).catch(() => { throw new Error('TIMEOUT ' + label); });
}

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
page.on('pageerror', (e) => console.error('BROWSER PAGEERROR:', String(e)));
await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'HOME', 60000, 'HOME');
await sleep(1600);
const cdp = await context.newCDPSession(page);
const rect = await page.locator('#GameCanvas').evaluate((c) => {
  const r = c.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});

const dump = {};
async function capturePage(key, extra) {
  const s = await snap(page);
  dump[key] = { gameState: s.gameState, ui: s.ui, settlement: s.settlement, arena: s.arena, extra: extra || null };
  const geomPath = path.join(outDir, `v75-geom-${key}.json`);
  const pngPath = path.join(outDir, `v75-390x844-${key}.png`);
  writeFileSync(geomPath, JSON.stringify(dump[key], null, 1), 'utf8');
  await page.screenshot({ path: pngPath });
  const captureMtime = statSync(pngPath).mtime;
  console.log(`Captured ${key} -> ${path.basename(pngPath)} (capture mtime: ${captureMtime.toISOString()})`);
  return s;
}

// 01-home
await capturePage('01-home');

// Navigate to 02-mode
let s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', 8000, 'MS');
await sleep(800);

// Navigate to 03-endless-ready
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.modeEndless, 'ME')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', 8000, 'MR');
await sleep(1000);
await capturePage('03-endless-ready');

// Back to mode select
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.endlessReady.back, 'EB')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', 8000, 'MS_RETURN');
await sleep(600);

// Navigate to 08-arena-ready
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.modeArena, 'MA')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', 8000, 'MR_ARENA');
await sleep(1000);
await capturePage('08-arena-ready');

// Start Arena -> 09-arena-gameplay
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.arenaReady.start, 'AS')));
await waitState(page, () => ['ARENA', 'NETWORK_ARENA'].includes(window.__BHR_QA__.snapshot().gameState), 25000, 'AR');
// Wait for warmup countdown to be visible
await sleep(2500);
await capturePage('09-arena-gameplay');

await browser.close();
server.close();
console.log('Capture script finished.');
