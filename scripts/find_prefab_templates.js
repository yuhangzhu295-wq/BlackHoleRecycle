import fs from 'fs';
import path from 'path';

function findPrefabTemplates() {
  const root = 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\resources';
  const found = [];

  function walk(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            if (!item.startsWith('.') && item !== 'node_modules') {
              walk(full);
            }
          } else if (item.endsWith('.prefab')) {
            found.push(full);
          }
        } catch {}
      }
    } catch {}
  }

  walk(root);
  console.log('Found prefab templates:', found);
}

findPrefabTemplates();
