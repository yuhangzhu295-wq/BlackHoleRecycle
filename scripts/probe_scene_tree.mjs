/**
 * Dump the live node tree of the current page.
 *
 * Written because a page capture showed a large "黑洞回收站" on the Ready page and
 * no amount of reading Game.scene explained where it came from: the only label
 * with that string belongs to HomePage, and the only sprite using the brand
 * texture also belongs to HomePage. The reliable answer is the runtime tree, not
 * the serialized one.
 *
 * Usage: node scripts/probe_scene_tree.mjs <pageKey> [WxH] [nameFilter]
 */
import { PAGES, launchBrowser, navigateToPage, openPage, serve } from './lib/page_layout_geometry.mjs';

const pageKey = process.argv[2];
if (!pageKey || !PAGES[pageKey]) {
  console.error('usage: node scripts/probe_scene_tree.mjs <' + Object.keys(PAGES).join('|') + '> [WxH] [nameFilter]');
  process.exit(1);
}
const [width, height] = (process.argv[3] || '390x844').split('x').map(Number);
const filter = process.argv[4] || '';

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();
try {
  const { context, page, cdp, canvasRect } = await openPage(browser, port, { width, height });
  await navigateToPage(page, cdp, canvasRect, pageKey);

  const tree = await page.evaluate((needle) => {
    const engine = globalThis.cc || globalThis.__cc__ || null;
    const scene = engine?.director?.getScene?.() || null;
    if (!scene) {
      return { error: 'no engine global', candidates: Object.keys(globalThis).filter((k) => /cc|cocos|engine/i.test(k)).slice(0, 20) };
    }
    const lines = [];
    const walk = (node, depth) => {
      // Component lookups by name string, not by `cc.X`: the web build does not
      // put UITransform/Label/Sprite on the global `cc` namespace, so looking
      // them up that way silently returned null and the dump printed no sizes.
      const transform = node.getComponent?.('cc.UITransform') || null;
      const active = node.activeInHierarchy;
      const label = node.getComponent?.('cc.Label') || null;
      const sprite = node.getComponent?.('cc.Sprite') || null;
      const world = node.worldPosition || null;
      const size = transform ? `${Math.round(transform.width)}x${Math.round(transform.height)}` : '';
      const at = world ? `@w(${Math.round(world.x)},${Math.round(world.y)})` : '';
      const extra = label ? ` label=${JSON.stringify(label.string)}` : sprite ? ` sprite=${sprite.spriteFrame?.name || 'none'}` : '';
      const line = `${'  '.repeat(depth)}${node.name} ${active ? 'ON' : 'off'} ${size}${at}${extra}`;
      if (!needle || line.toLowerCase().includes(needle.toLowerCase()) || depth <= 2) lines.push(line);
      for (const child of node.children) walk(child, depth + 1);
    };
    walk(scene, 0);
    return { lines };
  }, filter);

  if (tree.error) {
    console.log('PROBE_ERROR', JSON.stringify(tree));
  } else {
    for (const line of tree.lines) console.log(line);
    console.log(`[tree] ${tree.lines.length} lines`);
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
