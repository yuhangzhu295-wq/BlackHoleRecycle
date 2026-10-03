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
page.on('pageerror', (e) => console.error('pageerror:', String(e)));
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
  writeFileSync(path.join(outDir, `v733-geom-${key}.json`), JSON.stringify(dump[key], null, 1), 'utf8');
  await page.screenshot({ path: path.join(outDir, `v733-390x844-${key}.png`) });
  console.log(`Captured ${key}`);
  return s;
}

// 01-home
await capturePage('01-home');

// 02-mode
let s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', 8000, 'MS');
await sleep(800);
await capturePage('02-mode');

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

// Capture detailed gameplay renderer list and composition
const gameplayDetails = await page.evaluate(() => {
  const cc = window.cc;
  const scene = cc.director.getScene();
  const canvas = scene.getChildByName('Canvas');
  const mainCamera = scene.getChildByName('Main Camera')?.getComponent('cc.Camera');
  const camPos = mainCamera ? mainCamera.node.worldPosition : null;

  // Find all MeshRenderers in the scene
  const meshRenderers = [];
  const walk = (node) => {
    const mr = node.getComponent('cc.MeshRenderer');
    if (mr && node.activeInHierarchy && mr.enabled) {
      const wp = node.worldPosition;
      const t = node.getComponent('cc.UITransform');
      meshRenderers.push({
        name: node.name,
        parent: node.parent?.name,
        wp: { x: wp.x, y: wp.y, z: wp.z },
        scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z }
      });
    }
    for (const c of node.children) walk(c);
  };
  walk(scene);

  return {
    camera: camPos ? { x: camPos.x, y: camPos.y, z: camPos.z } : null,
    renderers: meshRenderers
  };
});

await capturePage('04-endless-gameplay', { gameplayDetails });

// 06-pause
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.runtimeHUD.pauseButton, 'PB')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'PAUSED', 6000, 'PA');
await sleep(800);

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

// Pause and settle arena
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.arenaHUD.pauseButton, 'AP')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'PAUSED', 8000, 'APA');
await sleep(800);
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.formalPages.pauseSettle, 'APS')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'SETTLEMENT', 10000, 'ASE');
await sleep(1000);

// Extract detailed node geometry during settlement
const settlementGeometry = await page.evaluate(() => {
  const cc = window.cc;
  const canvas = cc.director.getScene().getChildByName('Canvas');
  const settlement = canvas?.getChildByName('SettlementPage');
  if (!settlement) return null;
  const targetNames = [
    'SettlementCard', 'Title', 'Subtitle',
    'ArenaLeaderboardPanel', 'ArenaResult',
    'ArenaRankRow_1', 'ArenaRankRow_5', 'ArenaPlayerRow',
    'ArenaStatMassPanel', 'ArenaStatKillsPanel', 'ArenaStatTimePanel',
    'ArenaRewardPanel', 'ArenaRewardCaption', 'ArenaRewardValue', 'ArenaRewardBreakdown',
    'BtnRestart', 'BtnHome'
  ];
  return targetNames.map((name) => {
    const node = settlement.getChildByName(name);
    if (!node) return { name, present: false };
    const t = node.getComponent('cc.UITransform');
    const label = node.getComponent('cc.Label');
    const wp = node.worldPosition;
    const w = t ? t.width : 0;
    const h = t ? t.height : 0;
    const ay = t ? t.anchorY : 0.5;
    return {
      name,
      active: node.active,
      localPos: { x: node.position.x, y: node.position.y },
      worldPos: { x: wp.x, y: wp.y, z: wp.z },
      width: w,
      height: h,
      yMin: wp.y - h * ay,
      yMax: wp.y + h * (1 - ay),
      label: label?.string ?? null,
      fontSize: label?.fontSize ?? null,
      lineHeight: label?.lineHeight ?? null
    };
  });
});

await capturePage('11-arena-settlement', { settlementGeometry });

writeFileSync(path.join(outDir, 'v733-geom-all.json'), JSON.stringify(dump, null, 1), 'utf8');
console.log('Saved all v733 geometry dumps: ' + Object.keys(dump).join(', '));

await context.close();
await browser.close();
server.close();
