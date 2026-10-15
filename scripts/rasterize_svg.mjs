/**
 * Rasterise an SVG to a PNG at an exact size, with no antialias surprises.
 *
 * V13 moves 2D art authoring off PIL and onto editable vector sources, and there
 * is no Inkscape or rsvg on this machine -- but Chromium is already a dependency
 * of the capture probes and renders SVG exactly as the engine's art would be
 * seen. The page is sized to the requested pixel size and the screenshot is
 * taken with the device scale factor pinned to 1, so the output is the SVG at
 * 1:1 with no browser chrome and no scaling.
 *
 * Usage: node scripts/rasterize_svg.mjs <in.svg> <out.png> [size]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [input, output, sizeArg] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/rasterize_svg.mjs <in.svg> <out.png> [WxH]');
  process.exit(2);
}
const [width, height] = (sizeArg || '512x512').split('x').map(Number);
const svg = readFileSync(input, 'utf8');
if (!/<svg[\s>]/.test(svg)) throw new Error(`${input} does not look like an SVG`);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    '<!doctype html><html><head><style>'
    + 'html,body{margin:0;padding:0;background:transparent;overflow:hidden}'
    + `svg{display:block;width:${width}px;height:${height}px}`
    + '</style></head><body>' + svg + '</body></html>',
    { waitUntil: 'load' },
  );
  const bytes = await page.screenshot({ omitBackground: true, type: 'png' });
  writeFileSync(output, bytes);
  console.log(`rasterised ${path.basename(input)} -> ${output} at ${width}x${height} (${bytes.length} bytes)`);
} finally {
  await browser.close();
}
