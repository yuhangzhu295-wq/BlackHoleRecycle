import fs from 'fs';

const ccDtsPath = 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\resources\\resources\\3d\\engine\\bin\\.declarations\\cc.d.ts';
const content = fs.readFileSync(ccDtsPath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('function torus(') || line.includes('function cone(')) {
    console.log(`[Line ${idx + 1}] ${line.trim()}`);
  }
});
