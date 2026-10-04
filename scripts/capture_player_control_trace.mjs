import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'control_trace');
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
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
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
  if (!node?.active || !node?.screen) throw new Error('invisible node: ' + name);
  return { x: rect.left + rect.width * node.screen.x, y: rect.top + rect.height * node.screen.y };
}

const label = process.argv[2] || 'before';
const traceOutputPath = path.join(outDir, `trace_${label}.json`);

console.log(`Starting control trace capture: ${label}`);
const { server, port } = await createStaticServer(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
  await sleep(1500);

  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('#GameCanvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  // Start game: Home -> Mode Select -> Endless Ready -> Playing
  let s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST')));
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 8000 });
  await sleep(500);

  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(cdp, ...Object.values(pt(rect, s.ui.modeEndless, 'ME')));
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 8000 });
  await sleep(500);

  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(cdp, ...Object.values(pt(rect, s.ui.endlessReady.start, 'ES')));
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 8000 });
  await sleep(1200);

  // We are now in PLAYING state!
  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  const joystick = s.ui.runtimeHUD.joystick;
  const joystickCentre = pt(rect, joystick, 'JOY');
  console.log(`Joystick centre: ${joystickCentre.x}, ${joystickCentre.y}`);

  // Test scenarios:
  // Scenario 1: Stick pushed to full from rest (upward / forward, dy = -92px)
  // Scenario 2: Direction reversal at speed (from forward dy = -92px to backward dy = +92px)
  // Scenario 3: Release to stop
  // We record high-resolution trace frames before, during, and after each phase.

  const frames = [];
  const sampleInterval = 16; // ~60fps sampling
  let sampling = true;

  const samplerPromise = (async () => {
    while (sampling) {
      const snapData = await page.evaluate(() => {
        const qa = window.__BHR_QA__;
        const snap = qa.snapshot();
        return {
          trace: snap.playerControlTrace.latest,
          machineLevel: snap.machine.level,
        };
      });
      if (snapData.trace) {
        frames.push(snapData.trace);
      }
      await sleep(sampleInterval);
    }
  })();

  console.log('Rest phase (300ms)...');
  await sleep(300);

  console.log('Scenario 1: Push stick to full (+Z world / forward, touch dy = -92)...');
  const touchId = 1;
  const startX = joystickCentre.x;
  const startY = joystickCentre.y;
  const targetX = startX;
  const targetY = startY - 92;

  // Touch start
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y: startY, id: touchId }],
  });
  // Quick ramp to full stick over ~48ms (arcade swipe)
  for (let step = 1; step <= 3; step++) {
    await sleep(16);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: Math.round(startX + (targetX - startX) * step / 3),
        y: Math.round(startY + (targetY - startY) * step / 3),
        id: touchId,
      }],
    });
  }

  // Hold full forward for 800ms
  console.log('Holding full forward (800ms)...');
  await sleep(800);

  // Scenario 2: Direction reversal at speed (dy = +92, reversing stick direction 180 degrees)
  console.log('Scenario 2: Direction reversal to full backward (dy = +92)...');
  const reverseY = startY + 92;
  for (let step = 1; step <= 3; step++) {
    await sleep(16);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: startX,
        y: Math.round(targetY + (reverseY - targetY) * step / 3),
        id: touchId,
      }],
    });
  }

  // Hold reverse for 800ms
  console.log('Holding reverse (800ms)...');
  await sleep(800);

  // Scenario 3: Release stick to stop
  console.log('Scenario 3: Release stick...');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  // Observe deceleration to stop for 600ms
  console.log('Observing deceleration to stop (600ms)...');
  await sleep(600);

  // Stop sampling
  sampling = false;
  await samplerPromise;

  // Also read full internal buffer from QABridge
  const fullBuffer = await page.evaluate(() => {
    return window.__BHR_QA__.getControlTrace();
  });

  console.log(`Recorded ${frames.length} sampled frames, ${fullBuffer.length} engine-stepped frames.`);

  const report = {
    label,
    timestamp: new Date().toISOString(),
    sampledFrames: frames,
    engineFrames: fullBuffer,
  };

  writeFileSync(traceOutputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Trace saved to ${traceOutputPath}`);

} finally {
  await browser.close();
  server.close();
}
