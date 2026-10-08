/**
 * Gate: the gameplay HUD stays inside the frame, and the player is always
 * findable, during real Endless and Arena play.
 *
 * Two criteria the project already established but never asserted anywhere:
 *
 *  1. **HUD_WEIGHT / RT-08.** The HUD row is authored 622 design px wide against
 *     the 591.5 px the UI camera shows at 390x844, so its pills were cut by the
 *     frame edge. `HudSafeAreaInset` shifts the overflowing clusters, and the QA
 *     bridge exposes `ui.safeArea` / `ui.pills` / `ui.pillPanels` as evidence --
 *     but nothing read them, so the fix could silently regress. This samples the
 *     live HUD geometry during play and asserts nothing is clipped.
 *
 *  2. **PLAYER_HERO.** The black hole must be findable at a glance at every
 *     level. `playerVisibility` reports its normalised screen position and its
 *     on-screen radius, measured through the real gameplay camera. Nothing
 *     asserted it either.
 *
 * Sampling runs for the whole match rather than at one instant, because both
 * faults are position-dependent: a pill is only clipped while a value is wide,
 * and the hero only leaves the frame while the camera is catching up.
 *
 * Usage: node scripts/verify_gameplay_visuals.mjs [--seconds=45]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  collectGeometry,
  isClipped,
  launchBrowser,
  openPage,
  serve,
  sleep,
  splitContent,
} from './lib/page_layout_geometry.mjs';

const buildDirectory = 'cocos/build/web-mobile';
const SHOT_DIR = 'artifacts/qa/v95/gameplay';
mkdirSync(SHOT_DIR, { recursive: true });

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const SECONDS = Number(argOf('seconds', '45'));
const SIZE = { width: 412, height: 915, label: 'pixel-20:9' };

/**
 * Transient HUD nodes that only exist while a specific thing is happening. A
 * "nothing is clipped" result says nothing about them unless they actually
 * appeared, so each is asserted to have been observed at least once.
 *
 * These are exactly the nodes an earlier run caught clipped: the tier upgrade
 * banner (600 design px wide, narrowed at runtime) and the tier lock chip
 * (210 px, positioned from a projected world point).
 */
const HUD_COVERAGE = {
  // Endless reliably reaches LV2 and meets tier-locked bodies inside the window,
  // so both transients must be seen or the pass is silent about them.
  EndlessHUD: [/^TierUpgradeBanner_/, /^TierLockChip$/],
  // Arena does not: a fresh save fights 1v7 and is usually defeated before it can
  // level up, so requiring the banner here would make the gate unsatisfiable.
  // These two are always present during a match, which is what proves the Arena
  // HUD geometry was actually sampled rather than silently empty.
  ArenaHUD: [/^TimerValue$/, /^Joystick$/],
};

/**
 * The hero must keep at least this on-screen radius, in px. §37 measured 62 px
 * at its worst on 375x667; 40 is a regression guard with room for the different
 * framing at 412x915, not a restatement of the measurement.
 */
const MIN_HERO_RADIUS_PX = 40;
/** The hero's centre must stay this far inside the frame, as a fraction. */
const HERO_EDGE_MARGIN = 0.04;

