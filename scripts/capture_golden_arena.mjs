/**
 * Capture the Golden Arena opening frame at a given size.
 *
 * Drives a real arena match and screenshots its opening composition, which is the
 * deliverable frame for the first hard delivery. It is a dedicated script rather
 * than a reuse of probe_gameplay_hud because the frame it needs is the arena's
 * own opening, and the two probes' capture moments differ.
 *
 * Usage: node scripts/capture_golden_arena.mjs [WxH] [outPath]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');

const sizeArg = process.argv[2] && /^\d+x\d+$/.test(process.argv[2]) ? process.argv[2] : '390x844';
const [width, height] = sizeArg.split('x').map(Number);
const outArg = process.argv[3];
const outPath = path.resolve(outArg
  || path.join(repoRoot, 'artifacts', 'qa', 'v13', `GoldenArena_${sizeArg}_RUNTIME.png`));
mkdirSync(path.dirname(outPath), { recursive: true });

function serve(root) {
  return new Promise((resolve) => {
    const server = createServer((req, rep) => {
      const u = new URL(req.url, 'http://127.0.0.1').pathname;
      const safe = path.normalize(u).replace(/^(\.\.[/\\])+/, '');
      let fp = path.join(root, safe === '/' ? 'index.html' : safe);
      if (!existsSync(fp) || statSync(fp).isDirectory()) {
        if (statSync(fp).isDirectory() && existsSync(path.join(fp, 'index.html'))) fp = path.join(fp, 'index.html');
        else { rep.writeHead(404); rep.end('404'); return; }
      }
      const ct = {
        '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
        '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
      }[path.extname(fp).toLowerCase()] || 'application/octet-stream';
      rep.writeHead(200, { 'Content-Type': ct });
      rep.end(readFileSync(fp));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { server, port } = await serve(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});
try {
  const context = await browser.newContext({
    viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('#GameCanvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(650);
  };
  const at = (node, label) => {
    if (!node?.active || !node?.screen) throw new Error(`invisible: ${label} ${JSON.stringify(node)}`);
    return [rect.left + rect.width * node.screen.x, rect.top + rect.height * node.screen.y];
  };
  const waitState = (want, ms = 60000) => page.waitForFunction(
    (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

  let s = await snapshot();
  await tap(...at(s.ui.start, 'start'));
  await waitState('MODE_SELECT');
  s = await snapshot();
  await tap(...at(s.ui.modeArena, 'modeArena'));
  await waitState('MODE_READY');
  s = await snapshot();
  await tap(...at((s.ui.arenaReady || s.ui.endlessReady).start, 'arenaReady.start'));
  await waitState('ARENA');
  // 2.6s in: past the title hold, early in the 15s warmup, so the field has
  // separated enough to read the composition but nobody has been eliminated.
  await sleep(2600);
  await page.screenshot({ path: outPath });

  const after = await snapshot();
  const composition = await page.evaluate(() => {
    const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
    const find = (root, name) => {
      if (root.name === name) return root;
      for (const child of root.children) {
        const hit = find(child, name);
        if (hit) return hit;
      }
      return null;
    };
    const cell = find(scene, 'GoldenCityCell');
    if (!cell) return null;
    const groups = {};
    for (const child of cell.children) groups[child.name] = child.children.length;
    const machine = (() => {
      const walk = (node) => {
        if (node.getComponent?.('BlackHoleMachine')) return node;
        for (const child of node.children) {
          const hit = walk(child);
          if (hit) return hit;
        }
        return null;
      };
      const found = walk(scene);
      return found ? { x: Math.round(found.worldPosition.x), z: Math.round(found.worldPosition.z) } : null;
    })();
    return { groups, player: machine };
  });

  console.log(JSON.stringify({
    file: outPath,
    gameState: after.gameState,
    uiScreen: after.uiScreen,
    competitorCount: after.arena?.competitorCount,
    player: composition?.player,
    groups: composition?.groups,
  }, null, 1));
  await context.close();
} finally {
  await browser.close();
  server.close();
}
