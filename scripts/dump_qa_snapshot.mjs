/**
 * Dump the shape of the read-only QA snapshot: top-level keys, the `ui` subtree,
 * and where the tier-upgrade diagnostics actually live.
 *
 * Written because two separate readers (the gameplay gate and a probe) both
 * guessed the path to the tier-upgrade counter and both guessed wrong, which is
 * cheap to settle by looking instead.
 *
 * Usage: node scripts/_dump_snapshot_keys.mjs
 */
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();
const { context, page, cdp, canvasRect } = await openPage(browser, port, { width: 390, height: 844 });

const tap = async (x, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(700);
};
const tapUi = async (key) => {
  const s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  const node = s.ui?.[key];
  await tap(canvasRect.left + canvasRect.width * node.screen.x,
    canvasRect.top + canvasRect.height * node.screen.y);
};
const waitState = (want, ms = 20000) => page.waitForFunction(
  (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

await tapUi('start');
await waitState('MODE_SELECT');
await tapUi('modeEndless');
await waitState('MODE_READY');
const ready = await page.evaluate(() => window.__BHR_QA__.snapshot());
await tap(canvasRect.left + canvasRect.width * ready.ui.endlessReady.start.screen.x,
  canvasRect.top + canvasRect.height * ready.ui.endlessReady.start.screen.y);
await waitState('PLAYING');
await sleep(3000);

const report = await page.evaluate(() => {
  const snapshot = window.__BHR_QA__.snapshot();
  const describe = (value, depth = 0) => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `array(${value.length})`;
    if (typeof value === 'object') {
      if (depth >= 2) return `object{${Object.keys(value).slice(0, 10).join(',')}}`;
      const entries = Object.keys(value).slice(0, 30)
        .map((key) => `${key}: ${describe(value[key], depth + 1)}`);
      return `{ ${entries.join(' | ')} }`;
    }
    return `${typeof value} ${JSON.stringify(value)}`;
  };
  const findTier = (node, trail = '') => {
    if (!node || typeof node !== 'object') return [];
    const hits = [];
    for (const [key, value] of Object.entries(node)) {
      const path = trail ? `${trail}.${key}` : key;
      if (/tier/i.test(key)) hits.push(`${path} = ${describe(value, 1)}`);
      if (value && typeof value === 'object' && !Array.isArray(value)) hits.push(...findTier(value, path));
    }
    return hits;
  };
  return {
    topLevel: Object.keys(snapshot),
    uiKeys: snapshot.ui ? Object.keys(snapshot.ui) : null,
    runtimeHudKeys: snapshot.ui?.runtimeHUD ? Object.keys(snapshot.ui.runtimeHUD) : null,
    tierPaths: findTier(snapshot),
  };
});

console.log(JSON.stringify(report, null, 2));
await context.close();
await browser.close();
server.close();
