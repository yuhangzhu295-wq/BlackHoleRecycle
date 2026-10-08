/**
 * Project every node of a page subtree to real screen pixels and report how
 * much of each falls outside the viewport.
 *
 * Why this exists: the portrait contract asks `view.setDesignResolutionSize`
 * for FIXED_WIDTH, and `view.getVisibleSize()` duly reports 720 x 1558 at
 * 390x844. The UI is not laid out in that space. Its camera is scaled to the
 * design HEIGHT (1280 -> 844 px), so the horizontal design space that actually
 * reaches the screen is 1280/aspect wide -- about 592 units at 390x844, not
 * 720. A layout table authored against 720 therefore looks correct in code and
 * sits off the edge on a real phone. The project already recorded one instance
 * of this (RT-08 HUD pill clip, "usable design x-range of ~[-296, +296]").
 *
 * Screenshots cannot settle it either: the Home backdrop carries its own
 * dark-outlined cubes that merge with the action cards' outlines under any
 * pixel scan. This reads the live projection instead.
 *
 * Usage: node scripts/probe_page_layout_geometry.mjs [--page=HomePage]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'layout');
mkdirSync(outDir, { recursive: true });

const argOf = (n, f) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=')[1] : f;
};
const PAGE = argOf('page', 'HomePage');

/**
 * The real devices this product ships to, plus the two aspect extremes. A
 * layout that fits 375x667 and 430x932 but not 412x915 is not safe: 20:9 is
 * the most common Android shape and is the tightest horizontal case.
 */
const SIZES = [
  { width: 360, height: 780, label: 'android-small-20:9' },
  { width: 375, height: 667, label: 'iphone-se-16:9' },
  { width: 390, height: 844, label: 'iphone-14' },
  { width: 412, height: 915, label: 'pixel-20:9' },
  { width: 430, height: 932, label: 'iphone-max' },
];

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

/** Screen-space rect of every active node, computed inside the page. */
const COLLECT = `(pageName) => {
  const cc = window.cc;
  const canvas = cc.director.getScene()?.getChildByName('Canvas');
  const root = canvas?.getChildByName(pageName);
  if (!root) return { error: 'missing page ' + pageName, children: canvas?.children.map((c) => c.name) };

  const frame = cc.view.getFrameSize();
  // The Canvas' own camera is the one that renders the UI layer; fall back to
  // a scene-wide search so a hierarchy change cannot silently disable this.
  const allCameras = cc.director.getScene().getComponentsInChildren(cc.Camera);
  const uiCamera = (canvas.getComponent(cc.Canvas)?.cameraComponent)
    || allCameras.find((c) => c.node.name === 'UICamera')
    || allCameras.find((c) => c.node.getComponent(cc.UITransform));
  if (!uiCamera) {
    return { error: 'no UICamera', cameras: allCameras.map((c) => c.node.name) };
  }
  const cameraInfo = {
    name: uiCamera.node.name,
    projection: uiCamera.projection,
    orthoHeight: uiCamera.orthoHeight,
    visibility: uiCamera.visibility,
    priority: uiCamera.priority,
    viewport: {
      x: uiCamera.camera?.viewport?.x ?? null,
      y: uiCamera.camera?.viewport?.y ?? null,
      w: uiCamera.camera?.viewport?.width ?? null,
      h: uiCamera.camera?.viewport?.height ?? null,
    },
  };

  // cc.UITransform is not on the runtime namespace in this build, so the
  // component is resolved by name; a silent null here once produced an empty
  // node list that read as "nothing overflows".
  const transformOf = (node) => node.getComponent('cc.UITransform') || null;
  const nodes = [];
  const walk = (node) => {
    const transform = transformOf(node);
    if (transform && node.activeInHierarchy) {
      // Corners in the node's own space, so the projected rect accounts for
      // anchor, scale and any ancestor transform without assuming any of them.
      const w = transform.width;
      const h = transform.height;
      const ax = transform.anchorX;
      const ay = transform.anchorY;
      const corners = [
        [-ax * w, -ay * h], [(1 - ax) * w, -ay * h],
        [(1 - ax) * w, (1 - ay) * h], [-ax * w, (1 - ay) * h],
      ].map(([x, y]) => {
        const world = transform.convertToWorldSpaceAR(new cc.Vec3(x, y, 0), new cc.Vec3());
        const screen = uiCamera.worldToScreen(world, new cc.Vec3());
        return { x: screen.x, y: screen.y };
      });
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      nodes.push({
        name: node.name,
        w: +w.toFixed(1),
        h: +h.toFixed(1),
        left: +minX.toFixed(1),
        right: +maxX.toFixed(1),
        // Screen y is measured from the bottom here; report top-down too.
        top: +(frame.height - maxY).toFixed(1),
        bottom: +(frame.height - minY).toFixed(1),
        overflowLeft: +Math.max(0, -minX).toFixed(1),
        overflowRight: +Math.max(0, maxX - frame.width).toFixed(1),
        overflowTop: +Math.max(0, -minY).toFixed(1),
        overflowBottom: +Math.max(0, maxY - frame.height).toFixed(1),
      });
    }
    node.children.forEach(walk);
  };
  walk(root);
  return { nodes, cameraInfo };
}`;

