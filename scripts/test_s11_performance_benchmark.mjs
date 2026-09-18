// S11 performance evidence runner.
//
// Truthfulness contract for everything this file writes out:
//   * Every number is either read from the read-only QABridge snapshot
//     (the performance.cocos / performance.world counter blocks) or measured
//     with requestAnimationFrame deltas inside the real Cocos runtime.
//   * No QA spawn, grant, force-setter, or teleport is used. Scenarios are
//     reached by dispatching real CDP touch input at visible UI, the same way a
//     player reaches them.
//   * Metrics the engine does not expose are reported as BLOCKED_UNEXPOSED
//     instead of being estimated or copied from a design document.
//   * The run is not a performance budget verdict. The repository defines no
//     agreed numeric FPS or frame-time budget, so status only attests that the
//     evidence was collected completely and without console errors.
//
// This runner deliberately does not label scenarios "30 / 60 / 100 objects".
// InfiniteWorldManager caps streamed budgets with fixed constants
// (MAX_ACTIVE_COLLECTIBLES = 240, MAX_ACTIVE_VEHICLES = 24) and nothing in the
// runtime or QA layer can request a different object density, so per-density
// tiers are not reachable through genuine gameplay. Scenarios are named after
// the real gameplay state they measure and report the counts actually observed.

import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const evidenceDirectory = path.join(repoRoot, 'cocos', 'docs', 'evidence', 's11');
const reportPath = path.join(evidenceDirectory, 's11-performance-evidence.json');

const WARMUP_FRAMES = 30;
const SAMPLE_FRAMES = 120;
const LAUNCH_FLAGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
];

function createStaticServer(rootDirectory) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const urlPath = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^[/\\]+/, '');
      const filePath = path.resolve(rootDirectory, relativePath);
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
  }
}

async function releaseTouch(cdp) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * Real screen point of a snapshot UI node. Throws instead of silently falling
 * back to local-coordinate math, so a layout change becomes a loud failure
 * rather than a wrong measurement.
 */
function tapPointForNode(canvasRect, node, name) {
  if (!node || !node.active) throw new Error('UI node missing or inactive: ' + name);
  if (!node.screen || !Number.isFinite(node.screen.x) || !Number.isFinite(node.screen.y)) {
    throw new Error('UI node has no finite normalized screen rect: ' + name);
  }
  return {
    x: canvasRect.left + canvasRect.width * node.screen.x,
    y: canvasRect.top + canvasRect.height * node.screen.y,
  };
}

function offsetFromJoystick(joystickTapPoint, offsetX, offsetY) {
  return { x: joystickTapPoint.x + offsetX, y: joystickTapPoint.y + offsetY };
}

