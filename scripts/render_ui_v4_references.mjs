/**
 * UI V4 Expanded — design reference builder.
 *
 * 1. Pages 01-04 are the locked V3 masters. They are COPIED from
 *    `cocos/docs/design-reference/ui-v3/` and byte identity is asserted, so the
 *    V4 set can never silently diverge from the V3 lineage.
 * 2. Pages 05-10 are rendered deterministically from the HTML sources under
 *    `cocos/docs/design-reference/ui-v4-expanded/source/` at the locked
 *    720x1280 canvas, one page per file.
 *
 * No image-generation model is used or claimed. See design-lineage.md §6-7.
 *
 * Usage: node scripts/render_ui_v4_references.mjs
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const v3Dir = join(root, 'cocos/docs/design-reference/ui-v3');
const outDir = join(root, 'cocos/docs/design-reference/ui-v4-expanded');
const srcDir = join(outDir, 'source');

const CANVAS = { width: 720, height: 1280 };

/** 01-04: inherited V3 masters, copied verbatim. */
const INHERITED = [
  ['01-arena-gameplay.png', 'arena-hud-reference.png'],
  ['02-revive.png', 'revive-reference.png'],
  ['03-mode-select.png', 'mode-select-reference.png'],
  ['04-settlement.png', 'settlement-reference.png'],
];

/** 05-10: deterministic renders from the locked HTML sources. */
const RENDERED = [
  ['05-home.png', '05-home.html'],
  ['06-endless-ready.png', '06-endless-ready.html'],
  ['07-arena-ready.png', '07-arena-ready.html'],
  ['08-endless-gameplay.png', '08-endless-gameplay.html'],
  ['09-large-target-suction.png', '09-large-target-suction.html'],
  ['10-tier-upgrade-feedback.png', '10-tier-upgrade-feedback.html'],
];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** Set by renderExtensions so main() can report the measured 08 budget. */
let spaceBudgetResult = null;

const pngSize = (buffer) => ({
  width: buffer.readUInt32BE(16),
  height: buffer.readUInt32BE(20),
});

function copyInherited(report) {
  for (const [target, source] of INHERITED) {
    const from = join(v3Dir, source);
    const to = join(outDir, target);
    if (!existsSync(from)) {
      throw new Error(`[ui-v4] missing V3 master: ${from}`);
    }
    const sourceHash = sha256(readFileSync(from));
    copyFileSync(from, to);
    const targetHash = sha256(readFileSync(to));
    if (sourceHash !== targetHash) {
      throw new Error(`[ui-v4] byte identity lost for ${target}`);
    }
    report.push({
      file: target,
      provenance: 'V3_MASTER_COPY',
      source: `ui-v3/${source}`,
      sha256: targetHash,
      bytes: readFileSync(to).length,
      byteIdenticalToSource: true,
    });
  }
}

/**
 * Reference 08 space budget, measured from the live DOM geometry of the
 * rendered page.
 *
 * The runtime screen-space probe is NOT usable for this: it classifies samples
 * from projected world bounding quads, which over-count large landmarks and
 * cluster rings (measured 58% "static" coverage on a frame that is visibly
 * mostly open road). The reference is a layout artifact with known boxes, so
 * the budget is measured exactly here instead, with an explicit precedence so
 * the buckets are mutually exclusive and sum to 100% of the page:
 *   player > dynamic > static > environment > open.
 * Every counted element declares its own `data-bucket`, so an auditor can
 * re-derive the number from the HTML rather than trusting this function.
 */
const BUDGET_BUCKETS = ['dynamic', 'static', 'environment', 'open'];

async function measureSpaceBudget(page) {
  return page.evaluate((bucketOrder) => {
    const pageElement = document.querySelector('.page');
    const pageRect = pageElement.getBoundingClientRect();
    const width = Math.round(pageRect.width);
    const height = Math.round(pageRect.height);
    const grid = { columns: 72, rows: 128 };
    const areas = Object.fromEntries(bucketOrder.map((bucket) => [bucket, 0]));
    let playerSamples = 0;
    let totalSamples = 0;

    const boxes = [...document.querySelectorAll('[data-bucket]')].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        bucket: element.dataset.bucket,
        left: rect.left - pageRect.left,
        top: rect.top - pageRect.top,
        right: rect.right - pageRect.left,
        bottom: rect.bottom - pageRect.top,
      };
    });

    for (let row = 0; row < grid.rows; row++) {
      const y = ((row + 0.5) / grid.rows) * height;
      for (let column = 0; column < grid.columns; column++) {
        const x = ((column + 0.5) / grid.columns) * width;
        totalSamples += 1;
        const hits = boxes.filter((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
        if (hits.some((hit) => hit.bucket === 'player')) {
          playerSamples += 1;
          continue;
        }
        const winner = bucketOrder.find((bucket) => hits.some((hit) => hit.bucket === bucket));
        if (winner) areas[winner] += 1;
      }
    }

    const budgetSamples = totalSamples - playerSamples;
    const share = (value) => Number((value / budgetSamples).toFixed(4));
    return {
      method: 'DOM box rasterisation with declared bucket precedence',
      precedence: bucketOrder.join(' > '),
      grid,
      totalSamples,
      playerSamples,
      budgetSamples,
      bucketSamples: { ...areas },
      openShare: share(areas.open),
      environmentShare: share(areas.environment),
      staticShare: share(areas.static),
      dynamicShare: share(areas.dynamic),
      declaredElements: boxes.length,
    };
  }, BUDGET_BUCKETS);
}

