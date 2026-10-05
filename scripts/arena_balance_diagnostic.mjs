/**
 * V8.2 §9 ARENA BALANCE INSTRUMENT.
 *
 * Answers one product question, with the minimum measurement it needs:
 *
 *   "In the first 60-90 s of a normal Arena match, does an ordinary player have
 *    a reasonable chance of meeting at least one opponent clearly weaker than
 *    them -- one they can chase and eat?"
 *
 * It plays 20 real matches with CDP touch only. Nothing is set: no mass, no
 * level, no fake bot, no onKill(). Killability is read from
 * `snapshot.arena.localKillableIds`, which ArenaMatchManager derives from the
 * same combat predicate that decides danger (§13), so this diagnostic cannot
 * drift from the rule that actually governs combat.
 *
 * Usage: node scripts/arena_balance_diagnostic.mjs [--games=20]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'arena_balance');
mkdirSync(outDir, { recursive: true });

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const GAMES = argOf('games', 20);
/** The product window §10 asks about. */
const OBSERVATION_WINDOW_MS = argOf('windowMs', 90000);
const POLL_MS = argOf('pollMs', 400);

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
  if (!node?.active || !node?.screen) {
    throw new Error('invisible node: ' + name + ' ' + JSON.stringify(node));
  }
  return { x: rect.left + rect.width * node.screen.x, y: rect.top + rect.height * node.screen.y };
}

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const { server, port } = await createStaticServer(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});

