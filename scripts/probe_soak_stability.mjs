/**
 * Stability soak: does anything grow without bound over a long Endless session?
 *
 * The S11 performance runner samples 120 frames per scenario, which is enough for
 * a frame-time baseline and far too short to see a leak. This plays Endless for
 * minutes, samples every read-only counter the bridge exposes, and compares the
 * first third of the run against the last third. A counter that only ever rises
 * is reported; a counter that plateaus is not.
 *
 * Node counts are the reachable proxy for growth here: the engine does not expose
 * memory (see cocos/docs/V10_PERFORMANCE_BASELINE.md), so a leak that does not
 * show up as retained nodes or retained streamed objects is not detectable from
 * the read-only surface, and this run cannot rule it out.
 *
 * Usage: node scripts/probe_soak_stability.mjs [minutes]
 *   -> artifacts/qa/v95/soak-stability.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDirectory = path.join(repoRoot, 'artifacts', 'qa', 'v95');
const minutes = Number(process.argv[2] || 6);
mkdirSync(outDirectory, { recursive: true });

const { server, port } = await serve(path.join(repoRoot, 'cocos', 'build', 'web-mobile'));
const browser = await launchBrowser();
const opened = await openPage(browser, port, { width: 390, height: 844 });
const { page, cdp, canvasRect } = opened;
const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());

const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

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
await tap(canvasRect.left + canvasRect.width * ready.ui.endlessReady.start.screen.x,
  canvasRect.top + canvasRect.height * ready.ui.endlessReady.start.screen.y);
await waitState('PLAYING');

const first = await snapshot();
const joystick = first.ui?.runtimeHUD?.joystick;
const jx = canvasRect.left + canvasRect.width * joystick.screen.x;
const jy = canvasRect.top + canvasRect.height * joystick.screen.y;
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy }] });

/** Re-steer every sample, as the gameplay gate does; a straight line starves play. */
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

/** Every numeric leaf of the read-only counters, keyed by path. */
function numericLeaves(node, trail = '', out = {}) {
  if (!node || typeof node !== 'object') return out;
  for (const [key, value] of Object.entries(node)) {
    const path_ = trail ? `${trail}.${key}` : key;
    if (typeof value === 'number' && Number.isFinite(value)) out[path_] = value;
    else if (value && typeof value === 'object') numericLeaves(value, path_, out);
  }
  return out;
}

const samples = [];
const deadline = Date.now() + minutes * 60 * 1000;
let tick = 0;
while (Date.now() < deadline) {
  const live = await snapshot();
  await steer(live);
  samples.push({
    t: tick,
    level: live.playerVisibility?.level ?? null,
    mass: live.machine?.mass ?? null,
    counters: numericLeaves({ cocos: live.performance?.cocos, world: live.performance?.world }),
  });
  tick += 1;
  if (tick % 20 === 0) {
    const c = samples[samples.length - 1].counters;
    console.log(`[soak] t=${tick} level=${samples[samples.length - 1].level}`
      + ` nodes=${c['cocos.sceneNodeCount']} active=${c['cocos.activeNodeCount']}`
      + ` mesh=${c['cocos.activeMeshRendererCount']} objects=${c['cocos.activeObjectCount']}`
      + ` errors=${consoleErrors.length}`);
  }
  await sleep(2000);
}

await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await opened.context.close();
await browser.close();
server.close();

// First third vs last third, per counter.
const third = Math.max(1, Math.floor(samples.length / 3));
const head = samples.slice(0, third);
const tail = samples.slice(-third);
const mean = (rows, key) => {
  const values = rows.map((row) => row.counters[key]).filter((value) => typeof value === 'number');
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
};
const keys = new Set(samples.flatMap((row) => Object.keys(row.counters)));
const drift = [];
for (const key of [...keys].sort()) {
  const before = mean(head, key);
  const after = mean(tail, key);
  if (before === null || after === null) continue;
  const delta = after - before;
  const relative = before === 0 ? (after === 0 ? 0 : Infinity) : delta / before;
  // A counter that rose by more than 5% and by more than 5 units, or that only
  // ever increased across every sample, is worth naming.
  const monotonic = samples.every((row, index) => index === 0 || (row.counters[key] ?? 0) >= (samples[index - 1].counters[key] ?? 0));
  if ((relative > 0.05 && delta > 5) || (monotonic && delta > 0)) {
    drift.push({ key, before, after, delta, relative, monotonic });
  }
}

const report = {
  schema: 'bhr.soak-stability/1',
  minutes,
  samples: samples.length,
  consoleErrors,
  headMean: Object.fromEntries([...keys].map((key) => [key, mean(head, key)])),
  tailMean: Object.fromEntries([...keys].map((key) => [key, mean(tail, key)])),
  drift,
  note: 'Node and streamed-object counts only. The engine exposes no memory counter, '
    + 'so a leak that retains neither nodes nor streamed objects is not detectable here.',
};
const outPath = path.join(outDirectory, 'soak-stability.json');
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`\n[soak] ${samples.length} samples over ${minutes} min, ${consoleErrors.length} console error(s)`);
console.log(`[soak] wrote ${path.relative(repoRoot, outPath)}`);
if (drift.length === 0) {
  console.log('[soak] no counter grew: first-third means match last-third means.');
} else {
  console.log('[soak] counters that grew:');
  for (const entry of drift) {
    console.log(`  ${entry.key}: ${entry.before.toFixed(1)} -> ${entry.after.toFixed(1)}`
      + ` (${entry.relative === Infinity ? 'from 0' : `${(entry.relative * 100).toFixed(1)}%`}${entry.monotonic ? ', monotonic' : ''})`);
  }
}
