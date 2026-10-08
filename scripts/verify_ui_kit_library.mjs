/**
 * Gate: every declared UI Kit prefab and frame is resident at runtime.
 *
 * The prefab contract proves the files exist and are structurally sound, and the
 * build proves they are packed. Neither proves Cocos *imported* them: a prefab
 * whose graph Creator rejects is simply absent from the bundle, and the library
 * then reports it as a missing asset and every caller falls back silently. That
 * is the "declared but never shipped" gap, and only the runtime can close it.
 *
 * The library loads on first use, so this opens a page that uses it before
 * reading the state. `boundPrefabs` is the set that actually resolved, and
 * `lastError` names anything that did not.
 *
 * Usage: node scripts/verify_ui_kit_library.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser,
  openPage,
  serve,
  sleep,
} from './lib/page_layout_geometry.mjs';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');

const SIZE = { width: 412, height: 915, label: 'pixel-20:9' };

/** Must match UI_PREFAB_PATHS in UIAssetLibrary. */
const PREFAB_KEYS = [
  'panel', 'card', 'hudBar', 'popup', 'button',
  'modeCard', 'brandHeader', 'currencyPill', 'levelPill', 'progressBar', 'hudStat', 'leaderboardRow',
];
/** Must match UI_FRAME_PATHS in UIAssetLibrary. */
const FRAME_KEYS = [
  'mapPreviewCity', 'mapPreviewArena', 'joystickBase', 'joystickKnob',
  'panel', 'card', 'button', 'popup', 'hudBar',
];

const { server, port } = await serve(buildDirectory);
const browser = await launchBrowser();
const failures = [];
const note = (ok, message) => {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${message}`);
  if (!ok) failures.push(message);
};

try {
  const { page, cdp, canvasRect } = await openPage(browser, port, SIZE);
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());

  // Opening Machine Info makes the library load; it mounts the Kit progress bar.
  let s = await snapshot();
  const card = s.ui?.machine;
  if (!card?.active) throw new Error(`FAIL_NAV_machine: ${JSON.stringify(card)}`);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: canvasRect.left + canvasRect.width * card.screen.x,
      y: canvasRect.top + canvasRect.height * card.screen.y }],
  });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await page.waitForFunction(() => {
    const assets = window.__BHR_QA__.snapshot().uiAssets;
    return assets && (assets.ready || assets.lastError);
  }, undefined, { timeout: 30000 }).catch(() => {});
  await sleep(1500);

  const assets = (await snapshot()).uiAssets;
  if (!assets) throw new Error('FAIL_NO_UI_ASSETS: the QA bridge exposes no uiAssets section');
  console.log(`uiAssets: ready=${assets.ready} pending=${assets.pending}`
    + ` lastError=${JSON.stringify(assets.lastError)}`);
  console.log(`  boundPrefabs(${assets.boundPrefabs.length}): ${assets.boundPrefabs.join(', ')}`);
  console.log(`  boundFrames(${assets.boundFrames.length}): ${assets.boundFrames.join(', ')}`);

  note(assets.lastError === null,
    `the library loaded without error (lastError=${JSON.stringify(assets.lastError)})`);

  const boundPrefabs = new Set(assets.boundPrefabs);
  const missingPrefabs = PREFAB_KEYS.filter((key) => !boundPrefabs.has(key));
  note(missingPrefabs.length === 0,
    `every declared prefab is resident; missing: ${missingPrefabs.join(', ') || 'none'}`);

  const boundFrames = new Set(assets.boundFrames);
  const missingFrames = FRAME_KEYS.filter((key) => !boundFrames.has(key));
  note(missingFrames.length === 0,
    `every declared frame is resident; missing: ${missingFrames.join(', ') || 'none'}`);

  // The Kit specifically, called out so a regression names the new units rather
  // than only moving a count.
  const KIT_KEYS = ['modeCard', 'brandHeader', 'currencyPill', 'levelPill', 'progressBar', 'hudStat', 'leaderboardRow'];
  const missingKit = KIT_KEYS.filter((key) => !boundPrefabs.has(key));
  note(missingKit.length === 0,
    `all ${KIT_KEYS.length} V9 UI Kit prefabs are resident; missing: ${missingKit.join(', ') || 'none'}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n[verify:ui-kit] FAIL: ${failures.length} assertion(s)`);
  failures.forEach((line) => console.error(`  ${line}`));
  process.exit(1);
}
console.log('\n[verify:ui-kit] PASS: the whole UI Kit is resident at runtime, not merely declared.');