const report = { games: GAMES, observationWindowMs: OBSERVATION_WINDOW_MS, pollMs: POLL_MS, matches: [] };

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

  /** Home -> ModeSelect -> Arena -> Ready -> ARENA. */
  const enterArena = async () => {
    // A finished match leaves the game in REVIVING or SETTLEMENT, not HOME, so
    // return to a known state first. Assuming the Home path is what made game 1
    // tap an inactive mode-select button.
    const state = (await page.evaluate(() => window.__BHR_QA__.snapshot())).gameState;
    if (state !== 'HOME') {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
      await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
      await sleep(800);
    }
    let s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    if (s.gameState === 'HOME') {
      await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST')));
      await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 8000 });
      // Wait for the node to actually be on screen rather than guessing a
      // duration: a fixed sleep left the page mid-entrance and made the tap
      // target "invisible".
      await page.waitForFunction(() => {
        const m = window.__BHR_QA__.snapshot().ui?.modeArena;
        return m?.active === true && Boolean(m?.screen);
      }, undefined, { timeout: 8000 });
      s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    }
    await tap(cdp, ...Object.values(pt(rect, s.ui.modeArena, 'MA')));
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 8000 });
    await page.waitForFunction(() => {
      const ready = window.__BHR_QA__.snapshot().ui?.arenaReady || window.__BHR_QA__.snapshot().ui?.endlessReady;
      return ready?.start?.active === true && Boolean(ready?.start?.screen);
    }, undefined, { timeout: 8000 });
    s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const start = s.ui?.arenaReady?.start || s.ui?.endlessReady?.start;
    await tap(cdp, ...Object.values(pt(rect, start, 'AS')));
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'ARENA', undefined, { timeout: 10000 });
  };

  const joystickOf = async () => pt(rect, (await page.evaluate(() => window.__BHR_QA__.snapshot())).ui.arenaHUD.joystick, 'JOY');

  for (let game = 0; game < GAMES; game += 1) {
    await enterArena();
    const t0 = Date.now();
    const joystick = await joystickOf();
    let touchDown = false;
    const steerTo = async (dx, dz) => {
      const length = Math.hypot(dx, dz) || 1;
      const scale = Math.min(1, length / 4) * 88;
      const x = joystick.x + (dx / length) * scale;
      const y = joystick.y - (dz / length) * scale;
      if (!touchDown) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joystick.x, y: joystick.y, id: 5 }] });
        touchDown = true;
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 5 }] });
    };

    const samples = [];
    let timeCombatUnlocked = null;
    let timeFirstKillable = null;
    let timeFirstKill = null;
    let timePlayerDeath = null;
    let killableMs = 0;
    // Opportunity duration must use the REAL inter-sample gap: each iteration
    // costs three snapshot round trips, so the nominal POLL_MS understates it.
    let lastSampleAt = null;
    let finalRank = null;

    while (Date.now() - t0 < OBSERVATION_WINDOW_MS) {
      const snap = await page.evaluate(() => {
        const s = window.__BHR_QA__.snapshot();
        const a = s.arena || {};
        const board = (a.leaderboard || []).filter((e) => !e.isLocal && e.alive).map((e) => e.mass);
        return {
          atMs: Date.now(),
          warmup: a.combatWarmupRemainingSeconds ?? null,
          alive: a.localAlive !== false,
          kills: a.localKills || 0,
          rank: a.localRank ?? null,
          playerMass: a.localMass ?? 0,
          opponentMasses: board,
          killableIds: a.localKillableIds || [],
          threatIds: a.localThreatIds || [],
          gameState: s.gameState,
        };
      });
      const elapsed = snap.atMs - t0;
      const opponents = snap.opponentMasses;

      if (timeCombatUnlocked === null && snap.warmup !== null && snap.warmup <= 0) timeCombatUnlocked = elapsed;
      if (timeFirstKillable === null && snap.killableIds.length > 0) timeFirstKillable = elapsed;
      if (timeFirstKill === null && snap.kills > 0) timeFirstKill = elapsed;
      const gapMs = lastSampleAt === null ? 0 : snap.atMs - lastSampleAt;
      lastSampleAt = snap.atMs;
      if (snap.killableIds.length > 0) killableMs += gapMs;

      samples.push({
        t: elapsed,
        playerMass: snap.playerMass,
        weakestOpponentMass: opponents.length ? Math.min(...opponents) : null,
        strongestOpponentMass: opponents.length ? Math.max(...opponents) : null,
        medianOpponentMass: median(opponents),
        killableOpponentCount: snap.killableIds.length,
        threatCount: snap.threatIds.length,
      });

      if (!snap.alive) {
        timePlayerDeath = elapsed;
        finalRank = snap.rank;
        break;
      }
      if (snap.gameState !== 'ARENA') { finalRank = snap.rank; break; }

      // Steer at the nearest edible body so the player grows realistically.
      const player = (await page.evaluate(() => window.__BHR_QA__.snapshot())).player.position;
      const edible = (await page.evaluate(() => window.__BHR_QA__.snapshot())).objects
        .filter((o) => o.state === 'IDLE' && o.tier <= 3)
        .map((o) => ({ x: o.x, z: o.z, d: Math.hypot(o.x - player.x, o.z - player.z) }))
        .sort((a, b) => a.d - b.d)[0];
      if (edible) await steerTo(edible.x - player.x, edible.z - player.z);
      await sleep(POLL_MS);
    }
    if (touchDown) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); touchDown = false; }

    report.matches.push({
      game,
      timeCombatUnlocked,
      timeFirstKillableOpponent: timeFirstKillable,
      timeFirstChaseTarget: timeFirstKillable, // same shared combat rule (§13)
      timeFirstKill,
      timePlayerDeath,
      killOpportunityDurationMs: killableMs,
      everHadKillableOpponent: timeFirstKillable !== null,
      finalRank,
      samples,
    });
    console.log(`game ${game}: unlocked=${timeCombatUnlocked} firstKillable=${timeFirstKillable} opportunity=${killableMs}ms death=${timePlayerDeath} rank=${finalRank}`);
  }

  const withOpportunity = report.matches.filter((m) => m.everHadKillableOpponent).length;
  const inWindow = report.matches.filter((m) => m.timeFirstKillable !== null && m.timeFirstKillable <= OBSERVATION_WINDOW_MS).length;
  report.summary = {
    gamesPlayed: report.matches.length,
    gamesWithAKillableOpponent: withOpportunity,
    killOpportunityRate: report.matches.length ? withOpportunity / report.matches.length : 0,
    gamesWithOpportunityWithinWindow: inWindow,
    medianTimeToFirstKillableMs: median(report.matches.map((m) => m.timeFirstKillable).filter((v) => v !== null)),
    medianKillOpportunityDurationMs: median(report.matches.map((m) => m.killOpportunityDurationMs)),
    gamesWithAKill: report.matches.filter((m) => m.timeFirstKill !== null).length,
    consoleErrorCount: consoleErrors.length,
  };
  // §10: the product question, answered from the data rather than asserted.
  report.summary.verdict = report.summary.killOpportunityRate >= 0.5
    ? 'ARENA_BALANCE_BASELINE_OK'
    : 'ARENA_BALANCE_FAIL';

  const outputPath = path.join(outDir, 'balance_baseline.json');
  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('\n' + JSON.stringify(report.summary, null, 2));
  console.log(`report: ${outputPath}`);
  process.exitCode = report.summary.verdict === 'ARENA_BALANCE_BASELINE_OK' ? 0 : 1;
} finally {
  await browser.close();
  server.close();
}
