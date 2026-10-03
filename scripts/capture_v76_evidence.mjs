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
  path.join(repoRoot, 'cocos', 'assets', 'scripts', 'core', 'RenderProfile.ts'),
  path.join(repoRoot, 'cocos', 'assets', 'scripts', 'ui', 'RevivePageController.ts'),
  path.join(repoRoot, 'cocos', 'extensions', 'black-hole-home-builder', 'scene.js'),
  path.join(repoRoot, 'cocos', 'assets', 'scenes', 'Game.scene'),
];
const buildFiles = [
  path.join(buildDirectory, 'index.html'),
  path.join(buildDirectory, 'assets', 'main', 'index.js'),
];

console.log('=== V7.6 MTIME AUDIT ===');
let latestSourceMs = 0;
for (const sf of sourceFiles) {
  const stat = statSync(sf);
  latestSourceMs = Math.max(latestSourceMs, stat.mtimeMs);
  console.log(`Source ${path.basename(sf)}: ${stat.mtime.toISOString()} (${stat.mtimeMs})`);
}
let earliestBuildMs = Infinity;
for (const bf of buildFiles) {
  const stat = statSync(bf);
  earliestBuildMs = Math.min(earliestBuildMs, stat.mtimeMs);
  console.log(`Build ${path.basename(bf)}: ${stat.mtime.toISOString()} (${stat.mtimeMs})`);
}

if (earliestBuildMs <= latestSourceMs) {
  console.error(`WARNING: Build files (${earliestBuildMs}) are not strictly newer than source files (${latestSourceMs})!`);
} else {
  console.log(`CONFIRMED: All build files are strictly newer than source files (diff: ${earliestBuildMs - latestSourceMs} ms).`);
}

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
page.on('console', (msg) => {
  const t = msg.text();
  if (!t.includes('Asset DB is resume') && !t.includes('refresh') && !t.includes('socket')) {
    console.log('BROWSER:', t);
  }
});
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
async function captureEvidence(key, extra) {
  const s = await snap(page);
  dump[key] = { gameState: s.gameState, ui: s.ui, settlement: s.settlement, arena: s.arena, extra: extra || null };
  const geomPath = path.join(outDir, `v76-geom-${key}.json`);
  const pngPath = path.join(outDir, `v76-390x844-${key}.png`);
  writeFileSync(geomPath, JSON.stringify(dump[key], null, 2), 'utf8');
  await page.screenshot({ path: pngPath });
  const captureMtime = statSync(pngPath).mtime;
  console.log(`Captured ${key} -> ${path.basename(pngPath)} (capture mtime: ${captureMtime.toISOString()}, ms: ${statSync(pngPath).mtimeMs})`);
  return s;
}

// 1. Capture Gameplay frame (showing player and clear road below player, no ParkHedgeNorth)
let s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', 8000, 'MS');
await sleep(800);

s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.modeEndless, 'ME')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', 8000, 'MR_ENDLESS');
await sleep(1000);

s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.endlessReady.start, 'ES')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'PLAYING', 12000, 'PLAYING');
await sleep(2500);

// Inspect geometry and mesh renderers in gameplay
const gameplayGeom = await page.evaluate(() => {
  const cc = window.cc;
  const scene = cc.director.getScene();
  const mainCamera = scene.getChildByName('Main Camera')?.getComponent('cc.Camera');
  const camPos = mainCamera ? mainCamera.node.worldPosition : null;

  const renderers = [];
  const walk = (node) => {
    const mr = node.getComponent('cc.MeshRenderer');
    if (mr && node.activeInHierarchy && mr.enabled) {
      const wp = node.worldPosition;
      renderers.push({
        name: node.name,
        parent: node.parent?.name,
        worldPos: { x: wp.x, y: wp.y, z: wp.z },
        scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z }
      });
    }
    for (const c of node.children) walk(c);
  };
  walk(scene);

  const hedgePresent = renderers.some((r) => r.name.includes('hedge') || (r.parent && r.parent.includes('Hedge')));
  return {
    cameraPos: camPos ? { x: camPos.x, y: camPos.y, z: camPos.z } : null,
    hedgePresent,
    renderersCount: renderers.length,
    nearForegroundRenderers: renderers.filter((r) => r.worldPos.z > 5 && r.worldPos.z < 15),
  };
});
console.log('Gameplay geometry inspection:', JSON.stringify(gameplayGeom, null, 2));

await captureEvidence('gameplay', { gameplayGeom });

// 2. Pause and exit to Home
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.runtimeHUD.pauseButton, 'PB')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'PAUSED', 6000, 'PAUSED');
await sleep(800);

s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.formalPages.pauseHome, 'PH')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'HOME', 8000, 'HOME');
await sleep(1000);

// 3. Enter Arena mode and capture Revive page
s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST2')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', 8000, 'MS2');
await sleep(800);

s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.modeArena, 'MA')));
await waitState(page, () => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', 8000, 'MR_ARENA');
await sleep(1000);

s = await snap(page);
await tap(cdp, ...Object.values(pt(rect, s.ui.arenaReady.start, 'AS')));
await waitState(page, () => ['ARENA', 'NETWORK_ARENA'].includes(window.__BHR_QA__.snapshot().gameState), 25000, 'ARENA_START');

console.log('In Arena mode, waiting for local player defeat and Revive page...');
// Wait for player defeat by bots
const reviveDeadline = Date.now() + 30000;
let reviveSnapshot = null;
while (Date.now() < reviveDeadline) {
  await sleep(150);
  const cur = await snap(page);
  if (cur.gameState === 'REVIVING' && cur.arena?.localAlive === false && cur.ui?.formalPages?.revive?.active) {
    reviveSnapshot = cur;
    break;
  }
}

if (!reviveSnapshot) {
  throw new Error('TIMEOUT waiting for Revive page');
}

// Extract revive UI details
const reviveUiDetails = await page.evaluate(() => {
  const cc = window.cc;
  const canvas = cc.director.getScene().getChildByName('Canvas');
  const revivePage = canvas?.getChildByName('RevivePage');
  if (!revivePage) return null;

  const getLabelInfo = (name) => {
    const node = revivePage.getChildByName(name);
    if (!node) return null;
    const l = node.getComponent('cc.Label');
    const t = node.getComponent('cc.UITransform');
    return {
      active: node.active,
      string: l?.string,
      fontSize: l?.fontSize,
      color: l?.color ? { r: l.color.r, g: l.color.g, b: l.color.b, a: l.color.a } : null,
      size: t ? { width: t.width, height: t.height } : null,
      pos: { x: node.position.x, y: node.position.y }
    };
  };

  const getPanelInfo = (name) => {
    const node = revivePage.getChildByName(name);
    if (!node) return null;
    const s = node.getComponent('cc.Sprite');
    const t = node.getComponent('cc.UITransform');
    return {
      active: node.active,
      color: s?.color ? { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a } : null,
      size: t ? { width: t.width, height: t.height } : null,
      pos: { x: node.position.x, y: node.position.y }
    };
  };

  return {
    countdownPanel: getPanelInfo('CountdownPanel'),
    countdownLabel: getLabelInfo('CountdownLabel'),
    countdownValue: getLabelInfo('CountdownValue'),
    rankValue: getLabelInfo('RankValue'),
    lossValue: getLabelInfo('LossValue'),
  };
});
console.log('Revive UI inspection:', JSON.stringify(reviveUiDetails, null, 2));

await captureEvidence('revive', { reviveUiDetails });

await browser.close();
server.close();
console.log('=== V7.6 EVIDENCE CAPTURE COMPLETE ===');
