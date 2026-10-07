/**
 * Capture a settled screenshot of an overlay page.
 *
 * The acceptance captures for these pages are taken while the page is still
 * animating in, so they show a half-applied dim overlay and can look like a
 * layout defect that is not there. This waits for the page to settle first.
 *
 * Usage: node scripts/capture_settled_page.mjs [--page=machine] [--settleMs=2500]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'settled');
mkdirSync(outDir, { recursive: true });

const argOf = (n, f) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=')[1] : f;
};
const PAGE = argOf('page', 'machine');
const SETTLE_MS = Number(argOf('settleMs', '2500'));
const WIDTH = Number(argOf('width', '390'));
const HEIGHT = Number(argOf('height', '844'));

function serve(root) {
  return new Promise((res) => {
    const server = createServer((req, rep) => {
      const u = new URL(req.url, 'http://127.0.0.1').pathname;
      const safe = path.normalize(u).replace(/^(\.\.[/\\])+/, '');
      let fp = path.join(root, safe === '/' ? 'index.html' : safe);
      if (!existsSync(fp) || statSync(fp).isDirectory()) {
        if (statSync(fp).isDirectory() && existsSync(path.join(fp, 'index.html'))) fp = path.join(fp, 'index.html');
        else { rep.writeHead(404); rep.end('404'); return; }
      }
      const ext = path.extname(fp).toLowerCase();
      const ct = {
        '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
        '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
      }[ext] || 'application/octet-stream';
      rep.writeHead(200, { 'Content-Type': ct });
      rep.end(readFileSync(fp));
    });
    server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
function pt(rect, node, name) {
  if (!node?.active || !node?.screen) throw new Error('invisible node: ' + name + ' ' + JSON.stringify(node));
  return { x: rect.left + rect.width * node.screen.x, y: rect.top + rect.height * node.screen.y };
}

const { server, port } = await serve(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});
try {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
  await sleep(1500);
  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('#GameCanvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  let s = await snapshot();
  const tapUi = async (key, label) => {
    const node = s.ui?.[key];
    if (!node) throw new Error(`snapshot has no "${key}": ` + JSON.stringify(Object.keys(s.ui || {})));
    await tap(cdp, ...Object.values(pt(rect, node, label)));
    await sleep(600);
    s = await snapshot();
  };
  const waitState = (state, ms = 9000) => page.waitForFunction(
    (want) => window.__BHR_QA__.snapshot().gameState === want, state, { timeout: ms });

  if (PAGE === 'home') {
    // nothing to navigate; Home is where we start
  } else if (PAGE === 'machine' || PAGE === 'skin' || PAGE === 'mode') {
    await tapUi(PAGE, PAGE);
  } else if (PAGE === 'ready' || PAGE === 'pause' || PAGE === 'settlement') {
    await tapUi('start', 'start');
    await waitState('MODE_SELECT');
    await tapUi('modeEndless', 'modeEndless');
    await waitState('MODE_READY');
    s = await snapshot();
    if (PAGE === 'ready') {
      // The ready page is the target: settle here and do not start the match.
    } else {
      // ui.endlessReady is a composite ({root, back, start, ...}); the tappable
      // node with active/screen is its `start` child, not the wrapper.
      s = await snapshot();
      const startBtn = s.ui?.endlessReady?.start;
      if (!startBtn?.active || !startBtn?.screen) throw new Error('ready Start not visible: ' + JSON.stringify(startBtn));
      await tap(cdp, ...Object.values(pt(rect, startBtn, 'endlessReady.start')));
      await sleep(700);
      s = await snapshot();
      await waitState('PLAYING');
      await sleep(1200);
      s = await snapshot();
      const pauseNode = s.ui?.runtimeHUD?.pauseButton;
      if (!pauseNode?.active || !pauseNode?.screen) throw new Error('pause button not visible: ' + JSON.stringify(pauseNode));
      await tap(cdp, ...Object.values(pt(rect, pauseNode, 'pauseButton')));
      await sleep(700);
      s = await snapshot();
      if (PAGE === 'settlement') {
        await sleep(400);
        s = await snapshot();
        // formalPages holds the overlay buttons, not the top-level ui object.
        const settleBtn = s.ui?.formalPages?.pauseSettle;
        if (!settleBtn?.active || !settleBtn?.screen) throw new Error('pause settle not visible: ' + JSON.stringify(settleBtn));
        await tap(cdp, ...Object.values(pt(rect, settleBtn, 'pauseSettle')));
        await sleep(900);
        s = await snapshot();
      }
    }
  } else if (PAGE === 'revive') {
    // The revive page only exists after a real defeat, so drive an arena match
    // and wait for it rather than forcing the screen.
    await tapUi('start', 'start');
    await waitState('MODE_SELECT');
    await tapUi('modeArena', 'modeArena');
    await waitState('MODE_READY');
    s = await snapshot();
    const arenaStart = (s.ui?.arenaReady || s.ui?.endlessReady)?.start;
    if (!arenaStart?.active || !arenaStart?.screen) throw new Error('arena ready Start not visible');
    await tap(cdp, ...Object.values(pt(rect, arenaStart, 'arenaReady.start')));
    await waitState('ARENA', 12000);
    await page.waitForFunction(
      () => window.__BHR_QA__.snapshot().gameState === 'REVIVING',
      undefined,
      { timeout: 90000 },
    );
  } else {
    throw new Error('unknown --page: ' + PAGE);
  }
  await sleep(SETTLE_MS);

  const after = await snapshot();
  const file = path.join(outDir, `${PAGE}-settled-${WIDTH}x${HEIGHT}.png`);
  await page.screenshot({ path: file });
  console.log(`captured ${file}`);
  console.log(`gameState=${after.gameState} uiScreen=${after.uiScreen}`);
} finally {
  await browser.close();
  server.close();
}
