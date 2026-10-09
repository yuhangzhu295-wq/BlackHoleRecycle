/**
 * STEP 6 — three-size screenshots of every re-skinned page.
 *
 * `verify_page_layout_geometry.mjs` proves the pages *fit* at 375/390/412; it
 * says nothing about how they look. This captures the same eight pages at the
 * three device sizes the product ships to and writes them somewhere durable, so
 * a human can compare them side by side. `scripts/build_v95_page_sheets.py`
 * assembles the sheets.
 *
 * QA-only: it drives the built `cocos/build/web-mobile` slot over loopback with
 * CDP touch, reads only the read-only `__BHR_QA__` snapshot, and is not wired
 * into any `npm test` script.
 *
 * Usage: node scripts/capture_v95_page_sheets.mjs
 *   -> cocos/docs/evidence/v95/pages/<page>-<size>.png
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, launchBrowser, navigateToPage, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const evidenceDirectory = path.join(repoRoot, 'cocos', 'docs', 'evidence', 'v95', 'pages');

const SIZES = [
  { width: 375, height: 667, label: '375x667' },
  { width: 390, height: 844, label: '390x844' },
  { width: 430, height: 932, label: '430x932' },
];

if (!existsSync(path.join(buildDirectory, 'index.html'))) {
  throw new Error('No built web-mobile package at ' + buildDirectory);
}
mkdirSync(evidenceDirectory, { recursive: true });

const { server, port } = await serve(buildDirectory);
const browser = await launchBrowser();
const captured = [];
const failures = [];

try {
  for (const size of SIZES) {
    for (const pageKey of Object.keys(PAGES)) {
      const file = path.join(evidenceDirectory, `${pageKey}-${size.label}.png`);
      const startedAt = Date.now();
      let context = null;
      try {
        const opened = await openPage(browser, port, size);
        context = opened.context;
        await navigateToPage(opened.page, opened.cdp, opened.canvasRect, pageKey);
        // Let the page settle and any entry tween finish before the shutter.
        await sleep(2500);
        await opened.page.screenshot({ path: file });
        captured.push({ page: pageKey, size: size.label, file, ms: Date.now() - startedAt });
        console.log(`[v95:sheets] ${pageKey}@${size.label} -> ${path.relative(repoRoot, file)} (${Date.now() - startedAt} ms)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ page: pageKey, size: size.label, error: message });
        console.error(`[v95:sheets] FAIL ${pageKey}@${size.label}: ${message}`);
      } finally {
        if (context) await context.close().catch(() => {});
      }
    }
  }
} finally {
  await browser.close();
  server.close();
}

const manifest = {
  schema: 'bhr.v95.page-sheets/1',
  generatedAt: new Date().toISOString(),
  buildDirectory,
  sizes: SIZES,
  pages: Object.keys(PAGES),
  captured,
  failures,
};
writeFileSync(path.join(evidenceDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[v95:sheets] captured ${captured.length}, failed ${failures.length}`);
if (failures.length > 0) process.exitCode = 1;
