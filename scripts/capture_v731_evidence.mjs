import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'portrait');
mkdirSync(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ttf': 'font/ttf',
};

function createStaticServer(rootInput) {
  const rootDirectory = path.resolve(rootInput);
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const urlPath = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const relativePath = urlPath === '/' ? 'index.html' : urlPath.slice(1);
      const filePath = path.resolve(rootDirectory, relativePath);
      if (!filePath.startsWith(rootDirectory + path.sep) && filePath !== path.join(rootDirectory, 'index.html')) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if (!existsSync(filePath)) { response.writeHead(404).end('Not found'); return; }
      response.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      response.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { server, port } = await createStaticServer(buildDirectory);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });

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
page.on('pageerror', (e) => console.error('pageerror:', String(e).slice(0, 150)));
await page.goto(`http://127.0.0.1:${port}/index.html?qa=1`, { waitUntil: 'load' });
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
  writeFileSync(path.join(outDir, `v731-geom-${key}.json`), JSON.stringify(dump[key], null, 1), 'utf8');
  await page.screenshot({ path: path.join(outDir, `v731-390x844-${key}.png`) });
  console.log(`Captured ${key}`);
  return s;
}

// 01-home
await capturePage('01-home');

// 12-machine
let s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.machine, 'M')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MACHINE_INFO', 6000, 'MI');
await sleep(800);
await capturePage('12-machine');
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.machineInfoBack, 'MB')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'HOME', 6000, 'H');
await sleep(400);

// 13-skin
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.skin, 'S')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'SKIN_SELECTION', 6000, 'SK');
await sleep(900);
await capturePage('13-skin');
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.skinSelectionBack, 'SB')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'HOME', 6000, 'H');
await sleep(400);

// 02-mode
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', 8000, 'MS');
await sleep(800);
await capturePage('02-mode');

// 08-arena-ready
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.modeArena, 'MA')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', 8000, 'MR');
await sleep(1000);
await capturePage('08-arena-ready');
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.arenaReady.back, 'AB')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', 8000, 'MS');
await sleep(400);

// 03-endless-ready
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.modeEndless, 'ME')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', 8000, 'MR');
await sleep(1000);
await capturePage('03-endless-ready');

// 04-endless-gameplay
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.endlessReady.start, 'RS')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'PLAYING', 12000, 'PL');
await sleep(2400);
await capturePage('04-endless-gameplay');

// 06-pause
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.runtimeHUD.pauseButton, 'PB')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'PAUSED', 6000, 'PA');
await sleep(800);
await capturePage('06-pause');

// 07-endless-settlement
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.formalPages.pauseSettle, 'PS')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'SETTLEMENT', 8000, 'SE');
await sleep(1000);
await capturePage('07-endless-settlement');

s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.formalPages.settlementHome, 'SH')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'HOME', 8000, 'H');
await sleep(500);

// Arena gameplay & settlement
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', 8000, 'MS');
await sleep(500);
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.modeArena, 'MA')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', 8000, 'MR');
await sleep(800);
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.arenaReady.start, 'AS')));
await waitState(page, () => ['ARENA', 'NETWORK_ARENA'].includes(window.__BHR_QA__.snapshot().gameState), 25000, 'AR');
await sleep(3200);
await capturePage('09-arena-gameplay');

// Pause and settle arena
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.arenaHUD.pauseButton, 'AP')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'PAUSED', 8000, 'APA');
await sleep(800);
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.formalPages.pauseSettle, 'APS')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'SETTLEMENT', 10000, 'ASE');
await sleep(1000);
await capturePage('11-arena-settlement');

writeFileSync(path.join(outDir, 'v731-geom-all.json'), JSON.stringify(dump, null, 1), 'utf8');
console.log('Saved all geometry dumps: ' + Object.keys(dump).join(', '));

await context.close();
await browser.close();
server.close();
