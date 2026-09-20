/**
 * V4 design-gate runtime evidence capture.
 *
 * The V4 design gate (cocos/docs/design-reference/ui-v4-expanded/design-lock.md)
 * requires real 390x844 runtime frames for the pages and mechanics that the V4
 * references 05-10 describe, plus a screen-space space-budget measurement of the
 * Endless gameplay frame. The committed acceptance screenshots are captured by
 * a longer, differently-scoped run, so this runner exists to produce the V4
 * frames directly and to measure them.
 *
 * Rules this runner obeys:
 *  - It never imports game code and never mutates a running scene.
 *  - Every screenshot is taken from a live `?qa=1` Web Mobile build.
 *  - Every number in the JSON payload is read from the read-only QA bridge or
 *    derived from it in this process; nothing is asserted into existence.
 *  - A frame is only captured when the runtime really reached that state; the
 *    runner reports `CAPTURED` / `NOT_REACHED` per target instead of faking one.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const cocosProject = path.join(repoRoot, 'cocos');
const buildDirectory = path.join(cocosProject, 'build', 'web-mobile');
const outputDirectory = path.resolve(
  process.env.BHR_V4_EVIDENCE_DIR || path.join(cocosProject, 'docs', 'evidence', 'v4-design'),
);
const reportPath = path.join(outputDirectory, 'v4-design-evidence.json');
const VIEWPORT = { id: '390x844', width: 390, height: 844 };
const DRIVE_BUDGET_MS = Number(process.env.BHR_V4_DRIVE_BUDGET_MS || 150000);
/**
 * Reference 09 needs a T4/T5 body in a real suction state, and the product only
 * enters ATTRACTED/SUCKING when `template.tier <= machineMaxTier`
 * (CompressibleObject.ts:277). Below level 4 that predicate is structurally
 * unreachable, so the runner has to earn the level by playing. Growth is pure
 * joystick play: no mass/level/tier setter, no save edit, no QA hook.
 */
const GROWTH_BUDGET_MS = Number(process.env.BHR_V4_GROWTH_BUDGET_MS || 900000);
const LARGE_TARGET_SEEK_BUDGET_MS = Number(process.env.BHR_V4_LARGE_SEEK_BUDGET_MS || 180000);
/** Level 4 ("Gravity Harvester") is the first MACHINE_EVOLUTION_CONFIG entry with maxTier = T4. */
const GROWTH_TARGET_MAX_TIER = 4;
/**
 * The joystick's own maximumRadius is 92 px with a 0.1 dead zone
 * (MovementInput.ts), so the 0.06 radius the blind sweep uses produces only
 * ~17% of full speed. Growth steers at ~73% of full speed instead.
 */
const GROWTH_STEER_RADIUS_RATIO = 0.18;

const log = (message) => process.stdout.write(`[v4-evidence] ${message}\n`);
const growthLog = (message) => process.stdout.write(`[v4-evidence][growth] ${message}\n`);
/** Harness-induced Chromium noise; not an application error. */
const HARNESS_TOUCH_CANCEL_SIGNATURE = 'Ignored attempt to cancel a touchstart event with cancelable=false';

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

const snapshotOf = (page) => page.evaluate(() => window.__BHR_QA__.snapshot());

async function dispatchTouchTap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** A live Cocos UI node's real screen centre -> a real browser touch point. */
function pointForNode(canvasRect, node, name) {
  if (!node?.active || !node?.screen) {
    throw new Error(`FAIL_V4_NODE_UNAVAILABLE_${name}: ${JSON.stringify(node)}`);
  }
  return {
    x: canvasRect.left + canvasRect.width * node.screen.x,
    y: canvasRect.top + canvasRect.height * node.screen.y,
  };
}

async function tapNode(cdp, canvasRect, node, name) {
  const point = pointForNode(canvasRect, node, name);
  await dispatchTouchTap(cdp, point.x, point.y);
  return point;
}

/**
 * The joystick is driven the way a player drives it: a real touch on the stick
 * that is then moved. Direction is expressed in joystick units (-1..1).
 */
async function steer(cdp, canvasRect, joystick, dx, dy) {
  const centre = pointForNode(canvasRect, joystick.knob || joystick.joystickKnob || joystick, 'JOYSTICK');
  const radius = Math.min(canvasRect.width, canvasRect.height) * 0.06;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centre.x, y: centre.y }] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: centre.x + dx * radius, y: centre.y - dy * radius }],
  });
}

const releaseSteer = (cdp) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

/**
 * Continue an already-held joystick touch from a fixed base point.
 *
 * The base has to be resolved once, before the touch starts: the knob node
 * follows the finger, so re-reading its position mid-drag would compound the
 * offset. Same real CDP touch channel as `steer` — still real input.
 */
async function steerHeld(cdp, canvasRect, base, dx, dy, radiusRatio = 0.06) {
  const radius = Math.min(canvasRect.width, canvasRect.height) * radiusRatio;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: base.x + dx * radius, y: base.y - dy * radius }],
  });
}

/**
 * V4 screen-space budget for reference 08.
 *
 * The probe already publishes the projected screen bounds of every environment,
 * collectible, cluster and vehicle entry plus the ground region. This function
 * re-derives a whole-region budget from that published data with a documented
 * precedence so the four buckets are mutually exclusive and sum to 100%:
 *   dynamic (VEHICLE) > static (COLLECTIBLE / RESOURCE_CLUSTER) > environment
 *   (BUILDING / TREE / POI) > open (inside the ground region, covered by none).
 * The HUD band exclusion matches WorldCompositionProbe.estimateEmptyGround so
 * the open share here equals the probe's `largeEmptyGroundRatio` by construction.
 */
