/**
 * Read the live Cocos resolution policy out of the running build.
 *
 * `PortraitGameplayCameraController` asks for FIXED_WIDTH, but projected node
 * centres say the design space is cropped to ~591 design units at 390x844 --
 * which is FIXED_HEIGHT behaviour. The two cannot both be true, and the answer
 * decides where the fix belongs: a Home-layout nudge, or the portrait contract
 * itself (the same contract the already-recorded RT-08 HUD pill clip blames).
 *
 * Usage: node scripts/probe_resolution_policy.mjs [--width=390] [--height=844]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');

const argOf = (n, f) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=')[1] : f;
};
const WIDTH = Number(argOf('width', '390'));
const HEIGHT = Number(argOf('height', '844'));

function serve(root) {
  return new Promise((res) => {
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
    server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
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
    viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
  await sleep(1500);

  const out = await page.evaluate(() => {
    const result = { ccReachable: typeof window.cc !== 'undefined' };
    const cc = window.cc;
    if (!cc?.view) {
      result.qaKeys = Object.keys(window.__BHR_QA__ || {});
      return result;
    }
    const v = cc.view;
    const size = v.getVisibleSize();
    const design = v.getDesignResolutionSize();
    const frame = v.getFrameSize();
    result.visibleSize = { width: size.width, height: size.height };
    result.designResolution = { width: design.width, height: design.height };
    result.frameSize = { width: frame.width, height: frame.height };
    result.scale = { x: v.getScaleX(), y: v.getScaleY() };
    result.resolutionPolicy = v._resolutionPolicy?._name
      ?? String(v._resolutionPolicy)
      ?? null;
    result.resolutionPolicyKeys = v._resolutionPolicy ? Object.keys(v._resolutionPolicy) : null;

    const scene = cc.director.getScene();
    const canvas = scene?.getChildByName('Canvas');
    const canvasTransform = canvas?.getComponent(cc.UITransform);
    result.canvasNode = canvas ? {
      name: canvas.name,
      width: canvasTransform?.width ?? null,
      height: canvasTransform?.height ?? null,
      children: canvas.children.map((c) => c.name),
    } : null;
    const safe = canvas?.getChildByName('SafeAreaRoot');
    const safeTransform = safe?.getComponent(cc.UITransform);
    result.safeAreaRoot = safe ? {
      width: safeTransform?.width ?? null,
      height: safeTransform?.height ?? null,
      x: safe.position.x,
      y: safe.position.y,
      components: safe.components.map((c) => c.constructor.name),
    } : null;

    // Raw projection inputs, so the design->screen mapping can be solved from
    // the runtime instead of assumed.
    const snapshot = window.__BHR_QA__.snapshot();
    const home = snapshot.ui || {};
    result.homeNodes = {};
    for (const key of ['start', 'mode', 'machine', 'skin', 'settings']) {
      const node = home[key];
      result.homeNodes[key] = node ? {
        designX: node.x,
        designW: node.width,
        world: node.world,
        screen: node.screen,
      } : null;
    }
    result.viewportRect = {
      x: v.getViewportRect().x,
      y: v.getViewportRect().y,
      width: v.getViewportRect().width,
      height: v.getViewportRect().height,
    };
    result.canvasSize = cc.view.getCanvasSize
      ? { width: cc.view.getCanvasSize().width, height: cc.view.getCanvasSize().height }
      : null;
    return result;
  });

  console.log(`=== ${WIDTH}x${HEIGHT} ===`);
  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
  server.close();
}
