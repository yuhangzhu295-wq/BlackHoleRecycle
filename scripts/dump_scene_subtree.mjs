/**
 * Dump the serialized subtree of a named node in a Cocos scene.
 *
 * The runtime probe (`probe_scene_tree.mjs`) answers "what is on screen", but
 * authoring a change needs the serialized shape: which node holds which
 * component, the `__id__` of each, and the exact position/size/anchor fields to
 * edit. Reading a 1 MB scene by eye is not viable, so this prints one node per
 * line with the fields an edit actually touches.
 *
 * Usage: node scripts/dump_scene_subtree.mjs <scenePath> <rootNodeName> [depth]
 */
import { readFileSync } from 'node:fs';

const scenePath = process.argv[2];
const rootName = process.argv[3];
const maxDepth = Number(process.argv[4] || 3);
if (!scenePath || !rootName) {
  console.error('usage: node scripts/dump_scene_subtree.mjs <scenePath> <rootNodeName> [depth]');
  process.exit(1);
}

const doc = JSON.parse(readFileSync(scenePath, 'utf8'));

const node = (id) => doc[id];
const typeName = (entry) => (entry?.__type__ || '?');

/** Every component's `__type__`, so a line says what the node actually carries. */
const componentsOf = (entry) => (entry._components || [])
  .map((ref) => typeName(node(ref.__id__)))
  .filter((name) => name !== 'cc.PrefabInfo');

const findByName = (name) => {
  for (let i = 0; i < doc.length; i += 1) {
    const entry = doc[i];
    if (entry && entry.__type__ === 'cc.Node' && entry._name === name) return i;
  }
  return -1;
};

const round = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);

const walk = (id, depth) => {
  const entry = node(id);
  if (!entry) return;
  const transform = (entry._components || [])
    .map((ref) => node(ref.__id__))
    .find((comp) => comp && comp.__type__ === 'cc.UITransform');
  const label = (entry._components || [])
    .map((ref) => node(ref.__id__))
    .find((comp) => comp && comp.__type__ === 'cc.Label');
  const sprite = (entry._components || [])
    .map((ref) => node(ref.__id__))
    .find((comp) => comp && comp.__type__ === 'cc.Sprite');

  const parts = [
    `#${id}`,
    '  '.repeat(depth) + entry._name,
    entry._active === false ? 'OFF' : 'ON',
  ];
  if (transform) {
    parts.push(`size=${round(transform._contentSize?.width)}x${round(transform._contentSize?.height)}`);
    parts.push(`anchor=${round(transform._anchorPoint?.x)},${round(transform._anchorPoint?.y)}`);
  }
  parts.push(`pos=${round(entry._lpos?.x)},${round(entry._lpos?.y)}`);
  parts.push(`layer=${entry._layer}`);
  parts.push(`comps=[${componentsOf(entry).join(',')}]`);
  if (label) parts.push(`label=${JSON.stringify(label._string)} size=${label._fontSize}`);
  if (sprite) {
    parts.push(`spriteFrame=${sprite._spriteFrame?.__uuid__ || 'none'} type=${sprite._type} sizeMode=${sprite._sizeMode}`);
    if (sprite._color) {
      parts.push(`color=${sprite._color.r},${sprite._color.g},${sprite._color.b},${sprite._color.a}`);
    }
  }
  console.log(parts.join(' '));

  if (depth >= maxDepth) return;
  for (const child of entry._children || []) walk(child.__id__, depth + 1);
};

const rootId = findByName(rootName);
if (rootId < 0) {
  console.error(`[dump] node "${rootName}" not found in ${scenePath}`);
  process.exit(1);
}
console.log(`[dump] ${scenePath} :: ${rootName} (id ${rootId}), depth<=${maxDepth}`);
walk(rootId, 0);
