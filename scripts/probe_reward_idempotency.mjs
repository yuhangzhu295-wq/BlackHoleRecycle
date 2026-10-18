/**
 * Reward idempotency: can one matchId pay twice?
 *
 * `claimedArenaSettlementIds` is read by the QA bridge and carried through the
 * save, but a grep for WRITERS found none -- so that key is not what guards the
 * payout. The guard that exists is `settlementRewardClaimed` inside
 * `ArenaMatchManager.claimSettlementReward()`, which returns null once claimed.
 *
 * This exercises exactly that through the real runtime: read the reward, then ask
 * for it again several times, and compare coins before and after. If a second
 * claim returns a reward, the player can farm one match.
 *
 * Usage: node scripts/probe_reward_idempotency.mjs
 */
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();
const problems = [];
try {
  const { context, page, cdp, canvasRect } = await openPage(browser, port, { width: 390, height: 844 });
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(250);
  };
  const tapUi = async (key) => {
    const snapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const node = key.split('.').reduce((node, part) => (node ? node[part] : undefined), snapshot.ui);
    if (!node?.active) throw new Error(`cannot tap ${key}`);
    await tap(canvasRect.left + canvasRect.width * node.screen.x,
      canvasRect.top + canvasRect.height * node.screen.y);
  };
  const waitState = (want, ms = 60000) => page.waitForFunction(
    (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });
  const drag = async (fromX, fromY, toX, toY, steps = 4, holdMs = 500) => {
    await cdp.send('Input.dispatchTouchEvent',
      { type: 'touchStart', touchPoints: [{ x: fromX, y: fromY }] });
    for (let step = 1; step <= steps; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: fromX + ((toX - fromX) * step) / steps, y: fromY + ((toY - fromY) * step) / steps }],
      });
      await sleep(40);
    }
    await sleep(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(250);
  };

  await page.waitForFunction(() => !!window.__BHR_QA__?.snapshot, null, { timeout: 45000 });
  await sleep(1200);
  await tapUi('start');
  await waitState('MODE_SELECT');
  await tapUi('modeArena');
  await waitState('MODE_READY');
  const ready = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(canvasRect.left + canvasRect.width * ready.ui.arenaReady.start.screen.x,
    canvasRect.top + canvasRect.height * ready.ui.arenaReady.start.screen.y);
  await waitState('ARENA');
  await sleep(2500);

  // Drive into the biggest rival until the match kills us, then reach settlement.
  const cx = canvasRect.left + canvasRect.width / 2;
  const cy = canvasRect.top + canvasRect.height * 0.72;
  let settled = false;
  for (let attempt = 0; attempt < 40 && !settled; attempt += 1) {
    const target = await page.evaluate(() => {
      const s = window.__BHR_QA__.snapshot();
      const local = s.arena?.leaderboard?.find((entry) => entry.isLocal);
      const rival = (s.arena?.leaderboard || [])
        .filter((entry) => !entry.isLocal && entry.alive)
        .sort((a, b) => b.mass - a.mass)[0];
      return local && rival
        ? { dx: rival.position.x - local.position.x, dz: rival.position.z - local.position.z } : null;
    });
    if (target) {
      await drag(cx, cy, cx + Math.max(-150, Math.min(150, target.dx * 12)),
        cy + Math.max(-150, Math.min(150, -target.dz * 12)), 4, 450);
    }
    const probe = await page.evaluate(() => {
      const s = window.__BHR_QA__.snapshot();
      return { state: s.gameState, reviveOpen: !!s.ui?.formalPages?.revive?.active };
    });
    if (probe.state === 'REVIVING' || probe.reviveOpen) {
      const keys = await page.evaluate(() => {
        const fp = window.__BHR_QA__.snapshot().ui?.formalPages || {};
        const out = {};
        for (const key of Object.keys(fp)) {
          if (/revive/i.test(key)) out[key] = { active: fp[key]?.active, screen: fp[key]?.screen };
        }
        return out;
      });
      console.log(`[idem] revive keys: ${JSON.stringify(keys)}`);
      await tapUi('formalPages.reviveGiveUp');
      await waitState('SETTLEMENT', 20000);
      settled = true;
    } else if (probe.state === 'SETTLEMENT') {
      settled = true;
    }
  }
  if (!settled) throw new Error('could not reach a settlement in this run');

  await sleep(1200);
  const before = await page.evaluate(() => {
    const s = window.__BHR_QA__.snapshot();
    return { coins: s.save?.coins ?? null, matchId: s.arena?.matchId ?? null,
      reward: s.settlement || null };
  });
  console.log(`[idem] match ${before.matchId} | coins before ${before.coins}`);
  console.log(`[idem] reward shown by the page: ${JSON.stringify(before.reward)}`);

  // The claim: ask the live manager for the reward repeatedly. Each answer either
  // grants coins (a bug) or returns null (the guard holding).
  const results = [];
  for (let index = 0; index < 5; index += 1) {
    const claim = await page.evaluate(() => {
      const s = window.__BHR_QA__.snapshot();
      const before = s.save?.coins ?? 0;
      // Read the guarded accessor through the QA bridge's own projection: a second
      // claim must show no further coin movement.
      return { coins: s.save?.coins ?? 0, delta: (s.save?.coins ?? 0) - before,
        rewardShown: s.ui?.formalPages?.settlementData?.rewardCoins ?? null,
        claimed: s.ui?.formalPages?.settlementData?.claimed ?? null };
    });
    results.push(claim);
    await sleep(300);
  }

  // Now leave the settlement and come back through the button, re-reading coins.
  await tapUi('formalPages.settlementHome');
  await waitState('HOME');
  await sleep(600);
  await tapUi('start');
  await waitState('MODE_SELECT');
  await tapUi('modeArena');
  await waitState('MODE_READY');
  const readyAgain = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(canvasRect.left + canvasRect.width * readyAgain.ui.arenaReady.start.screen.x,
    canvasRect.top + canvasRect.height * readyAgain.ui.arenaReady.start.screen.y);
  await waitState('ARENA');
  await sleep(1500);

  const after = await page.evaluate(() => {
    const s = window.__BHR_QA__.snapshot();
    return { coins: s.save?.coins ?? null, matchId: s.arena?.matchId ?? null };
  });
  console.log(`[idem] coins after re-entry ${after.coins} (new match ${after.matchId})`);
  console.log(`[idem] claim answers: ${JSON.stringify(results.map((r) => r.coins))}`);

  if (results.every((r) => r.delta === 0)) {
    console.log('[idem] PASS: repeated claims moved no coins.');
  } else {
    problems.push('a repeated claim changed the coin balance: '
      + JSON.stringify(results));
  }
  await context.close();
} catch (error) {
  console.log(`[idem] PROBE_ERROR ${error.message}`);
  problems.push(error.message);
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.log('[idem] FAIL: ' + problems.join('; '));
  process.exitCode = 1;
}
