/**
 * V8.2.1 §9 DECISIVE RUN -- Arena collection root cause.
 *
 * One question: why does the local player move normally in Arena yet `consumed`
 * stays 0? This does NOT re-derive geometry. It reads the product's own suction
 * candidate decision (`arenaSuctionTrace`, instrumented inside
 * updateCompetitiveSuction) and drives the player at the nearest body the
 * runtime itself considers eligible.
 *
 * Three games, then a single classification:
 *   CASE_A_NAVIGATION          never got inside the attract radius
 *   CASE_C_COORDINATE_MISMATCH the script's distance disagrees with the product's
 *   CASE_D_FILTER              in range but rejected, with a named reason
 *   CASE_B_SUCTION_ACTIVATION  eligible and accepted, yet no ATTRACTED/ABSORBED
 *
 * Usage: node scripts/arena_collection_forensics.mjs [--games=3]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'arena_collection');
mkdirSync(outDir, { recursive: true });

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const GAMES = argOf('games', 3);
const RUN_MS = argOf('runMs', 40000);

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

const { server, port } = await createStaticServer(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});

const report = { games: GAMES, runMs: RUN_MS, matches: [] };

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
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().ui?.modeArena?.active === true && Boolean(window.__BHR_QA__.snapshot().ui.modeArena.screen), undefined, { timeout: 8000 });
    s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    await tap(cdp, ...Object.values(pt(rect, s.ui.modeArena, 'MA')));
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 8000 });
    await page.waitForFunction(() => {
      const ready = window.__BHR_QA__.snapshot().ui?.arenaReady || window.__BHR_QA__.snapshot().ui?.endlessReady;
      return ready?.start?.active === true && Boolean(ready.start.screen);
    }, undefined, { timeout: 8000 });
    s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    await tap(cdp, ...Object.values(pt(rect, s.ui?.arenaReady?.start || s.ui?.endlessReady?.start, 'AS')));
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'ARENA', undefined, { timeout: 10000 });
  };

  for (let game = 0; game < GAMES; game += 1) {
    await enterArena();
    const t0 = Date.now();
    const joystick = pt(rect, (await page.evaluate(() => window.__BHR_QA__.snapshot())).ui.arenaHUD.joystick, 'JOY');
    let touchDown = false;
    const steerTo = async (dx, dz) => {
      const length = Math.hypot(dx, dz) || 1;
      const scale = Math.min(1, length / 3) * 88;
      const x = joystick.x + (dx / length) * scale;
      // Measured by arena_joystick_calibration.mjs: stick dy and world Z have the
      // SAME sign (up -> -Z, down -> +Z). The earlier `- dz` here inverted the
      // vertical axis, so the auto-driver walked away from every target while
      // still covering 30-62 m per match. That was CASE_A, not a product bug.
      const y = joystick.y + (dz / length) * scale;
      if (!touchDown) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joystick.x, y: joystick.y, id: 3 }] });
        touchDown = true;
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 3 }] });
    };

    const samples = [];
    let lockedTargetId = null;
    let initialDistance = null;
    let minDistance = null;
    let attractRadius = null;
    let firstInRangeMs = null;
    let firstAttractedMs = null;
    let firstSuckingMs = null;
    let firstAbsorbedMs = null;
    let lastConsumed = 0;
    let startMass = null;
    const rejectedReasons = new Set();
    let sawAccepted = false;
    let sawTierLocked = false;

    while (Date.now() - t0 < RUN_MS) {
      const snap = await page.evaluate(() => {
        const qa = window.__BHR_QA__;
        const s = qa.snapshot();
        // Top-level, sibling of `arena`, not under `ui`.
        const trace = s.arenaSuctionTrace || null;
        const states = {};
        for (const o of (s.objects || [])) states[o.runtimeId] = o.state;
        return {
          atMs: Date.now(),
          px: s.player.position.x, pz: s.player.position.z,
          consumed: s.arena?.localConsumed || 0,
          mass: s.arena?.localMass ?? 0,
          alive: s.arena?.localAlive !== false,
          gameState: s.gameState,
          trace,
          states,
        };
      });
      const elapsed = snap.atMs - t0;
      if (startMass === null) startMass = snap.mass;

      const trace = snap.trace;
      if (trace) {
        attractRadius = trace.playerSuctionRadius;
        // The nearest body the RUNTIME itself accepts as a candidate.
        const eligible = (trace.nearest || []).filter((c) => c.tierEligible && c.state !== 'ABSORBED' && c.state !== 'RECYCLED');
        for (const c of (trace.nearest || [])) {
          if (c.rejectedReason !== 'ACCEPTED' && c.rejectedReason !== 'OTHER') rejectedReasons.add(c.rejectedReason);
          if (c.rejectedReason === 'TIER_LOCKED') sawTierLocked = true;
          if (c.accepted) sawAccepted = true;
        }
        const target = eligible[0] || null;
        if (target) {
          if (lockedTargetId !== target.objectId) {
            lockedTargetId = target.objectId;
            initialDistance = target.distance;
            minDistance = target.distance;
          } else {
            minDistance = Math.min(minDistance, target.distance);
          }
          if (firstInRangeMs === null && target.distance <= attractRadius) firstInRangeMs = elapsed;
          if (firstAttractedMs === null && snap.states[target.objectId] === 'ATTRACTED') firstAttractedMs = elapsed;
          if (firstSuckingMs === null && snap.states[target.objectId] === 'SUCKING') firstSuckingMs = elapsed;
          if (firstAbsorbedMs === null && (snap.states[target.objectId] === 'ABSORBED' || snap.states[target.objectId] === 'RECYCLED')) firstAbsorbedMs = elapsed;
          // Steer using the object's own render position, which is the same
          // space the player's node position is in and the same space the
          // product's distanceXZ measured.
          const obj = (await page.evaluate(() => window.__BHR_QA__.snapshot())).objects
            .find((o) => o.runtimeId === target.objectId);
          if (obj) await steerTo(obj.x - snap.px, obj.z - snap.pz);
        }
      }
      lastConsumed = snap.consumed;

      samples.push({
        t: elapsed,
        consumed: snap.consumed,
        mass: snap.mass,
        targetId: lockedTargetId,
        targetDistance: minDistance,
        playerSuctionRadius: attractRadius,
        targetState: lockedTargetId ? snap.states[lockedTargetId] ?? null : null,
        acceptedAny: trace ? trace.localAcceptedAny : null,
        nearestReasons: trace ? (trace.nearest || []).slice(0, 4).map((c) => `${c.tierEligible ? 'T' : 't'}${c.tier}:${c.distance.toFixed(2)}:${c.rejectedReason}`) : [],
      });

      if (!snap.alive || snap.gameState !== 'ARENA') break;
      await sleep(200);
    }
    if (touchDown) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); touchDown = false; }

    report.matches.push({
      game, startMass, finalMass: samples.at(-1)?.mass ?? null,
      finalConsumed: lastConsumed, attractRadius, initialDistance, minDistance,
      firstInRangeMs, firstAttractedMs, firstSuckingMs, firstAbsorbedMs,
      sawAccepted, sawTierLocked, rejectedReasons: [...rejectedReasons],
      samples,
    });
    console.log(`game ${game}: attractR=${attractRadius} initD=${initialDistance?.toFixed(2)} minD=${minDistance?.toFixed(2)} inRange=${firstInRangeMs} attracted=${firstAttractedMs} sucking=${firstSuckingMs} absorbed=${firstAbsorbedMs} consumed=${lastConsumed} mass=${startMass}->${samples.at(-1)?.mass}`);
  }

  // §10-§13 classification, from the product's own numbers.
  const m = report.matches[0];
  let classification = 'INCONCLUSIVE';
  if (m && m.minDistance !== null && m.attractRadius !== null) {
    if (m.minDistance > m.attractRadius) classification = 'CASE_A_NAVIGATION';
    else if (m.sawAccepted && m.firstAttractedMs === null) classification = 'CASE_B_SUCTION_ACTIVATION';
    else if (m.rejectedReasons.length && m.firstAttractedMs === null) classification = 'CASE_D_FILTER';
    else if (m.firstAbsorbedMs !== null) classification = 'COLLECTION_WORKS';
  }
  report.classification = classification;
  report.consoleErrors = consoleErrors;

  writeFileSync(path.join(outDir, 'collection_forensics.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nCLASSIFICATION: ${classification}`);
  console.log(`  attractRadius=${m?.attractRadius} initialDistance=${m?.initialDistance?.toFixed(2)} minDistance=${m?.minDistance?.toFixed(2)}`);
  console.log(`  sawAccepted=${m?.sawAccepted} sawTierLocked=${m?.sawTierLocked} rejectedReasons=${JSON.stringify(m?.rejectedReasons)}`);
  console.log(`  attracted=${m?.firstAttractedMs} sucking=${m?.firstSuckingMs} absorbed=${m?.firstAbsorbedMs}`);
  console.log(`  consumed=${m?.finalConsumed} mass ${m?.startMass}->${m?.finalMass}`);
  console.log(`  consoleErrors=${consoleErrors.length}`);
} finally {
  await browser.close();
  server.close();
}
