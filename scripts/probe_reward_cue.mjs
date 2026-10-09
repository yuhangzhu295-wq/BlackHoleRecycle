/**
 * Does the settlement reward cue actually load and play?
 *
 * `verify_audio.mjs` plays a match, which exercises absorb / swallow / upgrade but
 * never reaches the settlement page, so the reward cue it does not touch could be
 * missing from a build and still pass. The bridge exposes `audio` diagnostics
 * (plays, missingPlays, lastKey), so this walks to Settlement through the real
 * flow and reads them there.
 *
 * Usage: node scripts/probe_reward_cue.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, navigateToPage, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDirectory = path.join(repoRoot, 'artifacts', 'qa', 'v95');
mkdirSync(outDirectory, { recursive: true });

const { server, port } = await serve(path.join(repoRoot, 'cocos', 'build', 'web-mobile'));
const browser = await launchBrowser();
let report = { schema: 'bhr.reward-cue/1' };
let failure = null;

try {
  const opened = await openPage(browser, port, { width: 390, height: 844 });
  const { page, cdp, canvasRect } = opened;

  // Reach the settlement page the way a player does: play, pause, settle.
  await navigateToPage(page, cdp, canvasRect, 'settlement');
  await sleep(1800);

  const snapshot = await page.evaluate(() => {
    const live = window.__BHR_QA__.snapshot();
    const found = live.audio ?? live.ui?.audio ?? live.runtime?.audio ?? null;
    return { keys: Object.keys(live), audio: found, gameState: live.gameState };
  });
  report.snapshotKeys = snapshot.keys;
  report.audio = snapshot.audio;
  report.gameState = snapshot.gameState;

  if (!snapshot.audio) failure = 'the snapshot exposes no audio diagnostics';
  else if (snapshot.audio.missingPlays > 0) failure = `missingPlays = ${snapshot.audio.missingPlays}`;
  // `lastKey` is not the test: the click that opens the page plays the button cue
  // after the page's own cue. The per-clip count is what proves reward fired.
  else if (!(snapshot.audio.playCounts?.reward >= 1)) {
    failure = `reward played ${snapshot.audio.playCounts?.reward ?? 0} times`;
  }

  await page.screenshot({ path: path.join(outDirectory, 'settlement-reward-cue.png') });
  await opened.context.close();
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  await browser.close();
  server.close();
}

report.failure = failure;
report.pass = !failure;
writeFileSync(path.join(outDirectory, 'reward-cue.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log('[reward-cue]', JSON.stringify(report).slice(0, 900));
if (failure) {
  console.error('[reward-cue] FAIL:', failure);
  process.exitCode = 1;
} else {
  console.log('[reward-cue] PASS: the settlement page played the reward cue with no missing clip.');
}