const { server, port } = await serve(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});

const report = [];
try {
  for (const size of SIZES) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
    await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
    await sleep(1500);

    const metrics = await page.evaluate(() => {
      const cc = window.cc;
      const v = cc.view;
      const canvas = cc.director.getScene()?.getChildByName('Canvas');
      const uiCamera = canvas?.children
        .map((child) => child.getComponent(cc.Camera))
        .find((camera) => camera && camera.name === 'UICamera');
      return {
        visibleSize: { w: v.getVisibleSize().width, h: v.getVisibleSize().height },
        designResolution: { w: v.getDesignResolutionSize().width, h: v.getDesignResolutionSize().height },
        frame: { w: v.getFrameSize().width, h: v.getFrameSize().height },
        viewScale: v.getScaleX(),
        uiCameraOrthoHeight: uiCamera ? uiCamera.orthoHeight : null,
        uiCameraProjection: uiCamera ? uiCamera.projection : null,
      };
    });

    const result = await page.evaluate(eval(`(${COLLECT})`), PAGE);
    if (result.error) throw new Error(`FAIL_PAGE_GEOMETRY: ${JSON.stringify(result)}`);

    const entry = {
      viewport: `${size.width}x${size.height}`,
      label: size.label,
      aspect: +(size.height / size.width).toFixed(4),
      metrics,
      cameraInfo: result.cameraInfo,
      // The width of the design space that actually reaches the screen.
      usableDesignHalfWidth: +(metrics.uiCameraOrthoHeight
        ? metrics.uiCameraOrthoHeight * (size.width / size.height)
        : NaN).toFixed(1),
      nodes: result.nodes,
    };
    report.push(entry);

    const clipped = result.nodes.filter((n) => n.overflowLeft || n.overflowRight || n.overflowTop || n.overflowBottom);
    console.log(`\n=== ${entry.viewport} (${entry.label}) aspect ${entry.aspect} ===`);
    console.log(`visibleSize ${metrics.visibleSize.w}x${metrics.visibleSize.h}`
      + `  viewScale ${metrics.viewScale.toFixed(4)}`
      + `  uiCamera orthoHeight ${metrics.uiCameraOrthoHeight}`
      + `  usable design half-width ${entry.usableDesignHalfWidth}`);
    console.log(`  ui camera: ${JSON.stringify(result.cameraInfo)}`);
    if (!clipped.length) console.log('  no node overflows the viewport');
    for (const n of clipped) {
      console.log(`  CLIPPED ${n.name.padEnd(18)} rect x ${n.left}..${n.right} y ${n.top}..${n.bottom}`
        + `  overflow L${n.overflowLeft} R${n.overflowRight} T${n.overflowTop} B${n.overflowBottom}`);
    }
    const nearEdge = result.nodes.filter((n) => !clipped.includes(n)
      && (n.left < 8 || size.width - n.right < 8));
    for (const n of nearEdge) {
      console.log(`  TIGHT   ${n.name.padEnd(18)} rect x ${n.left}..${n.right}`
        + `  margins L${n.left} R${+(size.width - n.right).toFixed(1)}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

writeFileSync(path.join(outDir, `${PAGE.toLowerCase()}_layout_geometry.json`),
  `${JSON.stringify(report, null, 2)}\n`);

const total = report.flatMap((e) => e.nodes
  .filter((n) => n.overflowLeft || n.overflowRight || n.overflowTop || n.overflowBottom)
  .map((n) => `${e.viewport} ${n.name} L${n.overflowLeft} R${n.overflowRight} T${n.overflowTop} B${n.overflowBottom}`));
console.log(`\nclipped node instances across ${report.length} viewports: ${total.length}`);
total.forEach((line) => console.log(`  ${line}`));
