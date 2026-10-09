/**
 * Does the Endless settlement's itemisation line carry real data?
 *
 * `capture_page.mjs` reaches Settlement through pause without playing, so the
 * per-tier ledger is empty there by construction and the line correctly renders
 * blank -- which would make a broken wiring look identical to a correct one. This
 * plays first, absorbs real objects, and only then settles.
 *
 * Usage: node scripts/probe_settlement_breakdown.mjs [seconds]
 *   -> artifacts/qa/v95/settlement-breakdown.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDirectory = path.join(repoRoot, 'artifacts', 'qa', 'v95');
const seconds = Number(process.argv[2] || 30);
mkdirSync(outDirectory, { recursive: true });

const { server, port } = await serve(path.join(repoRoot, 'cocos', 'build', 'web-mobile'));
const browser = await launchBrowser();
const report = { schema: 'bhr.settlement-breakdown/1' };
let failure = null;

try {
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
    if (!node?.active || !node?.screen) throw new Error(`FAIL_NAV_${key}`);
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

  // Absorb for real: re-steer at the nearest edible object each tick.
  const first = await snapshot();
  const joystick = first.ui?.runtimeHUD?.joystick;
  const jx = canvasRect.left + canvasRect.width * joystick.screen.x;
  const jy = canvasRect.top + canvasRect.height * joystick.screen.y;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy }] });
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const live = await snapshot();
    const player = live.player?.position;
    if (player) {
      const target = (live.objects || [])
        .filter((o) => o.state === 'IDLE' && o.tier <= live.machine.maxTier && !o.owner)
        .map((o) => ({ x: o.x, z: o.z, d: Math.hypot(o.x - player.x, o.z - player.z) }))
        .sort((a, b) => a.d - b.d)[0];
      const dx = target ? target.x - player.x : 1;
      const dz = target ? target.z - player.z : 0;
      const length = Math.hypot(dx, dz) || 1;
      const scale = Math.min(1, length / 4) * 88;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: jx + (dx / length) * scale, y: jy + (dz / length) * scale }],
      });
    }
    await sleep(1100);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);

  const played = await snapshot();
  report.absorbedTiers = played.session?.absorbedTiers ?? null;

  const playing = await snapshot();
  await tap(canvasRect.left + canvasRect.width * playing.ui.runtimeHUD.pauseButton.screen.x,
    canvasRect.top + canvasRect.height * playing.ui.runtimeHUD.pauseButton.screen.y);
  await sleep(1200);
  const paused = await snapshot();
  await tap(canvasRect.left + canvasRect.width * paused.ui.formalPages.pauseSettle.screen.x,
    canvasRect.top + canvasRect.height * paused.ui.formalPages.pauseSettle.screen.y);
  await sleep(1800);

  report.breakdown = await page.evaluate(() => {
    const canvas = window.cc?.director?.getScene()?.getChildByName('Canvas');
    const page_ = canvas?.getChildByName('SettlementPage');
    const node = page_?.getChildByName('ArenaRewardBreakdown');
    const label = node?.getComponent('cc.Label');
    return label ? label.string : null;
  });
  report.gameState = (await snapshot()).gameState;

  await page.screenshot({ path: path.join(outDirectory, 'settlement-breakdown.png') });

  if (report.gameState !== 'SETTLEMENT') failure = `gameState ${report.gameState}, expected SETTLEMENT`;
  else if (!report.breakdown) failure = 'the itemisation line is empty after a real match';
  else if (!/^T\d/.test(report.breakdown)) failure = `unexpected line: ${report.breakdown}`;

  await opened.context.close();
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  await browser.close();
  server.close();
}

report.failure = failure;
report.pass = !failure;
writeFileSync(path.join(outDirectory, 'settlement-breakdown.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log('[breakdown]', JSON.stringify(report));
if (failure) {
  console.error('[breakdown] FAIL:', failure);
  process.exitCode = 1;
} else {
  console.log('[breakdown] PASS: the settlement itemises the run by tier.');
}
