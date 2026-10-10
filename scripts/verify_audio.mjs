/**
 * Gate: sound effects actually play, and muting actually silences them.
 *
 * The asset contract proves the declared clips exist, are audible and are shaped
 * as intended. It cannot prove any of them is ever played, or that the mute flag is
 * honoured -- a director wired to nothing, or one that ignores `settings.sfx`,
 * passes every source-level check.
 *
 * So this plays real matches in two browser contexts:
 *
 *  A. a fresh save, where absorption must produce plays and zero requests must
 *     have had no clip behind them;
 *  B. a save seeded with `settings.sfx = false`, where the same match must
 *     produce zero plays *while the player is demonstrably still absorbing*.
 *     Without that second half, a build whose audio is simply broken would look
 *     exactly like a correctly muted one.
 *
 * Usage: node scripts/verify_audio.mjs [--seconds=30]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser,
  openPage,
  serve,
  sleep,
} from './lib/page_layout_geometry.mjs';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const SECONDS = Number(argOf('seconds', '30'));
const SIZE = { width: 412, height: 915, label: 'pixel-20:9' };
const SAVE_KEY = 'BLACK_HOLE_RECYCLE_SAVEDATA_COCOS_V1';

const failures = [];
const note = (ok, message) => {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${message}`);
  if (!ok) failures.push(message);
};

const { server, port } = await serve(buildDirectory);
const browser = await launchBrowser();

/**
 * Play Endless for `SECONDS`, steering at the nearest collectible so absorption
 * actually happens. Returns how much was absorbed, which is what makes the mute
 * check non-vacuous.
 */
async function playEndless(page, cdp, canvasRect, label) {
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  const tapPoint = async (node, name) => {
    if (!node?.active || !node?.screen) throw new Error(`FAIL_NAV_${label}_${name}: ${JSON.stringify(node)}`);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: canvasRect.left + canvasRect.width * node.screen.x,
        y: canvasRect.top + canvasRect.height * node.screen.y }],
    });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(700);
  };
  const waitState = (state, ms = 20000) => page.waitForFunction(
    (want) => Boolean(window.__BHR_QA__?.snapshot) && window.__BHR_QA__.snapshot().gameState === want,
    state, { timeout: ms });

  let s = await snapshot();
  await tapPoint(s.ui?.start, 'start');
  await waitState('MODE_SELECT');
  s = await snapshot();
  await tapPoint(s.ui?.modeEndless, 'modeEndless');
  await waitState('MODE_READY');
  s = await snapshot();
  await tapPoint(s.ui?.endlessReady?.start, 'endlessReady.start');
  await waitState('PLAYING');
  await sleep(1200);

  s = await snapshot();
  const joystick = s.ui?.runtimeHUD?.joystick;
  if (!joystick?.screen) throw new Error(`FAIL_NAV_${label}_joystick: ${JSON.stringify(joystick)}`);
  const jx = canvasRect.left + canvasRect.width * joystick.screen.x;
  const jy = canvasRect.top + canvasRect.height * joystick.screen.y;
  const steerTo = async (dx, dz) => {
    const length = Math.hypot(dx, dz) || 1;
    const scale = Math.min(1, length / 4) * 88;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: jx + (dx / length) * scale, y: jy + (dz / length) * scale }],
    });
  };

  const before = await snapshot();
  const absorbedBefore = Number(before.session?.absorbed ?? 0);
  const deadline = Date.now() + SECONDS * 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy }] });
  while (Date.now() < deadline) {
    const live = await snapshot();
    const player = live.player.position;
    const target = live.objects
      .filter((o) => o.state === 'IDLE' && o.tier <= live.machine.maxTier && !o.owner)
      .map((o) => ({ x: o.x, z: o.z, d: Math.hypot(o.x - player.x, o.z - player.z) }))
      .sort((a, b) => a.d - b.d)[0];
    if (target) await steerTo(target.x - player.x, target.z - player.z);
    else await steerTo(Math.cos(Date.now() / 700), Math.sin(Date.now() / 700));
    await sleep(90);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(500);

  const after = await snapshot();
  return {
    absorbed: Number(after.session?.absorbed ?? 0) - absorbedBefore,
    audio: after.audio,
  };
}

