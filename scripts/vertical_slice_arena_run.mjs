/**
 * V8.1 ARENA_VERTICAL_SLICE_REAL_RUN.
 *
 * A real, continuous, touch-driven Arena match, used to walk the whole loop the
 * brief names: Start -> Move -> Collect -> identify a dangerous opponent ->
 * identify a chasable one -> Grow -> (kill) -> be hunted by a stronger
 * opponent -> be defeated -> death feedback -> Revive -> Continue -> Settlement.
 *
 * Nothing is teleported and no mass, level or combat outcome is set: the only
 * input is CDP touch on the real joystick, and every observation comes from the
 * live QA snapshot.
 *
 * §15 is measured rather than assumed. The brief says a death must not be
 * "gameplay normal, then next frame suddenly Revive", so this records how many
 * frames actually separate the local player going down from the Revive page
 * appearing, and whether the death was telegraphed by a real threat beforehand.
 *
 * Usage: node scripts/vertical_slice_arena_run.mjs [--maxSeconds=150]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'vertical_slice', 'arena');
const frameDir = path.join(outDir, 'frames');
mkdirSync(frameDir, { recursive: true });

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const MAX_SECONDS = argOf('maxSeconds', 150);
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

const { server, port } = await createStaticServer(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});

const run = { maxSeconds: MAX_SECONDS, frameIntervalMs: FRAME_INTERVAL_MS, milestones: {}, timeline: [] };

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

  let s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST')));
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 8000 });
  await sleep(500);
  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(cdp, ...Object.values(pt(rect, s.ui.modeArena, 'MA')));
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 8000 });
  await sleep(500);
  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  const arenaReadyStart = s.ui?.arenaReady?.start || s.ui?.endlessReady?.start;
  await tap(cdp, ...Object.values(pt(rect, arenaReadyStart, 'AS')));
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'ARENA', undefined, { timeout: 10000 });

  const t0 = Date.now();
  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  // The arena HUD owns its own joystick; ui.runtimeHUD.joystick is the Endless
  // one and is not on screen here.
  const joystick = pt(rect, s.ui.arenaHUD.joystick, 'JOY');
  const origin = { x: s.player.position.x, z: s.player.position.z };
  console.log(`ARENA at origin x=${origin.x.toFixed(3)} z=${origin.z.toFixed(3)}`);

  const milestones = {
    timeToFirstMovement: null, timeToFirstCollect: null, timeToFirstDangerIdentified: null,
    timeToFirstChaseTarget: null, timeToFirstKill: null, timeToDefeat: null,
    timeToRevivePage: null, timeToSettlement: null,
  };
  const sequences = { danger: [], death: [], revive: [] };
  const capture = { bucket: null, running: true, attempts: 0, errors: [] };

  const captureFrame = async (bucket) => {
    const name = `${bucket}-${String(sequences[bucket].length).padStart(3, '0')}.jpg`;
    const file = path.join(frameDir, name);
    await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
    sequences[bucket].push({ file: path.relative(repoRoot, file).split(path.sep).join('/'), atMs: Date.now() - t0 });
  };
  const captureLoop = (async () => {
    let last = 0;
    while (capture.running) {
      const now = Date.now();
      if (capture.bucket && now - last >= FRAME_INTERVAL_MS) {
        last = now;
        capture.attempts += 1;
        try { await captureFrame(capture.bucket); }
        catch (error) { if (capture.errors.length < 5) capture.errors.push(String(error?.message || error)); }
      }
      await sleep(20);
    }
  })();

  const touchId = 9;
  let touchDown = false;
  const steerTo = async (dx, dz) => {
    const length = Math.hypot(dx, dz) || 1;
    const scale = Math.min(1, length / 4) * JOYSTICK_RADIUS;
    const x = joystick.x + (dx / length) * scale;
    const y = joystick.y - (dz / length) * scale;
    if (!touchDown) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joystick.x, y: joystick.y, id: touchId }] });
      touchDown = true;
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: touchId }] });
  };

  let lastAlive = true;
  let defeatAt = null;
  let revivePageAt = null;
  let settlementAt = null;
  let threatBeforeDefeat = null;
  // The threat list is empty on the death frame by construction (a dead player
  // has no predators to compute), so the telegraph must be read from the last
  // frame in which the player was still alive.
  let lastAliveThreatIds = [];
  let lastAliveThreatAtMs = null;
  let attackerFromRevive = null;
  const deadline = t0 + MAX_SECONDS * 1000;

  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const elapsed = Date.now() - t0;
    const arena = snap.arena || {};
    const threatIds = arena.localThreatIds || [];
    const alive = arena.localAlive !== false;
    const nameplates = snap.ui?.arenaHUD?.nameplates || [];
    const reviveLoss = snap.ui?.formalPages?.reviveLoss ?? null;
    const leaderboard = arena.leaderboard || [];
    const localMass = leaderboard.find((e) => e.isLocal)?.mass ?? arena.localMass ?? 0;
    // §14: an opponent the player could actually chase right now.
    const chasable = leaderboard.filter((e) => !e.isLocal && e.alive
      && e.mass > 0 && localMass >= e.mass * 1.32).map((e) => e.id);

    if (milestones.timeToFirstMovement === null
      && Math.hypot(snap.player.position.x - origin.x, snap.player.position.z - origin.z) > 0.35) {
      milestones.timeToFirstMovement = elapsed;
    }
    if (milestones.timeToFirstCollect === null && localMass > 0) milestones.timeToFirstCollect = elapsed;
    if (milestones.timeToFirstDangerIdentified === null && threatIds.length > 0) {
      milestones.timeToFirstDangerIdentified = elapsed;
      capture.bucket = 'danger';
      setTimeout(() => { if (capture.bucket === 'danger') capture.bucket = null; }, 1800);
    }
    if (milestones.timeToFirstChaseTarget === null && chasable.length > 0) milestones.timeToFirstChaseTarget = elapsed;
    if (milestones.timeToFirstKill === null && (arena.localKills || 0) > 0) milestones.timeToFirstKill = elapsed;

    if (alive && threatIds.length > 0) { lastAliveThreatIds = threatIds.slice(); lastAliveThreatAtMs = elapsed; }

    if (lastAlive && !alive) {
      defeatAt = elapsed;
      milestones.timeToDefeat = elapsed;
      threatBeforeDefeat = lastAliveThreatIds.slice();
      capture.bucket = 'death';
      setTimeout(() => { if (capture.bucket === 'death') capture.bucket = null; }, 2500);
    }
    if (revivePageAt === null && snap.uiScreen === 'Revive') {
      revivePageAt = elapsed;
      milestones.timeToRevivePage = elapsed;
      attackerFromRevive = reviveLoss;
      if (capture.bucket !== 'death') {
        capture.bucket = 'revive';
        setTimeout(() => { if (capture.bucket === 'revive') capture.bucket = null; }, 1800);
      }
    }
    if (settlementAt === null && snap.gameState === 'SETTLEMENT') {
      settlementAt = elapsed;
      milestones.timeToSettlement = elapsed;
    }
    lastAlive = alive;

    run.timeline.push({
      atMs: elapsed, gameState: snap.gameState, uiScreen: snap.uiScreen, alive,
      mass: localMass, rank: arena.localRank ?? null, kills: arena.localKills || 0,
      threatIds, chasable,
      dangerLabels: nameplates.filter((n) => n.active && String(n.label).startsWith('危险 ')).map((n) => n.label),
      reviveLoss,
    });

    if (settlementAt !== null) break;

    // Steer at the nearest edible body; while dead, hold still.
    if (alive) {
      const player = snap.player.position;
      const edible = (snap.objects || [])
        .filter((o) => o.state === 'IDLE' && o.tier <= snap.machine.maxTier)
        .map((o) => ({ ...o, d: Math.hypot(o.x - player.x, o.z - player.z) }))
        .sort((a, b) => a.d - b.d)[0];
      if (edible) await steerTo(edible.x - player.x, edible.z - player.z);
      else await steerTo(Math.cos(elapsed / 1000), Math.sin(elapsed / 1000));
    } else if (touchDown) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      touchDown = false;
    }
    await sleep(60);
  }
  if (touchDown) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  capture.running = false;
  await captureLoop;

  run.milestones = milestones;
  run.frames = sequences;
  run.frameSequences = {
    danger: sequences.danger.length, death: sequences.death.length, revive: sequences.revive.length,
    requestedIntervalMs: FRAME_INTERVAL_MS,
  };
  run.death = {
    defeatAtMs: defeatAt,
    revivePageAtMs: revivePageAt,
    // §15: how much time passed between going down and the Revive page.
    gapMs: defeatAt !== null && revivePageAt !== null ? revivePageAt - defeatAt : null,
    threatIdsImmediatelyBeforeDefeat: threatBeforeDefeat,
    wasTelegraphedByARealThreat: (threatBeforeDefeat || []).length > 0,
    // How long the danger marker was up before the kill: the player's actual
    // reaction window.
    threatLeadTimeMs: defeatAt !== null && lastAliveThreatAtMs !== null ? defeatAt - lastAliveThreatAtMs : null,
    attackerNamedOnRevivePage: attackerFromRevive,
  };
  run.consoleErrors = consoleErrors;
  run.verdict = {
    moved: milestones.timeToFirstMovement !== null,
    collected: milestones.timeToFirstCollect !== null,
    identifiedDanger: milestones.timeToFirstDangerIdentified !== null,
    identifiedChaseTarget: milestones.timeToFirstChaseTarget !== null,
    killedSomeone: milestones.timeToFirstKill !== null,
    wasDefeated: milestones.timeToDefeat !== null,
    reachedRevive: milestones.timeToRevivePage !== null,
    reachedSettlement: milestones.timeToSettlement !== null,
    consoleErrorCount: consoleErrors.length,
  };

  const outputPath = path.join(outDir, 'arena_run.json');
  writeFileSync(outputPath, JSON.stringify(run, null, 2), 'utf8');

  console.log('\nMILESTONES (ms from entering ARENA):');
  for (const [k, v] of Object.entries(milestones)) console.log(`  ${k}: ${v === null ? 'NOT REACHED' : v}`);
  console.log('\nDEATH (§15):');
  console.log(`  defeated at ${defeatAt} ms, revive page at ${revivePageAt} ms, gap ${run.death.gapMs} ms`);
  console.log(`  telegraphed by a real threat: ${run.death.wasTelegraphedByARealThreat} (${JSON.stringify(run.death.threatIdsImmediatelyBeforeDefeat)})`);
  console.log(`  revive page names the attacker: ${JSON.stringify(run.death.attackerNamedOnRevivePage)}`);
  console.log(`  frames: danger=${sequences.danger.length} death=${sequences.death.length} revive=${sequences.revive.length}`);
  console.log(`  console errors: ${consoleErrors.length}`);
  console.log(`  report: ${outputPath}`);
  const ok = run.verdict.moved && run.verdict.collected && run.verdict.identifiedDanger
    && run.verdict.wasDefeated && run.verdict.reachedRevive && run.verdict.reachedSettlement
    && consoleErrors.length === 0;
  console.log(`VERDICT: ${ok ? 'ARENA_LOOP_PASS' : 'ARENA_LOOP_INCOMPLETE'}`);
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
  server.close();
}
