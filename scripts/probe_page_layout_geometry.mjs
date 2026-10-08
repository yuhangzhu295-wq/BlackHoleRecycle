/**
 * Project every node of a page subtree to real screen pixels and print how much
 * of each falls outside the viewport.
 *
 * Diagnostic counterpart to `verify_page_layout_geometry.mjs`, which asserts the
 * same measurement. See `scripts/lib/page_layout_geometry.mjs` for why the
 * numbers come from the UI camera rather than `view.getVisibleSize()`, and why
 * a screenshot cannot answer this.
 *
 * Usage:
 *   node scripts/probe_page_layout_geometry.mjs --page=home
 *   node scripts/probe_page_layout_geometry.mjs --page=machine --size=412x915
 *   node scripts/probe_page_layout_geometry.mjs --page=skin --sizes=all
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_SIZES,
  PAGES,
  collectGeometry,
  isClipped,
  isTight,
  launchBrowser,
  navigateToPage,
  openPage,
  readMetrics,
  serve,
  sleep,
  splitContent,
  visibleContent,
} from './lib/page_layout_geometry.mjs';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'layout');
mkdirSync(outDir, { recursive: true });

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

const PAGE = argOf('page', 'home');
const PAGE_NODE = PAGES[PAGE];
if (!PAGE_NODE) {
  throw new Error(`unknown --page=${PAGE}; expected one of ${Object.keys(PAGES).join(', ')}`);
}

const sizeArg = argOf('size', '');
const SIZES = sizeArg
  ? (() => {
    const [width, height] = sizeArg.split('x').map(Number);
    if (!(width > 0) || !(height > 0)) throw new Error(`bad --size=${sizeArg}`);
    return [{ width, height, label: 'explicit' }];
  })()
  : (argOf('sizes', '') === 'all' ? ALL_SIZES : [ALL_SIZES[3]]);

const { server, port } = await serve(buildDirectory);
const browser = await launchBrowser();
const report = [];

try {
  for (const size of SIZES) {
    const { context, page, cdp, canvasRect } = await openPage(browser, port, size);
    await navigateToPage(page, cdp, canvasRect, PAGE);
    await sleep(2500);

    const metrics = await readMetrics(page);
    const result = await collectGeometry(page, PAGE_NODE);
    if (result.error) throw new Error(`FAIL_PAGE_GEOMETRY: ${JSON.stringify(result)}`);

    const { content, fullBleed } = splitContent(result.nodes);
    // Nodes whose texture carries transparent padding are checked against their
    // opaque pixels; see TRANSPARENT_PADDING in the shared module.
    const checked = visibleContent(PAGE, content, size.width);
    const clipped = checked.filter(isClipped);
    const tight = checked.filter((n) => isTight(n, size.width));

    report.push({
      page: PAGE,
      pageNode: PAGE_NODE,
      viewport: `${size.width}x${size.height}`,
      label: size.label,
      aspect: +(size.height / size.width).toFixed(4),
      metrics,
      usableDesignHalfWidth: +(result.cameraInfo.orthoHeight * (size.width / size.height)).toFixed(1),
      nodes: result.nodes,
      fullBleed: fullBleed.map((n) => n.name),
      clipped: clipped.map((n) => `${n.name} L${n.overflowLeft} R${n.overflowRight} T${n.overflowTop} B${n.overflowBottom}`),
    });

    console.log(`\n=== ${PAGE} @ ${size.width}x${size.height} (${size.label}) aspect ${(size.height / size.width).toFixed(4)} ===`);
    console.log(`  UI camera orthoHeight ${result.cameraInfo.orthoHeight}`
      + `  => usable design half-width ${(result.cameraInfo.orthoHeight * size.width / size.height).toFixed(1)}`
      + `  (view.getVisibleSize() claims ${metrics.visibleSize.w} wide)`);
    console.log(`  ${content.length} content nodes, ${fullBleed.length} full-bleed backdrop(s) ignored:`
      + ` ${fullBleed.map((n) => n.name).join(', ') || 'none'}`);
    if (!clipped.length && !tight.length) console.log('  every content node has >= 8 px of margin');
    for (const n of clipped) {
      console.log(`  CLIPPED ${n.name.padEnd(22)} x ${n.left}..${n.right} y ${n.top}..${n.bottom}`
        + `  overflow L${n.overflowLeft} R${n.overflowRight} T${n.overflowTop} B${n.overflowBottom}`);
    }
    for (const n of tight) {
      console.log(`  TIGHT   ${n.name.padEnd(22)} x ${n.left}..${n.right}`
        + `  margins L${n.left} R${+(size.width - n.right).toFixed(1)}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

writeFileSync(path.join(outDir, `${PAGE}_layout_geometry.json`), `${JSON.stringify(report, null, 2)}\n`);

const totals = report.flatMap((e) => e.clipped.map((line) => `${e.viewport} ${line}`));
console.log(`\n[${PAGE}] clipped content-node instances: ${totals.length}`);
totals.forEach((line) => console.log(`  ${line}`));