try {
  // ---- A. a fresh save must make sound ------------------------------------
/** The clip keys `AudioAssetLibrary` declares, read from the source of truth. */
function declaredClipKeys() {
  const source = readFileSync(
    path.join(repoRoot, 'cocos', 'assets', 'scripts', 'audio', 'AudioAssetLibrary.ts'), 'utf8');
  const table = source.slice(source.indexOf('AUDIO_CLIP_PATHS'), source.indexOf('} as const', source.indexOf('AUDIO_CLIP_PATHS')));
  return [...table.matchAll(/^\s{2}(\w+):/gm)].map((match) => match[1]);
}

  console.log('=== A. fresh save ===');
  const fresh = await openPage(browser, port, SIZE);
  {
    const { context, page, cdp, canvasRect } = fresh;
    let s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const atHome = s.audio;
    console.log(`audio at Home: ready=${atHome?.ready} bound=${atHome?.boundClips?.length}`
      + ` lastError=${JSON.stringify(atHome?.lastError)}`);
    // Derived from the clip table rather than a literal count: a hard-coded 6
    // failed the moment a seventh cue was added deliberately, and would also pass
    // if one clip were swapped for another while the total stayed the same.
    const expectedClips = declaredClipKeys();
    const bound = Array.isArray(atHome?.boundClips) ? atHome.boundClips : [];
    const missingClips = expectedClips.filter((key) => !bound.includes(key));
    const unexpectedClips = bound.filter((key) => !expectedClips.includes(key));
    note(missingClips.length === 0 && unexpectedClips.length === 0
      && bound.length === expectedClips.length,
      `${expectedClips.length} declared clips are resident`
      + ` (bound: ${bound.join(', ') || 'none'}; missing: ${missingClips.join(', ') || 'none'};`
      + ` unexpected: ${unexpectedClips.join(', ') || 'none'})`);
    note(atHome?.lastError === null, `the audio library loaded without error (${JSON.stringify(atHome?.lastError)})`);
    note(atHome?.muted === false, 'a fresh save starts unmuted');

    // The button cue must fire from the UI itself, before any gameplay.
    const playsBefore = Number(atHome?.plays ?? 0);
    const modeCard = s.ui?.mode;
    if (!modeCard?.active) throw new Error(`FAIL_NAV_mode: ${JSON.stringify(modeCard)}`);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: canvasRect.left + canvasRect.width * modeCard.screen.x,
        y: canvasRect.top + canvasRect.height * modeCard.screen.y }],
    });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(900);
    s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    note(Number(s.audio?.plays ?? 0) > playsBefore && s.audio?.lastKey === 'button',
      `tapping a button played the button cue (plays ${playsBefore} -> ${s.audio?.plays}, lastKey ${s.audio?.lastKey})`);

    // Back to Home, then a real match.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Boolean(window.__BHR_QA__?.snapshot) && window.__BHR_QA__.snapshot().gameState === 'HOME',
      undefined, { timeout: 60000 });
    await sleep(1200);

    const run = await playEndless(page, cdp, canvasRect, 'FRESH');
    console.log(`played ${SECONDS}s: absorbed ${run.absorbed}, plays ${run.audio?.plays}`
      + `, missingPlays ${run.audio?.missingPlays}, suppressedByFloor ${run.audio?.suppressedByFloor}`);
    note(run.absorbed > 0, `the match really absorbed something (${run.absorbed}); otherwise the audio check is vacuous`);
    note(Number(run.audio?.plays ?? 0) > 0, `absorption played sounds (${run.audio?.plays} plays)`);
    note(Number(run.audio?.missingPlays ?? -1) === 0,
      `no play request had a missing clip (${run.audio?.missingPlays})`);

    // Per-cue, not just "some plays". `audio.plays` counts everything, so a run
    // in which only the button cue fired would satisfy the check above and still
    // leave the match silent. The cues a short Endless run must produce are
    // asserted; the conditional ones are reported and not asserted, because
    // whether they occur depends on how far that particular run got.
    const counts = run.audio?.playCounts || {};
    const requiredCues = ['button', 'absorb', 'swallow'];
    const conditionalCues = ['upgrade', 'kill', 'death', 'reward'];
    console.log('[audio] per-cue counts: ' + JSON.stringify(counts));
    for (const key of requiredCues) {
      note(Number(counts[key] ?? 0) > 0,
        `the '${key}' cue really played (count ${counts[key] ?? 0})`);
    }
    console.log('[audio] conditional cues this run: '
      + conditionalCues.map((key) => `${key}=${counts[key] ?? 0}`).join(', '));
    await context.close();
  }

  // ---- B. a muted save must stay silent while still playing ---------------
  console.log('\n=== B. save seeded with settings.sfx = false ===');
  const mutedContext = await browser.newContext({
    viewport: { width: SIZE.width, height: SIZE.height },
    hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  await mutedContext.addInitScript(([key, value]) => {
    window.localStorage.setItem(key, value);
  }, [SAVE_KEY, JSON.stringify({ settings: { sfx: false } })]);
  {
    const page = await mutedContext.newPage();
    await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
    await page.waitForFunction(
      () => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
    await sleep(1200);
    const cdp = await mutedContext.newCDPSession(page);
    const canvasRect = await page.locator('#GameCanvas').evaluate((c) => {
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });

    const atHome = await page.evaluate(() => window.__BHR_QA__.snapshot());
    note(atHome.audio?.muted === true, `the seeded save reports muted (${atHome.audio?.muted})`);

    const run = await playEndless(page, cdp, canvasRect, 'MUTED');
    console.log(`played ${SECONDS}s: absorbed ${run.absorbed}, plays ${run.audio?.plays}`);
    note(run.absorbed > 0,
      `the muted match still absorbed something (${run.absorbed}); without this, silence would be indistinguishable from broken audio`);
    note(Number(run.audio?.plays ?? -1) === 0,
      `nothing played while muted (${run.audio?.plays} plays)`);
    await mutedContext.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n[verify:audio] FAIL: ${failures.length} assertion(s)`);
  failures.forEach((line) => console.error(`  ${line}`));
  process.exit(1);
}
console.log('\n[verify:audio] PASS: effects play during play, and settings.sfx silences them.');
