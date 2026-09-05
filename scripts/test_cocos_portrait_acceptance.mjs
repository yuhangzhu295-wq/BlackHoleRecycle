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
const acceptanceScope = ['full', 'pages', 'arena-timer', 'network', 'regions', 'progression'].includes(requestedAcceptanceScope)
  ? requestedAcceptanceScope
  : 'full';
// Preserve each independently-runnable acceptance scope. The canonical report
// remains the most recent run for quick inspection, while a scoped copy keeps
// a six-region proof from being overwritten by the longer full regression.
const scopedReportPath = path.join(evidenceDirectory, `acceptance-report-${acceptanceScope}.json`);
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

const networkProbePort = 25784;
const networkProbeEndpoint = `http://127.0.0.1:${networkProbePort}`;

/** Start the shipped arena service; this never substitutes a mocked room. */
function startNetworkProbeServer() {
  const child = spawn(process.execPath, ['src/index.mjs', String(networkProbePort)], {
    cwd: path.join(repoRoot, 'arena-server'),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return { child, output: () => output };
}

async function waitForNetworkProbeServer(probe) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${networkProbeEndpoint}/health`);
      if (response.ok) return;
    } catch {
      // The real Colyseus process is still binding its HTTP/WebSocket port.
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`Arena network probe server did not become healthy. ${probe.output()}`);
}

async function stopNetworkProbeServer(probe) {
  if (!probe || probe.child.exitCode !== null) return;
  const exited = new Promise((resolve) => probe.child.once('exit', resolve));
  probe.child.kill('SIGTERM');
  await Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Arena network probe server did not stop.')), 3_000)),
  ]);
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
 * The game root itself creates the Colyseus client from the WebGL bundle.
 * Only server-replicated data is observed here: no test setter may create a
 * player, mass value, pickup or room state.
 */
async function verifyNetworkProbe(cdp, page, canvasRect) {
  try {
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().network?.status === 'CONNECTED', undefined, { timeout: 10_000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_COCOS_COLYSEUS_CONNECT: ${JSON.stringify({ network: actual.network, error: String(error) })}`);
  }
  const snapshot = await readRuntimeSnapshot(page);
  const network = snapshot.network;
  assert(network?.lastError === null, `FAIL_COCOS_COLYSEUS_ERROR: ${JSON.stringify(network)}`);
  assert(network?.snapshot?.localSessionId, `FAIL_COCOS_COLYSEUS_SESSION: ${JSON.stringify(network)}`);
  assert(network.snapshot.players.some((player) => player.id === network.snapshot.localSessionId),
    `FAIL_COCOS_COLYSEUS_LOCAL_PLAYER: ${JSON.stringify(network.snapshot)}`);
  assert(network.snapshot.pickups.length >= 16,
    `FAIL_COCOS_COLYSEUS_OPENING_PICKUPS: ${JSON.stringify(network.snapshot)}`);

  // Enter the visible Arena route through the actual saved controls. In probe
  // mode this must create the Cocos renderer-only replica rather than falling
  // back to the local 1v7 authority or forwarding input while showing Endless.
  const home = await readRuntimeSnapshot(page);
  const start = pointForVisibleNode(canvasRect, home, home.ui?.start, 'NETWORK_HOME_START');
  await dispatchTouchTap(cdp, start.x, start.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5_000 });
  const mode = await readRuntimeSnapshot(page);
  const arena = pointForVisibleNode(canvasRect, mode, mode.ui?.modeArena, 'NETWORK_MODE_ARENA');
  await dispatchTouchTap(cdp, arena.x, arena.y);
  try {
    await page.waitForFunction(() => {
      const actual = window.__BHR_QA__.snapshot();
      return actual.gameState === 'NETWORK_ARENA'
        && actual.ui?.arenaHUD?.root?.active === true
        && actual.network?.replica?.visiblePlayers === actual.network?.snapshot?.players?.length;
    }, undefined, { timeout: 8_000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_COCOS_COLYSEUS_RENDERER_ENTER: ${JSON.stringify({
      gameState: actual.gameState,
      network: actual.network,
      arena: actual.arena,
      error: String(error),
    })}`);
  }
  const playing = await readRuntimeSnapshot(page);
  const localBefore = playing.network?.snapshot?.players?.find((player) => player.id === playing.network?.snapshot?.localSessionId);
  assert(localBefore, `FAIL_COCOS_COLYSEUS_MISSING_LOCAL_BEFORE_INPUT: ${JSON.stringify(playing.network)}`);
  try {
    await page.waitForFunction(() => {
      const actual = window.__BHR_QA__.snapshot();
      const local = actual.network?.snapshot?.players?.find((player) => player.id === actual.network?.snapshot?.localSessionId);
      return local?.level === 2 && actual.machine?.level === 2 && actual.machine?.maxTier === 2;
    }, undefined, { timeout: 5_000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_COCOS_COLYSEUS_SERVER_EVOLUTION_REPLICA: ${JSON.stringify({
      machine: actual.machine,
      network: actual.network,
      error: String(error),
    })}`);
  }
  const evolved = await readRuntimeSnapshot(page);
  const evolvedLocal = evolved.network?.snapshot?.players?.find((player) => player.id === evolved.network?.snapshot?.localSessionId);
  assert(evolvedLocal?.mass >= 900 && evolvedLocal.suctionRadius >= 3.4,
    `FAIL_COCOS_COLYSEUS_SERVER_LV2_RULES: ${JSON.stringify({ evolvedLocal, network: evolved.network })}`);
  assert(playing.network?.replica?.visiblePickups > 0,
    `FAIL_COCOS_COLYSEUS_PICKUP_REPLICA: ${JSON.stringify(playing.network)}`);
  assert(Math.hypot(
    playing.player.x - localBefore.x,
    playing.player.z - localBefore.z,
  ) < 0.08, `FAIL_COCOS_COLYSEUS_LOCAL_RENDER_POSITION: ${JSON.stringify({ player: playing.player, localBefore, network: playing.network })}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-network-arena.png') });
  const joystick = pointForVisibleNode(canvasRect, playing, playing.ui?.arenaHUD?.joystick, 'NETWORK_ARENA_JOYSTICK');
  await beginTouchJoystick(cdp, joystick.x, joystick.y, joystick.x + 38, joystick.y - 18);
  try {
    await page.waitForFunction((before) => {
      const current = window.__BHR_QA__.snapshot().network?.snapshot;
      const local = current?.players?.find((player) => player.id === current.localSessionId);
      return !!local
        && local.lastInputSequence > before.sequence
        && Math.hypot(local.x - before.x, local.z - before.z) > 0.35;
    }, {
      x: localBefore.x,
      z: localBefore.z,
      sequence: localBefore.lastInputSequence,
    }, { timeout: 8_000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_COCOS_COLYSEUS_INPUT_FORWARD: ${JSON.stringify({
      before: localBefore,
      network: actual.network,
      playerInput: actual.machine?.movementInput,
      error: String(error),
    })}`);
  } finally {
    await releaseTouchJoystick(cdp);
  }
  await page.waitForFunction(() => {
    const actual = window.__BHR_QA__.snapshot();
    const local = actual.network?.snapshot?.players?.find((player) => player.id === actual.network?.snapshot?.localSessionId);
    return !!local && Math.hypot(actual.player.x - local.x, actual.player.z - local.z) < 0.12;
  }, undefined, { timeout: 5_000 });
  const after = await readRuntimeSnapshot(page);
  const localAfter = after.network.snapshot.players.find((player) => player.id === after.network.snapshot.localSessionId);
  return { ...after.network, inputForwarding: { before: localBefore, after: localAfter } };
}

