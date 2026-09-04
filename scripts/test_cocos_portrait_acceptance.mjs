/**
 * Real Cocos Creator portrait acceptance.
 *
 * This runner builds the Cocos project with the official 3.8.3 CLI, serves the
 * emitted Web Mobile package, then drives the actual WebGL runtime with CDP
 * touch events. It never imports game code or mutates a running scene.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const cocosProject = path.join(repoRoot, 'cocos');
const creatorExe = process.env.COCOS_CREATOR_EXE || 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\CocosCreator.exe';
const buildDirectory = path.join(cocosProject, 'build', 'web-mobile');
const evidenceDirectory = path.join(cocosProject, 'docs', 'evidence', 'v2', 'portrait');
const reportPath = path.join(evidenceDirectory, 'acceptance-report.json');
// `npm run acceptance:v2 -- --scope=pages` is the ergonomic local visual-QA
// command. Keep the environment variable for CI, but do not silently ignore
// the documented CLI form and accidentally start the long 500m traversal.
const requestedAcceptanceScope = process.argv.find((argument) => argument.startsWith('--scope='))?.slice('--scope='.length)
  || process.env.BHR_ACCEPTANCE_SCOPE
  || 'full';
const acceptanceScope = ['full', 'pages', 'arena-timer'].includes(requestedAcceptanceScope)
  ? requestedAcceptanceScope
  : 'full';
const requiredPortraitViewports = [
  { id: '375x667', width: 375, height: 667 },
  { id: '390x844', width: 390, height: 844 },
  { id: '430x932', width: 430, height: 932 },
];

mkdirSync(evidenceDirectory, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildCocosWebMobile() {
  return new Promise((resolve, reject) => {
    if (!existsSync(creatorExe)) {
      reject(new Error(`Cocos Creator 3.8.3 was not found: ${creatorExe}`));
      return;
    }

    const child = spawn(creatorExe, [
      '--project', cocosProject,
      '--build', 'platform=web-mobile;debug=false;orientation=portrait;'
    ], { cwd: cocosProject, windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      // Cocos documents 36 as the command-line build-success code; some
      // Windows installations return the conventional 0 instead.
      if (code === 0 || code === 36) {
        resolve(output);
        return;
      }
      reject(new Error(`Cocos CLI build failed with exit code ${code}.\n${output}`));
    });
  });
}

function createStaticServer(rootDirectory) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const urlPath = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^[/\\]+/, '');
      const filePath = path.resolve(rootDirectory, relativePath);
      if (!filePath.startsWith(`${rootDirectory}${path.sep}`) && filePath !== path.join(rootDirectory, 'index.html')) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if (!existsSync(filePath)) {
        response.writeHead(404).end('Not found');
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      const contentType = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.wasm': 'application/wasm',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
      }[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function dispatchTouchTap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((resolve) => setTimeout(resolve, 60));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function beginTouchJoystick(cdp, startX, startY, endX, endY) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY }] });
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: Math.round(startX + (endX - startX) * step / 8),
        y: Math.round(startY + (endY - startY) * step / 8),
      }],
    });
    await new Promise((resolve) => setTimeout(resolve, 24));
  }
}

async function releaseTouchJoystick(cdp) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function verifySecondaryTouchDoesNotHijack(cdp, page, canvasRect, joystick) {
  const primary = {
    id: 1,
    startX: joystick.x,
    startY: joystick.y,
    endX: joystick.x + joystick.offsetX * 0.72,
    endY: joystick.y - joystick.offsetY * 0.72,
  };
  const secondary = {
    id: 2,
    startX: canvasRect.left + canvasRect.width * 0.60,
    startY: joystick.y + joystick.offsetY * 0.24,
    endX: canvasRect.left + canvasRect.width * 0.58,
    endY: joystick.y + joystick.offsetY * 0.76,
  };

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: primary.startX, y: primary.startY, id: primary.id }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: primary.endX, y: primary.endY, id: primary.id }],
  });
  await page.waitForTimeout(120);
  const beforeSecondary = await readRuntimeSnapshot(page);
  const primaryInput = beforeSecondary.machine.movementInput;
  assert(Math.hypot(primaryInput.x, primaryInput.y) > 0.1,
    `FAIL_PRIMARY_TOUCH_INPUT: ${JSON.stringify(primaryInput)}`);
  assert(beforeSecondary.machine.activeTouchId !== null, 'FAIL_PRIMARY_TOUCH_OWNER: joystick did not retain a touch owner');

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: primary.endX, y: primary.endY, id: primary.id },
      { x: secondary.startX, y: secondary.startY, id: secondary.id },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: primary.endX, y: primary.endY, id: primary.id },
      { x: secondary.endX, y: secondary.endY, id: secondary.id },
    ],
  });
  await page.waitForTimeout(120);
  const whileSecondaryMoves = await readRuntimeSnapshot(page);
  const secondaryInput = whileSecondaryMoves.machine.movementInput;
  const inputDrift = Math.hypot(secondaryInput.x - primaryInput.x, secondaryInput.y - primaryInput.y);
  assert(inputDrift < 0.08,
    `FAIL_SECONDARY_TOUCH_HIJACK: primary=${JSON.stringify(primaryInput)} secondary=${JSON.stringify(secondaryInput)}`);

  // CDP requires touchEnd/touchCancel to have no points. Removing the second
  // point from the active touchMove sequence emits its real per-point end while
  // keeping the primary finger held.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: primary.endX, y: primary.endY, id: primary.id }],
  });
  await page.waitForTimeout(80);
  const afterSecondaryRelease = await readRuntimeSnapshot(page);
  const afterSecondaryInput = afterSecondaryRelease.machine.movementInput;
  const releaseDrift = Math.hypot(afterSecondaryInput.x - primaryInput.x, afterSecondaryInput.y - primaryInput.y);
  assert(releaseDrift < 0.08,
    `FAIL_SECONDARY_RELEASE_HIJACK: primary=${JSON.stringify(primaryInput)} after=${JSON.stringify(afterSecondaryInput)}`);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  const afterPrimaryRelease = await readRuntimeSnapshot(page);
  const releasedSpeed = Math.hypot(afterPrimaryRelease.machine.velocity.x, afterPrimaryRelease.machine.velocity.z);
  assert(releasedSpeed < 0.06, `FAIL_PRIMARY_TOUCH_RELEASE: velocity ${releasedSpeed}`);
  assert(afterPrimaryRelease.machine.activeTouchId === null,
    `FAIL_PRIMARY_TOUCH_OWNER_RELEASE: ${afterPrimaryRelease.machine.activeTouchId}`);
  return {
    primaryInput,
    secondaryInput,
    activeOwnerBefore: beforeSecondary.machine.activeTouchId,
    activeOwnerAfterSecondaryRelease: afterSecondaryRelease.machine.activeTouchId,
    inputDrift,
    releaseDrift,
    releasedSpeed,
  };
}

async function readRuntimeSnapshot(page) {
  return page.evaluate(() => window.__BHR_QA__.snapshot());
}

/**
 * Verify the editor-saved formal runtime pages through real touch events.
 * The bridge remains read-only: all state transitions originate from the
 * same visible Buttons a player taps on a phone.
 */
