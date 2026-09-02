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
      const x = canvasRect.left + canvasRect.width * 0.5;
      const homeStartY = canvasRect.top + canvasRect.height * 0.773;
      await dispatchTouchTap(cdp, x, homeStartY);
      await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });
      await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-mode.png') });

      const endlessY = canvasRect.top + canvasRect.height * 0.645;
      await dispatchTouchTap(cdp, x, endlessY);
      await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });
      const gameplaySnapshot = await readRuntimeSnapshot(page);
      assert(gameplaySnapshot.ui.runtimeHUD?.joystick?.active,
        `FAIL_VISIBLE_JOYSTICK: ${JSON.stringify(gameplaySnapshot.ui.runtimeHUD)}`);
      report.infiniteWorld.initial = validateInfiniteWorldSnapshot(gameplaySnapshot);

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
          `FAIL_TOUCH_INPUT_${direction.name.toUpperCase()}: joystick input ${JSON.stringify(input)}`);
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
      await page.screenshot({ path: path.join(evidenceDirectory, 'portrait-390x844-gameplay.png') });
    }
  } finally {
    await context.close();
  }
}

const report = {
  status: 'RUNNING',
  runner: 'official-cocos-cli + Playwright CDP touch',
  build: null,
  viewports: [],
  touch: [],
  multiTouch: null,
  camera: null,
  infiniteWorld: { initial: null, cardinal500m: [] },
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

  for (const viewport of requiredPortraitViewports) {
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
