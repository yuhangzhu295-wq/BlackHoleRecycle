/**
 * Why does the tier-upgrade banner coverage assertion report 0 samples?
 *
 * `verify_gameplay_visuals.mjs` asserts that `^TierUpgradeBanner_` was projected
 * at least once, and fails roughly two runs in three even though the match
 * demonstrably reaches level 2. Two candidate causes were ruled out by reading
 * the code: the banner is 600 design units wide (not a full-bleed backdrop, so
 * `splitContent` keeps it), and the counter is now seeded before the match so no
 * increase is missed.
 *
 * This watches the counter directly and, on the frame it increases, dumps what
 * the geometry sampler actually saw -- whether any banner node is present at all,
 * and if not, what the tree looks like at that moment. That distinguishes "the
 * banner was never created" from "it was created but is not sampled".
 *
 * Usage: node scripts/probe_tier_banner.mjs [seconds]
 *   -> artifacts/qa/v95/tier-banner-probe.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGeometry, launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDirectory = path.join(repoRoot, 'artifacts', 'qa', 'v95');
const seconds = Number(process.argv[2] || 60);
mkdirSync(outDirectory, { recursive: true });

const { server, port } = await serve(buildDirectory);
const browser = await launchBrowser();
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
await tapUi('modeEndless');
await waitState('MODE_READY');
const ready = await snapshot();
const startNode = (ready.ui?.endlessReady || ready.ui?.arenaReady)?.start;
await tap(canvasRect.left + canvasRect.width * startNode.screen.x,
  canvasRect.top + canvasRect.height * startNode.screen.y);
await waitState('PLAYING');

const joystick = (await snapshot()).ui?.runtimeHUD?.joystick;
const jx = canvasRect.left + canvasRect.width * joystick.screen.x;
const jy = canvasRect.top + canvasRect.height * joystick.screen.y;
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy }] });

/**
 * Re-steer every iteration toward the nearest edible object, exactly as
 * `verify_gameplay_visuals.mjs` does. Steering once and never updating leaves the
 * player walking in a straight line out of the collectible cluster, which starves
 * absorption and produces no upgrade -- a fixture artifact that would look like a
 * product finding.
 */
const steer = async (live) => {
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

let lastEmitted = Number((await snapshot()).ui?.tierUpgrade?.endless?.emittedCount ?? 0);
console.log(`[tier-banner] seed emittedCount=${lastEmitted}`);
const observations = [];
const deadline = Date.now() + seconds * 1000;
let tick = 0;

while (Date.now() < deadline) {
  const live = await snapshot();
  await steer(live);
  tick += 1;

  const diagnostics = live.ui?.tierUpgrade?.endless ?? null;
  const emitted = Number(diagnostics?.emittedCount ?? 0);
  const level = live.playerVisibility?.level ?? null;

  if (tick % 5 === 0 || emitted > lastEmitted || Number(diagnostics?.suppressedCount ?? 0) > 0) {
    console.log(`[tier-banner] t=${tick} level=${level} emitted=${emitted}`
      + ` suppressed=${diagnostics?.suppressedCount ?? 'n/a'}`
      + ` reason=${diagnostics?.lastSuppressReason ?? 'n/a'}`
      + ` active=${diagnostics?.activeCount ?? 'n/a'}`);
  }

  if (emitted > lastEmitted) {
    for (const delay of [0, 300, 900]) {
      if (delay) await sleep(delay);
      const geometry = await collectGeometry(page, 'EndlessHUD');
      const nodes = geometry.error ? [] : geometry.nodes;
      const banners = nodes.filter((node) => /^TierUpgradeBanner_/.test(node.name)).map((node) => node.name);
      // The clamp's own record for this frame: the banner must be listed as a
      // skipped overlay and must not appear inside any group. Merging it into a
      // panel's group is what pushed that group past the safe span and produced
      // the Arena clip (see V9_7_TWO_MODE_REGRESSION.md §4).
      const fresh = await snapshot();
      const pass = fresh.ui?.runtimeHUD?.safeArea ?? null;
      const mergedInto = (pass?.groups || [])
        .filter((group) => (group.names || []).some((name) => /^TierUpgradeBanner_/.test(name)))
        .map((group) => group.names.join(','));
      observations.push({
        emitted,
        delayMs: delay,
        geometryError: geometry.error ?? null,
        nodeCount: nodes.length,
        bannerNodes: banners,
        diagnostics,
        playerLevel: level,
        clampSkippedOverlay: pass?.skippedOverlay ?? null,
        clampBannerMergedIntoGroups: mergedInto,
      });
      console.log(`[tier-banner] emitted=${emitted} +${delay}ms -> ${banners.length} banner node(s) of ${nodes.length}`
        + ` | clamp skippedOverlay=[${(pass?.skippedOverlay || []).join(',')}]`
        + ` mergedIntoGroups=${mergedInto.length}`);
    }
    lastEmitted = emitted;
  }

  // Match the gameplay gate's cadence; steering far more often than this keeps
  // re-issuing touchMove and the player never settles into absorbing.
  await sleep(1100);
}

await opened.context.close();
await browser.close();
server.close();

const outPath = path.join(outDirectory, 'tier-banner-probe.json');
writeFileSync(outPath, `${JSON.stringify({ observations }, null, 2)}\n`);
console.log(`[tier-banner] wrote ${path.relative(repoRoot, outPath)} (${observations.length} observation(s))`);
if (observations.length === 0) {
  console.log('[tier-banner] no upgrade was emitted in the window -- the assertion has no coverage to find');
  process.exitCode = 2;
} else if (observations.every((entry) => entry.bannerNodes.length === 0)) {
  console.log('[tier-banner] an upgrade WAS emitted but no banner node was ever sampled');
  process.exitCode = 3;
}