function computeScreenSpaceBudget(composition, viewport) {
  if (!composition || composition.status !== 'MEASURED') {
    return { status: 'UNAVAILABLE', reason: composition?.status || 'NO_COMPOSITION' };
  }
  const grid = { columns: 40, rows: 64 };
  const hudExclusion = { topRatio: 0.16, bottomRatio: 0.18 };
  const entries = (composition.entries || []).filter((entry) => entry.visible && entry.screenBounds);
  const ground = entries.filter((entry) => entry.category === 'GROUND');
  const occupants = entries.filter((entry) => entry.category !== 'GROUND');
  const contentTop = viewport.y + viewport.height * hudExclusion.topRatio;
  const contentBottom = viewport.y + viewport.height * (1 - hudExclusion.bottomRatio);
  const contains = (bounds, x, y) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  const precedence = (categories) => {
    if (categories.has('VEHICLE')) return 'dynamic';
    if (categories.has('COLLECTIBLE') || categories.has('RESOURCE_CLUSTER')) return 'static';
    if (categories.has('BUILDING') || categories.has('TREE') || categories.has('POI')) return 'environment';
    return 'other';
  };
  const buckets = { open: 0, environment: 0, static: 0, dynamic: 0, other: 0 };
  let groundSamples = 0;
  let contentSamples = 0;
  for (let row = 0; row < grid.rows; row++) {
    const y = contentTop + ((row + 0.5) / grid.rows) * (contentBottom - contentTop);
    for (let column = 0; column < grid.columns; column++) {
      const x = viewport.x + ((column + 0.5) / grid.columns) * viewport.width;
      contentSamples += 1;
      if (!ground.some((entry) => contains(entry.screenBounds, x, y))) continue;
      groundSamples += 1;
      const covering = occupants.filter((entry) => contains(entry.screenBounds, x, y));
      if (covering.length === 0) {
        buckets.open += 1;
        continue;
      }
      buckets[precedence(new Set(covering.map((entry) => entry.category)))] += 1;
    }
  }
  const share = (value) => (groundSamples > 0 ? Number((value / groundSamples).toFixed(4)) : null);
  return {
    status: 'MEASURED',
    /**
     * NOT A GATE. This instrument classifies samples from projected world
     * bounding quads, which over-count badly: one proximity-cluster entry can
     * span every collectible in the cell, and large landmarks project far
     * larger than they read. On this very frame it reports most of the ground
     * as covered while the frame is visibly mostly open road. It is kept only
     * as a directional diagnostic. The authoritative openness measure is the
     * world-space `probePlayableOpenAreaRatio` below, and the reference-image
     * budget in gameplay-composition-contract.md §2 is measured on the
     * reference PNG instead.
     */
    reliability: 'UNRELIABLE_FOR_VISUAL_SHARE',
    reliabilityReason:
      'projected world bounding quads over-count; cluster entries and large landmarks dominate',
    isGate: false,
    method: 'screen-space grid over published projected bounds, precedence-classified',
    precedence: 'dynamic > static > environment > open',
    grid,
    hudExclusion,
    groundRegionIsMeasured: true,
    totalContentSamples: contentSamples,
    groundSamples,
    openSamples: buckets.open,
    openShare: share(buckets.open),
    environmentShare: share(buckets.environment),
    staticShare: share(buckets.static),
    dynamicShare: share(buckets.dynamic),
    otherShare: share(buckets.other),
    bucketSamples: { ...buckets },
    probeEmptyGroundRatio: composition.emptyGround?.largeEmptyGroundRatio ?? null,
    /** World-space, real-geometry openness. This IS the runtime spatial gate. */
    probePlayableOpenAreaRatio: composition.playableOpenArea?.playableOpenAreaRatio ?? null,
    entryCountsByCategory: composition.counts || null,
  };
}

/** Compare measured shares against the binding band table in the contract. */
function evaluateBudgetBands(budget) {
  if (budget.status !== 'MEASURED') return { status: 'UNAVAILABLE' };
  const bands = {
    open: [0.55, 0.65],
    environment: [0.15, 0.20],
    static: [0.10, 0.15],
    dynamic: [0.05, 0.10],
  };
  const checks = Object.entries(bands).map(([bucket, [min, max]]) => {
    const value = bucket === 'open' ? budget.openShare
      : bucket === 'environment' ? budget.environmentShare
        : bucket === 'static' ? budget.staticShare
          : budget.dynamicShare;
    return { bucket, min, max, value, inBand: value !== null && value >= min && value <= max };
  });
  return {
    /**
     * The band table is a property of reference 08 and is measured on
     * reference 08 (see design-lock.md §08 and gameplay-composition-contract.md
     * §2.1). Reporting it here would be misleading, so this block exists only
     * to record that the runtime screen-space instrument was consulted and is
     * not admissible evidence either way.
     */
    status: 'NOT_A_GATE',
    admissibility: 'INADMISSIBLE_RUNTIME_SCREEN_SPACE',
    bands,
    checks,
    note:
      'Do not read allInBand as a pass/fail. Use probePlayableOpenAreaRatio ' +
      '(world space) for the runtime spatial gate, and the reference manifest ' +
      'references[].spaceBudget for the reference-image budget.',
    allInBand: checks.every((check) => check.inBand),
  };
}

/**
 * V4 defect RT-08-HUD-CLIP. The design resolution is 720x1280 but the UI layer
 * is drawn by an ORTHOGRAPHIC UICamera whose `orthoHeight` is 640
 * (= designHeight / 2), so the UI renders at fit-height and the horizontally
 * usable design range at 390x844 is only about [-296, +296].
 *
 * The frame px per design px therefore comes from the UI camera's orthoHeight,
 * NOT from `view.getViewportRect()`. Under this project's global
 * `ResolutionPolicy.FIXED_WIDTH` the view viewport is the whole 390x844 frame,
 * which yields 0.54167 — but the UI camera actually scales at 844/1280 = 0.65938.
 * Using the view viewport silently under-reports the pill extents by ~22 %.
 *
 * `describe()` in QABridge projects a node to a *viewport-normalised* centre
 * using the same UI camera, so the centre is correct either way; only the
 * half-extents need the UI camera scale.
 */