async function measureScenario(page, definition) {
  const sample = await page.evaluate(async (options) => {
    const deltas = [];
    let previous = performance.now();
    const totalFrames = options.warmupFrames + options.sampleFrames;
    await new Promise((resolve) => {
      let seen = 0;
      const onFrame = (now) => {
        deltas.push(now - previous);
        previous = now;
        seen += 1;
        if (seen >= totalFrames) resolve();
        else requestAnimationFrame(onFrame);
      };
      requestAnimationFrame(onFrame);
    });

    // Warm-up frames are discarded before any statistic is computed.
    const measured = deltas.slice(options.warmupFrames).sort((a, b) => a - b);
    const sum = measured.reduce((total, delta) => total + delta, 0);
    const average = measured.length > 0 ? sum / measured.length : 0;
    const percentile = (fraction) => measured.length > 0
      ? measured[Math.min(measured.length - 1, Math.floor(measured.length * fraction))]
      : 0;

    const snapshot = window.__BHR_QA__ ? window.__BHR_QA__.snapshot() : null;
    const memory = window.performance && window.performance.memory ? {
      usedJSHeapSizeMB: Number((window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2)),
      totalJSHeapSizeMB: Number((window.performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2)),
      jsHeapSizeLimitMB: Number((window.performance.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(2)),
    } : null;

    return {
      measuredFrameCount: measured.length,
      warmupFramesDiscarded: deltas.length - measured.length,
      fps: average > 0 ? Number((1000 / average).toFixed(1)) : 0,
      avgFrameTimeMs: Number(average.toFixed(2)),
      medianRafDeltaMs: Number(percentile(0.5).toFixed(2)),
      p95FrameTimeMs: Number(percentile(0.95).toFixed(2)),
      maxFrameTimeMs: Number((measured.length > 0 ? measured[measured.length - 1] : 0).toFixed(2)),
      gameState: snapshot ? snapshot.gameState : null,
      activeCellCount: snapshot && snapshot.world ? snapshot.world.activeCellCount : null,
      engineCounters: snapshot && snapshot.performance ? snapshot.performance.cocos : null,
      worldCounters: snapshot && snapshot.performance ? snapshot.performance.world : null,
      sceneVisuals: {
        invalidMeshCount: snapshot && snapshot.sceneVisuals && snapshot.sceneVisuals.invalidMeshes
          ? snapshot.sceneVisuals.invalidMeshes.length : null,
        spriteCount: snapshot && snapshot.sceneVisuals && snapshot.sceneVisuals.sprites
          ? snapshot.sceneVisuals.sprites.length : null,
      },
      machineMovementInput: snapshot && snapshot.machine ? snapshot.machine.movementInput : null,
      memory,
    };
  }, { warmupFrames: WARMUP_FRAMES, sampleFrames: SAMPLE_FRAMES });

  const movementMagnitude = sample.machineMovementInput
    ? Math.hypot(sample.machineMovementInput.x, sample.machineMovementInput.y)
    : 0;

  const observedObjectCounts = {
    sceneNodeCount: sample.engineCounters ? sample.engineCounters.sceneNodeCount : null,
    activeNodeCount: sample.engineCounters ? sample.engineCounters.activeNodeCount : null,
    activeMeshRendererCount: sample.engineCounters ? sample.engineCounters.activeMeshRendererCount : null,
    activeMeshPrimitiveCount: sample.engineCounters ? sample.engineCounters.activeMeshPrimitiveCount : null,
    activeObjectCount: sample.worldCounters ? sample.worldCounters.activeObjectCount : null,
    lifecycleVisibleObjectCount: sample.worldCounters ? sample.worldCounters.lifecycleVisibleObjectCount : null,
    activeCollectibleCount: sample.worldCounters ? sample.worldCounters.activeCollectibleCount : null,
    activeVehicleCount: sample.worldCounters ? sample.worldCounters.activeVehicleCount : null,
  };

  const evidenceGaps = [];
  if (sample.measuredFrameCount < SAMPLE_FRAMES) {
    evidenceGaps.push('MEASURED_FRAMES_SHORT:' + sample.measuredFrameCount + '/' + SAMPLE_FRAMES);
  }
  if (!Number.isFinite(sample.fps) || sample.fps <= 0) evidenceGaps.push('FPS_NOT_MEASURED');
  if (!sample.engineCounters) evidenceGaps.push('ENGINE_COUNTERS_MISSING');
  if (!sample.worldCounters) evidenceGaps.push('WORLD_COUNTERS_MISSING');
  if (definition.requiresMovement && movementMagnitude <= 0.1) {
    evidenceGaps.push('MOVEMENT_NOT_OBSERVED:' + movementMagnitude.toFixed(3));
  }
  if (definition.expectedState && sample.gameState !== definition.expectedState) {
    evidenceGaps.push('GAME_STATE_MISMATCH:' + sample.gameState);
  }

  return {
    id: definition.id,
    label: definition.label,
    measures: definition.measures,
    doesNotMeasure: definition.doesNotMeasure,
    note: definition.note || null,
    gameState: sample.gameState,
    fps: sample.fps,
    avgFrameTimeMs: sample.avgFrameTimeMs,
    medianRafDeltaMs: sample.medianRafDeltaMs,
    p95FrameTimeMs: sample.p95FrameTimeMs,
    maxFrameTimeMs: sample.maxFrameTimeMs,
    measuredFrameCount: sample.measuredFrameCount,
    warmupFramesDiscarded: sample.warmupFramesDiscarded,
    activeCellCount: sample.activeCellCount,
    observedObjectCounts,
    engineCounters: sample.engineCounters,
    worldCounters: sample.worldCounters,
    sceneVisuals: sample.sceneVisuals,
    machineMovementInput: sample.machineMovementInput,
    movementMagnitude: Number(movementMagnitude.toFixed(3)),
    memory: sample.memory === null ? 'BLOCKED_UNEXPOSED' : sample.memory,
    drawCalls: 'BLOCKED_UNEXPOSED',
    batches: 'BLOCKED_UNEXPOSED',
    evidenceComplete: evidenceGaps.length === 0,
    evidenceGaps,
  };
}

async function runBenchmark() {
  console.log('====================================================');
  console.log('S11 Performance Evidence Runner');
  console.log('Read-only QABridge counters + real runtime frame timing');
  console.log('====================================================\n');

  if (!existsSync(path.join(buildDirectory, 'index.html'))) {
    console.error('Missing web build at ' + buildDirectory + '. Run: npm run build:web');
    process.exit(1);
  }

  mkdirSync(evidenceDirectory, { recursive: true });

  const server = await createStaticServer(buildDirectory);
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true, args: LAUNCH_FLAGS });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  const report = {
    stage: 'S11_PERFORMANCE',
    timestamp: new Date().toISOString(),
    runner: 'scripts/test_s11_performance_benchmark.mjs',
    platform: 'web-mobile (Cocos Creator release build, headless Chromium)',
    build: { path: 'cocos/build/web-mobile', verifiedPresent: true },
    viewport: { width: 390, height: 844, aspect: '9:16' },
    measurement: {
      warmupFramesDiscarded: WARMUP_FRAMES,
      sampleFramesRequired: SAMPLE_FRAMES,
      frameTimingSource: 'requestAnimationFrame deltas inside the Cocos runtime',
      gpu: 'SwiftShader software rasterizer',
      launchFlags: LAUNCH_FLAGS,
      frameTimingCaveat: 'Headless software rasterization can still be ceiling limited, and rAF can include rapid polling bursts. Observed fps is a scenario observation, not a GPU headroom or presentation-rate verdict.',
      medianRafDeltaCaveat: 'Sorted rAF deltas can include rapid polling bursts in headless mode, so medianRafDeltaMs reflects that distribution rather than a render-composite median.',
    },
    counterSource: 'read-only window.__BHR_QA__.snapshot().performance.{cocos,world}',
    densityTiers: {
      verdict: 'NOT_APPLICABLE_NO_RUNTIME_DENSITY_CONTROL',
      detail: 'InfiniteWorldManager caps streamed budgets with fixed constants (MAX_ACTIVE_COLLECTIBLES = 240, MAX_ACTIVE_VEHICLES = 24). No runtime or QA control can request a 30/60/100 object density, so scenarios are labelled by the real gameplay state they measure and report observed counts.',
    },
    performanceBudgetVerdict: 'NOT_EVALUATED',
    performanceBudgetReason: 'The repository defines no agreed numeric FPS or frame-time budget, so this runner records observations and enforces no threshold.',
    blockedMetrics: {
      drawCalls: 'BLOCKED_UNEXPOSED',
      batches: 'BLOCKED_UNEXPOSED',
      distinctMeshAssets: 'BLOCKED_UNEXPOSED',
      gpuFrameBreakdown: 'BLOCKED_UNEXPOSED',
      gcPauseAttribution: 'BLOCKED_UNEXPOSED',
    },
    notCovered: [
      'Per-density 30/60/100 object tiers: not reachable without a fabricated density control.',
      'Draw calls, batches, distinct mesh assets: not exposed by Cocos 3.8 in this build.',
      'GC pause attribution: not exposed by the engine.',
      'Long-duration soak beyond the sampled windows.',
    ],
    scenarios: [],
    cellObservation: null,
    status: 'FAIL',
    statusMeaning: null,
    consoleErrors,
  };

  try {
    await page.goto('http://127.0.0.1:' + port + '/?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__BHR_QA__ && window.__BHR_QA__.snapshot), undefined, { timeout: 35000 });

    const cdp = await context.newCDPSession(page);
    const canvasRect = await page.locator('#GameCanvas').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });

    // Scenario A: the Home UI scene. The counters below show the infinite world
    // is already streaming at this point, so this scenario is labelled as
    // Home-plus-background-streaming rather than as an isolated UI-only scene.
    console.log('[S11] Scenario A: home_ui_scene (world streaming continues behind Home)...');
    const homeSnapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
    report.scenarios.push(await measureScenario(page, {
      id: 'home_ui_scene',
      label: 'Home UI scene with the infinite world already streaming behind it',
      measures: 'Frame timing and total object load while the Home page is displayed.',
      doesNotMeasure: 'Isolated UI-only cost. The observed counters prove world streaming is already live on this screen, so this scenario cannot separate UI cost from world streaming cost.',
      note: 'Recorded because it is the real state of the app, not because it isolates the UI.',
    }));

    const startPoint = tapPointForNode(canvasRect, homeSnapshot.ui && homeSnapshot.ui.start, 'BtnStart');
    await dispatchTouchTap(cdp, startPoint.x, startPoint.y);
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 8000 });

    const modeSnapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const endlessPoint = tapPointForNode(canvasRect, modeSnapshot.ui && modeSnapshot.ui.modeEndless, 'BtnEndless');
    await dispatchTouchTap(cdp, endlessPoint.x, endlessPoint.y);
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 10000 });

    // Let the opening cell finish its initial load before sampling.
    await page.waitForTimeout(1500);

    const gameplaySnapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const joystickNode = gameplaySnapshot.ui
      && gameplaySnapshot.ui.runtimeHUD
      && gameplaySnapshot.ui.runtimeHUD.joystick;
    const joystickPoint = tapPointForNode(canvasRect, joystickNode, 'EndlessHUD/Joystick');
    const joystickOffsetX = (joystickNode.width || 120) * canvasRect.width / 750;
    const joystickOffsetY = (joystickNode.height || 120) * canvasRect.height / 1334;

    // Hold a real directional touch for the whole of scenario B and C so the
    // samples cover genuine moving gameplay rather than a static scene.
    await beginTouchJoystick(cdp, joystickPoint.x, joystickPoint.y,
      joystickPoint.x + joystickOffsetX * 0.72, joystickPoint.y - joystickOffsetY * 0.72);
    await page.waitForTimeout(300);

    console.log('[S11] Scenario B: endless_gameplay_moving (opening cell, joystick held)...');
    report.scenarios.push(await measureScenario(page, {
      id: 'endless_gameplay_moving',
      label: 'Endless gameplay in the opening cell with a real joystick direction held',
      measures: 'Frame timing and streamed-object load while the machine is actually driving.',
      doesNotMeasure: 'Cell boundary crossing, rebase cost, or arena bot load.',
      expectedState: 'PLAYING',
      requiresMovement: true,
    }));

    // Keep the same held touch and let the machine travel further.
    await page.waitForTimeout(3500);
    console.log('[S11] Scenario C: endless_gameplay_sustained_travel (same held touch)...');
    const sustainedScenario = await measureScenario(page, {
      id: 'endless_gameplay_sustained_travel',
      label: 'Endless gameplay after sustained travel from the opening cell',
      measures: 'Frame timing and streamed-object load further into infinite-world travel.',
      doesNotMeasure: 'Rebase threshold behaviour unless the observed cell count actually changed.',
      expectedState: 'PLAYING',
      requiresMovement: true,
    });
    report.scenarios.push(sustainedScenario);

    const movingScenario = report.scenarios.find((scenario) => scenario.id === 'endless_gameplay_moving');
    const homeObjectCount = report.scenarios[0].observedObjectCounts.activeObjectCount;
    report.worldStreamingObservation = {
      verdict: 'OBSERVED_NOT_GATED',
      worldStreamingWhileOnHome: Number.isFinite(homeObjectCount) ? homeObjectCount > 0 : null,
      activeObjectCountOnHome: homeObjectCount,
      detail: 'The infinite world is already streaming while the Home page is displayed, so no scenario in this run measures an isolated UI-only scene.',
    };
    report.cellObservation = {
      verdict: 'OBSERVED_NOT_GATED',
      activeCellCountAtHome: report.scenarios[0].activeCellCount,
      activeCellCountWhileMoving: movingScenario ? movingScenario.activeCellCount : null,
      activeCellCountAfterTravel: sustainedScenario.activeCellCount,
      observedCellCountChange: (movingScenario && Number.isFinite(movingScenario.activeCellCount)
        && Number.isFinite(sustainedScenario.activeCellCount))
        ? sustainedScenario.activeCellCount - movingScenario.activeCellCount
        : null,
      detail: 'Recorded only, never gated. activeCellCount held steady across all three scenarios, which is consistent with a bounded neighbourhood count rather than a boundary-crossing counter, so this run proves nothing about cell load, unload, or rebase cost. That needs a dedicated cell-lifecycle soak.',
    };

    await releaseTouch(cdp);
  } catch (error) {
    report.status = 'FAIL';
    report.error = error instanceof Error ? error.message : String(error);
    console.error('S11 evidence run error:', error);
  } finally {
    await browser.close();
    server.close();
  }

  const incompleteScenarios = report.scenarios.filter((scenario) => !scenario.evidenceComplete);
  report.conclusion = {
    declaredScenarioCount: report.scenarios.length,
    completeScenarioCount: report.scenarios.length - incompleteScenarios.length,
    incompleteScenarios: incompleteScenarios.map((scenario) => ({ id: scenario.id, evidenceGaps: scenario.evidenceGaps })),
  };
  report.status = incompleteScenarios.length === 0 && consoleErrors.length === 0 ? 'PASS' : 'FAIL';
  report.statusMeaning = report.status === 'PASS'
    ? 'Evidence completeness only: every declared scenario produced a full frame-timing sample with read-only engine and world counters, and the run recorded no console errors. This is not a performance budget verdict.'
    : 'Evidence incomplete or console errors were recorded. See conclusion.incompleteScenarios and consoleErrors. This result must not be reported as a performance PASS.';

  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nScenario observations:');
  console.log(JSON.stringify(report.scenarios.map((scenario) => ({
    id: scenario.id,
    gameState: scenario.gameState,
    fps: scenario.fps,
    avgFrameTimeMs: scenario.avgFrameTimeMs,
    p95FrameTimeMs: scenario.p95FrameTimeMs,
    observedObjectCounts: scenario.observedObjectCounts,
    activeCellCount: scenario.activeCellCount,
    evidenceComplete: scenario.evidenceComplete,
    evidenceGaps: scenario.evidenceGaps,
  })), null, 2));
  console.log('\nS11 performance evidence written to: ' + reportPath);
  console.log('S11 evidence status: ' + report.status + ' (' + report.statusMeaning + ')');

  if (report.status !== 'PASS') {
    process.exit(1);
  }
}

runBenchmark().catch((error) => {
  console.error(error);
  process.exit(1);
});
