/**
 * How big is the arena hero on each portrait size, and why?
 *
 * The gameplay-visuals gate now samples all three sizes and reports the arena
 * hero at 38 px on 375x667 against 53-105 px elsewhere, below its 40 px floor.
 * The comment above that floor says §37 measured 62 px on 375x667, so this is a
 * regression rather than a design value -- but a floor alone cannot say what
 * regressed.
 *
 * This prints, per size, the hero's screen radius alongside the two things that
 * can move it: the arena camera's offset, and the player's mass, which drives the
 * visual radius. Reporting both tells a camera problem apart from a mass problem
 * without guessing.
 *
 * Usage: node scripts/probe_arena_hero_size.mjs [WxH ...]
 */
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const sizes = process.argv.slice(2).length ? process.argv.slice(2) : ['375x667', '412x915', '430x932'];

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();

const measure = async (size) => {
  const [width, height] = size.split('x').map(Number);
  const { context, page, cdp, canvasRect } = await openPage(browser, port, { width, height });
  try {
    const tap = async (x, y) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(60);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(400);
    };
    const tapUi = async (key) => {
      const snapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
      const node = key.split('.').reduce((n, part) => (n ? n[part] : undefined), snapshot.ui);
      if (!node?.active) throw new Error(`cannot tap ${key} at ${size}`);
      await tap(canvasRect.left + canvasRect.width * node.screen.x,
        canvasRect.top + canvasRect.height * node.screen.y);
    };
    const waitState = (want, ms = 45000) => page.waitForFunction(
      (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

    await page.waitForFunction(() => !!window.__BHR_QA__?.snapshot, null, { timeout: 45000 });
    await sleep(1000);
    await tapUi('start');
    await waitState('MODE_SELECT');
    await tapUi('modeArena');
    await waitState('MODE_READY');
    await tapUi('arenaReady.start');
    await waitState('ARENA');
    await sleep(3000);

    const rows = [];
    for (let sample = 0; sample < 3; sample += 1) {
      rows.push(await page.evaluate(() => {
        const s = window.__BHR_QA__.snapshot();
        const hero = (s.sceneVisuals?.hero || s.hero || null);
        const local = s.arena?.leaderboard?.find((e) => e.isLocal) || null;
        return {
          mass: local?.mass ?? s.machine?.mass ?? null,
          level: s.machine?.level ?? null,
          // Whatever the snapshot exposes about the hero's screen size.
          heroRadiusPx: hero?.radiusPx ?? hero?.radius ?? null,
          heroScreenX: hero?.screenX ?? s.player?.screenX ?? null,
          worldScale: s.machine?.worldScale ?? null,
          cameraOffset: s.camera?.offset ?? null,
          frame: s.ui?.frame ?? null,
        };
      }));
      await sleep(1200);
    }
    return { size, rows };
  } finally {
    await context.close();
  }
};

for (const size of sizes) {
  const result = await measure(size);
  const first = result.rows[0];
  console.log(`${size}: mass=${first.mass} level=${first.level}`
    + ` worldScale=${first.worldScale}`);
  for (const row of result.rows) {
    console.log(`    radiusPx=${row.heroRadiusPx} screenX=${row.heroScreenX}`
      + ` cameraOffset=${JSON.stringify(row.cameraOffset)} frame=${JSON.stringify(row.frame)}`);
  }
}

await browser.close();
server.close();
