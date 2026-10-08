/**
 * Gate: Machine Info must report the player's real mass, and its V9 UI Kit
 * progress bar must agree with the text beside it.
 *
 * The page is an archive of the player's machine and it is reached from Home,
 * where no `BlackHoleMachine` is in the scene. It used to read only the scene
 * component, so it reported "0 kg" and "0 / 900 kg" forever while its level rows
 * read the save -- the page disagreed with itself. This drives a real Endless
 * run to write `machineMass`, then opens the page and checks both readouts
 * against the save.
 *
 * A fresh save has mass 0, so the bar is also asserted at a non-zero ratio;
 * without that, a bar hard-wired to zero would pass.
 *
 * Usage: node scripts/verify_machine_archive_progress.mjs
 */
import { mkdirSync } from 'node:fs';
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
const OUT_DIR = path.join(repoRoot, 'artifacts', 'qa', 'settled');
mkdirSync(OUT_DIR, { recursive: true });
/** Long enough for the machine to absorb real objects and level up. */
const PLAY_MS = 30_000;

const { server, port } = await serve(buildDirectory);
const browser = await launchBrowser();
const failures = [];
const note = (ok, message) => {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${message}`);
  if (!ok) failures.push(message);
};

/** Read the machine page's own labels and the Kit bar's fill, from the runtime. */
const READ_PAGE = `() => {
  const cc = window.cc;
  const canvas = cc.director.getScene()?.getChildByName('Canvas');
  const page = canvas?.getChildByName('MachineInfoPage');
  if (!page) return { error: 'MachineInfoPage not found' };
  const textOf = (name) => page.getChildByName(name)?.getComponent('cc.Label')?.string ?? null;
  const bar = page.getChildByName('ProgressBar');
  const track = bar?.getChildByName('Track');
  const fill = bar?.getChildByName('Fill');
  const size = (node) => {
    const t = node?.getComponent('cc.UITransform');
    return t ? { w: t.width, h: t.height } : null;
  };
  return {
    massText: textOf('CurrentMassValue'),
    progressText: textOf('ProgressValue'),
    barMounted: Boolean(bar),
    track: size(track),
    fill: size(fill),
  };
}`;

try {
  const { context, page, cdp, canvasRect } = await openPage(browser, port, SIZE);
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());

  // --- play a real Endless run so the save carries a machine mass -----------
  let s = await snapshot();
  const tapUi = async (key) => {
    const node = s.ui?.[key];
    if (!node?.active || !node?.screen) throw new Error(`FAIL_NAV_${key}: ${JSON.stringify(node)}`);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: canvasRect.left + canvasRect.width * node.screen.x,
        y: canvasRect.top + canvasRect.height * node.screen.y }],
    });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(600);
    s = await snapshot();
  };
  await tapUi('start');
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 12000 });
  await tapUi('modeEndless');
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 12000 });
  s = await snapshot();
  const readyStart = s.ui?.endlessReady?.start;
  if (!readyStart?.active) throw new Error('FAIL_NAV_ready.start');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: canvasRect.left + canvasRect.width * readyStart.screen.x,
      y: canvasRect.top + canvasRect.height * readyStart.screen.y }],
  });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 20000 });
  await sleep(1500);

  // Steer toward the nearest collectible. The machine absorbs whatever it
  // reaches, and every absorb calls `addMass` -> `setMachineProgression`.
  //
  // A fixed circular drive was tried first and absorbed nothing: its stick
  // offset was 33 px against the ~88 px the calibration uses, so the player
  // barely moved and the run wrote no mass at all.
  s = await snapshot();
  const joystick = s.ui?.runtimeHUD?.joystick;
  if (!joystick?.screen) throw new Error(`FAIL_NAV_joystick: ${JSON.stringify(joystick)}`);
  const jx = canvasRect.left + canvasRect.width * joystick.screen.x;
  const jy = canvasRect.top + canvasRect.height * joystick.screen.y;

  const steerTo = async (dx, dz) => {
    const length = Math.hypot(dx, dz) || 1;
    const scale = Math.min(1, length / 4) * 88;
    // Measured by the joystick calibration: stick dy and world Z share a sign.
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: jx + (dx / length) * scale, y: jy + (dz / length) * scale }],
    });
  };

  const started = Date.now();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy }] });
  while (Date.now() - started < PLAY_MS) {
    const live = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const player = live.player.position;
    const target = live.objects
      .filter((o) => o.state === 'IDLE' && o.tier <= live.machine.maxTier && !o.owner)
      .map((o) => ({ x: o.x, z: o.z, d: Math.hypot(o.x - player.x, o.z - player.z) }))
      .sort((a, b) => a.d - b.d)[0];
    if (target) await steerTo(target.x - player.x, target.z - player.z);
    else await steerTo(Math.cos(Date.now() / 700), Math.sin(Date.now() / 700));
    await sleep(80);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(500);

  const afterRun = (await snapshot()).save;
  console.log(`played ${PLAY_MS / 1000}s: machineMass=${afterRun.machineMass} machineLevel=${afterRun.machineLevel}`);
  note(Number(afterRun.machineMass) > 0,
    `the run wrote a non-zero machineMass (${afterRun.machineMass}); without this the check below is vacuous`);

  // --- back to Home, then open the archive page -----------------------------
  s = await snapshot();
  const pauseButton = s.ui?.runtimeHUD?.pauseButton;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: canvasRect.left + canvasRect.width * pauseButton.screen.x,
      y: canvasRect.top + canvasRect.height * pauseButton.screen.y }],
  });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(800);
  s = await snapshot();
  const homeButton = s.ui?.formalPages?.pauseHome;
  if (!homeButton?.active) throw new Error(`FAIL_NAV_pauseHome: ${JSON.stringify(homeButton)}`);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: canvasRect.left + canvasRect.width * homeButton.screen.x,
      y: canvasRect.top + canvasRect.height * homeButton.screen.y }],
  });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 15000 });
  await sleep(800);

  // Re-read the save here, not after the run: the machine keeps absorbing while
  // the pause overlay comes up, so a value sampled before the transition is
  // already stale. Comparing against it failed this check for a reason that had
  // nothing to do with the page.
  s = await snapshot();
  const saved = s.save;
  console.log(`on Home: machineMass=${saved.machineMass} machineLevel=${saved.machineLevel}`);

  const machineCard = s.ui?.machine;
  if (!machineCard?.active) throw new Error(`FAIL_NAV_machine: ${JSON.stringify(machineCard)}`);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: canvasRect.left + canvasRect.width * machineCard.screen.x,
      y: canvasRect.top + canvasRect.height * machineCard.screen.y }],
  });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(1500);

  const view = await page.evaluate(eval(`(${READ_PAGE})`));
  if (view.error) throw new Error(`FAIL_READ_PAGE: ${JSON.stringify(view)}`);
  console.log(`archive page: massText="${view.massText}" progressText="${view.progressText}"`
    + ` bar=${view.barMounted} track=${JSON.stringify(view.track)} fill=${JSON.stringify(view.fill)}`);

  // --- the page must agree with the save -----------------------------------
  const expectedMass = Math.floor(Number(saved.machineMass)).toLocaleString('en-US');
  note(view.massText === `${expectedMass} kg`,
    `CurrentMassValue reports the saved mass: expected "${expectedMass} kg", got "${view.massText}"`);
  note(String(view.progressText).includes(expectedMass),
    `ProgressValue uses the saved mass: expected it to contain "${expectedMass}", got "${view.progressText}"`);

  // --- the Kit bar must exist and match the text ---------------------------
  note(view.barMounted === true, 'the V9 UI Kit UIProgressBar is mounted on the page');
  const trackWidth = view.track?.w || 0;
  const fillWidth = view.fill?.w || 0;
  note(trackWidth > 0 && fillWidth > 0, `track and fill both have a width (${trackWidth} / ${fillWidth})`);
  note(fillWidth < trackWidth,
    `the fill is partial, so the bar is not a full-width block (fill ${fillWidth} of track ${trackWidth})`);
  note(fillWidth > 2,
    `the fill is not at its floor, so the ratio reached the bar (fill ${fillWidth})`);

  // Screenshot evidence of the bar at a real, non-zero fill. A capture from a
  // fresh save would only ever show an empty track.
  const shot = path.join(OUT_DIR, 'machine-archive-progress-412x915.png');
  await page.screenshot({ path: shot });
  console.log(`screenshot: ${path.relative(repoRoot, shot)}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n[verify:machine-archive] FAIL: ${failures.length} assertion(s)`);
  failures.forEach((line) => console.error(`  ${line}`));
  process.exit(1);
}
console.log('\n[verify:machine-archive] PASS: the archive page and the Kit progress bar both read the save.');
