import fs from 'fs';
import path from 'path';

const defaultSceneTemplate = 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\resources\\resources\\3d\\engine\\editor\\assets\\default_file_content\\scene\\default.scene';
const raw = JSON.parse(fs.readFileSync(defaultSceneTemplate, 'utf8'));

// Set Camera position for 9:16 portrait view
const mainCamNode = raw[5];
mainCamNode._lpos = { "__type__": "cc.Vec3", "x": 0, "y": 16.0, "z": 11.0 };
mainCamNode._lrot = { "__type__": "cc.Quat", "x": -0.4226183, "y": 0, "z": 0, "w": 0.9063078 };
mainCamNode._euler = { "__type__": "cc.Vec3", "x": -50.0, "y": 0, "z": 0 };

const gameScenePath = path.resolve('./cocos/assets/scenes/Game.scene');
fs.writeFileSync(gameScenePath, JSON.stringify(raw, null, 2), 'utf8');

console.log('✅ Game.scene reset to clean official template without invalid handwritten components.');
