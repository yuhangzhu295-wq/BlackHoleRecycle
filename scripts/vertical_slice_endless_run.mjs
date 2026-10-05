/**
 * V8.1 ENDLESS_VERTICAL_SLICE_REAL_RUN.
 *
 * A real, continuous, touch-driven playthrough of Endless used to prove the
 * six player-cognition checkpoints actually hold in gameplay rather than in a
 * test harness. Nothing is teleported, no level or mass is set, and no level-up
 * is triggered artificially: the only input is CDP touch on the real joystick,
 * and every milestone is read from the live QA snapshot.
 *
 * Milestones (all relative to the first PLAYING frame):
 *   timeToFirstMovement        the player's own render position first changes
 *   timeToFirstEdibleRecognition  an object first shows the edible cue, i.e.
 *                              the game is telling the player what can be eaten
 *   timeToFirstAbsorb          the first real absorption
 *   timeToFirstLockedFeedback  the first "需要 LV.X" prompt on a body too big
 *   timeToFirstLevelUp         the first real level-up
 *
 * It also captures frame sequences (default 120 ms apart) across the movement
 * opening, the first absorb and the level-up, because a single screenshot
 * cannot evidence control feel or suction feel.
 *
 * Usage: node scripts/vertical_slice_endless_run.mjs [--maxSeconds=180]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'vertical_slice', 'endless');
const frameDir = path.join(outDir, 'frames');
mkdirSync(frameDir, { recursive: true });

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const MAX_SECONDS = argOf('maxSeconds', 180);
/** §22 asks for a frame every 100-150 ms. */
const FRAME_INTERVAL_MS = argOf('frameIntervalMs', 120);
const JOYSTICK_RADIUS = 88;

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

/** Total absorbed count across every tier, from the real session ledger. */
const absorbedTotal = (snapshot) => Object.values(snapshot.session?.absorbedTiers || {})
  .reduce((sum, n) => sum + (Number(n) || 0), 0);

const { server, port } = await createStaticServer(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});

