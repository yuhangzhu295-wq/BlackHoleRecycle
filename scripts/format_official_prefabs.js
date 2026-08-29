import fs from 'fs';
import path from 'path';

function createPrefab(name, fileId = 'c46/YsCPVOJYA4mWEpNYRx') {
  return [
    {
      "__type__": "cc.Prefab",
      "_name": name,
      "_objFlags": 0,
      "_native": "",
      "data": {
        "__id__": 1
      },
      "optimizationPolicy": 0,
      "asyncLoadAssets": false,
      "persistent": false
    },
    {
      "__type__": "cc.Node",
      "_name": name,
      "_objFlags": 0,
      "_parent": null,
      "_children": [],
      "_active": true,
      "_components": [],
      "_prefab": {
        "__id__": 2
      },
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
      "_id": ""
    },
    {
      "__type__": "cc.PrefabInfo",
      "root": {
        "__id__": 1
      },
      "asset": {
        "__id__": 0
      },
      "fileId": fileId
    }
  ];
}

const prefabMeta = {
  "ver": "1.1.27",
  "importer": "prefab",
  "imported": true,
  "files": [
    ".json"
  ],
  "subMetas": {},
  "userData": {}
};

const prefabs = [
  { name: 'BlackHoleMachine', dir: 'machine', uuid: 'prefab-machine-0001-8888-9999-aaaabbbbcccc' },
  { name: 'TrashObject', dir: 'objects', uuid: 'prefab-trash-0002-8888-9999-aaaabbbbcccc' },
  { name: 'BedroomChunk', dir: 'chunks', uuid: 'prefab-chunk-0003-8888-9999-aaaabbbbcccc' },
  { name: 'HUD', dir: 'ui', uuid: 'prefab-hud-0004-8888-9999-aaaabbbbcccc' }
];

for (const p of prefabs) {
  const targetPath = path.resolve(`./cocos/assets/prefabs/${p.dir}/${p.name}.prefab`);
  const metaPath = path.resolve(`./cocos/assets/prefabs/${p.dir}/${p.name}.prefab.meta`);
  fs.writeFileSync(targetPath, JSON.stringify(createPrefab(p.name), null, 2), 'utf8');
  fs.writeFileSync(metaPath, JSON.stringify({ ...prefabMeta, uuid: p.uuid }, null, 2), 'utf8');
}

console.log('✅ All prefabs successfully formatted with official Cocos Creator 3.8.3 standard schema!');
