/**
 * V8.1 CONTROL_TRACE_FORENSICS runner.
 *
 * Settles the control-trace discontinuity with evidence. A prior capture showed
 * a single frame where the player's render position moved ~3.4m between two
 * engine frames while velocity was 7.5 m/s in the OPPOSITE direction -- 11x
 * beyond what movement integration can produce. The brief forbids assuming
 * either "teleport" or "sampling bug", so this run drives real movement for
 * 10 x 10s and, for every out-of-bound position change, reports:
 *
 *   - whether the machine's own external-write counter rose on that frame,
 *   - the tagged source of that write (REBASE / ROUND_START / ...),
 *   - whether the logical origin or rebase count changed,
 *   - and the game state, so a round boundary is distinguishable from gameplay.
 *
 * Usage: node scripts/forensics_control_trace.mjs [--iterations=10] [--seconds=10]
 */
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

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const ITERATIONS = argOf('iterations', 10);
const SECONDS = argOf('seconds', 10);

/** Integration can only move the node by |velocity| * dt. 1.5x absorbs float noise. */
const JUMP_TOLERANCE = 1.5;
const MIN_JUMP_DISTANCE = 0.05;

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
        '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
        '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
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

/**
 * Classify one out-of-bound position change. The machine's own counter is the
 * authority: if it rose, an external system wrote the position and the source
 * tag names it. If it did not rise, the change came from our own integration
 * and the bound was simply too tight -- which is a metric problem, not a jump.
 */
function classifyJump(previous, current, index) {
  const deltaX = current.playerPosition.x - previous.playerPosition.x;
  const deltaZ = current.playerPosition.z - previous.playerPosition.z;
  const distance = Math.hypot(deltaX, deltaZ);
  const speed = Math.hypot(previous.currentVelocity.x, previous.currentVelocity.z);
  const bound = speed * current.frameDt * JUMP_TOLERANCE;
  if (distance <= bound || distance <= MIN_JUMP_DISTANCE) return null;

  const externalWrites = (current.externalWriteCount ?? 0) - (previous.externalWriteCount ?? 0);
  const rebaseDelta = (current.rebaseCount ?? 0) - (previous.rebaseCount ?? 0);
  const originDelta = Math.hypot(
    (current.logicalOrigin?.x ?? 0) - (previous.logicalOrigin?.x ?? 0),
    (current.logicalOrigin?.z ?? 0) - (previous.logicalOrigin?.z ?? 0),
  );
  return {
    index,
    timestamp: current.timestamp,
    distance,
    bound,
    overBoundBy: bound > 0 ? distance / bound : Infinity,
    deltaX,
    deltaZ,
    previousPosition: { x: previous.playerPosition.x, z: previous.playerPosition.z },
    currentPosition: { x: current.playerPosition.x, z: current.playerPosition.z },
    previousVelocity: { x: previous.currentVelocity.x, z: previous.currentVelocity.z, speed },
    currentVelocity: { x: current.currentVelocity.x, z: current.currentVelocity.z },
    previousInputMagnitude: previous.inputMagnitude,
    currentInputMagnitude: current.inputMagnitude,
    previousGameState: previous.gameState,
    currentGameState: current.gameState,
    externalWrites,
    externalWriteSource: current.externalWriteSource,
    externalWriteDelta: current.externalWriteDelta,
    rebaseDelta,
    originDelta,
    /**
     * The machine reports the dt it actually integrated with, how far that
     * integration moved it, and how many times its update ran. If
     * `machineUpdateDelta` is not 1, the trace and the machine are not on the
     * same frame cadence, which would make the trace's own frameDt the wrong
     * yardstick. If `integrationDistance` matches the observed jump, the
     * machine produced it; if it does not, something else moved the node.
     */
    recordedFrameDt: current.frameDt,
    integrationDt: current.integrationDt,
    integrationDistance: current.integrationDistance,
    machineUpdateDelta: (current.machineUpdateCount ?? 0) - (previous.machineUpdateCount ?? 0),
    // Attribution: an external write explains it only if the counter rose AND
    // the write's own delta accounts for the observed movement.
    explainedByExternalWrite: externalWrites > 0
      && Math.abs(Math.hypot(current.externalWriteDelta?.x ?? 0, current.externalWriteDelta?.z ?? 0) - distance) < 0.05,
    explainedByRebase: rebaseDelta > 0 && Math.abs(originDelta - distance) < 0.05,
    /**
     * The machine's own integration accounts for the movement. The trace and
     * the machine do not share a cadence (integrationDt is often ~2x the
     * recorded frameDt), so the machine's self-reported distance is the only
     * trustworthy yardstick -- bounding on the trace's dt produced ~90 false
     * positives per run at overBoundBy ~1.3.
     */
    explainedByIntegration: Math.abs((current.integrationDistance ?? -1) - distance) < 0.01,
  };
}

