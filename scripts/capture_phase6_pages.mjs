/**
 * PHASE 6 / PHASE 7 visual capture tool (QA-only, not a gate).
 *
 * The portrait acceptance runner (scripts/test_cocos_portrait_acceptance.mjs)
 * already captures Home / Mode Select / Gameplay / Pause / Settlement / Arena /
 * Revive / Skin. It does NOT capture the two Mode Ready pages, the joystick
 * close-up, or the transient tier-upgrade banner, which are exactly the surfaces
 * PHASE 6/7 touch.
 *
 * This script therefore serves the already-built `cocos/build/web-mobile` slot
 * on loopback and drives the real runtime with CDP touch, using only the
 * read-only `__BHR_QA__` snapshot for node positions. It never mutates the
 * scene, never calls a game setter, and is deliberately NOT wired into any
 * `npm test` script.
 *
 * Usage: node scripts/capture_phase6_pages.mjs [label]
 *   label defaults to "before"; writes
 *   artifacts/qa/portrait/phase6-<label>-*.png
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const evidenceDirectory = path.join(repoRoot, 'artifacts', 'qa', 'portrait');
const label = (process.argv[2] || 'before').replace(/[^a-z0-9-]/gi, '');
const viewport = { id: '390x844', width: 390, height: 844 };

if (!existsSync(path.join(buildDirectory, 'index.html'))) {
  throw new Error('No built web-mobile package at ' + buildDirectory);
}
mkdirSync(evidenceDirectory, { recursive: true });

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
      if (!existsSync(filePath)) { response.writeHead(404).end('Not found'); return; }
      const extension = path.extname(filePath).toLowerCase();
      const contentType = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.wasm': 'application/wasm',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.webp': 'image/webp',
      }[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readSnapshot(page) {
  return page.evaluate(() => window.__BHR_QA__.snapshot());
}

async function dragJoystick(cdp, startX, startY, endX, endY) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY }] });
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: Math.round(startX + (endX - startX) * step / 8),
        y: Math.round(startY + (endY - startY) * step / 8),
      }],
    });
    await sleep(24);
  }
}

async function releaseJoystick(cdp) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

function logicalPosition(snapshot) {
  const origin = snapshot.world?.streaming?.logicalOrigin;
  if (!origin || !Number.isFinite(snapshot.player?.x) || !Number.isFinite(snapshot.player?.z)) return null;
  return { x: snapshot.player.x + origin.x, z: snapshot.player.z + origin.z };
}

/**
 * Real joystick drive to a logical world point, borrowed from
 * `capture_filing_gameplay_screenshots.mjs`. The only input is a touch drag; no
 * setter, grant or teleport is used.
 */
async function driveTo(cdp, page, joystick, target, radius = 1.6, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let snapshot = await readSnapshot(page);
  while (Date.now() < deadline) {
    const position = logicalPosition(snapshot);
    if (!position) return snapshot;
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= radius) return snapshot;
    const right = snapshot.camera.right;
    const forward = snapshot.camera.forward;
    const inputX = (dx * right.x + dz * right.z) / distance;
    const inputY = (dx * forward.x + dz * forward.z) / distance;
    const magnitude = distance > 8 ? 0.9 : Math.max(0.30, Math.min(0.62, distance / 8 * 0.62));
    const endX = joystick.x + Math.max(-1, Math.min(1, inputX)) * joystick.maxOffsetX * magnitude;
    const endY = joystick.y - Math.max(-1, Math.min(1, inputY)) * joystick.maxOffsetY * magnitude;
    await dragJoystick(cdp, joystick.x, joystick.y, endX, endY);
    const velocityDistance = Math.min(92, Math.hypot(endX - joystick.x, endY - joystick.y));
    const estimatedSpeed = Math.max(0.5, 7.5 * Math.max(0, (velocityDistance / 92 - 0.1) / 0.9));
    const holdMs = Math.max(120, Math.min(distance <= 8 ? 220 : 850,
      Math.round(Math.max(0, distance - radius * 0.45) / estimatedSpeed * 1000)));
    await sleep(holdMs);
    await releaseJoystick(cdp);
    await sleep(200);
    snapshot = await readSnapshot(page);
  }
  return snapshot;
}

async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(70);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

function pointFor(canvasRect, snapshot, node, name) {
  if (!node?.active || !node?.screen) {
    throw new Error(`capture: node not visible: ${name} ` + JSON.stringify(node));
  }
  return {
    x: canvasRect.left + canvasRect.width * node.screen.x,
    y: canvasRect.top + canvasRect.height * node.screen.y,
  };
}

