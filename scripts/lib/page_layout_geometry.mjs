/**
 * Shared machinery for projecting a Cocos page's nodes to screen pixels.
 *
 * Used by both `probe_page_layout_geometry.mjs` (a diagnostic that prints the
 * numbers) and `verify_page_layout_geometry.mjs` (the gate that fails on them).
 * They must agree on how a page is reached and measured, or the gate would be
 * checking something the probe never showed.
 *
 * ## Why the UI camera, not `view.getVisibleSize()`
 *
 * The portrait contract asks `view.setDesignResolutionSize` for FIXED_WIDTH, and
 * `view.getVisibleSize()` duly reports 720 x 1558 at 390x844. The UI is not laid
 * out in that space: `UICamera` is orthographic with `orthoHeight = 640`
 * (= designHeight / 2), so the UI scales to the design HEIGHT and only
 * `1280 / aspect` design units reach the screen -- about 592 at 390x844, not
 * 720. A layout table authored against 720 therefore looks correct in code and
 * sits off the edge on a real phone.
 *
 * Screenshots cannot settle it either: they carry no design->pixel scale, and a
 * backdrop with its own dark outlines (Home's cubes) merges with UI outlines
 * under any pixel scan.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

/** Canvas child that owns each page's layout. */
export const PAGES = {
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
 * The real devices this product ships to, plus the 16:9 reference. 412x915 is
 * the tightest horizontal case (20:9) and is the default for the slow,
 * match-driven pages.
 */
export const ALL_SIZES = [
  { width: 360, height: 780, label: 'android-small-20:9' },
  { width: 375, height: 667, label: 'iphone-se-16:9' },
  { width: 390, height: 844, label: 'iphone-14' },
  { width: 412, height: 915, label: 'pixel-20:9' },
  { width: 430, height: 932, label: 'iphone-max' },
];

/** A node as wide as the design space is a full-bleed backdrop: meant to be cropped. */
export const DESIGN_FULL_BLEED = 720;

/** Content is expected to keep at least this much margin, in screen px. */
export const MIN_MARGIN_PX = 8;

export function serve(root) {
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

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
  });
}

/** Boot the build at one viewport and settle on Home. */
export async function openPage(browser, port, size) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
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
  return { context, page, cdp, canvasRect };
}

/**
 * Drive the real flow to `pageKey`. These pages cannot be reached without
 * playing the game: the overlay pages only exist after a match starts, and the
 * revive page only after a real defeat.
 */
export async function navigateToPage(page, cdp, canvasRect, pageKey) {
  const snapshotOf = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  let snapshot = await snapshotOf();

  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(600);
    snapshot = await snapshotOf();
  };
  const tapPoint = async (node, name) => {
    if (!node?.active || !node?.screen) {
      throw new Error(`FAIL_NAV_${name}: ${JSON.stringify(node)}`);
    }
    await tap(canvasRect.left + canvasRect.width * node.screen.x,
      canvasRect.top + canvasRect.height * node.screen.y);
  };
  const tapUi = (key) => tapPoint(snapshot.ui?.[key], key);
  const waitState = (state, ms = 12000) => page.waitForFunction(
    (want) => window.__BHR_QA__.snapshot().gameState === want, state, { timeout: ms });

  if (pageKey === 'home') return;

  if (pageKey === 'machine' || pageKey === 'skin' || pageKey === 'mode') {
    await tapUi(pageKey);
  } else if (pageKey === 'ready' || pageKey === 'pause' || pageKey === 'settlement') {
    await tapUi('start');
    await waitState('MODE_SELECT');
    await tapUi('modeEndless');
    await waitState('MODE_READY');
    if (pageKey !== 'ready') {
      // `ui.endlessReady` is a composite; the tappable node is its `start` child.
      await tapPoint(snapshot.ui?.endlessReady?.start, 'endlessReady.start');
      await waitState('PLAYING');
      await sleep(1200);
      // The pause button lives under `runtimeHUD`, not at the top level.
      snapshot = await snapshotOf();
      await tapPoint(snapshot.ui?.runtimeHUD?.pauseButton, 'runtimeHUD.pauseButton');
      if (pageKey === 'settlement') {
        await sleep(400);
        snapshot = await snapshotOf();
        await tapPoint(snapshot.ui?.formalPages?.pauseSettle, 'formalPages.pauseSettle');
        await sleep(900);
      }
    }
  } else if (pageKey === 'revive') {
    await tapUi('start');
    await waitState('MODE_SELECT');
    await tapUi('modeArena');
    await waitState('MODE_READY');
    await tapPoint((snapshot.ui?.arenaReady || snapshot.ui?.endlessReady)?.start, 'arenaReady.start');
    await waitState('ARENA');
    await page.waitForFunction(
      () => window.__BHR_QA__.snapshot().gameState === 'REVIVING',
      undefined,
      { timeout: 120000 },
    );
  } else {
    throw new Error(`unknown page: ${pageKey}`);
  }
}

