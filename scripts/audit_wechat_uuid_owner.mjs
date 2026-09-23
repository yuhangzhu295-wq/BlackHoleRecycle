/**
 * Where does a given asset uuid actually live in the built WeChat package?
 *
 * Cocos stores uuids in built configs in a COMPRESSED base64 form, so grepping
 * the built tree for the raw uuid always returns 0 hits and proves nothing.
 * This script decodes every bundle's uuid list and reports the owning bundle.
 *
 * Usage: node .scratch/where-uuid.mjs <raw-uuid> [<raw-uuid> ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(REPO, 'cocos/build/wechatgame');

const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_VALUES = new Array(123).fill(0);
for (let i = 0; i < BASE64_KEYS.length; i += 1) BASE64_VALUES[BASE64_KEYS.charCodeAt(i)] = i;

/** Mirrors the engine's `decodeUuid` for a 22-char compressed uuid. */
function decodeUuid(base64) {
  const at = base64.indexOf('@');
  const head = at === -1 ? base64 : base64.slice(0, at);
  if (head.length !== 22) return base64;
  const out = [];
  for (let i = 2; i < 22; i += 2) {
    const lhs = BASE64_VALUES[head.charCodeAt(i)];
    const rhs = BASE64_VALUES[head.charCodeAt(i + 1)];
    out.push((lhs >> 2).toString(16));
    out.push((((lhs & 3) << 2) | (rhs >> 4)).toString(16));
    out.push((rhs & 15).toString(16));
  }
  const hex = out.join('');
  const dashed = `${head.slice(0, 2)}${hex.slice(0, 6)}-${hex.slice(6, 10)}-${hex.slice(10, 14)}-${hex.slice(14, 18)}-${hex.slice(18, 30)}`;
  return at === -1 ? dashed : `${dashed}${base64.slice(at)}`;
}

/** bundle directory -> Set of raw uuids it owns */
const ownership = new Map();
const bundleDirs = [];

function consider(dir, label) {
  const cfg = path.join(dir, 'config.json');
  if (!fs.existsSync(cfg)) return;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  } catch {
    return;
  }
  const raw = new Set();
  const list = Array.isArray(parsed.uuids) ? parsed.uuids : [];
  for (const entry of list) raw.add(decodeUuid(entry));
  ownership.set(label, raw);
  bundleDirs.push({ label, dir, uuidCount: raw.size, deps: parsed.deps ?? [] });
}

consider(path.join(BUILD, 'assets/main'), 'assets/main');
consider(path.join(BUILD, 'assets/internal'), 'assets/internal');
consider(path.join(BUILD, 'assets/resources'), 'assets/resources');
const subRoot = path.join(BUILD, 'subpackages');
if (fs.existsSync(subRoot)) {
  for (const entry of fs.readdirSync(subRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) consider(path.join(subRoot, entry.name), `subpackages/${entry.name}`);
  }
}

const targets = process.argv.slice(2);
const result = { bundles: bundleDirs, queries: [] };

for (const uuid of targets) {
  const owners = [];
  for (const [label, set] of ownership) if (set.has(uuid)) owners.push(label);
  // Also search the whole built tree for the compressed form, in case it is
  // embedded somewhere other than a bundle uuid list (e.g. inside a prefab).
  const compressed = compressForSearch(uuid);
  const embedded = [];
  if (compressed) {
    const stack = [BUILD];
    while (stack.length > 0) {
      const cur = stack.pop();
      for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
        const child = path.join(cur, e.name);
        if (e.isDirectory()) stack.push(child);
        else if (e.name.endsWith('.json') || e.name.endsWith('.js')) {
          const text = fs.readFileSync(child, 'utf8');
          if (text.includes(compressed)) embedded.push(path.relative(BUILD, child).replace(/\\/g, '/'));
        }
      }
    }
  }
  result.queries.push({ uuid, compressedForm: compressed, owningBundles: owners, embeddedIn: embedded });
}

/** Best-effort inverse of decodeUuid, used only for a text search. */
function compressForSearch(uuid) {
  const at = uuid.indexOf('@');
  const head = at === -1 ? uuid : uuid.slice(0, at);
  const hex = head.replace(/-/g, '');
  if (hex.length !== 32) return null;
  const body = hex.slice(2);
  let out = head.slice(0, 2);
  for (let i = 0; i < 30; i += 3) {
    const a = parseInt(body[i], 16);
    const b = parseInt(body[i + 1], 16);
    const c = parseInt(body[i + 2], 16);
    out += BASE64_KEYS[(a << 2) | (b >> 2)];
    out += BASE64_KEYS[((b & 3) << 4) | c];
  }
  return out;
}

console.log(JSON.stringify(result, null, 2));
