
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const cocosProject = path.join(repoRoot, 'cocos');
const buildDirectory = path.join(cocosProject, 'build', 'web-mobile');
const evidenceDirectory = path.join(repoRoot, 'artifacts', 'qa', 'portrait');
mkdirSync(evidenceDirectory, { recursive: true });

function createStaticServer(rootDirectory) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const urlPath = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^[/\\]+/, '');
      const filePath = path.resolve(rootDirectory, relativePath);
      if (!filePath.startsWith(rootDirectory + path.sep) && filePath !== path.join(rootDirectory, 'index.html')) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if (!existsSync(filePath)) {
        response.writeHead(404).end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.wasm': 'application/wasm',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
      }[ext] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function dispatchTouchTap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 60));
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
    await new Promise((r) => setTimeout(r, 16));
  }
}

async function releaseTouchJoystick(cdp) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

function pointForVisibleNode(canvasRect, snapshot, node, name) {
  if (!node || !node.active) throw new Error('Missing or inactive node: ' + name);
  const design = snapshot.ui?.portrait?.designResolution || { width: 750, height: 1334 };
  const scaleX = canvasRect.width / design.width;
  const scaleY = canvasRect.height / design.height;
  return {
    x: canvasRect.left + (node.worldPosition?.x ?? (node.x + design.width / 2)) * scaleX,
    y: canvasRect.top + (design.height - (node.worldPosition?.y ?? (node.y + design.height / 2))) * scaleY,
  };
}

