/**
 * Capture one page at one size, without re-running all 24 captures.
 *
 * `capture_v95_page_sheets.mjs` is the evidence sweep and takes about fifteen
 * minutes. When only one page changed, that is the wrong tool, so this drives the
 * same built runtime and the same navigation to a single screenshot.
 *
 * Usage: node scripts/capture_page.mjs <pageKey> [WxH] [outPath]
 *   pageKey is one of PAGES in scripts/lib/page_layout_geometry.mjs
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, launchBrowser, navigateToPage, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageKey = process.argv[2];
if (!pageKey || !PAGES[pageKey]) {
  console.error('usage: node scripts/capture_page.mjs <' + Object.keys(PAGES).join('|') + '> [WxH] [outPath]');
  process.exit(1);
}
const sizeArg = process.argv[3] || '390x844';
const [width, height] = sizeArg.split('x').map(Number);
const outPath = process.argv[4]
  || path.join(repoRoot, 'artifacts', 'qa', 'v95', `${pageKey}-${sizeArg}.png`);
mkdirSync(path.dirname(outPath), { recursive: true });

const { server, port } = await serve(path.join(repoRoot, 'cocos', 'build', 'web-mobile'));
const browser = await launchBrowser();
try {
  const { context, page, cdp, canvasRect } = await openPage(browser, port, { width, height });
  await navigateToPage(page, cdp, canvasRect, pageKey);
  await sleep(2500);
  await page.screenshot({ path: outPath });
  console.log(`[capture] ${pageKey}@${sizeArg} -> ${path.relative(repoRoot, outPath)}`);
  await context.close();
} finally {
  await browser.close();
  server.close();
}
