/**
 * V7.4 absorb burst evidence capture and measurement script.
 *
 * Captures real in-engine absorb burst screenshots on bright ground in Endless mode
 * at 390x844 portrait viewport, and computes color/luminance/saturation/extent metrics.
 *
 * Strictly read-only runtime tool: DOES NOT REBUILD.
 * Uses existing built package in cocos/build/web-mobile.
 *
 * Usage:
 *   node scripts/capture_burst_evidence.mjs --phase=before
 *   node scripts/capture_burst_evidence.mjs --phase=after
 */

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const evidenceDirectory = path.join(repoRoot, 'artifacts', 'qa', 'portrait');
mkdirSync(evidenceDirectory, { recursive: true });

const phaseArg = process.argv.find((a) => a.startsWith('--phase='))?.slice('--phase='.length) || 'before';
const MAX_CAPTURES = Number(process.env.BHR_BURST_MAX_CAPTURES || 3);
const SWEEP_TIMEOUT_SECONDS = 15;

function getMtimeInfo() {
  const files = {
    sourceAssetGenerator: path.join(repoRoot, 'scripts', 'v7_phase5_assets.mjs'),
    sourcePrefabGenerator: path.join(repoRoot, 'scripts', 'v7_phase5_prefabs.mjs'),
    materialAsset: path.join(repoRoot, 'cocos', 'assets', 'game_art', 'materials', 'MAT_BLACKHOLE_BURST.mtl'),
    prefabAsset: path.join(repoRoot, 'cocos', 'assets', 'game_art', 'prefabs', 'blackhole', 'AbsorbBurst.prefab'),
    buildHtml: path.join(buildDirectory, 'index.html'),
    buildApp: path.join(buildDirectory, 'application.js'),
  };

  const mtimes = {};
  for (const [key, filePath] of Object.entries(files)) {
    if (existsSync(filePath)) {
      const stat = statSync(filePath);
      mtimes[key] = {
        path: path.relative(repoRoot, filePath).split(path.sep).join('/'),
        mtimeMs: stat.mtimeMs,
        mtimeIso: new Date(stat.mtimeMs).toISOString(),
      };
    } else {
      mtimes[key] = null;
    }
  }
  return mtimes;
}

