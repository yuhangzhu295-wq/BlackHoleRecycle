/**
 * Captures fresh, non-duplicated gameplay screenshots for the WeChat filing
 * form.  It builds the real Cocos Creator 3.8.3 Web Mobile target and only
 * drives the same visible buttons / joystick a player uses.  The QA bridge is
 * read-only: it is used to locate rendered controls and verify state changes,
 * never to grant level, coins, or positions.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptFile), '..');
const cocosProject = path.join(root, 'cocos');
const buildDirectory = path.join(cocosProject, 'build', 'web-mobile');
const outputDirectory = path.join(root, 'outputs', '微信小游戏备案材料', '游戏截图');
const creatorExe = process.env.COCOS_CREATOR_EXE
  || 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\CocosCreator.exe';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildCocosWebMobile() {
  return new Promise((resolve, reject) => {
    if (!existsSync(creatorExe)) {
      reject(new Error(`Cocos Creator 3.8.3 was not found: ${creatorExe}`));
      return;
    }
    const child = spawn(creatorExe, [
      '--project', cocosProject,
      '--build', 'platform=web-mobile;debug=false;orientation=portrait;',
    ], { cwd: cocosProject, windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || code === 36) {
        resolve(output);
        return;
      }
      reject(new Error(`Cocos CLI build failed with exit code ${code}.\n${output}`));
    });
  });
}

function serveStatic(directory) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, '');
      const filename = path.resolve(directory, relative);
      if (!filename.startsWith(`${directory}${path.sep}`) && filename !== path.join(directory, 'index.html')) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if (!existsSync(filename)) {
        response.writeHead(404).end('Not found');
        return;
      }
      const ext = path.extname(filename).toLowerCase();
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
      }[ext] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(readFileSync(filename));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function snapshot(page) {
  return page.evaluate(() => window.__BHR_QA__.snapshot());
}

function pointForNode(canvas, current, node, label) {
  assert(node?.active && node?.screen, `Rendered control is unavailable: ${label}`);
  return {
    x: canvas.left + canvas.width * node.screen.x,
    y: canvas.top + canvas.height * node.screen.y,
  };
}

async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((resolve) => setTimeout(resolve, 65));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function dragJoystick(cdp, startX, startY, endX, endY) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY }] });
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: Math.round(startX + (endX - startX) * step / 8),
        y: Math.round(startY + (endY - startY) * step / 8),
      }],
    });
    await new Promise((resolve) => setTimeout(resolve, 24));
  }
}

async function releaseJoystick(cdp) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

function logicalPosition(current) {
  const origin = current.world?.streaming?.logicalOrigin;
  assert(origin && Number.isFinite(current.player?.x) && Number.isFinite(current.player?.z), 'Runtime player/world state is unavailable.');
  return { x: current.player.x + origin.x, z: current.player.z + origin.z };
}

async function moveTo(cdp, page, joystick, target, label, radius = 1.6) {
  const deadline = Date.now() + 30_000;
  let current = await snapshot(page);
  while (Date.now() < deadline) {
    const position = logicalPosition(current);
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= radius) return current;
    const right = current.camera.right;
    const forward = current.camera.forward;
    const inputX = (dx * right.x + dz * right.z) / distance;
    const inputY = (dx * forward.x + dz * forward.z) / distance;
    const magnitude = distance > 8 ? 0.9 : Math.max(0.30, Math.min(0.62, distance / 8 * 0.62));
    const endX = joystick.x + Math.max(-1, Math.min(1, inputX)) * joystick.maxOffsetX * magnitude;
    const endY = joystick.y - Math.max(-1, Math.min(1, inputY)) * joystick.maxOffsetY * magnitude;
    await dragJoystick(cdp, joystick.x, joystick.y, endX, endY);
    const velocityDistance = Math.min(92, Math.hypot(endX - joystick.x, endY - joystick.y));
    const estimatedSpeed = Math.max(0.5, 7.5 * Math.max(0, (velocityDistance / 92 - 0.1) / 0.9));
    const holdMs = Math.max(120, Math.min(distance <= 8 ? 220 : 850,
      Math.round(Math.max(0, distance - radius * 0.45) / estimatedSpeed * 1000)));
    await page.waitForTimeout(holdMs);
    await releaseJoystick(cdp);
    await page.waitForTimeout(220);
    current = await snapshot(page);
    assert(Math.hypot(current.machine?.velocity?.x || 0, current.machine?.velocity?.z || 0) < 0.08,
      `Joystick did not release cleanly while moving to ${label}.`);
  }
  throw new Error(`Could not reach gameplay target: ${label}`);
}

async function enterModeSelect(cdp, page, canvas) {
  let current = await snapshot(page);
  const start = pointForNode(canvas, current, current.ui?.start, 'Home → start');
  await tap(cdp, start.x, start.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 6_000 });
  current = await snapshot(page);
  assert(current.ui?.modePage?.active, 'Mode selection page did not render.');
  return current;
}

async function openFreshRuntime() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return { browser, context, page, errors };
}

let server;
let browser;
let context;
try {
  console.log('[filing-capture] Building the official Cocos Creator 3.8.3 Web Mobile target...');
  await buildCocosWebMobile();
  assert(existsSync(path.join(buildDirectory, 'index.html')), 'Official Cocos Web Mobile build output is missing.');
  mkdirSync(outputDirectory, { recursive: true });
  server = await serveStatic(buildDirectory);
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;

  // Screenshot 1: player-facing choice between the two actual game modes.
  ({ browser, context, page: globalThis.filingPage, errors: globalThis.filingErrors } = await openFreshRuntime());
  await globalThis.filingPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await globalThis.filingPage.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 45_000 });
  let canvas = await globalThis.filingPage.locator('#GameCanvas').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
  assert(canvas.width === 390 && canvas.height === 844, `Unexpected capture viewport: ${JSON.stringify(canvas)}`);
  const cdp = await context.newCDPSession(globalThis.filingPage);
  let current = await enterModeSelect(cdp, globalThis.filingPage, canvas);
  await globalThis.filingPage.waitForTimeout(300);
  await globalThis.filingPage.screenshot({ path: path.join(outputDirectory, '08-玩法-模式选择-真实运行.png') });
  assert(globalThis.filingErrors.length === 0, `Runtime console errors: ${globalThis.filingErrors.join(' | ')}`);
  await context.close();
  await browser.close();
  context = null;
  browser = null;

  // Screenshot 2: a real local 1v7 arena, including live rank, timer, roster
  // indicators and the touch joystick.
  ({ browser, context, page: globalThis.filingPage, errors: globalThis.filingErrors } = await openFreshRuntime());
  await globalThis.filingPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await globalThis.filingPage.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 45_000 });
  canvas = await globalThis.filingPage.locator('#GameCanvas').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
  const arenaCdp = await context.newCDPSession(globalThis.filingPage);
  current = await enterModeSelect(arenaCdp, globalThis.filingPage, canvas);
  const arena = pointForNode(canvas, current, current.ui?.modeArena, 'Mode select → arena');
  await tap(arenaCdp, arena.x, arena.y);
  await globalThis.filingPage.waitForFunction(() => {
    const state = window.__BHR_QA__.snapshot();
    return state.gameState === 'ARENA' && state.ui?.arenaHUD?.root?.active === true;
  }, undefined, { timeout: 8_000 });
  await globalThis.filingPage.waitForTimeout(1_100);
  current = await snapshot(globalThis.filingPage);
  assert(current.arena?.competitorCount === 8 && current.ui?.arenaHUD?.joystick?.active,
    'Live 1v7 arena HUD did not render.');
  await globalThis.filingPage.screenshot({ path: path.join(outputDirectory, '09-玩法-竞技吞噬实战-真实运行.png') });
  assert(globalThis.filingErrors.length === 0, `Runtime console errors: ${globalThis.filingErrors.join(' | ')}`);
  await context.close();
  await browser.close();
  context = null;
  browser = null;

  // Screenshot 3: genuine endless-mode movement, real T1 absorption and the
  // resulting LV2 evolution.  No state is modified directly by this script.
  ({ browser, context, page: globalThis.filingPage, errors: globalThis.filingErrors } = await openFreshRuntime());
  await globalThis.filingPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await globalThis.filingPage.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 45_000 });
  canvas = await globalThis.filingPage.locator('#GameCanvas').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
  const endlessCdp = await context.newCDPSession(globalThis.filingPage);
  current = await enterModeSelect(endlessCdp, globalThis.filingPage, canvas);
  const endless = pointForNode(canvas, current, current.ui?.modeEndless, 'Mode select → endless');
  await tap(endlessCdp, endless.x, endless.y);
  await globalThis.filingPage.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 6_000 });
  current = await snapshot(globalThis.filingPage);
  const joystickCenter = pointForNode(canvas, current, current.ui?.runtimeHUD?.joystick, 'Endless touch joystick');
  const joystick = {
    ...joystickCenter,
    maxOffsetX: Math.min(120, canvas.width - (joystickCenter.x - canvas.left) - 3),
    maxOffsetY: Math.min(120, canvas.top + canvas.height - joystickCenter.y - 3),
  };
  await moveTo(endlessCdp, globalThis.filingPage, joystick, { x: 0, z: 5.2 }, 'starter T1 cluster');
  await globalThis.filingPage.waitForFunction(() => window.__BHR_QA__.snapshot().machine.level >= 2, undefined, { timeout: 6_000 });
  current = await snapshot(globalThis.filingPage);
  assert(current.machine?.level >= 2 && current.machine?.maxTier >= 2
    && (current.session?.absorbedTiers?.[1] || 0) > 0,
  `Real T1 absorption / LV2 evolution did not complete: ${JSON.stringify(current.machine)}`);
  await globalThis.filingPage.screenshot({ path: path.join(outputDirectory, '10-玩法-无尽进化-真实运行.png') });
  assert(globalThis.filingErrors.length === 0, `Runtime console errors: ${globalThis.filingErrors.join(' | ')}`);

  console.log('[filing-capture] PASS: 3 fresh, distinct real Cocos gameplay screenshots were written.');
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
