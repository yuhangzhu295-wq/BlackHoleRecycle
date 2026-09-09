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
  // Tiny Treats / pretty-park assets are already audited and exposed by
  // WorldArtLibrary. Keep them in this editor build list so a fresh rebuild
  // never silently drops the authored Golden City park vocabulary.
  { field: 'parkFountainTemplate', name: 'ParkFountainTemplate', url: 'db://assets/art/world/pretty-park/fountain.gltf' },
  { field: 'parkBenchTemplate', name: 'ParkBenchTemplate', url: 'db://assets/art/world/pretty-park/bench.gltf' },
  { field: 'parkBushTemplate', name: 'ParkBushTemplate', url: 'db://assets/art/world/pretty-park/bush_large.gltf' },
  { field: 'parkHedgeLongTemplate', name: 'ParkHedgeLongTemplate', url: 'db://assets/art/world/pretty-park/hedge_straight_long.gltf' },
  { field: 'parkHedgeCornerTemplate', name: 'ParkHedgeCornerTemplate', url: 'db://assets/art/world/pretty-park/hedge_corner.gltf' },
  { field: 'parkLanternTemplate', name: 'ParkLanternTemplate', url: 'db://assets/art/world/pretty-park/street_lantern.gltf' },
  { field: 'parkTrashcanTemplate', name: 'ParkTrashcanTemplate', url: 'db://assets/art/world/pretty-park/trashcan.gltf' },
  { field: 'parkFlowerATemplate', name: 'ParkFlowerATemplate', url: 'db://assets/art/world/pretty-park/flower_A.gltf' },
  { field: 'parkFlowerBTemplate', name: 'ParkFlowerBTemplate', url: 'db://assets/art/world/pretty-park/flower_B.gltf' },
  { field: 'parkGrassTileTemplate', name: 'ParkGrassTileTemplate', url: 'db://assets/art/world/pretty-park/floor_grass_sliced_base.gltf' },
  { field: 'parkCobblePathTemplate', name: 'ParkCobblePathTemplate', url: 'db://assets/art/world/pretty-park/cobble_stones_large.gltf' },
  { field: 'parkTreeTemplate', name: 'ParkTreeTemplate', url: 'db://assets/art/world/pretty-park/tree.gltf' },
  { field: 'parkTreeLargeTemplate', name: 'ParkTreeLargeTemplate', url: 'db://assets/art/world/pretty-park/tree_large.gltf' },
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
  { field: 'prettyParkColorTexture', url: 'db://assets/art/world/pretty-park/tiny_treats_texture_1.png' },
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

function addMarker(parent, name, position) {
  const { Node } = require('cc');
  const marker = new Node(name);
  marker.setPosition(position[0], position[1] || 0, position[2]);
  parent.addChild(marker);
  return marker;
}

function createGroup(parent, name) {
  const { Node } = require('cc');
  const group = new Node(name);
  parent.addChild(group);
  return group;
}

function buildCollectibleBaseHierarchy() {
  const { Node } = require('cc');
  const root = new Node('CollectibleBase');
  // Keep the production root inactive while the editor assembles the prefab.
  // CompressibleObject turns it on from spawn(), after the pooled instance has
  // received a real gameplay template and semantic art binding.
  root.active = false;
  createGroup(root, 'VisualRoot');
  createGroup(root, 'LockIndicator');
  createGroup(root, 'FXRoot');
  root.addComponent(getComponentClass('CompressibleObject'));
  return root;
}

function spawnArt(library, kind, parent, position, scale, yaw, name) {
  return library.spawn(kind, parent, {
    x: position[0], y: position[1] || 0, z: position[2],
  }, {
    x: scale[0], y: scale[1], z: scale[2],
  }, yaw || 0, name || kind);
}

