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
  { field: 'parkFountainTemplate', name: 'ParkFountainTemplate', url: 'db://assets/art/world/pretty-park/fountain.gltf' },
  { field: 'parkBenchTemplate', name: 'ParkBenchTemplate', url: 'db://assets/art/world/pretty-park/bench.gltf' },
  { field: 'parkTrashcanTemplate', name: 'ParkTrashcanTemplate', url: 'db://assets/art/world/pretty-park/trashcan.gltf' },
  { field: 'parkFlowerATemplate', name: 'ParkFlowerATemplate', url: 'db://assets/art/world/pretty-park/flower_A.gltf' },
  { field: 'parkFlowerBTemplate', name: 'ParkFlowerBTemplate', url: 'db://assets/art/world/pretty-park/flower_B.gltf' },
  { field: 'parkHedgeLongTemplate', name: 'ParkHedgeLongTemplate', url: 'db://assets/art/world/pretty-park/hedge_straight_long.gltf' },
  { field: 'parkTreeTemplate', name: 'ParkTreeTemplate', url: 'db://assets/art/world/pretty-park/tree.gltf' },
  { field: 'parkTreeLargeTemplate', name: 'ParkTreeLargeTemplate', url: 'db://assets/art/world/pretty-park/tree_large.gltf' },
  { field: 'pathStonesTemplate', name: 'PathStonesTemplate', url: 'db://assets/art/world/environment/path-stones-long.glb' },
  { field: 'fenceTemplate', name: 'FenceTemplate', url: 'db://assets/art/world/environment/fence.glb' },
  { field: 'commercialBuildingATemplate', name: 'CommercialBuildingATemplate', url: 'db://assets/art/world/city/commercial-building-a.glb' },
  { field: 'commercialBuildingDTemplate', name: 'CommercialBuildingDTemplate', url: 'db://assets/art/world/city/commercial-building-d.glb' },
  { field: 'commercialBuildingFTemplate', name: 'CommercialBuildingFTemplate', url: 'db://assets/art/world/city/commercial-building-f.glb' },
  { field: 'commercialBuildingGTemplate', name: 'CommercialBuildingGTemplate', url: 'db://assets/art/world/city/commercial-building-g.glb' },
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

async function getPrefabAsset(url) {
  const { assetManager, Prefab } = require('cc');
  const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
  if (!info || !info.uuid) throw new Error('Prefab asset is not imported: ' + url);
  const cached = assetManager.assets.get(info.uuid);
  if (cached instanceof Prefab) return cached;
  const prefab = await new Promise((resolve, reject) => {
    assetManager.loadAny(info.uuid, (error, loadedAsset) => {
      if (error) reject(error);
      else resolve(loadedAsset);
    });
  });
  if (!(prefab instanceof Prefab)) throw new Error('Cocos did not load a Prefab for ' + url);
  return prefab;
}

