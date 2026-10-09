/**
 * Boot diagnostic: load the built web-mobile package and report why the QA
 * bridge never appeared.
 *
 * The layout and gameplay gates only surface `waitForFunction: Timeout`, which
 * says the page did not reach Home but not why. This prints every console
 * message, page error and failed request so the cause is visible.
 *
 * Usage: node scripts/_probe_boot.mjs [--keep-open]
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve, sleep } from './lib/page_layout_geometry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const keepOpen = process.argv.includes('--keep-open');

if (!existsSync(path.join(buildDirectory, 'index.html'))) {
  throw new Error('No built web-mobile package at ' + buildDirectory);
}

const { server, port } = await serve(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const interesting = [];
page.on('console', (message) => {
  const text = message.text();
  interesting.push(`[console.${message.type()}] ${text}`);
});
page.on('pageerror', (error) => interesting.push(`[pageerror] ${error.message}`));
page.on('requestfailed', (request) => {
  interesting.push(`[requestfailed] ${request.url()} :: ${request.failure()?.errorText}`);
});
page.on('response', (response) => {
  if (response.status() >= 400) interesting.push(`[http ${response.status()}] ${response.url()}`);
});

await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(20000);

const state = await page.evaluate(() => ({
  hasQa: Boolean(window.__BHR_QA__?.snapshot),
  hasCc: Boolean(window.cc),
  gameState: window.__BHR_QA__?.snapshot ? window.__BHR_QA__.snapshot().gameState : null,
  canvas: Boolean(document.getElementById('GameCanvas')),
  bodyText: (document.body?.innerText || '').slice(0, 300),
}));

console.log('=== page state after 20s ===');
console.log(JSON.stringify(state, null, 2));
console.log();
console.log(`=== ${interesting.length} console/network message(s) ===`);
for (const line of interesting.slice(0, 80)) console.log(line);

if (keepOpen) await sleep(600000);
await browser.close();
server.close();
