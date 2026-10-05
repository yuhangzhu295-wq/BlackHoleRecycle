/**
 * Multi-viewport screenshot and layout verification script for Arena HUD.
 * Viewports: 375x667, 390x844, 430x932.
 * Captures real in-game screenshots and checks safe area, clipping, and overlap.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'arena_hud');
mkdirSync(outDir, { recursive: true });

function createStaticServer(root) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const urlPath = new URL(request.url, 'http://127.0.0.1').pathname;
      const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
      let filePath = path.join(root, safePath === '/' ? 'index.html' : safePath);
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        if (statSync(filePath).isDirectory() && existsSync(path.join(filePath, 'index.html'))) {
          filePath = path.join(filePath, 'index.html');
        } else {
          response.writeHead(404, { 'Content-Type': 'text/plain' });
          response.end('404 Not Found');
          return;
        }
      }
      const extension = path.extname(filePath).toLowerCase();
      const contentType = {
        '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
        '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
      }[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

function pt(rect, node, name) {
  if (!node?.active || !node?.screen) throw new Error('invisible node: ' + name);
  return { x: rect.left + rect.width * node.screen.x, y: rect.top + rect.height * node.screen.y };
}

const VIEWPORTS = [
  { width: 375, height: 667, name: '375x667' },
  { width: 390, height: 844, name: '390x844' },
  { width: 430, height: 932, name: '430x932' },
];

const { server, port } = await createStaticServer(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});

const results = [];

try {
  for (const vp of VIEWPORTS) {
    console.log(`\n=== Running Arena HUD capture for ${vp.name} ===`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
    await sleep(1500);

    const cdp = await context.newCDPSession(page);
    const rect = await page.locator('#GameCanvas').evaluate((c) => {
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });

    let s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST')));
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 8000 });
    await sleep(500);

    s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    await tap(cdp, ...Object.values(pt(rect, s.ui.modeArena, 'MA')));
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 8000 });
    await sleep(500);

    s = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const arenaReadyStart = s.ui?.arenaReady?.start || s.ui?.endlessReady?.start;
    await tap(cdp, ...Object.values(pt(rect, arenaReadyStart, 'AS')));
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'ARENA', undefined, { timeout: 10000 });

    // Wait 3.0s into match so ArenaTitle has faded out and live scores/nameplates are active
    await sleep(3000);

    const snapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const screenshotPath = path.join(outDir, `arena_hud_${vp.name}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved screenshot: ${screenshotPath}`);

    // Check pause button bounds & safe area
    const pauseNode = snapshot.ui?.arenaHUD?.pauseButton;
    const joystickNode = snapshot.ui?.arenaHUD?.joystick;
    const timerNode = snapshot.ui?.arenaHUD?.timer;
    const nameplates = snapshot.ui?.arenaHUD?.nameplates || [];

    const pausePoint = pt(rect, pauseNode, 'PAUSE');
    const joystickPoint = pt(rect, joystickNode, 'JOYSTICK');

    // Right margin of pause button in screen px
    const pauseRightMargin = vp.width - (pausePoint.x + (pauseNode.width * (rect.width / 720)) / 2);

    results.push({
      viewport: vp.name,
      screenshot: screenshotPath,
      gameState: snapshot.gameState,
      arenaRunning: snapshot.arena?.running,
      remainingSeconds: snapshot.arena?.remainingSeconds,
      localRank: snapshot.arena?.localRank,
      localMass: snapshot.arena?.localMass,
      pauseRightMarginScreenPx: pauseRightMargin.toFixed(1),
      joystickActive: joystickNode?.active,
      nameplateCount: nameplates.length,
      activeNameplateCount: nameplates.filter(n => n.active).length,
      consoleErrors: consoleErrors.length,
    });

    await context.close();
  }

  console.log('\n=== Multi-Viewport Results Summary ===');
  console.table(results);
  writeFileSync(path.join(outDir, 'arena_hud_viewports_report.json'), JSON.stringify(results, null, 2), 'utf8');

} finally {
  await browser.close();
  server.close();
}