/**
 * Convert a Creator UI node's actual world centre into a browser touch point.
 * Cocos' SHOW_ALL viewport can be vertically letterboxed inside GameCanvas,
 * so a node's local `x/y` is not enough once it is nested under SafeAreaRoot.
 * The returned point still drives CDP touch exactly as a phone player would.
 */
function pointForVisibleNode(canvasRect, snapshot, node, name) {
  const ui = snapshot?.ui;
  assert(node?.active && node?.screen,
    `FAIL_VISIBLE_NODE_INACTIVE_${name}: ${JSON.stringify(node)}`);
  assert(Number.isFinite(node.screen.x) && Number.isFinite(node.screen.y),
    `FAIL_VISIBLE_NODE_LAYOUT_${name}: ${JSON.stringify({ ui, node })}`);

  // UI Camera output is the actual screen-space centre after Creator applies
  // the current resolution policy. It remains correct when FIXED_WIDTH makes
  // the visible portrait area taller than the nominal 720×1280 design size.
  return {
    x: canvasRect.left + canvasRect.width * node.screen.x,
    y: canvasRect.top + canvasRect.height * node.screen.y,
  };
}

/**
 * The Home skin card must cause a real, persisted selection change through
 * the same visible CDP touch as a phone player. The QA bridge only reads the
 * resulting save snapshot and input diagnostic.
 */
