/**
 * V7 PHASE 4 read-only runtime probe.
 *
 * Not a gate and not part of `test:full`. The acceptance runner records the
 * singularity's *materials* but has no field for the authored effects, so this
 * probe boots the already-built Web Mobile bundle in the same headless
 * Chromium configuration the acceptance runner uses and reads
 * `__BHR_QA__.snapshot().machine.singularityEffects` — the read-only
 * diagnostics `BlackHoleMachine.getSingularityVisualDiagnostics()` exposes.
 *
 * It asserts nothing. It prints what the runtime actually reports and, when the
 * probe manages to engage suction, writes a screenshot next to the acceptance
 * captures. A null/absent value is reported as such rather than hidden.
 *
 * Usage: node scripts/probe_singularity_runtime.mjs
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(repo, 'cocos', 'build', 'web-mobile');
const evidenceDirectory = path.join(repo, 'artifacts', 'qa', 'portrait');
mkdirSync(evidenceDirectory, { recursive: true });

function createStaticServer(rootDirectory) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const urlPath = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^[/\\]+/, '');
      const filePath = path.resolve(rootDirectory, relativePath);
      if (!filePath.startsWith(`${rootDirectory}${path.sep}`)) {
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
        '.webp': 'image/webp',
      }[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const snapshot = (page) => page.evaluate(() => window.__BHR_QA__.snapshot());

async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Hold the joystick at an offset from its centre for `durationMs`. */
async function hold(cdp, center, offsetX, offsetY, durationMs) {
  const endX = center.x + offsetX;
  const endY = center.y + offsetY;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: center.x, y: center.y }] });
  for (let step = 1; step <= 6; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: Math.round(center.x + (endX - center.x) * step / 6),
        y: Math.round(center.y + (endY - center.y) * step / 6),
      }],
    });
    await sleep(24);
  }
  await sleep(durationMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const report = { status: 'RUNNING', steps: [], samples: [], peak: null, failures: [] };
let server;
let browser;

try {
  server = await createStaticServer(buildDirectory);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/?qa=1`;
  browser = await chromium.launch({
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
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 45000 });
  const cdp = await context.newCDPSession(page);
  const canvasRect = await page.locator('#GameCanvas').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
  // The QA bridge reports UI nodes as fractions of the canvas, and the canvas is
  // the only place a touch lands.
  const pointFor = (screen) => ({
    x: Math.round(canvasRect.left + canvasRect.width * screen.x),
    y: Math.round(canvasRect.top + canvasRect.height * screen.y),
  });

  const home = await snapshot(page);
  if (!home.ui?.start?.screen) throw new Error('FAIL_PROBE_NO_START_BUTTON: ' + JSON.stringify(home.ui?.start));
  const start = pointFor(home.ui.start.screen);
  await tap(cdp, start.x, start.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 8000 });
  report.steps.push('HOME -> MODE_SELECT');

  const mode = await snapshot(page);
  if (!mode.ui?.modeEndless?.screen) throw new Error('FAIL_PROBE_NO_ENDLESS_BUTTON: ' + JSON.stringify(mode.ui?.modeEndless));
  const endless = pointFor(mode.ui.modeEndless.screen);
  await tap(cdp, endless.x, endless.y);
  // Product rule: a mode card opens that mode's Ready page; only its BtnStart
  // may enter gameplay. Same fallback fractions the acceptance runner uses.
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 8000 });
  report.steps.push('MODE_SELECT -> MODE_READY');
  const visibleHeight = 720 * (canvasRect.height / canvasRect.width);
  for (const fraction of [0.5 + 290 / visibleHeight, 0.5 + 330 / visibleHeight, 0.5 + 250 / visibleHeight]) {
    await tap(cdp, Math.round(canvasRect.left + canvasRect.width * 0.5), Math.round(canvasRect.top + canvasRect.height * fraction));
    await sleep(400);
    const state = await page.evaluate(() => window.__BHR_QA__.snapshot().gameState);
    if (state !== 'MODE_READY') break;
  }
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 20000 });
  report.steps.push('MODE_READY -> PLAYING');

  // Let the authored singularity + effects adopt, then confirm adoption.
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().machine?.usesAuthoredSingularity === true, undefined, { timeout: 20000 });
  await sleep(1500);
  const adopted = await snapshot(page);
  report.adopted = {
    usesAuthoredSingularity: adopted.machine?.usesAuthoredSingularity ?? null,
    singularityEffects: adopted.machine?.singularityEffects ?? null,
  };
  report.corePartColors = (adopted.machine?.visualMaterials || []).map((row) => ({
    path: row.path,
    colors: (row.slots || []).map((slot) => slot.color),
  }));

  // A clean, stationary capture at the spawn point before any driving: this is
  // the frame that can be trusted for "is the emitter drawing anything",
  // because the machine is on open road rather than inside a world prop.
  await sleep(900);
  const spawnSnapshot = await snapshot(page);
  report.spawnScreenshotAt = {
    rate: spawnSnapshot.machine?.singularityEffects?.effects?.suctionParticles?.ratePerSecond ?? null,
    internals: spawnSnapshot.machine?.singularityEffects?.effects?.suctionParticles?.internals ?? null,
  };
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-singularity-spawn.png') });

  // Drive around to engage real suction. The joystick centre is read from the
  // live HUD rather than hardcoded.
  const joystick = adopted.ui?.runtimeHUD?.joystick;
  if (!joystick?.screen) throw new Error('FAIL_PROBE_NO_JOYSTICK: ' + JSON.stringify(joystick));
  const center = pointFor(joystick.screen);
  const offsets = [[0, -90], [-90, 0], [90, 0], [-70, -70], [70, -70], [0, 90]];
  for (const [dx, dy] of offsets) {
    let consecutiveEmitting = 0;
    const holder = (async () => {
      for (let i = 0; i < 40; i += 1) {
        const current = await snapshot(page);
        const effects = current.machine?.singularityEffects || null;
        const sample = {
          t: i,
          suctionFeedback: effects?.suctionFeedback ?? null,
          devourPulse: effects?.devourPulse ?? null,
          rate: effects?.effects?.suctionParticles?.ratePerSecond ?? null,
          particlesActive: effects?.effects?.suctionParticles?.active ?? null,
          rimActive: effects?.effects?.rimEnergy?.active ?? null,
          mass: current.machine?.mass ?? null,
        };
        report.samples.push(sample);
        if (sample.rate !== null && (report.peak === null || sample.rate > report.peak.rate)) {
          report.peak = sample;
        }
        // A screenshot on the first frame with a non-zero rate shows an empty
        // emitter, which is not evidence either way. Wait until the emitter has
        // been running for several consecutive samples, then capture — the
        // particle lifetime is 1.15 s, so this is when the cloud is populated.
        if (sample.rate !== null && sample.rate > 0) consecutiveEmitting += 1;
        else consecutiveEmitting = 0;
        if (!report.screenshotTaken && consecutiveEmitting >= 2) {
          report.screenshotTaken = true;
          // Let the cloud build: at ~15-30 particles/s and a 1.15 s lifetime,
          // this is roughly when the emitter's steady-state count is reached.
          await sleep(400);
          const at = await snapshot(page);
          report.screenshotAt = {
            rate: at.machine?.singularityEffects?.effects?.suctionParticles?.ratePerSecond ?? null,
            devourPulse: at.machine?.singularityEffects?.devourPulse ?? null,
            suctionFeedback: at.machine?.singularityEffects?.suctionFeedback ?? null,
          };
          await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-singularity-suction.png') });
        }
        await sleep(120);
      }
    })();
    await hold(cdp, center, dx, dy, 40 * 120);
    await holder;
    // Keep trying directions until a populated-emitter frame was captured.
    if (report.screenshotTaken) break;
  }

  // Post-drive stationary captures: after the joystick is released the machine
  // coasts to a stop on open road, which is the cleanest frame for reading
  // whether the emitter draws. Three frames, so one of them cannot be a fluke.
  await sleep(1400);
  report.postDriveCaptures = [];
  for (let i = 1; i <= 3; i += 1) {
    const at = await snapshot(page);
    report.postDriveCaptures.push({
      index: i,
      rate: at.machine?.singularityEffects?.effects?.suctionParticles?.ratePerSecond ?? null,
      paused: at.machine?.singularityEffects?.paused ?? null,
      particleCount: at.machine?.singularityEffects?.effects?.suctionParticles?.internals?.particleCount ?? null,
      modelEnabled: at.machine?.singularityEffects?.effects?.suctionParticles?.internals?.modelEnabled ?? null,
      x: at.player?.x ?? null,
      z: at.player?.z ?? null,
    });
    await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-singularity-emit-' + i + '.png') });
    await sleep(400);
  }

  report.status = consoleErrors.length ? 'RUNTIME_ERRORS' : 'OK';
  report.consoleErrors = consoleErrors;
} catch (error) {
  report.status = 'FAIL';
  report.failures.push(error instanceof Error ? error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}

const samplesWithLoad = report.samples.filter((sample) => (sample.suctionFeedback || 0) > 0);
const outFile = path.join(evidenceDirectory, 'singularity-runtime-probe.json');
writeFileSync(outFile, JSON.stringify({
  ...report,
  sampleCount: report.samples.length,
  samplesWithLoad: samplesWithLoad.length,
  maxRate: report.samples.reduce((max, sample) => Math.max(max, sample.rate || 0), 0),
}, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  status: report.status,
  adopted: report.adopted,
  corePartColors: report.corePartColors,
  sampleCount: report.samples.length,
  samplesWithLoad: samplesWithLoad.length,
  maxRate: report.samples.reduce((max, sample) => Math.max(max, sample.rate || 0), 0),
  peak: report.peak,
  failures: report.failures,
  consoleErrors: report.consoleErrors,
}, null, 2));
console.log('report: ' + outFile);
if (report.status === 'FAIL') {
  process.exitCode = 1;
}
