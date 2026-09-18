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
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const cocosProject = path.join(repoRoot, 'cocos');
const creatorExe = process.env.COCOS_CREATOR_EXE || 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\CocosCreator.exe';
const buildDirectory = path.join(cocosProject, 'build', 'web-mobile');
// Runtime evidence is intentionally local by default. Keep only deliberately
// curated, final evidence in cocos/docs/evidence/final/; repeated regression
// runs must not pollute source control with stale screenshots and reports.
const evidenceDirectory = path.resolve(
  process.env.BHR_ARTIFACTS_DIR || path.join(repoRoot, 'artifacts', 'qa', 'portrait'),
);
const reportPath = path.join(evidenceDirectory, 'acceptance-report.json');
// `npm run acceptance:v2 -- --scope=pages` is the ergonomic local visual-QA
// command. Keep the environment variable for CI, but do not silently ignore
// the documented CLI form and accidentally start the long 500m traversal.
const requestedAcceptanceScope = process.argv.find((argument) => argument.startsWith('--scope='))?.slice('--scope='.length)
  || process.env.BHR_ACCEPTANCE_SCOPE
  || 'full';
const acceptanceScope = ['full', 'pages', 'arena', 'arena-ai', 'revive', 'settlement', 'ui-full-flow', 'skins', 'skin-unlock', 'arena-timer', 'network', 'regions', 'progression', 'cell-lifecycle', 'golden-city', 'save-resume'].includes(requestedAcceptanceScope)
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

/** Decode the RGBA/RGB Playwright PNG without adding a runtime dependency. */
function inspectHotMagentaPixels(pngPath) {
  const png = readFileSync(pngPath);
  assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    `FAIL_SCREENSHOT_PNG_SIGNATURE: ${pngPath}`);
  let cursor = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat = [];
  while (cursor < png.length) {
    const length = png.readUInt32BE(cursor);
    const type = png.toString('ascii', cursor + 4, cursor + 8);
    const dataStart = cursor + 8;
    const dataEnd = dataStart + length;
    if (type === 'IHDR') {
      width = png.readUInt32BE(dataStart);
      height = png.readUInt32BE(dataStart + 4);
      assert(png[dataStart + 8] === 8 && (png[dataStart + 9] === 2 || png[dataStart + 9] === 6),
        `FAIL_SCREENSHOT_PNG_FORMAT: bitDepth=${png[dataStart + 8]} colorType=${png[dataStart + 9]}`);
      colorType = png[dataStart + 9];
    } else if (type === 'IDAT') {
      idat.push(png.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    cursor = dataEnd + 4;
  }
  assert(width > 0 && height > 0 && colorType >= 0, `FAIL_SCREENSHOT_PNG_HEADER: ${pngPath}`);
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(idat));
  assert(raw.length === height * (stride + 1), `FAIL_SCREENSHOT_PNG_DATA: ${pngPath}`);
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  let rawOffset = 0;
  let magentaPixels = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = raw[rawOffset++];
    for (let column = 0; column < stride; column += 1) {
      const value = raw[rawOffset++];
      const left = column >= bytesPerPixel ? current[column - bytesPerPixel] : 0;
      const up = previous[column];
      const upLeft = column >= bytesPerPixel ? previous[column - bytesPerPixel] : 0;
      if (filter === 0) current[column] = value;
      else if (filter === 1) current[column] = (value + left) & 0xff;
      else if (filter === 2) current[column] = (value + up) & 0xff;
      else if (filter === 3) current[column] = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        current[column] = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      } else {
        throw new Error(`FAIL_SCREENSHOT_PNG_FILTER: ${filter}`);
      }
    }
    for (let pixel = 0; pixel < stride; pixel += bytesPerPixel) {
      const red = current[pixel];
      const green = current[pixel + 1];
      const blue = current[pixel + 2];
      if (red >= 210 && green <= 70 && blue >= 180) magentaPixels += 1;
    }
    current.copy(previous);
  }
  return { width, height, magentaPixels, magentaRatio: magentaPixels / (width * height) };
}

