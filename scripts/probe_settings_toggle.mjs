/**
 * Verify the Pause page's sound toggle by actually using it.
 *
 * The mandate for this feature is explicit that the check must be a real page
 * interaction and not "the TS method exists". So this drives the real runtime:
 * it navigates to Pause through the normal flow, taps the toggle where the UI
 * camera actually puts it, and asserts against the persisted save rather than the
 * label -- the label is what the player reads, the save is the state that has to
 * survive a restart.
 *
 * Then it reloads and re-enters Pause, so "persisted" is demonstrated and not
 * assumed.
 *
 * Usage: node scripts/probe_settings_toggle.mjs
 *   -> artifacts/qa/v95/settings-toggle.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGeometry, launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDirectory = path.join(repoRoot, 'artifacts', 'qa', 'v95');
mkdirSync(outDirectory, { recursive: true });

/** The save blob key used by SaveService, read from the page's own storage. */
/** The save blob SaveService writes, read straight out of the page's storage. */
const SAVE_KEY = 'BLACK_HOLE_RECYCLE_SAVEDATA_COCOS_V1';
const readSfx = (page) => page.evaluate((key) => {
  const raw = window.localStorage.getItem(key);
  if (!raw) return { present: false, sfx: null };
  try {
    const parsed = JSON.parse(raw);
    return { present: true, sfx: parsed?.settings?.sfx ?? null };
  } catch {
    return { present: true, sfx: null };
  }
}, SAVE_KEY);

/** The toggle's rendered label, straight off the scene graph. */
const readLabel = (page) => page.evaluate(() => {
  const canvas = window.cc?.director?.getScene()?.getChildByName('Canvas');
  const page_ = canvas?.getChildByName('PausePage');
  const node = page_?.getChildByName('BtnSfxToggle')?.getChildByName('BtnSfxToggleLabel');
  const label = node?.getComponent('cc.Label');
  return label ? label.string : null;
});

const { server, port } = await serve(path.join(repoRoot, 'cocos', 'build', 'web-mobile'));
const browser = await launchBrowser();
const steps = [];
let failure = null;

try {
  let opened = await openPage(browser, port, { width: 390, height: 844 });
  const navigate = async (handles) => {
    const snapshot = () => handles.page.evaluate(() => window.__BHR_QA__.snapshot());
    const tap = async (x, y) => {
      await handles.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(60);
      await handles.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(700);
    };
    const tapUi = async (key) => {
      const s = await snapshot();
      const node = s.ui?.[key];
      if (!node?.active || !node?.screen) throw new Error(`FAIL_NAV_${key}`);
      await tap(handles.canvasRect.left + handles.canvasRect.width * node.screen.x,
        handles.canvasRect.top + handles.canvasRect.height * node.screen.y);
    };
    const waitState = (want, ms = 20000) => handles.page.waitForFunction(
      (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

    await tapUi('start');
    await waitState('MODE_SELECT');
    await tapUi('modeEndless');
    await waitState('MODE_READY');
    const ready = await snapshot();
    await tap(handles.canvasRect.left + handles.canvasRect.width * ready.ui.endlessReady.start.screen.x,
      handles.canvasRect.top + handles.canvasRect.height * ready.ui.endlessReady.start.screen.y);
    await waitState('PLAYING');
    await sleep(1500);
    const playing = await snapshot();
    await tap(handles.canvasRect.left + handles.canvasRect.width * playing.ui.runtimeHUD.pauseButton.screen.x,
      handles.canvasRect.top + handles.canvasRect.height * playing.ui.runtimeHUD.pauseButton.screen.y);
    await sleep(1200);
  };

  await navigate(opened);

  const before = { save: await readSfx(opened.page), label: await readLabel(opened.page) };
  steps.push({ step: 'initial', ...before });

  // Tap the toggle where the UI camera actually draws it.
  const geometry = await collectGeometry(opened.page, 'PausePage');
  const toggle = (geometry.nodes || []).find((node) => node.name === 'BtnSfxToggle');
  if (!toggle) throw new Error('BtnSfxToggle was not projected on the Pause page');
  // collectGeometry reports screen-pixel bounds, not a normalised `screen` point.
  const centre = {
    x: (toggle.left + toggle.right) / 2,
    y: (toggle.top + toggle.bottom) / 2,
    w: toggle.w,
    h: toggle.h,
  };
  steps.push({ step: 'geometry', toggle: centre });

  await opened.cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: centre.x, y: centre.y }],
  });
  await sleep(80);
  await opened.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(900);

  const afterTap = { save: await readSfx(opened.page), label: await readLabel(opened.page) };
  steps.push({ step: 'after tap', ...afterTap });
  await opened.page.screenshot({ path: path.join(outDirectory, 'pause-with-sfx-toggle.png') });

  // The first read can legitimately be absent: SaveService only writes once
  // something changes. What must hold is that the tap writes the flag.
  if (!afterTap.save.present) failure = 'tapping the toggle did not write the save';
  else if (afterTap.save.sfx !== false) failure = `the persisted flag is ${afterTap.save.sfx}, expected false`;
  else if (afterTap.label === before.label) failure = 'the label did not follow the flag';

  // Reload in the SAME context. A fresh browser context has isolated storage, so
  // reopening one would test the harness rather than persistence.
  await opened.page.reload({ waitUntil: 'domcontentloaded' });
  await opened.page.waitForFunction(() => window.__BHR_QA__?.snapshot?.().gameState === 'HOME', undefined, { timeout: 90000 });
  await sleep(1500);
  opened.canvasRect = await opened.page.locator('#GameCanvas').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
  await navigate(opened);
  const afterReload = { save: await readSfx(opened.page), label: await readLabel(opened.page) };
  steps.push({ step: 'after reload', ...afterReload });

  if (!failure && afterReload.save.sfx !== false) failure = 'the flag did not survive a reload';
  if (!failure && afterReload.label !== afterTap.label) failure = 'the label disagrees with the persisted flag after a reload';
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  await browser.close();
  server.close();
}

const report = { schema: 'bhr.settings-toggle/1', steps, failure, pass: !failure };
writeFileSync(path.join(outDirectory, 'settings-toggle.json'), `${JSON.stringify(report, null, 2)}\n`);

for (const step of steps) console.log('[settings]', JSON.stringify(step));
if (failure) {
  console.error('[settings] FAIL:', failure);
  process.exitCode = 1;
} else {
  console.log('[settings] PASS: the toggle changes the persisted flag, the label follows, and both survive a reload.');
}
