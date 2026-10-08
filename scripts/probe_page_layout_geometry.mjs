/**
 * Project every node of a page subtree to real screen pixels and report how
 * much of each falls outside the viewport.
 *
 * Why this exists: the portrait contract asks `view.setDesignResolutionSize`
 * for FIXED_WIDTH, and `view.getVisibleSize()` duly reports 720 x 1558 at
 * 390x844. The UI is not laid out in that space. `UICamera` is orthographic
 * with `orthoHeight = 640` (= designHeight / 2), so the UI scales to the design
 * HEIGHT and only `1280 / aspect` design units reach the screen -- about 592 at
 * 390x844, not 720. A layout table authored against 720 therefore looks correct
 * in code and sits off the edge on a real phone. The project already recorded
 * one instance of this (RT-08 HUD pill clip, "usable design x-range of
 * ~[-296, +296]"); Home was another and is fixed in `HomePageVisual`.
 *
 * Screenshots cannot settle it: they carry no design->pixel scale, and page
 * backdrops with their own dark outlines (Home's cubes) merge with UI outlines
 * under any pixel scan. This reads the live projection instead.
 *
 * Full-bleed backdrops legitimately overflow and are reported separately: a
 * node as wide as the design space is meant to be cropped.
 *
 * Usage:
 *   node scripts/probe_page_layout_geometry.mjs --page=home
 *   node scripts/probe_page_layout_geometry.mjs --page=machine --size=412x915
 *   node scripts/probe_page_layout_geometry.mjs --page=skin --sizes=all
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

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

/** Canvas child that owns each page's layout. */
const PAGE_NODES = {
  home: 'HomePage',
  mode: 'ModeSelectPage',
  ready: 'EndlessReadyPage',
  machine: 'MachineInfoPage',
  skin: 'SkinSelectionPage',
  pause: 'PausePage',
  settlement: 'SettlementPage',
  revive: 'RevivePage',
};

/**
 * 412x915 is the tightest horizontal case of any real device (20:9), so it is
 * the default single size for the slow, match-driven pages. `--sizes=all`
 * covers the full spread.
 */
const ALL_SIZES = [
  { width: 360, height: 780, label: 'android-small-20:9' },
  { width: 375, height: 667, label: 'iphone-se-16:9' },
  { width: 390, height: 844, label: 'iphone-14' },
  { width: 412, height: 915, label: 'pixel-20:9' },
  { width: 430, height: 932, label: 'iphone-max' },
];

const PAGE = argOf('page', 'home');
const PAGE_NODE = PAGE_NODES[PAGE];
if (!PAGE_NODE) {
  throw new Error(`unknown --page=${PAGE}; expected one of ${Object.keys(PAGE_NODES).join(', ')}`);
}

