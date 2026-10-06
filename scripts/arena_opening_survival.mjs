/**
 * V8.3 §6 ARENA OPENING SURVIVAL.
 *
 * The one remaining problem: about half of matches end roughly a second after
 * combat unlocks. This measures that window precisely and records only the
 * fields §6 names, so the root cause can be classified from evidence instead of
 * guessed at.
 *
 * Sampling is a light in-page read (not the full snapshot) so the unlock instant
 * is resolved at ~100 ms; the previous 400 ms cadence was coarser than the
 * survival window it was trying to measure.
 *
 * Usage: node scripts/arena_opening_survival.mjs [--games=20]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'arena_opening');
mkdirSync(outDir, { recursive: true });

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const GAMES = argOf('games', 20);
const MATCH_MS = argOf('matchMs', 90000);

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
  if (!node?.active || !node?.screen) throw new Error('invisible node: ' + name + ' ' + JSON.stringify(node));
  return { x: rect.left + rect.width * node.screen.x, y: rect.top + rect.height * node.screen.y };
}
const median = (v) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const { server, port } = await createStaticServer(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});

const report = { games: GAMES, matches: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
  await sleep(1200);
  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('#GameCanvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  const enterArena = async () => {
    const state = (await page.evaluate(() => window.__BHR_QA__.snapshot())).gameState;
    if (state !== 'HOME') {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
      await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
      await sleep(800);
    }
    let s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST')));
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 8000 });
    await page.waitForFunction(() => {
      const m = window.__BHR_QA__.snapshot().ui?.modeArena;
      return m?.active === true && Boolean(m?.screen);
    }, undefined, { timeout: 8000 });
    s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    await tap(cdp, ...Object.values(pt(rect, s.ui.modeArena, 'MA')));
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 8000 });
    await page.waitForFunction(() => {
      const r = window.__BHR_QA__.snapshot().ui?.arenaReady || window.__BHR_QA__.snapshot().ui?.endlessReady;
      return r?.start?.active === true && Boolean(r.start.screen);
    }, undefined, { timeout: 8000 });
    s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    await tap(cdp, ...Object.values(pt(rect, s.ui?.arenaReady?.start || s.ui?.endlessReady?.start, 'AS')));
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'ARENA', undefined, { timeout: 10000 });
  };

  for (let game = 0; game < GAMES; game += 1) {
    await enterArena();
    const t0 = Date.now();
    const joystick = pt(rect, (await page.evaluate(() => window.__BHR_QA__.snapshot())).ui.arenaHUD.joystick, 'JOY');

    // Light read: only the fields §6 names, plus what steering needs.
    const read = () => page.evaluate(() => {
      const s = window.__BHR_QA__.snapshot();
      const a = s.arena || {};
      const p = s.player.position;
      const board = (a.leaderboard || []).filter((e) => !e.isLocal && e.alive);
      const threats = board.filter((e) => (a.localThreatIds || []).includes(e.id))
        .map((e) => ({ x: e.position.x, z: e.position.z, mass: e.mass, d: Math.hypot(e.position.x - p.x, e.position.z - p.z) }))
        .sort((x, y) => x.d - y.d);
      let unclaimed = 0;
      for (const o of (s.objects || [])) {
        if (o.state === 'IDLE' && o.tier <= s.machine.maxTier && !o.owner
          && Math.hypot(o.x - p.x, o.z - p.z) <= s.machine.suctionRadius * 2) unclaimed += 1;
      }
      const prey = board.filter((e) => (a.localMass ?? 0) >= Math.max(1, e.mass) * 1.32)
        .map((e) => ({ x: e.position.x, z: e.position.z, d: Math.hypot(e.position.x - p.x, e.position.z - p.z) }))
        .sort((x, y) => x.d - y.d)[0] || null;
      return {
        warmup: a.combatWarmupRemainingSeconds ?? null,
        alive: a.localAlive !== false,
        playerMass: a.localMass ?? 0,
        px: p.x, pz: p.z,
        botMasses: board.map((e) => e.mass),
        threatCount: (a.localThreatIds || []).length,
        nearestThreatDistance: threats.length ? threats[0].d : null,
        nearestThreat: threats[0] ? { x: threats[0].x, z: threats[0].z } : null,
        botsTargetingPlayer: a.botsTargetingPlayer ?? 0,
        unclaimedNearby: unclaimed,
        prey,
        gameState: s.gameState,
      };
    });

    let touchDown = false;
    const steerTo = async (dx, dz) => {
      const length = Math.hypot(dx, dz) || 1;
      const scale = Math.min(1, length / 4) * 88;
      if (!touchDown) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joystick.x, y: joystick.y, id: 7 }] });
        touchDown = true;
      }
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: joystick.x + (dx / length) * scale, y: joystick.y + (dz / length) * scale, id: 7 }],
      });
    };

    let unlockAt = null;
    let deathAt = null;
    let atUnlock = null;
    let sawCombat = false;

    while (Date.now() - t0 < MATCH_MS) {
      const r = await read();
      const elapsed = Date.now() - t0;

      if (!sawCombat && r.warmup !== null && r.warmup <= 0) {
        sawCombat = true;
        unlockAt = elapsed;
        atUnlock = {
          combatUnlockTime: elapsed,
          playerMassAtUnlock: r.playerMass,
          weakestBotMassAtUnlock: r.botMasses.length ? Math.min(...r.botMasses) : null,
          medianBotMassAtUnlock: median(r.botMasses),
          strongestBotMassAtUnlock: r.botMasses.length ? Math.max(...r.botMasses) : null,
          threatCount: r.threatCount,
          nearestThreatDistance: r.nearestThreatDistance,
          botsTargetingPlayer: r.botsTargetingPlayer,
          playerMapPosition: { x: r.px, z: r.pz },
          collectiblesNearPlayer: r.unclaimedNearby,
          nearestSafeDirection: r.nearestThreat
            ? (() => { const dx = r.px - r.nearestThreat.x; const dz = r.pz - r.nearestThreat.z;
                const l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; })()
            : null,
        };
      }

      if (!r.alive) { deathAt = elapsed; break; }
      if (r.gameState !== 'ARENA') break;

      if (r.prey) {
        await steerTo(r.prey.x - r.px, r.prey.z - r.pz);
      } else {
        // Always head for the nearest unclaimed edible body, at any distance.
        // Gating this on "one already within 4.8 m" left the player standing
        // still for the whole warm-up, which is how the first run reported a
        // player at START_MASS at unlock while the previous harness showed it
        // reaching 535 by 7 s. (Seventh harness defect in this investigation.)
        const live = await page.evaluate(() => {
          const s = window.__BHR_QA__.snapshot();
          const p = s.player.position;
          let best = null; let bd = Infinity;
          for (const o of (s.objects || [])) {
            if (o.state !== 'IDLE' || o.tier > s.machine.maxTier || o.owner) continue;
            const d = Math.hypot(o.x - p.x, o.z - p.z);
            if (d < bd) { bd = d; best = { x: o.x, z: o.z }; }
          }
          return best;
        });
        if (live) await steerTo(live.x - r.px, live.z - r.pz);
      }
      await sleep(100);
    }
    if (touchDown) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); touchDown = false; }

    const survivalAfterUnlock = unlockAt !== null && deathAt !== null ? deathAt - unlockAt : null;
    report.matches.push({
      game,
      combatUnlockTime: unlockAt,
      playerDeathTime: deathAt,
      survivalAfterUnlock,
      survivedWholeWindow: deathAt === null,
      ...(atUnlock || {}),
    });
    console.log(`game ${game}: unlock=${unlockAt} death=${deathAt} survivalAfterUnlock=${survivalAfterUnlock} playerMass@unlock=${atUnlock?.playerMassAtUnlock} weakestBot=${atUnlock?.weakestBotMassAtUnlock} strongestBot=${atUnlock?.strongestBotMassAtUnlock} targeting=${atUnlock?.botsTargetingPlayer} threatDist=${atUnlock?.nearestThreatDistance?.toFixed?.(1)}`);
  }

  const deaths = report.matches.filter((m) => m.survivalAfterUnlock !== null).map((m) => m.survivalAfterUnlock);
  const instant = report.matches.filter((m) => m.survivalAfterUnlock !== null && m.survivalAfterUnlock < 2000).length;
  report.summary = {
    gamesPlayed: report.matches.length,
    gamesWithDeath: deaths.length,
    gamesSurvivingWholeWindow: report.matches.filter((m) => m.survivedWholeWindow).length,
    medianSurvivalAfterUnlockMs: median(deaths),
    minSurvivalAfterUnlockMs: deaths.length ? Math.min(...deaths) : null,
    maxSurvivalAfterUnlockMs: deaths.length ? Math.max(...deaths) : null,
    deathsWithin2sOfUnlock: instant,
    consoleErrorCount: consoleErrors.length,
  };
  writeFileSync(path.join(outDir, 'opening_survival.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\n' + JSON.stringify(report.summary, null, 2));
} finally {
  await browser.close();
  server.close();
}