async function run() {
  const server = await createStaticServer(buildDirectory);
  const port = server.address().port;
  const baseUrl = 'http://127.0.0.1:' + port + '/?qa=1';
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  const report = {
    timestamp: new Date().toISOString(),
    status: 'RUNNING',
    assertions: {},
    consoleErrors: [],
  };

  try {
    console.log('[p0b-runtime] Loading game page...');
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 35000 });
    const cdp = await context.newCDPSession(page);
    const canvasRect = await page.locator('#GameCanvas').evaluate((c) => {
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });

    console.log('[p0b-runtime] Entering Endless mode...');
    const home = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const startPoint = pointForVisibleNode(canvasRect, home, home.ui?.start, 'START');
    await dispatchTouchTap(cdp, startPoint.x, startPoint.y);
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });

    const mode = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const endlessPoint = pointForVisibleNode(canvasRect, mode, mode.ui?.modeEndless, 'MODE_ENDLESS');
    await dispatchTouchTap(cdp, endlessPoint.x, endlessPoint.y);
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });

    // Step 1: Initial Opening source and authored counts
    console.log('[p0b-runtime] Step 1: Validating Opening AUTHORED_GOLDEN_CITY source and dynamic counts...');
    const initial = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const initialStream = initial.world?.streaming;
    const initialSource = initialStream?.currentCellSource;
    const initialCounts = initialStream?.authoredDynamicCounts;
    const initialAnchors = initialStream?.authoredClusterAnchors || [];
    const initialVehicles = (initialStream?.dynamicVehicles || []).filter(v => v.id.startsWith('traffic_0_0_authored_'));

    report.assertions.openingSource = {
      expected: 'AUTHORED_GOLDEN_CITY',
      actual: initialSource,
      pass: initialSource === 'AUTHORED_GOLDEN_CITY',
    };

    report.assertions.authoredDynamicCounts = {
      actual: initialCounts,
      collectiblesPass: (initialCounts?.collectibles ?? 0) >= 20,
      clustersPass: (initialCounts?.clusters ?? 0) >= 2,
      vehiclesPass: (initialCounts?.vehicles ?? 0) >= 3,
      pass: (initialCounts?.collectibles ?? 0) >= 20 && (initialCounts?.clusters ?? 0) >= 2 && (initialCounts?.vehicles ?? 0) >= 3,
    };

    report.assertions.authoredClusterAnchors = {
      count: initialAnchors.length,
      anchors: initialAnchors,
      pass: initialAnchors.length >= 2 && initialAnchors.every(a => a.worldPosition && Number.isFinite(a.worldPosition.x) && a.objectCount > 0),
    };

    report.assertions.authoredTrafficInitial = {
      count: initialVehicles.length,
      vehicles: initialVehicles.map(v => ({ id: v.id, kind: v.kind, x: v.x, z: v.z })),
      pass: initialVehicles.length >= 3,
    };

    // Step 2: Traffic movement
    console.log('[p0b-runtime] Step 2: Validating vehicle movement in Opening...');
    await page.waitForTimeout(1500);
    const movedSnap = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const movedVehicles = (movedSnap.world?.streaming?.dynamicVehicles || []).filter(v => v.id.startsWith('traffic_0_0_authored_'));
    const movements = initialVehicles.map(iv => {
      const match = movedVehicles.find(mv => mv.id === iv.id);
      if (!match) return null;
      const dist = Math.hypot(match.x - iv.x, match.z - iv.z);
      return { id: iv.id, before: { x: iv.x, z: iv.z }, after: { x: match.x, z: match.z }, distance: dist };
    }).filter(Boolean);

    const hasMoving = movements.some(m => m.distance > 0.15);
    report.assertions.trafficMovement = {
      movements,
      pass: hasMoving,
    };

    // Step 3: Transit to adjacent cell using real CDP joystick touch
    console.log('[p0b-runtime] Step 3: Moving to adjacent cell via joystick touch...');
    const joystickNode = initial.ui?.runtimeHUD?.joystick;
    const joystickCenter = pointForVisibleNode(canvasRect, initial, joystickNode, 'JOYSTICK');
    const dragNorth = { x: joystickCenter.x, y: joystickCenter.y - 75 };

    await beginTouchJoystick(cdp, joystickCenter.x, joystickCenter.y, dragNorth.x, dragNorth.y);
    let adjacentReached = false;
    let adjacentCellData = null;
    const northDeadline = Date.now() + 18000;
    while (Date.now() < northDeadline) {
      await page.waitForTimeout(400);
      const snap = await page.evaluate(() => window.__BHR_QA__.snapshot());
      const curCell = snap.world?.streaming?.currentCell;
      const curSource = snap.world?.streaming?.currentCellSource;
      if (curCell && (curCell.x !== 0 || curCell.z !== 0)) {
        adjacentReached = true;
        adjacentCellData = {
          currentCell: curCell,
          currentCellSource: curSource,
          player: snap.player,
        };
        if (curSource === 'PROCEDURAL_FALLBACK') {
          break;
        }
      }
    }
    await releaseTouchJoystick(cdp);
    await page.waitForTimeout(400);

    report.assertions.adjacentCellTransit = {
      adjacentReached,
      data: adjacentCellData,
      pass: adjacentReached && adjacentCellData?.currentCellSource === 'PROCEDURAL_FALLBACK',
    };

    // Step 4: Return to Opening (0,0) and check no duplicate dynamic objects
    console.log('[p0b-runtime] Step 4: Returning to Opening (0,0) via joystick touch...');
    const dragSouth = { x: joystickCenter.x, y: joystickCenter.y + 75 };
    await beginTouchJoystick(cdp, joystickCenter.x, joystickCenter.y, dragSouth.x, dragSouth.y);
    let returnedReached = false;
    let returnedCellData = null;
    const southDeadline = Date.now() + 20000;
    while (Date.now() < southDeadline) {
      await page.waitForTimeout(400);
      const snap = await page.evaluate(() => window.__BHR_QA__.snapshot());
      const curCell = snap.world?.streaming?.currentCell;
      const curSource = snap.world?.streaming?.currentCellSource;
      if (curCell && curCell.x === 0 && curCell.z === 0) {
        returnedReached = true;
        returnedCellData = {
          currentCell: curCell,
          currentCellSource: curSource,
          authoredDynamicCounts: snap.world?.streaming?.authoredDynamicCounts,
        };
        if (curSource === 'AUTHORED_GOLDEN_CITY') {
          break;
        }
      }
    }
    await releaseTouchJoystick(cdp);
    await page.waitForTimeout(400);

    const finalSnap = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const finalCounts = finalSnap.world?.streaming?.authoredDynamicCounts;
    const finalSource = finalSnap.world?.streaming?.currentCellSource;

    report.assertions.returnToOpening = {
      returnedReached,
      sourcePass: finalSource === 'AUTHORED_GOLDEN_CITY',
      finalSource,
      initialCounts,
      finalCounts,
      noDuplicateCollectibles: (finalCounts?.collectibles ?? 0) <= (initialCounts?.collectibles ?? 0),
      noDuplicateVehicles: (finalCounts?.vehicles ?? 0) <= (initialCounts?.vehicles ?? 0),
      noDuplicateClusters: (finalCounts?.clusters ?? 0) <= (initialCounts?.clusters ?? 0),
      pass: returnedReached && finalSource === 'AUTHORED_GOLDEN_CITY' &&
            (finalCounts?.collectibles ?? 0) <= (initialCounts?.collectibles ?? 0) &&
            (finalCounts?.vehicles ?? 0) <= (initialCounts?.vehicles ?? 0),
    };

    report.consoleErrors = consoleErrors;
    const allPassed = Object.values(report.assertions).every(a => a.pass);
    report.status = allPassed && consoleErrors.length === 0 ? 'PASS' : 'FAIL';
    console.log('[p0b-runtime] Result status:', report.status);
  } catch (err) {
    report.status = 'FAIL';
    report.error = err instanceof Error ? err.message : String(err);
    console.error('[p0b-runtime] Error:', err);
  } finally {
    await browser.close();
    server.close();
  }

  const outPath = path.join(evidenceDirectory, 'p0b-runtime-evidence.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('[p0b-runtime] Evidence written to:', outPath);
  console.log(JSON.stringify(report, null, 2));

  if (report.status !== 'PASS') {
    process.exitCode = 1;
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

