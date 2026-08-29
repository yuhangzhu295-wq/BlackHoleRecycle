import fs from 'fs';

const ccDtsPath = 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\resources\\resources\\3d\\engine\\bin\\.declarations\\cc.d.ts';
const content = fs.readFileSync(ccDtsPath, 'utf8');

function findKeywords(keywords) {
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    for (const kw of keywords) {
      if (line.includes(kw)) {
        console.log(`[Line ${idx + 1}] ${line.trim()}`);
      }
    }
  });
}

console.log('--- Primitives & Mesh Utils ---');
findKeywords(['function createMesh', 'class primitives', 'namespace primitives', 'namespace utils', 'function box(', 'function cylinder(', 'function plane(']);
