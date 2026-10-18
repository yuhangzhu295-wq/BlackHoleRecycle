/**
 * Reward idempotency, actually exercised.
 *
 * The first version of this probe claimed five repeated deliveries and reported
 * PROVEN. It did not deliver anything: its loop re-read the same snapshot field
 * five times, with `before` taken from the very same read, so `delta` was
 * identically zero. That is a measurement which always passes -- worse than no
 * measurement. A reviewer caught it.
 *
 * It also asserted that `claimedArenaSettlementIds` had no writer and was a dead
 * key. That was wrong too: `SaveService.claimArenaSettlement` reads the list,
 * pushes the match id, adds the coins and saves. The original mistake was grepping
 * for the field name and reading only the lines it appeared on, then treating "I
 * did not see it" as "it does not exist".
 *
 * This calls the REAL production interface five times with one match id, and
 * checks the persisted key after a reload. Two guards exist and both matter:
 * `ArenaMatchManager.settlementRewardClaimed` (in-session) and the matchId list in
 * the save (survives reload). The second is what this exercises, because the first
 * cannot be re-triggered from a finished match.
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

  await page.waitForFunction(() => !!window.__BHR_QA__?.snapshot, null, { timeout: 45000 });
  await sleep(1200);

  // Reach a real settlement so a real reward and match id exist.
  await tapUi('start');
  await waitState('MODE_SELECT');
  await tapUi('modeArena');
  await waitState('MODE_READY');
  const ready = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(canvasRect.left + canvasRect.width * ready.ui.arenaReady.start.screen.x,
    canvasRect.top + canvasRect.height * ready.ui.arenaReady.start.screen.y);
  await waitState('ARENA');
  await sleep(2500);

  const cx = canvasRect.left + canvasRect.width / 2;
  const cy = canvasRect.top + canvasRect.height * 0.72;
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
      // The revive page's buttons become interactive a moment after the page
      // appears: tapping immediately has failed here twice. Wait for the key the
      // QA bridge marks active rather than assuming it is ready with the page.
      const button = await page.waitForFunction(
        () => {
          const fp = window.__BHR_QA__.snapshot().ui?.formalPages || {};
          return (fp.reviveGiveUp && fp.reviveGiveUp.active) ? fp.reviveGiveUp.screen : false;
        },
        undefined, { timeout: 8000, polling: 150 }).catch(() => null);
      if (!button) throw new Error('revive give-up never became active');
      await tapUi('formalPages.reviveGiveUp');
      await waitState('SETTLEMENT', 20000);
      settled = true;
    } else if (probe.state === 'SETTLEMENT') {
      settled = true;
    }
  }
  if (!settled) throw new Error('could not reach a settlement in this run');

  await sleep(1200);
  const first = await page.evaluate(() => {
    const s = window.__BHR_QA__.snapshot();
    return { coins: s.save?.coins ?? null, matchId: s.arena?.matchId ?? null,
      reward: s.settlement || null };
  });
  console.log(`[idem] match ${first.matchId} | reward ${JSON.stringify(first.reward)}`);
  console.log(`[idem] coins after the page's own claim: ${first.coins}`);

  // The real experiment: deliver the same match id five more times through the
  // production interface. If no callable SaveService can be reached, say so --
  // reporting a pass that was never earned is the bug this replaces.
  const deliveries = await page.evaluate(async (matchId) => {
    const save = window.__BHR_SAVE__ || null;
    if (!save || typeof save.claimArenaSettlement !== 'function') {
      return { error: 'no callable SaveService on window.__BHR_SAVE__' };
    }
    const log = [{ call: 'baseline', paid: null, coins: save.data.coins,
      claimedKeys: (save.data.claimedArenaSettlementIds || []).length }];
    for (let index = 0; index < 5; index += 1) {
      const paid = save.claimArenaSettlement(matchId, 100);
      log.push({ call: `deliver#${index + 1}`, paid, coins: save.data.coins,
        claimedKeys: (save.data.claimedArenaSettlementIds || []).length });
    }
    return { log };
  }, first.matchId);

  if (deliveries.error) {
    console.log(`[idem] ${deliveries.error}`);
    problems.push(deliveries.error);
  } else {
    for (const row of deliveries.log) {
      console.log(`  ${String(row.call).padEnd(10)} paid=${String(row.paid).padEnd(5)}`
        + ` coins=${row.coins} claimedKeys=${row.claimedKeys}`);
    }
    const baseline = deliveries.log[0];
    const last = deliveries.log[deliveries.log.length - 1];
    const granted = deliveries.log.filter((row) => row.paid === true).length;
    const moved = last.coins - baseline.coins;
    console.log(`[idem] granted ${granted} time(s); coins moved ${moved}`);
    if (granted !== 0 || moved !== 0) {
      problems.push(`a duplicate delivery was granted ${granted} time(s) and moved ${moved} coins`);
    }
  }

  // Reload: the guard that must hold across a reload is the persisted key list.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__BHR_QA__?.snapshot, null, { timeout: 45000 });
  await sleep(1500);
  const afterReload = await page.evaluate((matchId) => {
    const s = window.__BHR_QA__.snapshot();
    const ids = s.save?.claimedArenaSettlementIds || [];
    return { coins: s.save?.coins ?? null, occurrences: ids.filter((id) => id === matchId).length };
  }, first.matchId);
  console.log(`[idem] after reload: coins ${afterReload.coins};`
    + ` the match id appears ${afterReload.occurrences} time(s)`);
  if (afterReload.occurrences !== 1) {
    problems.push(`after reload the match id appears ${afterReload.occurrences} times`);
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
} else {
  console.log('[idem] PASS: repeated delivery through the production interface granted nothing,'
    + ' and the persisted key appears exactly once after a reload.');
}