export async function readMetrics(page) {
  return page.evaluate(() => {
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
}

/**
 * Screen-space rect of every active node under `pageNode`, computed in the page.
 * Corners are projected so anchor, scale and ancestor transforms are all
 * accounted for without assuming any of them.
 */
export async function collectGeometry(page, pageNode) {
  return page.evaluate((pageName) => {
    const cc = window.cc;
    const canvas = cc.director.getScene()?.getChildByName('Canvas');
    const root = canvas?.getChildByName(pageName);
    if (!root) return { error: 'missing page ' + pageName, children: canvas?.children.map((c) => c.name) };

    const frame = cc.view.getFrameSize();
    const allCameras = cc.director.getScene().getComponentsInChildren(cc.Camera);
    const uiCamera = (canvas.getComponent(cc.Canvas)?.cameraComponent)
      || allCameras.find((c) => c.node.name === 'UICamera')
      || allCameras.find((c) => c.node.getComponent('cc.UITransform'));
    if (!uiCamera) return { error: 'no UICamera', cameras: allCameras.map((c) => c.node.name) };

    // cc.UITransform is not on the runtime namespace in this build, so the
    // component is resolved by name; a silent null here once produced an empty
    // node list that read as "nothing overflows".
    const transformOf = (node) => node.getComponent('cc.UITransform') || null;
    const nodes = [];
    const walk = (node) => {
      const transform = transformOf(node);
      if (transform && node.activeInHierarchy) {
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
    return {
      nodes,
      cameraInfo: {
        name: uiCamera.node.name,
        projection: uiCamera.projection,
        orthoHeight: uiCamera.orthoHeight,
      },
    };
  }, pageNode);
}

/**
 * Nodes whose node box overflows the frame while their *visible pixels* do not,
 * because the texture carries transparent padding.
 *
 * These are allowances, not exemptions: each entry records the measurement that
 * justifies it and the gate still asserts on the opaque rectangle, so the claim
 * can be re-derived rather than taken on trust. Do not add an entry without
 * measuring the texture's opaque bounds the same way.
 *
 * `home_logo.png` is 600x180 and its opaque pixels span x 183..532 (350 wide,
 * 58% of the texture; left pad 183, right pad 67). The Logo node is sized to the
 * full 600x180 texture, so at 412x915 the node box overflows by 8.5 screen px
 * per side while the visible wordmark spans only 122..372 px, i.e. it keeps
 * ~130 px on the left and ~40 px on the right.
 */
export const TRANSPARENT_PADDING = {
  home: {
    Logo: { opaqueLeftFraction: 183 / 600, opaqueRightFraction: 532 / 600 },
  },
};

/**
 * Replace a node's rect with the rect of its opaque pixels when the texture is
 * known to carry transparent padding; otherwise return the node unchanged.
 */
export function withVisibleBounds(pageKey, node, frameWidth) {
  const pad = TRANSPARENT_PADDING[pageKey]?.[node.name];
  if (!pad) return node;
  const span = node.right - node.left;
  const left = +(node.left + span * pad.opaqueLeftFraction).toFixed(1);
  const right = +(node.left + span * pad.opaqueRightFraction).toFixed(1);
  return {
    ...node,
    left,
    right,
    name: `${node.name}[opaque]`,
    // The overflow has to be recomputed against the opaque rect, or the gate
    // would keep failing on padding that is not drawn.
    overflowLeft: +Math.max(0, -left).toFixed(1),
    overflowRight: +Math.max(0, right - frameWidth).toFixed(1),
  };
}

/** Map a page's content nodes through the transparent-padding allowances. */
export function visibleContent(pageKey, content, frameWidth) {
  return content.map((node) => withVisibleBounds(pageKey, node, frameWidth));
}

/** Split a page's nodes into clippable content and full-bleed backdrops. */
export function splitContent(nodes) {
  const fullBleed = [];
  const content = [];
  for (const node of nodes) {
    if (node.w >= DESIGN_FULL_BLEED - 1) fullBleed.push(node);
    else content.push(node);
  }
  return { content, fullBleed };
}

export const isClipped = (node) => Boolean(
  node.overflowLeft || node.overflowRight || node.overflowTop || node.overflowBottom,
);

export const isTight = (node, viewportWidth) => !isClipped(node)
  && (node.left < MIN_MARGIN_PX || viewportWidth - node.right < MIN_MARGIN_PX);