async function verifyRuntimePages(cdp, page, canvasRect) {
  const before = await readRuntimeSnapshot(page);
  const design = before.ui?.design;
  const pointFor = (node, name) => {
    assert(node?.active, `FAIL_RUNTIME_PAGE_NODE_INACTIVE_${name}: ${JSON.stringify(node)}`);
    assert(design?.width > 0 && design?.height > 0,
      `FAIL_RUNTIME_PAGE_DESIGN: ${JSON.stringify(design)}`);
    // Page nodes are editor-saved in portrait design coordinates.  Their
    // camera screen projection is intentionally not used here: SHOW_ALL can
    // report that projection in the full WebGL frame instead of the visible
    // browser viewport. This remains a raw CDP touch on the displayed button.
    return {
      x: canvasRect.left + canvasRect.width * ((node.x + design.width * 0.5) / design.width),
      y: canvasRect.top + canvasRect.height * ((design.height * 0.5 - node.y) / design.height),
    };
  };
  const pause = pointFor(before.ui?.runtimeHUD?.pauseButton, 'PAUSE');

  await dispatchTouchTap(cdp, pause.x, pause.y);
  try {
    await page.waitForFunction(() => {
      const snapshot = window.__BHR_QA__.snapshot();
      return snapshot.gameState === 'PAUSED' && snapshot.uiScreen === 'Pause';
    }, undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_RUNTIME_PAUSE_TOUCH: ${JSON.stringify({
      pause,
      state: actual.gameState,
      uiScreen: actual.uiScreen,
      router: actual.ui?.runtimePageInput,
      pauseButton: actual.ui?.runtimeHUD?.pauseButton,
      error: error instanceof Error ? error.message : String(error),
    })}`);
  }
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-pause.png') });

  const paused = await readRuntimeSnapshot(page);
  const resume = pointFor(paused.ui?.formalPages?.pauseResume, 'RESUME');
  await dispatchTouchTap(cdp, resume.x, resume.y);
  try {
    await page.waitForFunction(() => {
      const snapshot = window.__BHR_QA__.snapshot();
      return snapshot.gameState === 'PLAYING' && snapshot.uiScreen === 'Gameplay';
    }, undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_RUNTIME_RESUME_TOUCH: ${JSON.stringify({
      resume,
      state: actual.gameState,
      uiScreen: actual.uiScreen,
      router: actual.ui?.runtimePageInput,
      resumeButton: actual.ui?.formalPages?.pauseResume,
      error: error instanceof Error ? error.message : String(error),
    })}`);
  }

  await dispatchTouchTap(cdp, pause.x, pause.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PAUSED', undefined, { timeout: 5000 });
  const pausedForSettlement = await readRuntimeSnapshot(page);
  const settle = pointFor(pausedForSettlement.ui?.formalPages?.pauseSettle, 'SETTLE');
  await dispatchTouchTap(cdp, settle.x, settle.y);
  try {
    await page.waitForFunction(() => {
      const snapshot = window.__BHR_QA__.snapshot();
      return snapshot.gameState === 'SETTLEMENT' && snapshot.uiScreen === 'Settlement';
    }, undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_RUNTIME_SETTLEMENT_TOUCH: ${JSON.stringify({
      settle,
      state: actual.gameState,
      uiScreen: actual.uiScreen,
      router: actual.ui?.runtimePageInput,
      settleButton: actual.ui?.formalPages?.pauseSettle,
      error: error instanceof Error ? error.message : String(error),
    })}`);
  }
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-settlement.png') });

  return { pause, resume, settle, finalScreen: 'Settlement' };
}

/**
 * Drives the playable offline arena only through the real, rendered controls.
 * The QA bridge supplies diagnostics and positions read-only; it never calls a
 * game setter, grants mass, changes a score or emits an event.
 */
async function verifyArenaFlow(cdp, page, canvasRect, modeSnapshot) {
  const pointFor = (node, name) => {
    const design = modeSnapshot.ui?.design;
    assert(node?.active, `FAIL_ARENA_NODE_INACTIVE_${name}: ${JSON.stringify(node)}`);
    assert(design?.width > 0 && design?.height > 0,
      `FAIL_ARENA_DESIGN: ${JSON.stringify(design)}`);
    return {
      x: canvasRect.left + canvasRect.width * ((node.x + design.width * 0.5) / design.width),
      y: canvasRect.top + canvasRect.height * ((design.height * 0.5 - node.y) / design.height),
    };
  };

  const arenaButton = modeSnapshot.ui?.modeArena;
  const arenaPoint = pointFor(arenaButton, 'MODE_ARENA');
  await dispatchTouchTap(cdp, arenaPoint.x, arenaPoint.y);
  try {
    await page.waitForFunction(() => {
      const snapshot = window.__BHR_QA__.snapshot();
      return snapshot.gameState === 'ARENA' && snapshot.ui?.arenaHUD?.root?.active === true;
    }, undefined, { timeout: 7000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_MODE_ARENA_TOUCH: ${JSON.stringify({
      arenaButton,
      arenaPoint,
      gameState: actual.gameState,
      arena: actual.arena,
      router: actual.ui?.runtimePageInput,
      error: error instanceof Error ? error.message : String(error),
    })}`);
  }

  const initial = await readRuntimeSnapshot(page);
  assert(initial.arena?.running, `FAIL_ARENA_NOT_RUNNING: ${JSON.stringify(initial.arena)}`);
  assert(initial.arena?.competitorCount === 8 && initial.arena?.leaderboard?.length === 8,
    `FAIL_ARENA_ROSTER_1_7: ${JSON.stringify(initial.arena)}`);
  assert(Object.keys(initial.arena?.botStates || {}).length === 7,
    `FAIL_ARENA_BOT_FILL: ${JSON.stringify(initial.arena?.botStates)}`);
  assert(initial.ui?.arenaHUD?.joystick?.active,
    `FAIL_ARENA_VISIBLE_JOYSTICK: ${JSON.stringify(initial.ui?.arenaHUD)}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-arena.png') });

  // Give real bots time to navigate toward and physically absorb world items.
  // No timer or leaderboard entry is faked: the next assertion requires an
  // actual bot's consumed counter and mass to advance from live world objects.
  const collectionDeadline = Date.now() + 18000;
  let collected = initial;
  let hunter = null;
  let defeated = null;
  while (Date.now() < collectionDeadline) {
    // Poll quickly enough to capture the real 2.5-second revive phase rather
    // than allowing an autonomous respawn to erase its visible evidence.
    await page.waitForTimeout(120);
    collected = await readRuntimeSnapshot(page);
    const localMass = collected.arena?.localMass || 0;
    hunter = (collected.arena?.leaderboard || []).find((entry) => !entry.isLocal
      && entry.alive && entry.shieldSeconds <= 0
      && entry.consumed > 0 && entry.mass >= Math.max(1, localMass) * 1.32) || null;
    if (collected.gameState === 'REVIVING' && collected.arena?.localAlive === false) {
      defeated = collected;
    }
    if (defeated && hunter) break;
  }
  assert((collected.arena?.leaderboard || []).some((entry) => !entry.isLocal && entry.consumed > 0),
    `FAIL_ARENA_BOT_COLLECT: ${JSON.stringify(collected.arena)}`);
  assert(hunter, `FAIL_ARENA_NO_STRONG_BOT_FOR_REAL_CONSUME: ${JSON.stringify(collected.arena)}`);
  assert(defeated, `FAIL_ARENA_CONSUME_PLAYER_TIMEOUT: ${JSON.stringify(collected.arena)}`);
  assert(defeated.gameState === 'REVIVING' && defeated.arena?.localAlive === false,
    `FAIL_ARENA_CONSUME_PLAYER: ${JSON.stringify({ gameState: defeated.gameState, arena: defeated.arena })}`);
  assert(defeated.ui?.formalPages?.revive?.active,
    `FAIL_ARENA_REVIVE_PAGE: ${JSON.stringify(defeated.ui?.formalPages)}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-revive.png') });

  const revive = pointFor(defeated.ui?.formalPages?.reviveNow, 'REVIVE_NOW');
  await dispatchTouchTap(cdp, revive.x, revive.y);
  try {
    await page.waitForFunction(() => {
      const snapshot = window.__BHR_QA__.snapshot();
      return snapshot.gameState === 'ARENA' && snapshot.arena?.localAlive === true
        && snapshot.arena?.leaderboard?.find((entry) => entry.isLocal)?.shieldSeconds > 0;
    }, undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_ARENA_RESPAWN: ${JSON.stringify({
      revive,
      gameState: actual.gameState,
      arena: actual.arena,
      router: actual.ui?.runtimePageInput,
      error: error instanceof Error ? error.message : String(error),
    })}`);
  }
  const respawned = await readRuntimeSnapshot(page);

  // Prove the arena's visible joystick is still wired to the real local
  // player after respawn. The local player has spawn shield, so this input is
  // not racing an immediate second defeat.
  const arenaJoystick = respawned.ui?.arenaHUD?.joystick;
  const design = respawned.ui?.design;
  assert(arenaJoystick?.active && design?.width > 0 && design?.height > 0,
    `FAIL_ARENA_JOYSTICK_LAYOUT: ${JSON.stringify({ arenaJoystick, design })}`);
  const joystick = {
    x: canvasRect.left + canvasRect.width * ((arenaJoystick.x + design.width * 0.5) / design.width),
    y: canvasRect.top + canvasRect.height * ((design.height * 0.5 - arenaJoystick.y) / design.height),
  };
  await beginTouchJoystick(cdp, joystick.x, joystick.y, joystick.x - 38, joystick.y - 18);
  await page.waitForTimeout(180);
  const arenaMoving = await readRuntimeSnapshot(page);
  assert(Math.hypot(arenaMoving.machine.movementInput.x, arenaMoving.machine.movementInput.y) > 0.1,
    `FAIL_ARENA_JOYSTICK_TOUCH: ${JSON.stringify({
      input: arenaMoving.machine.movementInput,
      touch: arenaMoving.machine.touchDiagnostic,
      activeTouchId: arenaMoving.machine.activeTouchId,
      gameState: arenaMoving.gameState,
    })}`);
  await releaseTouchJoystick(cdp);

  // End the match through the visible pause/settle controls. This produces a
  // real FORFEIT match result and arena settlement rather than invoking a
  // private finish method.
  const arenaPause = pointFor(respawned.ui?.arenaHUD?.pauseButton, 'ARENA_PAUSE');
  await dispatchTouchTap(cdp, arenaPause.x, arenaPause.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PAUSED', undefined, { timeout: 5000 });
  const paused = await readRuntimeSnapshot(page);
  const settle = pointFor(paused.ui?.formalPages?.pauseSettle, 'ARENA_SETTLE');
  await dispatchTouchTap(cdp, settle.x, settle.y);
  await page.waitForFunction(() => {
    const snapshot = window.__BHR_QA__.snapshot();
    return snapshot.gameState === 'SETTLEMENT' && snapshot.arena?.reason === 'FORFEIT';
  }, undefined, { timeout: 5000 });
  const settled = await readRuntimeSnapshot(page);
  assert(settled.arena?.settlementReward?.coins > 0,
    `FAIL_ARENA_SETTLEMENT_REWARD: ${JSON.stringify(settled.arena?.settlementReward)}`);
  assert((settled.session?.coinsEarned || 0) >= settled.arena.settlementReward.coins,
    `FAIL_ARENA_SETTLEMENT_NOT_SAVED: ${JSON.stringify({ session: settled.session, reward: settled.arena.settlementReward })}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-arena-settlement.png') });

  const home = pointFor(settled.ui?.formalPages?.settlementHome, 'ARENA_SETTLEMENT_HOME');
  await dispatchTouchTap(cdp, home.x, home.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 5000 });
  const homeSnapshot = await readRuntimeSnapshot(page);
  const start = pointFor(homeSnapshot.ui?.start, 'ARENA_HOME_START');
  await dispatchTouchTap(cdp, start.x, start.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });

  return {
    arenaButton: arenaPoint,
    initial: initial.arena,
    collected: collected.arena,
    hunter: { id: hunter.id, mass: hunter.mass, consumed: hunter.consumed, position: hunter.position },
    revived: respawned.arena,
    settled: settled.arena,
    returnMode: (await readRuntimeSnapshot(page)).ui?.modePage,
  };
}

/**
 * Proves the other legitimate arena end condition without granting time,
 * calling a manager method or changing its duration. The real 180-second
 * timer runs under the rendered page until ArenaMatchManager ends the match.
 */
async function verifyArenaTimerExpiry(cdp, page, canvasRect) {
  const homeStart = {
    x: canvasRect.left + canvasRect.width * 0.5,
    y: canvasRect.top + canvasRect.height * 0.773,
  };
  await dispatchTouchTap(cdp, homeStart.x, homeStart.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
  const modeSnapshot = await readRuntimeSnapshot(page);
  const arenaButton = modeSnapshot.ui?.modeArena;
  const design = modeSnapshot.ui?.design;
  assert(arenaButton?.active && design?.width > 0 && design?.height > 0,
    `FAIL_ARENA_TIMER_MODE_LAYOUT: ${JSON.stringify({ arenaButton, design })}`);
  const arenaPoint = {
    x: canvasRect.left + canvasRect.width * ((arenaButton.x + design.width * 0.5) / design.width),
    y: canvasRect.top + canvasRect.height * ((design.height * 0.5 - arenaButton.y) / design.height),
  };
  await dispatchTouchTap(cdp, arenaPoint.x, arenaPoint.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'ARENA', undefined, { timeout: 7000 });
  const started = await readRuntimeSnapshot(page);
  assert(started.arena?.running && started.arena?.durationSeconds === 180,
    `FAIL_ARENA_TIMER_START: ${JSON.stringify(started.arena)}`);

  // Keep the page foregrounded and wait for the native gameplay clock. The
  // timeout only bounds a real wait; it does not manipulate the clock.
  await page.waitForFunction(() => {
    const snapshot = window.__BHR_QA__.snapshot();
    return snapshot.gameState === 'SETTLEMENT' && snapshot.arena?.reason === 'TIME'
      && snapshot.uiScreen === 'Settlement';
  }, undefined, { timeout: 205000 });
  const settled = await readRuntimeSnapshot(page);
  assert(!settled.arena?.running && settled.arena?.elapsedSeconds >= settled.arena?.durationSeconds,
    `FAIL_ARENA_TIMER_NOT_FINISHED: ${JSON.stringify(settled.arena)}`);
  assert(settled.arena?.settlementReward?.coins > 0,
    `FAIL_ARENA_TIMER_REWARD: ${JSON.stringify(settled.arena?.settlementReward)}`);
  assert((settled.session?.coinsEarned || 0) >= settled.arena.settlementReward.coins,
    `FAIL_ARENA_TIMER_REWARD_NOT_SAVED: ${JSON.stringify({ session: settled.session, reward: settled.arena.settlementReward })}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-arena-time-settlement.png') });
  return { started: started.arena, settled: settled.arena };
}

function validatePortraitSnapshot(viewport, canvasRect, runtimeSnapshot) {
  const portrait = runtimeSnapshot.ui?.portrait;
  assert(viewport.width < viewport.height, `FAIL_NOT_PORTRAIT: browser viewport ${viewport.width}x${viewport.height}`);
  assert(canvasRect.width < canvasRect.height, `FAIL_NOT_PORTRAIT: canvas rect ${canvasRect.width}x${canvasRect.height}`);
  assert(Math.abs(canvasRect.width / canvasRect.height - 9 / 16) < 0.035,
    `FAIL_PORTRAIT_ASPECT: canvas ratio ${canvasRect.width / canvasRect.height}`);
  assert(portrait?.designIsPortrait, 'FAIL_PORTRAIT_DESIGN: design resolution is not portrait');
  assert(portrait?.frameIsPortrait, `FAIL_PORTRAIT_FRAME: frame ${JSON.stringify(runtimeSnapshot.ui.frame)}`);
  assert(portrait?.viewportIsPortrait, `FAIL_PORTRAIT_OVERLAY_ONLY: 3D viewport ${JSON.stringify(portrait?.viewport)}`);
  assert(portrait?.viewportWithinFrame, 'FAIL_PORTRAIT_OVERLAY_ONLY: 3D viewport extends beyond the game frame');
  assert(Math.abs(portrait.viewportRatio - 9 / 16) < 0.035,
    `FAIL_PORTRAIT_OVERLAY_ONLY: 3D viewport ratio ${portrait.viewportRatio}`);
}

function getLogicalPlayerPosition(runtimeSnapshot) {
  const streaming = runtimeSnapshot.world?.streaming;
  assert(streaming?.mode === '2D_GRID', `FAIL_WORLD_MODE: ${JSON.stringify(streaming)}`);
  assert(Number.isFinite(runtimeSnapshot.player?.x) && Number.isFinite(runtimeSnapshot.player?.z),
    `FAIL_WORLD_PLAYER_POSITION: ${JSON.stringify(runtimeSnapshot.player)}`);
  assert(Number.isFinite(streaming.logicalOrigin?.x) && Number.isFinite(streaming.logicalOrigin?.z),
    `FAIL_WORLD_LOGICAL_ORIGIN: ${JSON.stringify(streaming.logicalOrigin)}`);
  return {
    x: runtimeSnapshot.player.x + streaming.logicalOrigin.x,
    z: runtimeSnapshot.player.z + streaming.logicalOrigin.z,
  };
}

/**
 * Checks the live scene's stream state only. It has no setters and never moves
 * the player: traversal below is performed exclusively by real CDP touches.
 */
function validateInfiniteWorldSnapshot(runtimeSnapshot) {
  const world = runtimeSnapshot.world;
  const streaming = world?.streaming;
  assert(streaming?.mode === '2D_GRID', `FAIL_WORLD_MODE: ${JSON.stringify(streaming)}`);
  assert(streaming.cellSize === 64, `FAIL_WORLD_CELL_SIZE: ${streaming.cellSize}`);
  assert(world.activeCellCount === 9 && streaming.activeCellCount === 9,
    `FAIL_WORLD_ACTIVE_COUNT: ${JSON.stringify({ world: world.activeCellCount, stream: streaming.activeCellCount })}`);
  assert(streaming.expectedActiveCellCount === 9,
    `FAIL_WORLD_EXPECTED_COUNT: ${streaming.expectedActiveCellCount}`);
  assert(world.visibleObjectCount > 0, `FAIL_WORLD_EMPTY: ${world.visibleObjectCount}`);
  assert(Array.isArray(streaming.activeCells) && streaming.activeCells.length === 9,
    `FAIL_WORLD_CELL_SNAPSHOT: ${JSON.stringify(streaming.activeCells)}`);

  const expected = new Set();
  for (let x = streaming.currentCell.x - 1; x <= streaming.currentCell.x + 1; x += 1) {
    for (let z = streaming.currentCell.z - 1; z <= streaming.currentCell.z + 1; z += 1) {
      expected.add(`${x}:${z}`);
    }
  }
  const actual = new Set(streaming.activeCells.map((cell) => `${cell.x}:${cell.z}`));
  assert(actual.size === 9 && [...expected].every((cell) => actual.has(cell)),
    `FAIL_WORLD_NOT_3X3: expected=${JSON.stringify([...expected])} actual=${JSON.stringify([...actual])}`);
  return streaming;
}

async function verifyCardinalLongTravel(cdp, page, joystick, direction) {
  const before = await readRuntimeSnapshot(page);
  const beforeStream = validateInfiniteWorldSnapshot(before);
  const beforeLogical = getLogicalPlayerPosition(before);
  const endpoint = {
    x: joystick.x + joystick.maxOffsetX * direction.touchX,
    y: joystick.y + joystick.maxOffsetY * direction.touchY,
  };

  await beginTouchJoystick(cdp, joystick.x, joystick.y, endpoint.x, endpoint.y);
  const engaged = await readRuntimeSnapshot(page);
  const input = engaged.machine.movementInput;
  assert(Math.hypot(input.x, input.y) > 0.5,
    `FAIL_LONG_TOUCH_INPUT_${direction.name}: ${JSON.stringify(input)}`);

  const requiredDistance = 500;
  const deadline = Date.now() + 130000;
  let after = engaged;
  let logical = getLogicalPlayerPosition(after);
  let signedDistance = 0;
  let observedRebase = false;
  while (signedDistance < requiredDistance && Date.now() < deadline) {
    await page.waitForTimeout(1000);
    after = await readRuntimeSnapshot(page);
    const stream = validateInfiniteWorldSnapshot(after);
    logical = getLogicalPlayerPosition(after);
    signedDistance = direction.axis === 'x'
      ? (logical.x - beforeLogical.x) * direction.sign
      : (logical.z - beforeLogical.z) * direction.sign;
    observedRebase ||= stream.rebaseCount > beforeStream.rebaseCount;
  }

  await releaseTouchJoystick(cdp);
  await page.waitForTimeout(500);
  const released = await readRuntimeSnapshot(page);
  const releasedSpeed = Math.hypot(released.machine.velocity.x, released.machine.velocity.z);
  assert(signedDistance >= requiredDistance,
    `FAIL_WORLD_500M_${direction.name}: travelled ${signedDistance.toFixed(2)}m before timeout`);
  assert(observedRebase,
    `FAIL_WORLD_REBASE_${direction.name}: no origin rebase observed while travelling ${signedDistance.toFixed(2)}m`);
  assert(releasedSpeed < 0.06,
    `FAIL_WORLD_LONG_RELEASE_${direction.name}: velocity ${releasedSpeed}`);
  validateInfiniteWorldSnapshot(released);
  return {
    direction: direction.name,
    input,
    travelled: signedDistance,
    logicalStart: beforeLogical,
    logicalEnd: logical,
    rebaseCountBefore: beforeStream.rebaseCount,
    rebaseCountAfter: released.world.streaming.rebaseCount,
    releasedSpeed,
  };
}

/**
 * Navigate to an authored world-space point exclusively through the visible
 * joystick. The QA bridge is read-only: it supplies the live camera basis and
 * position so CDP can issue the same camera-relative touch a player would.
 */
async function driveJoystickToLogicalPoint(cdp, page, joystick, target, label, arrivalRadius = 1.6) {
  const deadline = Date.now() + 30000;
  let bestDistance = Number.POSITIVE_INFINITY;
  let finalSnapshot = await readRuntimeSnapshot(page);
  while (Date.now() < deadline) {
    const current = getLogicalPlayerPosition(finalSnapshot);
    const delta = { x: target.x - current.x, z: target.z - current.z };
    const distance = Math.hypot(delta.x, delta.z);
    bestDistance = Math.min(bestDistance, distance);
    if (distance <= arrivalRadius) return finalSnapshot;

    const cameraRight = finalSnapshot.camera.right;
    const cameraForward = finalSnapshot.camera.forward;
    const inputX = (delta.x * cameraRight.x + delta.z * cameraRight.z) / distance;
    const inputY = (delta.x * cameraForward.x + delta.z * cameraForward.z) / distance;
    const endX = joystick.x + Math.max(-1, Math.min(1, inputX)) * joystick.maxOffsetX * 0.9;
    // Browser Y grows downward while Cocos joystick EventTouch coordinates
    // grow upward, hence the sign inversion for the forward component.
    const endY = joystick.y - Math.max(-1, Math.min(1, inputY)) * joystick.maxOffsetY * 0.9;
    await beginTouchJoystick(cdp, joystick.x, joystick.y, endX, endY);
    // Use the actual visible-stick distance to choose a short final press.
    // A fixed 850ms press is natural for long travel but necessarily overshoots
    // a tight resource cluster on the final approach.
    const stickDistance = Math.min(92, Math.hypot(endX - joystick.x, endY - joystick.y));
    const stickMagnitude = Math.max(0, (stickDistance / 92 - 0.1) / 0.9);
    const estimatedSpeed = Math.max(0.5, 7.5 * stickMagnitude);
    const holdMs = Math.max(120, Math.min(850,
      Math.round(Math.max(0, distance - arrivalRadius * 0.45) / estimatedSpeed * 1000)));
    await page.waitForTimeout(holdMs);
    const engaged = await readRuntimeSnapshot(page);
    assert(Math.hypot(engaged.machine.movementInput.x, engaged.machine.movementInput.y) > 0.1,
      `FAIL_VERTICAL_SLICE_GUIDED_TOUCH_${label}: ${JSON.stringify({
        input: engaged.machine.movementInput,
        gameState: engaged.gameState,
        player: engaged.player,
        touch: engaged.machine.touchDiagnostic,
        activeTouchId: engaged.machine.activeTouchId,
        arena: engaged.arena,
        runtimeInput: engaged.ui?.runtimePageInput,
      })}`);
    await releaseTouchJoystick(cdp);
    await page.waitForTimeout(220);
    finalSnapshot = await readRuntimeSnapshot(page);
  }
  const finalPosition = getLogicalPlayerPosition(finalSnapshot);
  throw new Error(`FAIL_VERTICAL_SLICE_ROUTE_${label}: target=${JSON.stringify(target)} final=${JSON.stringify(finalPosition)} bestDistance=${bestDistance}`);
}

async function runPortraitCase(browser, baseUrl, viewport, report) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 45000 });
    const canvasRect = await page.locator('#GameCanvas').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    const snapshot = await readRuntimeSnapshot(page);
    validatePortraitSnapshot(viewport, canvasRect, snapshot);
    assert(runtimeErrors.length === 0, `Runtime console errors: ${runtimeErrors.join(' | ')}`);

    const screenshot = path.join(evidenceDirectory, `portrait-${viewport.id}-home.png`);
    await page.screenshot({ path: screenshot });
    report.viewports.push({ id: viewport.id, canvasRect, portrait: snapshot.ui.portrait, screenshot });

    if (viewport.id === '390x844') {
      const cdp = await context.newCDPSession(page);
      report.camera = snapshot.camera;
      if (acceptanceScope === 'arena-timer') {
        report.arenaTimer = await verifyArenaTimerExpiry(cdp, page, canvasRect);
        assert(runtimeErrors.length === 0, `Runtime console errors after timer expiry: ${runtimeErrors.join(' | ')}`);
        return;
      }
      const x = canvasRect.left + canvasRect.width * 0.5;
      const homeStartY = canvasRect.top + canvasRect.height * 0.773;
      await dispatchTouchTap(cdp, x, homeStartY);
      await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
      await page.waitForFunction(() => window.__BHR_QA__.snapshot().ui?.modePage?.active === true, undefined, { timeout: 5000 });
      let modeSnapshot = await readRuntimeSnapshot(page);
      assert(modeSnapshot.ui?.modePage?.width > 0 && modeSnapshot.ui?.modePage?.height > 0,
        `FAIL_MODE_PAGE_LAYOUT: ${JSON.stringify(modeSnapshot.ui?.modePage)}`);
      assert(!modeSnapshot.ui?.modeBrawlLocked && !modeSnapshot.ui?.modeLeaderboardLocked,
        `FAIL_MODE_LEGACY_LOCKED_CARDS_PRESENT: ${JSON.stringify({
          brawl: modeSnapshot.ui?.modeBrawlLocked,
          leaderboard: modeSnapshot.ui?.modeLeaderboardLocked,
        })}`);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-mode.png') });

      report.arena = await verifyArenaFlow(cdp, page, canvasRect, modeSnapshot);
      modeSnapshot = await readRuntimeSnapshot(page);
      assert(modeSnapshot.gameState === 'MODE_SELECT' && modeSnapshot.ui?.modePage?.active,
        `FAIL_ARENA_RETURN_TO_MODE: ${JSON.stringify({ gameState: modeSnapshot.gameState, ui: modeSnapshot.ui?.modePage })}`);

      const endlessModeButton = modeSnapshot.ui?.modeEndless;
      const modeDesign = modeSnapshot.ui?.design;
      assert(endlessModeButton?.active && modeDesign?.width > 0 && modeDesign?.height > 0,
        `FAIL_ENDLESS_MODE_BUTTON_LAYOUT: ${JSON.stringify({ endlessModeButton, modeDesign })}`);
      // The page can change visual shelf spacing. Read the actual
      // Creator-saved button transform and still dispatch an ordinary CDP
      // touch at its visible centre rather than retaining a stale hard-coded
      // Y coordinate.
      const endlessX = canvasRect.left + canvasRect.width
        * ((endlessModeButton.x + modeDesign.width * 0.5) / modeDesign.width);
      const endlessY = canvasRect.top + canvasRect.height
        * ((modeDesign.height * 0.5 - endlessModeButton.y) / modeDesign.height);
      await dispatchTouchTap(cdp, endlessX, endlessY);
      try {
        await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });
      } catch (error) {
        const actual = await readRuntimeSnapshot(page);
        throw new Error(`FAIL_MODE_ENDLESS_TOUCH: ${JSON.stringify({
          endlessModeButton,
          modeDesign,
          tap: { x: endlessX, y: endlessY },
          gameState: actual.gameState,
          modePage: actual.ui?.modePage,
          modeEndless: actual.ui?.modeEndless,
          router: actual.ui?.runtimePageInput,
          error: error instanceof Error ? error.message : String(error),
        })}`);
      }
      const gameplaySnapshot = await readRuntimeSnapshot(page);
      // Capture the actual opening composition before any later diagnostic
      // assertion can abort the run. This prevents a previous passing run's
      // PNG being mistaken for evidence of a currently failing build.
      await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-endless-initial.png') });
      assert(gameplaySnapshot.ui.runtimeHUD?.joystick?.active,
        `FAIL_VISIBLE_JOYSTICK: ${JSON.stringify(gameplaySnapshot.ui.runtimeHUD)}`);
      const visualMaterials = gameplaySnapshot.machine?.visualMaterials || [];
      const activeVisualMaterials = visualMaterials.filter((renderer) => renderer.active);
      assert(activeVisualMaterials.length > 0,
        'FAIL_MACHINE_VISUAL_MATERIALS: no real MeshRenderer diagnostics were exposed');
      // Hidden future-level assemblies have no native sub-model yet. Only the
      // activated player assembly can issue a frame draw, so only it belongs
      // to this runtime material invariant.
      assert(activeVisualMaterials.every((renderer) => renderer.slots?.every((slot) => slot.valid && slot.effect)),
        `FAIL_MACHINE_VISUAL_MATERIALS: ${JSON.stringify(activeVisualMaterials)}`);
      report.machineMaterialDiagnostics = activeVisualMaterials;
      report.infiniteWorld.initial = validateInfiniteWorldSnapshot(gameplaySnapshot);
      const openingWorldVisuals = gameplaySnapshot.world?.streaming?.visualDiagnostics || [];
      const grassVisuals = openingWorldVisuals.filter((row) => row.name === 'DistrictGround');
      assert(grassVisuals.length === 4 && grassVisuals.every((row) => row.active
        && row.renderers?.some((renderer) => renderer.materials?.every((material) => material.valid && material.effect))),
      `FAIL_OPENING_GRASS_RENDERER: ${JSON.stringify(openingWorldVisuals)}`);
      report.openingWorldVisuals = openingWorldVisuals;
      const dynamicBefore = gameplaySnapshot.world?.streaming?.dynamicVehicles || [];
      assert(dynamicBefore.length > 0,
        `FAIL_DYNAMIC_VEHICLE_MISSING: ${JSON.stringify(gameplaySnapshot.world?.streaming)}`);
      await page.waitForTimeout(1000);
      const dynamicAfterSnapshot = await readRuntimeSnapshot(page);
      const dynamicAfter = dynamicAfterSnapshot.world?.streaming?.dynamicVehicles || [];
      const movingVehicle = dynamicBefore.map((beforeVehicle) => {
        const afterVehicle = dynamicAfter.find((candidate) => candidate.id === beforeVehicle.id);
        return afterVehicle ? {
          id: beforeVehicle.id,
          kind: beforeVehicle.kind,
          state: afterVehicle.state,
          distance: Math.hypot(afterVehicle.x - beforeVehicle.x, afterVehicle.z - beforeVehicle.z),
        } : null;
      }).find((vehicle) => vehicle && vehicle.distance > 0.2);
      assert(movingVehicle,
        `FAIL_DYNAMIC_VEHICLE_NOT_MOVING: before=${JSON.stringify(dynamicBefore)} after=${JSON.stringify(dynamicAfter)}`);
      report.dynamicVehicles = { before: dynamicBefore, after: dynamicAfter, movingVehicle };
      assert(gameplaySnapshot.machine.level === 1 && gameplaySnapshot.machine.maxTier === 1,
        `FAIL_VERTICAL_SLICE_INITIAL_LV1: ${JSON.stringify(gameplaySnapshot.machine)}`);
      assert(Math.abs(gameplaySnapshot.machine.suctionRadius - 2.4) < 0.01,
        `FAIL_VERTICAL_SLICE_INITIAL_RADIUS: ${JSON.stringify(gameplaySnapshot.machine)}`);
      report.verticalSlice = {
        initial: {
          level: gameplaySnapshot.machine.level,
          mass: gameplaySnapshot.machine.mass,
          suctionRadius: gameplaySnapshot.machine.suctionRadius,
          maxTier: gameplaySnapshot.machine.maxTier,
          absorbedTiers: gameplaySnapshot.session.absorbedTiers,
        },
        evolved: null,
      };

      if (acceptanceScope === 'pages') {
        report.runtimePages = await verifyRuntimePages(cdp, page, canvasRect);
        assert(runtimeErrors.length === 0, `Runtime console errors after page navigation: ${runtimeErrors.join(' | ')}`);
        return;
      }

      // Must touch the centre of the editor-saved lower-right joystick, rather
      // than an arbitrary lower-right input region.
      const joystickStartX = canvasRect.left + canvasRect.width * 0.822;
      const joystickStartY = canvasRect.top + canvasRect.height * 0.867;
      const joystickOffsetX = canvasRect.width * 0.11;
      const joystickOffsetY = canvasRect.height * 0.05;
      const joystick = {
        x: joystickStartX,
        y: joystickStartY,
        offsetX: joystickOffsetX,
        offsetY: joystickOffsetY,
        // Long-travel touches begin at the visible joystick centre, then use
        // all available in-canvas distance to request a full, real input.
        maxOffsetX: Math.min(120, canvasRect.width - (joystickStartX - canvasRect.left) - 3),
        maxOffsetY: Math.min(120, canvasRect.top + canvasRect.height - joystickStartY - 3),
      };
      const joystickDirections = [
        { name: 'up', x: 0, y: -1 },
        { name: 'down', x: 0, y: 1 },
        { name: 'left', x: -1, y: 0 },
        { name: 'right', x: 1, y: 0 },
        { name: 'up-left', x: -0.707, y: -0.707 },
        { name: 'up-right', x: 0.707, y: -0.707 },
        { name: 'down-left', x: -0.707, y: 0.707 },
        { name: 'down-right', x: 0.707, y: 0.707 },
      ];

      report.touch = [];
      for (const direction of joystickDirections) {
        const before = await readRuntimeSnapshot(page);
        await beginTouchJoystick(
          cdp,
          joystickStartX,
          joystickStartY,
          joystickStartX + joystickOffsetX * direction.x,
          joystickStartY + joystickOffsetY * direction.y,
        );
        const engaged = await readRuntimeSnapshot(page);
        const input = engaged.machine.movementInput;
        assert(Math.hypot(input.x, input.y) > 0.1,
          `FAIL_TOUCH_INPUT_${direction.name.toUpperCase()}: ${JSON.stringify({
            input,
            activeTouchId: engaged.machine.activeTouchId,
            touchDiagnostic: engaged.machine.touchDiagnostic,
            controller: engaged.machine.controller,
            gameState: engaged.gameState,
            viewport: engaged.ui?.portrait?.viewport,
          })}`);
        await page.waitForTimeout(1000);
        const after = await readRuntimeSnapshot(page);
        const delta = {
          x: after.player.x - before.player.x,
          z: after.player.z - before.player.z,
        };
        const cameraRight = before.camera.right;
        const cameraForward = before.camera.forward;
        const intended = {
          x: cameraRight.x * input.x + cameraForward.x * input.y,
          z: cameraRight.z * input.x + cameraForward.z * input.y,
        };
        const intendedLength = Math.hypot(intended.x, intended.z);
        assert(intendedLength > 0.01, `FAIL_CAMERA_RELATIVE_${direction.name.toUpperCase()}: ${JSON.stringify(intended)}`);
        const projectedDistance = (delta.x * intended.x + delta.z * intended.z) / intendedLength;
        await releaseTouchJoystick(cdp);
        await page.waitForTimeout(450);
        const released = await readRuntimeSnapshot(page);
        const releasedSpeed = Math.hypot(released.machine.velocity.x, released.machine.velocity.z);
        report.touch.push({ direction: direction.name, input, projectedDistance, delta, releasedSpeed });
        assert(projectedDistance > 0.08,
          `FAIL_TOUCH_PORTRAIT_${direction.name.toUpperCase()}: projected distance ${projectedDistance}`);
        assert(releasedSpeed < 0.06,
          `FAIL_TOUCH_RELEASE_${direction.name.toUpperCase()}: velocity ${releasedSpeed}`);
      }
      report.multiTouch = await verifySecondaryTouchDoesNotHijack(cdp, page, canvasRect, joystick);

      // The first-cell route proves the actual player-facing tier flow before
      // the subsequent 500m world traversal moves away from its tutorial
      // district. Every movement below is a raw CDP touch; it never calls a
      // gameplay setter, teleport, or mass grant.
      // 2.3m is deliberately inside the real LV1 2.4m lock radius, while
      // remaining outside the item's centre. It avoids asking a 0.85s held
      // human joystick sample to stop at an artificial point precision.
      await driveJoystickToLogicalPoint(cdp, page, joystick, { x: 0, z: -8 }, 'T2_LOCK', 2.3);
      await page.waitForTimeout(700);
      const lockedT2Snapshot = await readRuntimeSnapshot(page);
      const lockedT2 = lockedT2Snapshot.objects.find((object) => object.tier === 2 && object.lockVisible);
      assert(lockedT2,
        `FAIL_VERTICAL_SLICE_T2_LOCK: ${JSON.stringify(lockedT2Snapshot.objects.filter((object) => object.tier === 2))}`);

      await driveJoystickToLogicalPoint(cdp, page, joystick, { x: 0, z: 5.2 }, 'T1_CLUSTER', 0.9);
      await page.waitForTimeout(3200);
      const upgradedSnapshot = await readRuntimeSnapshot(page);
      assert(upgradedSnapshot.machine.level >= 2 && upgradedSnapshot.machine.maxTier >= 2,
        `FAIL_VERTICAL_SLICE_NO_LV2_AFTER_T1: ${JSON.stringify({
          machine: upgradedSnapshot.machine,
          player: upgradedSnapshot.player,
          starterObjects: upgradedSnapshot.objects.filter((object) => object.tier === 1
            && Math.abs(object.x) < 2 && object.z > 3 && object.z < 7),
        })}`);
      assert((upgradedSnapshot.session.absorbedTiers?.[1] || 0) > 0,
        `FAIL_VERTICAL_SLICE_NO_T1_CLUSTER_ABSORPTION: ${JSON.stringify(upgradedSnapshot.session?.absorbedTiers)}`);

      await driveJoystickToLogicalPoint(cdp, page, joystick, { x: 0, z: -8 }, 'T2_UNLOCK', 2.3);
      await page.waitForTimeout(1200);
      const unlockedT2Snapshot = await readRuntimeSnapshot(page);
      assert((unlockedT2Snapshot.session.absorbedTiers?.[2] || 0) > 0,
        `FAIL_VERTICAL_SLICE_T2_NOT_ABSORBED_AFTER_LV2: ${JSON.stringify({
          machine: unlockedT2Snapshot.machine,
          absorbedTiers: unlockedT2Snapshot.session?.absorbedTiers,
          t2: unlockedT2Snapshot.objects.filter((object) => object.tier === 2),
        })}`);

      report.infiniteWorld.cardinal500m = [];
      const cardinalDirections = [
        { name: 'north', axis: 'z', sign: -1, touchX: 0, touchY: -1 },
        { name: 'south', axis: 'z', sign: 1, touchX: 0, touchY: 1 },
        { name: 'west', axis: 'x', sign: -1, touchX: -1, touchY: 0 },
        { name: 'east', axis: 'x', sign: 1, touchX: 1, touchY: 0 },
      ];
      for (const direction of cardinalDirections) {
        report.infiniteWorld.cardinal500m.push(
          await verifyCardinalLongTravel(cdp, page, joystick, direction),
        );
      }
      assert(runtimeErrors.length === 0, `Runtime console errors after touch: ${runtimeErrors.join(' | ')}`);
      const evolvedSnapshot = await readRuntimeSnapshot(page);
      const absorbedTiers = evolvedSnapshot.session?.absorbedTiers || {};
      assert(evolvedSnapshot.machine.level >= 2 && evolvedSnapshot.machine.maxTier >= 2,
        `FAIL_VERTICAL_SLICE_NO_LV2: ${JSON.stringify({ machine: evolvedSnapshot.machine, absorbedTiers })}`);
      assert(evolvedSnapshot.machine.suctionRadius >= 3.4,
        `FAIL_VERTICAL_SLICE_RADIUS_NOT_EXPANDED: ${JSON.stringify(evolvedSnapshot.machine)}`);
      assert((absorbedTiers[1] || 0) > 0,
        `FAIL_VERTICAL_SLICE_NO_T1_ABSORPTION: ${JSON.stringify(absorbedTiers)}`);
      assert((absorbedTiers[2] || 0) > 0,
        `FAIL_VERTICAL_SLICE_NO_T2_ABSORPTION: ${JSON.stringify({ machine: evolvedSnapshot.machine, absorbedTiers })}`);
      report.verticalSlice.evolved = {
        level: evolvedSnapshot.machine.level,
        mass: evolvedSnapshot.machine.mass,
        suctionRadius: evolvedSnapshot.machine.suctionRadius,
        maxTier: evolvedSnapshot.machine.maxTier,
        absorbed: evolvedSnapshot.session.absorbed,
        absorbedTiers,
      };
      await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-gameplay.png') });
      report.runtimePages = await verifyRuntimePages(cdp, page, canvasRect);
      assert(runtimeErrors.length === 0, `Runtime console errors after page navigation: ${runtimeErrors.join(' | ')}`);
    }
  } finally {
    // Preserve browser-side diagnostics even if startup fails before the QA
    // bridge becomes available. This report is evidence, never a pass proxy.
    if (runtimeErrors.length > 0) {
      report.consoleErrors = [...new Set([...(report.consoleErrors || []), ...runtimeErrors])];
    }
    await context.close();
  }
}

const report = {
  status: 'RUNNING',
  scope: acceptanceScope,
  runner: 'official-cocos-cli + Playwright CDP touch',
  build: null,
  viewports: [],
  touch: [],
  multiTouch: null,
  camera: null,
  infiniteWorld: { initial: null, cardinal500m: [] },
  dynamicVehicles: null,
  machineMaterialDiagnostics: null,
  openingWorldVisuals: null,
  verticalSlice: null,
  runtimePages: null,
  arena: null,
  arenaTimer: null,
  consoleErrors: [],
  failures: [],
};

let server;
let browser;
try {
  console.log('[acceptance:v2] Building Web Mobile with Cocos Creator 3.8.3...');
  report.build = await buildCocosWebMobile();
  assert(existsSync(path.join(buildDirectory, 'index.html')), `Missing official Cocos build output: ${buildDirectory}`);

  server = await createStaticServer(buildDirectory);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });

  const targetViewports = acceptanceScope === 'pages' || acceptanceScope === 'arena-timer'
    ? requiredPortraitViewports.filter((viewport) => viewport.id === '390x844')
    : requiredPortraitViewports;
  for (const viewport of targetViewports) {
    console.log(`[acceptance:v2] Verifying ${viewport.id}...`);
    await runPortraitCase(browser, baseUrl, viewport, report);
  }
  report.status = 'PASS';
  console.log('[acceptance:v2] PASS: real portrait Cocos runtime and CDP touch verified.');
} catch (error) {
  report.status = 'FAIL';
  report.failures.push(error instanceof Error ? error.message : String(error));
  console.error(`[acceptance:v2] FAIL: ${report.failures[0]}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[acceptance:v2] Report: ${reportPath}`);
}
