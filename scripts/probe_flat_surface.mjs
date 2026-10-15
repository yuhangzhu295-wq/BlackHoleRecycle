/**
 * Which node is the arena's flat blue-grey surface?
 *
 * The frame has one colour (#6d7797) covering 32% of the play band and 76% of
 * the bottom rows, and it is not the fog: fog would grow with distance, and this
 * one falls to 5.6% in the rows just above the bottom before rising again. So it
 * is a surface, and the candidates are the road meshes (which do carry the 512x512
 * atlas), the ground tiles (which carry no texture at all, only a green
 * mainColor), or something else again.
 *
 * Disabling one group at a time and re-capturing needs no decoding of what any
 * material is supposed to render -- a group that owns the colour makes it
 * disappear. Same technique that settled PHASE 0's black ground.
 *
 * Usage: node scripts/probe_flat_surface.mjs [WxH]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const [width, height] = (process.argv[2] || '390x844').split('x').map(Number);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'v13', 'probe');
mkdirSync(outDir, { recursive: true });

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();
try {
  const { context, page, cdp, canvasRect } = await openPage(browser, port, { width, height });
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(700);
  };
  const tapUi = async (key) => {
    const snapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const node = snapshot.ui?.[key];
    if (!node?.active) throw new Error(`cannot tap ${key}`);
    await tap(canvasRect.left + canvasRect.width * node.screen.x,
      canvasRect.top + canvasRect.height * node.screen.y);
  };
  const waitState = (want, ms = 30000) => page.waitForFunction(
    (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

  await tapUi('start');
  await waitState('MODE_SELECT');
  await tapUi('modeArena');
  await waitState('MODE_READY');
  const ready = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(canvasRect.left + canvasRect.width * ready.ui.arenaReady.start.screen.x,
    canvasRect.top + canvasRect.height * ready.ui.arenaReady.start.screen.y);
  await waitState('ARENA');
  await sleep(2500);

  // The names the live tree actually uses, counted once so the report says how
  // many nodes each group moved.
  const inventory = await page.evaluate(() => {
    const counts = {};
    const walk = (node) => {
      const renderer = node.getComponent ? node.getComponent('cc.MeshRenderer') : null;
      if (renderer) {
        const key = node.name.replace(/[_-\d]+$/, '') || node.name;
        counts[key] = (counts[key] || 0) + 1;
      }
      for (const child of node.children) walk(child);
    };
    walk(window.cc.director.getScene());
    return counts;
  });
  const sorted = Object.entries(inventory).sort((a, b) => b[1] - a[1]);
  console.log('[flat] renderer node names in the arena:');
  for (const [name, count] of sorted.slice(0, 25)) console.log(`  ${name} x${count}`);

  const setActive = (predicate, active) => page.evaluate(({ pattern, on }) => {
    const re = new RegExp(pattern, 'i');
    let touched = 0;
    const walk = (node) => {
      if (node.getComponent && node.getComponent('cc.MeshRenderer') && re.test(node.name)) {
        node.active = on;
        touched += 1;
      }
      for (const child of node.children) walk(child);
    };
    walk(window.cc.director.getScene());
    return touched;
  }, { pattern: predicate, on: active });

  const groups = [
    ['baseline', null],
    ['no-road-straight', '^road-straight'],
    ['no-road-crossroad', '^road-crossroad'],
    ['no-ground-tile', '^tile'],
    ['no-everything-but-sky', '.*'],
  ];

  for (const [label, pattern] of groups) {
    if (pattern === null) {
      // Everything on again before the baseline is taken.
      await setActive('.*', true);
      await sleep(400);
    } else if (pattern === '.*') {
      await setActive('.*', false);
      await sleep(400);
    } else {
      const count = await setActive(pattern, false);
      console.log(`[flat] ${label}: disabled ${count} node(s)`);
      await sleep(400);
    }
    const file = path.join(outDir, `flat-${label}.png`);
    await page.screenshot({ path: file });
    console.log(`[flat] capture -> ${path.relative(repoRoot, file)}`);
  }

  await context.close();
} finally {
  await browser.close();
  server.close();
}