function measureHudGeometry(snapshot) {
  const ui = snapshot?.ui;
  const design = ui?.design;
  const frame = ui?.frame;
  const orthoHeight = ui?.uiCamera?.orthoHeight;
  if (!design || !frame || !(frame.height > 0) || !(orthoHeight > 0)) {
    return { status: 'UNAVAILABLE', reason: 'missing design/frame/uiCamera.orthoHeight' };
  }
  const viewport = ui?.portrait?.viewport || { x: 0, y: 0, ...frame };
  // UI camera: visible design height is 2 * orthoHeight, so one design px is
  // frame.height / (2 * orthoHeight) frame px.
  const scale = frame.height / (2 * orthoHeight);
  const frameWidth = frame.width;
  const frameHeight = frame.height;
  const rectOf = (described) => {
    if (!described || !described.screen) return null;
    const centreX = viewport.x + described.screen.x * viewport.width;
    const centreY = viewport.y + described.screen.y * viewport.height;
    const width = (described.width || 0) * scale * (described.scaleX ?? 1);
    const height = (described.height || 0) * scale * (described.scaleY ?? 1);
    const left = centreX - width * 0.5;
    const right = centreX + width * 0.5;
    const top = centreY - height * 0.5;
    const bottom = centreY + height * 0.5;
    return {
      active: described.active,
      centreX: Number(centreX.toFixed(2)),
      left: Number(left.toFixed(2)),
      right: Number(right.toFixed(2)),
      top: Number(top.toFixed(2)),
      bottom: Number(bottom.toFixed(2)),
      width: Number(width.toFixed(2)),
      height: Number(height.toFixed(2)),
      overflowLeft: Number(Math.max(0, -left).toFixed(2)),
      overflowRight: Number(Math.max(0, right - frameWidth).toFixed(2)),
      overflowTop: Number(Math.max(0, -top).toFixed(2)),
      overflowBottom: Number(Math.max(0, bottom - frameHeight).toFixed(2)),
    };
  };
  const hud = ui.runtimeHUD || {};
  const nodes = {
    coinPanel: rectOf(hud.pillPanels?.coin),
    levelPanel: rectOf(hud.pillPanels?.level),
    regionPanel: rectOf(hud.pillPanels?.region),
    pauseButton: rectOf(hud.pauseButton),
    joystick: rectOf(hud.joystick),
  };
  const measured = Object.entries(nodes).filter(([, rect]) => rect && rect.active);
  const offenders = measured
    .filter(([, rect]) => rect.overflowLeft > 0 || rect.overflowRight > 0
      || rect.overflowTop > 0 || rect.overflowBottom > 0)
    .map(([name, rect]) => ({ name, ...rect }));
  /**
   * The locked rule is "lateral padding >= 24 px for any **interactive**
   * element". `CoinPanel`/`LevelPanel`/`RegionPanel` are labels, so only the
   * pause button and the joystick carry the obligation.
   *
   * Checking overflow alone is not enough and previously reported `pass: true`
   * for a pause button sitting flush at x = frameWidth with exactly 0 px of
   * padding — the clamp had removed the clipping but not the violation.
   */
  const INTERACTIVE_PADDING_PX = 24;
  const interactiveNames = ['pauseButton', 'joystick'];
  const padding = measured
    .filter(([name]) => interactiveNames.indexOf(name) >= 0)
    .map(([name, rect]) => ({
      name,
      left: Number(rect.left.toFixed(2)),
      right: Number(rect.right.toFixed(2)),
      paddingLeft: Number(rect.left.toFixed(2)),
      paddingRight: Number((frameWidth - rect.right).toFixed(2)),
    }));
  const paddingViolations = padding.filter((entry) => entry.paddingLeft < INTERACTIVE_PADDING_PX
    || entry.paddingRight < INTERACTIVE_PADDING_PX);
  return {
    status: 'MEASURED',
    viewport,
    frame: { width: frameWidth, height: frameHeight },
    uiCameraOrthoHeight: orthoHeight,
    /** frame px per design px, from the UI camera — NOT view.getViewportRect(). */
    designToFrameScale: Number(scale.toFixed(5)),
    viewViewportScale: ui?.portrait?.viewport?.width
      ? Number((ui.portrait.viewport.width / design.width).toFixed(5))
      : null,
    /** Design-space half-width the UI camera can actually show. */
    usableDesignHalfWidth: Number((frameWidth / scale / 2).toFixed(2)),
    nodes,
    measuredCount: measured.length,
    offenders,
    interactivePaddingPx: INTERACTIVE_PADDING_PX,
    interactivePadding: padding,
    paddingViolations,
    pass: measured.length > 0 && offenders.length === 0 && paddingViolations.length === 0,
    pillText: hud.pillText || null,
    /**
     * The clamp's own account of the pass: its inputs and every group's shift.
     * The projected rects above only show the *result*, which is identical
     * whether the clamp ran and computed zero or never ran at all.
     */
    safeArea: hud.safeArea || null,
  };
}

async function capture(page, name) {
  const file = path.join(outputDirectory, name);
  await page.screenshot({ path: file });
  log(`captured ${name}`);
  return file;
}

