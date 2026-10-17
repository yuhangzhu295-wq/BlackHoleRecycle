/**
 * PHASE B: capture the six key states at three sizes, from the real runtime.
 *
 * Every frame here comes from the Cocos Web runtime driven by CDP touch. No
 * composite, no design sheet loaded as if it were gameplay.
 *
 * States and how each is reached:
 *   mode            Home -> Mode Select
 *   endless_moving  Endless Ready -> start -> drag for a while (real movement)
 *   arena_mid       Arena Ready -> start -> drive through the first half-minute
 *   arena_chase     the same match a few seconds later, still driving
 *   revive          not captured here: it needs a real death. `acceptance:v2
 *                   --scope=revive` drives that flow and writes its own frames.
 *   settlement      not captured here: it needs a whole match to finish.
 *
 * The last two are called out rather than faked, because a settlement frame that
 * was not reached by playing would be exactly the kind of evidence the brief
 * forbids.
 *
 * Usage: node scripts/capture_v14_states.mjs [sizes]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'v14', 'states');
mkdirSync(outDir, { recursive: true });

const sizes = (process.argv[2] || '375x667,390x844,430x932').split(',');

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();
const written = [];

try {
  for (const size of sizes) {
    const [width, height] = size.split('x').map(Number);
    const { context, page, cdp, canvasRect } = await openPage(browser, port, { width, height });

    const tap = async (x, y) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(60);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(700);
    };
    // The QA snapshot nests HUD controls under `ui.runtimeHUD` / `ui.arenaHUD`
    // and page controls under `ui.formalPages`, so a key is a dotted path.
    const nodeAt = (snapshot, key) => key.split('.').reduce(
      (node, part) => (node ? node[part] : undefined), snapshot.ui);
    const tapUi = async (key) => {
      const snapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
      const node = nodeAt(snapshot, key);
      if (!node?.active) {
        throw new Error(`cannot tap ${key} at ${size}; active=${node?.active}`);
      }
      await tap(canvasRect.left + canvasRect.width * node.screen.x,
        canvasRect.top + canvasRect.height * node.screen.y);
    };
    const waitState = (want, ms = 45000) => page.waitForFunction(
      (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });
    /** A real drag: touch down, move in steps, release. */
    const drag = async (fromX, fromY, toX, toY, steps = 8, holdMs = 900) => {
      await cdp.send('Input.dispatchTouchEvent',
        { type: 'touchStart', touchPoints: [{ x: fromX, y: fromY }] });
      for (let step = 1; step <= steps; step += 1) {
        const x = fromX + ((toX - fromX) * step) / steps;
        const y = fromY + ((toY - fromY) * step) / steps;
        await cdp.send('Input.dispatchTouchEvent',
          { type: 'touchMove', touchPoints: [{ x, y }] });
        await sleep(40);
      }
      await sleep(holdMs);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(250);
    };
    const shot = async (label) => {
      const file = path.join(outDir, `${label}-${size}.png`);
      await page.screenshot({ path: file });
      written.push(path.relative(repoRoot, file));
      console.log(`  ${label} @ ${size}`);
    };

    await page.waitForFunction(() => !!window.__BHR_QA__?.snapshot, null, { timeout: 45000 });
    await sleep(1200);

    // -- mode -----------------------------------------------------------
    await tapUi('start');
    await waitState('MODE_SELECT');
    await sleep(600);
    await shot('mode');

    // -- endless: start, then move for real ------------------------------
    await tapUi('modeEndless');
    await waitState('MODE_READY');
    const ready = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const startNode = ready.ui?.endlessReady?.start || null;
    if (!startNode) throw new Error('no endless start node at ' + size);
    await tap(canvasRect.left + canvasRect.width * startNode.screen.x,
      canvasRect.top + canvasRect.height * startNode.screen.y);
    await waitState('PLAYING');
    await sleep(1200);
    const cx = canvasRect.left + canvasRect.width / 2;
    const cy = canvasRect.top + canvasRect.height * 0.72;
    // Four real drags so the player actually travels and eats.
    for (const [dx, dy] of [[0, -120], [110, 0], [0, 120], [-110, 0]]) {
      await drag(cx, cy, cx + dx, cy + dy, 8, 1100);
    }
    await sleep(600);
    await shot('endless_moving');

    const endlessState = await page.evaluate(() => {
      const s = window.__BHR_QA__.snapshot();
      return { state: s.gameState, mass: s.player?.mass ?? null,
        absorbed: s.compression?.absorbed ?? null };
    });
    console.log(`  endless evidence @ ${size}: ${JSON.stringify(endlessState)}`);

    // Back to Home through the pause page, then into the arena.
    await tapUi('runtimeHUD.pauseButton');
    await waitState('PAUSED');
    await sleep(400);
    await tapUi('formalPages.pauseHome');
    await waitState('HOME');
    await sleep(600);

    // -- arena: mid and chase -------------------------------------------
    await tapUi('start');
    await waitState('MODE_SELECT');
    await tapUi('modeArena');
    await waitState('MODE_READY');
    const arenaReady = await page.evaluate(() => window.__BHR_QA__.snapshot());
    await tap(canvasRect.left + canvasRect.width * arenaReady.ui.arenaReady.start.screen.x,
      canvasRect.top + canvasRect.height * arenaReady.ui.arenaReady.start.screen.y);
    await waitState('ARENA');
    await sleep(2000);
    // Drive for ~20s: the arena's warmup is short, so this is mid-match.
    for (let round = 0; round < 5; round += 1) {
      await drag(cx, cy, cx + (round % 2 === 0 ? 120 : -120), cy - 90, 8, 1400);
    }
    await shot('arena_mid');
    const midEvidence = await page.evaluate(() => {
      const s = window.__BHR_QA__.snapshot();
      return { state: s.gameState, elapsed: s.arena?.elapsedSeconds ?? null,
        rank: s.arena?.localRank ?? null, mass: s.arena?.leaderboard
          ?.find((entry) => entry.isLocal)?.mass ?? null };
    });
    console.log(`  arena mid evidence @ ${size}: ${JSON.stringify(midEvidence)}`);

    // Chase: keep driving toward where the rivals are, a few seconds later.
    for (let round = 0; round < 3; round += 1) {
      await drag(cx, cy, cx + (round % 2 === 0 ? -130 : 130), cy + 70, 8, 1200);
    }
    await shot('arena_chase');

    // -- revive and settlement through a REAL death ---------------------
    // Drive toward the biggest living rival until the match kills the player.
    // Nothing here mutates mass or forces a defeat: the bot's own size rule does
    // it, which is the only way the revive page's "attacker / both masses" data
    // can be evidence of anything.
    // Short steps, not long ones: the revive page lives for a 5-second countdown,
    // and a 9-second drag round walks straight past it. The first attempt did
    // exactly that and reached SETTLEMENT without ever seeing REVIVE.
    let died = false;
    let settled = false;
    for (let attempt = 0; attempt < 40 && !died && !settled; attempt += 1) {
      const target = await page.evaluate(() => {
        const s = window.__BHR_QA__.snapshot();
        const local = s.arena?.leaderboard?.find((entry) => entry.isLocal);
        const rivals = (s.arena?.leaderboard || [])
          .filter((entry) => !entry.isLocal && entry.alive)
          .sort((a, b) => b.mass - a.mass);
        const rival = rivals[0];
        if (!local || !rival) return null;
        return { dx: rival.position.x - local.position.x, dz: rival.position.z - local.position.z };
      });
      if (target) {
        // The drag maps roughly one screen-width to one view; a fixed push toward
        // the rival's direction is enough to close the gap over several rounds.
        const pushX = Math.max(-150, Math.min(150, target.dx * 12));
        const pushY = Math.max(-150, Math.min(150, -target.dz * 12));
        await drag(cx, cy, cx + pushX, cy + pushY, 4, 450);
      }
      // REVIVE is an input action, not a game state: the revive page is a UI page
      // and `gameState` stays ARENA while the match clock is frozen. Detect it the
      // way the page actually appears.
      const probe = await page.evaluate(() => {
        const s = window.__BHR_QA__.snapshot();
        return { state: s.gameState, reviveOpen: !!s.ui?.formalPages?.revive?.active };
      });
      if (probe.reviveOpen) died = true;
      if (probe.state === 'SETTLEMENT') settled = true;
    }

    if (!died) {
      console.log(`  revive NOT reached at ${size} -- recorded, not faked`);
      if (settled) {
        await sleep(700);
        await shot('settlement');
        const settlementEvidence = await page.evaluate(() => {
          const s = window.__BHR_QA__.snapshot();
          return { state: s.gameState, settlement: s.settlement || null };
        });
        console.log(`  settlement evidence @ ${size}: ${JSON.stringify(settlementEvidence).slice(0, 400)}`);
      }
    } else {
      await sleep(700);
      await shot('revive');
      const reviveEvidence = await page.evaluate(() => {
        const s = window.__BHR_QA__.snapshot();
        return { state: s.gameState, revive: s.revive || null };
      });
      console.log(`  revive evidence @ ${size}: ${JSON.stringify(reviveEvidence).slice(0, 400)}`);
      // Give up, which is a real documented exit and lands on Settlement.
      await tapUi('formalPages.reviveGiveUp');
      await waitState('SETTLEMENT', 20000);
      await sleep(900);
      await shot('settlement');
      const settlementEvidence = await page.evaluate(() => {
        const s = window.__BHR_QA__.snapshot();
        return { state: s.gameState, settlement: s.settlement || null };
      });
      console.log(`  settlement evidence @ ${size}: ${JSON.stringify(settlementEvidence).slice(0, 400)}`);
    }
    const chaseEvidence = await page.evaluate(() => {
      const s = window.__BHR_QA__.snapshot();
      return { state: s.gameState, elapsed: s.arena?.elapsedSeconds ?? null,
        threats: (s.arena?.localThreatIds || []).length,
        killable: (s.arena?.localKillableIds || []).length };
    });
    console.log(`  arena chase evidence @ ${size}: ${JSON.stringify(chaseEvidence)}`);

    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`[states] wrote ${written.length} frame(s) to ${path.relative(repoRoot, outDir)}`);
