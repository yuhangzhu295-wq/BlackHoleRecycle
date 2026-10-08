/**
 * Gate: no page draws a drifted text colour; the token file owns it instead.
 *
 * `Game.scene` serialises 51 distinct Label colours and only 6 match a token.
 * Eleven of the rest are imperceptible variants of a token -- the same semantic
 * role re-tinted by a few units, e.g. `#4e3a68` / `#463562` / `#4a3863` are all
 * the body purple. `PAGE_TEXT_DRIFT` lists them and `applyPageTextTokens` folds
 * them onto the token when a page becomes visible.
 *
 * Without this check the fold is unfalsifiable: a page that stopped calling the
 * pass, or a colour added back to the scene, would look exactly like a page that
 * never had drift. The drift list is parsed out of `RenderProfile.ts` rather
 * than duplicated, so the gate and the source cannot disagree.
 *
 * Usage: node scripts/verify_page_text_tokens.mjs
 */
import { readFileSync } from 'node:fs';
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

/** Read the drift table straight out of the profile, so the two cannot diverge. */
function readDriftColours() {
  const source = readFileSync(
    path.join(repoRoot, 'cocos/assets/scripts/core/RenderProfile.ts'), 'utf8');
  const block = source.slice(source.indexOf('PAGE_TEXT_DRIFT'));
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('};'));
  const colours = [...body.matchAll(/'(#[0-9a-fA-F]{6})':\s*'(\w+)'/g)]
    .map((match) => ({ hex: match[1].toLowerCase(), role: match[2] }));
  if (colours.length === 0) throw new Error('FAIL_NO_DRIFT_TABLE: PAGE_TEXT_DRIFT parsed empty');
  return colours;
}

/** Count visible labels still carrying a drifted colour, by page node. */
const COUNT_DRIFT = `({ pageNames, driftHexes }) => {
  const cc = window.cc;
  const canvas = cc.director.getScene()?.getChildByName('Canvas');
  const found = {};
  for (const pageName of pageNames) {
    const root = canvas?.getChildByName(pageName);
    if (!root) { found[pageName] = { error: 'missing' }; continue; }
    const hits = [];
    let labels = 0;
    const walk = (node) => {
      if (!node.activeInHierarchy) return;
      const label = node.getComponent('cc.Label');
      if (label) {
        labels += 1;
        const c = label.color;
        const hex = '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
        if (driftHexes.indexOf(hex) >= 0) hits.push(node.name + '=' + hex);
      }
      node.children.forEach(walk);
    };
    walk(root);
    found[pageName] = { labels, hits };
  }
  return found;
}`;

const drift = readDriftColours();
const driftHexes = drift.map((entry) => entry.hex);
console.log(`PAGE_TEXT_DRIFT: ${drift.length} colours -> ${[...new Set(drift.map((d) => d.role))].join(', ')}`);

const failures = [];
const note = (ok, message) => {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${message}`);
  if (!ok) failures.push(message);
};

const { server, port } = await serve(buildDirectory);
const browser = await launchBrowser();

try {
  const { page, cdp, canvasRect } = await openPage(browser, port, SIZE);
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  const tapPoint = async (node, name) => {
    if (!node?.active || !node?.screen) throw new Error(`FAIL_NAV_${name}: ${JSON.stringify(node)}`);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: canvasRect.left + canvasRect.width * node.screen.x,
        y: canvasRect.top + canvasRect.height * node.screen.y }],
    });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(800);
  };
  // The bridge is installed asynchronously, so every predicate has to tolerate
  // it being absent -- which is exactly what happens right after a reload.
  const waitState = (state, ms = 20000) => page.waitForFunction(
    (want) => Boolean(window.__BHR_QA__?.snapshot) && window.__BHR_QA__.snapshot().gameState === want,
    state, { timeout: ms });
  const check = async (label, pageNames) => {
    const found = await page.evaluate(eval(`(${COUNT_DRIFT})`), { pageNames, driftHexes });
    for (const pageName of pageNames) {
      const entry = found[pageName];
      if (!entry || entry.error) { note(false, `${label}/${pageName}: ${entry?.error || 'unreadable'}`); continue; }
      // A page with no labels means the walk found nothing to judge, which is a
      // harness failure rather than a clean page.
      note(entry.labels > 0, `${label}/${pageName}: ${entry.labels} labels inspected`);
      note(entry.hits.length === 0,
        `${label}/${pageName}: no label still carries a drifted colour (${entry.hits.join(', ') || 'none'})`);
    }
  };

  let s = await snapshot();
  await check('home', ['HomePage']);

  // Skin page: carries SkinName_* (#463562) and PreviewNameValue (#533a7e).
  await tapPoint(s.ui?.skin, 'skinCard');
  await check('skin', ['SkinSelectionPage']);
  // Reload rather than hunting for the skin page's back button: the QA bridge
  // does not project it, and a reload lands back on Home deterministically.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitState('HOME', 60000);
  await sleep(1200);

  // Mode and Ready share the Subtitle drift (#4a3863 / #493763).
  s = await snapshot();
  await tapPoint(s.ui?.start, 'start');
  await waitState('MODE_SELECT');
  await check('mode', ['ModeSelectPage']);
  s = await snapshot();
  await tapPoint(s.ui?.modeEndless, 'modeEndless');
  await waitState('MODE_READY');
  await check('ready', ['EndlessReadyPage']);

  // Settlement: ArenaResult, ArenaStatMassCaption and ArenaRankName_* all drift.
  s = await snapshot();
  await tapPoint(s.ui?.endlessReady?.start, 'endlessReady.start');
  await waitState('PLAYING');
  await sleep(1500);
  s = await snapshot();
  await tapPoint(s.ui?.runtimeHUD?.pauseButton, 'pauseButton');
  await sleep(500);
  s = await snapshot();
  await tapPoint(s.ui?.formalPages?.pauseSettle, 'pauseSettle');
  await sleep(1500);
  await check('settlement', ['SettlementPage']);
  s = await snapshot();
  await tapPoint(s.ui?.formalPages?.settlementHome, 'settlementHome');
  await waitState('HOME');
  await sleep(800);

  // The Arena HUD carries three drift colours (Top1..5, MassValue, StatusValue),
  // so it needs a real match rather than a tap.
  s = await snapshot();
  await tapPoint(s.ui?.start, 'start');
  await waitState('MODE_SELECT');
  s = await snapshot();
  await tapPoint(s.ui?.modeArena, 'modeArena');
  await waitState('MODE_READY');
  s = await snapshot();
  await tapPoint((s.ui?.arenaReady || s.ui?.endlessReady)?.start, 'arenaReady.start');
  await waitState('ARENA');
  await sleep(2500);
  await check('arena', ['ArenaHUD']);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n[verify:page-tokens] FAIL: ${failures.length} assertion(s)`);
  failures.forEach((line) => console.error(`  ${line}`));
  process.exit(1);
}
console.log('\n[verify:page-tokens] PASS: the token file owns every drifted page text colour.');
