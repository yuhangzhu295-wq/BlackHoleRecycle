/**
 * Boot-reachability closure for the WeChat package split.
 *
 * WHY THIS EXISTS
 * ---------------
 * The WP0 bundle map attributed assets to bundles by *source path pattern*
 * (e.g. `art/world/residential/` -> `endless`). That is not sufficient: in
 * Cocos a scene's serialized dependencies must already be resident before
 * `loadScene` runs, and the engine does not auto-load dependent bundles -- it
 * throws "Please load bundle X first". So an asset that the launch scene
 * references *directly* can never live in a subpackage, no matter which
 * directory it sits in.
 *
 * This script answers the only question that matters for a move:
 *   "is this asset reachable from the launch scene (or another boot-time
 *    entry point) through the reference graph?"
 *
 * Usage: node .scratch/boot-closure.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(REPO, 'cocos/assets');

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const TEXT_EXT = new Set(['.scene', '.prefab', '.json', '.mtl', '.anim', '.asset']);

/** uuid -> { source, kind } for every asset and sub-asset under cocos/assets. */
const uuidToSource = new Map();
/** source path -> [uuid] (the asset's own uuid plus every sub-asset uuid). */
const sourceToUuids = new Map();

function collectMeta(metaPath) {
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return;
  }
  const source = metaPath.replace(/\.meta$/, '');
  const own = [];
  if (typeof meta.uuid === 'string') own.push(meta.uuid);
  const subs = meta.subMetas && typeof meta.subMetas === 'object' ? meta.subMetas : {};
  for (const key of Object.keys(subs)) {
    const sub = subs[key];
    if (sub && typeof sub.uuid === 'string') own.push(sub.uuid);
  }
  if (own.length === 0) return;
  sourceToUuids.set(source, own);
  for (const uuid of own) if (!uuidToSource.has(uuid)) uuidToSource.set(uuid, { source, kind: path.extname(source) });
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(child);
    else if (entry.name.endsWith('.meta')) collectMeta(child);
  }
}
walk(ASSETS);

function uuidsIn(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const found = text.match(UUID_RE);
  return found ? Array.from(new Set(found)) : [];
}

/** Boot entry points: every scene, plus the authored world library prefab. */
const bootEntries = [];
const scenesDir = path.join(ASSETS, 'scenes');
for (const entry of fs.readdirSync(scenesDir, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.scene')) bootEntries.push(path.join(scenesDir, entry.name));
}

const closure = new Map(); // source -> depth
const queue = [];
for (const entry of bootEntries) {
  closure.set(entry, 0);
  queue.push([entry, 0]);
}

while (queue.length > 0) {
  const [file, depth] = queue.shift();
  if (depth > 24) continue;
  for (const uuid of uuidsIn(file)) {
    const hit = uuidToSource.get(uuid);
    if (!hit) continue;
    if (closure.has(hit.source)) continue;
    closure.set(hit.source, depth + 1);
    if (TEXT_EXT.has(path.extname(hit.source))) queue.push([hit.source, depth + 1]);
  }
}

const rel = (p) => path.relative(REPO, p).replace(/\\/g, '/');
const sizeOf = (p) => {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
};

/** Directory groups the WP0 bundle map proposed to move out of main. */
const GROUPS = [
  ['endless', ['cocos/assets/art/world/residential', 'cocos/assets/prefabs/chunks']],
  ['shared-gameplay/art-machines', ['cocos/assets/art/machines']],
  ['shared-gameplay/art-machine-modules', ['cocos/assets/art/machine-modules']],
  ['shared-gameplay/art-vehicles', ['cocos/assets/art/vehicles']],
  ['shared-gameplay/art-recyclables', ['cocos/assets/art/recyclables']],
  ['shared-gameplay/art-props', ['cocos/assets/art/props']],
  ['shared-gameplay/art-world', ['cocos/assets/art/world']],
  ['shared-gameplay/textures-ui', ['cocos/assets/textures/ui']],
  ['shared-gameplay/prefabs-art', ['cocos/assets/prefabs/art']],
  ['shared-gameplay/prefabs-machine', ['cocos/assets/prefabs/machine']],
  ['shared-gameplay/prefabs-objects', ['cocos/assets/prefabs/objects']],
  ['world-opening', ['cocos/assets/prefabs/world']],
];

const report = { bootEntries: bootEntries.map(rel), groups: [] };

for (const [name, roots] of GROUPS) {
  let totalBytes = 0;
  let bootBytes = 0;
  let freeBytes = 0;
  const bootFiles = [];
  const freeFiles = [];
  for (const root of roots) {
    const abs = path.join(REPO, root);
    if (!fs.existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length > 0) {
      const cur = stack.pop();
      const st = fs.statSync(cur);
      if (st.isDirectory()) {
        for (const e of fs.readdirSync(cur, { withFileTypes: true })) stack.push(path.join(cur, e.name));
        continue;
      }
      if (cur.endsWith('.meta')) continue;
      const bytes = st.size;
      totalBytes += bytes;
      if (closure.has(cur)) {
        bootBytes += bytes;
        bootFiles.push({ file: rel(cur), bytes, depth: closure.get(cur) });
      } else {
        freeBytes += bytes;
        freeFiles.push({ file: rel(cur), bytes });
      }
    }
  }
  report.groups.push({
    name,
    totalBytes,
    totalKB: Math.round(totalBytes / 1024),
    bootReferencedBytes: bootBytes,
    bootReferencedKB: Math.round(bootBytes / 1024),
    freeBytes,
    freeKB: Math.round(freeBytes / 1024),
    movable: bootBytes === 0 && totalBytes > 0,
    bootFiles: bootFiles.sort((a, b) => b.bytes - a.bytes),
    freeFiles: freeFiles.sort((a, b) => b.bytes - a.bytes),
  });
}

console.log(JSON.stringify(report, null, 2));
