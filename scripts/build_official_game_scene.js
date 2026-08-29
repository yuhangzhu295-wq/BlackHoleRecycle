import fs from 'fs';
import path from 'path';

const defaultSceneTemplate = 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.3\\resources\\resources\\3d\\engine\\editor\\assets\\default_file_content\\scene\\default.scene';
const raw = JSON.parse(fs.readFileSync(defaultSceneTemplate, 'utf8'));

// raw[0] is cc.SceneAsset
// raw[1] is cc.Scene
// raw[2] is Main Light (Node)
// raw[3] is cc.DirectionalLight
// raw[4] is cc.StaticLightSettings
// raw[5] is Main Camera (Node)
// raw[6] is cc.Camera
// raw[7] is cc.SceneGlobals
// raw[8] is cc.AmbientInfo
// raw[9] is cc.ShadowsInfo
// raw[10] is cc.SkyboxInfo
// raw[11] is cc.FogInfo

// Let's adjust Camera position and rotation for optimal 3D isometric gameplay
// Position: (0, 16, 11), Euler rotation: (-50, 0, 0)
const mainCamNode = raw[5];
mainCamNode._lpos = { "__type__": "cc.Vec3", "x": 0, "y": 16.0, "z": 11.0 };
mainCamNode._lrot = { "__type__": "cc.Quat", "x": -0.4226183, "y": 0, "z": 0, "w": 0.9063078 };
mainCamNode._euler = { "__type__": "cc.Vec3", "x": -50.0, "y": 0, "z": 0 };

// Create GameRoot Node and GameManager Component
const gameRootNodeId = raw.length;
const gameManagerCompId = raw.length + 1;

const gameRootNode = {
  "__type__": "cc.Node",
  "_name": "GameRoot",
  "_objFlags": 0,
  "_parent": {
    "__id__": 1
  },
  "_children": [],
  "_active": true,
  "_components": [
    {
      "__id__": gameManagerCompId
    }
  ],
  "_prefab": null,
  "_lpos": {
    "__type__": "cc.Vec3",
    "x": 0,
    "y": 0,
    "z": 0
  },
  "_lrot": {
    "__type__": "cc.Quat",
    "x": 0,
    "y": 0,
    "z": 0,
    "w": 1
  },
  "_lscale": {
    "__type__": "cc.Vec3",
    "x": 1,
    "y": 1,
    "z": 1
  },
  "_layer": 1073741824,
  "_euler": {
    "__type__": "cc.Vec3",
    "x": 0,
    "y": 0,
    "z": 0
  },
  "_id": "e9GameRootNode001"
};

const gameManagerComp = {
  "__type__": "GameManager",
  "_name": "",
  "_objFlags": 0,
  "node": {
    "__id__": gameRootNodeId
  },
  "_enabled": true,
  "__prefab": null,
  "_id": "f8GameManagerComp001"
};

// Append to scene children
raw[1]._children.push({ "__id__": gameRootNodeId });

raw.push(gameRootNode);
raw.push(gameManagerComp);

const gameScenePath = path.resolve('./cocos/assets/scenes/Game.scene');
fs.writeFileSync(gameScenePath, JSON.stringify(raw, null, 2), 'utf8');

console.log('✅ Generated official Game.scene with Main Light, Main Camera, and GameRoot (GameManager)');
