import fs from 'fs';
import path from 'path';
import os from 'os';

function findCocos() {
  const candidateDirs = [
    'C:\\Program Files\\Cocos',
    'C:\\Program Files\\CocosCreator',
    'C:\\Program Files\\CocosDashboard',
    'C:\\Program Files (x86)\\Cocos',
    'D:\\Cocos',
    'D:\\Program Files\\Cocos',
    'D:\\Program Files\\CocosDashboard',
    'E:\\Cocos',
    path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
    path.join(os.homedir(), 'AppData', 'Local', 'CocosDashboard'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'CocosCreator'),
    path.join(os.homedir(), 'AppData', 'Local', 'CocosCreator'),
    path.join(os.homedir(), 'Downloads')
  ];

  for (const d of candidateDirs) {
    if (fs.existsSync(d)) {
      console.log('Searching:', d);
      try {
        const list = fs.readdirSync(d, { recursive: true });
        for (const item of list) {
          if (typeof item === 'string' && (item.endsWith('CocosCreator.exe') || item.endsWith('CocosDashboard.exe') || item.includes('3.8.3'))) {
            console.log('FOUND:', path.join(d, item));
          }
        }
      } catch (e) {
        console.log('Error reading:', d, e.message);
      }
    }
  }
}

findCocos();