const failures = [];
const note = (ok, message) => {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${message}`);
  if (!ok) failures.push(message);
};

const { server, port } = await serve(buildDirectory);
const browser = await launchBrowser();

/** Steer toward the nearest collectible, the drive the other gates use. */
function makeDriver(page, cdp, canvasRect, joystickScreen) {
  const jx = canvasRect.left + canvasRect.width * joystickScreen.x;
  const jy = canvasRect.top + canvasRect.height * joystickScreen.y;
  const steerTo = async (dx, dz) => {
    const length = Math.hypot(dx, dz) || 1;
    const scale = Math.min(1, length / 4) * 88;
    // Measured by the joystick calibration: stick dy and world Z share a sign.
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: jx + (dx / length) * scale, y: jy + (dz / length) * scale }],
    });
  };
  return {
    async press() {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy }] });
    },
    async release() {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    async step() {
      const live = await page.evaluate(() => window.__BHR_QA__.snapshot());
      const player = live.player.position;
      const target = live.objects
        .filter((o) => o.state === 'IDLE' && o.tier <= live.machine.maxTier && !o.owner)
        .map((o) => ({ x: o.x, z: o.z, d: Math.hypot(o.x - player.x, o.z - player.z) }))
        .sort((a, b) => a.d - b.d)[0];
      if (target) await steerTo(target.x - player.x, target.z - player.z);
      else await steerTo(Math.cos(Date.now() / 700), Math.sin(Date.now() / 700));
    },
  };
}

/** Sample the HUD's geometry and the hero's visibility for one match. */
async function sampleMatch(page, cdp, canvasRect, hudNode, label) {
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  let s = await snapshot();
  const joystick = s.ui?.runtimeHUD?.joystick;
  if (!joystick?.screen) throw new Error(`FAIL_${label}_JOYSTICK: ${JSON.stringify(joystick)}`);
  const driver = makeDriver(page, cdp, canvasRect, joystick.screen);

  const clippedSamples = [];
  const heroSamples = [];
  const levelsSeen = new Set();
  /** Every HUD node name that was ever projected, so coverage is provable. */
  const observedNodes = new Set();
  let matchSamples = 0;
  // The tier-upgrade banner lives 2.0 s and the loop samples about every 2.2 s,
  // so sampling alone misses it outright -- the first run of this gate reported
  // "0 banner samples" for a match that had one. The bridge's own emitted counter
  // says when it appeared, and the geometry is sampled at that moment.
  let lastUpgradeEmitted = -1;
  let endedEarly = null;
  const deadline = Date.now() + SECONDS * 1000;

  // Projecting the whole HUD subtree is by far the most expensive step, and in
  // Arena the HUD carries a nameplate per opponent. Sampling geometry every
  // other iteration doubles the number of hero observations the same window
  // yields, and a clipped node stays clipped for far longer than one iteration.
  let iteration = 0;
  await driver.press();
  while (Date.now() < deadline) {
    await driver.step();

    if (iteration % 2 === 0) {
      const geometry = await collectGeometry(page, hudNode);
      if (!geometry.error) {
        const { content } = splitContent(geometry.nodes);
        for (const node of content) observedNodes.add(node.name);
        for (const node of content.filter(isClipped)) {
          clippedSamples.push(`${node.name} w${node.w} x${node.left}..${node.right} L${node.overflowLeft} R${node.overflowRight}`);
        }
      }
    }
    iteration += 1;

    if (matchSamples === 3) {
      await page.screenshot({ path: path.join(SHOT_DIR, `${label.toLowerCase()}-hud.png`) });
    }
    const live = await snapshot();
    const upgradeEmitted = Number(live.tierUpgrade?.emittedCount ?? 0);
    if (lastUpgradeEmitted >= 0 && upgradeEmitted > lastUpgradeEmitted) {
      const burst = await collectGeometry(page, hudNode);
      if (!burst.error) {
        const { content } = splitContent(burst.nodes);
        for (const node of content) observedNodes.add(node.name);
        for (const node of content.filter(isClipped)) {
          clippedSamples.push(`${node.name} L${node.overflowLeft} R${node.overflowRight} T${node.overflowTop} B${node.overflowBottom}`);
        }
      }
    }
    lastUpgradeEmitted = upgradeEmitted;
    // In Arena the player can be defeated, after which there is no hero to
    // measure; that ends the observation rather than failing it.
    if (live.gameState !== 'ARENA' && live.gameState !== 'PLAYING') {
      endedEarly = live.gameState;
      break;
    }
    matchSamples += 1;
    const hero = live.playerVisibility;
    if (hero?.active) {
      heroSamples.push(hero);
      levelsSeen.add(hero.level);
    }
    await sleep(120);
  }
  await driver.release();
  await sleep(400);
  return { clippedSamples, heroSamples, levelsSeen, observedNodes, matchSamples, endedEarly };
}

try {
  const { context, page, cdp, canvasRect } = await openPage(browser, port, SIZE);
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  const tapPoint = async (node, name) => {
    if (!node?.active || !node?.screen) throw new Error(`FAIL_NAV_${name}: ${JSON.stringify(node)}`);
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
    (want) => window.__BHR_QA__.snapshot().gameState === want, state, { timeout: ms });

  // ---- Endless ------------------------------------------------------------
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

  const endless = await sampleMatch(page, cdp, canvasRect, 'EndlessHUD', 'ENDLESS');
  console.log(`\n=== Endless (${SECONDS}s) ===`);
  console.log(`  HUD geometry samples with a clipped node: ${endless.clippedSamples.length}`);
  if (endless.clippedSamples.length) {
    console.log(`  first few: ${[...new Set(endless.clippedSamples)].slice(0, 5).join(' | ')}`);
  }
  const radii = endless.heroSamples.map((h) => h.radiusPx);
  const minRadius = radii.length ? Math.min(...radii) : null;
  const xs = endless.heroSamples.map((h) => h.screenX);
  const ys = endless.heroSamples.map((h) => h.screenY);
  console.log(`  match samples ${endless.matchSamples}${endless.endedEarly ? ` (ended: ${endless.endedEarly})` : ''}`
    + `, hero samples ${radii.length}, levels seen ${[...endless.levelsSeen].join(',')}`
    + `  radiusPx min ${minRadius?.toFixed(1)} max ${Math.max(...radii).toFixed(1)}`
    + `  screenX ${Math.min(...xs).toFixed(3)}..${Math.max(...xs).toFixed(3)}`
    + `  screenY ${Math.min(...ys).toFixed(3)}..${Math.max(...ys).toFixed(3)}`);

  note(endless.matchSamples > 20,
    `Endless ran long enough to judge (${endless.matchSamples} samples)`);
  note(endless.clippedSamples.length === 0,
    `no EndlessHUD node is clipped at any sample (${endless.clippedSamples.length} clipped samples)`);
  for (const pattern of HUD_COVERAGE.EndlessHUD) {
    const seen = [...endless.observedNodes].filter((name) => pattern.test(name));
    note(seen.length > 0,
      `Endless exercised ${pattern.source} (${seen.length} samples); otherwise "nothing is clipped" is silent about it`);
  }
  note(minRadius !== null && minRadius >= MIN_HERO_RADIUS_PX,
    `the hero never shrank below ${MIN_HERO_RADIUS_PX} px (min ${minRadius?.toFixed(1)})`);
  note(Math.min(...xs) >= HERO_EDGE_MARGIN && Math.max(...xs) <= 1 - HERO_EDGE_MARGIN,
    `the hero stayed ${HERO_EDGE_MARGIN} inside the frame horizontally (${Math.min(...xs).toFixed(3)}..${Math.max(...xs).toFixed(3)})`);
  note(Math.min(...ys) >= HERO_EDGE_MARGIN && Math.max(...ys) <= 1 - HERO_EDGE_MARGIN,
    `the hero stayed ${HERO_EDGE_MARGIN} inside the frame vertically (${Math.min(...ys).toFixed(3)}..${Math.max(...ys).toFixed(3)})`);

  // ---- Arena --------------------------------------------------------------
  s = await snapshot();
  await tapPoint(s.ui?.runtimeHUD?.pauseButton, 'pauseButton');
  s = await snapshot();
  await tapPoint(s.ui?.formalPages?.pauseHome, 'pauseHome');
  await waitState('HOME');
  await sleep(800);

  s = await snapshot();
  await tapPoint(s.ui?.start, 'start');
  await waitState('MODE_SELECT');
  s = await snapshot();
  await tapPoint(s.ui?.modeArena, 'modeArena');
  await waitState('MODE_READY');
  s = await snapshot();
  await tapPoint((s.ui?.arenaReady || s.ui?.endlessReady)?.start, 'arenaReady.start');
  await waitState('ARENA');
  await sleep(1200);

  const arena = await sampleMatch(page, cdp, canvasRect, 'ArenaHUD', 'ARENA');
  console.log(`\n=== Arena (${SECONDS}s) ===`);
  console.log(`  HUD geometry samples with a clipped node: ${arena.clippedSamples.length}`);
  if (arena.clippedSamples.length) {
    console.log(`  first few: ${[...new Set(arena.clippedSamples)].slice(0, 5).join(' | ')}`);
  }
  const aRadii = arena.heroSamples.map((h) => h.radiusPx);
  const aMin = aRadii.length ? Math.min(...aRadii) : null;
  const aXs = arena.heroSamples.map((h) => h.screenX);
  const aYs = arena.heroSamples.map((h) => h.screenY);
  console.log(`  match samples ${arena.matchSamples}${arena.endedEarly ? ` (ended: ${arena.endedEarly})` : ''}`
    + `, hero samples ${aRadii.length}, levels seen ${[...arena.levelsSeen].join(',')}`
    + `  radiusPx min ${aMin?.toFixed(1)} max ${Math.max(...aRadii).toFixed(1)}`
    + `  screenX ${Math.min(...aXs).toFixed(3)}..${Math.max(...aXs).toFixed(3)}`
    + `  screenY ${Math.min(...aYs).toFixed(3)}..${Math.max(...aYs).toFixed(3)}`);

  // Arena matches can end in defeat, so the floor is on samples taken while the
  // match was actually running, not on the wall clock.
  // An Arena match against seven bots can end in defeat within the window on a
  // fresh save, which is real gameplay rather than a harness failure. The floor
  // is therefore on samples taken while the match was running, and the early end
  // is reported so a short window is visible rather than implied.
  note(arena.matchSamples > 5,
    `Arena ran long enough to judge (${arena.matchSamples} samples, ended: ${arena.endedEarly || 'still playing'})`);
  note(arena.clippedSamples.length === 0,
    `no ArenaHUD node is clipped at any sample (${arena.clippedSamples.length} clipped samples)`);
  for (const pattern of HUD_COVERAGE.ArenaHUD) {
    const seen = [...arena.observedNodes].filter((name) => pattern.test(name));
    note(seen.length > 0,
      `Arena HUD geometry was really sampled: ${pattern.source} present in ${seen.length} samples`);
  }
  note(aMin !== null && aMin >= MIN_HERO_RADIUS_PX,
    `the hero never shrank below ${MIN_HERO_RADIUS_PX} px in Arena (min ${aMin?.toFixed(1)})`);
  note(Math.min(...aXs) >= HERO_EDGE_MARGIN && Math.max(...aXs) <= 1 - HERO_EDGE_MARGIN,
    `the hero stayed ${HERO_EDGE_MARGIN} inside the frame horizontally in Arena (${Math.min(...aXs).toFixed(3)}..${Math.max(...aXs).toFixed(3)})`);
  note(Math.min(...aYs) >= HERO_EDGE_MARGIN && Math.max(...aYs) <= 1 - HERO_EDGE_MARGIN,
    `the hero stayed ${HERO_EDGE_MARGIN} inside the frame vertically in Arena (${Math.min(...aYs).toFixed(3)}..${Math.max(...aYs).toFixed(3)})`);

  await context.close();
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n[verify:gameplay-visuals] FAIL: ${failures.length} assertion(s)`);
  failures.forEach((line) => console.error(`  ${line}`));
  process.exit(1);
}
console.log('\n[verify:gameplay-visuals] PASS: HUD stays in frame and the hero stays findable, Endless and Arena.');
