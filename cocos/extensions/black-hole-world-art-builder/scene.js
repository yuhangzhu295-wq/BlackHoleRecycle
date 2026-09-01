'use strict';

const { join } = require('path');
module.paths.push(join(Editor.App.path, 'node_modules'));

const ART_DEFINITIONS = [
  { field: 'roadStraightTemplate', name: 'RoadStraightTemplate', url: 'db://assets/art/world/roads/road-straight.glb' },
  { field: 'roadCrossroadTemplate', name: 'RoadCrossroadTemplate', url: 'db://assets/art/world/roads/road-crossroad-path.glb' },
  { field: 'terrainTileTemplate', name: 'TerrainTileTemplate', url: 'db://assets/art/world/environment/tile-low.glb' },
  { field: 'buildingBTemplate', name: 'BuildingBTemplate', url: 'db://assets/art/world/residential/building-type-b.glb' },
  { field: 'buildingCTemplate', name: 'BuildingCTemplate', url: 'db://assets/art/world/residential/building-type-c.glb' },
  { field: 'treeSmallTemplate', name: 'TreeSmallTemplate', url: 'db://assets/art/world/environment/tree-small.glb' },
  { field: 'treeLargeTemplate', name: 'TreeLargeTemplate', url: 'db://assets/art/world/environment/tree-large.glb' },
  { field: 'pathStonesTemplate', name: 'PathStonesTemplate', url: 'db://assets/art/world/environment/path-stones-long.glb' },
  { field: 'fenceTemplate', name: 'FenceTemplate', url: 'db://assets/art/world/environment/fence.glb' },
];

function getComponentClass(name) {
  const { js } = require('cc');
  const type = js.getClassByName(name);
  if (!type) throw new Error(`Cocos script component is not imported: ${name}`);
  return type;
}

async function getImportedMesh(url) {
  const { assetManager, Mesh } = require('cc');
  const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
  if (!info || !info.uuid) throw new Error(`Asset is not imported: ${url}`);

  const rawMeta = await Editor.Message.request('asset-db', 'query-asset-meta', info.uuid);
  const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
  const meshMeta = Object.values(meta?.subMetas || {}).find((subMeta) => subMeta?.importer === 'gltf-mesh');
  if (!meshMeta?.uuid) throw new Error(`glTF does not contain a Cocos mesh subasset: ${url}`);

  const cached = assetManager.assets.get(meshMeta.uuid);
  if (cached instanceof Mesh) return cached;
  const mesh = await new Promise((resolve, reject) => {
    assetManager.loadAny(meshMeta.uuid, (error, loadedAsset) => {
      if (error) reject(error);
      else resolve(loadedAsset);
    });
  });
  if (!(mesh instanceof Mesh)) throw new Error(`Mesh subasset cannot be loaded: ${url}`);
  return mesh;
}

module.exports = {
  methods: {
    async buildWorldArtLibrary() {
      const { director, MeshRenderer, Node } = require('cc');
      const scene = director.getScene();
      const gameRoot = scene?.getChildByName('GameRoot');
      if (!gameRoot) throw new Error('Game.scene does not contain GameRoot');

      const oldLibrary = gameRoot.getChildByName('WorldArtLibrary');
      if (oldLibrary) oldLibrary.destroy();

      const libraryNode = new Node('WorldArtLibrary');
      gameRoot.addChild(libraryNode);
      const library = libraryNode.addComponent(getComponentClass('WorldArtLibrary'));

      const meshes = await Promise.all(ART_DEFINITIONS.map((definition) => getImportedMesh(definition.url)));
      for (const [index, definition] of ART_DEFINITIONS.entries()) {
        const mesh = meshes[index];
        const template = new Node(definition.name);
        const renderer = template.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        template.name = definition.name;
        template.active = false;
        libraryNode.addChild(template);
        library[definition.field] = template;
      }

      await Editor.Message.request('scene', 'save-scene');
      await Editor.Message.request('scene', 'create-prefab', libraryNode.uuid, 'db://assets/prefabs/art/WorldArtLibrary.prefab');
      await Editor.Message.request('scene', 'save-scene');
      return {
        status: 'PASS',
        prefab: 'db://assets/prefabs/art/WorldArtLibrary.prefab',
        templateCount: ART_DEFINITIONS.length,
      };
    },

    async verifyWorldArtLibrary() {
      const { director } = require('cc');
      const scene = director.getScene();
      const libraryNode = scene?.getChildByName('GameRoot')?.getChildByName('WorldArtLibrary');
      const library = libraryNode?.getComponent(getComponentClass('WorldArtLibrary'));
      if (!library) throw new Error('GameRoot does not contain an editor-saved WorldArtLibrary component');

      const templates = ART_DEFINITIONS.map((definition) => {
        const node = library[definition.field];
        if (!node || node.active || !node.isValid) throw new Error(`Invalid world art template: ${definition.field}`);
        return { field: definition.field, node: node.name, active: node.active };
      });
      return { status: 'PASS', templates };
    },
  },
};