/** The binding band table from gameplay-composition-contract.md §2. */
const BUDGET_BANDS = {
  open: [0.55, 0.65],
  environment: [0.15, 0.20],
  static: [0.10, 0.15],
  dynamic: [0.05, 0.10],
};

function evaluateBudgetBands(budget) {
  const checks = Object.entries(BUDGET_BANDS).map(([bucket, [min, max]]) => {
    const value = budget[`${bucket}Share`];
    return { bucket, min, max, value, inBand: value >= min && value <= max };
  });
  return { bands: BUDGET_BANDS, checks, allInBand: checks.every((check) => check.inBand) };
}

async function renderExtensions(report) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: CANVAS,
      deviceScaleFactor: 1,
    });
    for (const [target, source] of RENDERED) {
      const htmlPath = join(srcDir, source);
      if (!existsSync(htmlPath)) {
        throw new Error(`[ui-v4] missing design source: ${htmlPath}`);
      }
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      // Deterministic output: no web fonts, no remote assets, no animation.
      await page.evaluate(() => document.fonts && document.fonts.ready);
      const to = join(outDir, target);
      await page.screenshot({ path: to, type: 'png', animations: 'disabled' });
      const buffer = readFileSync(to);
      const size = pngSize(buffer);
      if (size.width !== CANVAS.width || size.height !== CANVAS.height) {
        throw new Error(`[ui-v4] ${target} rendered ${size.width}x${size.height}, expected ${CANVAS.width}x${CANVAS.height}`);
      }
      const entry = {
        file: target,
        provenance: 'DETERMINISTIC_LAYOUT_RENDER',
        source: `ui-v4-expanded/source/${source}`,
        sha256: sha256(buffer),
        bytes: buffer.length,
        width: size.width,
        height: size.height,
      };
      if (source === '08-endless-gameplay.html') {
        const budget = await measureSpaceBudget(page);
        entry.spaceBudget = budget;
        entry.spaceBudgetBands = evaluateBudgetBands(budget);
        spaceBudgetResult = entry;
      }
      report.push(entry);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const report = [];
  copyInherited(report);
  await renderExtensions(report);

  const payload = {
    contract: 'ui-v4-expanded-reference-set',
    version: 1,
    canvas: CANVAS,
    generatedAt: new Date().toISOString(),
    imageGenerationModel: 'NONE',
    note:
      'Pages 01-04 are byte-identical copies of the V3 masters. Pages 05-10 are ' +
      'deterministic layout renders of the locked HTML design sources, not ' +
      'AI-generated concept art.',
    references: report,
  };
  writeFileSync(join(outDir, 'reference-manifest.json'), `${JSON.stringify(payload, null, 2)}\n`);

  console.log(`[ui-v4] wrote ${report.length} references to cocos/docs/design-reference/ui-v4-expanded/`);
  for (const entry of report) {
    console.log(`  ${entry.file}  ${entry.provenance}  ${entry.bytes}B`);
  }
  if (spaceBudgetResult) {
    const { spaceBudget, spaceBudgetBands } = spaceBudgetResult;
    console.log('[ui-v4] 08 space budget (DOM box rasterisation, player excluded):');
    console.log(`  open        ${(spaceBudget.openShare * 100).toFixed(1)}%  band ${(BUDGET_BANDS.open[0] * 100)}-${(BUDGET_BANDS.open[1] * 100)}%`);
    console.log(`  environment ${(spaceBudget.environmentShare * 100).toFixed(1)}%  band ${(BUDGET_BANDS.environment[0] * 100)}-${(BUDGET_BANDS.environment[1] * 100)}%`);
    console.log(`  static      ${(spaceBudget.staticShare * 100).toFixed(1)}%  band ${(BUDGET_BANDS.static[0] * 100)}-${(BUDGET_BANDS.static[1] * 100)}%`);
    console.log(`  dynamic     ${(spaceBudget.dynamicShare * 100).toFixed(1)}%  band ${(BUDGET_BANDS.dynamic[0] * 100)}-${(BUDGET_BANDS.dynamic[1] * 100)}%`);
    for (const check of spaceBudgetBands.checks) {
      console.log(`  ${check.inBand ? 'IN BAND ' : 'OUT     '} ${check.bucket}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
