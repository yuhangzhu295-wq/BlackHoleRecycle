/**
 * V7 PHASE 8 read-only district-cell probe.
 *
 * PHASE 8 claimed the authored district maps placed their ground as a 0.64 m
 * slab that occluded the player, and that it was fixed. No screenshot was kept,
 * so this probe re-derives the evidence independently: it reuses the already
 * built `cocos/build/web-mobile` bundle, drives the player out of the opening
 * cell with real CDP touches, and screenshots a real district cell.
 *
 * Strictly read-only: it never sets gameplay state and never touches the
 * acceptance harness.
 *
 * Usage: node scripts/probe_district_cell.mjs
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outputDirectory = path.join(repoRoot, 'artifacts', 'qa', 'portrait');
const TRAVEL_SECONDS = Number(process.env.BHR_DISTRICT_SECONDS || 26);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm', '.css': 'text/css',
};

function createStaticServer(rootDirectory) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const urlPath = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^[/\\]+/, '');
      const filePath = path.resolve(rootDirectory, relativePath);
      if (!filePath.startsWith(rootDirectory + path.sep) && filePath !== path.join(rootDirectory, 'index.html')) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if (!existsSync(filePath)) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      response.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const snapshot = (page) => page.evaluate(() => window.__BHR_QA__.snapshot());

/**
 * The QA snapshot reports `screen.x/y` as a 0..1 fraction of the canvas (the
 * UI camera's real screen-space centre after the resolution policy is applied),
 * not design-space pixels. Scale by the canvas rect.
 */
function pointFor(rect, point) {
  return {
    x: Math.round(rect.left + rect.width * point.screen.x),
    y: Math.round(rect.top + rect.height * point.screen.y),
  };
}

async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function main() {
  if (!existsSync(path.join(buildDirectory, 'index.html'))) {
    console.error('No built bundle at ' + buildDirectory + ' - run a Creator web-mobile build first.');
    process.exit(1);
  }
  mkdirSync(outputDirectory, { recursive: true });
  const { server, port } = await createStaticServer(buildDirectory);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  try {
    const page = await context.newPage();
    // The QA bridge is only installed behind the explicit `?qa=1` flag; without
    // it the page boots, renders, and never exposes `__BHR_QA__`.
    await page.goto(`http://127.0.0.1:${port}/index.html?qa=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 45000 });
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 15000 });
    const cdp = await context.newCDPSession(page);
    const canvasRect = await page.locator('#GameCanvas').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });

    const home = await snapshot(page);
    const start = pointFor(canvasRect, home.ui.start);
    await tap(cdp, start.x, start.y);
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
    const mode = await snapshot(page);
    const endless = pointFor(canvasRect, mode.ui.modeEndless);
    await tap(cdp, endless.x, endless.y);
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 5000 });

    const visibleHeight = 720 * (canvasRect.height / canvasRect.width);
    const baseFraction = 0.5 + 290 / visibleHeight;
    for (const fraction of [baseFraction, baseFraction + 0.04, baseFraction - 0.04]) {
      await tap(cdp, canvasRect.left + canvasRect.width * 0.5, canvasRect.top + canvasRect.height * fraction);
      await page.waitForTimeout(400);
      if (await page.evaluate(() => window.__BHR_QA__.snapshot().gameState) !== 'MODE_READY') break;
    }
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });
    await page.waitForTimeout(1200);

    const baseline = await snapshot(page);
    const joystick = pointFor(canvasRect, baseline.ui.runtimeHUD.joystick);
    const radius = Math.min(70, canvasRect.width * 0.18);

    await page.screenshot({ path: path.join(outputDirectory, 'phase8-opening-cell.png') });

    // Drive straight north so the player crosses a cell boundary and lands in a
    // district cell (the opening cell is authored Golden City).
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joystick.x, y: joystick.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: joystick.x, y: joystick.y - radius }] });

    const deadline = Date.now() + TRAVEL_SECONDS * 1000;
    let last = baseline;
    let captured = false;
    while (Date.now() < deadline) {
      await page.waitForTimeout(500);
      last = await snapshot(page);
      const source = last.world?.streaming?.currentCellSource || last.infiniteWorld?.currentCellSource;
      if (!captured && source === 'AUTHORED_DISTRICT_MAP') {
        await page.screenshot({ path: path.join(outputDirectory, 'phase8-district-cell.png') });
        captured = true;
      }
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (!captured) {
      await page.screenshot({ path: path.join(outputDirectory, 'phase8-district-cell.png') });
    }

    const streaming = last.world?.streaming || last.infiniteWorld || {};
    console.log(JSON.stringify({
      cellSource: streaming.currentCellSource ?? null,
      authoredDistrictCellCount: streaming.authoredDistrictCellCount ?? null,
      activeCellCount: streaming.activeCellCount ?? null,
      capturedAuthoredDistrict: captured,
      screenshot: 'artifacts/qa/portrait/phase8-district-cell.png',
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