async function verifyHomeSkin(cdp, page, canvasRect) {
  const before = await readRuntimeSnapshot(page);
  const skin = before.ui?.skin;
  assert(skin?.active && skin?.interactable === true,
    `FAIL_HOME_SKIN_NOT_INTERACTABLE: ${JSON.stringify(skin)}`);
  const point = pointForVisibleNode(canvasRect, before, skin, 'HOME_SKIN');
  const previousSkinId = before.save?.skinId;
  await dispatchTouchTap(cdp, point.x, point.y);
  try {
    await page.waitForFunction((previous) => {
      const snapshot = window.__BHR_QA__.snapshot();
      return snapshot.gameState === 'HOME'
        && snapshot.save?.skinId !== previous;
    }, previousSkinId, { timeout: 5000 });
  } catch (error) {
    const afterTimeout = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_HOME_SKIN_SELECTION: ${JSON.stringify({
      point,
      beforeSave: before.save,
      afterSave: afterTimeout.save,
      gameState: afterTimeout.gameState,
      router: afterTimeout.ui?.runtimePageInput,
      error: error instanceof Error ? error.message : String(error),
    })}`);
  }
  const after = await readRuntimeSnapshot(page);
  assert(after.save?.skinId !== previousSkinId,
    `FAIL_HOME_SKIN_NOT_SAVED: ${JSON.stringify({ before: previousSkinId, after: after.save?.skinId })}`);
  assert(after.ui?.machine?.active === true && after.ui?.machine?.interactable === true && after.ui?.settings?.active === false,
    `FAIL_HOME_ACTION_VISIBILITY: ${JSON.stringify({ machine: after.ui?.machine, settings: after.ui?.settings })}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-home-skin.png') });
  return { point, previousSkinId, selectedSkinId: after.save?.skinId };
}

/**
 * The green Home machine card must lead to a real, Creator-saved status page.
 * This is driven by ordinary touch and confirms values originate from the
 * active BlackHoleMachine/configuration, rather than a decorative mock page.
 */
async function verifyMachineInfo(cdp, page, canvasRect) {
  const before = await readRuntimeSnapshot(page);
  const machineButton = before.ui?.machine;
  assert(machineButton?.active && machineButton?.interactable === true,
    `FAIL_HOME_MACHINE_NOT_INTERACTABLE: ${JSON.stringify({ machineButton })}`);
  const open = pointForVisibleNode(canvasRect, before, machineButton, 'MACHINE_INFO_OPEN');
  await dispatchTouchTap(cdp, open.x, open.y);
  try {
    await page.waitForFunction(() => {
      const snapshot = window.__BHR_QA__.snapshot();
      return snapshot.gameState === 'MACHINE_INFO' && snapshot.ui?.machineInfo?.active === true;
    }, undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_MACHINE_INFO_OPEN: ${JSON.stringify({ open, actual: actual.ui, state: actual.gameState, error: String(error) })}`);
  }
  const opened = await readRuntimeSnapshot(page);
  assert(opened.ui?.machineInfoData?.currentName?.includes(`LV.${opened.machine?.level}`)
    && opened.ui?.machineInfoData?.currentRadius?.includes(String(opened.machine?.suctionRadius?.toFixed(1)))
    && opened.ui?.machineInfoData?.currentTier === `T${opened.machine?.maxTier}`,
  `FAIL_MACHINE_INFO_LIVE_DATA: ${JSON.stringify({ machine: opened.machine, data: opened.ui?.machineInfoData })}`);
  assert(opened.player?.isDragging === false && opened.machine?.velocity?.x === 0 && opened.machine?.velocity?.z === 0,
    `FAIL_MACHINE_INFO_INPUT_NOT_PAUSED: ${JSON.stringify({ player: opened.player, machine: opened.machine })}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-machine-info.png') });
  const close = pointForVisibleNode(canvasRect, opened, opened.ui?.machineInfoBack, 'MACHINE_INFO_BACK');
  await dispatchTouchTap(cdp, close.x, close.y);
  try {
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_MACHINE_INFO_BACK: ${JSON.stringify({ close, state: actual.gameState, ui: actual.ui, error: String(error) })}`);
  }
  const closed = await readRuntimeSnapshot(page);
  assert(closed.ui?.home?.active && closed.ui?.machine?.active,
    `FAIL_MACHINE_INFO_RETURN_HOME: ${JSON.stringify({ state: closed.gameState, ui: closed.ui })}`);
  return { open, close, data: opened.ui?.machineInfoData };
}

/**
 * Verify the editor-saved formal runtime pages through real touch events.
 * The bridge remains read-only: all state transitions originate from the
 * same visible Buttons a player taps on a phone.
 */
async function verifyRuntimePages(cdp, page, canvasRect) {
  const before = await readRuntimeSnapshot(page);
  const pause = pointForVisibleNode(canvasRect, before, before.ui?.runtimeHUD?.pauseButton, 'PAUSE');

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
  const resume = pointForVisibleNode(canvasRect, paused, paused.ui?.formalPages?.pauseResume, 'RESUME');
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
  const settle = pointForVisibleNode(canvasRect, pausedForSettlement, pausedForSettlement.ui?.formalPages?.pauseSettle, 'SETTLE');
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
  const arenaButton = modeSnapshot.ui?.modeArena;
  const arenaPoint = pointForVisibleNode(canvasRect, modeSnapshot, arenaButton, 'MODE_ARENA');
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
  assert((initial.arena?.combatWarmupRemainingSeconds || 0) > 12,
    `FAIL_ARENA_WARMUP_NOT_STARTED: ${JSON.stringify(initial.arena)}`);
  assert(initial.ui?.arenaHUD?.joystick?.active,
    `FAIL_ARENA_VISIBLE_JOYSTICK: ${JSON.stringify(initial.ui?.arenaHUD)}`);
  const localNameplate = initial.ui?.arenaHUD?.nameplates?.find((entry) => entry.id === 'local-player');
  assert(localNameplate?.active && localNameplate.label === '我',
    `FAIL_ARENA_LOCAL_NAMEPLATE: ${JSON.stringify(initial.ui?.arenaHUD?.nameplates)}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-arena.png') });

  // Give real bots time to navigate toward and physically absorb world items.
  // No timer or leaderboard entry is faked: the next assertion requires an
  // actual bot's consumed counter and mass to advance from live world objects.
  const collectionDeadline = Date.now() + 18000;
  let collected = initial;
  let hunter = null;
  let defeated = null;
  let observedProtectedOpening = false;
  while (Date.now() < collectionDeadline) {
    // Poll quickly enough to capture the real 2.5-second revive phase rather
    // than allowing an autonomous respawn to erase its visible evidence.
    await page.waitForTimeout(120);
    collected = await readRuntimeSnapshot(page);
    if ((collected.arena?.combatWarmupRemainingSeconds || 0) > 0) {
      observedProtectedOpening = true;
      assert(collected.arena?.eliminationCount === 0 && collected.arena?.localAlive === true,
        `FAIL_ARENA_WARMUP_COMBAT: ${JSON.stringify(collected.arena)}`);
    }
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
  assert(observedProtectedOpening, `FAIL_ARENA_WARMUP_NOT_OBSERVED: ${JSON.stringify(collected.arena)}`);
  assert(hunter, `FAIL_ARENA_NO_STRONG_BOT_FOR_REAL_CONSUME: ${JSON.stringify(collected.arena)}`);
  assert(defeated, `FAIL_ARENA_CONSUME_PLAYER_TIMEOUT: ${JSON.stringify(collected.arena)}`);
  assert(defeated.gameState === 'REVIVING' && defeated.arena?.localAlive === false,
    `FAIL_ARENA_CONSUME_PLAYER: ${JSON.stringify({ gameState: defeated.gameState, arena: defeated.arena })}`);
  assert(defeated.ui?.formalPages?.revive?.active,
    `FAIL_ARENA_REVIVE_PAGE: ${JSON.stringify(defeated.ui?.formalPages)}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-revive.png') });

  const revive = pointForVisibleNode(canvasRect, defeated, defeated.ui?.formalPages?.reviveNow, 'REVIVE_NOW');
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
  const joystick = pointForVisibleNode(canvasRect, respawned, arenaJoystick, 'ARENA_JOYSTICK');
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
  const arenaPause = pointForVisibleNode(canvasRect, respawned, respawned.ui?.arenaHUD?.pauseButton, 'ARENA_PAUSE');
  await dispatchTouchTap(cdp, arenaPause.x, arenaPause.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PAUSED', undefined, { timeout: 5000 });
  const paused = await readRuntimeSnapshot(page);
  const settle = pointForVisibleNode(canvasRect, paused, paused.ui?.formalPages?.pauseSettle, 'ARENA_SETTLE');
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

  const home = pointForVisibleNode(canvasRect, settled, settled.ui?.formalPages?.settlementHome, 'ARENA_SETTLEMENT_HOME');
  await dispatchTouchTap(cdp, home.x, home.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 5000 });
  const homeSnapshot = await readRuntimeSnapshot(page);
  const start = pointForVisibleNode(canvasRect, homeSnapshot, homeSnapshot.ui?.start, 'ARENA_HOME_START');
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
  const homeSnapshot = await readRuntimeSnapshot(page);
  const startButton = homeSnapshot.ui?.start;
  const homeStart = pointForVisibleNode(canvasRect, homeSnapshot, startButton, 'ARENA_TIMER_HOME_START');
  await dispatchTouchTap(cdp, homeStart.x, homeStart.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
  const modeSnapshot = await readRuntimeSnapshot(page);
  const arenaButton = modeSnapshot.ui?.modeArena;
  const arenaPoint = pointForVisibleNode(canvasRect, modeSnapshot, arenaButton, 'ARENA_TIMER_MODE_ARENA');
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
  assert(Math.abs(canvasRect.width - viewport.width) < 1 && Math.abs(canvasRect.height - viewport.height) < 1,
    `FAIL_FULL_SCREEN_CANVAS: canvas=${JSON.stringify(canvasRect)} viewport=${JSON.stringify(viewport)}`);
  assert(portrait?.designIsPortrait, 'FAIL_PORTRAIT_DESIGN: design resolution is not portrait');
  assert(portrait?.frameIsPortrait, `FAIL_PORTRAIT_FRAME: frame ${JSON.stringify(runtimeSnapshot.ui.frame)}`);
  assert(portrait?.viewportIsPortrait, `FAIL_PORTRAIT_OVERLAY_ONLY: 3D viewport ${JSON.stringify(portrait?.viewport)}`);
  assert(portrait?.viewportWithinFrame, 'FAIL_PORTRAIT_OVERLAY_ONLY: 3D viewport extends beyond the game frame');
  assert(Math.abs(portrait.viewportRatio - viewport.width / viewport.height) < 0.035,
    `FAIL_VIEWPORT_ADAPTATION: expected=${viewport.width / viewport.height} actual=${portrait.viewportRatio}`);
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
async function driveJoystickToLogicalPoint(cdp, page, joystick, target, label, arrivalRadius = 1.6, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
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
  // A physical drag can cross the pickup radius between two diagnostic
  // samples and then coast slightly beyond it before the next sample.  The
  // route genuinely reached the target in that case; the next assertion
  // still requires the live Cocos compression system to absorb the item.
  if (bestDistance <= arrivalRadius) return finalSnapshot;
  throw new Error(`FAIL_VERTICAL_SLICE_ROUTE_${label}: target=${JSON.stringify(target)} final=${JSON.stringify(finalPosition)} bestDistance=${bestDistance}`);
}

/**
 * A real touch traversal through every production progression region.  The
 * checkpoints intentionally sit well inside the 3-cell-wide theme rings, so
 * an origin-rebase boundary cannot be mistaken for a successful visit.  Each
 * assertion joins the live theme id, its mapped visual district, and an
 * imported landmark from the active Cocos cell; no test code changes a region
 * or instantiates an environment node.
 */
async function verifyProgressionRegions(cdp, page, canvasRect) {
  const route = [
    { id: 'bedroom', name: '卧室杂物区', district: 'RESIDENTIAL', landmark: 'ResidentialHouseWest', distance: 0 },
    { id: 'warehouse', name: '废弃仓库区', district: 'WAREHOUSE', landmark: 'WarehouseContainerWest', distance: 172 },
    { id: 'supermarket', name: '生鲜超市区', district: 'SUPERMARKET', landmark: 'SupermarketBuilding', distance: 364 },
    { id: 'parking', name: '露天停车场', district: 'PARKING', landmark: 'ParkingSedanWest', distance: 556 },
    { id: 'construction', name: '施工工地', district: 'CONSTRUCTION', landmark: 'ConstructionBulldozer', distance: 748 },
    { id: 'city', name: '未来都市区', district: 'DOWNTOWN', landmark: 'DowntownShopWest', distance: 940 },
  ];
  const captures = [];
  const initial = await readRuntimeSnapshot(page);
  const joystickCenter = pointForVisibleNode(canvasRect, initial, initial.ui?.runtimeHUD?.joystick, 'REGION_JOYSTICK');
  const joystick = {
    ...joystickCenter,
    // The lower-right control can be close to the canvas edge in a tall phone
    // frame. Derive the valid drag distance from its live screen position;
    // never send an out-of-frame coordinate to CDP.
    maxOffsetX: Math.min(120, canvasRect.width - (joystickCenter.x - canvasRect.left) - 3),
    maxOffsetY: Math.min(120, canvasRect.top + canvasRect.height - joystickCenter.y - 3),
  };
  const start = getLogicalPlayerPosition(initial);
  let latest = initial;

  for (const checkpoint of route) {
    const travelledBefore = -(getLogicalPlayerPosition(latest).z - start.z);
    if (travelledBefore < checkpoint.distance) {
      await beginTouchJoystick(cdp, joystick.x, joystick.y, joystick.x, joystick.y - joystick.maxOffsetY);
      const deadline = Date.now() + 38_000;
      let travelled = travelledBefore;
      while (travelled < checkpoint.distance && Date.now() < deadline) {
        await page.waitForTimeout(400);
        latest = await readRuntimeSnapshot(page);
        validateInfiniteWorldSnapshot(latest);
        travelled = -(getLogicalPlayerPosition(latest).z - start.z);
      }
      await releaseTouchJoystick(cdp);
      await page.waitForTimeout(500);
      latest = await readRuntimeSnapshot(page);
      const releasedDistance = -(getLogicalPlayerPosition(latest).z - start.z);
      assert(releasedDistance >= checkpoint.distance,
        `FAIL_REGION_TRAVEL_${checkpoint.id.toUpperCase()}: travelled ${releasedDistance.toFixed(2)}m, expected ${checkpoint.distance}m`);
      assert(Math.hypot(latest.machine.velocity.x, latest.machine.velocity.z) < 0.06,
        `FAIL_REGION_RELEASE_${checkpoint.id.toUpperCase()}: ${JSON.stringify(latest.machine.velocity)}`);
    }

    const streaming = validateInfiniteWorldSnapshot(latest);
    assert(latest.world?.currentRegion === checkpoint.id && streaming.currentRegion === checkpoint.id,
      `FAIL_REGION_THEME_${checkpoint.id.toUpperCase()}: ${JSON.stringify({ world: latest.world, streaming })}`);
    assert(streaming.currentRegionName === checkpoint.name,
      `FAIL_REGION_NAME_${checkpoint.id.toUpperCase()}: ${JSON.stringify(streaming)}`);
    assert(streaming.currentDistrictKind === checkpoint.district,
      `FAIL_REGION_DISTRICT_${checkpoint.id.toUpperCase()}: ${JSON.stringify(streaming)}`);
    assert(Array.isArray(streaming.visualDiagnostics)
      && streaming.visualDiagnostics.some((entry) => entry?.name === checkpoint.landmark),
    `FAIL_REGION_LANDMARK_${checkpoint.id.toUpperCase()}: expected ${checkpoint.landmark}, actual=${JSON.stringify(streaming.visualDiagnostics)}`);
    const directory = path.join(evidenceDirectory, 'regions');
    mkdirSync(directory, { recursive: true });
    const screenshot = path.join(directory, `region-${checkpoint.id}.png`);
    await page.screenshot({ path: screenshot });
    captures.push({ ...checkpoint, screenshot, travelled: -(getLogicalPlayerPosition(latest).z - start.z) });
  }

  assert(latest.world?.streaming?.rebaseCount > 0,
    `FAIL_REGION_ROUTE_REBASE: ${JSON.stringify(latest.world?.streaming)}`);
  return { captures, start, final: getLogicalPlayerPosition(latest), rebaseCount: latest.world.streaming.rebaseCount };
}

/**
 * Drives only the visible portrait joystick through the full five-level
 * production progression. Each consumed item is a streamed, Creator-rendered
 * `CompressibleObject`; the helper has no setter for level, mass, object
 * state, region, or position. The interior checkpoints keep all 3×3 active
 * cells in the intended district, so the record proves the progression
 * resource semantics instead of merely crossing a themed border.
 */
async function verifyFiveLevelProgression(cdp, page, joystick) {
  const stages = [
    { level: 3, region: 'warehouse', district: 'WAREHOUSE', point: { x: 0, z: -235 }, part: 'CompressionChamber' },
    { level: 4, region: 'supermarket', district: 'SUPERMARKET', point: { x: 0, z: -427 }, part: 'GravityWingLeft' },
    { level: 5, region: 'parking', district: 'PARKING', point: { x: 0, z: -619 }, part: 'SingularityFrame' },
  ];
  const record = { levels: [], finalTier5Absorption: null };

  const collectUntil = async (stage) => {
    const deadline = Date.now() + 150_000;
    const absorbed = [];
    let latest = await readRuntimeSnapshot(page);
    while (latest.machine.level < stage.level && Date.now() < deadline) {
      const streaming = validateInfiniteWorldSnapshot(latest);
      const prefix = `cluster_${stage.district}_`;
      const origin = streaming.logicalOrigin;
      const player = getLogicalPlayerPosition(latest);
      const candidates = latest.objects
        .filter((object) => object.state === 'IDLE'
          && object.tier <= latest.machine.maxTier
          && String(object.runtimeId || '').startsWith(prefix))
        .map((object) => ({
          ...object,
          logicalX: object.x + origin.x,
          logicalZ: object.z + origin.z,
        }))
        .sort((a, b) => Math.hypot(a.logicalX - player.x, a.logicalZ - player.z)
          - Math.hypot(b.logicalX - player.x, b.logicalZ - player.z));
      assert(candidates.length > 0,
        `FAIL_FULL_PROGRESSION_NO_ELIGIBLE_${stage.region.toUpperCase()}: ${JSON.stringify({ machine: latest.machine, player, streaming, objects: latest.objects })}`);
      const target = candidates[0];
      const massBefore = latest.machine.mass;
      await driveJoystickToLogicalPoint(cdp, page, joystick, { x: target.logicalX, z: target.logicalZ }, `LV${stage.level}_${target.type}`, Math.max(1.0, latest.machine.suctionRadius * 0.62));
      await page.waitForTimeout(900);
      latest = await readRuntimeSnapshot(page);
      const disappeared = !latest.objects.some((object) => object.runtimeId === target.runtimeId && object.state === 'IDLE');
      assert(disappeared || latest.machine.mass > massBefore,
        `FAIL_FULL_PROGRESSION_NO_ABSORPTION_${stage.region.toUpperCase()}: ${JSON.stringify({ target, massBefore, latest: latest.machine })}`);
      absorbed.push({ runtimeId: target.runtimeId, type: target.type, tier: target.tier, massBefore, massAfter: latest.machine.mass });
    }
    assert(latest.machine.level >= stage.level,
      `FAIL_FULL_PROGRESSION_LEVEL_${stage.level}: ${JSON.stringify({ stage, machine: latest.machine, absorbed })}`);
    const activeParts = latest.machine.visualMaterials
      .filter((renderer) => renderer.active && String(renderer.path).includes(`MachineVisual_LV${stage.level}/`));
    assert(activeParts.some((renderer) => String(renderer.path).includes(stage.part)
      && renderer.slots?.every((slot) => slot.valid && slot.effect)),
    `FAIL_FULL_PROGRESSION_VISUAL_LV${stage.level}: ${JSON.stringify(activeParts)}`);
    record.levels.push({
      ...stage,
      mass: latest.machine.mass,
      maxTier: latest.machine.maxTier,
      absorbed,
      activePart: stage.part,
    });
    return latest;
  };

  // The public opening tutorial supplies real T1 and T2 object clusters.
  // Reuse it rather than injecting a test-only mass grant.
  let latest = await driveJoystickToLogicalPoint(cdp, page, joystick, { x: 0, z: 5.2 }, 'FULL_PROGRESSION_T1', 1.6);
  await page.waitForTimeout(3600);
  latest = await readRuntimeSnapshot(page);
  assert(latest.machine.level >= 2 && latest.machine.maxTier >= 2,
    `FAIL_FULL_PROGRESSION_LV2: ${JSON.stringify(latest.machine)}`);
  latest = await driveJoystickToLogicalPoint(cdp, page, joystick, { x: 0, z: -8 }, 'FULL_PROGRESSION_T2', 2.3);
  await page.waitForTimeout(1400);
  latest = await readRuntimeSnapshot(page);
  assert((latest.session.absorbedTiers?.[2] || 0) > 0,
    `FAIL_FULL_PROGRESSION_T2: ${JSON.stringify(latest.session?.absorbedTiers)}`);
  record.levels.push({ level: 2, region: 'bedroom', district: 'RESIDENTIAL', mass: latest.machine.mass, maxTier: latest.machine.maxTier, absorbed: [], activePart: 'MagneticTurbineLeft' });

  for (const stage of stages) {
    latest = await driveJoystickToLogicalPoint(cdp, page, joystick, stage.point, `FULL_PROGRESSION_${stage.region.toUpperCase()}`, 3.2, 70_000);
    await page.waitForTimeout(500);
    latest = await readRuntimeSnapshot(page);
    const streaming = validateInfiniteWorldSnapshot(latest);
    assert(latest.world?.currentRegion === stage.region && streaming.currentDistrictKind === stage.district,
      `FAIL_FULL_PROGRESSION_REGION_${stage.region.toUpperCase()}: ${JSON.stringify({ world: latest.world, streaming })}`);
    latest = await collectUntil(stage);
  }

  // LV5 must consume an actual T5 city asset; a visual-only parked car or a
  // synthetic mass total is not accepted as terminal progression evidence.
  latest = await driveJoystickToLogicalPoint(cdp, page, joystick, { x: 0, z: -1003 }, 'FULL_PROGRESSION_CITY', 3.2, 70_000);
  await page.waitForTimeout(500);
  latest = await readRuntimeSnapshot(page);
  const cityStream = validateInfiniteWorldSnapshot(latest);
  assert(latest.world?.currentRegion === 'city' && cityStream.currentDistrictKind === 'DOWNTOWN',
    `FAIL_FULL_PROGRESSION_CITY_REGION: ${JSON.stringify({ world: latest.world, cityStream })}`);
  const tier5Before = latest.session.absorbedTiers?.[5] || 0;
  const cityOrigin = cityStream.logicalOrigin;
  const cityPlayer = getLogicalPlayerPosition(latest);
  const tier5 = latest.objects
    .filter((object) => object.state === 'IDLE' && object.tier === 5 && String(object.runtimeId || '').startsWith('cluster_DOWNTOWN_'))
    .map((object) => ({ ...object, logicalX: object.x + cityOrigin.x, logicalZ: object.z + cityOrigin.z }))
    .sort((a, b) => Math.hypot(a.logicalX - cityPlayer.x, a.logicalZ - cityPlayer.z)
      - Math.hypot(b.logicalX - cityPlayer.x, b.logicalZ - cityPlayer.z))[0];
  assert(tier5, `FAIL_FULL_PROGRESSION_CITY_T5_MISSING: ${JSON.stringify(latest.objects)}`);
  await driveJoystickToLogicalPoint(cdp, page, joystick, { x: tier5.logicalX, z: tier5.logicalZ }, `FULL_PROGRESSION_T5_${tier5.type}`, Math.max(1.5, latest.machine.suctionRadius * 0.62));
  await page.waitForTimeout(1500);
  latest = await readRuntimeSnapshot(page);
  assert((latest.session.absorbedTiers?.[5] || 0) > tier5Before,
    `FAIL_FULL_PROGRESSION_T5_ABSORPTION: ${JSON.stringify({ tier5, before: tier5Before, after: latest.session?.absorbedTiers, machine: latest.machine })}`);
  record.finalTier5Absorption = { runtimeId: tier5.runtimeId, type: tier5.type, mass: latest.machine.mass, absorbedTiers: latest.session.absorbedTiers };
  return record;
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

    // Preserve the read-only initial layout snapshot with the evidence so
    // visual QA can audit actual safe-area placement rather than estimating
    // positions from screenshots.
    if (viewport.id === '390x844') report.initialLayout = snapshot.ui;

    const screenshot = path.join(evidenceDirectory, `portrait-${viewport.id}-home.png`);
    await page.screenshot({ path: screenshot });
    report.viewports.push({ id: viewport.id, canvasRect, portrait: snapshot.ui.portrait, screenshot });

    if (viewport.id === '390x844') {
      const cdp = await context.newCDPSession(page);
      report.camera = snapshot.camera;
      if (acceptanceScope === 'network') {
        report.network = await verifyNetworkProbe(cdp, page, canvasRect);
        assert(runtimeErrors.length === 0, `Runtime console errors after Colyseus connection: ${runtimeErrors.join(' | ')}`);
        return;
      }
      if (acceptanceScope === 'arena-timer') {
        report.arenaTimer = await verifyArenaTimerExpiry(cdp, page, canvasRect);
        assert(runtimeErrors.length === 0, `Runtime console errors after timer expiry: ${runtimeErrors.join(' | ')}`);
        return;
      }
      if (acceptanceScope === 'regions') {
        const startButton = snapshot.ui?.start;
        const start = pointForVisibleNode(canvasRect, snapshot, startButton, 'REGION_HOME_START');
        await dispatchTouchTap(cdp, start.x, start.y);
        await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
        const mode = await readRuntimeSnapshot(page);
        const endless = pointForVisibleNode(canvasRect, mode, mode.ui?.modeEndless, 'REGION_MODE_ENDLESS');
        await dispatchTouchTap(cdp, endless.x, endless.y);
        await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });
        report.regions = await verifyProgressionRegions(cdp, page, canvasRect);
        assert(runtimeErrors.length === 0, `Runtime console errors after six-region touch traversal: ${runtimeErrors.join(' | ')}`);
        return;
      }
      if (acceptanceScope === 'progression') {
        const startButton = snapshot.ui?.start;
        const start = pointForVisibleNode(canvasRect, snapshot, startButton, 'FULL_PROGRESSION_HOME_START');
        await dispatchTouchTap(cdp, start.x, start.y);
        await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
        const mode = await readRuntimeSnapshot(page);
        const endless = pointForVisibleNode(canvasRect, mode, mode.ui?.modeEndless, 'FULL_PROGRESSION_MODE_ENDLESS');
        await dispatchTouchTap(cdp, endless.x, endless.y);
        await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });
        const gameplay = await readRuntimeSnapshot(page);
        const joystickCenter = pointForVisibleNode(canvasRect, gameplay, gameplay.ui?.runtimeHUD?.joystick, 'FULL_PROGRESSION_JOYSTICK');
        const joystick = {
          x: joystickCenter.x,
          y: joystickCenter.y,
          maxOffsetX: Math.min(120, canvasRect.width - (joystickCenter.x - canvasRect.left) - 3),
          maxOffsetY: Math.min(120, canvasRect.top + canvasRect.height - joystickCenter.y - 3),
        };
        report.fullProgression = await verifyFiveLevelProgression(cdp, page, joystick);
        await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-lv5-city.png') });
        assert(runtimeErrors.length === 0, `Runtime console errors after LV1-to-LV5 touch progression: ${runtimeErrors.join(' | ')}`);
        return;
      }
      report.homeSkin = await verifyHomeSkin(cdp, page, canvasRect);
      report.machineInfo = await verifyMachineInfo(cdp, page, canvasRect);
      const homeSnapshot = await readRuntimeSnapshot(page);
      const startButton = homeSnapshot.ui?.start;
      const start = pointForVisibleNode(canvasRect, homeSnapshot, startButton, 'HOME_START');
      await dispatchTouchTap(cdp, start.x, start.y);
      try {
        await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
        await page.waitForFunction(() => window.__BHR_QA__.snapshot().ui?.modePage?.active === true, undefined, { timeout: 5000 });
      } catch (error) {
        const actual = await readRuntimeSnapshot(page);
        throw new Error(`FAIL_HOME_START_TOUCH: ${JSON.stringify({ startButton, tap: start, state: actual.gameState, ui: actual.ui, error: String(error) })}`);
      }
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
      const endless = pointForVisibleNode(canvasRect, modeSnapshot, endlessModeButton, 'MODE_ENDLESS');
      await dispatchTouchTap(cdp, endless.x, endless.y);
      try {
        await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });
      } catch (error) {
        const actual = await readRuntimeSnapshot(page);
        throw new Error(`FAIL_MODE_ENDLESS_TOUCH: ${JSON.stringify({
          endlessModeButton,
          tap: endless,
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
      const constructionLandmark = gameplaySnapshot.world?.streaming?.constructionLandmark;
      assert(constructionLandmark?.loadState === 'READY' && constructionLandmark.visible === true,
        `FAIL_CC0_CONSTRUCTION_LANDMARK: ${JSON.stringify(constructionLandmark)}`);
      report.constructionLandmark = constructionLandmark;
      const openingWorldVisuals = gameplaySnapshot.world?.streaming?.visualDiagnostics || [];
      const grassVisuals = openingWorldVisuals.filter((row) => row.name === 'DistrictGround');
      assert(grassVisuals.length === 4 && grassVisuals.every((row) => row.active
        && row.renderers?.some((renderer) => renderer.materials?.every((material) => material.valid && material.effect))),
      `FAIL_OPENING_GRASS_RENDERER: ${JSON.stringify(openingWorldVisuals)}`);
      report.openingWorldVisuals = openingWorldVisuals;
      const dynamicBefore = gameplaySnapshot.world?.streaming?.dynamicVehicles || [];
      assert(dynamicBefore.length > 0,
        `FAIL_DYNAMIC_VEHICLE_MISSING: ${JSON.stringify(gameplaySnapshot.world?.streaming)}`);
      assert(dynamicBefore.every((vehicle) => vehicle.routeLength >= 4),
        `FAIL_DYNAMIC_VEHICLE_ROUTE_MISSING: ${JSON.stringify(dynamicBefore)}`);
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
      // The fastest real sedan reaches its first road corner in six seconds.
      // Observe the Cocos runtime rather than inferring a turn from source.
      await page.waitForTimeout(6200);
      const dynamicTurnSnapshot = await readRuntimeSnapshot(page);
      const dynamicTurned = dynamicTurnSnapshot.world?.streaming?.dynamicVehicles || [];
      const turningVehicle = dynamicTurned.map((afterVehicle) => {
        const beforeVehicle = dynamicBefore.find((candidate) => candidate.id === afterVehicle.id);
        return beforeVehicle ? {
          id: afterVehicle.id,
          kind: afterVehicle.kind,
          turnCount: afterVehicle.turnCount,
          initialTurnCount: beforeVehicle.turnCount,
        } : null;
      }).find((vehicle) => vehicle && vehicle.turnCount > vehicle.initialTurnCount);
      assert(turningVehicle,
        `FAIL_DYNAMIC_VEHICLE_ROUTE_TURN: before=${JSON.stringify(dynamicBefore)} after=${JSON.stringify(dynamicTurned)}`);
      report.dynamicVehicles = { before: dynamicBefore, after: dynamicAfter, afterTurn: dynamicTurned, movingVehicle, turningVehicle };
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
      const joystickCenter = pointForVisibleNode(
        canvasRect,
        gameplaySnapshot,
        gameplaySnapshot.ui?.runtimeHUD?.joystick,
        'ENDLESS_JOYSTICK',
      );
      const joystickStartX = joystickCenter.x;
      const joystickStartY = joystickCenter.y;
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

      // 1.6m is still safely inside the LV1 2.4m suction radius. It gives
      // touch samples enough room to settle without treating a physics-free
      // target coordinate as a gameplay condition. The following assertions
      // still require actual T1 absorption, feedback, and LV2 evolution.
      await driveJoystickToLogicalPoint(cdp, page, joystick, { x: 0, z: 5.2 }, 'T1_CLUSTER', 1.6);
      // The cluster can complete its real attraction animation while the
      // physical drag is still held. Capture immediately after release; a
      // later 1.6s wait is deliberately long enough for short feedback to
      // have expired and would not be an honest visibility check.
      const feedbackSnapshot = await readRuntimeSnapshot(page);
      const visibleEndlessFeedback = feedbackSnapshot.ui?.pickupFeedback?.endless || null;
      assert((visibleEndlessFeedback?.activeCount || 0) > 0,
        `FAIL_ABSORB_FEEDBACK_NOT_VISIBLE: ${JSON.stringify(feedbackSnapshot.ui?.pickupFeedback)}`);
      report.verticalSlice.pickupFeedback = feedbackSnapshot.ui?.pickupFeedback || null;
      await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-absorb-feedback.png') });
      await page.waitForTimeout(3200);
      const upgradedSnapshot = await readRuntimeSnapshot(page);
      assert(upgradedSnapshot.machine.level >= 2 && upgradedSnapshot.machine.maxTier >= 2,
        `FAIL_VERTICAL_SLICE_NO_LV2_AFTER_T1: ${JSON.stringify({
          machine: upgradedSnapshot.machine,
          player: upgradedSnapshot.player,
          starterObjects: upgradedSnapshot.objects.filter((object) => object.tier === 1
            && Math.abs(object.x) < 2 && object.z > 3 && object.z < 7),
        })}`);
      const lv2Visuals = upgradedSnapshot.machine.visualMaterials || [];
      const activeLv2Turbines = lv2Visuals.filter((renderer) => renderer.active
        && String(renderer.path).includes('MachineVisual_LV2/MagneticTurbine'));
      const activeHybridChassis = lv2Visuals.filter((renderer) => renderer.active
        && String(renderer.path).includes('MachineVisual_LV2/CrawlerChassis'));
      assert(activeLv2Turbines.length >= 2,
        `FAIL_LV2_TURBINES_NOT_RENDERED: ${JSON.stringify(lv2Visuals)}`);
      assert(activeHybridChassis.length === 0,
        `FAIL_HYBRID_CHASSIS_OBSCURES_BLACK_HOLE: ${JSON.stringify(activeHybridChassis)}`);
      assert((upgradedSnapshot.session.absorbedTiers?.[1] || 0) > 0,
        `FAIL_VERTICAL_SLICE_NO_T1_CLUSTER_ABSORPTION: ${JSON.stringify(upgradedSnapshot.session?.absorbedTiers)}`);
      const endlessFeedback = upgradedSnapshot.ui?.pickupFeedback?.endless || null;
      assert((endlessFeedback?.emittedCount || 0) > 0 && /^\+\d+$/.test(endlessFeedback?.lastText || ''),
        `FAIL_ABSORB_FEEDBACK_NOT_EMITTED: ${JSON.stringify(upgradedSnapshot.ui?.pickupFeedback)}`);

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
  constructionLandmark: null,
  openingWorldVisuals: null,
  verticalSlice: null,
  runtimePages: null,
  arena: null,
  arenaTimer: null,
  network: null,
  regions: null,
  fullProgression: null,
  consoleErrors: [],
  failures: [],
};

let server;
let browser;
let networkProbeServer;
try {
  console.log('[acceptance:v2] Building Web Mobile with Cocos Creator 3.8.3...');
  report.build = await buildCocosWebMobile();
  assert(existsSync(path.join(buildDirectory, 'index.html')), `Missing official Cocos build output: ${buildDirectory}`);

  if (acceptanceScope === 'network') {
    networkProbeServer = startNetworkProbeServer();
    await waitForNetworkProbeServer(networkProbeServer);
  }
  server = await createStaticServer(buildDirectory);
  const address = server.address();
  const baseUrl = acceptanceScope === 'network'
    ? `http://127.0.0.1:${address.port}/?arenaProbe=${encodeURIComponent(networkProbeEndpoint)}`
    : `http://127.0.0.1:${address.port}/`;
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });

  const targetViewports = acceptanceScope === 'pages' || acceptanceScope === 'arena-timer' || acceptanceScope === 'network' || acceptanceScope === 'regions' || acceptanceScope === 'progression'
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
  await stopNetworkProbeServer(networkProbeServer);
  const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(reportPath, serializedReport, 'utf8');
  writeFileSync(scopedReportPath, serializedReport, 'utf8');
  console.log(`[acceptance:v2] Report: ${reportPath}`);
  console.log(`[acceptance:v2] Scoped report: ${scopedReportPath}`);
}