function assertNoLargeHotMagentaSurface(pngPath) {
  const inspection = inspectHotMagentaPixels(pngPath);
  assert(inspection.magentaRatio < 0.03,
    `FAIL_HOT_MAGENTA_SURFACE: ${JSON.stringify({ pngPath, ...inspection })}`);
  return inspection;
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

async function moveTouchJoystick(cdp, endX, endY) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: endX, y: endY }],
  });
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
  const reconnectIdentity = after.network.snapshot.localSessionId;
  const reconnectState = {
    mass: localAfter.mass,
    level: localAfter.level,
    collected: localAfter.collected,
    kills: localAfter.kills,
    sequence: localAfter.lastInputSequence,
  };

  // Interrupt only the browser transport. The Colyseus process keeps running,
  // so this verifies its actual reservation and restoration path rather than a
  // new-room join or a fabricated state handoff.
  let transportRestored = false;
  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
      connectionType: 'none',
    });
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().network?.status === 'RECONNECTING', undefined, { timeout: 8_000 });
    const dropped = await readRuntimeSnapshot(page);
    const droppedLocal = dropped.network?.snapshot?.players?.find((player) => player.id === reconnectIdentity);
    assert(droppedLocal && !droppedLocal.isBot,
      `FAIL_COCOS_COLYSEUS_RECONNECT_HUMAN_SLOT: ${JSON.stringify(dropped.network)}`);

    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: 'none',
    });
    transportRestored = true;
    await page.waitForFunction((expected) => {
      const network = window.__BHR_QA__.snapshot().network;
      const local = network?.snapshot?.players?.find((player) => player.id === expected.sessionId);
      return network?.status === 'CONNECTED'
        && network?.lastError === null
        && network?.snapshot?.localSessionId === expected.sessionId
        && local?.isBot === false
        && local?.mass === expected.mass
        && local?.level === expected.level
        && local?.collected === expected.collected
        && local?.kills === expected.kills;
    }, { sessionId: reconnectIdentity, ...reconnectState }, { timeout: 10_000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_COCOS_COLYSEUS_RECONNECT: ${JSON.stringify({ network: actual.network, error: String(error) })}`);
  } finally {
    if (!transportRestored) {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
        connectionType: 'none',
      });
    }
  }
  const reconnected = await readRuntimeSnapshot(page);
  const localReconnected = reconnected.network.snapshot.players.find((player) => player.id === reconnectIdentity);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-network-reconnected.png') });
  const reconnectJoystick = pointForVisibleNode(canvasRect, reconnected, reconnected.ui?.arenaHUD?.joystick, 'NETWORK_ARENA_RECONNECTED_JOYSTICK');
  await beginTouchJoystick(cdp, reconnectJoystick.x, reconnectJoystick.y, reconnectJoystick.x - 36, reconnectJoystick.y + 20);
  try {
    await page.waitForFunction((before) => {
      const current = window.__BHR_QA__.snapshot().network?.snapshot;
      const local = current?.players?.find((player) => player.id === current.localSessionId);
      return !!local
        && local.lastInputSequence > before.sequence
        && Math.hypot(local.x - before.x, local.z - before.z) > 0.35;
    }, {
      x: localReconnected.x,
      z: localReconnected.z,
      sequence: reconnectState.sequence,
    }, { timeout: 8_000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_COCOS_COLYSEUS_RECONNECT_INPUT: ${JSON.stringify({ before: localReconnected, network: actual.network, error: String(error) })}`);
  } finally {
    await releaseTouchJoystick(cdp);
  }
  const afterReconnectInput = await readRuntimeSnapshot(page);

  // Finish through the same visible pause/settle controls used by a player.
  // The first tap sends a real `forfeit` message; the next server snapshot
  // drives GameManager's one-shot settlement and persists only its ledger.
  const pause = pointForVisibleNode(canvasRect, after, after.ui?.arenaHUD?.pauseButton, 'NETWORK_ARENA_PAUSE');
  await dispatchTouchTap(cdp, pause.x, pause.y);
  await page.waitForFunction(() => {
    const actual = window.__BHR_QA__.snapshot();
    return actual.gameState === 'PAUSED' && actual.ui?.formalPages?.pause?.active === true;
  }, undefined, { timeout: 5_000 });
  const paused = await readRuntimeSnapshot(page);
  const settle = pointForVisibleNode(canvasRect, paused, paused.ui?.formalPages?.pauseSettle, 'NETWORK_ARENA_SETTLE');
  await dispatchTouchTap(cdp, settle.x, settle.y);
  try {
    await page.waitForFunction(() => {
      const actual = window.__BHR_QA__.snapshot();
      return actual.gameState === 'SETTLEMENT'
        && actual.uiScreen === 'Settlement'
        && actual.network?.snapshot?.phase === 'FINISHED'
        && actual.network?.snapshot?.finishReason === 'FORFEIT';
    }, undefined, { timeout: 8_000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_COCOS_COLYSEUS_SETTLEMENT: ${JSON.stringify({
      pause,
      settle,
      gameState: actual.gameState,
      uiScreen: actual.uiScreen,
      network: actual.network,
      arena: actual.arena,
      error: String(error),
    })}`);
  }
  const settled = await readRuntimeSnapshot(page);
  assert(settled.arena?.reason === 'FORFEIT',
    `FAIL_COCOS_COLYSEUS_SETTLEMENT_REASON: ${JSON.stringify(settled.arena)}`);
  assert((settled.arena?.settlementReward?.coins || 0) > 0,
    `FAIL_COCOS_COLYSEUS_SETTLEMENT_REWARD: ${JSON.stringify(settled.arena?.settlementReward)}`);
  assert(settled.save?.coins === (after.save?.coins || 0) + settled.arena.settlementReward.coins,
    `FAIL_COCOS_COLYSEUS_SETTLEMENT_NOT_SAVED: ${JSON.stringify({ before: after.save, after: settled.save, reward: settled.arena.settlementReward })}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-network-settlement.png') });
  return {
    ...settled.network,
    inputForwarding: { before: localBefore, after: localAfter },
    reconnect: {
      sessionId: reconnectIdentity,
      before: reconnectState,
      after: localReconnected,
      postReconnectInput: afterReconnectInput.network.snapshot.players.find((player) => player.id === reconnectIdentity),
    },
    settlement: settled.arena,
    pause,
    settle,
  };
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
 * The Home skin card opens its Creator-saved selection page. A visible touch
 * equips the second free skin, persists it, and proves a locked paid card
 * rejects a player with no earned coins. The QA bridge is read-only and never
 * modifies the save, coins, or selection.
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
    await page.waitForFunction(() => {
      const snapshot = window.__BHR_QA__.snapshot();
      return snapshot.gameState === 'SKIN_SELECTION'
        && snapshot.ui?.skinSelection?.active === true;
    }, undefined, { timeout: 5000 });
  } catch (error) {
    const afterTimeout = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_HOME_SKIN_PAGE_OPEN: ${JSON.stringify({
      point,
      beforeSave: before.save,
      afterSave: afterTimeout.save,
      gameState: afterTimeout.gameState,
      router: afterTimeout.ui?.runtimePageInput,
      error: error instanceof Error ? error.message : String(error),
    })}`);
  }
  const opened = await readRuntimeSnapshot(page);
  assert(opened.player?.isDragging === false && opened.machine?.velocity?.x === 0 && opened.machine?.velocity?.z === 0,
    `FAIL_SKIN_PAGE_INPUT_NOT_PAUSED: ${JSON.stringify({ player: opened.player, machine: opened.machine })}`);
  assert(opened.ui?.skinSelectionButtons?.length === 5
    && opened.ui?.skinSelectionData?.previewName
    && opened.ui?.skinSelectionBack?.active,
  `FAIL_SKIN_PAGE_SERIALIZED_LAYOUT: ${JSON.stringify(opened.ui?.skinSelection)}`);

  const freeButton = pointForVisibleNode(canvasRect, opened, opened.ui?.skinSelectionButtons?.[1], 'SKIN_FREE_SELECT');
  await dispatchTouchTap(cdp, freeButton.x, freeButton.y);
  try {
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().save?.skinId === 'skin_violet_vortex', undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_SKIN_FREE_SELECT: ${JSON.stringify({ freeButton, previousSkinId, save: actual.save, ui: actual.ui?.skinSelectionData, error: String(error) })}`);
  }
  const selected = await readRuntimeSnapshot(page);
  // Cocos' browser bridge serializes the string-array backing store as opaque
  // entries on some WebGL builds, so ownership is verified by the persisted
  // selected id plus the controller's own live ownership state instead of
  // treating that transport quirk as a gameplay failure.
  assert(selected.save?.skinId !== previousSkinId
    && selected.save?.skinId === 'skin_violet_vortex'
    && selected.ui?.skinSelectionData?.states?.[1] === '已装备',
  `FAIL_SKIN_FREE_NOT_PERSISTED: ${JSON.stringify({ before: previousSkinId, after: selected.save, data: selected.ui?.skinSelectionData })}`);

  const lockedButton = pointForVisibleNode(canvasRect, selected, selected.ui?.skinSelectionButtons?.[2], 'SKIN_LOCKED_SELECT');
  const coinsBeforeLockedTap = selected.save?.coins;
  await dispatchTouchTap(cdp, lockedButton.x, lockedButton.y);
  try {
    await page.waitForFunction(() => String(window.__BHR_QA__.snapshot().ui?.skinSelectionData?.status || '').includes('金币不足'), undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_SKIN_LOCKED_FEEDBACK: ${JSON.stringify({ lockedButton, save: actual.save, data: actual.ui?.skinSelectionData, error: String(error) })}`);
  }
  const locked = await readRuntimeSnapshot(page);
  assert(locked.save?.skinId === 'skin_violet_vortex'
    && locked.save?.coins === coinsBeforeLockedTap,
  `FAIL_SKIN_LOCKED_NOT_PROTECTED: ${JSON.stringify({ beforeCoins: coinsBeforeLockedTap, after: locked.save })}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-skin-selection.png') });

  const back = pointForVisibleNode(canvasRect, locked, locked.ui?.skinSelectionBack, 'SKIN_PAGE_BACK');
  await dispatchTouchTap(cdp, back.x, back.y);
  try {
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_SKIN_PAGE_BACK: ${JSON.stringify({ back, state: actual.gameState, ui: actual.ui, error: String(error) })}`);
  }
  const after = await readRuntimeSnapshot(page);
  assert(after.ui?.home?.active && after.ui?.machine?.active && after.ui?.settings?.active === false,
    `FAIL_HOME_ACTION_VISIBILITY: ${JSON.stringify({ home: after.ui?.home, machine: after.ui?.machine, settings: after.ui?.settings })}`);
  return { point, freeButton, lockedButton, back, previousSkinId, selectedSkinId: after.save?.skinId, coinsBeforeLockedTap };
}

/**
 * Positive paid-skin proof: first earn coins only by the public five-level
 * gameplay route, leave through the visible pause/Home controls, then unlock
 * the orange core with an actual page tap. No QA setter, local-storage write,
 * or test-only reward is involved.
 */
async function verifyPaidSkinUnlock(cdp, page, canvasRect) {
  const playing = await readRuntimeSnapshot(page);
  assert(playing.gameState === 'PLAYING' && (playing.save?.coins || 0) >= 1500,
    `FAIL_SKIN_UNLOCK_NO_EARNED_COINS: ${JSON.stringify({ state: playing.gameState, coins: playing.save?.coins, session: playing.session })}`);
  const pause = pointForVisibleNode(canvasRect, playing, playing.ui?.runtimeHUD?.pauseButton, 'SKIN_UNLOCK_PAUSE');
  await dispatchTouchTap(cdp, pause.x, pause.y);
  try {
    await page.waitForFunction(() => {
      const snapshot = window.__BHR_QA__.snapshot();
      return snapshot.gameState === 'PAUSED' && snapshot.ui?.formalPages?.pause?.active === true;
    }, undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_SKIN_UNLOCK_PAUSE: ${JSON.stringify({ pause, state: actual.gameState, ui: actual.ui, error: String(error) })}`);
  }
  const paused = await readRuntimeSnapshot(page);
  const pauseHome = pointForVisibleNode(canvasRect, paused, paused.ui?.formalPages?.pauseHome, 'SKIN_UNLOCK_PAUSE_HOME');
  await dispatchTouchTap(cdp, pauseHome.x, pauseHome.y);
  try {
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_SKIN_UNLOCK_PAUSE_HOME: ${JSON.stringify({ pauseHome, state: actual.gameState, ui: actual.ui, error: String(error) })}`);
  }
  const home = await readRuntimeSnapshot(page);
  const coinsBefore = home.save?.coins;
  assert(Number.isFinite(coinsBefore) && coinsBefore >= 1500,
    `FAIL_SKIN_UNLOCK_COINS_LOST_ON_HOME: ${JSON.stringify(home.save)}`);

  const skin = pointForVisibleNode(canvasRect, home, home.ui?.skin, 'SKIN_UNLOCK_HOME_CARD');
  await dispatchTouchTap(cdp, skin.x, skin.y);
  try {
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'SKIN_SELECTION', undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_SKIN_UNLOCK_OPEN_PAGE: ${JSON.stringify({ skin, state: actual.gameState, ui: actual.ui, error: String(error) })}`);
  }
  const selection = await readRuntimeSnapshot(page);
  const orange = pointForVisibleNode(canvasRect, selection, selection.ui?.skinSelectionButtons?.[2], 'SKIN_UNLOCK_ORANGE');
  await dispatchTouchTap(cdp, orange.x, orange.y);
  try {
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().save?.skinId === 'skin_orange_force', undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error(`FAIL_SKIN_UNLOCK_ORANGE: ${JSON.stringify({ orange, state: actual.gameState, save: actual.save, data: actual.ui?.skinSelectionData, error: String(error) })}`);
  }
  const unlocked = await readRuntimeSnapshot(page);
  assert(unlocked.save?.coins === coinsBefore - 1500
    && unlocked.ui?.skinSelectionData?.states?.[2] === '已装备'
    && String(unlocked.ui?.skinSelectionData?.status || '').includes('已解锁并装备'),
  `FAIL_SKIN_UNLOCK_TRANSACTION: ${JSON.stringify({ before: coinsBefore, after: unlocked.save, data: unlocked.ui?.skinSelectionData })}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-skin-unlocked-orange.png') });
  return { pause, pauseHome, skin, orange, coinsBefore, coinsAfter: unlocked.save?.coins, skinId: unlocked.save?.skinId };
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

async function waitForLocalArenaDefeat(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let latest = await readRuntimeSnapshot(page);
  while (Date.now() < deadline) {
    await page.waitForTimeout(120);
    latest = await readRuntimeSnapshot(page);
    if (latest.gameState === 'REVIVING' && latest.arena?.localAlive === false) return latest;
  }
  throw new Error('FAIL_REVIVE_REAL_DEFEAT_TIMEOUT: ' + JSON.stringify({
    gameState: latest.gameState,
    arena: latest.arena,
    ui: latest.ui?.formalPages,
  }));
}

/** P5: exercise real defeat, frozen revive, give-up, and natural expiry. */
async function verifyReviveFlow(cdp, page, canvasRect, homeSnapshot) {
  const start = pointForVisibleNode(canvasRect, homeSnapshot, homeSnapshot.ui?.start, 'REVIVE_HOME_START');
  await dispatchTouchTap(cdp, start.x, start.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
  const mode = await readRuntimeSnapshot(page);
  const arena = pointForVisibleNode(canvasRect, mode, mode.ui?.modeArena, 'REVIVE_MODE_ARENA');
  await dispatchTouchTap(cdp, arena.x, arena.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'ARENA', undefined, { timeout: 7000 });

  const defeated = await waitForLocalArenaDefeat(page);
  const frozenRespawnSeconds = defeated.arena?.localRespawnSeconds;
  await page.waitForTimeout(2800);
  const held = await readRuntimeSnapshot(page);
  assert(held.gameState === 'REVIVING' && held.uiScreen === 'Revive'
    && held.arena?.localAlive === false && held.ui?.formalPages?.revive?.active,
  'FAIL_REVIVE_MODAL_EARLY_CLOSE: ' + JSON.stringify({ frozenRespawnSeconds, held: { gameState: held.gameState, uiScreen: held.uiScreen, arena: held.arena, pages: held.ui?.formalPages } }));
  assert(Math.abs((held.arena?.localRespawnSeconds || 0) - (frozenRespawnSeconds || 0)) < 0.05,
    'FAIL_REVIVE_RESPAWN_CLOCK_ADVANCED: ' + JSON.stringify({ frozenRespawnSeconds, held: held.arena?.localRespawnSeconds }));
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-revive-hold.png') });

  const giveUp = pointForVisibleNode(canvasRect, held, held.ui?.formalPages?.reviveGiveUp, 'REVIVE_GIVE_UP');
  await dispatchTouchTap(cdp, giveUp.x, giveUp.y);
  await page.waitForFunction(() => {
    const snapshot = window.__BHR_QA__.snapshot();
    return snapshot.gameState === 'SETTLEMENT' && snapshot.uiScreen === 'Settlement' && snapshot.arena?.reason === 'FORFEIT';
  }, undefined, { timeout: 5000 });
  const givenUp = await readRuntimeSnapshot(page);
  // Native Cocos Button dispatch is the primary path. RuntimePageInputRouter
  // remains a Canvas-target fallback, so its diagnostic may stay NONE when
  // the visible Button itself consumes the touch. The real FORFEIT settlement
  // above is the interaction assertion.
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-revive-give-up.png') });

  const restart = pointForVisibleNode(canvasRect, givenUp, givenUp.ui?.formalPages?.settlementRestart, 'REVIVE_SETTLEMENT_RESTART');
  await dispatchTouchTap(cdp, restart.x, restart.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'ARENA', undefined, { timeout: 7000 });
  const expiryDefeat = await waitForLocalArenaDefeat(page);
  const expiryStartedAt = Date.now();
  await page.waitForFunction(() => {
    const snapshot = window.__BHR_QA__.snapshot();
    return snapshot.gameState === 'SETTLEMENT' && snapshot.uiScreen === 'Settlement' && snapshot.arena?.reason === 'FORFEIT';
  }, undefined, { timeout: 8000 });
  const expired = await readRuntimeSnapshot(page);
  const expiryElapsedMs = Date.now() - expiryStartedAt;
  assert(expiryElapsedMs >= 4300,
    'FAIL_REVIVE_COUNTDOWN_EARLY_EXPIRY: ' + JSON.stringify({ expiryElapsedMs, defeat: expiryDefeat.arena, expired: expired.arena }));
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-revive-expiry.png') });

  return { frozenRespawnSeconds, heldRespawnSeconds: held.arena?.localRespawnSeconds, giveUpReason: givenUp.arena?.reason, expiryElapsedMs, expiryReason: expired.arena?.reason };
}

/** P6: verify arena settlement page data, reward idempotency, and Restart flow. */
async function verifySettlementFlow(cdp, page, canvasRect, homeSnapshot) {
  const coinsBeforeMatch = homeSnapshot.save?.coins;
  assert(Number.isFinite(coinsBeforeMatch),
    'FAIL_SETTLE_SAVE_BASELINE_MISSING: ' + JSON.stringify(homeSnapshot.save));
  // Navigate Home -> Mode -> Arena
  const start = pointForVisibleNode(canvasRect, homeSnapshot, homeSnapshot.ui?.start, 'SETTLE_HOME_START');
  await dispatchTouchTap(cdp, start.x, start.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
  const mode = await readRuntimeSnapshot(page);
  const arena = pointForVisibleNode(canvasRect, mode, mode.ui?.modeArena, 'SETTLE_MODE_ARENA');
  await dispatchTouchTap(cdp, arena.x, arena.y);
  await page.waitForFunction(() => {
    const s = window.__BHR_QA__.snapshot();
    return s.gameState === 'ARENA' && s.ui?.arenaHUD?.root?.active === true;
  }, undefined, { timeout: 7000 });

  // Pause -> Settle (FORFEIT) to reach Settlement page
  const arenaSnap = await readRuntimeSnapshot(page);
  const pauseBtn = pointForVisibleNode(canvasRect, arenaSnap, arenaSnap.ui?.arenaHUD?.pauseButton, 'SETTLE_PAUSE');
  await dispatchTouchTap(cdp, pauseBtn.x, pauseBtn.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PAUSED', undefined, { timeout: 5000 });
  const paused = await readRuntimeSnapshot(page);
  const settleBtn = pointForVisibleNode(canvasRect, paused, paused.ui?.formalPages?.pauseSettle, 'SETTLE_FORFEIT');
  await dispatchTouchTap(cdp, settleBtn.x, settleBtn.y);
  await page.waitForFunction(() => {
    const s = window.__BHR_QA__.snapshot();
    return s.gameState === 'SETTLEMENT' && s.uiScreen === 'Settlement' && s.arena?.reason === 'FORFEIT';
  }, undefined, { timeout: 5000 });

  const settled = await readRuntimeSnapshot(page);
  // Assert settlement page is visible
  assert(settled.ui?.formalPages?.settlement?.active,
    'FAIL_SETTLE_PAGE_NOT_ACTIVE: ' + JSON.stringify(settled.ui?.formalPages));

  // Assert reward fields are present and non-negative
  const reward = settled.arena?.settlementReward;
  assert(reward && reward.coins >= 0,
    'FAIL_SETTLE_REWARD_MISSING: ' + JSON.stringify(reward));

  // Assert reward sum integrity
  const breakdown = (reward.massCoins || 0) + (reward.collectedCoins || 0) +
    (reward.eliminationCoins || 0) + (reward.survivalCoins || 0) + (reward.placementCoins || 0);
  assert(breakdown === reward.coins,
    'FAIL_SETTLE_REWARD_SUM: breakdown=' + breakdown + ' total=' + reward.coins);

  // The account balance must receive this finished match exactly once.
  assert(settled.save?.coins === coinsBeforeMatch + reward.coins,
    'FAIL_SETTLE_COINS_NOT_SAVED: ' + JSON.stringify({ before: coinsBeforeMatch, after: settled.save?.coins, reward }));

  // Assert idempotency: settlement must be claimed
  assert(settled.settlement?.claimed === true,
    'FAIL_SETTLE_NOT_CLAIMED: ' + JSON.stringify(settled.settlement));

  // Read labels rendered by the real SettlementPageController, rather than
  // merely proving the root node is active.
  const settlementData = settled.ui?.formalPages?.settlementData;
  assert(typeof settlementData?.title === 'string' && settlementData.title.length > 0
    && typeof settlementData?.result === 'string' && settlementData.result.length > 0
    && settlementData.reward === '+' + reward.coins,
    'FAIL_SETTLE_RENDERED_LABELS: ' + JSON.stringify(settlementData));

  // Capture settlement screenshot
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-settlement.png') });

  // Tap Restart -> new match with different matchId
  const firstMatchId = settled.settlement?.matchId;
  const restartBtn = pointForVisibleNode(canvasRect, settled, settled.ui?.formalPages?.settlementRestart, 'SETTLE_RESTART');
  await dispatchTouchTap(cdp, restartBtn.x, restartBtn.y);
  await page.waitForFunction(() => {
    const s = window.__BHR_QA__.snapshot();
    return s.gameState === 'ARENA' && s.ui?.arenaHUD?.root?.active === true;
  }, undefined, { timeout: 7000 });
  const restarted = await readRuntimeSnapshot(page);
  assert(restarted.arena?.matchId !== firstMatchId,
    'FAIL_SETTLE_SAME_MATCH_ID_AFTER_RESTART: ' + JSON.stringify({ firstMatchId, newId: restarted.arena?.matchId }));

  // Second match: pause -> settle -> Home
  const pauseBtn2 = pointForVisibleNode(canvasRect, restarted, restarted.ui?.arenaHUD?.pauseButton, 'SETTLE2_PAUSE');
  await dispatchTouchTap(cdp, pauseBtn2.x, pauseBtn2.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PAUSED', undefined, { timeout: 5000 });
  const paused2 = await readRuntimeSnapshot(page);
  const settleBtn2 = pointForVisibleNode(canvasRect, paused2, paused2.ui?.formalPages?.pauseSettle, 'SETTLE2_FORFEIT');
  await dispatchTouchTap(cdp, settleBtn2.x, settleBtn2.y);
  await page.waitForFunction(() => {
    const s = window.__BHR_QA__.snapshot();
    return s.gameState === 'SETTLEMENT' && s.uiScreen === 'Settlement';
  }, undefined, { timeout: 5000 });
  const settled2 = await readRuntimeSnapshot(page);
  const homeBtn = pointForVisibleNode(canvasRect, settled2, settled2.ui?.formalPages?.settlementHome, 'SETTLE2_HOME');
  await dispatchTouchTap(cdp, homeBtn.x, homeBtn.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 5000 });

  return {
    matchId: firstMatchId,
    reward,
    breakdown,
    claimed: settled.settlement?.claimed,
    savedCoinsBefore: coinsBeforeMatch,
    savedCoinsAfter: settled.save?.coins,
    secondMatchId: settled2.settlement?.matchId,
  };
}

/**
 * S10 save-resume browser acceptance.
 *
 * Drives a real arena match through visible touch controls, records pre-reload
 * state, reloads the browser, and asserts every value persists exactly once.
 * No QA setter, localStorage write, or fake reward is used.
 */
async function verifySaveResume(cdp, page, canvasRect, homeSnapshot) {
  const baselineCoins = homeSnapshot.save?.coins;
  assert(Number.isFinite(baselineCoins),
    'FAIL_SAVE_RESUME_BASELINE_COINS: save.coins missing before match: ' + JSON.stringify(homeSnapshot.save));
  const baselineSkinId = homeSnapshot.save?.skinId ?? null;

  // Home -> Mode Select
  const start = pointForVisibleNode(canvasRect, homeSnapshot, homeSnapshot.ui?.start, 'SR_HOME_START');
  await dispatchTouchTap(cdp, start.x, start.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
  const mode = await readRuntimeSnapshot(page);

  // Mode Select -> Arena
  const arenaBtn = pointForVisibleNode(canvasRect, mode, mode.ui?.modeArena, 'SR_MODE_ARENA');
  await dispatchTouchTap(cdp, arenaBtn.x, arenaBtn.y);
  try {
    await page.waitForFunction(() => {
      const s = window.__BHR_QA__.snapshot();
      return s.gameState === 'ARENA' && s.ui?.arenaHUD?.root?.active === true;
    }, undefined, { timeout: 7000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error('FAIL_SAVE_RESUME_ARENA_ENTER: ' + JSON.stringify({ arenaBtn, gameState: actual.gameState, ui: actual.ui, error: String(error) }));
  }

  // Assert arena is running and pause button is visible
  const arenaRunning = await readRuntimeSnapshot(page);
  assert(arenaRunning.arena?.running,
    'FAIL_SAVE_RESUME_ARENA_NOT_RUNNING: ' + JSON.stringify(arenaRunning.arena));
  assert(arenaRunning.ui?.arenaHUD?.pauseButton?.active,
    'FAIL_SAVE_RESUME_PAUSE_NOT_VISIBLE: ' + JSON.stringify(arenaRunning.ui?.arenaHUD));

  // Capture machine state inside the arena for the pre-reload baseline
  const machineInArena = {
    mass: arenaRunning.machine?.mass,
    level: arenaRunning.machine?.level,
  };

  // Tap visible Pause button
  const pauseBtn = pointForVisibleNode(canvasRect, arenaRunning, arenaRunning.ui?.arenaHUD?.pauseButton, 'SR_PAUSE');
  await dispatchTouchTap(cdp, pauseBtn.x, pauseBtn.y);
  try {
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PAUSED', undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error('FAIL_SAVE_RESUME_PAUSE: ' + JSON.stringify({ pauseBtn, gameState: actual.gameState, ui: actual.ui, error: String(error) }));
  }

  // Assert Settle/Forfeit button is visible on the pause page
  const paused = await readRuntimeSnapshot(page);
  assert(paused.ui?.formalPages?.pauseSettle?.active,
    'FAIL_SAVE_RESUME_SETTLE_BTN_NOT_VISIBLE: ' + JSON.stringify(paused.ui?.formalPages));

  // Tap visible Settle/Forfeit button
  const settleBtn = pointForVisibleNode(canvasRect, paused, paused.ui?.formalPages?.pauseSettle, 'SR_FORFEIT');
  await dispatchTouchTap(cdp, settleBtn.x, settleBtn.y);
  try {
    await page.waitForFunction(() => {
      const s = window.__BHR_QA__.snapshot();
      return s.gameState === 'SETTLEMENT' && s.uiScreen === 'Settlement' && s.arena?.reason === 'FORFEIT';
    }, undefined, { timeout: 5000 });
  } catch (error) {
    const actual = await readRuntimeSnapshot(page);
    throw new Error('FAIL_SAVE_RESUME_SETTLEMENT: ' + JSON.stringify({ settleBtn, gameState: actual.gameState, uiScreen: actual.uiScreen, arena: actual.arena, error: String(error) }));
  }

  // Read settlement page diagnostics
  const settled = await readRuntimeSnapshot(page);
  assert(settled.ui?.formalPages?.settlement?.active,
    'FAIL_SAVE_RESUME_SETTLE_PAGE_NOT_ACTIVE: ' + JSON.stringify(settled.ui?.formalPages));

  const reward = settled.arena?.settlementReward;
  assert(reward && Number.isFinite(reward.coins) && reward.coins >= 0,
    'FAIL_SAVE_RESUME_REWARD_MISSING: ' + JSON.stringify(reward));

  // Assert exactly one grant: coins after settlement = baseline + reward.coins
  assert(settled.save?.coins === baselineCoins + reward.coins,
    'FAIL_SAVE_RESUME_COINS_NOT_SAVED: ' + JSON.stringify({ baselineCoins, after: settled.save?.coins, reward }));

  // Assert settlement is claimed (idempotency guard is already set)
  assert(settled.settlement?.claimed === true,
    'FAIL_SAVE_RESUME_NOT_CLAIMED: ' + JSON.stringify(settled.settlement));

  // Capture diagnostics needed for post-reload assertions
  const preReloadCoins = settled.save?.coins;
  const preReloadMass = settled.machine?.mass ?? machineInArena.mass;
  const preReloadLevel = settled.machine?.level ?? machineInArena.level;
  const preReloadSkinId = settled.save?.skinId ?? baselineSkinId;
  const settlementMatchId = settled.settlement?.matchId ?? settled.arena?.matchId ?? null;
  const claimedArenaSettlementIds = settled.save?.claimedArenaSettlementIds ?? [];

  // Assert the save record already includes this match ID as claimed (pre-reload)
  if (settlementMatchId !== null) {
    assert(claimedArenaSettlementIds.includes(settlementMatchId),
      'FAIL_SAVE_RESUME_PRE_RELOAD_CLAIMED_ID_MISSING: ' + JSON.stringify({ settlementMatchId, claimedArenaSettlementIds }));
  }

  // Screenshot the settlement page before reload
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-save-resume-settlement.png') });

  // Reload the browser
  await page.reload({ waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 45000 });
  } catch (error) {
    throw new Error('FAIL_SAVE_RESUME_QA_BRIDGE_AFTER_RELOAD: ' + String(error));
  }
  const afterReload = await readRuntimeSnapshot(page);

  // Assert coins persisted exactly (no second grant)
  assert(afterReload.save?.coins === preReloadCoins,
    'FAIL_SAVE_RESUME_COINS_MISMATCH: ' + JSON.stringify({ preReload: preReloadCoins, afterReload: afterReload.save?.coins }));

  // Assert machine mass persisted
  assert(afterReload.machine?.mass === preReloadMass,
    'FAIL_SAVE_RESUME_MASS_MISMATCH: ' + JSON.stringify({ preReload: preReloadMass, afterReload: afterReload.machine?.mass }));

  // Assert machine level persisted
  assert(afterReload.machine?.level === preReloadLevel,
    'FAIL_SAVE_RESUME_LEVEL_MISMATCH: ' + JSON.stringify({ preReload: preReloadLevel, afterReload: afterReload.machine?.level }));

  // Assert skin id persisted
  assert((afterReload.save?.skinId ?? null) === preReloadSkinId,
    'FAIL_SAVE_RESUME_SKIN_ID_MISMATCH: ' + JSON.stringify({ preReload: preReloadSkinId, afterReload: afterReload.save?.skinId }));

  // Assert previous settlement ID remains claimed after reload (no repeat grant)
  if (settlementMatchId !== null) {
    const afterClaimedArenaIds = afterReload.save?.claimedArenaSettlementIds ?? [];
    assert(afterClaimedArenaIds.includes(settlementMatchId),
      'FAIL_SAVE_RESUME_CLAIMED_ID_LOST: ' + JSON.stringify({ settlementMatchId, afterClaimedArenaIds }));
    // Coins must not have grown again (re-claim guard held)
    assert(afterReload.save?.coins === preReloadCoins,
      'FAIL_SAVE_RESUME_REPEAT_GRANT: ' + JSON.stringify({ preReloadCoins, afterReload: afterReload.save?.coins, settlementMatchId }));
  }

  return {
    baselineCoins,
    baselineSkinId,
    machineInArena,
    settlementMatchId,
    claimedArenaSettlementIds,
    reward,
    preReload: {
      coins: preReloadCoins,
      mass: preReloadMass,
      level: preReloadLevel,
      skinId: preReloadSkinId,
    },
    afterReload: {
      coins: afterReload.save?.coins,
      mass: afterReload.machine?.mass,
      level: afterReload.machine?.level,
      skinId: afterReload.save?.skinId,
      claimedArenaSettlementIds: afterReload.save?.claimedArenaSettlementIds ?? [],
    },
  };
}

/** UI product gate: two complete player-facing paths through rendered controls. */
async function verifyUiFullFlow(cdp, page, canvasRect, homeSnapshot) {
  const start = pointForVisibleNode(canvasRect, homeSnapshot, homeSnapshot.ui?.start, 'UI_FLOW_HOME_START');
  await dispatchTouchTap(cdp, start.x, start.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
  const modeForEndless = await readRuntimeSnapshot(page);
  const endless = pointForVisibleNode(canvasRect, modeForEndless, modeForEndless.ui?.modeEndless, 'UI_FLOW_MODE_ENDLESS');
  await dispatchTouchTap(cdp, endless.x, endless.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });
  const endlessPlaying = await readRuntimeSnapshot(page);
  const endlessPause = pointForVisibleNode(canvasRect, endlessPlaying, endlessPlaying.ui?.runtimeHUD?.pauseButton, 'UI_FLOW_ENDLESS_PAUSE');
  await dispatchTouchTap(cdp, endlessPause.x, endlessPause.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PAUSED', undefined, { timeout: 5000 });
  const endlessPaused = await readRuntimeSnapshot(page);
  const resume = pointForVisibleNode(canvasRect, endlessPaused, endlessPaused.ui?.formalPages?.pauseResume, 'UI_FLOW_ENDLESS_RESUME');
  await dispatchTouchTap(cdp, resume.x, resume.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });
  const resumed = await readRuntimeSnapshot(page);
  const exitPause = pointForVisibleNode(canvasRect, resumed, resumed.ui?.runtimeHUD?.pauseButton, 'UI_FLOW_ENDLESS_EXIT_PAUSE');
  await dispatchTouchTap(cdp, exitPause.x, exitPause.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PAUSED', undefined, { timeout: 5000 });
  const exitPaused = await readRuntimeSnapshot(page);
  const exitHome = pointForVisibleNode(canvasRect, exitPaused, exitPaused.ui?.formalPages?.pauseHome, 'UI_FLOW_ENDLESS_EXIT_HOME');
  await dispatchTouchTap(cdp, exitHome.x, exitHome.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 5000 });

  const arenaHome = await readRuntimeSnapshot(page);
  const arenaStart = pointForVisibleNode(canvasRect, arenaHome, arenaHome.ui?.start, 'UI_FLOW_ARENA_HOME_START');
  await dispatchTouchTap(cdp, arenaStart.x, arenaStart.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
  const modeForArena = await readRuntimeSnapshot(page);
  const arena = pointForVisibleNode(canvasRect, modeForArena, modeForArena.ui?.modeArena, 'UI_FLOW_MODE_ARENA');
  await dispatchTouchTap(cdp, arena.x, arena.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'ARENA', undefined, { timeout: 7000 });
  const defeat = await waitForLocalArenaDefeat(page);
  assert(defeat.ui?.formalPages?.revive?.active && defeat.uiScreen === 'Revive',
    'FAIL_UI_FLOW_REVIVE_NOT_VISIBLE: ' + JSON.stringify({ gameState: defeat.gameState, uiScreen: defeat.uiScreen, pages: defeat.ui?.formalPages }));
  const giveUp = pointForVisibleNode(canvasRect, defeat, defeat.ui?.formalPages?.reviveGiveUp, 'UI_FLOW_REVIVE_GIVE_UP');
  await dispatchTouchTap(cdp, giveUp.x, giveUp.y);
  await page.waitForFunction(() => {
    const snapshot = window.__BHR_QA__.snapshot();
    return snapshot.gameState === 'SETTLEMENT' && snapshot.uiScreen === 'Settlement' && snapshot.arena?.reason === 'FORFEIT';
  }, undefined, { timeout: 5000 });
  const settlement = await readRuntimeSnapshot(page);
  assert(settlement.settlement?.claimed === true && settlement.ui?.formalPages?.settlement?.active,
    'FAIL_UI_FLOW_SETTLEMENT: ' + JSON.stringify({ settlement: settlement.settlement, page: settlement.ui?.formalPages?.settlement }));
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-ui-full-flow-settlement.png') });
  const settlementHome = pointForVisibleNode(canvasRect, settlement, settlement.ui?.formalPages?.settlementHome, 'UI_FLOW_SETTLEMENT_HOME');
  await dispatchTouchTap(cdp, settlementHome.x, settlementHome.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 5000 });

  return {
    endless: { pause: endlessPause, resume, exitHome },
    arena: { defeated: true, giveUp, settlementClaimed: settlement.settlement?.claimed, homeReturned: true },
  };
}

/**
 * Baseline-only Golden City probe. It starts a genuine 1-human + 7-bot arena
 * by CDP touch, reads JSON evidence from the live Cocos engine, and observes
 * a route-driven vehicle move. It does not grant mass, teleport entities, or
 * convert missing metrics into a pass.
 */
async function collectGoldenCityBaseline(cdp, page, canvasRect, homeSnapshot) {
  const start = pointForVisibleNode(canvasRect, homeSnapshot, homeSnapshot.ui?.start, 'GOLDEN_CITY_HOME_START');
  await dispatchTouchTap(cdp, start.x, start.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
  const mode = await readRuntimeSnapshot(page);
  const arena = pointForVisibleNode(canvasRect, mode, mode.ui?.modeArena, 'GOLDEN_CITY_MODE_ARENA');
  await dispatchTouchTap(cdp, arena.x, arena.y);
  await page.waitForFunction(() => {
    const snapshot = window.__BHR_QA__.snapshot();
    return snapshot.gameState === 'ARENA' && snapshot.ui?.arenaHUD?.root?.active === true;
  }, undefined, { timeout: 7000 });

  const before = await readRuntimeSnapshot(page);
  const streaming = before.world?.streaming;
  assert(streaming?.currentCellSource === 'AUTHORED_GOLDEN_CITY',
    `FAIL_GOLDEN_CITY_SOURCE: ${JSON.stringify(streaming)}`);
  const composition = before.world?.streaming?.goldenCityComposition;
  assert(before.arena?.competitorCount === 8,
    `FAIL_GOLDEN_CITY_COMPETITOR_ROSTER: ${JSON.stringify(before.arena)}`);
  assert(composition?.status === 'MEASURED',
    `FAIL_GOLDEN_CITY_UNMEASURED: ${JSON.stringify(composition)}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-golden-city-before.png') });
  writeFileSync(path.join(evidenceDirectory, 'golden-city-composition-before.json'), `${JSON.stringify(composition, null, 2)}\n`, 'utf8');

  const dynamicBefore = before.world?.streaming?.dynamicVehicles || [];
  assert(dynamicBefore.length > 0,
    `FAIL_GOLDEN_CITY_DYNAMIC_VEHICLE_MISSING: ${JSON.stringify(before.world?.streaming)}`);
  const treeEntries = composition.entries.filter((entry) => entry.category === 'TREE');
  const visibleTrees = treeEntries.filter((entry) => entry.visible);
  const visibleEntries = composition.entries.filter((entry) => entry.visible);
  const compositionMetrics = {
    currentCellSource: streaming.currentCellSource,
    visibleTrees: visibleTrees.length,
    visibleRoads: visibleEntries.filter((entry) => entry.category === 'ROAD').length,
    visiblePOI: visibleEntries.filter((entry) => entry.category === 'POI').length,
    visibleBuildings: visibleEntries.filter((entry) => entry.category === 'BUILDING').length,
    visibleVehicles: visibleEntries.filter((entry) => entry.category === 'VEHICLE').length,
    visibleCollectibles: visibleEntries.filter((entry) => entry.category === 'COLLECTIBLE').length,
    resourceClusters: visibleEntries.filter((entry) => entry.category === 'RESOURCE_CLUSTER').length,
    largeEmptyGroundRatio: composition.emptyGround?.largeEmptyGroundRatio ?? null,
  };
  assert(visibleTrees.length >= 10 && visibleTrees.every((entry) => entry.category === 'TREE'),
    `FAIL_GOLDEN_CITY_TREE_GATE: ${JSON.stringify({ metrics: compositionMetrics, treeEntries, visibleTrees })}`);
  const openingRoad = composition.entries.find((entry) => entry.name === 'FourWayRoad' || entry.name === 'MainCrossroad')?.worldBounds;
  const openingTraffic = dynamicBefore.filter((vehicle) => vehicle.id.startsWith('traffic_0_0_'));
  const isInsideOpeningRoad = (vehicle) => openingRoad
    && vehicle.x >= openingRoad.min.x && vehicle.x <= openingRoad.max.x
    && vehicle.z >= openingRoad.min.z && vehicle.z <= openingRoad.max.z;
  assert(openingTraffic.length > 0 && openingTraffic.every(isInsideOpeningRoad),
    `FAIL_GOLDEN_CITY_TRAFFIC_OFF_ROAD: ${JSON.stringify({ openingRoad, openingTraffic })}`);
  await page.waitForTimeout(1200);
  const after = await readRuntimeSnapshot(page);
  const dynamicAfter = after.world?.streaming?.dynamicVehicles || [];
  assert(openingTraffic.every((vehicle) => {
    const moved = dynamicAfter.find((candidate) => candidate.id === vehicle.id);
    return moved && isInsideOpeningRoad(moved);
  }), `FAIL_GOLDEN_CITY_TRAFFIC_LEFT_ROAD: ${JSON.stringify({ openingRoad, dynamicAfter })}`);
  const movingVehicle = dynamicBefore.map((vehicle) => {
    const moved = dynamicAfter.find((candidate) => candidate.id === vehicle.id);
    return moved ? {
      id: vehicle.id,
      kind: vehicle.kind,
      distance: Math.hypot(moved.x - vehicle.x, moved.z - vehicle.z),
      before: { x: vehicle.x, z: vehicle.z },
      after: { x: moved.x, z: moved.z },
    } : null;
  }).find((vehicle) => vehicle && vehicle.distance > 0.2);
  assert(movingVehicle,
    `FAIL_GOLDEN_CITY_DYNAMIC_VEHICLE_NOT_MOVING: ${JSON.stringify({ dynamicBefore, dynamicAfter })}`);
  return { start, arena, currentCellSource: streaming.currentCellSource, composition, dynamicBefore, dynamicAfter, movingVehicle };
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

/**
 * S8 gate: record only read-only Cocos runtime snapshots for one unshortened
 * local Arena match. Keeping the sampler in the page avoids CDP polling gaps
 * that can miss short CHASE/FLEE transitions, while it never changes gameplay.
 */
async function verifyArenaAiRuntime(cdp, page, canvasRect) {
  const homeSnapshot = await readRuntimeSnapshot(page);
  const homeStart = pointForVisibleNode(canvasRect, homeSnapshot, homeSnapshot.ui?.start, 'ARENA_AI_HOME_START');
  await dispatchTouchTap(cdp, homeStart.x, homeStart.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
  const modeSnapshot = await readRuntimeSnapshot(page);
  const arenaPoint = pointForVisibleNode(canvasRect, modeSnapshot, modeSnapshot.ui?.modeArena, 'ARENA_AI_MODE_ARENA');
  await dispatchTouchTap(cdp, arenaPoint.x, arenaPoint.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'ARENA', undefined, { timeout: 7000 });
  const started = await readRuntimeSnapshot(page);
  assert(started.arena?.running && started.arena?.durationSeconds === 180,
    `FAIL_ARENA_AI_START: ${JSON.stringify(started.arena)}`);
  assert(started.arena?.competitorCount === 8 && Object.keys(started.arena?.botStates || {}).length === 7,
    `FAIL_ARENA_AI_ROSTER: ${JSON.stringify(started.arena)}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-arena-ai-start.png') });

  await page.evaluate(() => {
    const telemetry = {
      active: true,
      frames: 0,
      maxElapsedSeconds: 0,
      maxEliminationCount: 0,
      durationSeconds: 0,
      competitorCounts: new Set(),
      botIds: new Set(),
      stateFrames: {},
      botInitial: {},
      botMaximum: {},
      alive: {},
      deathsObserved: 0,
      eventHuntWithFragmentFrames: 0,
    };
    window.__BHR_ARENA_AI_TELEMETRY__ = telemetry;
    const observe = () => {
      if (!telemetry.active) return;
      const snapshot = window.__BHR_QA__?.snapshot?.();
      const arena = snapshot?.arena;
      if (arena) {
        telemetry.frames += 1;
        telemetry.maxElapsedSeconds = Math.max(telemetry.maxElapsedSeconds, arena.elapsedSeconds || 0);
        telemetry.maxEliminationCount = Math.max(telemetry.maxEliminationCount, arena.eliminationCount || 0);
        telemetry.durationSeconds = Math.max(telemetry.durationSeconds, arena.durationSeconds || 0);
        telemetry.competitorCounts.add(arena.competitorCount);
        const states = arena.botStates || {};
        const hasEventHunter = Object.values(states).includes('EVENT_HUNT');
        if (hasEventHunter && (snapshot.objects || []).some((object) => object?.type === 'arena_mass_fragment')) {
          telemetry.eventHuntWithFragmentFrames += 1;
        }
        for (const [id, state] of Object.entries(states)) {
          telemetry.botIds.add(id);
          telemetry.stateFrames[state] = (telemetry.stateFrames[state] || 0) + 1;
        }
        for (const entry of arena.leaderboard || []) {
          if (entry.isLocal) continue;
          if (!telemetry.botInitial[entry.id]) {
            telemetry.botInitial[entry.id] = { mass: entry.mass, consumed: entry.consumed, kills: entry.kills };
          }
          const maximum = telemetry.botMaximum[entry.id] || { mass: 0, consumed: 0, kills: 0 };
          maximum.mass = Math.max(maximum.mass, entry.mass || 0);
          maximum.consumed = Math.max(maximum.consumed, entry.consumed || 0);
          maximum.kills = Math.max(maximum.kills, entry.kills || 0);
          telemetry.botMaximum[entry.id] = maximum;
          if (telemetry.alive[entry.id] === true && entry.alive === false) telemetry.deathsObserved += 1;
          telemetry.alive[entry.id] = entry.alive;
        }
      }
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });

  // An idle local player can legitimately enter the real revive flow, which
  // pauses this offline match. Keep playing through the visible joystick and
  // use the visible revive action when needed so the production clock, rather
  // than a test-side timer shortcut, reaches its 180-second TIME outcome.
  let current = started;
  let joystick = pointForVisibleNode(canvasRect, current, current.ui?.arenaHUD?.joystick, 'ARENA_AI_JOYSTICK');
  let touchHeld = false;
  let reviveCount = 0;
  const deadline = Date.now() + 210000;
  try {
    while (Date.now() < deadline) {
      if (current.gameState === 'SETTLEMENT' && current.arena?.reason === 'TIME') break;
      if (current.gameState === 'REVIVING') {
        if (touchHeld) {
          await releaseTouchJoystick(cdp);
          touchHeld = false;
        }
        const revive = pointForVisibleNode(canvasRect, current, current.ui?.formalPages?.reviveNow, 'ARENA_AI_REVIVE_NOW');
        await dispatchTouchTap(cdp, revive.x, revive.y);
        reviveCount += 1;
        await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'ARENA', undefined, { timeout: 5000 });
        current = await readRuntimeSnapshot(page);
        joystick = pointForVisibleNode(canvasRect, current, current.ui?.arenaHUD?.joystick, 'ARENA_AI_JOYSTICK_AFTER_REVIVE');
      }
      if (current.gameState === 'ARENA') {
        const phase = (current.arena?.elapsedSeconds || 0) * 0.83;
        const targetX = joystick.x + Math.cos(phase) * 54;
        const targetY = joystick.y + Math.sin(phase) * 54;
        if (touchHeld) await moveTouchJoystick(cdp, targetX, targetY);
        else {
          await beginTouchJoystick(cdp, joystick.x, joystick.y, targetX, targetY);
          touchHeld = true;
        }
      }
      await page.waitForTimeout(350);
      current = await readRuntimeSnapshot(page);
    }
  } finally {
    if (touchHeld) await releaseTouchJoystick(cdp);
  }
  assert(current.gameState === 'SETTLEMENT' && current.arena?.reason === 'TIME',
    `FAIL_ARENA_AI_TIME_TIMEOUT: ${JSON.stringify({ gameState: current.gameState, arena: current.arena, reviveCount })}`);
  const settled = await readRuntimeSnapshot(page);
  assert(settled.uiScreen === 'Settlement'
    && settled.ui?.formalPages?.settlement?.active === true
    && settled.ui?.home?.active === false,
  `FAIL_ARENA_AI_SETTLEMENT_VISIBILITY: ${JSON.stringify({ gameState: settled.gameState, uiScreen: settled.uiScreen, home: settled.ui?.home, settlement: settled.ui?.formalPages?.settlement })}`);
  const telemetry = await page.evaluate(() => {
    const current = window.__BHR_ARENA_AI_TELEMETRY__;
    if (!current) return null;
    current.active = false;
    const result = {
      frames: current.frames,
      maxElapsedSeconds: current.maxElapsedSeconds,
      maxEliminationCount: current.maxEliminationCount,
      durationSeconds: current.durationSeconds,
      competitorCounts: Array.from(current.competitorCounts),
      botIds: Array.from(current.botIds),
      stateFrames: current.stateFrames,
      botInitial: current.botInitial,
      botMaximum: current.botMaximum,
      deathsObserved: current.deathsObserved,
      eventHuntWithFragmentFrames: current.eventHuntWithFragmentFrames,
    };
    delete window.__BHR_ARENA_AI_TELEMETRY__;
    return result;
  });
  assert(telemetry, 'FAIL_ARENA_AI_TELEMETRY_MISSING');
  assert(telemetry.competitorCounts.includes(8) && telemetry.botIds.length === 7,
    `FAIL_ARENA_AI_ROSTER_EVIDENCE: ${JSON.stringify(telemetry)}`);
  for (const state of ['COLLECT', 'CHASE', 'FLEE', 'EVENT_HUNT']) {
    assert(telemetry.stateFrames[state] > 0,
      `FAIL_ARENA_AI_STATE_${state}: ${JSON.stringify(telemetry.stateFrames)}`);
  }
  const botProgress = Object.entries(telemetry.botMaximum).map(([id, maximum]) => ({ id, initial: telemetry.botInitial[id], maximum }));
  assert(botProgress.some(({ initial, maximum }) => maximum.consumed > initial.consumed),
    `FAIL_ARENA_AI_BOT_COLLECT: ${JSON.stringify(botProgress)}`);
  assert(botProgress.some(({ initial, maximum }) => maximum.mass > initial.mass),
    `FAIL_ARENA_AI_BOT_MASS_GROWTH: ${JSON.stringify(botProgress)}`);
  assert(botProgress.some(({ initial, maximum }) => maximum.kills > initial.kills),
    `FAIL_ARENA_AI_BOT_KILL: ${JSON.stringify(botProgress)}`);
  assert(telemetry.deathsObserved > 0 && telemetry.maxEliminationCount > 0,
    `FAIL_ARENA_AI_DEATH: ${JSON.stringify(telemetry)}`);
  assert(telemetry.eventHuntWithFragmentFrames > 0,
    `FAIL_ARENA_AI_EVENT_HUNT_FRAGMENT: ${JSON.stringify(telemetry)}`);
  assert(telemetry.maxElapsedSeconds >= telemetry.durationSeconds && settled.arena?.reason === 'TIME',
    `FAIL_ARENA_AI_DURATION: ${JSON.stringify({ telemetry, arena: settled.arena })}`);
  await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-arena-ai-time-settlement.png') });
  return { started: started.arena, settled: settled.arena, telemetry, botProgress, reviveCount };
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
 * Exercises the production 2D streamer with the required cardinal loop.
 * Every location is reached with the player-facing joystick; snapshots only
 * project existing world state for lifecycle evidence and never mutate it.
 */
async function verifyCellLifecycle(cdp, page, joystick) {
  const activeCellKey = (cell) => String(cell.x) + ':' + String(cell.z);
  const objectIds = (snapshot) => snapshot.world?.streaming?.activeCells
    ?.flatMap((cell) => cell.collectibleRuntimeIds || []) || [];
  const trafficIds = (snapshot) => snapshot.world?.streaming?.activeCells
    ?.flatMap((cell) => cell.vehicleRuntimeIds || []) || [];
  const assertUnique = (ids, label) => {
    assert(new Set(ids).size === ids.length,
      'FAIL_CELL_LIFECYCLE_DUPLICATE_' + label + ': ' + JSON.stringify(ids));
  };
  const assertActiveGrid = (snapshot, checkpoint) => {
    const stream = validateInfiniteWorldSnapshot(snapshot);
    const active = new Set(stream.activeCells.map(activeCellKey));
    assert(active.size === 9,
      'FAIL_CELL_LIFECYCLE_ACTIVE_COUNT_' + checkpoint + ': ' + JSON.stringify(stream.activeCells));
    assertUnique(objectIds(snapshot), 'OBJECT_' + checkpoint);
    assertUnique(trafficIds(snapshot), 'TRAFFIC_' + checkpoint);
    return { stream, active };
  };
  const initial = await readRuntimeSnapshot(page);
  const initialCheck = assertActiveGrid(initial, 'OPENING');
  assert(initialCheck.active.has('0:0')
      && initialCheck.stream.currentCell.x === 0
      && initialCheck.stream.currentCell.z === 0
      && initialCheck.stream.currentCellSource === 'AUTHORED_GOLDEN_CITY',
  'FAIL_CELL_LIFECYCLE_OPENING: ' + JSON.stringify(initialCheck.stream));
  const openingCell = initialCheck.stream.activeCells.find((cell) => cell.x === 0 && cell.z === 0);
  const openingObjects = openingCell?.collectibleRuntimeIds || [];
  const openingTraffic = openingCell?.vehicleRuntimeIds || [];
  assert(openingObjects.length > 0 && openingTraffic.length > 0,
    'FAIL_CELL_LIFECYCLE_OPENING_CONTENT: ' + JSON.stringify(initialCheck.stream.activeCells));
  const poolBefore = initialCheck.stream.pool;
  const checkpoints = [
    { id: 'EAST', target: { x: 196, z: 0 }, cell: { x: 3, z: 0 } },
    { id: 'NORTH', target: { x: 196, z: -196 }, cell: { x: 3, z: -3 } },
    { id: 'WEST', target: { x: -196, z: -196 }, cell: { x: -3, z: -3 } },
    { id: 'SOUTH', target: { x: -196, z: 196 }, cell: { x: -3, z: 3 } },
    { id: 'RETURN_X', target: { x: 0, z: 196 }, cell: { x: 0, z: 3 } },
    { id: 'OPENING', target: { x: 0, z: 0 }, cell: { x: 0, z: 0 } },
  ];
  const captures = [];
  let previousRebaseCount = initialCheck.stream.rebaseCount;
  for (const checkpoint of checkpoints) {
    await driveJoystickToLogicalPoint(
      cdp,
      page,
      joystick,
      checkpoint.target,
      'CELL_LIFECYCLE_' + checkpoint.id,
      2.4,
      70_000,
    );
    await page.waitForTimeout(450);
    const settled = await readRuntimeSnapshot(page);
    const check = assertActiveGrid(settled, checkpoint.id);
    const logical = getLogicalPlayerPosition(settled);
    assert(check.stream.currentCell.x === checkpoint.cell.x
        && check.stream.currentCell.z === checkpoint.cell.z,
    'FAIL_CELL_LIFECYCLE_CURRENT_' + checkpoint.id + ': ' + JSON.stringify({ expected: checkpoint.cell, stream: check.stream }));
    assert(Math.hypot(logical.x - checkpoint.target.x, logical.z - checkpoint.target.z) <= 3,
      'FAIL_CELL_LIFECYCLE_LOGICAL_CONTINUITY_' + checkpoint.id + ': ' + JSON.stringify({ target: checkpoint.target, logical, origin: check.stream.logicalOrigin }));
    assert(Math.hypot(settled.machine.velocity.x, settled.machine.velocity.z) < 0.06,
      'FAIL_CELL_LIFECYCLE_RELEASE_' + checkpoint.id + ': ' + JSON.stringify(settled.machine.velocity));
    assert(Number.isFinite(settled.camera?.position?.x) && Number.isFinite(settled.camera?.position?.z),
      'FAIL_CELL_LIFECYCLE_CAMERA_' + checkpoint.id + ': ' + JSON.stringify(settled.camera));
    assert(check.stream.rebaseCount >= previousRebaseCount,
      'FAIL_CELL_LIFECYCLE_REBASE_REGRESSION_' + checkpoint.id + ': ' + JSON.stringify({ previousRebaseCount, actual: check.stream.rebaseCount }));
    previousRebaseCount = check.stream.rebaseCount;
    captures.push({
      id: checkpoint.id,
      currentCell: check.stream.currentCell,
      logical,
      logicalOrigin: check.stream.logicalOrigin,
      rebaseCount: check.stream.rebaseCount,
      activeCells: [...check.active].sort(),
      pool: check.stream.pool,
      objectCount: objectIds(settled).length,
      trafficCount: trafficIds(settled).length,
      lifecycleEvents: check.stream.cellLifecycle,
    });
    if (checkpoint.id === 'EAST') {
      const openingUnload = check.stream.cellLifecycle.find((event) => event.action === 'UNLOAD'
        && event.x === 0 && event.z === 0);
      assert(!check.active.has('0:0')
          && !objectIds(settled).some((id) => openingObjects.includes(id))
          && !trafficIds(settled).some((id) => openingTraffic.includes(id))
          && openingUnload?.collectibleCount > 0
          && openingUnload?.vehicleCount > 0,
      'FAIL_CELL_LIFECYCLE_UNLOAD_CLEANUP: ' + JSON.stringify({ active: [...check.active], openingObjects, openingTraffic, objectIds: objectIds(settled), trafficIds: trafficIds(settled), openingUnload }));
      assert(check.stream.pool?.released > poolBefore?.released
          && check.stream.pool?.reused > poolBefore?.reused,
      'FAIL_CELL_LIFECYCLE_POOL_TRANSITION: ' + JSON.stringify({ before: poolBefore, east: check.stream.pool }));
    }
    if (checkpoint.id === 'OPENING') {
      const reloaded = check.stream.activeCells.find((cell) => cell.x === 0 && cell.z === 0);
      const openingEvents = check.stream.cellLifecycle.filter((event) => event.x === 0 && event.z === 0);
      const unloadIndex = openingEvents.findIndex((event) => event.action === 'UNLOAD');
      const reload = openingEvents.slice(unloadIndex + 1).find((event) => event.action === 'LOAD');
      assert(reloaded
          && reload?.collectibleCount === openingObjects.length
          && reload?.vehicleCount === openingTraffic.length,
      'FAIL_CELL_LIFECYCLE_OPENING_RELOAD: ' + JSON.stringify({ openingObjects, openingTraffic, reloaded, openingEvents, reload }));
      assert(check.stream.constructionLandmark?.visible === true,
        'FAIL_CELL_LIFECYCLE_GOLDEN_CITY_RELOAD: ' + JSON.stringify(check.stream.constructionLandmark));
    }
  }
  const final = await readRuntimeSnapshot(page);
  const finalStream = validateInfiniteWorldSnapshot(final);
  assert(finalStream.rebaseCount > initialCheck.stream.rebaseCount,
    'FAIL_CELL_LIFECYCLE_REBASE_MISSING: ' + JSON.stringify({ initial: initialCheck.stream.rebaseCount, final: finalStream.rebaseCount }));
  return { opening: { objectIds: openingObjects, trafficIds: openingTraffic }, poolBefore, captures };
}

/**
 * Navigate to an authored world-space point exclusively through the visible
 * joystick. The QA bridge is read-only: it supplies the live camera basis and
 * position so CDP can issue the same camera-relative touch a player would.
 */
async function driveJoystickToLogicalPoint(cdp, page, joystick, target, label, arrivalRadius = 1.6, timeoutMs = 30_000, allowMiss = false, onSnapshot = null, releaseDelayMs = 220) {
  const deadline = Date.now() + timeoutMs;
  let bestDistance = Number.POSITIVE_INFINITY;
  let finalSnapshot = await readRuntimeSnapshot(page);
  if (onSnapshot?.(finalSnapshot)) return finalSnapshot;
  let touchHeld = false;
  try {
    while (Date.now() < deadline) {
    const current = getLogicalPlayerPosition(finalSnapshot);
    const delta = { x: target.x - current.x, z: target.z - current.z };
    const distance = Math.hypot(delta.x, delta.z);
    bestDistance = Math.min(bestDistance, distance);
    if (distance <= arrivalRadius) {
      return finalSnapshot;
    }

    const cameraRight = finalSnapshot.camera.right;
    const cameraForward = finalSnapshot.camera.forward;
    const inputX = (delta.x * cameraRight.x + delta.z * cameraRight.z) / distance;
    const inputY = (delta.x * cameraForward.x + delta.z * cameraForward.z) / distance;
    // Long corridor travel needs a decisive stick, while a target inside the
    // final 24m needs proportionally smaller corrections. A fixed 90% stick
    // can cross a narrow district checkpoint entirely between QA samples and
    // makes an otherwise valid physical route nondeterministic.
    const targetStickMagnitude = distance <= 8
      ? Math.max(0.30, Math.min(0.62, (distance / 8) * 0.62))
      : 0.9;
    const endX = joystick.x + Math.max(-1, Math.min(1, inputX)) * joystick.maxOffsetX * targetStickMagnitude;
    // Browser Y grows downward while Cocos joystick EventTouch coordinates
    // grow upward, hence the sign inversion for the forward component.
    const endY = joystick.y - Math.max(-1, Math.min(1, inputY)) * joystick.maxOffsetY * targetStickMagnitude;
    if (touchHeld) {
      await moveTouchJoystick(cdp, endX, endY);
    } else {
      await beginTouchJoystick(cdp, joystick.x, joystick.y, endX, endY);
      touchHeld = true;
    }
    // Use the actual visible-stick distance to choose a short final press.
    // A fixed 850ms press is natural for long travel but necessarily overshoots
    // a tight resource cluster on the final approach.
    const stickDistance = Math.min(92, Math.hypot(endX - joystick.x, endY - joystick.y));
    const stickMagnitude = Math.max(0, (stickDistance / 92 - 0.1) / 0.9);
    const estimatedSpeed = Math.max(0.5, 7.5 * stickMagnitude);
    const maximumHoldMs = distance <= 8 ? 220 : 850;
    const holdMs = Math.max(120, Math.min(maximumHoldMs,
      Math.round(Math.max(0, distance - arrivalRadius * 0.45) / estimatedSpeed * 1000)));
    // Lifecycle verification needs to observe the production FSM while the
    // same physical touch remains held. A full steering hold can otherwise
    // span the short ATTRACTED transition between two read-only snapshots.
    let engaged;
    if (onSnapshot) {
      let remainingHoldMs = holdMs;
      while (remainingHoldMs > 0) {
        const sampleMs = Math.min(50, remainingHoldMs);
        await page.waitForTimeout(sampleMs);
        remainingHoldMs -= sampleMs;
        engaged = await readRuntimeSnapshot(page);
        if (onSnapshot(engaged)) {
          finalSnapshot = engaged;
          return finalSnapshot;
        }
      }
    } else {
      await page.waitForTimeout(holdMs);
      engaged = await readRuntimeSnapshot(page);
    }
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
    // Keep one real finger down while steering. A release invokes the
    // production hard-stop, so releasing between samples converts continuous
    // travel into repeated zero-velocity starts that a player never performs.
    finalSnapshot = engaged;
    }
  } finally {
    if (touchHeld) {
      await releaseTouchJoystick(cdp);
      if (releaseDelayMs > 0) await page.waitForTimeout(releaseDelayMs);
    }
  }
  const finalPosition = getLogicalPlayerPosition(finalSnapshot);
  // A physical drag can cross the pickup radius between two diagnostic
  // samples and then coast slightly beyond it before the next sample.  The
  // route genuinely reached the target in that case; the next assertion
  // still requires the live Cocos compression system to absorb the item.
  if (bestDistance <= arrivalRadius) return finalSnapshot;
  if (allowMiss) return finalSnapshot;
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
  const record = { levels: [], finalTier5Absorption: null, compression: null };
  const compressionStates = new Set();
  let maximumResourceBlocks = 0;
  let maximumStoredResources = 0;
  let compressionCoinBaseline = null;

  // QABridge exposes this diagnostic as a read-only projection of the live
  // CompressionSystem. Preserve samples across the long real-touch route so
  // the report proves the complete production cycle rather than one frame.
  const observeCompression = (snapshot) => {
    const compression = snapshot.compression || {};
    if (compression.state) compressionStates.add(compression.state);
    for (const entry of compression.stateHistory || []) {
      if (entry?.state) compressionStates.add(entry.state);
    }
    maximumResourceBlocks = Math.max(maximumResourceBlocks, compression.resourceBlockCount || 0);
    maximumStoredResources = Math.max(maximumStoredResources, compression.storedResources || 0);
    if (compressionCoinBaseline === null && Number.isFinite(snapshot.save?.coins)) {
      compressionCoinBaseline = snapshot.save.coins;
    }
  };

  const collectUntil = async (stage) => {
    // High-tier regions intentionally require several ordinary T1/T2
    // compressions before the next machine level. Keep this a generous wall
    // clock for real WebGL + touch input, rather than failing just after the
    // machine reaches 95% of the threshold while a final target is in flight.
    const deadline = Date.now() + 240_000;
    const absorbed = [];
    let latest = await readRuntimeSnapshot(page);
    observeCompression(latest);
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
      observeCompression(latest);
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
  // Resolve live authored T1 positions instead of relying on the former
  // opening-cell coordinate. Creator retains ownership of WHERE; this
  // evidence only drives real portrait input to the registered objects.
  const openingDeadline = Date.now() + 60_000;
  const openingAbsorptions = [];
  let latest = await readRuntimeSnapshot(page);
  observeCompression(latest);
  while (latest.machine.level < 2 && Date.now() < openingDeadline) {
    const origin = validateInfiniteWorldSnapshot(latest).logicalOrigin;
    const player = getLogicalPlayerPosition(latest);
    const target = latest.objects
      .filter((object) => object.state === 'IDLE'
        && object.tier === 1
        && String(object.runtimeId || '').startsWith('cluster_'))
      .map((object) => ({
        ...object,
        logicalX: object.x + origin.x,
        logicalZ: object.z + origin.z,
      }))
      .sort((a, b) => Math.hypot(a.logicalX - player.x, a.logicalZ - player.z)
        - Math.hypot(b.logicalX - player.x, b.logicalZ - player.z))[0];
    assert(target,
      `FAIL_FULL_PROGRESSION_T1_MISSING: ${JSON.stringify({ machine: latest.machine, player, objects: latest.objects })}`);
    const massBefore = latest.machine.mass;
    await driveJoystickToLogicalPoint(
      cdp,
      page,
      joystick,
      { x: target.logicalX, z: target.logicalZ },
      `FULL_PROGRESSION_T1_${target.runtimeId}`,
      // Capture starts inside the machine radius, but the production FSM only
      // switches ATTRACTED -> SUCKING below 0.6m. Finish the physical route
      // inside that core so the evidence can prove the whole FSM instead of
      // merely proving that a target was approached.
      0.45,
    );
    // The real FSM finishes ATTRACTED -> SUCKING -> ABSORBED asynchronously
    // after the genuine touch is released. Keep a short read-only trace so
    // the gate records the production transitions rather than treating one
    // arbitrary delayed sample as a gameplay command.
    const absorptionDeadline = Date.now() + 5_000;
    let absorbed = false;
    const stateTrace = [];
    while (Date.now() < absorptionDeadline && !absorbed) {
      await page.waitForTimeout(100);
      latest = await readRuntimeSnapshot(page);
      observeCompression(latest);
      const currentTarget = latest.objects.find((object) => object.runtimeId === target.runtimeId);
      stateTrace.push({
        elapsedMs: 5_000 - Math.max(0, absorptionDeadline - Date.now()),
        state: currentTarget?.state || 'REMOVED',
        mass: latest.machine.mass,
      });
      absorbed = !currentTarget && latest.machine.mass > massBefore;
    }
    const observedIntermediateState = stateTrace.some((entry) => entry.state === 'ATTRACTED' || entry.state === 'SUCKING');
    assert(absorbed,
    `FAIL_FULL_PROGRESSION_T1_ABSORPTION: ${JSON.stringify({ target, massBefore, player: getLogicalPlayerPosition(latest), machine: latest.machine, objects: latest.objects, stateTrace })}`);
    openingAbsorptions.push({
      runtimeId: target.runtimeId,
      massBefore,
      massAfter: latest.machine.mass,
      observedIntermediateState,
      stateTrace,
    });
  }
  await page.waitForTimeout(3200);
  latest = await readRuntimeSnapshot(page);
  observeCompression(latest);
  assert(latest.machine.level >= 2 && latest.machine.maxTier >= 2,
    `FAIL_FULL_PROGRESSION_LV2: ${JSON.stringify({ machine: latest.machine, openingAbsorptions })}`);
  const t2Origin = validateInfiniteWorldSnapshot(latest).logicalOrigin;
  const t2Player = getLogicalPlayerPosition(latest);
  const t2Target = latest.objects
    .filter((object) => object.state === 'IDLE' && object.tier === 2)
    .map((object) => ({
      ...object,
      logicalX: object.x + t2Origin.x,
      logicalZ: object.z + t2Origin.z,
      tutorial: object.runtimeId === 'tutorial_t2_target',
    }))
    .sort((a, b) => Number(b.tutorial) - Number(a.tutorial)
      || Math.hypot(a.logicalX - t2Player.x, a.logicalZ - t2Player.z)
        - Math.hypot(b.logicalX - t2Player.x, b.logicalZ - t2Player.z))[0];
  assert(t2Target,
    `FAIL_FULL_PROGRESSION_T2_MISSING: ${JSON.stringify({ machine: latest.machine, objects: latest.objects })}`);
  const tier2Before = latest.session.absorbedTiers?.[2] || 0;
  latest = await driveJoystickToLogicalPoint(cdp, page, joystick, { x: t2Target.logicalX, z: t2Target.logicalZ }, `FULL_PROGRESSION_T2_${t2Target.runtimeId}`, 2.3);
  await page.waitForTimeout(1400);
  latest = await readRuntimeSnapshot(page);
  observeCompression(latest);
  assert((latest.session.absorbedTiers?.[2] || 0) > tier2Before,
    `FAIL_FULL_PROGRESSION_T2: ${JSON.stringify({ target: t2Target, absorbedTiers: latest.session?.absorbedTiers })}`);
  record.levels.push({ level: 2, region: 'bedroom', district: 'RESIDENTIAL', mass: latest.machine.mass, maxTier: latest.machine.maxTier, absorbed: openingAbsorptions, activePart: 'MagneticTurbineLeft' });

  for (const stage of stages) {
    latest = await driveJoystickToLogicalPoint(cdp, page, joystick, stage.point, `FULL_PROGRESSION_${stage.region.toUpperCase()}`, 3.2, 70_000);
    await page.waitForTimeout(500);
    latest = await readRuntimeSnapshot(page);
    observeCompression(latest);
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
  observeCompression(latest);
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
  observeCompression(latest);
  assert((latest.session.absorbedTiers?.[5] || 0) > tier5Before,
    `FAIL_FULL_PROGRESSION_T5_ABSORPTION: ${JSON.stringify({ tier5, before: tier5Before, after: latest.session?.absorbedTiers, machine: latest.machine })}`);
  record.finalTier5Absorption = { runtimeId: tier5.runtimeId, type: tier5.type, mass: latest.machine.mass, absorbedTiers: latest.session.absorbedTiers };
  const requiredCompressionStates = ['BUFFERING', 'READY', 'COMPRESSING', 'EJECTING', 'COLLECTING'];
  const observedCompressionStates = requiredCompressionStates.filter((state) => compressionStates.has(state));
  assert(observedCompressionStates.length === requiredCompressionStates.length,
    `FAIL_COMPRESSION_RUNTIME_STATE_CHAIN: ${JSON.stringify({ requiredCompressionStates, observedCompressionStates: [...compressionStates] })}`);
  assert(maximumResourceBlocks > 0 && maximumStoredResources > 0,
    `FAIL_COMPRESSION_RUNTIME_RESOURCE_BLOCK: ${JSON.stringify({ maximumResourceBlocks, maximumStoredResources })}`);
  assert(Number.isFinite(compressionCoinBaseline) && latest.save?.coins > compressionCoinBaseline,
    `FAIL_COMPRESSION_RUNTIME_COIN_SETTLEMENT: ${JSON.stringify({ before: compressionCoinBaseline, after: latest.save?.coins, maximumStoredResources })}`);
  record.compression = {
    status: 'PASS',
    method: 'real-touch progression + read-only CompressionSystem snapshots',
    requiredStates: requiredCompressionStates,
    observedStates: observedCompressionStates,
    resourceBlockCount: maximumResourceBlocks,
    storedResources: maximumStoredResources,
    coinsBefore: compressionCoinBaseline,
    coinsAfter: latest.save?.coins,
  };
  return record;
}

/**
 * S2 exercises a real T5 traffic slot only after the player has reached LV5
 * through ordinary collection. The bridge observes state; every interaction
 * below is an actual portrait joystick touch.
 */
const getTrafficTiming = (snapshot, runtimeId) => (snapshot.world?.streaming?.respawnTiming || [])
    .map((cell) => ({
      cell: { x: cell.x, z: cell.z },
      clock: cell.clock,
      slot: cell.trafficSlots?.find((candidate) => candidate.id === runtimeId) || null,
    }))
    .find((entry) => entry.slot) || null;

// This is deliberately a read-only projection of the cell-owned collectible
// slot. Object presence cannot stand in for the slot because it loses the
// authoritative engine-clock deadline while the object is pooled.
const getCollectibleTiming = (snapshot, runtimeId) => (snapshot.world?.streaming?.respawnTiming || [])
  .map((cell) => ({
    cell: { x: cell.x, z: cell.z },
    clock: cell.clock,
    slot: cell.collectibleSlots?.find((candidate) => candidate.id === runtimeId
      || candidate.customId === runtimeId) || null,
  }))
  .find((entry) => entry.slot) || null;

async function verifyTrafficReplenishment(cdp, page, joystick) {
  let latest = await readRuntimeSnapshot(page);
  assert(latest.machine?.maxTier >= 5,
    `FAIL_TRAFFIC_REPLENISHMENT_LEVEL: ${JSON.stringify(latest.machine)}`);

  const selectTarget = (snapshot) => {
    const origin = snapshot.world?.streaming?.logicalOrigin || { x: 0, z: 0 };
    const player = getLogicalPlayerPosition(snapshot);
    return (snapshot.world?.streaming?.dynamicVehicles || [])
      .filter((vehicle) => vehicle.state === 'DRIVE'
        && vehicle.objectState === 'IDLE'
        && vehicle.routeLength >= 4)
      .map((vehicle) => {
        const object = snapshot.objects.find((candidate) => candidate.runtimeId === vehicle.id
          && candidate.state === 'IDLE' && candidate.tier <= snapshot.machine.maxTier);
        return object ? {
          vehicle,
          object,
          logicalX: vehicle.x + origin.x,
          logicalZ: vehicle.z + origin.z,
          distance: Math.hypot(vehicle.x + origin.x - player.x, vehicle.z + origin.z - player.z),
        } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.distance - right.distance)[0] || null;
  };

  const target = selectTarget(latest);
  assert(target,
    `FAIL_TRAFFIC_REPLENISHMENT_TARGET: ${JSON.stringify({ machine: latest.machine, objects: latest.objects, vehicles: latest.world?.streaming?.dynamicVehicles })}`);
  const tier5Before = latest.session?.absorbedTiers?.[5] || 0;
  const targetId = target.vehicle.id;
  const targetKind = target.vehicle.kind;
  const targetType = target.object.type;
  const targetTier = target.object.tier;
  const vehicleStart = { x: target.vehicle.x, z: target.vehicle.z };
  const poolBeforeAbsorb = latest.world?.streaming?.pool || null;
  await page.waitForTimeout(500);
  latest = await readRuntimeSnapshot(page);
  const movingVehicle = latest.world?.streaming?.dynamicVehicles?.find((entry) => entry.id === targetId);
  assert(movingVehicle && Math.hypot(movingVehicle.x - vehicleStart.x, movingVehicle.z - vehicleStart.z) > 0.05,
    `FAIL_TRAFFIC_REPLENISHMENT_NOT_MOVING: ${JSON.stringify({ targetId, vehicleStart, movingVehicle })}`);
  const absorbDeadline = Date.now() + 55_000;
  let absorbedAt = 0;

  // The target continues driving. Re-read its position between normal joystick
  // approaches instead of freezing it or issuing a test-only movement command.
  while (Date.now() < absorbDeadline) {
    const vehicle = latest.world?.streaming?.dynamicVehicles?.find((entry) => entry.id === targetId);
    const object = latest.objects.find((entry) => entry.runtimeId === targetId);
    if (!vehicle && !object && (latest.session?.absorbedTiers?.[5] || 0) > tier5Before) {
      absorbedAt = Date.now();
      break;
    }
    assert(vehicle && object,
      `FAIL_TRAFFIC_REPLENISHMENT_UNEXPECTED_TARGET_LOSS: ${JSON.stringify({ targetId, vehicle, object, machine: latest.machine })}`);
    const origin = latest.world?.streaming?.logicalOrigin || { x: 0, z: 0 };
    await driveJoystickToLogicalPoint(
      cdp,
      page,
      joystick,
      { x: vehicle.x + origin.x, z: vehicle.z + origin.z },
      `TRAFFIC_T5_${targetId}`,
      Math.max(1.5, latest.machine.suctionRadius * 0.48),
      2_500,
      true,
    );
    // Record the first observable removal promptly.  A long blind wait here
    // would discount part of the real cooldown and make wall-clock evidence
    // falsely report an early respawn.
    const observationDeadline = Date.now() + 800;
    while (Date.now() < observationDeadline) {
      await page.waitForTimeout(100);
      latest = await readRuntimeSnapshot(page);
      const observedVehicle = latest.world?.streaming?.dynamicVehicles?.find((entry) => entry.id === targetId);
      const observedObject = latest.objects.find((entry) => entry.runtimeId === targetId);
      if (!observedVehicle && !observedObject && (latest.session?.absorbedTiers?.[5] || 0) > tier5Before) {
        absorbedAt = Date.now();
        break;
      }
    }
  }
  assert(absorbedAt > 0,
    `FAIL_TRAFFIC_REPLENISHMENT_ABSORB: ${JSON.stringify({ targetId, tier5Before, latest: { machine: latest.machine, absorbedTiers: latest.session?.absorbedTiers, vehicles: latest.world?.streaming?.dynamicVehicles, objects: latest.objects } })}`);
  const absorbTiming = getTrafficTiming(latest, targetId);
  assert(absorbTiming?.slot && absorbTiming.slot.active === false,
    `FAIL_TRAFFIC_REPLENISHMENT_SLOT_NOT_COOLING: ${JSON.stringify({ targetId, absorbTiming })}`);
  const cooldownDeadline = absorbTiming.slot.availableAt;
  const absorptionClock = cooldownDeadline - 4;
  const poolAfterAbsorb = latest.world?.streaming?.pool || null;
  assert(poolBeforeAbsorb && poolAfterAbsorb && poolAfterAbsorb.released > poolBeforeAbsorb.released,
    `FAIL_TRAFFIC_REPLENISHMENT_POOL_RELEASE: ${JSON.stringify({ targetId, poolBeforeAbsorb, poolAfterAbsorb })}`);

  // The slot deliberately respawns at the same road entry. Move the player
  // away through the visible joystick before that deadline, otherwise a valid
  // new vehicle is immediately pulled into SUCKING and cannot demonstrate its
  // required DRIVE/IDLE re-entry state.
  const playerAfterAbsorb = getLogicalPlayerPosition(latest);
  const awayX = playerAfterAbsorb.x - target.logicalX;
  const awayZ = playerAfterAbsorb.z - target.logicalZ;
  const awayLength = Math.hypot(awayX, awayZ) || 1;
  const safeDistance = latest.machine.suctionRadius * 2 + 8;
  await driveJoystickToLogicalPoint(
    cdp,
    page,
    joystick,
    {
      x: playerAfterAbsorb.x + (awayX / awayLength) * safeDistance,
      z: playerAfterAbsorb.z + (awayZ / awayLength) * safeDistance,
    },
    `TRAFFIC_RESPAWN_SAFE_DISTANCE_${targetId}`,
    1.5,
    3_000,
    true,
  );
  latest = await readRuntimeSnapshot(page);

  let lastCooldownSnapshot = latest;
  // Snapshot reads occur after the current engine update. Use the existing
  // slot deadline as the precise cooldown boundary, then verify four engine
  // seconds from the slot's recorded absorption clock.
  while ((getTrafficTiming(lastCooldownSnapshot, targetId)?.clock ?? 0) < cooldownDeadline) {
    await page.waitForTimeout(100);
    lastCooldownSnapshot = await readRuntimeSnapshot(page);
    const cooldownElapsedMs = Date.now() - absorbedAt;
    const currentTiming = getTrafficTiming(lastCooldownSnapshot, targetId);
    if ((currentTiming?.clock ?? 0) >= cooldownDeadline) break;
    assert(!lastCooldownSnapshot.objects.some((object) => object.runtimeId === targetId)
        && !lastCooldownSnapshot.world?.streaming?.dynamicVehicles?.some((vehicle) => vehicle.id === targetId),
    `FAIL_TRAFFIC_REPLENISHMENT_EARLY: ${JSON.stringify({ targetId, cooldownElapsedMs, absorbTiming, currentTiming, player: getLogicalPlayerPosition(lastCooldownSnapshot), vehicles: lastCooldownSnapshot.world?.streaming?.dynamicVehicles })}`);
  }

  const respawnDeadline = absorbedAt + 9_000;
  let respawned = null;
  while (Date.now() < respawnDeadline && !respawned) {
    await page.waitForTimeout(100);
    const snapshot = await readRuntimeSnapshot(page);
    const vehicle = snapshot.world?.streaming?.dynamicVehicles?.find((entry) => entry.id === targetId);
    const object = snapshot.objects.find((entry) => entry.runtimeId === targetId);
    if (vehicle && object) {
      const timing = getTrafficTiming(snapshot, targetId);
      respawned = {
        vehicle,
        object,
        elapsedMs: Date.now() - absorbedAt,
        engineElapsedSeconds: (timing?.clock ?? 0) - absorptionClock,
        timing,
      };
    }
  }
  assert(respawned?.engineElapsedSeconds >= 4
      && respawned.vehicle.kind === targetKind
      && respawned.vehicle.routeLength >= 4
      && respawned.vehicle.state === 'DRIVE'
      && respawned.vehicle.objectState === 'IDLE'
      && respawned.object.state === 'IDLE'
      && respawned.object.type === targetType
      && respawned.object.tier === targetTier,
  `FAIL_TRAFFIC_REPLENISHMENT: ${JSON.stringify({ target: { targetId, targetKind, targetType, targetTier }, absorbTiming, respawned })}`);
  const poolAfterRespawn = (await readRuntimeSnapshot(page)).world?.streaming?.pool || null;
  assert(poolAfterRespawn && poolAfterRespawn.reused > poolAfterAbsorb.reused,
    `FAIL_TRAFFIC_REPLENISHMENT_POOL_REUSE: ${JSON.stringify({ targetId, poolAfterAbsorb, poolAfterRespawn })}`);
  return {
    runtimeId: targetId,
    kind: targetKind,
    type: targetType,
    tier: targetTier,
    cooldownAbsent: true,
    moved: true,
    pool: { beforeAbsorb: poolBeforeAbsorb, afterAbsorb: poolAfterAbsorb, afterRespawn: poolAfterRespawn },
    timing: { absorb: absorbTiming, respawn: getTrafficTiming(await readRuntimeSnapshot(page), targetId) },
    respawned: { state: respawned.vehicle.state, objectState: respawned.vehicle.objectState, routeLength: respawned.vehicle.routeLength },
    elapsedMs: respawned.elapsedMs,
    engineElapsedSeconds: respawned.engineElapsedSeconds,
  };
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
    report.runtimeObservations.push({
      viewport: viewport.id,
      phase: 'home',
      performance: snapshot.performance || null,
    });

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
      if (acceptanceScope === 'golden-city') {
        report.goldenCity = await collectGoldenCityBaseline(cdp, page, canvasRect, snapshot);
        // A baseline can expose contract failures; that is the intended next
        // input to a targeted fix, not permission to label Golden City PASS.
        assert(runtimeErrors.length === 0,
          `Runtime console errors during Golden City baseline: ${runtimeErrors.join(' | ')}`);
        return;
      }
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
      if (acceptanceScope === 'arena-ai') {
        report.arenaAi = await verifyArenaAiRuntime(cdp, page, canvasRect);
        assert(runtimeErrors.length === 0, `Runtime console errors after Arena AI runtime: ${runtimeErrors.join(' | ')}`);
        return;
      }
      if (acceptanceScope === 'arena') {
        const start = pointForVisibleNode(canvasRect, snapshot, snapshot.ui?.start, 'ARENA_HOME_START');
        await dispatchTouchTap(cdp, start.x, start.y);
        await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
        const mode = await readRuntimeSnapshot(page);
        report.arena = await verifyArenaFlow(cdp, page, canvasRect, mode);
        assert(runtimeErrors.length === 0, `Runtime console errors after Arena flow: ${runtimeErrors.join(' | ')}`);
        return;
      }
      if (acceptanceScope === 'revive') {
        report.revive = await verifyReviveFlow(cdp, page, canvasRect, snapshot);
        assert(runtimeErrors.length === 0, `Runtime console errors after Revive flow: ${runtimeErrors.join(' | ')}`);
        return;
      }
      if (acceptanceScope === 'settlement') {
        report.settlement = await verifySettlementFlow(cdp, page, canvasRect, snapshot);
        assert(runtimeErrors.length === 0, 'Runtime console errors after Settlement flow: ' + runtimeErrors.join(' | '));
        return;
      }
      if (acceptanceScope === 'save-resume') {
        report.saveResume = await verifySaveResume(cdp, page, canvasRect, snapshot);
        assert(runtimeErrors.length === 0, 'Runtime console errors after save-resume: ' + runtimeErrors.join(' | '));
        return;
      }
      if (acceptanceScope === 'ui-full-flow') {
        report.uiFullFlow = await verifyUiFullFlow(cdp, page, canvasRect, snapshot);
        assert(runtimeErrors.length === 0, 'Runtime console errors after UI full flow: ' + runtimeErrors.join(' | '));
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
        report.trafficReplenishment = await verifyTrafficReplenishment(cdp, page, joystick);
        await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-lv5-city.png') });
        const machineBeforeReload = await readRuntimeSnapshot(page);
        const savedMachine = {
          mass: machineBeforeReload.machine.mass,
          level: machineBeforeReload.machine.level,
        };
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 45000 });
        const machineAfterReload = await readRuntimeSnapshot(page);
        assert(machineAfterReload.machine.mass === savedMachine.mass,
          `FAIL_MACHINE_SAVE_RESUME_MASS: ${JSON.stringify({ before: savedMachine.mass, after: machineAfterReload.machine.mass })}`);
        assert(machineAfterReload.machine.level === savedMachine.level,
          `FAIL_MACHINE_SAVE_RESUME_LEVEL: ${JSON.stringify({ before: savedMachine.level, after: machineAfterReload.machine.level })}`);
        report.machineSaveResume = {
          status: 'PASS',
          method: 'real-touch progression + page.reload() + read-only snapshot',
          beforeReload: savedMachine,
          afterReload: {
            mass: machineAfterReload.machine.mass,
            level: machineAfterReload.machine.level,
          },
        };
        assert(runtimeErrors.length === 0, `Runtime console errors after LV1-to-LV5 touch progression: ${runtimeErrors.join(' | ')}`);
        return;
      }
      if (acceptanceScope === 'cell-lifecycle') {
        const startButton = snapshot.ui?.start;
        const start = pointForVisibleNode(canvasRect, snapshot, startButton, 'CELL_LIFECYCLE_HOME_START');
        await dispatchTouchTap(cdp, start.x, start.y);
        await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
        const mode = await readRuntimeSnapshot(page);
        const endless = pointForVisibleNode(canvasRect, mode, mode.ui?.modeEndless, 'CELL_LIFECYCLE_MODE_ENDLESS');
        await dispatchTouchTap(cdp, endless.x, endless.y);
        await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });
        const gameplay = await readRuntimeSnapshot(page);
        const joystickCenter = pointForVisibleNode(canvasRect, gameplay, gameplay.ui?.runtimeHUD?.joystick, 'CELL_LIFECYCLE_JOYSTICK');
        const joystick = {
          x: joystickCenter.x,
          y: joystickCenter.y,
          maxOffsetX: Math.min(120, canvasRect.width - (joystickCenter.x - canvasRect.left) - 3),
          maxOffsetY: Math.min(120, canvasRect.top + canvasRect.height - joystickCenter.y - 3),
        };
        report.cellLifecycle = await verifyCellLifecycle(cdp, page, joystick);
        assert(runtimeErrors.length === 0, `Runtime console errors after cell lifecycle touch traversal: ${runtimeErrors.join(' | ')}`);
        return;
      }
      if (acceptanceScope === 'skin-unlock') {
        const startButton = snapshot.ui?.start;
        const start = pointForVisibleNode(canvasRect, snapshot, startButton, 'SKIN_UNLOCK_HOME_START');
        await dispatchTouchTap(cdp, start.x, start.y);
        try {
          await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
        } catch (error) {
          const actual = await readRuntimeSnapshot(page);
          throw new Error(`FAIL_SKIN_UNLOCK_HOME_START: ${JSON.stringify({ startButton, tap: start, state: actual.gameState, ui: actual.ui, error: String(error) })}`);
        }
        const mode = await readRuntimeSnapshot(page);
        const endless = pointForVisibleNode(canvasRect, mode, mode.ui?.modeEndless, 'SKIN_UNLOCK_MODE_ENDLESS');
        await dispatchTouchTap(cdp, endless.x, endless.y);
        try {
          await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });
        } catch (error) {
          const actual = await readRuntimeSnapshot(page);
          throw new Error(`FAIL_SKIN_UNLOCK_MODE_ENDLESS: ${JSON.stringify({ endless, state: actual.gameState, ui: actual.ui, error: String(error) })}`);
        }
        const gameplay = await readRuntimeSnapshot(page);
        const joystickCenter = pointForVisibleNode(canvasRect, gameplay, gameplay.ui?.runtimeHUD?.joystick, 'SKIN_UNLOCK_JOYSTICK');
        const joystick = {
          x: joystickCenter.x,
          y: joystickCenter.y,
          maxOffsetX: Math.min(120, canvasRect.width - (joystickCenter.x - canvasRect.left) - 3),
          maxOffsetY: Math.min(120, canvasRect.top + canvasRect.height - joystickCenter.y - 3),
        };
        report.fullProgression = await verifyFiveLevelProgression(cdp, page, joystick);
        report.paidSkinUnlock = await verifyPaidSkinUnlock(cdp, page, canvasRect);
        assert(runtimeErrors.length === 0, `Runtime console errors after paid skin unlock: ${runtimeErrors.join(' | ')}`);
        return;
      }
      if (acceptanceScope === 'skins') {
        report.homeSkin = await verifyHomeSkin(cdp, page, canvasRect);
        assert(runtimeErrors.length === 0, `Runtime console errors after skin selection: ${runtimeErrors.join(' | ')}`);
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
      // Let Creator finish the post-activation imported-renderer material
      // binding before capturing the release-evidence frame. The runtime
      // itself performs only two bounded rebinds; this is not a test setter.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const gameplaySnapshot = await readRuntimeSnapshot(page);
      // Capture the actual settled opening composition before any later
      // diagnostic assertion can abort the run. This prevents a previous
      // passing PNG being mistaken for evidence of a currently failing build.
      const endlessInitialScreenshot = path.join(evidenceDirectory, 'portrait-390x844-endless-initial.png');
      await page.screenshot({ path: endlessInitialScreenshot });
      report.openingScreenshotPixels = assertNoLargeHotMagentaSurface(endlessInitialScreenshot);
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
      const hasImportedSpecGlossiness = openingWorldVisuals.some((group) => group.renderers?.some((renderer) => renderer.materials?.some((material) => material.effect === 'util/dcc/imported-specular-glossiness')));
      assert(!hasImportedSpecGlossiness,
        `FAIL_OPENING_IMPORTED_MATERIAL_FALLBACK: ${JSON.stringify(openingWorldVisuals)}`);
      const groundGroup = openingWorldVisuals.find((row) => row.name === 'Ground');
      const groundTiles = groundGroup?.renderers?.filter((renderer) => renderer.name === 'tile-low') || [];
      assert(groundGroup?.active === true && groundTiles.length === 4
        && groundTiles.every((renderer) => renderer.primitiveCount > 0
          && renderer.materials?.every((material) => material.valid && material.effect)),
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
      report.runtimeObservations.push({
        viewport: viewport.id,
        phase: 'endless-opening',
        performance: gameplaySnapshot.performance || null,
      });

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
      // Verify the authored LV1 lock before any broad control calibration.
      // The eight-direction probe is deliberately real gameplay input and can
      // legitimately collect nearby T1 objects, which would invalidate an LV1
      // gate later in the same player session.
      const authoredT2Target = (await readRuntimeSnapshot(page)).objects
        .find((object) => object.runtimeId === 'tutorial_t2_target');
      assert(authoredT2Target,
        'FAIL_VERTICAL_SLICE_T2_AUTHORING_TARGET_MISSING: tutorial_t2_target was not registered from the opening cell authoring data');
      const authoredT2Point = { x: authoredT2Target.x, z: authoredT2Target.z };
      await driveJoystickToLogicalPoint(cdp, page, joystick, authoredT2Point, 'T2_LOCK', 2.3);
      await page.waitForTimeout(700);
      const lockedT2Snapshot = await readRuntimeSnapshot(page);
      // Only the approached authored tutorial target participates in this
      // interaction check. Other streamed T2 objects remain correctly idle
      // and must not display a lock while they are outside suction range.
      const lockedT2 = lockedT2Snapshot.objects.find((object) => object.runtimeId === 'tutorial_t2_target' && object.lockVisible);
      assert(lockedT2,
        `FAIL_VERTICAL_SLICE_T2_LOCK: ${JSON.stringify({
          target: lockedT2Snapshot.objects.find((object) => object.runtimeId === 'tutorial_t2_target'),
          player: lockedT2Snapshot.player,
          machine: lockedT2Snapshot.machine,
        })}`);
      assert(lockedT2Snapshot.machine.level === 1 && lockedT2Snapshot.machine.maxTier === 1,
        `FAIL_VERTICAL_SLICE_T2_LOCK_MACHINE_NOT_LV1: ${JSON.stringify({ machine: lockedT2Snapshot.machine })}`);
      assert(lockedT2.state !== 'ABSORBED' && lockedT2.state !== 'RECYCLED',
        `FAIL_VERTICAL_SLICE_T2_LOCK_TARGET_UNAVAILABLE: ${JSON.stringify({ target: lockedT2 })}`);
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

      // The first-cell route now advances from the proved LV1 lock through the
      // real player-facing tier flow before the 500m traversal moves away from
      // its tutorial district. Every movement below is raw CDP touch input.
      // Resolve the authored T1 slots from the runtime snapshot rather than
      // navigating to a historical centre point. Creator owns these points,
      // and a physical route must collect enough of their real objects to
      // cross the LV2 threshold without a test-side grant.
      const t1Absorptions = [];
      let resourceReplenishment = null;
      let t1Snapshot = await readRuntimeSnapshot(page);
      while (t1Snapshot.machine.level < 2) {
        const logicalOrigin = t1Snapshot.world?.streaming?.logicalOrigin || { x: 0, z: 0 };
        const player = getLogicalPlayerPosition(t1Snapshot);
        const targets = t1Snapshot.objects
          .filter((object) => object.state === 'IDLE'
            && object.tier === 1
            && String(object.runtimeId || '').startsWith('cluster_'))
          .map((object) => ({
            ...object,
            logicalX: object.x + logicalOrigin.x,
            logicalZ: object.z + logicalOrigin.z,
          }))
          .sort((a, b) => Math.hypot(a.logicalX - player.x, a.logicalZ - player.z)
            - Math.hypot(b.logicalX - player.x, b.logicalZ - player.z));
        assert(targets.length > 0,
          `FAIL_VERTICAL_SLICE_NO_AUTHORED_T1_TARGET: ${JSON.stringify({ machine: t1Snapshot.machine, player, objects: t1Snapshot.objects })}`);
        const target = targets[0];
        const massBefore = t1Snapshot.machine.mass;
        const lifecycleStartedAt = Date.now();
        const lifecycleTrace = [];
        let removalObservedAt = null;
        let removalTiming = null;
        let removalSnapshot = null;
        const observeCollectibleLifecycle = (snapshot, phase) => {
          const object = snapshot.objects.find((candidate) => candidate.runtimeId === target.runtimeId) || null;
          const timing = getCollectibleTiming(snapshot, target.runtimeId);
          // ABSORBED is immediately pooled by production; a later read can
          // only observe its legitimate removal plus the gained machine mass.
          const state = object?.state || (snapshot.machine.mass > massBefore ? 'ABSORBED/RECYCLED' : 'MISSING');
          const previous = lifecycleTrace[lifecycleTrace.length - 1] || null;
          if (!previous || previous.state !== state || state === 'ABSORBED/RECYCLED') {
            lifecycleTrace.push({
              elapsedMs: Date.now() - lifecycleStartedAt,
              phase,
              state,
              objectPresent: Boolean(object),
              mass: snapshot.machine.mass,
              timing: timing ? {
                cell: timing.cell,
                clock: timing.clock,
                active: timing.slot.active,
                availableAt: timing.slot.availableAt,
              } : null,
            });
          }
          if (state === 'ABSORBED/RECYCLED' && removalObservedAt === null) {
            removalObservedAt = Date.now();
            removalTiming = timing;
            removalSnapshot = snapshot;
          }
          // Stop the approach on the first real pooled observation. Waiting
          // for a later route-completion snapshot would spend part of the
          // production cooldown before the escape touch can begin.
          return state === 'ABSORBED/RECYCLED';
        };
        observeCollectibleLifecycle(t1Snapshot, 'BEFORE_TOUCH');
        t1Snapshot = await driveJoystickToLogicalPoint(
          cdp,
          page,
          joystick,
          { x: target.logicalX, z: target.logicalZ },
          `T1_${target.runtimeId}`,
          Math.max(1.0, t1Snapshot.machine.suctionRadius * 0.62),
          30_000,
          false,
          (snapshot) => observeCollectibleLifecycle(snapshot, 'TOUCH_ROUTE'),
          0,
        );
        const absorptionDeadline = Date.now() + 3_000;
        while (Date.now() < absorptionDeadline) {
          await page.waitForTimeout(80);
          t1Snapshot = await readRuntimeSnapshot(page);
          observeCollectibleLifecycle(t1Snapshot, 'POST_TOUCH');
          if (!t1Snapshot.objects.some((object) => object.runtimeId === target.runtimeId) && t1Snapshot.machine.mass > massBefore) break;
        }
        const remainingTarget = t1Snapshot.objects.find((object) => object.runtimeId === target.runtimeId);
        const absorbed = !remainingTarget;
        assert(absorbed && t1Snapshot.machine.mass > massBefore,
          `FAIL_VERTICAL_SLICE_T1_NOT_ABSORBED: ${JSON.stringify({ target, massBefore, machine: t1Snapshot.machine, objects: t1Snapshot.objects })}`);
        const expectedLifecycle = ['IDLE', 'ATTRACTED', 'SUCKING', 'ABSORBED/RECYCLED'];
        const lifecycleIndexes = expectedLifecycle.map((state) => lifecycleTrace.findIndex((entry) => entry.state === state));
        assert(lifecycleIndexes.every((index, position) => index >= 0 && (position === 0 || index > lifecycleIndexes[position - 1])),
          `FAIL_COLLECTIBLE_LIFECYCLE_ORDER: ${JSON.stringify({ target, expectedLifecycle, lifecycleTrace })}`);
        assert(removalObservedAt !== null,
          `FAIL_COLLECTIBLE_TERMINAL_OBSERVATION: ${JSON.stringify({ target, massBefore, lifecycleTrace })}`);
        t1Absorptions.push({ runtimeId: target.runtimeId, massBefore, massAfter: t1Snapshot.machine.mass, lifecycle: { expected: expectedLifecycle, observed: lifecycleTrace } });
        if (!resourceReplenishment) {
          const absorbTiming = removalTiming || getCollectibleTiming(removalSnapshot || t1Snapshot, target.runtimeId);
          assert(absorbTiming?.slot && absorbTiming.slot.active === false
              && absorbTiming.clock < absorbTiming.slot.availableAt
              && Number.isFinite(absorbTiming.slot.availableAt),
          `FAIL_RESOURCE_RESPAWN_SLOT_TIMING_UNAVAILABLE: ${JSON.stringify({ target, absorbTiming, respawnTiming: t1Snapshot.world?.streaming?.respawnTiming })}`);
          const cooldownDeadline = absorbTiming.slot.availableAt;
          const absorptionClock = absorbTiming.clock;
          const configuredCooldownMs = 4_000;
          const minimumObservedCooldownMs = configuredCooldownMs - 400;
          const playerAtAbsorption = getLogicalPlayerPosition(removalSnapshot || t1Snapshot);
          const departure = {
            x: playerAtAbsorption.x - target.logicalX,
            z: playerAtAbsorption.z - target.logicalZ,
          };
          const departureLength = Math.hypot(departure.x, departure.z) || 1;
          // Keep a full-deflection touch held while moving radially outward.
          // The live player position determines each renewed direction, so
          // camera rotation and tiny post-absorption displacement cannot turn
          // this into a shallow, fixed-target route that remains in range.
          const requiredEscapeDistance = t1Snapshot.machine.suctionRadius * 2;
          const escapeDirection = departureLength > 0.05
            ? { x: departure.x / departureLength, z: departure.z / departureLength }
            : { x: 1, z: 0 };

          const cooldownObservations = [];
          let lastInactiveTiming = null;
          let firstDeadlineTouchSample = null;
          const recordCooldownSample = (snapshot, phase) => {
            const current = snapshot.objects.find((object) => object.runtimeId === target.runtimeId) || null;
            const timing = getCollectibleTiming(snapshot, target.runtimeId);
            const player = getLogicalPlayerPosition(snapshot);
            const observation = {
              elapsedMs: Date.now() - lifecycleStartedAt,
              phase,
              clock: timing?.clock ?? null,
              active: timing?.slot?.active ?? null,
              availableAt: timing?.slot?.availableAt ?? null,
              objectState: current?.state || null,
              player,
            };
            cooldownObservations.push(observation);
            assert(timing?.slot,
              `FAIL_RESOURCE_RESPAWN_SLOT_TIMING_UNAVAILABLE: ${JSON.stringify({ target, timing, respawnTiming: snapshot.world?.streaming?.respawnTiming })}`);
            if (timing.clock < cooldownDeadline) {
              lastInactiveTiming = timing;
              assert(timing.slot.active === false
                  && timing.slot.availableAt === cooldownDeadline
                  && !current,
              `FAIL_RESOURCE_RESPAWN_EARLY: ${JSON.stringify({ target, cooldownDeadline, timing, current, player, phase })}`);
              return false;
            }
            firstDeadlineTouchSample = { snapshot, current, timing, player, observation };
            return true;
          };

          // Sample the authoritative cell clock while one real CDP touch is
          // held at maximum joystick deflection. We renew its camera-relative
          // outward vector from each live snapshot, then release immediately
          // at the first post-deadline sample.
          let escapeSnapshot = removalSnapshot || t1Snapshot;
          let escapeTouchHeld = false;
          const escapeDeadline = Date.now() + 6_000;
          try {
            while (!firstDeadlineTouchSample && Date.now() < escapeDeadline) {
              const player = getLogicalPlayerPosition(escapeSnapshot);
              const radial = {
                x: player.x - target.logicalX,
                z: player.z - target.logicalZ,
              };
              const radialLength = Math.hypot(radial.x, radial.z);
              const outward = radialLength > 0.05
                ? { x: radial.x / radialLength, z: radial.z / radialLength }
                : escapeDirection;
              const cameraRight = escapeSnapshot.camera.right;
              const cameraForward = escapeSnapshot.camera.forward;
              const inputX = outward.x * cameraRight.x + outward.z * cameraRight.z;
              const inputY = outward.x * cameraForward.x + outward.z * cameraForward.z;
              const inputLength = Math.hypot(inputX, inputY) || 1;
              const endX = joystick.x + (inputX / inputLength) * joystick.maxOffsetX;
              const endY = joystick.y - (inputY / inputLength) * joystick.maxOffsetY;
              if (escapeTouchHeld) {
                await moveTouchJoystick(cdp, endX, endY);
              } else {
                await beginTouchJoystick(cdp, joystick.x, joystick.y, endX, endY);
                // beginTouchJoystick ramps through the browser's native touch
                // sequence; immediately renew at full deflection afterwards.
                await moveTouchJoystick(cdp, endX, endY);
                escapeTouchHeld = true;
              }
              await page.waitForTimeout(50);
              escapeSnapshot = await readRuntimeSnapshot(page);
              recordCooldownSample(escapeSnapshot, 'ESCAPE_FULL_DEFLECTION');
            }
          } finally {
            if (escapeTouchHeld) await releaseTouchJoystick(cdp);
          }

          let firstRespawnSample = firstDeadlineTouchSample;
          const observationDeadline = Date.now() + 6_000;
          while (Date.now() < observationDeadline && !firstRespawnSample) {
            await page.waitForTimeout(50);
            const snapshot = await readRuntimeSnapshot(page);
            if (recordCooldownSample(snapshot, 'POST_ESCAPE')) {
              const current = snapshot.objects.find((object) => object.runtimeId === target.runtimeId) || null;
              firstRespawnSample = {
                snapshot,
                current,
                timing: getCollectibleTiming(snapshot, target.runtimeId),
                player: getLogicalPlayerPosition(snapshot),
                observation: cooldownObservations[cooldownObservations.length - 1],
              };
            }
          }
          assert(firstRespawnSample,
            `FAIL_RESOURCE_RESPAWN_DEADLINE_NOT_REACHED: ${JSON.stringify({ target, cooldownDeadline, cooldownObservations })}`);
          const firstRespawnSnapshot = firstRespawnSample.snapshot;
          const cooldownTiming = firstRespawnSample.timing;
          const escapedPlayer = firstRespawnSample.player;
          const respawned = firstRespawnSample.current;
          const respawnObservedAt = Date.now();
          assert(Math.hypot(escapedPlayer.x - target.logicalX, escapedPlayer.z - target.logicalZ) > requiredEscapeDistance,
            `FAIL_RESOURCE_RESPAWN_ESCAPE_DISTANCE: ${JSON.stringify({ target, requiredEscapeDistance, escapedPlayer, machine: firstRespawnSnapshot.machine, cooldownObservations })}`);
          assert(cooldownTiming.slot.active === true && respawned?.state === 'IDLE',
            `FAIL_RESOURCE_RESPAWN_FIRST_REACTIVATION: ${JSON.stringify({ target, cooldownDeadline, timing: cooldownTiming, current: respawned, escapedPlayer, cooldownObservations })}`);
          observeCollectibleLifecycle(firstRespawnSnapshot, 'RESPAWN');
          const observedCooldownMs = respawnObservedAt - removalObservedAt;
          assert(respawned?.state === 'IDLE'
              && respawned.tier === target.tier
              && respawned.type === target.type
              && cooldownTiming?.slot?.active === true
              && cooldownTiming.clock >= cooldownDeadline
              && Math.hypot((respawned.x + (t1Snapshot.world?.streaming?.logicalOrigin?.x || 0)) - target.logicalX,
                (respawned.z + (t1Snapshot.world?.streaming?.logicalOrigin?.z || 0)) - target.logicalZ) < 0.25,
          `FAIL_RESOURCE_REPLENISHMENT: ${JSON.stringify({ target, respawned, configuredCooldownMs, minimumObservedCooldownMs, observedCooldownMs, cooldownDeadline, absorbTiming, cooldownTiming, lifecycleTrace })}`);
          resourceReplenishment = {
            runtimeId: target.runtimeId,
            tier: target.tier,
            type: target.type,
            cooldownAbsent: true,
            lifecycle: {
              ordered: ['IDLE', 'ATTRACTED', 'SUCKING', 'ABSORBED/RECYCLED', 'RESPAWN'],
              observed: lifecycleTrace,
              terminalEvidence: { objectRemoved: true, massBefore, massAfter: t1Snapshot.machine.mass, observedAtMs: removalObservedAt - lifecycleStartedAt },
            },
            cooldown: {
              configuredMs: configuredCooldownMs,
              minimumObservedMs: minimumObservedCooldownMs,
              observedMs: observedCooldownMs,
              authoritative: 'cell-respawn-clock',
              absorptionClock,
              availableAt: cooldownDeadline,
              remainingAtEscapeMs: Math.max(0, (cooldownDeadline - (lastInactiveTiming?.clock || absorptionClock)) * 1_000),
              observedEngineSeconds: cooldownTiming.clock - absorptionClock,
              absorb: absorbTiming,
              escape: lastInactiveTiming,
              lastInactive: lastInactiveTiming,
              observations: cooldownObservations,
              finalObservation: cooldownTiming,
              removalObservedAtMs: removalObservedAt - lifecycleStartedAt,
              respawnObservedAtMs: respawnObservedAt - lifecycleStartedAt,
            },
            respawned: { state: respawned.state, x: respawned.x, z: respawned.z },
          };
        }
      }
      report.verticalSlice.t1Absorptions = t1Absorptions;
      report.resourceReplenishment = resourceReplenishment;
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

      await driveJoystickToLogicalPoint(cdp, page, joystick, authoredT2Point, 'T2_UNLOCK', 2.3);
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
  settlement: null,
  uiFullFlow: null,
  arenaTimer: null,
  network: null,
  regions: null,
  fullProgression: null,
  trafficReplenishment: null,
  machineSaveResume: null,
  saveResume: null,
  cellLifecycle: null,
  paidSkinUnlock: null,
  goldenCity: null,
  runtimeObservations: [],
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
    ? `http://127.0.0.1:${address.port}/?qa=1&arenaProbe=${encodeURIComponent(networkProbeEndpoint)}`
    : `http://127.0.0.1:${address.port}/?qa=1`;
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });

  const targetViewports = acceptanceScope === 'pages' || acceptanceScope === 'revive' || acceptanceScope === 'settlement' || acceptanceScope === 'ui-full-flow' || acceptanceScope === 'skins' || acceptanceScope === 'skin-unlock' || acceptanceScope === 'arena-timer' || acceptanceScope === 'arena-ai' || acceptanceScope === 'network' || acceptanceScope === 'regions' || acceptanceScope === 'progression' || acceptanceScope === 'golden-city' || acceptanceScope === 'save-resume'
    ? requiredPortraitViewports.filter((viewport) => viewport.id === '390x844')
    : requiredPortraitViewports;
  for (const viewport of targetViewports) {
    console.log(`[acceptance:v2] Verifying ${viewport.id}...`);
    await runPortraitCase(browser, baseUrl, viewport, report);
  }
  report.status = acceptanceScope === 'golden-city' ? 'BASELINE_COLLECTED' : 'PASS';
  console.log(acceptanceScope === 'golden-city'
    ? '[acceptance:v2] BASELINE_COLLECTED: real Golden City measurement and CDP touch verified.'
    : '[acceptance:v2] PASS: real portrait Cocos runtime and CDP touch verified.');
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