async function main() {
  if (!existsSync(path.join(buildDirectory, 'index.html'))) {
    throw new Error(`Missing Cocos Web Mobile build: ${buildDirectory}. Run npm run build:web first.`);
  }
  mkdirSync(outputDirectory, { recursive: true });

  const server = await createStaticServer(buildDirectory);
  const baseUrl = `http://127.0.0.1:${server.address().port}/?qa=1`;
  const report = {
    runner: 'capture_v4_design_evidence',
    viewport: VIEWPORT,
    buildDirectory,
    baseUrl,
    capturedAt: new Date().toISOString(),
    frames: {},
    readyPages: {},
    gameplay: {},
    screens: [],
    targets: {},
    consoleErrors: [],
  };
  let browser = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
    });
    const context = await browser.newContext({
      viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.consoleErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') report.consoleErrors.push(message.text());
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 45000 });
    const canvasRect = await page.locator('#GameCanvas').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    report.canvasRect = canvasRect;
    const cdp = await context.newCDPSession(page);
    const waitState = (state, timeout = 8000) => page.waitForFunction(
      (expected) => window.__BHR_QA__.snapshot().gameState === expected,
      state,
      { timeout },
    );

    // ---- 05 Home -----------------------------------------------------------
    await page.waitForTimeout(600);
    report.frames.home = await capture(page, 'v4-390x844-05-home.png');
    report.screens.push({ screen: 'Home', snapshot: (await snapshotOf(page)).uiScreen });

    // ---- 03 Mode Select (inherited V3 master, runtime cross-check) ---------
    await tapNode(cdp, canvasRect, (await snapshotOf(page)).ui.start, 'HOME_START');
    await waitState('MODE_SELECT');
    await page.waitForTimeout(300);
    report.frames.modeSelect = await capture(page, 'v4-390x844-03-mode-select-runtime.png');

    // ---- 06 Endless Ready --------------------------------------------------
    await tapNode(cdp, canvasRect, (await snapshotOf(page)).ui.modeEndless, 'MODE_ENDLESS');
    await waitState('MODE_READY');
    await page.waitForTimeout(500);
    report.frames.endlessReady = await capture(page, 'v4-390x844-06-endless-ready.png');
    const endlessReady = await snapshotOf(page);
    report.readyPages.endless = endlessReady.ui.endlessReady;
    report.screens.push({ screen: 'EndlessReady', snapshot: endlessReady.uiScreen });

    // ---- 07 Arena Ready ----------------------------------------------------
    await tapNode(cdp, canvasRect, endlessReady.ui.endlessReady.back, 'ENDLESS_READY_BACK');
    await waitState('MODE_SELECT');
    await page.waitForTimeout(200);
    await tapNode(cdp, canvasRect, (await snapshotOf(page)).ui.modeArena, 'MODE_ARENA');
    await waitState('MODE_READY');
    await page.waitForTimeout(500);
    report.frames.arenaReady = await capture(page, 'v4-390x844-07-arena-ready.png');
    const arenaReady = await snapshotOf(page);
    report.readyPages.arena = arenaReady.ui.arenaReady;

    // ---- 08 Endless gameplay ----------------------------------------------
    await tapNode(cdp, canvasRect, arenaReady.ui.arenaReady.back, 'ARENA_READY_BACK');
    await waitState('MODE_SELECT');
    await page.waitForTimeout(200);
    await tapNode(cdp, canvasRect, (await snapshotOf(page)).ui.modeEndless, 'MODE_ENDLESS');
    await waitState('MODE_READY');
    await page.waitForTimeout(300);
    await tapNode(cdp, canvasRect, (await snapshotOf(page)).ui.endlessReady.start, 'ENDLESS_READY_START');
    await waitState('PLAYING', 10000);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    report.frames.endlessGameplay = await capture(page, 'v4-390x844-08-endless-gameplay.png');
    const opening = await snapshotOf(page);
    report.gameplay.opening = {
      gameState: opening.gameState,
      region: opening.world?.currentRegion,
      regionIndex: opening.world?.regionIndex,
      visibleObjectCount: opening.world?.visibleObjectCount,
      machine: opening.machine,
      hud: opening.ui?.runtimeHUD,
      gameplayComposition: opening.world?.streaming?.gameplayComposition || null,
    };
    const composition = opening.world?.streaming?.goldenCityComposition || null;
    const budget = computeScreenSpaceBudget(composition, composition?.viewport || { x: 0, y: 0, ...VIEWPORT });
    report.gameplay.openingBudget = budget;
    report.gameplay.openingBudgetBands = evaluateBudgetBands(budget);

    // ---- RT-08-HUD-CLIP : real node rects against the real 390x844 frame ---
    report.gameplay.openingHudGeometry = measureHudGeometry(opening);

    // ---- GAP-08-TIER-LADDER : can a level-1 player SEE T4/T5? --------------
    // The requirement is that a low-level player still *sees* the high tiers
    // and simply cannot swallow them, so this records what is present and
    // reachable at spawn rather than what is edible.
    report.gameplay.openingTierLadder = (() => {
      const objects = opening.objects || [];
      const tierCounts = {};
      for (const object of objects) {
        tierCounts[object.tier] = (tierCounts[object.tier] || 0) + 1;
      }
      const machineMaxTier = opening.machine?.maxTier ?? 1;
      const overTier = objects.filter((object) => object.tier > machineMaxTier);
      const nearestOverTier = overTier
        .map((object) => ({
          runtimeId: object.runtimeId,
          type: object.type,
          tier: object.tier,
          distance: Number(Math.hypot(object.x, object.z).toFixed(2)),
        }))
        .sort((a, b) => a.distance - b.distance);
      const authored = objects
        .filter((object) => String(object.runtimeId).startsWith('aspirational_authored_'))
        .map((object) => ({
          runtimeId: object.runtimeId,
          type: object.type,
          tier: object.tier,
          distance: Number(Math.hypot(object.x, object.z).toFixed(2)),
        }));
      const presentTiers = Object.keys(tierCounts).map(Number);
      return {
        machineMaxTier,
        objectCount: objects.length,
        tierCounts,
        highestPresentTier: presentTiers.length > 0 ? Math.max(...presentTiers) : null,
        // The gate: at spawn the frame must already contain a tier the player
        // cannot yet swallow, otherwise the ladder is invisible until late.
        exposesLockedTier: overTier.length > 0,
        nearestOverTier: nearestOverTier.slice(0, 5),
        authoredAspirational: authored,
      };
    })();

    // ---- 09 / 10 mechanic frames, driven by real play ----------------------
    // A blind circular sweep never brought the machine into suction range of a
    // T4/T5 body, so the tier-lock prompt was never produced. The runner now
    // seeks the nearest body the machine cannot yet swallow and steers at it
    // using the live camera basis, which is what a player does by hand.
    const joystick = opening.ui?.runtimeHUD;
    const drive = {
      startedAt: new Date().toISOString(),
      budgetMs: DRIVE_BUDGET_MS,
      sweeps: 0,
      steers: 0,
      seekTarget: null,
      directionSign: 1,
      tierLock: { status: 'NOT_REACHED' },
      largeTarget: { status: 'NOT_REACHED' },
      tierUpgrade: { status: 'NOT_REACHED' },
      samples: [],
    };
    report.targets.drive = drive;

    const startedAt = Date.now();
    let steerActive = false;
    let sweepIndex = 0;
    let lastSeekId = null;
    let lastDistance = null;
    let signProbeAt = 0;

    /** Nearest body the current maxTier cannot formally swallow. */
    const pickSeekTarget = (snapshot) => {
      const player = snapshot.player || { x: 0, z: 0 };
      const maxTier = snapshot.machine?.maxTier || 1;
      const candidates = (snapshot.objects || [])
        .filter((object) => object.state !== 'ABSORBED' && object.state !== 'RECYCLED')
        .filter((object) => object.tier > maxTier || object.lockVisible)
        .map((object) => ({
          ...object,
          distance: Math.hypot(object.x - player.x, object.z - player.z),
        }))
        .sort((a, b) => a.distance - b.distance);
      return candidates[0] || null;
    };

    while (Date.now() - startedAt < DRIVE_BUDGET_MS) {
      const snapshot = await snapshotOf(page);
      if (snapshot.gameState !== 'PLAYING') break;

      // 10 State A: the runtime is really showing the locked-target prompt.
      const tierLock = snapshot.ui?.tierLock?.endless || null;
      if (drive.tierLock.status === 'NOT_REACHED' && (tierLock?.activeCount === 1 || (snapshot.objects || []).some((o) => o.lockVisible))) {
        report.frames.tierLock = await capture(page, 'v4-390x844-10-tier-lock.png');
        drive.tierLock = {
          status: 'CAPTURED',
          presenter: tierLock,
          lockedObjects: (snapshot.objects || []).filter((o) => o.lockVisible),
          machineMaxTier: snapshot.machine?.maxTier,
          machineLevel: snapshot.machine?.level,
        };
      }
      // 10 State B: the real level-up banner is on screen right now.
      const upgrade = snapshot.ui?.tierUpgrade?.endless || null;
      if (drive.tierUpgrade.status === 'NOT_REACHED' && upgrade?.activeCount === 1) {
        report.frames.tierUpgrade = await capture(page, 'v4-390x844-10-tier-upgrade.png');
        drive.tierUpgrade = { status: 'CAPTURED', diagnostics: upgrade, machineLevel: snapshot.machine?.level };
      }
      // 09: a real T4/T5 body is mid-suction.
      if (drive.largeTarget.status === 'NOT_REACHED') {
        const large = (snapshot.objects || []).find(
          (object) => object.tier >= 4 && (object.state === 'SUCKING' || object.state === 'ATTRACTED'),
        );
        if (large) {
          report.frames.largeTarget = await capture(page, 'v4-390x844-09-large-target-suction.png');
          drive.largeTarget = {
            status: 'CAPTURED',
            runtimeId: large.runtimeId,
            tier: large.tier,
            type: large.type,
            state: large.state,
            machineMaxTier: snapshot.machine?.maxTier,
            machineLevel: snapshot.machine?.level,
          };
        }
      }
      if (drive.tierLock.status === 'CAPTURED' && drive.tierUpgrade.status === 'CAPTURED'
        && drive.largeTarget.status === 'CAPTURED') break;

      // Steer at the nearest body the machine cannot swallow yet.
      const target = pickSeekTarget(snapshot);
      drive.seekTarget = target
        ? { runtimeId: target.runtimeId, tier: target.tier, type: target.type, distance: Number(target.distance.toFixed(2)) }
        : null;
      if (target) {
        const player = snapshot.player || { x: 0, z: 0 };
        const forward = snapshot.camera?.forward || { x: 0, z: -1 };
        const right = snapshot.camera?.right || { x: 1, z: 0 };
        const deltaX = target.x - player.x;
        const deltaZ = target.z - player.z;
        const length = Math.hypot(deltaX, deltaZ) || 1;
        const unitX = deltaX / length;
        const unitZ = deltaZ / length;
        const joystickX = (unitX * right.x + unitZ * right.z) * drive.directionSign;
        const joystickY = (unitX * forward.x + unitZ * forward.z) * drive.directionSign;
        // Verify the camera-basis sign once per target: if the gap is growing,
        // the forward axis is inverted for this camera, so flip it.
        if (lastSeekId !== target.runtimeId) {
          lastSeekId = target.runtimeId;
          lastDistance = target.distance;
          signProbeAt = Date.now();
        } else if (Date.now() - signProbeAt > 2500 && lastDistance !== null) {
          if (target.distance > lastDistance * 1.05) {
            drive.directionSign *= -1;
            lastDistance = target.distance;
            signProbeAt = Date.now();
          }
        }
        if (!steerActive) {
          await steer(cdp, canvasRect, joystick, joystickX, joystickY);
          steerActive = true;
        } else {
          const centre = pointForNode(canvasRect, joystick.joystick?.knob || joystick.joystick, 'JOYSTICK');
          const radius = Math.min(canvasRect.width, canvasRect.height) * 0.06;
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: centre.x + joystickX * radius, y: centre.y - joystickY * radius }],
          });
        }
        drive.steers += 1;
      }
      sweepIndex += 1;
      drive.sweeps = sweepIndex;
      drive.samples.push({
        atMs: Date.now() - startedAt,
        level: snapshot.machine?.level,
        mass: snapshot.machine?.mass,
        maxTier: snapshot.machine?.maxTier,
        region: snapshot.world?.currentRegion,
        lockedVisible: (snapshot.objects || []).filter((object) => object.lockVisible).length,
        tierLockActive: snapshot.ui?.tierLock?.endless?.activeCount || 0,
        targetDistance: target ? Number(target.distance.toFixed(2)) : null,
      });
      await page.waitForTimeout(1500);
    }
    await releaseSteer(cdp);
    drive.endedAt = new Date().toISOString();

    // A settled frame after real movement, for composition review.
    await page.waitForTimeout(700);
    if ((await snapshotOf(page)).gameState === 'PLAYING') {
      report.frames.endlessGameplayMoved = await capture(page, 'v4-390x844-08-endless-gameplay-moved.png');
      const moved = await snapshotOf(page);
      const movedComposition = moved.world?.streaming?.goldenCityComposition || null;
      const movedBudget = computeScreenSpaceBudget(
        movedComposition,
        movedComposition?.viewport || { x: 0, y: 0, ...VIEWPORT },
      );
      report.gameplay.moved = {
        region: moved.world?.currentRegion,
        regionIndex: moved.world?.regionIndex,
        machine: moved.machine,
        gameplayComposition: moved.world?.streaming?.gameplayComposition || null,
        budget: movedBudget,
        budgetBands: evaluateBudgetBands(movedBudget),
      };
    }

    const finalSnapshot = await snapshotOf(page);
    report.gameplay.final = {
      gameState: finalSnapshot.gameState,
      machine: finalSnapshot.machine,
      tierUpgrade: finalSnapshot.ui?.tierUpgrade || null,
      hud: finalSnapshot.ui?.runtimeHUD,
      pickupFeedback: finalSnapshot.ui?.pickupFeedback || null,
    };
    // ---- 09 GROWTH PHASE + LARGE-TARGET CAPTURE ----------------------------
    // The drive phase above steers at bodies the machine cannot yet swallow, so
    // it can never produce reference 09: CompressibleObject.ts:277 keeps a
    // locked target in IDLE forever. Below level 4 the 09 predicate
    // `tier >= 4 && (SUCKING || ATTRACTED)` is therefore unreachable. This
    // phase earns the level first, by playing the game, and only then hunts.
    //
    // Everything below is real joystick play through CDP touch events on the
    // live joystick. It never writes mass, level or tier, never edits a save,
    // and never calls a debug/QA setter.
    const stateHistoryByRuntimeId = new Map();
    const sampleStates = (snapshot) => {
      for (const object of snapshot.objects || []) {
        const chain = stateHistoryByRuntimeId.get(object.runtimeId) || [];
        if (chain[chain.length - 1] !== object.state) {
          chain.push(object.state);
          if (chain.length > 32) chain.shift();
          stateHistoryByRuntimeId.set(object.runtimeId, chain);
        }
      }
    };
    const isAvailable = (object) => object.state !== 'ABSORBED' && object.state !== 'RECYCLED';
    const isTraffic = (object) => object.runtimeId.startsWith('traffic_');

    /** Normalized world direction -> joystick vector, solved on the live camera basis. */
    const solveInput = (camera, dx, dz) => {
      const right = camera?.right || { x: 1, z: 0 };
      const forward = camera?.forward || { x: 0, z: -1 };
      const determinant = right.x * forward.z - forward.x * right.z;
      if (Math.abs(determinant) < 1e-6) return { jx: 0, jy: 1 };
      let jx = (dx * forward.z - dz * forward.x) / determinant;
      let jy = (right.x * dz - right.z * dx) / determinant;
      const magnitude = Math.hypot(jx, jy);
      if (magnitude > 1) {
        jx /= magnitude;
        jy /= magnitude;
      }
      return { jx, jy };
    };

    const growth = {
      status: 'SKIPPED',
      reason: null,
      budgetMs: GROWTH_BUDGET_MS,
      targetMaxTier: GROWTH_TARGET_MAX_TIER,
      steerRadiusRatio: GROWTH_STEER_RADIUS_RATIO,
      method: 'real joystick play only (CDP touch events); no setter, no save edit, no QA hook',
      entryLevel: null,
      entryMass: null,
      entryMaxTier: null,
      finalLevel: null,
      finalMass: null,
      finalMaxTier: null,
      elapsedMs: 0,
      reachedTargetMaxTier: false,
      targetsPursued: 0,
      absorbedCount: 0,
      stalledTargets: 0,
      absorbedByTier: {},
      absorbed: [],
      levelTimeline: [],
      progressLog: [],
      startedAt: null,
      endedAt: null,
      exitReason: null,
    };
    report.targets.drive.growth = growth;

    const largeSeek = {
      status: 'SKIPPED',
      reason: null,
      budgetMs: LARGE_TARGET_SEEK_BUDGET_MS,
      predicate: 'object.tier >= 4 && (object.state === "SUCKING" || object.state === "ATTRACTED")',
      entryLevel: null,
      entryMass: null,
      entryMaxTier: null,
      target: null,
      elapsedMs: 0,
      startedAt: null,
      endedAt: null,
      exitReason: null,
    };
    report.targets.drive.largeSeek = largeSeek;

    if (drive.largeTarget.status !== 'NOT_REACHED') {
      growth.reason = 'ALREADY_CAPTURED_IN_DRIVE_PHASE';
      largeSeek.reason = 'ALREADY_CAPTURED_IN_DRIVE_PHASE';
    } else if (!joystick) {
      growth.reason = 'NO_JOYSTICK_IN_SNAPSHOT';
      largeSeek.reason = 'NO_JOYSTICK_IN_SNAPSHOT';
    } else if ((await snapshotOf(page)).gameState !== 'PLAYING') {
      growth.reason = 'NOT_PLAYING';
      largeSeek.reason = 'NOT_PLAYING';
    } else {
      let joystickBase = null;
      try {
        joystickBase = pointForNode(canvasRect, joystick.knob || joystick.joystickKnob || joystick, 'JOYSTICK');
      } catch (error) {
        growth.reason = `JOYSTICK_UNAVAILABLE:${error.message}`;
        largeSeek.reason = `JOYSTICK_UNAVAILABLE:${error.message}`;
      }

      if (joystickBase) {
        let joyHeld = false;
        const joyMove = async (jx, jy) => {
          if (!joyHeld) {
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: [{ x: joystickBase.x, y: joystickBase.y }],
            });
            joyHeld = true;
          }
          await steerHeld(cdp, canvasRect, joystickBase, jx, jy, GROWTH_STEER_RADIUS_RATIO);
        };
        const joyRelease = async () => {
          if (!joyHeld) return;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          joyHeld = false;
        };

        /** Hold the joystick toward `resolveTarget(snapshot)` until it stops resolving. */
        const pursue = async (resolveTarget, options = {}) => {
          const deadline = options.deadline ?? Date.now() + 20000;
          const pollMs = options.pollMs ?? 90;
          let snapshot = await snapshotOf(page);
          while (Date.now() < deadline) {
            if (snapshot.gameState !== 'PLAYING') return { snapshot, ended: 'LEFT_PLAYING' };
            sampleStates(snapshot);
            if (options.onSample && (await options.onSample(snapshot)) === false) {
              return { snapshot, ended: 'STOPPED_BY_SAMPLE' };
            }
            const target = resolveTarget(snapshot);
            if (!target) return { snapshot, ended: 'NO_TARGET' };
            const deltaX = target.x - snapshot.player.x;
            const deltaZ = target.z - snapshot.player.z;
            const distance = Math.hypot(deltaX, deltaZ);
            const { jx, jy } = solveInput(
              snapshot.camera,
              deltaX / Math.max(distance, 1e-6),
              deltaZ / Math.max(distance, 1e-6),
            );
            await joyMove(jx, jy);
            await page.waitForTimeout(pollMs);
            snapshot = await snapshotOf(page);
          }
          return { snapshot, ended: 'DEADLINE' };
        };

        // ---- Growth: eat only what the current maxTier allows --------------
        growth.status = 'RUNNING';
        growth.startedAt = new Date().toISOString();
        const growthStart = Date.now();
        let lastProgressLogAt = 0;
        let growthSnapshot = await snapshotOf(page);
        growth.entryLevel = growthSnapshot.machine?.level ?? null;
        growth.entryMass = growthSnapshot.machine?.mass ?? null;
        growth.entryMaxTier = growthSnapshot.machine?.maxTier ?? null;
        growth.levelTimeline.push({
          level: growth.entryLevel,
          mass: growth.entryMass,
          maxTier: growth.entryMaxTier,
          atMs: 0,
        });

        while (Date.now() - growthStart < GROWTH_BUDGET_MS) {
          growthSnapshot = await snapshotOf(page);
          if (growthSnapshot.gameState !== 'PLAYING') {
            growth.exitReason = `LEFT_PLAYING:${growthSnapshot.gameState}`;
            break;
          }
          sampleStates(growthSnapshot);
          const maxTier = growthSnapshot.machine?.maxTier || 1;
          if (maxTier >= GROWTH_TARGET_MAX_TIER) {
            growth.exitReason = 'MAX_TIER_REACHED';
            break;
          }
          if (Date.now() - lastProgressLogAt >= 30000) {
            lastProgressLogAt = Date.now();
            growthLog(
              `level=${growthSnapshot.machine?.level} mass=${growthSnapshot.machine?.mass} `
              + `elapsed=${Math.round((Date.now() - growthStart) / 1000)}s maxTier=${maxTier} `
              + `absorbed=${growth.absorbedCount}`,
            );
            growth.progressLog.push({
              atMs: Date.now() - growthStart,
              level: growthSnapshot.machine?.level,
              mass: growthSnapshot.machine?.mass,
              maxTier,
              absorbedCount: growth.absorbedCount,
            });
          }
          // Only bodies the machine can actually swallow; locked targets stall growth.
          const edible = (growthSnapshot.objects || [])
            .filter((object) => !isTraffic(object))
            .filter(isAvailable)
            .filter((object) => object.tier <= maxTier)
            .map((object) => ({
              ...object,
              distance: Math.hypot(object.x - growthSnapshot.player.x, object.z - growthSnapshot.player.z),
            }));
          if (edible.length === 0) {
            // Nothing edible is streamed in: roam forward so fresh cells load.
            const forward = growthSnapshot.camera?.forward || { x: 0, z: -1 };
            const { jx, jy } = solveInput(growthSnapshot.camera, forward.x, forward.z);
            await joyMove(jx, jy);
            await page.waitForTimeout(600);
            continue;
          }
          const bestTier = Math.max(...edible.map((object) => object.tier));
          edible.sort((a, b) => a.distance - b.distance);
          const target = edible.find((object) => object.tier === bestTier);
          growth.targetsPursued += 1;
          await pursue(
            (snapshot) => {
              const object = (snapshot.objects || []).find((entry) => entry.runtimeId === target.runtimeId);
              return object && isAvailable(object) ? object : null;
            },
            {
              deadline: Date.now() + 25000,
              onSample: (snapshot) => (snapshot.machine?.maxTier || 1) < GROWTH_TARGET_MAX_TIER,
            },
          );
          await joyRelease();
          const settled = await snapshotOf(page);
          sampleStates(settled);
          const after = (settled.objects || []).find((entry) => entry.runtimeId === target.runtimeId);
          if (!after || !isAvailable(after)) {
            growth.absorbedCount += 1;
            growth.absorbedByTier[target.tier] = (growth.absorbedByTier[target.tier] || 0) + 1;
            if (growth.absorbed.length < 300) {
              growth.absorbed.push({
                runtimeId: target.runtimeId,
                type: target.type,
                tier: target.tier,
                atMs: Date.now() - growthStart,
              });
            }
          } else {
            growth.stalledTargets += 1;
          }
          const level = settled.machine?.level ?? null;
          const previousLevel = growth.levelTimeline[growth.levelTimeline.length - 1];
          if (previousLevel?.level !== level) {
            growth.levelTimeline.push({
              level,
              mass: settled.machine?.mass ?? null,
              maxTier: settled.machine?.maxTier ?? null,
              atMs: Date.now() - growthStart,
            });
          }
          if (settled.gameState !== 'PLAYING') {
            growth.exitReason = `LEFT_PLAYING:${settled.gameState}`;
            break;
          }
        }
        await joyRelease();

        const growthFinal = await snapshotOf(page);
        growth.finalLevel = growthFinal.machine?.level ?? null;
        growth.finalMass = growthFinal.machine?.mass ?? null;
        growth.finalMaxTier = growthFinal.machine?.maxTier ?? null;
        growth.elapsedMs = Date.now() - growthStart;
        growth.endedAt = new Date().toISOString();
        growth.reachedTargetMaxTier = (growth.finalMaxTier || 1) >= GROWTH_TARGET_MAX_TIER;
        growth.status = growth.reachedTargetMaxTier ? 'REACHED' : 'BUDGET_EXHAUSTED';
        if (!growth.exitReason) growth.exitReason = 'BUDGET_EXHAUSTED';
        growthLog(
          `done level=${growth.finalLevel} mass=${growth.finalMass} maxTier=${growth.finalMaxTier} `
          + `absorbed=${growth.absorbedCount} elapsed=${Math.round(growth.elapsedMs / 1000)}s `
          + `exit=${growth.exitReason}`,
        );

        // ---- Hunt a T4/T5 body and shoot the first real suction frame ------
        if (!growth.reachedTargetMaxTier) {
          largeSeek.reason = `MAX_TIER_${growth.finalMaxTier}_BELOW_${GROWTH_TARGET_MAX_TIER}`;
        } else {
          largeSeek.status = 'RUNNING';
          largeSeek.startedAt = new Date().toISOString();
          const seekStart = Date.now();
          const seekDeadline = seekStart + LARGE_TARGET_SEEK_BUDGET_MS;
          let seekSnapshot = await snapshotOf(page);
          largeSeek.entryLevel = seekSnapshot.machine?.level ?? null;
          largeSeek.entryMass = seekSnapshot.machine?.mass ?? null;
          largeSeek.entryMaxTier = seekSnapshot.machine?.maxTier ?? null;

          while (Date.now() < seekDeadline && drive.largeTarget.status === 'NOT_REACHED') {
            seekSnapshot = await snapshotOf(page);
            if (seekSnapshot.gameState !== 'PLAYING') {
              largeSeek.exitReason = `LEFT_PLAYING:${seekSnapshot.gameState}`;
              break;
            }
            sampleStates(seekSnapshot);
            const maxTier = seekSnapshot.machine?.maxTier || 1;
            const edibleLarge = (seekSnapshot.objects || [])
              .filter(isAvailable)
              .filter((object) => object.tier >= 4 && object.tier <= maxTier)
              .map((object) => ({
                ...object,
                distance: Math.hypot(object.x - seekSnapshot.player.x, object.z - seekSnapshot.player.z),
              }))
              .sort((a, b) => a.distance - b.distance);
            if (edibleLarge.length === 0) {
              // No T4/T5 in stream range yet: roam forward to load a richer cell.
              const forward = seekSnapshot.camera?.forward || { x: 0, z: -1 };
              const { jx, jy } = solveInput(seekSnapshot.camera, forward.x, forward.z);
              await joyMove(jx, jy);
              await page.waitForTimeout(600);
              continue;
            }
            const target = edibleLarge[0];
            largeSeek.target = {
              runtimeId: target.runtimeId,
              tier: target.tier,
              type: target.type,
              distance: Number(target.distance.toFixed(2)),
            };
            await pursue(
              (snapshot) => {
                const object = (snapshot.objects || []).find((entry) => entry.runtimeId === target.runtimeId);
                return object && isAvailable(object) ? object : null;
              },
              {
                deadline: Math.min(seekDeadline, Date.now() + 30000),
                onSample: async (snapshot) => {
                  // FIRST moment the 09 predicate really holds.
                  const large = (snapshot.objects || []).find(
                    (object) => object.tier >= 4 && (object.state === 'SUCKING' || object.state === 'ATTRACTED'),
                  );
                  if (!large) return true;
                  report.frames.largeTarget = await capture(page, 'v4-390x844-09-large-target-suction.png');
                  drive.largeTarget = {
                    status: 'CAPTURED',
                    runtimeId: large.runtimeId,
                    tier: large.tier,
                    type: large.type,
                    state: large.state,
                    machineMaxTier: snapshot.machine?.maxTier,
                    machineLevel: snapshot.machine?.level,
                    machineMass: snapshot.machine?.mass,
                    suctionRadius: snapshot.machine?.suctionRadius,
                    distanceToMachine: Number(
                      Math.hypot(large.x - snapshot.player.x, large.z - snapshot.player.z).toFixed(2),
                    ),
                    chain: [...(stateHistoryByRuntimeId.get(large.runtimeId) || [])],
                    drivenTarget: { runtimeId: target.runtimeId, tier: target.tier, type: target.type },
                    capturedAt: new Date().toISOString(),
                    captureSource: 'GROWTH_PHASE_REAL_JOYSTICK_PLAY',
                  };
                  largeSeek.status = 'CAPTURED';
                  return false;
                },
              },
            );
            if (drive.largeTarget.status === 'CAPTURED') break;
            await joyRelease();
          }
          await joyRelease();
          largeSeek.elapsedMs = Date.now() - seekStart;
          largeSeek.endedAt = new Date().toISOString();
          if (largeSeek.status === 'RUNNING') {
            largeSeek.status = 'NOT_REACHED';
            if (!largeSeek.exitReason) largeSeek.exitReason = 'BUDGET_EXHAUSTED';
          }
          if (drive.largeTarget.status === 'CAPTURED') {
            const afterCapture = await snapshotOf(page);
            const captured = (afterCapture.objects || [])
              .find((entry) => entry.runtimeId === drive.largeTarget.runtimeId);
            drive.largeTarget.stateAfterCapture = captured ? captured.state : 'RECYCLED_OR_UNLOADED';
            drive.largeTarget.chainAfterCapture = [
              ...(stateHistoryByRuntimeId.get(drive.largeTarget.runtimeId) || []),
            ];
            drive.largeTarget.machineLevelAfterCapture = afterCapture.machine?.level ?? null;
            growthLog(
              `large target CAPTURED tier=${drive.largeTarget.tier} type=${drive.largeTarget.type} `
              + `state=${drive.largeTarget.state} level=${drive.largeTarget.machineLevel}`,
            );
          } else {
            largeSeek.reason = `NO_SUCTION_FRAME_WITHIN_${LARGE_TARGET_SEEK_BUDGET_MS}ms`;
            growthLog(`large target NOT_REACHED exit=${largeSeek.exitReason}`);
          }
        }

        const afterGrowth = await snapshotOf(page);
        report.gameplay.finalAfterGrowth = {
          gameState: afterGrowth.gameState,
          machine: afterGrowth.machine,
          tierUpgrade: afterGrowth.ui?.tierUpgrade || null,
          hud: afterGrowth.ui?.runtimeHUD,
          pickupFeedback: afterGrowth.ui?.pickupFeedback || null,
        };
      }
    }

    report.consoleErrors = report.consoleErrors.filter((message) => !/favicon/i.test(message));
    // Split genuine application errors from the two Chromium warnings this
    // harness provokes by driving a real joystick through CDP touch events.
    report.consoleErrorsHarness = report.consoleErrors.filter(
      (message) => message.includes(HARNESS_TOUCH_CANCEL_SIGNATURE),
    );
    report.consoleErrorsApp = report.consoleErrors.filter(
      (message) => !message.includes(HARNESS_TOUCH_CANCEL_SIGNATURE),
    );
    report.status = 'COMPLETE';
  } catch (error) {
    report.status = 'FAILED';
    report.error = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
    log(`FAILED: ${report.error}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  log(`report -> ${reportPath}`);
  if (report.status !== 'COMPLETE') process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`[v4-evidence] FATAL ${error?.stack || error}\n`);
  process.exitCode = 1;
});