const { server, port } = await createStaticServer(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});

const run = { iterations: ITERATIONS, secondsPerIteration: SECONDS, iterationsData: [], allJumps: [] };

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
  await sleep(1500);

  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('#GameCanvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

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

  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  const joystick = pt(rect, s.ui.runtimeHUD.joystick, 'JOY');
  console.log(`Joystick centre: ${joystick.x}, ${joystick.y}`);

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    // Sweep the stick direction each iteration so the run is not one straight
    // line, and release once mid-iteration: the release frame is where the
    // original discontinuity appeared.
    const angle = (iteration / ITERATIONS) * Math.PI * 2;
    const radius = 88;
    const targetX = joystick.x + Math.cos(angle) * radius;
    const targetY = joystick.y + Math.sin(angle) * radius;

    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: joystick.x, y: joystick.y, id: 1 }],
    });
    for (let step = 1; step <= 3; step += 1) {
      await sleep(16);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          x: Math.round(joystick.x + (targetX - joystick.x) * step / 3),
          y: Math.round(joystick.y + (targetY - joystick.y) * step / 3),
          id: 1,
        }],
      });
    }
    await sleep((SECONDS * 1000) / 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(250);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: joystick.x, y: joystick.y, id: 2 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: Math.round(targetX), y: Math.round(targetY), id: 2 }],
    });
    await sleep((SECONDS * 1000) / 2 - 250);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(150);

    const frames = await page.evaluate(() => window.__BHR_QA__.getControlTrace());
    const jumps = [];
    for (let i = 1; i < frames.length; i += 1) {
      const jump = classifyJump(frames[i - 1], frames[i], i);
      if (jump) jumps.push(jump);
    }
    run.iterationsData.push({
      iteration,
      angleDegrees: Math.round((angle * 180) / Math.PI),
      frameCount: frames.length,
      jumpCount: jumps.length,
      maxJumpDistance: jumps.reduce((max, j) => Math.max(max, j.distance), 0),
      finalRebaseCount: frames.at(-1)?.rebaseCount ?? 0,
    });
    run.allJumps.push(...jumps.map((j) => ({ ...j, iteration })));
    console.log(`  iter ${iteration}: frames=${frames.length} jumps=${jumps.length} maxJump=${(jumps.reduce((m, j) => Math.max(m, j.distance), 0)).toFixed(3)}m`);
    await page.evaluate(() => { /* let the ring buffer keep rolling between iterations */ });
  }

  run.consoleErrors = consoleErrors;
  const unexplained = run.allJumps.filter((j) => !j.explainedByExternalWrite && !j.explainedByRebase
    && !j.explainedByIntegration);
  run.summary = {
    totalJumps: run.allJumps.length,
    explainedByExternalWrite: run.allJumps.filter((j) => j.explainedByExternalWrite).length,
    explainedByRebase: run.allJumps.filter((j) => j.explainedByRebase).length,
    explainedByIntegration: run.allJumps.filter((j) => j.explainedByIntegration).length,
    unexplained: unexplained.length,
    externalWriteSources: [...new Set(run.allJumps.map((j) => j.externalWriteSource))],
    consoleErrorCount: consoleErrors.length,
    verdict: unexplained.length === 0 ? 'NO_UNEXPLAINED_POSITION_JUMP' : 'UNEXPLAINED_POSITION_JUMP_FOUND',
  };

  const outputPath = path.join(outDir, 'forensics_report.json');
  writeFileSync(outputPath, JSON.stringify(run, null, 2), 'utf8');
  console.log(`\nVERDICT: ${run.summary.verdict}`);
  console.log(`  total out-of-bound changes: ${run.summary.totalJumps}`);
  console.log(`  explained by external write: ${run.summary.explainedByExternalWrite}`);
  console.log(`  explained by rebase: ${run.summary.explainedByRebase}`);
  console.log(`  UNEXPLAINED: ${run.summary.unexplained}`);
  console.log(`  sources seen: ${JSON.stringify(run.summary.externalWriteSources)}`);
  console.log(`  console errors: ${run.summary.consoleErrorCount}`);
  console.log(`  report: ${outputPath}`);
  if (unexplained.length) {
    console.log('\nUNEXPLAINED SAMPLES:');
    for (const j of unexplained.slice(0, 5)) console.log('  ' + JSON.stringify(j));
  }
  process.exitCode = unexplained.length === 0 ? 0 : 1;
} finally {
  await browser.close();
  server.close();
}
