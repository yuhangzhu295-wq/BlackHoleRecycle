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
  { field: 'commercialBuildingATemplate', name: 'CommercialBuildingATemplate', url: 'db://assets/art/world/city/commercial-building-a.glb' },
  { field: 'commercialBuildingDTemplate', name: 'CommercialBuildingDTemplate', url: 'db://assets/art/world/city/commercial-building-d.glb' },
  { field: 'streetLightTemplate', name: 'StreetLightTemplate', url: 'db://assets/art/world/roads/street-light.glb' },
  { field: 'constructionConeTemplate', name: 'ConstructionConeTemplate', url: 'db://assets/art/world/roads/construction-cone.glb' },
  { field: 'garbageTruckTemplate', name: 'GarbageTruckTemplate', url: 'db://assets/art/vehicles/garbage-truck.glb' },
  { field: 'sedanTemplate', name: 'SedanTemplate', url: 'db://assets/art/vehicles/sedan.glb' },
  { field: 'deliveryVanTemplate', name: 'DeliveryVanTemplate', url: 'db://assets/art/vehicles/delivery-van.glb' },
  { field: 'recyclingBoxTemplate', name: 'RecyclingBoxTemplate', url: 'db://assets/art/props/recycling-box.glb' },
  { field: 'tireTemplate', name: 'TireTemplate', url: 'db://assets/art/props/tire.glb' },
  { field: 'recyclingBoltTemplate', name: 'RecyclingBoltTemplate', url: 'db://assets/art/props/recycling-bolt.glb' },
  { field: 'turbineWheelTemplate', name: 'TurbineWheelTemplate', url: 'db://assets/art/props/turbine-wheel.glb' },
];

const COLOR_TEXTURE_DEFINITIONS = [
  { field: 'roadColorTexture', url: 'db://assets/art/world/roads/Textures/colormap.png' },
  { field: 'suburbanColorTexture', url: 'db://assets/art/world/environment/Textures/colormap.png' },
  { field: 'commercialColorTexture', url: 'db://assets/art/world/city/Textures/colormap.png' },
  { field: 'vehicleColorTexture', url: 'db://assets/art/vehicles/Textures/colormap.png' },
];

function getComponentClass(name) {
  const { js } = require('cc');
  const type = js.getClassByName(name);
  if (!type) throw new Error(`Cocos script component is not imported: ${name}`);
  return type;
}

async function getImportedScenePrefab(url) {
  const { assetManager, Prefab } = require('cc');
  const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
  if (!info || !info.uuid) throw new Error(`Asset is not imported: ${url}`);

  const rawMeta = await Editor.Message.request('asset-db', 'query-asset-meta', info.uuid);
  const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
  const sceneMeta = Object.values(meta?.subMetas || {}).find((subMeta) => subMeta?.importer === 'gltf-scene');
  if (!sceneMeta?.uuid) throw new Error(`glTF does not contain a Cocos scene prefab subasset: ${url}`);

  const cached = assetManager.assets.get(sceneMeta.uuid);
  if (cached instanceof Prefab) return cached;
  const prefab = await new Promise((resolve, reject) => {
    assetManager.loadAny(sceneMeta.uuid, (error, loadedAsset) => {
      if (error) reject(error);
      else resolve(loadedAsset);
    });
  });
  if (!(prefab instanceof Prefab)) throw new Error(`Scene prefab subasset cannot be loaded: ${url}`);
  return prefab;
}

async function getImportedTexture(url) {
  const { assetManager, Texture2D } = require('cc');
  const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
  if (!info || !info.uuid) throw new Error(`Texture is not imported: ${url}`);

  // The PNG main asset is an ImageAsset. Creator generates a texture subasset
  // for it, and that exact subasset is the stable Texture2D reference that may
  // be assigned to a serialized component field.
  const rawMeta = await Editor.Message.request('asset-db', 'query-asset-meta', info.uuid);
  const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
  const textureMeta = Object.values(meta?.subMetas || {}).find((subMeta) => subMeta?.importer === 'texture');
  if (!textureMeta?.uuid) throw new Error(`Texture2D subasset is missing: ${url}`);

  const cached = assetManager.assets.get(textureMeta.uuid);
  if (cached instanceof Texture2D) return cached;
  const texture = await new Promise((resolve, reject) => {
    assetManager.loadAny(textureMeta.uuid, (error, loadedAsset) => {
      if (error) reject(error);
      else resolve(loadedAsset);
    });
  });
  if (!(texture instanceof Texture2D)) throw new Error(`Imported asset is not a Texture2D: ${url}`);
  return texture;
}

/**
 * Copy the imported glTF hierarchy into ordinary scene nodes. This keeps every
 * real mesh and authored transform (for example a truck body and four wheels)
 * while intentionally dropping nested glTF materials/image references, which
 * Creator cannot persist safely inside another prefab.
 */
function copyImportedGeometry(source, parent) {
  const { MeshRenderer, Node } = require('cc');
  const copy = new Node(source.name || 'MeshPart');
  copy.setPosition(source.position);
  copy.setRotation(source.rotation);
  copy.setScale(source.scale);
  parent.addChild(copy);

  const sourceRenderer = source.getComponent(MeshRenderer);
  if (sourceRenderer?.mesh) {
    const renderer = copy.addComponent(MeshRenderer);
    renderer.mesh = sourceRenderer.mesh;
  }
  for (const child of source.children) copyImportedGeometry(child, copy);
  return copy;
}

module.exports = {
  methods: {
    async buildWorldArtLibrary() {
      const { director, instantiate, Node } = require('cc');
      const scene = director.getScene();
      const gameRoot = scene?.getChildByName('GameRoot');
      if (!gameRoot) throw new Error('Game.scene does not contain GameRoot');

      const oldLibrary = gameRoot.getChildByName('WorldArtLibrary');
      if (oldLibrary) oldLibrary.destroy();

      const libraryNode = new Node('WorldArtLibrary');
      gameRoot.addChild(libraryNode);
      const library = libraryNode.addComponent(getComponentClass('WorldArtLibrary'));

      const scenePrefabs = await Promise.all(ART_DEFINITIONS.map((definition) => getImportedScenePrefab(definition.url)));
      const colorTextures = await Promise.all(COLOR_TEXTURE_DEFINITIONS.map((definition) => getImportedTexture(definition.url)));
      for (const [index, definition] of ART_DEFINITIONS.entries()) {
        const importedRoot = instantiate(scenePrefabs[index]);
        const template = copyImportedGeometry(importedRoot, libraryNode);
        importedRoot.destroy();
        template.name = definition.name;
        template.active = false;
        library[definition.field] = template;
      }
      for (const [index, definition] of COLOR_TEXTURE_DEFINITIONS.entries()) {
        library[definition.field] = colorTextures[index];
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
      const colorTextures = COLOR_TEXTURE_DEFINITIONS.map((definition) => {
        const texture = library[definition.field];
        if (!texture || !texture.isValid) throw new Error(`Invalid external colour texture: ${definition.field}`);
        return { field: definition.field, name: texture.name };
      });
      return { status: 'PASS', templates, colorTextures };
    },
  },
};