const server = await createStaticServer(buildDirectory);
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/?qa=1`;
let browser = null;
const written = [];

try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
  });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(String(error)));

  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__), undefined, { timeout: 90_000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60_000 });
  await sleep(1200);

  const cdp = await context.newCDPSession(page);
  const canvasRect = await page.locator('#GameCanvas').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });

  const shoot = async (name, clip) => {
    const file = path.join(evidenceDirectory, `phase6-${label}-${name}.png`);
    await page.screenshot({ path: file, clip });
    written.push(file);
    return file;
  };

  // --- Home -------------------------------------------------------------
  await shoot('home');

  // --- Mode Select ------------------------------------------------------
  let snapshot = await readSnapshot(page);
  const homeStart = pointFor(canvasRect, snapshot, snapshot.ui?.start, 'HOME_START');
  await tap(cdp, homeStart.x, homeStart.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 8000 });
  await sleep(600);
  await shoot('mode');

  // --- Mode Ready (Endless) --------------------------------------------
  snapshot = await readSnapshot(page);
  const endlessCard = pointFor(canvasRect, snapshot, snapshot.ui?.modeEndless, 'MODE_ENDLESS');
  await tap(cdp, endlessCard.x, endlessCard.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 8000 });
  await sleep(900);
  const endlessReady = await shoot('ready-endless');
  const endlessReadySnapshot = await readSnapshot(page);
  writeFileSync(path.join(evidenceDirectory, `phase6-${label}-ready-endless.json`),
    JSON.stringify(endlessReadySnapshot.ui?.endlessReady || {}, null, 2) + '\n', 'utf8');

  // Crop of just the preview card, so the preview art is legible in review.
  const preview = endlessReadySnapshot.ui?.endlessReady?.preview;
  if (preview?.screen) {
    const halfW = (preview.width * 0.5) * (canvasRect.width / 720);
    const halfH = (preview.height * 0.5) * (canvasRect.width / 720);
    const cx = canvasRect.left + canvasRect.width * preview.screen.x;
    const cy = canvasRect.top + canvasRect.height * preview.screen.y;
    await shoot('ready-endless-preview', {
      x: Math.max(0, cx - halfW - 8),
      y: Math.max(0, cy - halfH - 8),
      width: Math.min(viewport.width, halfW * 2 + 16),
      height: Math.min(viewport.height, halfH * 2 + 16),
    });
  }

  // --- Mode Ready (Arena) ----------------------------------------------
  snapshot = await readSnapshot(page);
  const readyBack = pointFor(canvasRect, snapshot, snapshot.ui?.endlessReady?.back, 'READY_BACK');
  await tap(cdp, readyBack.x, readyBack.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 8000 });
  await sleep(500);
  snapshot = await readSnapshot(page);
  const arenaCard = pointFor(canvasRect, snapshot, snapshot.ui?.modeArena, 'MODE_ARENA');
  await tap(cdp, arenaCard.x, arenaCard.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 8000 });
  await sleep(900);
  await shoot('ready-arena');
  const arenaReadySnapshot = await readSnapshot(page);
  writeFileSync(path.join(evidenceDirectory, `phase6-${label}-ready-arena.json`),
    JSON.stringify(arenaReadySnapshot.ui?.arenaReady || {}, null, 2) + '\n', 'utf8');

  // --- Gameplay + joystick close-up + upgrade banner --------------------
  // Enter Endless: it is the mode the PHASE 6/7 surfaces (joystick, level-up
  // banner) actually belong to, and its opening cell has reachable T1 targets.
  snapshot = await readSnapshot(page);
  const arenaReadyBack = pointFor(canvasRect, snapshot, snapshot.ui?.arenaReady?.back, 'ARENA_READY_BACK');
  await tap(cdp, arenaReadyBack.x, arenaReadyBack.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 8000 });
  await sleep(500);
  snapshot = await readSnapshot(page);
  const endlessAgain = pointFor(canvasRect, snapshot, snapshot.ui?.modeEndless, 'MODE_ENDLESS');
  await tap(cdp, endlessAgain.x, endlessAgain.y);
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 8000 });
  await sleep(700);
  snapshot = await readSnapshot(page);
  const readyStart = pointFor(canvasRect, snapshot, snapshot.ui?.endlessReady?.start, 'READY_START');
  await tap(cdp, readyStart.x, readyStart.y);
  try {
    await page.waitForFunction(() => ['PLAYING', 'ARENA'].includes(window.__BHR_QA__.snapshot().gameState), undefined, { timeout: 8000 });
  } catch (error) {
    throw new Error('capture: ready start did not enter gameplay: ' + String(error));
  }
  await sleep(1500);
  await shoot('gameplay');
  snapshot = await readSnapshot(page);
  const joystick = [snapshot.ui?.runtimeHUD?.joystick, snapshot.ui?.arenaHUD?.joystick]
    .find((candidate) => candidate?.active) || null;
  if (joystick?.screen) {
    const half = (joystick.width * 0.5) * (canvasRect.width / 720) + 14;
    const cx = canvasRect.left + canvasRect.width * joystick.screen.x;
    const cy = canvasRect.top + canvasRect.height * joystick.screen.y;
    await shoot('joystick-zoom', {
      x: Math.max(0, cx - half),
      y: Math.max(0, cy - half),
      width: Math.min(viewport.width, half * 2),
      height: Math.min(viewport.height, half * 2),
    });
  }

  // Drive real gameplay to the authored starter T1 cluster; reaching LV2 fires
  // the real MACHINE_EVOLVED event and shows the tier-upgrade banner. No setter
  // is called; the only input is a real joystick drag.
  const current = await readSnapshot(page);
  const joystickNode = [current.ui?.runtimeHUD?.joystick, current.ui?.arenaHUD?.joystick]
    .find((candidate) => candidate?.active);
  const centre = pointFor(canvasRect, current, joystickNode, 'JOYSTICK');
  const driveHandle = {
    ...centre,
    maxOffsetX: Math.min(120, canvasRect.width - (centre.x - canvasRect.left) - 3),
    maxOffsetY: Math.min(120, canvasRect.top + canvasRect.height - centre.y - 3),
  };

  let bannerCaptured = false;
  let lastLevel = current.machine?.level ?? 1;
  let lastAbsorbed = 0;
  let huntDeadline = Date.now() + 75_000;
  // One continuous poller for the whole hunt: the banner lives 2 s, so a
  // windowed poll could straddle it.
  const poller = (async () => {
    while (!bannerCaptured && Date.now() < huntDeadline) {
      const probe = await readSnapshot(page);
      lastLevel = probe.machine?.level ?? lastLevel;
      lastAbsorbed = Math.max(lastAbsorbed, probe.session?.absorbedTiers?.[1] || 0);
      if (probe.ui?.tierUpgrade?.endless?.activeCount === 1
        || probe.ui?.tierUpgrade?.arena?.activeCount === 1) {
        await shoot('tier-upgrade');
        bannerCaptured = true;
        return;
      }
      await sleep(70);
    }
  })();

  // First pass: the authored starter cluster the filing capture uses.
  const afterDrive = await driveTo(cdp, page, driveHandle, { x: 0, z: 5.2 }, 1.6, 25_000);
  lastLevel = afterDrive.machine?.level ?? lastLevel;
  lastAbsorbed = Math.max(lastAbsorbed, afterDrive.session?.absorbedTiers?.[1] || 0);

  // Second pass: keep sweeping the opening cell until the banner fires.
  let pass = 0;
  while (!bannerCaptured && Date.now() < huntDeadline) {
    const sweep = await readSnapshot(page);
    if (sweep.gameState === 'SETTLEMENT' || sweep.gameState === 'HOME') break;
    const position = logicalPosition(sweep);
    if (!position) break;
    const angle = (pass * 1.35) % (Math.PI * 2);
    const target = { x: position.x + Math.cos(angle) * 6, z: position.z + Math.sin(angle) * 6 };
    const reached = await driveTo(cdp, page, driveHandle, target, 1.8, 12_000);
    lastLevel = reached.machine?.level ?? lastLevel;
    lastAbsorbed = Math.max(lastAbsorbed, reached.session?.absorbedTiers?.[1] || 0);
    pass += 1;
  }
  huntDeadline = Date.now();
  await poller;

  const finalSnapshot = await readSnapshot(page);
  const summary = {
    label,
    viewport: viewport.id,
    bannerCaptured,
    lastLevel,
    absorbedT1: lastAbsorbed,
    sweepPasses: pass,
    uiAssets: finalSnapshot.uiAssets || null,
    joystickArt: finalSnapshot.ui?.runtimeHUD?.joystickArt || null,
    tierUpgrade: finalSnapshot.ui?.tierUpgrade || null,
    runtimeErrors,
    written,
  };
  writeFileSync(path.join(evidenceDirectory, `phase6-${label}-summary.json`), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
