/**
 * Capture the frame where Arena's HUD overflow is detected, with the clamp's own
 * explanation of that frame.
 *
 * `verify_gameplay_visuals.mjs` reports the symptom (`LeaderboardPanel x-12 L12`)
 * about one run in six and says nothing about why. The clamp already records its
 * inputs and per-group shifts (`getHudSafeAreaPass`), now also exposed for
 * `arenaHUD`, so a failing frame can be attributed to either:
 *
 *   A. no group qualified for a shift, or
 *   B. a group wider than the safe span took the "centre it" branch, which
 *      overflows both sides by construction.
 *
 * Retries several Arena matches because the failure is intermittent.
 *
 * Usage: node scripts/probe_arena_hud_clip.mjs [attempts] [secondsPerAttempt]
 *   -> artifacts/qa/v95/arena-hud-clip.json   (the failing frame, if captured)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGeometry, isClipped, launchBrowser, openPage, serve, sleep, splitContent } from './lib/page_layout_geometry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDirectory = path.join(repoRoot, 'artifacts', 'qa', 'v95');
const attempts = Number(process.argv[2] || 4);
const seconds = Number(process.argv[3] || 60);
mkdirSync(outDirectory, { recursive: true });

const { server, port } = await serve(buildDirectory);
const browser = await launchBrowser();

/** Drive a fresh Arena match and return the page handles. */
async function enterArena() {
  const opened = await openPage(browser, port, { width: 390, height: 844 });
  const { page, cdp, canvasRect } = opened;
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(700);
  };
  const tapUi = async (key) => {
    const s = await snapshot();
    const node = s.ui?.[key];
    if (!node?.active || !node?.screen) throw new Error(`FAIL_NAV_${key}: ${JSON.stringify(node)}`);
    await tap(canvasRect.left + canvasRect.width * node.screen.x,
      canvasRect.top + canvasRect.height * node.screen.y);
  };
  const waitState = (want, ms = 20000) => page.waitForFunction(
    (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

  await tapUi('start');
  await waitState('MODE_SELECT');
  await tapUi('modeArena');
  await waitState('MODE_READY');
  const ready = await snapshot();
  const startNode = (ready.ui?.arenaReady || ready.ui?.endlessReady)?.start;
  await tap(canvasRect.left + canvasRect.width * startNode.screen.x,
    canvasRect.top + canvasRect.height * startNode.screen.y);
  await waitState('ARENA');

  const s = await snapshot();
  const joystick = s.ui?.runtimeHUD?.joystick;
  if (!joystick?.screen) throw new Error('FAIL_JOYSTICK');
  const jx = canvasRect.left + canvasRect.width * joystick.screen.x;
  const jy = canvasRect.top + canvasRect.height * joystick.screen.y;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy }] });

  /**
   * Re-steer toward the nearest edible object on every iteration, as the
   * gameplay gate does.
   *
   * Steering once and never updating walks the player in a straight line, so it
   * never levels up -- and every observed occurrence of this clip had Arena
   * reaching level 2, which is what changes the leaderboard's row set. Without
   * re-steering the probe cannot reach the state under test: it reported "no clip
   * in 870 samples" purely because it was playing a different match.
   */
  const steer = async () => {
    const live = await snapshot();
    const player = live.player?.position;
    if (!player) return;
    const target = (live.objects || [])
      .filter((o) => o.state === 'IDLE' && o.tier <= live.machine.maxTier && !o.owner)
      .map((o) => ({ x: o.x, z: o.z, d: Math.hypot(o.x - player.x, o.z - player.z) }))
      .sort((a, b) => a.d - b.d)[0];
    const dx = target ? target.x - player.x : Math.cos(Date.now() / 700);
    const dz = target ? target.z - player.z : Math.sin(Date.now() / 700);
    const length = Math.hypot(dx, dz) || 1;
    const scale = Math.min(1, length / 4) * 88;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: jx + (dx / length) * scale, y: jy + (dz / length) * scale }],
    });
  };

  return { ...opened, snapshot, steer };
}

let captured = null;
try {
  for (let attempt = 1; attempt <= attempts && !captured; attempt += 1) {
    console.log(`[arena-clip] attempt ${attempt}/${attempts}`);
    let opened = null;
    try {
      opened = await enterArena();
      const deadline = Date.now() + seconds * 1000;
      let samples = 0;
      let level = null;
      while (Date.now() < deadline && !captured) {
        await opened.steer();
        const geometry = await collectGeometry(opened.page, 'ArenaHUD');
        samples += 1;
        const live = await opened.snapshot();
        level = live.playerVisibility?.level ?? level;
        if (!geometry.error) {
          const { content } = splitContent(geometry.nodes);
          const clipped = content.filter(isClipped);
          if (clipped.length > 0) {
            captured = {
              attempt,
              samples,
              playerLevel: level,
              clipped: clipped.map((node) => ({
                name: node.name, width: node.w, left: node.left, right: node.right,
                overflowLeft: node.overflowLeft, overflowRight: node.overflowRight,
              })),
              safeArea: live.ui?.arenaHUD?.safeArea ?? null,
            };
            console.log(`[arena-clip] CAPTURED on attempt ${attempt} after ${samples} samples (level ${level})`);
          }
        }
        await sleep(400);
      }
      console.log(`[arena-clip] attempt ${attempt}: ${samples} samples, max level ${level}, no clip`);
    } catch (error) {
      console.log(`[arena-clip] attempt ${attempt} error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (opened) await opened.context.close().catch(() => {});
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (!captured) {
  console.log(`[arena-clip] NOT REPRODUCED in ${attempts} attempt(s)`);
  process.exitCode = 2;
} else {
  const outPath = path.join(outDirectory, 'arena-hud-clip.json');
  writeFileSync(outPath, `${JSON.stringify(captured, null, 2)}\n`);
  console.log(`[arena-clip] wrote ${path.relative(repoRoot, outPath)}`);
  console.log('--- clipped nodes ---');
  for (const node of captured.clipped) {
    console.log(`  ${node.name} w${node.width} x${node.left}..${node.right} L${node.overflowLeft} R${node.overflowRight}`);
  }
  console.log('--- clamp pass ---');
  const pass = captured.safeArea;
  if (!pass) {
    console.log('  (no safeArea record — the clamp never ran on ArenaHUD)');
  } else {
    console.log(`  earlyReturn=${pass.earlyReturn} designHalfWidth=${pass.designHalfWidth}`
      + ` visibleHalfWidth=${pass.visibleHalfWidth} safeHalfWidth=${pass.safeHalfWidth}`
      + ` scale=${pass.scale} frame=${pass.frameWidth}x${pass.frameHeight} children=${pass.childCount}`);
    console.log(`  skippedFullBleed=[${(pass.skippedFullBleed || []).join(',')}]`);
    console.log(`  skippedInactive=[${(pass.skippedInactive || []).join(',')}]`);
    console.log('  groups:');
    for (const group of pass.groups || []) {
      console.log(`    shift=${group.shift.toFixed(1)} left=${group.left.toFixed(1)} right=${group.right.toFixed(1)}`
        + ` margin=${group.marginScreenPx} safeHalf=${group.groupSafeHalfWidth.toFixed(1)}`
        + ` names=[${(group.names || []).join(',')}]`);
    }
  }
}
