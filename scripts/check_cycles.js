import fs from 'fs';
import path from 'path';

const scriptsDir = path.resolve('./cocos/assets/scripts');

function scanDir(dir) {
  const list = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      list.push(...scanDir(full));
    } else if (item.endsWith('.ts')) {
      list.push(full);
    }
  }
  return list;
}

const tsFiles = scanDir(scriptsDir);
const graph = new Map();

for (const file of tsFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(scriptsDir, file).replace(/\\/g, '/');
  const imports = [];

  const lines = content.split('\n');
  for (const line of lines) {
    const m = line.match(/from\s+['"]([^'"]+)['"]/);
    if (m && m[1].startsWith('.')) {
      const targetPath = path.normalize(path.join(path.dirname(file), m[1]));
      let targetRel = path.relative(scriptsDir, targetPath).replace(/\\/g, '/');
      if (!targetRel.endsWith('.ts')) targetRel += '.ts';
      imports.push(targetRel);
    }
  }
  graph.set(rel, imports);
}

console.log('--- Dependency Graph ---');
for (const [file, deps] of graph.entries()) {
  console.log(`${file} -> [${deps.join(', ')}]`);
}

// Detect cycles
function findCycle(node, visited = new Set(), pathList = []) {
  if (pathList.includes(node)) {
    const cycle = pathList.slice(pathList.indexOf(node)).concat(node);
    console.error('❌ Circular dependency detected:', cycle.join(' -> '));
    return true;
  }
  if (visited.has(node)) return false;
  visited.add(node);
  pathList.push(node);

  const neighbors = graph.get(node) || [];
  for (const n of neighbors) {
    if (findCycle(n, visited, [...pathList])) return true;
  }
  return false;
}

let hasCycle = false;
for (const node of graph.keys()) {
  if (findCycle(node)) {
    hasCycle = true;
    break;
  }
}

if (!hasCycle) {
  console.log('✅ ZERO circular dependencies detected!');
}
