/**
 * Real Cocos Creator portrait acceptance.
 *
 * This runner builds the Cocos project with the official 3.8.3 CLI, serves the
 * emitted Web Mobile package, then drives the actual WebGL runtime with CDP
 * touch events. It never imports game code or mutates a running scene.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const cocosProject = path.join(repoRoot, 'cocos');
const creatorExe = process.env.COCOS_CREATOR_EXE || 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\CocosCreator.exe';
const buildDirectory = path.join(cocosProject, 'build', 'web-mobile');
const evidenceDirectory = path.join(cocosProject, 'docs', 'evidence', 'v2', 'portrait');
const reportPath = path.join(evidenceDirectory, 'acceptance-report.json');
const requiredPortraitViewports = [
  { id: '375x667', width: 375, height: 667 },
  { id: '390x844', width: 390, height: 844 },
  { id: '430x932', width: 430, height: 932 },
];

mkdirSync(evidenceDirectory, { recursive: true });

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
      '--build', 'platform=web-mobile;debug=false;orientation=portrait;'
    ], { cwd: cocosProject, windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      // Cocos documents 36 as the command-line build-success code; some
      // Windows installations return the conventional 0 instead.
      if (code === 0 || code === 36) {
        resolve(output);
        return;
      }
      reject(new Error(`Cocos CLI build failed with exit code ${code}.\n${output}`));
    });
  });
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
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function dispatchTouchTap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((resolve) => setTimeout(resolve, 60));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function dispatchTouchDrag(cdp, startX, startY, endX, endY) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY }] });
  for (let step = 1; step <= 12; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: Math.round(startX + (endX - startX) * step / 12),
        y: Math.round(startY + (endY - startY) * step / 12),
      }],
    });
    await new Promise((resolve) => setTimeout(resolve, 24));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function readRuntimeSnapshot(page) {
  return page.evaluate(() => window.__BHR_QA__.snapshot());
}

function validatePortraitSnapshot(viewport, canvasRect, runtimeSnapshot) {
  const portrait = runtimeSnapshot.ui?.portrait;
  assert(viewport.width < viewport.height, `FAIL_NOT_PORTRAIT: browser viewport ${viewport.width}x${viewport.height}`);
  assert(canvasRect.width < canvasRect.height, `FAIL_NOT_PORTRAIT: canvas rect ${canvasRect.width}x${canvasRect.height}`);
  assert(Math.abs(canvasRect.width / canvasRect.height - 9 / 16) < 0.035,
    `FAIL_PORTRAIT_ASPECT: canvas ratio ${canvasRect.width / canvasRect.height}`);
  assert(portrait?.designIsPortrait, 'FAIL_PORTRAIT_DESIGN: design resolution is not portrait');
  assert(portrait?.frameIsPortrait, `FAIL_PORTRAIT_FRAME: frame ${JSON.stringify(runtimeSnapshot.ui.frame)}`);
  assert(portrait?.viewportIsPortrait, `FAIL_PORTRAIT_OVERLAY_ONLY: 3D viewport ${JSON.stringify(portrait?.viewport)}`);
  assert(portrait?.viewportWithinFrame, 'FAIL_PORTRAIT_OVERLAY_ONLY: 3D viewport extends beyond the game frame');
  assert(Math.abs(portrait.viewportRatio - 9 / 16) < 0.035,
    `FAIL_PORTRAIT_OVERLAY_ONLY: 3D viewport ratio ${portrait.viewportRatio}`);
}

async function runPortraitCase(browser, baseUrl, viewport, report) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 45000 });
    const canvasRect = await page.locator('#GameCanvas').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    const snapshot = await readRuntimeSnapshot(page);
    validatePortraitSnapshot(viewport, canvasRect, snapshot);
    assert(runtimeErrors.length === 0, `Runtime console errors: ${runtimeErrors.join(' | ')}`);

    const screenshot = path.join(evidenceDirectory, `portrait-${viewport.id}-home.png`);
    await page.screenshot({ path: screenshot });
    report.viewports.push({ id: viewport.id, canvasRect, portrait: snapshot.ui.portrait, screenshot });

    if (viewport.id === '390x844') {
      const cdp = await context.newCDPSession(page);
      const x = canvasRect.left + canvasRect.width * 0.5;
      const homeStartY = canvasRect.top + canvasRect.height * 0.773;
      await dispatchTouchTap(cdp, x, homeStartY);
      await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
      await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-mode.png') });

      const endlessY = canvasRect.top + canvasRect.height * 0.645;
      await dispatchTouchTap(cdp, x, endlessY);
      await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });

      const dragStartX = canvasRect.left + canvasRect.width * 0.5;
      const dragStartY = canvasRect.top + canvasRect.height * 0.62;
      const drags = [
        { name: 'left', endX: canvasRect.left + canvasRect.width * 0.28, endY: dragStartY, cameraAxis: 'right', sign: -1 },
        { name: 'right', endX: canvasRect.left + canvasRect.width * 0.72, endY: dragStartY, cameraAxis: 'right', sign: 1 },
        // Cocos Node.forward is local +Z; a perspective camera renders along
        // its inverse, so screen-up follows -forward and screen-down +forward.
        { name: 'up', endX: dragStartX, endY: canvasRect.top + canvasRect.height * 0.36, cameraAxis: 'forward', sign: -1 },
        { name: 'down', endX: dragStartX, endY: canvasRect.top + canvasRect.height * 0.84, cameraAxis: 'forward', sign: 1 },
      ];

      report.touch = [];
      for (const drag of drags) {
        const before = await readRuntimeSnapshot(page);
        await dispatchTouchDrag(cdp, dragStartX, dragStartY, drag.endX, drag.endY);
        const inputTarget = (await readRuntimeSnapshot(page)).machine.target;
        await page.waitForTimeout(650);
        const after = await readRuntimeSnapshot(page);
        const delta = {
          x: after.player.x - before.player.x,
          z: after.player.z - before.player.z,
        };
        const cameraDirection = before.camera[drag.cameraAxis];
        const projectedDistance = drag.sign * (
          delta.x * cameraDirection.x + delta.z * cameraDirection.z
        );
        report.touch.push({ direction: drag.name, cameraAxis: drag.cameraAxis, projectedDistance, delta, inputTarget });
        assert(projectedDistance > 0.08,
          `FAIL_TOUCH_PORTRAIT_${drag.name.toUpperCase()}: projected distance ${projectedDistance}`);
      }
      assert(runtimeErrors.length === 0, `Runtime console errors after touch: ${runtimeErrors.join(' | ')}`);
      await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-gameplay.png') });
    }
  } finally {
    await context.close();
  }
}

const report = {
  status: 'RUNNING',
  runner: 'official-cocos-cli + Playwright CDP touch',
  build: null,
  viewports: [],
  touch: [],
  failures: [],
};

let server;
let browser;
try {
  console.log('[acceptance:v2] Building Web Mobile with Cocos Creator 3.8.3...');
  report.build = await buildCocosWebMobile();
  assert(existsSync(path.join(buildDirectory, 'index.html')), `Missing official Cocos build output: ${buildDirectory}`);

  server = await createStaticServer(buildDirectory);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });

  for (const viewport of requiredPortraitViewports) {
    console.log(`[acceptance:v2] Verifying ${viewport.id}...`);
    await runPortraitCase(browser, baseUrl, viewport, report);
  }
  report.status = 'PASS';
  console.log('[acceptance:v2] PASS: real portrait Cocos runtime and CDP touch verified.');
} catch (error) {
  report.status = 'FAIL';
  report.failures.push(error instanceof Error ? error.message : String(error));
  console.error(`[acceptance:v2] FAIL: ${report.failures[0]}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[acceptance:v2] Report: ${reportPath}`);
}
