import fs from 'fs';
import path from 'path';

const stubPath = path.resolve('./cocos/cocos.d.ts');
if (fs.existsSync(stubPath)) {
  fs.unlinkSync(stubPath);
  console.log('Successfully deleted stub cocos.d.ts');
} else {
  console.log('cocos.d.ts does not exist');
}
