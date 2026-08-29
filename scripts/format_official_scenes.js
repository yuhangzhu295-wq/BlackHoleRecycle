import fs from 'fs';
import path from 'path';

const defaultSceneTemplate = 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\resources\\resources\\3d\\engine\\editor\\assets\\default_file_content\\scene\\default.scene';
const content = fs.readFileSync(defaultSceneTemplate, 'utf8');

const gameScenePath = path.resolve('./cocos/assets/scenes/Game.scene');
const bootstrapScenePath = path.resolve('./cocos/assets/scenes/Bootstrap.scene');

fs.writeFileSync(gameScenePath, content, 'utf8');
fs.writeFileSync(bootstrapScenePath, content, 'utf8');

const sceneMeta = {
  "ver": "1.1.27",
  "importer": "scene",
  "imported": true,
  "files": [
    ".json"
  ],
  "subMetas": {},
  "userData": {}
};

fs.writeFileSync(path.resolve('./cocos/assets/scenes/Game.scene.meta'), JSON.stringify({ ...sceneMeta, "uuid": "scene-game-0001-8888-9999-aaaabbbbcccc" }, null, 2), 'utf8');
fs.writeFileSync(path.resolve('./cocos/assets/scenes/Bootstrap.scene.meta'), JSON.stringify({ ...sceneMeta, "uuid": "scene-bootstrap-0002-8888-9999-aaaabbbbcccc" }, null, 2), 'utf8');

console.log('✅ Game.scene and Bootstrap.scene successfully formatted with official Cocos Creator 3.8.3 standard schema!');