function buildGoldenCityHierarchy(library) {
  const { Node } = require('cc');
  const root = new Node('GoldenCityCell');
  const ground = createGroup(root, 'Ground');
  spawnArt(library, 'terrainTile', ground, [-16, 0.01, -16], [32, 1, 32], 0, 'GroundTileNW');
  spawnArt(library, 'terrainTile', ground, [16, 0.01, -16], [32, 1, 32], 0, 'GroundTileNE');
  spawnArt(library, 'terrainTile', ground, [-16, 0.01, 16], [32, 1, 32], 0, 'GroundTileSW');
  spawnArt(library, 'terrainTile', ground, [16, 0.01, 16], [32, 1, 32], 0, 'GroundTileSE');

  const roads = createGroup(root, 'Roads');
  spawnArt(library, 'roadCrossroad', roads, [0, 0.05, -8], [12, 1, 12], 0, 'Crossroad');
  spawnArt(library, 'roadStraight', roads, [0, 0.05, 20], [12, 1, 20], 0, 'MainRoad');
  spawnArt(library, 'roadStraight', roads, [-20, 0.05, 8], [12, 1, 20], 90, 'SideRoadWest');
  spawnArt(library, 'roadStraight', roads, [20, 0.05, 8], [12, 1, 20], 90, 'SideRoadEast');

  const buildings = createGroup(root, 'Buildings');
  spawnArt(library, 'commercialBuildingA', buildings, [-18, 0, -22], [2.4, 2.4, 2.4], 90, 'Market');
  spawnArt(library, 'commercialBuildingD', buildings, [18, 0, -22], [2.4, 2.4, 2.4], -90, 'Hospital');
  spawnArt(library, 'buildingB', buildings, [-20, 0, 22], [1.5, 1.5, 1.5], 90, 'Residential');
  spawnArt(library, 'buildingC', buildings, [20, 0, 22], [1.5, 1.5, 1.5], -90, 'Commercial');

  const park = createGroup(root, 'Park');
  spawnArt(library, 'parkFountain', park, [0, 0.07, -14], [1.15, 1.15, 1.15], 0, 'Fountain');
  spawnArt(library, 'parkBench', park, [-6, 0.07, -13], [1.1, 1.1, 1.1], 70, 'BenchWest');
  spawnArt(library, 'parkBench', park, [6, 0.07, -13], [1.1, 1.1, 1.1], -70, 'BenchEast');
  for (const [index, point] of [[-22, -10], [22, -10], [-22, 4], [22, 4], [-18, 16], [18, 16]]) {
    spawnArt(library, index < 0 ? 'parkTree' : 'parkTreeLarge', park, [index, 0.07, point], [0.8, 0.8, 0.8], 0, `Tree${index}_${point}`);
  }
  spawnArt(library, 'parkFlowerA', park, [-4, 0.07, -4], [1.15, 1.15, 1.15], 0, 'FlowerBedWest');
  spawnArt(library, 'parkFlowerB', park, [4, 0.07, -4], [1.15, 1.15, 1.15], 0, 'FlowerBedEast');
  spawnArt(library, 'parkBush', park, [-10, 0.07, -14], [1.2, 1.2, 1.2], 0, 'BushWest');
  spawnArt(library, 'parkBush', park, [10, 0.07, -14], [1.2, 1.2, 1.2], 0, 'BushEast');
  spawnArt(library, 'parkHedgeLong', park, [-12, 0.07, -2], [1.1, 1.1, 1.1], 90, 'HedgeWest');
  spawnArt(library, 'parkHedgeLong', park, [12, 0.07, -2], [1.1, 1.1, 1.1], 90, 'HedgeEast');
  spawnArt(library, 'parkHedgeCorner', park, [-12, 0.07, 6], [1.1, 1.1, 1.1], 0, 'HedgeCornerWest');
  spawnArt(library, 'parkHedgeCorner', park, [12, 0.07, 6], [1.1, 1.1, 1.1], 180, 'HedgeCornerEast');
  const props = createGroup(root, 'Props');
  for (const [index, point] of [[-10, -6], [10, -6], [-10, 8], [10, 8]]) spawnArt(library, 'streetLight', props, [index, 0.07, point], [2.8, 2.8, 2.8], 0, `StreetLight${index}_${point}`);
  for (const [index, point] of [[-14, -8], [14, -8], [-14, 10], [14, 10]]) {
    spawnArt(library, 'parkLantern', props, [index, 0.07, point], [1.1, 1.1, 1.1], 0, `ParkLantern${index}_${point}`);
  }
  spawnArt(library, 'parkTrashcan', props, [-8, 0.07, -10], [1, 1, 1], 0, 'TrashBinWest');
  spawnArt(library, 'parkTrashcan', props, [8, 0.07, -10], [1, 1, 1], 0, 'TrashBinEast');
  spawnArt(library, 'recyclingBox', props, [-8, 0.07, 12], [0.9, 0.9, 0.9], 0, 'RecyclingBin');
  spawnArt(library, 'constructionCone', props, [8, 0.07, 12], [2.5, 2.5, 2.5], 0, 'HydrantMarker');

  const routes = createGroup(root, 'TrafficRoutes');
  [[-12, -5], [12, -5], [12, 5], [-12, 5]].forEach((p, i) => addMarker(routes, `RoutePoint${i + 1}`, [p[0], 0, p[1]]));
  const collectibles = createGroup(root, 'CollectibleSpawnPoints');
  [[-5, 2], [0, 3], [5, 2], [-7, 7], [7, 7], [-4, 10], [4, 10]].forEach((p, i) => addMarker(collectibles, `CollectiblePoint${i + 1}`, [p[0], 0.1, p[1]]));
  const competitors = createGroup(root, 'CompetitorSpawnPoints');
  [[-14, 10], [14, 10], [-14, -18], [14, -18], [0, 24], [0, -24], [-24, 0], [24, 0]].forEach((p, i) => addMarker(competitors, `CompetitorPoint${i + 1}`, [p[0], 0.1, p[1]]));
  const anchors = createGroup(root, 'ClusterAnchors');
  ['ParkCluster', 'FountainCluster', 'MarketCluster', 'RoadsideCluster', 'TrashCluster', 'ConstructionCluster'].forEach((name, i) => addMarker(anchors, name, [(i % 3 - 1) * 12, 0, (Math.floor(i / 3) - 0.5) * 18]));
  return root;
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

    async buildGoldenCityCell() {
      const { director } = require('cc');
      const scene = director.getScene();
      const gameRoot = scene?.getChildByName('GameRoot');
      const libraryNode = gameRoot?.getChildByName('WorldArtLibrary');
      const library = libraryNode?.getComponent(getComponentClass('WorldArtLibrary'));
      if (!gameRoot || !library) throw new Error('GameRoot/WorldArtLibrary is missing; build the art library first.');
      const old = gameRoot.getChildByName('GoldenCityCell_BUILD_SOURCE');
      if (old) old.destroy();
      const root = buildGoldenCityHierarchy(library);
      root.name = 'GoldenCityCell_BUILD_SOURCE';
      gameRoot.addChild(root);
      await Editor.Message.request('scene', 'save-scene');
      await Editor.Message.request('scene', 'create-prefab', root.uuid, 'db://assets/prefabs/world/GoldenCityCell.prefab');
      await Editor.Message.request('scene', 'save-scene');
      return { status: 'PASS', prefab: 'db://assets/prefabs/world/GoldenCityCell.prefab', structure: root.children.map((child) => child.name) };
    },

    async verifyGoldenCityCell() {
      const { director } = require('cc');
      const scene = director.getScene();
      const gameRoot = scene?.getChildByName('GameRoot');
      // Creator may restore the saved prefab instance under its authored name
      // after reopening the project. Accept both the transient build-source
      // name and the persisted GoldenCityCell name, but never synthesize a
      // replacement node for verification.
      const source = gameRoot?.getChildByName('GoldenCityCell_BUILD_SOURCE')
        || gameRoot?.getChildByName('GoldenCityCell');
      if (!source) throw new Error('GoldenCityCell prefab instance is not present in the open scene.');
      const required = ['Ground', 'Roads', 'Buildings', 'Park', 'Props', 'TrafficRoutes', 'CollectibleSpawnPoints', 'CompetitorSpawnPoints', 'ClusterAnchors'];
      const missing = required.filter((name) => !source.getChildByName(name));
      if (missing.length) throw new Error(`GoldenCityCell missing groups: ${missing.join(', ')}`);
      const info = await Editor.Message.request('asset-db', 'query-asset-info', 'db://assets/prefabs/world/GoldenCityCell.prefab');
      if (!info?.uuid) throw new Error('GoldenCityCell.prefab is not saved in the Creator asset database.');
      return { status: 'PASS', prefab: info.url, groups: required };
    },

    async buildCollectibleBase() {
      const { director } = require('cc');
      const scene = director.getScene();
      const gameRoot = scene?.getChildByName('GameRoot');
      if (!gameRoot) throw new Error('Game.scene does not contain GameRoot');
      const old = gameRoot.getChildByName('CollectibleBase_BUILD_SOURCE');
      if (old) old.destroy();
      const root = buildCollectibleBaseHierarchy();
      root.name = 'CollectibleBase_BUILD_SOURCE';
      gameRoot.addChild(root);
      await Editor.Message.request('scene', 'save-scene');
      await Editor.Message.request('scene', 'create-prefab', root.uuid, 'db://assets/prefabs/objects/CollectibleBase.prefab');
      await Editor.Message.request('scene', 'save-scene');
      return {
        status: 'PASS',
        prefab: 'db://assets/prefabs/objects/CollectibleBase.prefab',
        structure: root.children.map((child) => child.name),
      };
    },

    async verifyCollectibleBase() {
      const { director } = require('cc');
      const scene = director.getScene();
      const gameRoot = scene?.getChildByName('GameRoot');
      const source = gameRoot?.getChildByName('CollectibleBase_BUILD_SOURCE')
        || gameRoot?.getChildByName('CollectibleBase');
      if (!source) throw new Error('CollectibleBase prefab instance is not present in the open scene.');
      const required = ['VisualRoot', 'LockIndicator', 'FXRoot'];
      const missing = required.filter((name) => !source.getChildByName(name));
      if (missing.length) throw new Error(`CollectibleBase missing groups: ${missing.join(', ')}`);
      if (!source.getComponent(getComponentClass('CompressibleObject'))) {
        throw new Error('CollectibleBase root is missing CompressibleObject.');
      }
      const info = await Editor.Message.request('asset-db', 'query-asset-info', 'db://assets/prefabs/objects/CollectibleBase.prefab');
      if (!info?.uuid) throw new Error('CollectibleBase.prefab is not saved in the Creator asset database.');
      return { status: 'PASS', prefab: info.url, groups: required, rootComponent: 'CompressibleObject' };
    },
  },
};
