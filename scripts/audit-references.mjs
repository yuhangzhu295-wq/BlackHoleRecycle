import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const textExtensions = new Set(['.ts', '.js', '.mjs', '.json', '.scene', '.prefab', '.meta', '.md', '.yaml', '.yml', '.txt']);
const ignoredDirs = new Set(['node_modules', '.git', 'library', 'temp', 'dist', 'build', 'artifacts']);

async function walk(dir, out = []) {
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) await walk(full, out);
      continue;
    }
    if (textExtensions.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function rel(file) { return path.relative(repoRoot, file).replaceAll('\\', '/'); }

const files = await walk(repoRoot);
const records = [];
for (const file of files) {
  let content;
  try { content = await fs.readFile(file, 'utf8'); } catch { continue; }
  const uuids = [...new Set(content.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) ?? [])];
  const imports = [...content.matchAll(/(?:from|import\s*\()\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const pathRefs = [...content.matchAll(/(?:assets|cocos|scripts|prefabs|scenes|outputs|docs)\/[A-Za-z0-9_./@-]+/g)].map((m) => m[0]);
  if (uuids.length || imports.length || pathRefs.length) records.push({ file: rel(file), uuids, imports, pathRefs: [...new Set(pathRefs)] });
}

const cache = [];
for (const dir of ['library', 'temp', 'profiles', 'settings']) {
  const dirFiles = files.filter((file) => rel(file) === dir || rel(file).startsWith(`${dir}/`));
  cache.push({ directory: dir, presentFiles: dirFiles.length, sample: dirFiles.slice(0, 5).map(rel) });
}
const candidates = files.map(rel).filter((item) => /(?:-001|-copy|-old|-test|-temp|-backup)(?:\.|\/|$)/i.test(item));
const report = {
  generatedAt: new Date().toISOString(),
  repository: repoRoot,
  scannedFiles: files.length,
  records,
  trackedCreatorState: cache,
  duplicateNamedCandidates: candidates,
  notes: [
    'This report is read-only and does not infer deletion safety from filenames.',
    'Scene/prefab UUID references require Creator-aware review before deleting assets.',
  ],
};

const output = path.join(repoRoot, 'artifacts', 'qa', 'reference-audit.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: rel(output), scannedFiles: files.length, trackedCreatorState: cache, duplicateNamedCandidates: candidates.length }, null, 2));