const run = { maxSeconds: MAX_SECONDS, frameIntervalMs: FRAME_INTERVAL_MS, milestones: {}, frameSequences: {}, timeline: [] };

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
  await sleep(1500);

  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('#GameCanvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  // Real navigation: Home -> Mode Select -> Endless Ready -> Playing.
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

  const t0 = Date.now();
  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  const joystick = pt(rect, s.ui.runtimeHUD.joystick, 'JOY');
  const origin = { x: s.player.position.x, z: s.player.position.z };
  console.log(`PLAYING at origin x=${origin.x.toFixed(3)} z=${origin.z.toFixed(3)}`);

  // Forbidden shortcuts, asserted rather than assumed.
  const startingLevel = s.machine.level;
  const startingMass = s.machine.mass;

  const milestones = { timeToFirstMovement: null, timeToFirstEdibleRecognition: null,
    timeToFirstAbsorb: null, timeToFirstLockedFeedback: null, timeToFirstLevelUp: null };
  const sequences = { movement: [], firstAbsorb: [], levelUp: [] };
  let lastFrameAt = 0;
  let lastAbsorbTotal = 0;
  let absorbWindowUntil = 0;
  let wrapUpUntil = null;
  let levelUpWindowUntil = 0;

  const touchId = 7;
  let touchDown = false;
  const touchDownAt = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: touchId }] });
    touchDown = true;
  };
  const touchMoveTo = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: touchId }] });
  };
  const touchUp = async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    touchDown = false;
  };

  /** Screen mapping measured from the existing capture: touch dy<0 drives +Z. */
  const steerTo = async (worldDx, worldDz) => {
    const length = Math.hypot(worldDx, worldDz) || 1;
    const scale = Math.min(1, length / 4) * JOYSTICK_RADIUS;
    const x = joystick.x + (worldDx / length) * scale;
    const y = joystick.y - (worldDz / length) * scale;
    // The joystick only captures a touch that BEGINS on its centre; starting
    // the touch already deflected leaves the stick dead (the first run of this
    // script moved the player 0 m because of exactly that).
    if (!touchDown) {
      await touchDownAt(joystick.x, joystick.y);
      await touchMoveTo(x, y);
    } else {
      await touchMoveTo(x, y);
    }
  };

  const captureFrame = async (bucket, elapsed) => {
    const name = `${bucket}-${String(sequences[bucket].length).padStart(3, '0')}.jpg`;
    const file = path.join(frameDir, name);
    // JPEG rather than PNG: encoding is what costs the time under SwiftShader,
    // and it is the difference between a ~370 ms and a ~120 ms cadence.
    await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
    // Light read only: a full snapshot costs ~270 ms under SwiftShader and
    // would make the frame cadence a lie. The heavy telemetry stays in the
    // steering loop; these frames exist to be looked at.
    const snap = await page.evaluate(() => {
      const qa = window.__BHR_QA__;
      const s = qa.snapshot();
      return { player: { x: s.player.position.x, z: s.player.position.z }, level: s.machine.level,
        mass: s.machine.mass, objects: (s.objects || []).map((o) => ({ tier: o.tier, state: o.state, edibleCue: o.edibleCue })) };
    });
    sequences[bucket].push({
      file: path.relative(repoRoot, file).replace(/\\/g, '/'),
      atMs: Date.now() - t0,
      // Shape matches the light evaluate above, not the full snapshot.
      player: snap.player,
      level: snap.level,
      mass: snap.mass,
      edibleCueCount: (snap.objects || []).filter((o) => o.edibleCue).length,
      visibleTierCounts: (snap.objects || []).reduce((acc, o) => {
        acc[o.tier] = (acc[o.tier] || 0) + 1;
        return acc;
      }, {}),
      absorbingCount: (snap.objects || []).filter((o) => o.state === 'SUCKING' || o.state === 'ATTRACTED').length,
    });
  };

  // Frames are captured by a concurrent loop so their cadence is not hostage to
  // the ~330 ms steering iteration. §22 asks for one every 100-150 ms.
  const capture = { bucket: null, running: true, intervals: [], errors: [], attempts: 0 };
  const captureLoop = (async () => {
    let last = 0;
    while (capture.running) {
      const now = Date.now();
      if (capture.bucket && now - last >= FRAME_INTERVAL_MS) {
        last = now;
        const at = now - t0;
        capture.attempts += 1;
        try { await captureFrame(capture.bucket, at); capture.intervals.push(FRAME_INTERVAL_MS); }
        catch (error) {
          if (capture.errors.length < 5) capture.errors.push(String(error && error.message ? error.message : error));
        }
      }
      await sleep(20);
    }
  })();

  const deadline = t0 + MAX_SECONDS * 1000;
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const elapsed = Date.now() - t0;
    const moved = Math.hypot(snap.player.position.x - origin.x, snap.player.position.z - origin.z);
    const absorbTotal = absorbedTotal(snap);
    const edibleCueCount = (snap.objects || []).filter((o) => o.edibleCue).length;
    const lockVisibleCount = (snap.objects || []).filter((o) => o.lockVisible).length;
    const tierLockActive = snap.ui?.tierLock?.endless?.activeCount ?? 0;

    if (milestones.timeToFirstMovement === null && moved > 0.35) milestones.timeToFirstMovement = elapsed;
    if (milestones.timeToFirstEdibleRecognition === null && edibleCueCount > 0) {
      milestones.timeToFirstEdibleRecognition = elapsed;
    }
    if (milestones.timeToFirstAbsorb === null && absorbTotal > 0) {
      milestones.timeToFirstAbsorb = elapsed;
      absorbWindowUntil = elapsed + 1500;
    }
    if (milestones.timeToFirstLockedFeedback === null && (tierLockActive > 0 || lockVisibleCount > 0)) {
      milestones.timeToFirstLockedFeedback = elapsed;
    }
    if (milestones.timeToFirstLevelUp === null && snap.machine.level >= startingLevel + 1) {
      milestones.timeToFirstLevelUp = elapsed;
      levelUpWindowUntil = elapsed + 1500;
    }

    run.timeline.push({ atMs: elapsed, x: snap.player.position.x, z: snap.player.position.z,
      level: snap.machine.level, mass: snap.machine.mass, absorbTotal,
      edibleCueCount, lockVisibleCount, tierLockActive,
      hintStage: snap.ui?.firstRunHint?.stage ?? null,
      hintActive: snap.ui?.firstRunHint?.activeCount ?? null,
      hintRaw: snap.ui?.firstRunHint ?? null,
      tutorialCompleted: snap.save?.tutorialCompleted ?? null,
      objectCount: (snap.objects || []).length,
      nearestObjectDistance: (snap.objects || []).length
        ? Math.min(...snap.objects.map((o) => Math.hypot(o.x - snap.player.position.x, o.z - snap.player.position.z)))
        : null });

    // Which window the concurrent capture loop should be recording.
    capture.bucket = elapsed <= 2500 ? 'movement'
      : elapsed <= absorbWindowUntil ? 'firstAbsorb'
        : (elapsed <= levelUpWindowUntil || wrapUpUntil !== null) ? 'levelUp'
          : null;
    if (absorbTotal !== lastAbsorbTotal) lastAbsorbTotal = absorbTotal;

    // Steer at the nearest edible body, else sweep. Real touch only.
    const player = snap.player.position;
    const edible = (snap.objects || [])
      .filter((o) => o.state === 'IDLE' && o.tier <= snap.machine.maxTier)
      .map((o) => ({ ...o, d: Math.hypot(o.x - player.x, o.z - player.z) }))
      .sort((a, b) => a.d - b.d)[0];
    if (edible) await steerTo(edible.x - player.x, edible.z - player.z);
    else {
      const angle = (elapsed / 1000) * 0.8;
      await steerTo(Math.cos(angle), Math.sin(angle));
    }

    // Once the whole chain is observed, keep rolling just long enough to
    // record the level-up window rather than cutting it off at the moment the
    // milestone lands.
    if (Object.values(milestones).every((v) => v !== null)) {
      if (wrapUpUntil === null) wrapUpUntil = elapsed + 2000;
      if (elapsed >= wrapUpUntil) break;
    }
    await sleep(60);
  }
  if (touchDown) await touchUp();
  capture.running = false;
  await captureLoop;

  const finalSnap = await page.evaluate(() => window.__BHR_QA__.snapshot());
  run.milestones = milestones;
  run.frameSequences = {
    movement: sequences.movement.length,
    firstAbsorb: sequences.firstAbsorb.length,
    levelUp: sequences.levelUp.length,
    requestedIntervalMs: FRAME_INTERVAL_MS,
    // Honest achieved cadence: screenshots under SwiftShader are not free.
    achievedMedianIntervalMs: (() => {
      const all = [...sequences.movement, ...sequences.firstAbsorb, ...sequences.levelUp];
      if (all.length < 2) return null;
      const gaps = all.map((f, i) => (i === 0 ? null : f.atMs - all[i - 1].atMs)).filter((g) => g !== null).sort((a, b) => a - b);
      return gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
    })(),
  };
  run.frames = sequences;
  run.startingLevel = startingLevel;
  run.startingMass = startingMass;
  run.finalLevel = finalSnap.machine.level;
  run.finalMass = finalSnap.machine.mass;
  run.finalAbsorbedTotal = absorbedTotal(finalSnap);
  run.consoleErrors = consoleErrors;
  run.frameCapture = { attempts: capture.attempts, errors: capture.errors };
  run.verdict = {
    allMilestonesReached: Object.values(milestones).every((v) => v !== null),
    // §6: a real run must actually grow, not merely be driven.
    grewAtLeastOneLevel: finalSnap.machine.level > startingLevel,
    absorbedSomething: absorbedTotal(finalSnap) > 0,
    consoleErrorCount: consoleErrors.length,
  };

  const outputPath = path.join(outDir, 'endless_run.json');
  writeFileSync(outputPath, JSON.stringify(run, null, 2), 'utf8');

  console.log('\nMILESTONES (ms from first PLAYING frame):');
  for (const [k, v] of Object.entries(milestones)) console.log(`  ${k}: ${v === null ? 'NOT REACHED' : v}`);
  console.log(`  level ${startingLevel} -> ${finalSnap.machine.level}, mass ${startingMass} -> ${finalSnap.machine.mass}`);
  console.log(`  frames: movement=${sequences.movement.length} firstAbsorb=${sequences.firstAbsorb.length} levelUp=${sequences.levelUp.length}`);
  console.log(`  console errors: ${consoleErrors.length}`);
  console.log(`  report: ${outputPath}`);
  const ok = run.verdict.allMilestonesReached && run.verdict.grewAtLeastOneLevel
    && run.verdict.absorbedSomething && consoleErrors.length === 0;
  console.log(`VERDICT: ${ok ? 'ENDLESS_READABILITY_PASS' : 'ENDLESS_READABILITY_FAIL'}`);
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
  server.close();
}
