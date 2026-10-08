/**
 * Gate: every fixed page must keep all of its content inside the frame.
 *
 * Turns the one-off measurement in `probe_page_layout_geometry.mjs` into a
 * repeatable check, so a later layout edit cannot quietly put a page back off
 * the edge. Runs the real build in a real browser and drives the real flow to
 * each page -- the overlay pages only exist after a match starts.
 *
 * ## What it asserts, and what it only reports
 *
 * `PASSING` pages are asserted at both viewports. 375x667 is the 16:9 reference
 * the layout tables were authored against, so it also catches an adaptation that
 * broke the reference while fixing a narrower device; 412x915 is the tightest
 * horizontal case of any real device (20:9).
 *
 * The margin floor applies to interactive nodes only (see MIN_MARGIN_PX); every
 * other node merely has to stay unclipped, which is the project's own rule.
 *
 * `KNOWN_UNFIXED` is measured and printed but does not fail the run, for pages
 * that are known to be broken and recorded as such in the gate table. It is
 * empty: all eight pages pass.
 *
 * Usage: node scripts/verify_page_layout_geometry.mjs [--pages=home,mode]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIN_MARGIN_PX,
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

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

/** Pages whose geometry is asserted. */
const PASSING = ['home', 'mode', 'ready', 'machine', 'skin', 'pause', 'settlement', 'revive'];

/**
 * Pages measured but not asserted; see the header. `ready` is here rather than
 * in PASSING because its two stat panels overflow by 1.3 px, below the
 * anti-aliasing threshold, and asserting a sub-pixel margin would be noise.
 */
const KNOWN_UNFIXED = [];

/** 375x667 is the authored reference; 412x915 is the tightest real aspect. */
const GATE_SIZES = [
  { width: 375, height: 667, label: 'reference-16:9' },
  { width: 412, height: 915, label: 'tightest-20:9' },
];

const requested = argOf('pages', '');
const passing = requested ? requested.split(',').map((p) => p.trim()).filter(Boolean) : PASSING;
for (const pageKey of passing) {
  if (!PAGES[pageKey]) throw new Error(`unknown page in --pages: ${pageKey}`);
}

const { server, port } = await serve(buildDirectory);
const browser = await launchBrowser();
const failures = [];

const checkPage = async (pageKey, size, assert) => {
  const { context, page, cdp, canvasRect } = await openPage(browser, port, size);
  try {
    await navigateToPage(page, cdp, canvasRect, pageKey);
    await sleep(2500);

    const metrics = await readMetrics(page);
    const result = await collectGeometry(page, PAGES[pageKey]);
    if (result.error) throw new Error(`FAIL_PAGE_GEOMETRY_${pageKey}: ${JSON.stringify(result)}`);

    const { content, fullBleed } = splitContent(result.nodes);
    if (content.length === 0) {
      throw new Error(`FAIL_LAYOUT_PROBE_EMPTY_${pageKey}: no content nodes found under ${PAGES[pageKey]};`
        + ` the probe is measuring nothing and cannot pass. backdrops=${fullBleed.length}`);
    }
    // Nodes whose texture carries transparent padding are asserted on their
    // opaque rectangle instead of their node box; see TRANSPARENT_PADDING.
    const checked = visibleContent(pageKey, content, size.width);
    const clipped = checked.filter(isClipped);
    const tight = checked.filter((n) => isTight(n, size.width));

    const label = `${pageKey}@${size.width}x${size.height}`;
    if (clipped.length === 0 && tight.length === 0) {
      console.log(`[PASS] ${label}: ${content.length} content nodes, all >= ${MIN_MARGIN_PX} px inside`
        + ` (usable design half-width ${(result.cameraInfo.orthoHeight * size.width / size.height).toFixed(1)}`
        + `, view.getVisibleSize() claims ${metrics.visibleSize.w})`);
      return;
    }

    const detail = [
      ...clipped.map((n) => `${n.name} CLIPPED L${n.overflowLeft} R${n.overflowRight} T${n.overflowTop} B${n.overflowBottom}`),
      ...tight.map((n) => `${n.name} TIGHT margins L${n.left} R${(size.width - n.right).toFixed(1)}`),
    ];
    if (assert) {
      failures.push(`${label}: ${detail.join('; ')}`);
      console.log(`[FAIL] ${label}: ${detail.join('; ')}`);
    } else {
      console.log(`[KNOWN_UNFIXED] ${label}: ${detail.join('; ')}`);
    }
  } finally {
    await context.close();
  }
};

try {
  console.log('--- asserted pages ---');
  for (const pageKey of passing) {
    for (const size of GATE_SIZES) {
      await checkPage(pageKey, size, true);
    }
  }
  if (!requested) {
    console.log('\n--- measured, not asserted (see V9_VISUAL_LOCK_PROGRESS.md 3.5.6) ---');
    for (const pageKey of KNOWN_UNFIXED) {
      await checkPage(pageKey, GATE_SIZES[1], false);
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n[verify:layout] FAIL: ${failures.length} page/viewport combination(s) put content outside the frame.`);
  failures.forEach((line) => console.error(`  ${line}`));
  process.exit(1);
}
console.log(`\n[verify:layout] PASS: ${passing.length} page(s) x ${GATE_SIZES.length} viewport(s) fully inside the frame.`);