function createStaticServer(rootDirectory) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const urlPath = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^[/\\]+/, '');
      const filePath = path.resolve(rootDirectory, relativePath);
      if (!filePath.startsWith(`${rootDirectory}${path.sep}`) && filePath !== path.join(rootDirectory, 'index.html')) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if (!existsSync(filePath)) {
        response.writeHead(404).end('Not found');
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      const contentType = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.wasm': 'application/wasm',
        '.png': 'image/png',
      }[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function decodePng(buf) {
  let cursor = 8;
  let width = 0, height = 0, colorType = -1;
  const idat = [];
  while (cursor < buf.length) {
    const len = buf.readUInt32BE(cursor);
    const type = buf.toString('ascii', cursor + 4, cursor + 8);
    const dataStart = cursor + 8;
    const dataEnd = dataStart + len;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      colorType = buf[dataStart + 9];
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') break;
    cursor = dataEnd + 4;
  }
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4);
  const prevRow = Buffer.alloc(stride);
  const curRow = Buffer.alloc(stride);
  let rawOff = 0;
  for (let r = 0; r < height; r++) {
    const filter = raw[rawOff++];
    for (let c = 0; c < stride; c++) {
      const val = raw[rawOff++];
      const left = c >= bytesPerPixel ? curRow[c - bytesPerPixel] : 0;
      const up = prevRow[c];
      const upLeft = c >= bytesPerPixel ? prevRow[c - bytesPerPixel] : 0;
      if (filter === 0) curRow[c] = val;
      else if (filter === 1) curRow[c] = (val + left) & 0xff;
      else if (filter === 2) curRow[c] = (val + up) & 0xff;
      else if (filter === 3) curRow[c] = (val + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        curRow[c] = (val + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      }
    }
    for (let c = 0; c < width; c++) {
      const srcOff = c * bytesPerPixel;
      const dstOff = (r * width + c) * 4;
      pixels[dstOff] = curRow[srcOff];
      pixels[dstOff + 1] = curRow[srcOff + 1];
      pixels[dstOff + 2] = curRow[srcOff + 2];
      pixels[dstOff + 3] = bytesPerPixel === 4 ? curRow[srcOff + 3] : 255;
    }
    curRow.copy(prevRow);
  }
  return { width, height, pixels };
}

function rgbToHsl(r, g, b) {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rf: h = ((gf - bf) / d + (gf < bf ? 6 : 0)) / 6; break;
      case gf: h = ((bf - rf) / d + 2) / 6; break;
      case bf: h = ((rf - gf) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hexToHsl(hex) {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return rgbToHsl(r, g, b);
}

function angularDistanceDeg(h1, h2) {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Measure burst metrics from a captured screenshot and projected burst center.
 */
function analyzeBurstImage(img, projectedCenter) {
  const cx = Math.round(projectedCenter.x);
  const cy = Math.round(projectedCenter.y);
  const radiusX = 85;
  const radiusY = 75;

  const minX = Math.max(10, cx - radiusX);
  const maxX = Math.min(img.width - 10, cx + radiusX);
  const minY = Math.max(150, cy - radiusY);
  const maxY = Math.min(img.height - 180, cy + radiusY);

  // Background sample on road outside the burst
  const bgSampleY = Math.max(150, cy - radiusY - 20);
  const bgSampleX = Math.max(10, cx - radiusX - 20);
  const bgOff = (bgSampleY * img.width + bgSampleX) * 4;
  const bgR = img.pixels[bgOff];
  const bgG = img.pixels[bgOff + 1];
  const bgB = img.pixels[bgOff + 2];
  const bgLum = 0.2126 * bgR + 0.7152 * bgG + 0.0722 * bgB;

  // Burst effect pixels: pixels within the burst window that deviate from road background
  // and represent the visible burst effect (lum > bgLum + 12 or lum > 190 or chromatic pop)
  let burstPixels = 0;
  let sumLum = 0;
  let maxLum = 0;
  let nearWhitePixels = 0;
  let sumSat = 0;
  let sumHueX = 0;
  let sumHueY = 0;
  let hueWeightedCount = 0;

  let bbMinX = 9999, bbMaxX = -1, bbMinY = 9999, bbMaxY = -1;

  // Also isolate the burst core (lum > 195 or distinct pop)
  let corePixels = 0;
  let coreSumLum = 0;
  let coreSumSat = 0;
  let coreNearWhite = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const off = (y * img.width + x) * 4;
      const r = img.pixels[off];
      const g = img.pixels[off + 1];
      const b = img.pixels[off + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Exclude black hole deep abyss core
      if (lum < 65) continue;

      const diffFromBg = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      // Pixel belongs to burst if it is brighter than road ground or has particle pop
      const isBurst = (lum > bgLum + 10) || (diffFromBg > 30 && lum > 120);

      if (isBurst) {
        burstPixels++;
        sumLum += lum;
        if (lum > maxLum) maxLum = lum;

        const isNearWhite = (r > 235 && g > 235 && b > 235);
        if (isNearWhite) {
          nearWhitePixels++;
        }

        const hsl = rgbToHsl(r, g, b);
        sumSat += hsl.s;

        // Core stats (bright/intense part of the burst)
        if (lum > 195 || (hsl.s > 30 && lum > 140)) {
          corePixels++;
          coreSumLum += lum;
          coreSumSat += hsl.s;
          if (isNearWhite) coreNearWhite++;
        }

        // Circular mean for hue, weighted by saturation
        if (hsl.s > 4) {
          const rad = (hsl.h * Math.PI) / 180;
          sumHueX += Math.cos(rad) * hsl.s;
          sumHueY += Math.sin(rad) * hsl.s;
          hueWeightedCount += hsl.s;
        }

        if (x < bbMinX) bbMinX = x;
        if (x > bbMaxX) bbMaxX = x;
        if (y < bbMinY) bbMinY = y;
        if (y > bbMaxY) bbMaxY = y;
      }
    }
  }

  let meanHue = 0;
  if (hueWeightedCount > 0) {
    let angleRad = Math.atan2(sumHueY, sumHueX);
    if (angleRad < 0) angleRad += 2 * Math.PI;
    meanHue = (angleRad * 180) / Math.PI;
  }

  const extentWidth = bbMaxX >= bbMinX ? bbMaxX - bbMinX + 1 : 0;
  const extentHeight = bbMaxY >= bbMinY ? bbMaxY - bbMinY + 1 : 0;

  return {
    projectedCenter: { x: cx, y: cy },
    roadBackgroundSample: { r: bgR, g: bgG, b: bgB, lum: Number(bgLum.toFixed(1)) },
    burstPixelCount: burstPixels,
    meanLuminance: burstPixels > 0 ? Number((sumLum / burstPixels).toFixed(2)) : 0,
    maxLuminance: Number(maxLum.toFixed(2)),
    nearWhitePixelCount: nearWhitePixels,
    nearWhiteRatioPct: burstPixels > 0 ? Number(((nearWhitePixels / burstPixels) * 100).toFixed(2)) : 0,
    meanSaturationPct: burstPixels > 0 ? Number((sumSat / burstPixels).toFixed(2)) : 0,
    meanHueDeg: Number(meanHue.toFixed(2)),
    core: {
      corePixelCount: corePixels,
      coreMeanLuminance: corePixels > 0 ? Number((coreSumLum / corePixels).toFixed(2)) : 0,
      coreMeanSaturationPct: corePixels > 0 ? Number((coreSumSat / corePixels).toFixed(2)) : 0,
      coreNearWhitePixels: coreNearWhite,
      coreNearWhiteRatioPct: corePixels > 0 ? Number(((coreNearWhite / corePixels) * 100).toFixed(2)) : 0,
    },
    extent: {
      width: extentWidth,
      height: extentHeight,
      areaPx: extentWidth * extentHeight,
      boundingBox: [bbMinX, bbMinY, bbMaxX, bbMaxY],
    },
  };
}

async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 60));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function main() {
  console.log(`[burst-evidence] Phase: ${phaseArg}`);
  const mtimeChain = getMtimeInfo();
  console.log('[burst-evidence] Mtime chain:');
  for (const [k, v] of Object.entries(mtimeChain)) {
    console.log(`  ${k}: ${v ? `${v.mtimeIso} (${v.path})` : 'MISSING'}`);
  }

  if (!existsSync(path.join(buildDirectory, 'index.html'))) {
    throw new Error(`Missing build output: ${buildDirectory}`);
  }

  const server = await createStaticServer(buildDirectory);
  const port = server.address().port;

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  const result = {
    phase: phaseArg,
    capturedAt: new Date().toISOString(),
    mtimeChain,
    status: 'FAIL',
    captures: [],
    consoleErrors,
  };

  try {
    console.log(`[burst-evidence] Navigating to http://127.0.0.1:${port}/index.html?qa=1 ...`);
    await page.goto(`http://127.0.0.1:${port}/index.html?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 45000 });
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 15000 });

    const cdp = await context.newCDPSession(page);
    const canvasRect = await page.locator('#GameCanvas').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });

    // Start -> Mode Select
    const home = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const startPoint = {
      x: canvasRect.left + canvasRect.width * home.ui.start.screen.x,
      y: canvasRect.top + canvasRect.height * home.ui.start.screen.y,
    };
    await tap(cdp, startPoint.x, startPoint.y);
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 5000 });

    // Mode Select -> Endless Mode Ready
    const mode = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const endlessPoint = {
      x: canvasRect.left + canvasRect.width * mode.ui.modeEndless.screen.x,
      y: canvasRect.top + canvasRect.height * mode.ui.modeEndless.screen.y,
    };
    await tap(cdp, endlessPoint.x, endlessPoint.y);
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 5000 });

    // Mode Ready -> Start Game (touch bottom center start button)
    const visibleHeight = 720 * (canvasRect.height / canvasRect.width);
    const baseFraction = 0.5 + 290 / visibleHeight;
    for (const fraction of [baseFraction, baseFraction + 0.04, baseFraction - 0.04]) {
      await tap(cdp, canvasRect.left + canvasRect.width * 0.5, canvasRect.top + canvasRect.height * fraction);
      await page.waitForTimeout(400);
      if (await page.evaluate(() => window.__BHR_QA__.snapshot().gameState) !== 'MODE_READY') break;
    }
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Save baseline screenshot (before any absorption)
    const baselineFile = path.join(evidenceDirectory, `v78-burst-${phaseArg}-baseline.png`);
    await page.screenshot({ path: baselineFile });
    console.log(`[burst-evidence] Saved baseline screenshot: ${baselineFile}`);

    const runtimeInfo = await page.evaluate(() => {
      const snap = window.__BHR_QA__.snapshot();
      const gm = cc.director.getScene().getComponentInChildren('GameManager');
      const machine = gm?.machine || null;
      return {
        level: machine?.currentLevel ?? 1,
        levelRimColor: machine?.levelAppearance?.rimColor ?? '#00e5ff',
        skinRimColor: machine?.coreSkin?.rimColor ?? '#e0d5ff',
        skinBodyColor: machine?.coreSkin?.bodyColor ?? '#281660',
      };
    });
    console.log('[burst-evidence] Machine color configuration:');
    console.log(`  Level rimColor: ${runtimeInfo.levelRimColor} (HSL hue: ${hexToHsl(runtimeInfo.levelRimColor).h.toFixed(1)}°)`);
    console.log(`  Skin rimColor: ${runtimeInfo.skinRimColor} (HSL hue: ${hexToHsl(runtimeInfo.skinRimColor).h.toFixed(1)}°)`);
    console.log(`  Skin bodyColor: ${runtimeInfo.skinBodyColor}`);

    const snapPlaying = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const joystick = {
      x: canvasRect.left + canvasRect.width * snapPlaying.ui.runtimeHUD.joystick.screen.x,
      y: canvasRect.top + canvasRect.height * snapPlaying.ui.runtimeHUD.joystick.screen.y,
    };
    const radius = Math.min(70, canvasRect.width * 0.18);

    // Sweep joystick around to absorb first cluster on MainCrossroad road tile
    let capturedCount = 0;
    let lastEmitted = snapPlaying.absorbFeedback?.emittedCount || 0;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joystick.x, y: joystick.y }] });

    const deadline = Date.now() + SWEEP_TIMEOUT_SECONDS * 1000;
    let step = 0;

    while (Date.now() < deadline && capturedCount < MAX_CAPTURES) {
      const angle = (step / 16) * Math.PI * 2;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          x: Math.round(joystick.x + Math.cos(angle) * radius),
          y: Math.round(joystick.y + Math.sin(angle) * radius),
        }],
      });

      for (let poll = 0; poll < 3; poll++) {
        await page.waitForTimeout(65);
        const burstState = await page.evaluate(() => {
          const snap = window.__BHR_QA__.snapshot();
          const fb = snap.absorbFeedback || null;
          if (!fb || (fb.emittedCount || 0) <= 0) return null;

          // Compute screen position of active burst
          const scene = cc.director.getScene();
          const camera = scene.getComponentInChildren(cc.Camera);
          const pos = fb.activeWorldPosition;
          let screenPos = null;
          if (pos && camera) {
            const out = new cc.Vec3();
            camera.worldToScreen(new cc.Vec3(pos.x, pos.y, pos.z), out);
            const view = cc.view.getViewportRect();
            screenPos = { x: out.x, y: view.height - out.y };
          }
          return {
            fb,
            pos,
            screenPos,
          };
        });

        if (burstState && burstState.fb.emittedCount > lastEmitted) {
          lastEmitted = burstState.fb.emittedCount;
          const captureFile = path.join(evidenceDirectory, `v78-burst-${phaseArg}-${capturedCount}.png`);
          await page.screenshot({ path: captureFile });

          // Decode and analyze
          const rawPng = decodePng(readFileSync(captureFile));
          const metrics = analyzeBurstImage(rawPng, burstState.screenPos || { x: 195, y: 500 });

          // Compare hue against level and skin rim colors
          const levelRimHsl = hexToHsl(runtimeInfo.levelRimColor);
          const skinRimHsl = hexToHsl(runtimeInfo.skinRimColor);
          metrics.hueDeltaLevelRimDeg = Number(angularDistanceDeg(metrics.meanHueDeg, levelRimHsl.h).toFixed(2));
          metrics.hueDeltaSkinRimDeg = Number(angularDistanceDeg(metrics.meanHueDeg, skinRimHsl.h).toFixed(2));
          metrics.levelRimHueDeg = Number(levelRimHsl.h.toFixed(2));
          metrics.skinRimHueDeg = Number(skinRimHsl.h.toFixed(2));

          const captureRecord = {
            index: capturedCount,
            file: captureFile,
            emittedCount: burstState.fb.emittedCount,
            activeParticles: burstState.fb.liveParticles,
            activeScale: burstState.fb.activeScale,
            activeWorldPosition: burstState.pos,
            metrics,
          };
          result.captures.push(captureRecord);
          console.log(`[burst-evidence] Capture #${capturedCount}: emitted=${burstState.fb.emittedCount} particles=${burstState.fb.liveParticles} file=${path.basename(captureFile)}`);
          console.log(`  Luminance: mean=${metrics.meanLuminance} max=${metrics.maxLuminance}`);
          console.log(`  Near-white (>235 each channel): ${metrics.nearWhitePixelCount} px (${metrics.nearWhiteRatioPct}%)`);
          console.log(`  Saturation: ${metrics.meanSaturationPct}%`);
          console.log(`  Hue: ${metrics.meanHueDeg}° (delta to level rim: ${metrics.hueDeltaLevelRimDeg}°, delta to skin rim: ${metrics.hueDeltaSkinRimDeg}°)`);
          console.log(`  Extent: ${metrics.extent.width}x${metrics.extent.height} px (${metrics.burstPixelCount} burst px)`);

          capturedCount++;
          break;
        }
      }
      step++;
    }

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    if (result.captures.length > 0) {
      result.status = 'PASS';
    } else {
      throw new Error('No burst was emitted or captured within the time limit.');
    }

    const metricsFile = path.join(evidenceDirectory, `v78-burst-${phaseArg}-metrics.json`);
    writeFileSync(metricsFile, JSON.stringify(result, null, 2), 'utf8');
    console.log(`[burst-evidence] Written metrics summary to ${metricsFile}`);
  } catch (err) {
    result.status = 'FAIL';
    result.error = err.message;
    console.error('[burst-evidence] Error:', err);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
}

main();
