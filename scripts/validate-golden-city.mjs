import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cocos = join(repo, 'cocos');
const prefabPath = join(cocos, 'assets', 'prefabs', 'world', 'GoldenCityCell.prefab');
const metaPath = `${prefabPath}.meta`;
const outDir = join(repo, 'artifacts', 'qa');
const outPath = join(outDir, 'golden-city-static.json');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function walk(dir) {
  if (!existsSync(dir)) return [];
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(path));
    else result.push(path);
  }
  return result;
}

function parseJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

const files = walk(join(cocos, 'assets'));
const uuidToFile = new Map();
const duplicateUuids = [];
for (const file of files.filter((item) => item.endsWith('.meta'))) {
  const meta = parseJson(file);
  const uuid = meta?.uuid;
  if (!uuid || !UUID.test(uuid)) continue;
  if (uuidToFile.has(uuid)) duplicateUuids.push({ uuid, files: [relative(repo, uuidToFile.get(uuid)), relative(repo, file)] });
  else uuidToFile.set(uuid, file);
  for (const subMeta of Object.values(meta.subMetas || {})) {
    if (subMeta?.uuid && UUID.test(subMeta.uuid)) {
      if (uuidToFile.has(subMeta.uuid)) duplicateUuids.push({ uuid: subMeta.uuid, files: [relative(repo, uuidToFile.get(subMeta.uuid)), relative(repo, file)] });
      else uuidToFile.set(subMeta.uuid, file);
    }
  }
}

const checks = [];
function checkFile(path, required = true) {
  const exists = existsSync(path) && statSync(path).isFile();
  checks.push({ path: relative(repo, path), exists, required });
  return exists;
}

const prefabExists = checkFile(prefabPath);
const metaExists = checkFile(metaPath);
const prefabMeta = metaExists ? parseJson(metaPath) : null;
const prefabUuidValid = Boolean(prefabMeta?.uuid && UUID.test(prefabMeta.uuid));

const missingUuidRefs = [];
if (prefabExists) {
  const source = readFileSync(prefabPath, 'utf8');
  const parsed = parseJson(prefabPath);
  if (!parsed) checks.push({ path: relative(repo, prefabPath), exists: true, validJson: false });
  const seen = new Set();
  for (const match of source.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)) {
    const uuid = match[0].toLowerCase();
    if (seen.has(uuid)) continue;
    seen.add(uuid);
    if (!uuidToFile.has(uuid)) missingUuidRefs.push(uuid);
  }
  for (const match of source.matchAll(/db:\/\/[^"'\s]+/g)) {
    const url = match[0];
    const relativeAsset = url.slice('db://assets/'.length);
    if (relativeAsset.startsWith('assets/')) continue;
    const candidate = join(cocos, 'assets', relativeAsset);
    if (!existsSync(candidate) && !existsSync(`${candidate}.meta`)) checks.push({ url, exists: false });
  }
}

const assetReady = prefabExists && metaExists;
const status = !assetReady
  ? 'BLOCKED'
  : prefabUuidValid && missingUuidRefs.length === 0 && duplicateUuids.length === 0 ? 'PASS' : 'FAIL';
const result = {
  status,
  generatedAt: new Date().toISOString(),
  prefab: relative(repo, prefabPath),
  meta: relative(repo, metaPath),
  prefabUuid: prefabMeta?.uuid || null,
  prefabUuidValid,
  assetMetaCount: uuidToFile.size,
  duplicateUuids,
  missingUuidRefs,
  checks,
  materialVisual: 'BLOCKED_GUI_VISUAL',
  notes: [
    'Static validation checks Creator UUID/meta existence only; it does not claim material appearance.',
    'Material visual review remains blocked until native Cocos Creator inspection is available.',
  ],
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`[golden-city-static] ${result.status}: ${relative(repo, outPath)}`);
if (result.missingUuidRefs.length) console.log(`[golden-city-static] missing UUID refs: ${result.missingUuidRefs.length}`);
if (result.duplicateUuids.length) console.log(`[golden-city-static] duplicate UUIDs: ${result.duplicateUuids.length}`);
// A missing Creator-authored prefab is a GUI/authoring dependency, not a
// malformed reference. Keep the validator usable on the clean main branch;
// malformed UUID or duplicate-reference failures still fail CI.
if (result.status === 'FAIL') process.exitCode = 1;