const sizeArg = argOf('size', '');
const sizesArg = argOf('sizes', '');
const SIZES = sizeArg
  ? (() => {
    const [width, height] = sizeArg.split('x').map(Number);
    if (!(width > 0) || !(height > 0)) throw new Error(`bad --size=${sizeArg}`);
    return [{ width, height, label: 'explicit' }];
  })()
  : (sizesArg === 'all' ? ALL_SIZES : [ALL_SIZES[3]]);

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
  // The Canvas' own camera renders the UI layer; fall back to a scene-wide
  // search so a hierarchy change cannot silently disable this.
  const allCameras = cc.director.getScene().getComponentsInChildren(cc.Camera);
  const uiCamera = (canvas.getComponent(cc.Canvas)?.cameraComponent)
    || allCameras.find((c) => c.node.name === 'UICamera')
    || allCameras.find((c) => c.node.getComponent('cc.UITransform'));
  if (!uiCamera) return { error: 'no UICamera', cameras: allCameras.map((c) => c.node.name) };

  const cameraInfo = {
    name: uiCamera.node.name,
    projection: uiCamera.projection,
    orthoHeight: uiCamera.orthoHeight,
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
    await sleep(1200);

    const cdp = await context.newCDPSession(page);
    const canvasRect = await page.locator('#GameCanvas').evaluate((c) => {
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });

    let snapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const tap = async (x, y) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(60);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(600);
      snapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
    };
    const tapUi = async (key) => {
      const node = snapshot.ui?.[key];
      if (!node?.active || !node?.screen) {
        throw new Error(`FAIL_PROBE_NAV_${key}: ${JSON.stringify(node)}`);
      }
      await tap(canvasRect.left + canvasRect.width * node.screen.x,
        canvasRect.top + canvasRect.height * node.screen.y);
    };
    const waitState = (state, ms = 12000) => page.waitForFunction(
      (want) => window.__BHR_QA__.snapshot().gameState === want, state, { timeout: ms });

    // Same navigation the settled-capture runner uses; these pages cannot be
    // reached without driving the real flow.
    if (PAGE === 'machine' || PAGE === 'skin' || PAGE === 'mode') {
      await tapUi(PAGE);
    } else if (PAGE === 'ready' || PAGE === 'pause' || PAGE === 'settlement') {
      await tapUi('start');
      await waitState('MODE_SELECT');
      await tapUi('modeEndless');
      await waitState('MODE_READY');
      if (PAGE !== 'ready') {
        const startBtn = snapshot.ui?.endlessReady?.start;
        if (!startBtn?.active || !startBtn?.screen) {
          throw new Error(`FAIL_PROBE_NAV_READY_START: ${JSON.stringify(startBtn)}`);
        }
        await tap(canvasRect.left + canvasRect.width * startBtn.screen.x,
          canvasRect.top + canvasRect.height * startBtn.screen.y);
        await waitState('PLAYING');
        await sleep(1200);
        // The pause button lives under `runtimeHUD`, not at the top level.
        snapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
        const pauseButton = snapshot.ui?.runtimeHUD?.pauseButton;
        if (!pauseButton?.active || !pauseButton?.screen) {
          throw new Error(`FAIL_PROBE_NAV_PAUSE_BUTTON: ${JSON.stringify(pauseButton)}`);
        }
        await tap(canvasRect.left + canvasRect.width * pauseButton.screen.x,
          canvasRect.top + canvasRect.height * pauseButton.screen.y);
        if (PAGE === 'settlement') {
          await sleep(400);
          snapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
          const settleBtn = snapshot.ui?.formalPages?.pauseSettle;
          if (!settleBtn?.active || !settleBtn?.screen) {
            throw new Error(`FAIL_PROBE_NAV_PAUSE_SETTLE: ${JSON.stringify(settleBtn)}`);
          }
          await tap(canvasRect.left + canvasRect.width * settleBtn.screen.x,
            canvasRect.top + canvasRect.height * settleBtn.screen.y);
          await sleep(900);
        }
      }
    } else if (PAGE === 'revive') {
      await tapUi('start');
      await waitState('MODE_SELECT');
      await tapUi('modeArena');
      await waitState('MODE_READY');
      const arenaStart = (snapshot.ui?.arenaReady || snapshot.ui?.endlessReady)?.start;
      if (!arenaStart?.active || !arenaStart?.screen) {
        throw new Error(`FAIL_PROBE_NAV_ARENA_START: ${JSON.stringify(arenaStart)}`);
      }
      await tap(canvasRect.left + canvasRect.width * arenaStart.screen.x,
        canvasRect.top + canvasRect.height * arenaStart.screen.y);
      await waitState('ARENA');
      await page.waitForFunction(
        () => window.__BHR_QA__.snapshot().gameState === 'REVIVING',
        undefined,
        { timeout: 120000 },
      );
    }
    await sleep(2500);

    const metrics = await page.evaluate(() => {
      const cc = window.cc;
      const v = cc.view;
      const canvas = cc.director.getScene()?.getChildByName('Canvas');
      const uiCamera = canvas?.children
        .map((child) => child.getComponent(cc.Camera))
        .find((camera) => camera && camera.name === 'UICamera');
      return {
        visibleSize: { w: v.getVisibleSize().width, h: v.getVisibleSize().height },
        frame: { w: v.getFrameSize().width, h: v.getFrameSize().height },
        viewScale: v.getScaleX(),
        uiCameraOrthoHeight: uiCamera ? uiCamera.orthoHeight : null,
      };
    });

    const result = await page.evaluate(eval(`(${COLLECT})`), PAGE_NODE);
    if (result.error) throw new Error(`FAIL_PAGE_GEOMETRY: ${JSON.stringify(result)}`);

    // A node as wide as the design space is a full-bleed backdrop: it is meant
    // to be cropped, and shifting it would tear a gap along the edge.
    const designFullBleed = 720;
    const fullBleed = [];
    const content = [];
    for (const node of result.nodes) {
      if (node.w >= designFullBleed - 1) fullBleed.push(node);
      else content.push(node);
    }

    const entry = {
      page: PAGE,
      pageNode: PAGE_NODE,
      viewport: `${size.width}x${size.height}`,
      label: size.label,
      aspect: +(size.height / size.width).toFixed(4),
      metrics,
      // Width of the design space that actually reaches the screen.
      usableDesignHalfWidth: +(result.cameraInfo.orthoHeight
        * (size.width / size.height)).toFixed(1),
      nodes: result.nodes,
      fullBleed: fullBleed.map((n) => n.name),
    };
    report.push(entry);

    const clipped = content.filter((n) => n.overflowLeft || n.overflowRight || n.overflowTop || n.overflowBottom);
    const tight = content.filter((n) => !clipped.includes(n) && (n.left < 8 || size.width - n.right < 8));
    console.log(`\n=== ${PAGE} @ ${entry.viewport} (${size.label}) aspect ${entry.aspect} ===`);
    console.log(`  UI camera orthoHeight ${result.cameraInfo.orthoHeight}`
      + `  => usable design half-width ${entry.usableDesignHalfWidth}`
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

writeFileSync(path.join(outDir, `${PAGE}_layout_geometry.json`),
  `${JSON.stringify(report, null, 2)}\n`);

const totals = report.flatMap((e) => e.nodes
  .filter((n) => n.w < 719 && (n.overflowLeft || n.overflowRight || n.overflowTop || n.overflowBottom))
  .map((n) => `${e.viewport} ${n.name} L${n.overflowLeft} R${n.overflowRight} T${n.overflowTop} B${n.overflowBottom}`));
console.log(`\n[${PAGE}] clipped content-node instances: ${totals.length}`);
totals.forEach((line) => console.log(`  ${line}`));
