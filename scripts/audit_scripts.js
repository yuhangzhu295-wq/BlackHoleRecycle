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
console.log(`Found ${tsFiles.length} TypeScript files:`);

const classMap = new Map();

for (const file of tsFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(scriptsDir, file);
  
  // Find @ccclass
  const matches = content.match(/@ccclass\(['"]?([^'")]+)?['"]?\)/g);
  if (matches) {
    console.log(`[${rel}] ccclass matches:`, matches);
    for (const m of matches) {
      const nameMatch = m.match(/@ccclass\(['"]([^'"]+)['"]\)/);
      const name = nameMatch ? nameMatch[1] : 'anonymous';
      if (classMap.has(name)) {
        console.error(`❌ DUPLICATE @ccclass('${name}') found in ${rel} and ${classMap.get(name)}`);
      } else {
        classMap.set(name, rel);
      }
    }
  } else {
    console.log(`[${rel}] (No @ccclass - utility or service)`);
  }
}