async function replacePrefabThroughAssetDatabase(nodeUuid, prefabUrl) {
  // Creator's scene:create-prefab does not reliably replace a same-name asset.
  // Keep deletion and recreation inside Asset Database so its metadata stays
  // consistent; never modify prefab files or UUIDs directly.
  const existingUuid = await Editor.Message.request('asset-db', 'query-uuid', prefabUrl);
  if (existingUuid) {
    await Editor.Message.request('asset-db', 'delete-asset', prefabUrl);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  await Editor.Message.request('scene', 'create-prefab', nodeUuid, prefabUrl);
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
    isGameSceneReady() {
      const { director } = require('cc');
      const scene = director.getScene();
      const gameRoot = scene?.getChildByName('GameRoot');
      return {
        ready: Boolean(gameRoot),
        sceneName: scene?.name || null,
        hasGameRoot: Boolean(gameRoot),
      };
    },
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

    async buildGoldenCityCell(stage = 'full') {
      const { director, instantiate, Node, Vec3 } = require('cc');
      const stageLog = [];
      function logStage(stage) {
        stageLog.push({ stage, time: new Date().toISOString() });
      }

      try {
        logStage('START');
        const scene = director.getScene();
        const gameRoot = scene?.getChildByName('GameRoot');
        if (!gameRoot) throw new Error('Game.scene does not contain GameRoot');

        logStage('CHECK_LIBRARY');
        const libraryNode = gameRoot.getChildByName('WorldArtLibrary');
        const library = libraryNode?.getComponent(getComponentClass('WorldArtLibrary'));
        if (!library) throw new Error('GameRoot does not contain an editor-saved WorldArtLibrary component');

        const requiredChildNames = [
          'Ground',
          'Roads',
          'Buildings',
          'Park',
          'Props',
          'TrafficRoutes',
          'CollectibleSpawnPoints',
          'CompetitorSpawnPoints',
          'ClusterAnchors',
        ];

        const children = {};
        let rootNode = null;
        if (stage === 'prepare' || stage === 'full') {
          logStage('CLEANUP_OLD');
          const oldCell = gameRoot.getChildByName('GoldenCityCell');
          if (oldCell) oldCell.destroy();

          logStage('CREATE_ROOT_AND_CHILDREN');
          rootNode = new Node('GoldenCityCell');
          gameRoot.addChild(rootNode);
          for (const name of requiredChildNames) {
            const child = new Node(name);
            rootNode.addChild(child);
            children[name] = child;
          }
        } else {
          rootNode = gameRoot.getChildByName('GoldenCityCell');
          if (!rootNode) throw new Error('GoldenCityCell is missing; run prepare before ' + stage);
          for (const name of requiredChildNames) {
            const child = rootNode.getChildByName(name);
            if (!child) throw new Error('GoldenCityCell is missing child ' + name + '; run prepare before ' + stage);
            children[name] = child;
          }
        }

        if (stage === 'inspect') {
          logStage('INSPECT');
          return {
            status: 'PASS',
            stage,
            root: rootNode.name,
            childCounts: Object.fromEntries(requiredChildNames.map((name) => [name, children[name].children.length])),
            stages: stageLog,
          };
        }

        if (stage === 'prepare') {
          logStage('SAVE_PREPARE');
          await Editor.Message.request('scene', 'save-scene');
          return { status: 'PASS', stage, root: rootNode.name, childCount: requiredChildNames.length, stages: stageLog };
        }

        if (stage === 'structure' || stage === 'full') {
        logStage('INSTANTIATE_GROUND');
        // 1. Ground: 2 tiles instead of 4 heavy tiles
        if (library.terrainTileTemplate) {
          const tile1 = instantiate(library.terrainTileTemplate);
          tile1.name = 'GroundTile_1';
          tile1.active = true;
          tile1.setPosition(new Vec3(-16, 0.01, -16));
          tile1.setScale(new Vec3(32, 1, 32));
          children.Ground.addChild(tile1);

          const tile2 = instantiate(library.terrainTileTemplate);
          tile2.name = 'GroundTile_2';
          tile2.active = true;
          tile2.setPosition(new Vec3(16, 0.01, 16));
          tile2.setScale(new Vec3(32, 1, 32));
          children.Ground.addChild(tile2);
        }

        logStage('INSTANTIATE_ROADS');
        // 2. Roads: the crossroad plus four route points drive real runtime traffic.
        if (library.roadCrossroadTemplate) {
          const road = instantiate(library.roadCrossroadTemplate);
          road.name = 'MainCrossroad';
          road.active = true;
          road.setPosition(new Vec3(0, 0.05, 0));
          road.setScale(new Vec3(12, 1, 12));
          children.Roads.addChild(road);
        }
        if (library.roadStraightTemplate) {
          const roadN = instantiate(library.roadStraightTemplate);
          roadN.name = 'RoadNorth';
          roadN.active = true;
          roadN.setPosition(new Vec3(0, 0.05, 16));
          roadN.setScale(new Vec3(12, 1, 16));
          children.Roads.addChild(roadN);

          const roadS = instantiate(library.roadStraightTemplate);
          roadS.name = 'RoadSouth';
          roadS.active = true;
          roadS.setPosition(new Vec3(0, 0.05, -16));
          roadS.setScale(new Vec3(12, 1, 16));
          children.Roads.addChild(roadS);

          const roadW = instantiate(library.roadStraightTemplate);
          roadW.name = 'RoadWest';
          roadW.active = true;
          roadW.setPosition(new Vec3(-16, 0.05, 0));
          roadW.setRotationFromEuler(0, 90, 0);
          roadW.setScale(new Vec3(12, 1, 16));
          children.Roads.addChild(roadW);

          const roadE = instantiate(library.roadStraightTemplate);
          roadE.name = 'RoadEast';
          roadE.active = true;
          roadE.setPosition(new Vec3(16, 0.05, 0));
          roadE.setRotationFromEuler(0, 90, 0);
          roadE.setScale(new Vec3(12, 1, 16));
          children.Roads.addChild(roadE);
        }

        logStage('INSTANTIATE_BUILDINGS');
        // 3. Buildings: fixed Creator-owned landmarks; runtime owns no product coordinates.
        if (library.buildingBTemplate) {
          const house = instantiate(library.buildingBTemplate);
          house.name = 'ResidentialHouseWest';
          house.active = true;
          house.setPosition(new Vec3(-10, 0, -10));
          house.setRotationFromEuler(0, 90, 0);
          children.Buildings.addChild(house);
        }
        if (library.commercialBuildingATemplate) {
          const shop = instantiate(library.commercialBuildingATemplate);
          shop.name = 'CommercialShopEast';
          shop.active = true;
          shop.setPosition(new Vec3(10, 0, 10));
          shop.setRotationFromEuler(0, -90, 0);
          children.Buildings.addChild(shop);
        }
        if (library.commercialBuildingDTemplate) {
          const hospital = instantiate(library.commercialBuildingDTemplate);
          hospital.name = 'Hospital_ClinicNorth';
          hospital.active = true;
          hospital.setPosition(new Vec3(-10, 0, 10));
          hospital.setRotationFromEuler(0, 90, 0);
          children.Buildings.addChild(hospital);
        }
        if (library.commercialBuildingFTemplate) {
          const market = instantiate(library.commercialBuildingFTemplate);
          market.name = 'CommercialMarketSouth';
          market.active = true;
          market.setPosition(new Vec3(10, 0, -10));
          market.setRotationFromEuler(0, -90, 0);
          children.Buildings.addChild(market);
        }
        if (stage === 'structure') {
          logStage('SAVE_STRUCTURE');
          await Editor.Message.request('scene', 'save-scene');
          return { status: 'PASS', stage, root: rootNode.name, stages: stageLog };
        }
        }

        if (stage === 'park' || stage === 'full') {
        logStage('INSTANTIATE_PARK');
        // 4. Park: trees frame the player without relying on a camera adjustment.
        const smallTreePositions = [
          [-5, 5], [-4, 8], [-5, 2], [5, -5], [4, -8], [5, -2],
        ];
        const largeTreePositions = [
          [-3, 9], [-6, 7], [-3, 6], [3, -9], [6, -7], [3, -6],
        ];
        if (library.treeSmallTemplate) {
          smallTreePositions.forEach(([x, z], index) => {
            const tree = instantiate(library.treeSmallTemplate);
            tree.name = 'ParkTreeSmall_' + (index + 1);
            tree.active = true;
            tree.setPosition(new Vec3(x, 0.07, z));
            children.Park.addChild(tree);
          });
        }
        if (library.treeLargeTemplate) {
          largeTreePositions.forEach(([x, z], index) => {
            const tree = instantiate(library.treeLargeTemplate);
            tree.name = 'ParkTreeLarge_' + (index + 1);
            tree.active = true;
            tree.setPosition(new Vec3(x, 0.07, z));
            children.Park.addChild(tree);
          });
        }
        if (stage === 'park') {
          logStage('SAVE_PARK');
          await Editor.Message.request('scene', 'save-scene');
          return { status: 'PASS', stage, root: rootNode.name, treeCount: children.Park.children.length, stages: stageLog };
        }
        }

        if (stage === 'content' || stage === 'full') {
        logStage('INSTANTIATE_PROPS');
        // 5. Props: authored semantic landmarks, low enough to leave the play corridor readable.
        const poi1 = new Node('POI_RecyclingHub');
        poi1.setPosition(new Vec3(8, 0, 8));
        if (library.recyclingBoxTemplate) {
          const box = instantiate(library.recyclingBoxTemplate);
          box.name = 'RecyclingBox';
          box.active = true;
          poi1.addChild(box);
        }
        children.Props.addChild(poi1);

        const poi2 = new Node('POI_ConstructionSite');
        poi2.setPosition(new Vec3(-8, 0, -8));
        if (library.constructionConeTemplate) {
          const cone = instantiate(library.constructionConeTemplate);
          cone.name = 'ConstructionCone';
          cone.active = true;
          poi2.addChild(cone);
        }
        children.Props.addChild(poi2);

        const poi3 = new Node('POI_CentralSquare');
        poi3.setPosition(new Vec3(0, 0, -5));
        if (library.streetLightTemplate) {
          const light = instantiate(library.streetLightTemplate);
          light.name = 'StreetLight';
          light.active = true;
          poi3.addChild(light);
        }
        children.Props.addChild(poi3);

        const parkFountain = new Node('POI_ParkFountain');
        parkFountain.setPosition(new Vec3(0, 0, 7));
        if (library.parkFountainTemplate) {
          const fountain = instantiate(library.parkFountainTemplate);
          fountain.name = 'Fountain';
          fountain.active = true;
          parkFountain.addChild(fountain);
        }
        children.Props.addChild(parkFountain);

        const parkDetails = [
          ['ParkBenchWest', library.parkBenchTemplate, -6, 0, 4],
          ['ParkBenchEast', library.parkBenchTemplate, 6, 0, 4],
          ['ParkBinWest', library.parkTrashcanTemplate, -7, 0, -2],
          ['ParkBinEast', library.parkTrashcanTemplate, 7, 0, -2],
          ['FlowerbedWest', library.parkFlowerATemplate, -5, 0, 7],
          ['FlowerbedEast', library.parkFlowerBTemplate, 5, 0, 7],
          ['ParkHedgeNorth', library.parkHedgeLongTemplate, 0, 0, 10],
        ];
        for (const [name, template, x, y, z] of parkDetails) {
          const detail = new Node(name);
          detail.setPosition(new Vec3(x, y, z));
          if (template) {
            const visual = instantiate(template);
            visual.name = name + '_Visual';
            visual.active = true;
            detail.addChild(visual);
          }
          children.Props.addChild(detail);
        }

        // Low authored props break up empty grass without occupying the central gameplay corridor.
        const pathStonesWest = new Node('ParkPathStonesWest');
        pathStonesWest.setPosition(new Vec3(-8, 0, 1.5));
        if (library.pathStonesTemplate) {
          const stones = instantiate(library.pathStonesTemplate);
          stones.name = 'PathStones';
          stones.active = true;
          pathStonesWest.addChild(stones);
        }
        children.Props.addChild(pathStonesWest);

        const pathStonesEast = new Node('ParkPathStonesEast');
        pathStonesEast.setPosition(new Vec3(8, 0, 1.5));
        if (library.pathStonesTemplate) {
          const stones = instantiate(library.pathStonesTemplate);
          stones.name = 'PathStones';
          stones.active = true;
          pathStonesEast.addChild(stones);
        }
        children.Props.addChild(pathStonesEast);

        const fenceWest = new Node('ParkFenceWest');
        fenceWest.setPosition(new Vec3(-8, 0, 3.5));
        fenceWest.setRotationFromEuler(0, 90, 0);
        if (library.fenceTemplate) {
          const fence = instantiate(library.fenceTemplate);
          fence.name = 'Fence';
          fence.active = true;
          fenceWest.addChild(fence);
        }
        children.Props.addChild(fenceWest);

        const fenceEast = new Node('ParkFenceEast');
        fenceEast.setPosition(new Vec3(8, 0, 3.5));
        fenceEast.setRotationFromEuler(0, 90, 0);
        if (library.fenceTemplate) {
          const fence = instantiate(library.fenceTemplate);
          fence.name = 'Fence';
          fence.active = true;
          fenceEast.addChild(fence);
        }
        children.Props.addChild(fenceEast);

        logStage('INSTANTIATE_TRAFFIC');
        // 6. TrafficRoutes: source anchors become pooled DynamicVehicles at runtime.
        const vehicleAnchors = [
          ['VehicleAnchor_SedanWest', -12, 0.1, 0],
          ['VehicleAnchor_SedanNorth', 0, 0.1, 12],
          ['VehicleAnchor_DeliveryVanEast', 12, 0.1, 0],
          ['VehicleAnchor_GarbageTruckSouth', 0, 0.1, -12],
          ['VehicleAnchor_SedanCenter', -4, 0.1, 0],
        ];
        for (const [name, x, y, z] of vehicleAnchors) {
          const anchor = new Node(name);
          anchor.setPosition(new Vec3(x, y, z));
          children.TrafficRoutes.addChild(anchor);
        }

        logStage('BUILD_SPAWN_POINTS');
        // 7. CollectibleSpawnPoints: 20 authored collectible spawn points split into 2 theme clusters
        const clusterPark = new Node('Cluster_Park');
        for (let i = 1; i <= 10; i++) {
          const pt = new Node('SpawnPoint_Park_' + i);
          const angle = (i / 10) * Math.PI * 2;
          pt.setPosition(new Vec3(Math.cos(angle) * 5, 0.2, Math.sin(angle) * 5));
          clusterPark.addChild(pt);
        }
        children.CollectibleSpawnPoints.addChild(clusterPark);

        const clusterSquare = new Node('Cluster_CitySquare');
        for (let i = 1; i <= 10; i++) {
          const pt = new Node('SpawnPoint_Square_' + i);
          const angle = (i / 10) * Math.PI * 2;
          pt.setPosition(new Vec3(Math.cos(angle) * 6, 0.2, Math.sin(angle) * 6));
          clusterSquare.addChild(pt);
        }
        children.CollectibleSpawnPoints.addChild(clusterSquare);

        // 8. CompetitorSpawnPoints: 3 anchors
        const comp1 = new Node('CompetitorSpawn_1');
        comp1.setPosition(new Vec3(-8, 0, 5));
        children.CompetitorSpawnPoints.addChild(comp1);

        const comp2 = new Node('CompetitorSpawn_2');
        comp2.setPosition(new Vec3(8, 0, -5));
        children.CompetitorSpawnPoints.addChild(comp2);

        const comp3 = new Node('CompetitorSpawn_3');
        comp3.setPosition(new Vec3(0, 0, -15));
        children.CompetitorSpawnPoints.addChild(comp3);

        // 9. ClusterAnchors: 2 anchors
        const anchor1 = new Node('ClusterAnchor_CentralPark');
        anchor1.setPosition(new Vec3(5, 0, 5));
        children.ClusterAnchors.addChild(anchor1);

        const anchor2 = new Node('ClusterAnchor_RecyclingSquare');
        anchor2.setPosition(new Vec3(-5, 0, -5));
        children.ClusterAnchors.addChild(anchor2);
        if (stage === 'content') {
          logStage('SAVE_CONTENT');
          await Editor.Message.request('scene', 'save-scene');
          return { status: 'PASS', stage, root: rootNode.name, stages: stageLog };
        }
        }

        if (stage !== 'persist' && stage !== 'full') {
          throw new Error('Unsupported Golden City build stage: ' + stage);
        }

        logStage('SAVE_SCENE_BEFORE_PREFAB');
        await Editor.Message.request('scene', 'save-scene');

        logStage('CREATE_PREFAB');
        await replacePrefabThroughAssetDatabase(rootNode.uuid, 'db://assets/prefabs/world/GoldenCityCell.prefab');

        logStage('COMPLETED');
        return {
          status: 'PASS',
          prefab: 'db://assets/prefabs/world/GoldenCityCell.prefab',
          childCount: requiredChildNames.length,
          treeCount: children.Park.children.length,
          roadCount: children.Roads.children.length,
          poiCount: children.Props.children.length,
          vehicleCount: children.TrafficRoutes.children.length,
          collectibleSpawnCount: 20,
          clusterAnchorCount: children.ClusterAnchors.children.length,
          stages: stageLog,
        };
      } catch (err) {
        return {
          status: 'FAILED',
          error: err.message,
          stack: err.stack,
          stages: stageLog,
        };
      }
    },

    async bindGoldenCityCell() {
      const { director } = require('cc');
      const stageLog = [];
      function logStage(stage) {
        stageLog.push({ stage, time: new Date().toISOString() });
      }

      try {
        logStage('START');
        const scene = director.getScene();
        const gameRoot = scene?.getChildByName('GameRoot');
        if (!gameRoot) throw new Error('Game.scene does not contain GameRoot');

        logStage('RESOLVE_PREFAB');
        const goldenCityPrefab = await getPrefabAsset('db://assets/prefabs/world/GoldenCityCell.prefab');

        logStage('RESOLVE_MANAGER');
        const worldRoot = gameRoot.getChildByName('InfiniteWorldRoot');
        if (!worldRoot) throw new Error('GameRoot does not contain InfiniteWorldRoot');
        const manager = worldRoot.getComponent(getComponentClass('InfiniteWorldManager'));
        if (!manager) throw new Error('InfiniteWorldRoot does not contain InfiniteWorldManager component');

        const temporaryCell = gameRoot.getChildByName('GoldenCityCell');
        if (temporaryCell) {
          temporaryCell.removeFromParent();
        }

        logStage('ASSIGN_PREFAB');
        manager.goldenCityCellPrefab = goldenCityPrefab;

        logStage('SAVE_SCENE');
        await Editor.Message.request('scene', 'save-scene');

        logStage('COMPLETED');
        return {
          status: 'PASS',
          prefab: 'db://assets/prefabs/world/GoldenCityCell.prefab',
          managerPrefabBound: manager.goldenCityCellPrefab === goldenCityPrefab,
          stages: stageLog,
        };
      } catch (err) {
        return {
          status: 'FAILED',
          error: err.message,
          stack: err.stack,
          stages: stageLog,
        };
      }
    },

async verifyGoldenCityCell() {
      const { director } = require('cc');
      const scene = director.getScene();
      const cellNode = scene?.getChildByName('GameRoot')?.getChildByName('GoldenCityCell');
      const worldRoot = scene?.getChildByName('GameRoot')?.getChildByName('InfiniteWorldRoot');
      if (!worldRoot) throw new Error('GameRoot does not contain InfiniteWorldRoot node');
      const manager = worldRoot.getComponent(getComponentClass('InfiniteWorldManager'));
      if (!manager) throw new Error('InfiniteWorldRoot does not contain InfiniteWorldManager component');
      if (!manager.goldenCityCellPrefab) throw new Error('InfiniteWorldManager.goldenCityCellPrefab is not bound');

      let treeCount = 0;
      let roadCount = 0;
      let poiCount = 0;
      let vehicleCount = 0;
      let clusterAnchorCount = 0;
      let targetNode = null;

      if (cellNode) {
        targetNode = cellNode;
      } else if (manager.goldenCityCellPrefab && manager.goldenCityCellPrefab.data) {
        targetNode = manager.goldenCityCellPrefab.data;
      }

      const requiredChildNames = [
        'Ground',
        'Roads',
        'Buildings',
        'Park',
        'Props',
        'TrafficRoutes',
        'CollectibleSpawnPoints',
        'CompetitorSpawnPoints',
        'ClusterAnchors',
      ];

      const missing = [];
      for (const name of requiredChildNames) {
        if (!targetNode || !targetNode.getChildByName(name)) {
          missing.push(name);
        }
      }

      if (missing.length > 0) {
        throw new Error('GoldenCityCell node/prefab is missing required children: ' + missing.join(', '));
      }

      const park = targetNode.getChildByName('Park');
      if (!park || park.children.length < 10) {
        throw new Error('GoldenCityCell Park must contain at least 10 trees');
      }
      treeCount = park.children.length;

      const roads = targetNode.getChildByName('Roads');
      if (!roads || roads.children.length < 3) {
        throw new Error('GoldenCityCell Roads must contain at least 3 visible road segments');
      }
      roadCount = roads.children.length;

      const props = targetNode.getChildByName('Props');
      if (!props || props.children.length < 3) {
        throw new Error('GoldenCityCell Props must contain at least 3 POI semantic nodes');
      }
      poiCount = props.children.length;

      const traffic = targetNode.getChildByName('TrafficRoutes');
      if (!traffic || traffic.children.length < 3) {
        throw new Error('GoldenCityCell TrafficRoutes must contain at least 3 vehicle anchors');
      }
      vehicleCount = traffic.children.length;

      const clusterAnchors = targetNode.getChildByName('ClusterAnchors');
      if (!clusterAnchors || clusterAnchors.children.length < 2) {
        throw new Error('GoldenCityCell ClusterAnchors must contain at least 2 anchors');
      }
      clusterAnchorCount = clusterAnchors.children.length;

      return {
        status: 'PASS',
        node: targetNode.name,
        children: requiredChildNames,
        treeCount,
        roadCount,
        poiCount,
        vehicleCount,
        clusterAnchorCount,
        managerPrefabBound: Boolean(manager.goldenCityCellPrefab),
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
