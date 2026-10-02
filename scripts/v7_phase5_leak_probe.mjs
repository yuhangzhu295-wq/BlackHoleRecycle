/**
 * V7 PHASE 5 read-only leak/visibility probe.
 *
 * The portrait acceptance runner stores only a curated subset of the QA
 * snapshot, so its report does not carry `absorbFeedback`. This probe reuses the
 * already-built `cocos/build/web-mobile` bundle, enters Endless with real CDP
 * touches exactly like the acceptance runner, sweeps the joystick to absorb a
 * run of objects, and reads the pool diagnostics before and after.
 *
 * It is strictly read-only: it never sets gameplay state and never modifies the
 * acceptance harness. It exists to answer the brief's "prove no leak" question
 * with a real runtime number.
 *
 * Usage: node scripts/v7_phase5_leak_probe.mjs
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const SWEEP_SECONDS = Number(process.env.BHR_LEAK_PROBE_SECONDS || 30);

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
      }[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const tap = async (cdp, x, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((resolve) => setTimeout(resolve, 60));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

const pointFor = (canvasRect, node) => ({
  x: canvasRect.left + canvasRect.width * node.screen.x,
  y: canvasRect.top + canvasRect.height * node.screen.y,
});

const snapshot = (page) => page.evaluate(() => window.__BHR_QA__.snapshot());

async function main() {
  if (!existsSync(path.join(buildDirectory, 'index.html'))) {
    throw new Error(`Missing build output: ${buildDirectory}`);
  }
  const server = await createStaticServer(buildDirectory);
  const port = server.address().port;
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  const result = { status: 'FAIL', errors: [] };
  try {
    await page.goto(`http://127.0.0.1:${port}/index.html?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
    await page.waitForTimeout(1000);

    const baseline = await snapshot(page);
    const joystick = pointFor(canvasRect, baseline.ui.runtimeHUD.joystick);
    const radius = Math.min(70, canvasRect.width * 0.18);

    // Sweep the joystick around the ring so the player traverses cells and eats
    // whatever it passes, exactly like a real touch session. While sweeping,
    // poll the pool's emit counter and screenshot the frame the burst starts, so
    // the burst is proven on pixels and not only by a reported emission rate.
    const captureBurst = process.env.BHR_CAPTURE === '1';
    const captures = [];
    const ejectCaptures = [];
    let capturedCount = 0;
    let lastEmitted = baseline.absorbFeedback?.emittedCount || 0;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joystick.x, y: joystick.y }] });
    const deadline = Date.now() + SWEEP_SECONDS * 1000;
    let step = 0;
    while (Date.now() < deadline && (!captureBurst || capturedCount < 6)) {
      const angle = (step / 16) * Math.PI * 2;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: Math.round(joystick.x + Math.cos(angle) * radius), y: Math.round(joystick.y + Math.sin(angle) * radius) }],
      });
      // Dense poll so a burst is caught at the start of its collapse, and the
      // resource block is caught while it is in EJECTING.
      for (let poll = 0; poll < 3; poll += 1) {
        await page.waitForTimeout(70);
        if (!captureBurst) continue;
        const snap = await page.evaluate(() => window.__BHR_QA__.snapshot());
        const now = snap.absorbFeedback || null;
        const compressionState = snap.compression?.state || null;
        if (compressionState === 'EJECTING' && ejectCaptures.length < 2) {
          const ejectFile = path.join(repoRoot, 'artifacts', 'qa', 'portrait', `phase5-eject-${ejectCaptures.length}.png`);
          await page.screenshot({ path: ejectFile });
          ejectCaptures.push({ state: compressionState, resourceBlockCount: snap.compression?.resourceBlockCount ?? null, file: ejectFile });
        }
        if (now && (now.emittedCount || 0) > lastEmitted) {
          lastEmitted = now.emittedCount;
          const file = path.join(repoRoot, 'artifacts', 'qa', 'portrait', `phase5-burst-${capturedCount}.png`);
          await page.screenshot({ path: file });
          const after = await page.evaluate(() => window.__BHR_QA__.snapshot().absorbFeedback || null);
          captures.push({
            emittedCount: now.emittedCount,
            atDetect: now,
            afterScreenshot: after,
            file,
          });
          capturedCount += 1;
          break;
        }
      }
      step += 1;
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1600);

    const final = await snapshot(page);
    result.status = 'PASS';
    result.probe = {
      seconds: SWEEP_SECONDS,
      absorbFeedbackBaseline: baseline.absorbFeedback,
      absorbFeedbackFinal: final.absorbFeedback,
      absorbedTiers: final.session?.absorbedTiers || null,
      totalAbsorbed: final.session?.absorbed || null,
      sceneNodeCountBaseline: baseline.performance?.cocos?.sceneNodeCount ?? null,
      sceneNodeCountFinal: final.performance?.cocos?.sceneNodeCount ?? null,
      burstCaptures: captures,
      ejectCaptures,
      runtimeErrors,
    };

    const pool = final.absorbFeedback;
    if (!pool || !pool.resident || pool.abandoned) {
      result.errors.push(`burst pool not resident/ready: ${JSON.stringify(pool)}`);
    } else {
      if (pool.liveNodes !== pool.poolSize) {
        result.errors.push(`LEAK: liveNodes ${pool.liveNodes} != poolSize ${pool.poolSize}`);
      }
      if (pool.activeCount > pool.poolSize) {
        result.errors.push(`LEAK: activeCount ${pool.activeCount} > poolSize ${pool.poolSize}`);
      }
      if ((pool.emittedCount || 0) <= 0) {
        result.errors.push(`no burst emitted: ${JSON.stringify(pool)}`);
      }
    }
    if (runtimeErrors.length > 0) result.errors.push(`runtime console errors: ${runtimeErrors.join(' | ')}`);
    if (result.errors.length > 0) result.status = 'FAIL';
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

main();
