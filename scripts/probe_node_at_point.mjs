/**
 * Report every UI node whose projected centre lands near a given screen point.
 *
 * Written to identify an unexplained dark oval on the Home page: it was not a
 * Canvas-level sprite and eyeballing the hierarchy did not find it, so this asks
 * the runtime which nodes actually project to that spot. Guessing at a stray
 * pixel is how a wrong fix gets shipped.
 *
 * Usage: node scripts/probe_node_at_point.mjs --nx=0.91 --ny=0.184 [--tolerance=0.12]
 */
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const TARGET_X = Number(argOf('nx', '0.91'));
const TARGET_Y = Number(argOf('ny', '0.184'));
const TOLERANCE = Number(argOf('tolerance', '0.12'));
const SIZE = { width: 390, height: 844 };

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();
try {
  const { page } = await openPage(browser, port, SIZE);
  await sleep(1500);

  const hits = await page.evaluate(({ targetX, targetY, tolerance }) => {
    const cc = window.cc;
    const canvas = cc.director.getScene()?.getChildByName('Canvas');
    const cameras = cc.director.getScene().getComponentsInChildren(cc.Camera);
    // The UI camera is not a plain child of Canvas in this build; look it up the
    // same way the geometry probe does.
    const uiCamera = (canvas.getComponent(cc.Canvas)?.cameraComponent)
      || cameras.find((camera) => camera.node.name === 'UICamera')
      || cameras.find((camera) => camera.node.getComponent('cc.UITransform'));
    if (!uiCamera) return [{ error: 'no UI camera', cameras: cameras.map((c) => c.node.name) }];

    const frame = cc.view.getFrameSize();
    const found = [];
    const walk = (node, path) => {
      const transform = node.getComponent('cc.UITransform');
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
          return { x: screen.x / frame.width, y: 1 - screen.y / frame.height };
        });
        const minX = Math.min(...corners.map((c) => c.x));
        const maxX = Math.max(...corners.map((c) => c.x));
        const minY = Math.min(...corners.map((c) => c.y));
        const maxY = Math.max(...corners.map((c) => c.y));
        const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
        const contains = targetX >= minX && targetX <= maxX && targetY >= minY && targetY <= maxY;
        if (contains || (Math.abs(centre.x - targetX) < tolerance && Math.abs(centre.y - targetY) < tolerance)) {
          const sprite = node.getComponent('cc.Sprite');
          found.push({
            path: `${path}/${node.name}`,
            contains,
            centre: `${centre.x.toFixed(3)},${centre.y.toFixed(3)}`,
            rect: `${minX.toFixed(3)}..${maxX.toFixed(3)} x ${minY.toFixed(3)}..${maxY.toFixed(3)}`,
            size: `${transform.width.toFixed(0)}x${transform.height.toFixed(0)}`,
            spriteFrame: sprite ? (sprite.spriteFrame?.name ?? null) : null,
            hasSprite: Boolean(sprite),
          });
        }
      }
      node.children.forEach((child) => walk(child, `${path}/${node.name}`));
    };
    walk(canvas, '');
    return found;
  }, { targetX: TARGET_X, targetY: TARGET_Y, tolerance: TOLERANCE });

  console.log(`nodes projecting near (${TARGET_X}, ${TARGET_Y}) +/-${TOLERANCE}:`);
  for (const hit of hits) console.log(' ', JSON.stringify(hit));
} finally {
  await browser.close();
  server.close();
}
