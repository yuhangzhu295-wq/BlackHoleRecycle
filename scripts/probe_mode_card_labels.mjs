/**
 * Read the Mode Select card labels' live geometry.
 *
 * Written because the first two attempts at placing them were argued from the
 * scene's serialized values, and those are not what renders: `MODE_SELECT_LAYOUT`
 * and `fitToVisibleDesignSpace` rewrite the cards at runtime, and whether they do
 * that by contentSize or by node scale decides whether a child Label inherits the
 * shrink or has to apply it itself. Two wrong answers in a row is the point at
 * which reading the live tree beats reasoning about it.
 *
 * Usage: node scripts/probe_mode_card_labels.mjs [WxH]
 */
import { launchBrowser, navigateToPage, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

const sizeArg = process.argv[2] && /^\d+x\d+$/.test(process.argv[2]) ? process.argv[2] : '390x844';
const [width, height] = sizeArg.split('x').map(Number);

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();
try {
  const { context, page, cdp, canvasRect } = await openPage(browser, port, { width, height });
  await navigateToPage(page, cdp, canvasRect, 'mode');
  await sleep(1500);

  const report = await page.evaluate(() => {
    const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
    const find = (root, name) => {
      if (root.name === name) return root;
      for (const child of root.children) {
        const hit = find(child, name);
        if (hit) return hit;
      }
      return null;
    };
    const describe = (node) => {
      if (!node) return null;
      const transform = node.getComponent('cc.UITransform');
      const label = node.getComponent('cc.Label');
      const world = node.worldPosition;
      const worldScale = node.worldScale;
      return {
        name: node.name,
        active: node.activeInHierarchy,
        contentSize: transform ? `${Math.round(transform.width)}x${Math.round(transform.height)}` : null,
        anchor: transform ? `${transform.anchorX},${transform.anchorY}` : null,
        local: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
        world: world ? { x: Math.round(world.x), y: Math.round(world.y) } : null,
        worldScale: worldScale ? Number(worldScale.x.toFixed(3)) : null,
        text: label ? label.string : null,
        fontSize: label ? label.fontSize : null,
        lineHeight: label ? label.lineHeight : null,
      };
    };
    return {
      BtnArena: describe(find(scene, 'BtnArena')),
      BtnEndless: describe(find(scene, 'BtnEndless')),
      ArenaCardTitle: describe(find(scene, 'ArenaCardTitle')),
      ArenaCardSubtitle: describe(find(scene, 'ArenaCardSubtitle')),
      ArenaCardCallout: describe(find(scene, 'ArenaCardCallout')),
      EndlessCardTitle: describe(find(scene, 'EndlessCardTitle')),
      ArenaAvailability: describe(find(scene, 'ArenaAvailability')),
      ArenaAvailabilityLabel: describe(find(scene, 'ArenaAvailabilityLabel')),
      EndlessBestCaption: describe(find(scene, 'EndlessBestCaption')),
    };
  });

  for (const [name, info] of Object.entries(report)) {
    if (!info) { console.log(`${name}: ABSENT`); continue; }
    console.log(`${name.padEnd(24)} ${info.active ? 'ON ' : 'off'} contentSize=${info.contentSize} `
      + `anchor=${info.anchor} local=(${info.local.x},${info.local.y}) world=(${info.world.x},${info.world.y}) `
      + `worldScale=${info.worldScale} font=${info.fontSize ?? '-'} lh=${info.lineHeight ?? '-'} `
      + (info.text ? `text=${JSON.stringify(info.text)}` : ''));
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
