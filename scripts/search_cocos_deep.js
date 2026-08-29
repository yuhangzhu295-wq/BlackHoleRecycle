import fs from 'fs';
import path from 'path';
import os from 'os';

function search() {
  const dirs = [
    'C:\\ProgramData\\Cocos',
    'C:\\ProgramData\\CocosCreator',
    'C:\\ProgramData\\CocosDashboard',
    'C:\\Users\\zyu33\\AppData\\Local\\CocosDashboard',
    'C:\\Users\\zyu33\\AppData\\Local\\cocos-creator',
    'C:\\Users\\zyu33\\AppData\\Roaming\\CocosDashboard',
    'C:\\Users\\zyu33\\.CocosCreator',
    'C:\\Program Files\\Cocos',
    'C:\\Program Files\\CocosCreator',
    'C:\\Program Files (x86)\\Cocos',
    'D:\\',
    'E:\\'
  ];

  for (const d of dirs) {
    if (fs.existsSync(d)) {
      try {
        const sub = fs.readdirSync(d);
        console.log(`[EXISTS] ${d}:`, sub.slice(0, 15));
      } catch (e) {
        console.log(`[ERR] ${d}:`, e.message);
      }
    }
  }
}

search();
