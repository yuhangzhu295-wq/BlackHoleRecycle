'use strict';

const { join } = require('path');
module.paths.push(join(Editor.App.path, 'node_modules'));

const HOME_IMAGE_URLS = [
  'db://assets/textures/home/home_city_park.png',
  'db://assets/textures/home/home_hud_panel.png',
  'db://assets/textures/home/home_coin.png',
  'db://assets/textures/home/home_logo.png',
  'db://assets/textures/home/home_blackhole_hero.png',
  'db://assets/textures/home/home_start_button.png',
  'db://assets/textures/home/home_action_mode.png',
  'db://assets/textures/home/home_action_skin.png',
  'db://assets/textures/home/home_action_machine.png',
  'db://assets/textures/home/home_settings.png',
];

const MODE_IMAGE_URLS = [
  'db://assets/textures/home/mode_background.png',
  'db://assets/textures/home/mode_back.png',
  'db://assets/textures/home/mode_header.png',
  'db://assets/textures/home/mode_card_shelf.png',
  'db://assets/textures/home/mode_arena_card.png',
  'db://assets/textures/home/mode_endless_card.png',
];

// Formal runtime pages use these authored Sprite surfaces rather than
// RoundedPanelGraphic/Graphics rectangles. They contain no text or gameplay
// data, so all displayed values remain bound to the live controllers.
const RUNTIME_UI_IMAGE_URLS = [
  'db://assets/textures/home/mode_card_shelf.png',
  'db://assets/textures/home/mode_card_shelf.png',
  'db://assets/textures/home/home_hud_panel.png',
];
// The skin page owns five cards, one for each runtime configuration. Text,
// ownership and prices are bound by SkinSelectionPageController from the
// strongly typed game configuration; these entries only define Creator-saved
// placement and colour accents for the formal page.
const SKIN_PAGE_ACCENTS = [
  [97, 67, 186, 255],
  [173, 76, 207, 255],
  [255, 149, 0, 255],
  [16, 185, 129, 255],
  [239, 68, 68, 255],
];
let runtimePanelFrame = null;
let runtimeRibbonFrame = null;
let runtimeDimFrame = null;

// Each wrapper is a regular scene Node saved by Cocos Creator. The glTF
// prefab stays as its child and receives the normalization scale here, rather
// than accepting arbitrary runtime scale values per object type.
const OBJECT_ART_TEMPLATE_SPECS = [
  { property: 'commercialSkyscraperATemplate', name: 'CommercialSkyscraperATemplate', url: 'db://assets/art/world/city/commercial-skyscraper-a.glb', scale: [1.65, 1.65, 1.65] },
  { property: 'commercialSkyscraperBTemplate', name: 'CommercialSkyscraperBTemplate', url: 'db://assets/art/world/city/commercial-skyscraper-b.glb', scale: [1.65, 1.65, 1.65] },
  { property: 'commercialBuildingFTemplate', name: 'CommercialBuildingFTemplate', url: 'db://assets/art/world/city/commercial-building-f.glb', scale: [1.65, 1.65, 1.65] },
  { property: 'commercialBuildingGTemplate', name: 'CommercialBuildingGTemplate', url: 'db://assets/art/world/city/commercial-building-g.glb', scale: [1.65, 1.65, 1.65] },
  { property: 'commercialBuildingHTemplate', name: 'CommercialBuildingHTemplate', url: 'db://assets/art/world/city/commercial-building-h.glb', scale: [1.65, 1.65, 1.65] },
  { property: 'parkFountainTemplate', name: 'ParkFountainTemplate', url: 'db://assets/art/world/pretty-park/fountain.gltf', scale: [1, 1, 1] },
  { property: 'parkBenchTemplate', name: 'ParkBenchTemplate', url: 'db://assets/art/world/pretty-park/bench.gltf', scale: [1, 1, 1] },
  { property: 'parkBushTemplate', name: 'ParkBushTemplate', url: 'db://assets/art/world/pretty-park/bush_large.gltf', scale: [1, 1, 1] },
  { property: 'parkHedgeLongTemplate', name: 'ParkHedgeLongTemplate', url: 'db://assets/art/world/pretty-park/hedge_straight_long.gltf', scale: [1, 1, 1] },
  { property: 'parkHedgeCornerTemplate', name: 'ParkHedgeCornerTemplate', url: 'db://assets/art/world/pretty-park/hedge_corner.gltf', scale: [1, 1, 1] },
  { property: 'parkLanternTemplate', name: 'ParkLanternTemplate', url: 'db://assets/art/world/pretty-park/street_lantern.gltf', scale: [1, 1, 1] },
  { property: 'parkTrashcanTemplate', name: 'ParkTrashcanTemplate', url: 'db://assets/art/world/pretty-park/trashcan.gltf', scale: [1, 1, 1] },
  { property: 'parkFlowerATemplate', name: 'ParkFlowerATemplate', url: 'db://assets/art/world/pretty-park/flower_A.gltf', scale: [1, 1, 1] },
  { property: 'parkFlowerBTemplate', name: 'ParkFlowerBTemplate', url: 'db://assets/art/world/pretty-park/flower_B.gltf', scale: [1, 1, 1] },
  { property: 'parkGrassTileTemplate', name: 'ParkGrassTileTemplate', url: 'db://assets/art/world/pretty-park/floor_grass_sliced_base.gltf', scale: [1, 1, 1] },
  { property: 'parkCobblePathTemplate', name: 'ParkCobblePathTemplate', url: 'db://assets/art/world/pretty-park/cobble_stones_large.gltf', scale: [1, 1, 1] },
  { property: 'parkTreeTemplate', name: 'ParkTreeTemplate', url: 'db://assets/art/world/pretty-park/tree.gltf', scale: [1, 1, 1] },
  { property: 'parkTreeLargeTemplate', name: 'ParkTreeLargeTemplate', url: 'db://assets/art/world/pretty-park/tree_large.gltf', scale: [1, 1, 1] },
  { property: 'sodaCanTemplate', name: 'SodaCanTemplate', url: 'db://assets/art/recyclables/food/soda-can.glb', scale: [1, 1, 1] },
  { property: 'waterBottleTemplate', name: 'WaterBottleTemplate', url: 'db://assets/art/recyclables/food/soda-bottle.glb', scale: [1, 1, 1] },
  { property: 'batteryTemplate', name: 'BatteryTemplate', url: 'db://assets/art/recyclables/props/battery.glb', scale: [1, 1, 1] },
  { property: 'toyDuckTemplate', name: 'ToyDuckTemplate', url: 'db://assets/art/recyclables/props/toy-duck.glb', scale: [6.5, 6.5, 6.5] },
  { property: 'appleTemplate', name: 'AppleTemplate', url: 'db://assets/art/recyclables/food/apple.glb', scale: [1.45, 1.45, 1.45] },
  { property: 'paperScrapTemplate', name: 'PaperScrapTemplate', url: 'db://assets/art/recyclables/props/paper-scrap.glb', scale: [1, 1, 1] },
  { property: 'bookStackTemplate', name: 'BookStackTemplate', url: 'db://assets/art/recyclables/furniture/book-stack.glb', scale: [3.4, 3.0, 4.0] },
  { property: 'cardboardBoxTemplate', name: 'CardboardBoxTemplate', url: 'db://assets/art/recyclables/furniture/cardboard-box.glb', scale: [2.8, 2.2, 2.8] },
  { property: 'trashBagTemplate', name: 'TrashBagTemplate', url: 'db://assets/art/recyclables/props/trash-bag.glb', scale: [1, 1, 1] },
  { property: 'paintBucketTemplate', name: 'PaintBucketTemplate', url: 'db://assets/art/recyclables/props/paint-bucket.glb', scale: [1, 1, 1] },
  { property: 'chairTemplate', name: 'ChairTemplate', url: 'db://assets/art/recyclables/furniture/chair.glb', scale: [4.0, 2.5, 4.0] },
  { property: 'coffeeTableTemplate', name: 'CoffeeTableTemplate', url: 'db://assets/art/recyclables/furniture/coffee-table.glb', scale: [2.3, 3.1, 2.5] },
  { property: 'monitorTemplate', name: 'MonitorTemplate', url: 'db://assets/art/recyclables/furniture/monitor.glb', scale: [3.0, 2.7, 2.8] },
  { property: 'shelfTemplate', name: 'ShelfTemplate', url: 'db://assets/art/recyclables/furniture/shelf.glb', scale: [6.25, 4.0, 4.0] },
  { property: 'crateTemplate', name: 'CrateTemplate', url: 'db://assets/art/recyclables/industrial/crate.glb', scale: [2.7, 4.5, 3.0] },
  { property: 'sofaTemplate', name: 'SofaTemplate', url: 'db://assets/art/recyclables/furniture/sofa.glb', scale: [2.85, 2.6, 3.4] },
  { property: 'shippingContainerTemplate', name: 'ShippingContainerTemplate', url: 'db://assets/art/recyclables/industrial/shipping-container.glb', scale: [8.6, 9.2, 8.5] },
];

const PRETTY_PARK_COLOR_TEXTURE_URL = 'db://assets/art/world/pretty-park/tiny_treats_texture_1.png';

// This is the player machine's actual tracked chassis, not a generic truck
// substituted for a bulldozer. Its CC-BY 3.0 attribution is kept alongside
// the binary audit record and shipped project documentation.
const MACHINE_CHASSIS_TEMPLATE_SPEC = {
  property: 'bulldozerTemplate',
  name: 'BulldozerTemplate',
  url: 'db://assets/art/machines/poly-google-bulldozer.glb',
  // Normalize the imported source once in the Creator-saved template so
  // gameplay instances remain unit-scaled.
  scale: [0.09, 0.09, 0.09],
};

// The imported neighbourhood set is authored in a miniature asset unit.  The
// following values are applied once to the Creator-saved template children,
// not to the runtime world instances.  That preserves the authored district
// layout while putting buildings, vegetation and lights in the same readable
// world scale as the player and the roads.
const WORLD_ART_UNIT_NORMALIZATION = [
  // A full 3.5× conversion made tall roofs cross the portrait camera plane
  // after world streaming. Two source units retain a readable city silhouette
  // without obscuring a travelling player.
  { property: 'buildingBTemplate', scale: [2.0, 2.0, 2.0] },
  { property: 'buildingCTemplate', scale: [2.0, 2.0, 2.0] },
  { property: 'treeSmallTemplate', scale: [4.0, 2.0, 4.0] },
  { property: 'treeLargeTemplate', scale: [4.0, 2.0, 4.0] },
  { property: 'commercialBuildingATemplate', scale: [1.8, 1.8, 1.8] },
  { property: 'commercialBuildingDTemplate', scale: [1.8, 1.8, 1.8] },
  { property: 'streetLightTemplate', scale: [4.0, 2.0, 4.0] },
  { property: 'pathStonesTemplate', scale: [1.8, 1.0, 1.8] },
  { property: 'fenceTemplate', scale: [1.8, 1.6, 1.8] },
];

// Every source below is an audited, Creator-imported glTF. Level assemblies
// duplicate lower-level structural parts so every saved prefab owns a complete
// silhouette, rather than treating LV1 as a runtime host for primitive add-ons.
const MACHINE_UPGRADE_ASSET_URLS = {
  chassis: 'db://assets/art/machines/poly-google-bulldozer.glb',
  turbine: 'db://assets/art/machine-modules/magnetic-turbine.glb',
  pipe: 'db://assets/art/machine-modules/magnetic-pipe.glb',
  chamber: 'db://assets/art/machine-modules/compression-engine.glb',
  frame: 'db://assets/art/machine-modules/compression-chassis.glb',
  wing: 'db://assets/art/machine-modules/gravity-wing-frame.glb',
  hopper: 'db://assets/art/machine-modules/singularity-hopper.glb',
};

const MACHINE_VISUAL_SPECS = [
  {
    level: 1,
    prefabUrl: 'db://assets/prefabs/machine/MachineVisual_LV1.prefab',
    parts: [
      { name: 'CrawlerChassis', source: 'chassis', position: [0, 0.02, 0.78], scale: [0.09, 0.09, 0.09], yaw: 180 },
    ],
  },
  {
    level: 2,
    prefabUrl: 'db://assets/prefabs/machine/MachineVisual_LV2.prefab',
    parts: [
      { name: 'CrawlerChassis', source: 'chassis', position: [0, 0.02, 0.78], scale: [0.09, 0.09, 0.09], yaw: 180 },
      { name: 'MagneticTurbineLeft', source: 'turbine', position: [-1.22, 0.35, 0.05], scale: [0.46, 0.46, 0.46], yaw: 90 },
      { name: 'MagneticTurbineRight', source: 'turbine', position: [1.22, 0.35, 0.05], scale: [0.46, 0.46, 0.46], yaw: -90 },
      { name: 'MagneticPipeLeft', source: 'pipe', position: [-0.88, 0.38, 0.30], scale: [0.34, 0.34, 0.34], yaw: 90 },
      { name: 'MagneticPipeRight', source: 'pipe', position: [0.88, 0.38, 0.30], scale: [0.34, 0.34, 0.34], yaw: -90 },
    ],
  },
  {
    level: 3,
    prefabUrl: 'db://assets/prefabs/machine/MachineVisual_LV3.prefab',
    parts: [
      { name: 'CrawlerChassis', source: 'chassis', position: [0, 0.02, 0.78], scale: [0.09, 0.09, 0.09], yaw: 180 },
      { name: 'MagneticTurbineLeft', source: 'turbine', position: [-1.22, 0.35, 0.05], scale: [0.46, 0.46, 0.46], yaw: 90 },
      { name: 'MagneticTurbineRight', source: 'turbine', position: [1.22, 0.35, 0.05], scale: [0.46, 0.46, 0.46], yaw: -90 },
      { name: 'MagneticPipeLeft', source: 'pipe', position: [-0.88, 0.38, 0.30], scale: [0.34, 0.34, 0.34], yaw: 90 },
      { name: 'MagneticPipeRight', source: 'pipe', position: [0.88, 0.38, 0.30], scale: [0.34, 0.34, 0.34], yaw: -90 },
      { name: 'CompressionChamber', source: 'chamber', position: [0, 0.46, 1.02], scale: [0.72, 0.72, 0.72], yaw: 180 },
      { name: 'CompressionHopper', source: 'hopper', position: [0, 1.08, 0.88], scale: [0.58, 0.58, 0.58], yaw: 180 },
    ],
  },
  {
    level: 4,
    prefabUrl: 'db://assets/prefabs/machine/MachineVisual_LV4.prefab',
    parts: [
      { name: 'CrawlerChassis', source: 'chassis', position: [0, 0.02, 0.78], scale: [0.09, 0.09, 0.09], yaw: 180 },
      { name: 'MagneticTurbineLeft', source: 'turbine', position: [-1.22, 0.35, 0.05], scale: [0.46, 0.46, 0.46], yaw: 90 },
      { name: 'MagneticTurbineRight', source: 'turbine', position: [1.22, 0.35, 0.05], scale: [0.46, 0.46, 0.46], yaw: -90 },
      { name: 'MagneticPipeLeft', source: 'pipe', position: [-0.88, 0.38, 0.30], scale: [0.34, 0.34, 0.34], yaw: 90 },
      { name: 'MagneticPipeRight', source: 'pipe', position: [0.88, 0.38, 0.30], scale: [0.34, 0.34, 0.34], yaw: -90 },
      { name: 'CompressionChamber', source: 'chamber', position: [0, 0.46, 1.02], scale: [0.72, 0.72, 0.72], yaw: 180 },
      { name: 'CompressionHopper', source: 'hopper', position: [0, 1.08, 0.88], scale: [0.58, 0.58, 0.58], yaw: 180 },
      { name: 'GravityWingLeft', source: 'wing', position: [-1.92, 0.50, 0.42], scale: [0.62, 0.62, 0.62], yaw: 90 },
      { name: 'GravityWingRight', source: 'wing', position: [1.92, 0.50, 0.42], scale: [0.62, 0.62, 0.62], yaw: -90 },
      { name: 'GravityPipeLeft', source: 'pipe', position: [-1.46, 0.70, 0.25], scale: [0.42, 0.42, 0.42], yaw: 90 },
      { name: 'GravityPipeRight', source: 'pipe', position: [1.46, 0.70, 0.25], scale: [0.42, 0.42, 0.42], yaw: -90 },
    ],
  },
  {
    level: 5,
    prefabUrl: 'db://assets/prefabs/machine/MachineVisual_LV5.prefab',
    parts: [
      { name: 'CrawlerChassis', source: 'chassis', position: [0, 0.02, 0.78], scale: [0.09, 0.09, 0.09], yaw: 180 },
      { name: 'MagneticTurbineLeft', source: 'turbine', position: [-1.38, 0.35, 0.05], scale: [0.56, 0.56, 0.56], yaw: 90 },
      { name: 'MagneticTurbineRight', source: 'turbine', position: [1.38, 0.35, 0.05], scale: [0.56, 0.56, 0.56], yaw: -90 },
      { name: 'MagneticPipeLeft', source: 'pipe', position: [-1.00, 0.42, 0.30], scale: [0.40, 0.40, 0.40], yaw: 90 },
      { name: 'MagneticPipeRight', source: 'pipe', position: [1.00, 0.42, 0.30], scale: [0.40, 0.40, 0.40], yaw: -90 },
      { name: 'CompressionChamber', source: 'chamber', position: [0, 0.52, 1.10], scale: [0.88, 0.88, 0.88], yaw: 180 },
      { name: 'CompressionHopper', source: 'hopper', position: [0, 1.20, 0.92], scale: [0.74, 0.74, 0.74], yaw: 180 },
      { name: 'GravityWingLeft', source: 'wing', position: [-2.22, 0.58, 0.42], scale: [0.82, 0.82, 0.82], yaw: 90 },
      { name: 'GravityWingRight', source: 'wing', position: [2.22, 0.58, 0.42], scale: [0.82, 0.82, 0.82], yaw: -90 },
      { name: 'GravityPipeLeft', source: 'pipe', position: [-1.66, 0.82, 0.25], scale: [0.52, 0.52, 0.52], yaw: 90 },
      { name: 'GravityPipeRight', source: 'pipe', position: [1.66, 0.82, 0.25], scale: [0.52, 0.52, 0.52], yaw: -90 },
      { name: 'SingularityFrame', source: 'frame', position: [0, 0.60, 0.94], scale: [1.18, 1.18, 1.18], yaw: 180 },
      { name: 'SingularityHopperLeft', source: 'hopper', position: [-0.70, 1.14, 0.60], scale: [0.58, 0.58, 0.58], yaw: 150 },
      { name: 'SingularityHopperRight', source: 'hopper', position: [0.70, 1.14, 0.60], scale: [0.58, 0.58, 0.58], yaw: -150 },
    ],
  },
];

function getComponentClass(name) {
  const { js } = require('cc');
  const type = js.getClassByName(name);
  if (!type) throw new Error(`Cocos script component is not imported: ${name}`);
  return type;
}

// The editor scene is rooted at `Game`, while gameplay content is nested
// below `Game/GameRoot`.  Keeping the lookup here avoids a fragile assumption
// about the director scene's immediate child list in every editor command.
function getGameRootFromEditorScene() {
  const { director } = require('cc');
  const scene = director.getScene();
  if (!scene) return null;
  const pending = [...scene.children];
  while (pending.length > 0) {
    const node = pending.shift();
    if (!node) continue;
    if (node.name === 'GameRoot') return node;
    pending.push(...node.children);
  }
  return null;
}

function createNode(name, parent, width, height) {
  const { Node, UITransform, Layers } = require('cc');
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  parent.addChild(node);
  const transform = node.addComponent(UITransform);
  transform.setContentSize(width, height);
  return node;
}

async function getSpriteFrameUuid(url) {
  const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
  if (!info || !info.uuid) throw new Error(`Asset is not imported: ${url}`);

  const rawMeta = await Editor.Message.request('asset-db', 'query-asset-meta', info.uuid);
  const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
  const spriteFrameMeta = Object.values(meta && meta.subMetas ? meta.subMetas : {})
    .find((subMeta) => subMeta && subMeta.importer === 'sprite-frame');
  if (!spriteFrameMeta || !spriteFrameMeta.uuid) {
    throw new Error(`PNG does not contain a Cocos SpriteFrame subasset: ${url}`);
  }
  return spriteFrameMeta.uuid;
}

async function getImportedSpriteFrame(url) {
  const { assetManager, SpriteFrame } = require('cc');
  const spriteFrameUuid = await getSpriteFrameUuid(url);
  const cachedSpriteFrame = assetManager.assets.get(spriteFrameUuid);
  if (cachedSpriteFrame instanceof SpriteFrame) return cachedSpriteFrame;

  const spriteFrame = await new Promise((resolve, reject) => {
    assetManager.loadAny(spriteFrameUuid, (error, loadedAsset) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(loadedAsset);
    });
  });
  if (!(spriteFrame instanceof SpriteFrame)) {
    throw new Error(`SpriteFrame is not loaded by the Cocos asset database: ${url}`);
  }
  return spriteFrame;
}

async function getImportedGltfPrefab(url) {
  const { assetManager, Prefab } = require('cc');
  const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
  if (!info || !info.uuid) throw new Error(`Asset is not imported: ${url}`);
  const rawMeta = await Editor.Message.request('asset-db', 'query-asset-meta', info.uuid);
  const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
  const prefabMeta = Object.values(meta && meta.subMetas ? meta.subMetas : {})
    .find((subMeta) => subMeta && subMeta.importer === 'gltf-scene');
  if (!prefabMeta || !prefabMeta.uuid) {
    throw new Error(`GLB does not contain a Cocos gltf-scene prefab: ${url}`);
  }
  const cachedPrefab = assetManager.assets.get(prefabMeta.uuid);
  if (cachedPrefab instanceof Prefab) return cachedPrefab;
  const prefab = await new Promise((resolve, reject) => {
    assetManager.loadAny(prefabMeta.uuid, (error, loadedAsset) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(loadedAsset);
    });
  });
  if (!(prefab instanceof Prefab)) {
    throw new Error(`Cocos did not load a Prefab for glTF scene asset: ${url}`);
  }
  return prefab;
}

async function getPrefabAsset(url) {
  const { assetManager, Prefab } = require('cc');
  const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
  if (!info || !info.uuid) throw new Error(`Prefab asset is not imported: ${url}`);
  const cached = assetManager.assets.get(info.uuid);
  if (cached instanceof Prefab) return cached;
  const prefab = await new Promise((resolve, reject) => {
    assetManager.loadAny(info.uuid, (error, loadedAsset) => {
      if (error) reject(error);
      else resolve(loadedAsset);
    });
  });
  if (!(prefab instanceof Prefab)) throw new Error(`Cocos did not load a Prefab for ${url}`);
  return prefab;
}

async function buildMachineVisualPrefab(gameRoot, spec, importedSources) {
  const { Node, Vec3, instantiate } = require('cc');
  const assembly = new Node(`MachineVisual_LV${spec.level}`);
  gameRoot.addChild(assembly);
  for (const part of spec.parts) {
    const importedPrefab = importedSources[part.source];
    if (!importedPrefab) throw new Error(`Missing imported source '${part.source}' for LV${spec.level}/${part.name}`);
    const partRoot = new Node(part.name);
    assembly.addChild(partRoot);
    partRoot.setPosition(new Vec3(part.position[0], part.position[1], part.position[2]));
    partRoot.setScale(new Vec3(part.scale[0], part.scale[1], part.scale[2]));
    partRoot.setRotationFromEuler(0, part.yaw, 0);
    const importedRoot = instantiate(importedPrefab);
    copyImportedGeometry(importedRoot, partRoot);
    importedRoot.destroy();
  }
  await Editor.Message.request('scene', 'save-scene');
  await Editor.Message.request('scene', 'create-prefab', assembly.uuid, spec.prefabUrl);
  // `destroy()` is deferred by Cocos. Detach first so the editor's following
  // save cannot serialize this temporary prefab-construction node into
  // Game.scene as a second, invalid render instance.
  assembly.removeFromParent();
  assembly.destroy();
  await Editor.Message.request('scene', 'save-scene');
}

async function getImportedGltfTexture(url) {
  const { assetManager, Texture2D } = require('cc');
  const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
  if (!info || !info.uuid) throw new Error(`Asset is not imported: ${url}`);
  const rawMeta = await Editor.Message.request('asset-db', 'query-asset-meta', info.uuid);
  const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
  const textureMeta = Object.values(meta && meta.subMetas ? meta.subMetas : {})
    .find((subMeta) => subMeta && subMeta.importer === 'texture');
  if (!textureMeta || !textureMeta.uuid) {
    throw new Error(`GLB does not contain a Cocos texture subasset: ${url}`);
  }
  const cachedTexture = assetManager.assets.get(textureMeta.uuid);
  if (cachedTexture instanceof Texture2D) return cachedTexture;
  const texture = await new Promise((resolve, reject) => {
    assetManager.loadAny(textureMeta.uuid, (error, loadedAsset) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(loadedAsset);
    });
  });
  if (!(texture instanceof Texture2D)) {
    throw new Error(`Cocos did not load a Texture2D for glTF asset: ${url}`);
  }
  return texture;
}

/** Load the Texture2D generated by Creator for a regular external PNG. */
async function getImportedPngTexture(url) {
  const { assetManager, Texture2D } = require('cc');
  const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
  if (!info || !info.uuid) throw new Error(`Asset is not imported: ${url}`);
  const rawMeta = await Editor.Message.request('asset-db', 'query-asset-meta', info.uuid);
  const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
  const textureMeta = Object.values(meta && meta.subMetas ? meta.subMetas : {})
    .find((subMeta) => subMeta && subMeta.importer === 'texture');
  if (!textureMeta || !textureMeta.uuid) {
    throw new Error(`PNG does not contain a Cocos texture subasset: ${url}`);
  }
  const cachedTexture = assetManager.assets.get(textureMeta.uuid);
  if (cachedTexture instanceof Texture2D) return cachedTexture;
  const texture = await new Promise((resolve, reject) => {
    assetManager.loadAny(textureMeta.uuid, (error, loadedAsset) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(loadedAsset);
    });
  });
  if (!(texture instanceof Texture2D)) {
    throw new Error(`Cocos did not load a Texture2D for PNG asset: ${url}`);
  }
  return texture;
}

function addObjectArtTemplate(library, spec, prefab) {
  const { Node, Vec3, instantiate } = require('cc');
  let wrapper = library.node.getChildByName(spec.name);
  if (wrapper) {
    if (wrapper.children.length === 0) {
      throw new Error(`${spec.name} exists without an imported glTF child; refusing to replace it.`);
    }
    detachNestedImportedPrefabs(wrapper);
    normalizeExistingTemplate(wrapper, spec.property, spec.scale);
    library[spec.property] = wrapper;
    return { wrapper, created: false };
  }
  wrapper = new Node(spec.name);
  library.node.addChild(wrapper);
  const importedRoot = instantiate(prefab);
  const visual = copyImportedGeometry(importedRoot, wrapper);
  importedRoot.destroy();
  visual.setScale(new Vec3(spec.scale[0], spec.scale[1], spec.scale[2]));
  wrapper.active = false;
  library[spec.property] = wrapper;
  return { wrapper, created: true };
}

/**
 * Copy actual imported glTF geometry to normal scene nodes. This removes the
 * nested Prefab dependency when Game.scene is opened. The retained Mesh is
 * still the audited imported glTF mesh; WorldArtLibrary assigns its approved
 * runtime material. A source colour map may be saved explicitly as a
 * Texture2D property on WorldArtLibrary when that model needs authored detail.
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
  source.children.forEach((child) => copyImportedGeometry(child, copy));
  return copy;
}

function detachNestedImportedPrefabs(wrapper) {
  for (const child of [...wrapper.children]) {
    if (!child._prefab?.asset) continue;
    const standalone = copyImportedGeometry(child, wrapper);
    standalone.name = child.name || 'MeshPart';
    // `destroy()` is deferred until the next engine tick. Unparent first so
    // the immediate save below cannot serialize the obsolete glTF PrefabInfo.
    child.removeFromParent();
    child.destroy();
  }
}

function normalizeExistingTemplate(template, name, scale) {
  const { Vec3 } = require('cc');
  if (!template || template.children.length === 0) {
    throw new Error(`WorldArtLibrary.${name} is not a saved template with an imported glTF child.`);
  }
  template.children[0].setScale(new Vec3(scale[0], scale[1], scale[2]));
  template.active = false;
}

async function prepareHomeSprites() {
  return prepareSprites(HOME_IMAGE_URLS);
}

async function prepareModeSprites() {
  return prepareSprites(MODE_IMAGE_URLS);
}

async function prepareRuntimeUISprites() {
  await prepareSprites(RUNTIME_UI_IMAGE_URLS);
  runtimePanelFrame = await getImportedSpriteFrame(RUNTIME_UI_IMAGE_URLS[0]);
  runtimeRibbonFrame = await getImportedSpriteFrame(RUNTIME_UI_IMAGE_URLS[1]);
  runtimeDimFrame = await getImportedSpriteFrame(RUNTIME_UI_IMAGE_URLS[2]);
  // One authored frame is intentionally reused as a true nine-slice panel
  // across HUD cards and result rows. The inset is set on the Creator-owned
  // SpriteFrame before scene save, never rebuilt at runtime.
  runtimePanelFrame.insetTop = 30;
  runtimePanelFrame.insetBottom = 30;
  runtimePanelFrame.insetLeft = 30;
  runtimePanelFrame.insetRight = 30;
  return { total: RUNTIME_UI_IMAGE_URLS.length };
}

async function prepareSprites(assetUrls) {
  const changed = [];
  for (const url of assetUrls) {
    const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
    if (!info || !info.uuid) throw new Error(`Asset is not imported: ${url}`);
    const rawMeta = await Editor.Message.request('asset-db', 'query-asset-meta', info.uuid);
    const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
    if (!meta || !meta.userData) throw new Error(`Asset meta is unavailable: ${url}`);
    if (meta.userData.type !== 'sprite-frame') {
      meta.userData.type = 'sprite-frame';
      await Editor.Message.request('asset-db', 'save-asset-meta', info.uuid, JSON.stringify(meta));
      changed.push(url);
    }
  }
  return { changed, total: assetUrls.length };
}

async function createSprite(name, parent, width, height, assetUrl) {
  const { Sprite } = require('cc');
  const node = createNode(name, parent, width, height);
  const sprite = node.addComponent(Sprite);
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.spriteFrame = await getImportedSpriteFrame(assetUrl);
  return node;
}

function createLabel(name, parent, text, fontSize, color) {
  const { Node, UITransform, Label, LabelOutline, Color, Layers, HorizontalTextAlignment, VerticalTextAlignment } = require('cc');
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(600, fontSize + 22);
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = fontSize + 12;
  label.color = color || new Color(255, 255, 255, 255);
  label.isBold = true;
  label.horizontalAlign = HorizontalTextAlignment.CENTER;
  label.verticalAlign = VerticalTextAlignment.CENTER;
  // The V2 reference relies on a chunky dark keyline for white and gold
  // display type.  Save the native Cocos outline component with the label so
  // this is a real Editor-authored visual treatment rather than a browser CSS
  // substitute. Dark data captions deliberately stay clean for legibility.
  const luminance = (label.color.r * 0.2126 + label.color.g * 0.7152 + label.color.b * 0.0722);
  if (luminance >= 150) {
    const outline = node.addComponent(LabelOutline);
    outline.width = Math.max(2, Math.round(fontSize * 0.075));
    outline.color = new Color(24, 29, 48, 235);
  }
  return node;
}

async function createButton(name, parent, caption, fontSize, assetUrl) {
  const { Button, UITransform } = require('cc');
  const node = await createSprite(name, parent, 180, 120, assetUrl);
  node.addComponent(Button);
  const labelNode = createLabel(`${name}Label`, node, caption, fontSize);
  labelNode.getComponent(UITransform).setContentSize(520, fontSize + 22);
  labelNode.setPosition(0, -40, 0);
  return node;
}

async function createImageButton(name, parent, width, height, assetUrl, interactable = true) {
  const { Button } = require('cc');
  const node = await createSprite(name, parent, width, height, assetUrl);
  const button = node.addComponent(Button);
  button.interactable = interactable;
  return node;
}

/** Creator-saved sprite/9-slice surface for every formal HUD and modal card. */
function createRoundedPanel(name, parent, width, height, color, radius = 28) {
  const { Sprite } = require('cc');
  if (!runtimePanelFrame) throw new Error('Runtime panel SpriteFrame is not prepared.');
  const node = createNode(name, parent, width, height);
  const panel = node.addComponent(Sprite);
  panel.sizeMode = Sprite.SizeMode.CUSTOM;
  panel.type = Sprite.Type.SLICED;
  panel.spriteFrame = runtimePanelFrame;
  panel.color = color;
  return node;
}

function createTitleRibbon(name, parent, width, height, color) {
  const { Sprite } = require('cc');
  if (!runtimeRibbonFrame) throw new Error('Runtime title-ribbon SpriteFrame is not prepared.');
  const node = createNode(name, parent, width, height);
  const ribbon = node.addComponent(Sprite);
  ribbon.sizeMode = Sprite.SizeMode.CUSTOM;
  ribbon.spriteFrame = runtimeRibbonFrame;
  ribbon.color = color;
  return node;
}

function createDimSprite(name, parent, width, height, color) {
  const { Sprite } = require('cc');
  if (!runtimeDimFrame) throw new Error('Runtime dim SpriteFrame is not prepared.');
  const node = createNode(name, parent, width, height);
  const dim = node.addComponent(Sprite);
  dim.sizeMode = Sprite.SizeMode.CUSTOM;
  dim.spriteFrame = runtimeDimFrame;
  dim.color = color;
  return node;
}

function createGraphicButton(name, parent, text, x, y, width, height, fillColor, textColor, fontSize = 30) {
  const { Button, UITransform } = require('cc');
  const node = createRoundedPanel(name, parent, width, height, fillColor, Math.min(28, height * 0.28));
  node.addComponent(Button);
  place(node, x, y, width, height);
  const label = createLabel(`${name}Label`, node, text, fontSize, textColor);
  label.getComponent(UITransform).setContentSize(width - 24, height - 12);
  label.setPosition(0, 0, 0);
  return node;
}

/**
 * Uses the authored glossy home button art for the primary call to action.
 * It remains a real Cocos Button with an editor-saved Label child; the skin
 * changes presentation only and never stands in for an unavailable action.
 */
async function createPrimaryActionButton(name, parent, text, x, y, width, height, fontSize = 30) {
  const { Color, UITransform } = require('cc');
  const node = await createImageButton(
    name,
    parent,
    width,
    height,
    'db://assets/textures/home/home_start_button.png',
    true,
  );
  place(node, x, y, width, height);
  const label = createLabel(`${name}Label`, node, text, fontSize, new Color(71, 48, 8, 255));
  label.getComponent(UITransform).setContentSize(width - 28, height - 16);
  label.setPosition(0, 0, 0);
  return node;
}

function place(node, x, y, width, height) {
  const { UITransform } = require('cc');
  const transform = node.getComponent(UITransform);
  if (transform && width && height) transform.setContentSize(width, height);
  node.setPosition(x, y, 0);
}

/**
 * Adds the fixed portrait joystick as ordinary scene nodes.  The visible art is
 * editor-saved; JoystickVisual only renders the current genuine input vector.
 * This deliberately refuses to replace an existing overlay so the small
 * migration command is non-destructive.
 */
function addJoystickOverlay(endless) {
  const { Graphics } = require('cc');
  if (endless.getChildByName('Joystick')) {
    throw new Error('Canvas/EndlessHUD/Joystick already exists; refusing to replace editor-saved UI.');
  }
  const joystick = createNode('Joystick', endless, 196, 196);
  place(joystick, 232, -470, 196, 196);
  const joystickBase = createNode('JoystickBase', joystick, 196, 196);
  joystickBase.addComponent(Graphics);
  const joystickKnob = createNode('JoystickKnob', joystick, 76, 76);
  joystickKnob.addComponent(Graphics);
  const joystickVisual = joystick.addComponent(getComponentClass('JoystickVisual'));
  joystickVisual.base = joystickBase;
  joystickVisual.knob = joystickKnob;
  return joystick;
}

function getHomeNode(root, name) {
  return root?.getChildByName(name) || root?.getChildByName('SafeAreaRoot')?.getChildByName(name) || null;
}

exports.load = function load() {};
exports.unload = function unload() {};

exports.methods = {
  /** Read-only readiness probe used by the explicit Creator-side installer. */
  async isArenaSceneReady() {
    const { director } = require('cc');
    const scene = director.getScene();
    const canvas = scene?.getChildByName('Canvas') || null;
    const gameRoot = scene?.getChildByName('GameRoot') || null;
    return {
      ready: !!canvas && !!gameRoot,
      scene: scene?.name || null,
      canvas: !!canvas,
      gameRoot: !!gameRoot,
    };
  },
  /** Readiness probe used before explicitly saving the cosmetic-selection page. */
  async isSkinPageReady() {
    const { director, js } = require('cc');
    const scene = director.getScene();
    return {
      ready: !!scene?.getChildByName('Canvas')
        && !!scene?.getChildByName('GameRoot')
        && !!js.getClassByName('SkinSelectionPageController'),
      scene: scene?.name || null,
      skinControllerImported: !!js.getClassByName('SkinSelectionPageController'),
    };
  },
  async buildMachineVisuals() {
    const { Node } = require('cc');
    const gameRoot = getGameRootFromEditorScene();
    if (!gameRoot) throw new Error('Game.scene does not contain GameRoot');
    const importedSources = {};
    for (const [key, url] of Object.entries(MACHINE_UPGRADE_ASSET_URLS)) {
      importedSources[key] = await getImportedGltfPrefab(url);
    }
    for (const spec of MACHINE_VISUAL_SPECS) await buildMachineVisualPrefab(gameRoot, spec, importedSources);

    const oldLibrary = gameRoot.getChildByName('MachineVisualLibrary');
    if (oldLibrary) oldLibrary.destroy();
    const libraryNode = new Node('MachineVisualLibrary');
    gameRoot.addChild(libraryNode);
    const library = libraryNode.addComponent(getComponentClass('MachineVisualLibrary'));
    const prefabs = await Promise.all(MACHINE_VISUAL_SPECS.map((spec) => getPrefabAsset(spec.prefabUrl)));
    [library.level1Prefab, library.level2Prefab, library.level3Prefab, library.level4Prefab, library.level5Prefab] = prefabs;
    library.bulldozerColorTexture = await getImportedGltfTexture(MACHINE_UPGRADE_ASSET_URLS.chassis);
    library.factoryColorTexture = await getImportedGltfTexture('db://assets/art/machine-modules/Textures/colormap.png');
    await Editor.Message.request('scene', 'save-scene');
    return {
      status: 'PASS',
      libraryPath: 'GameRoot/MachineVisualLibrary',
      prefabUrls: MACHINE_VISUAL_SPECS.map((spec) => spec.prefabUrl),
      levels: MACHINE_VISUAL_SPECS.map((spec) => ({ level: spec.level, partNames: spec.parts.map((part) => part.name) })),
    };
  },
  /**
   * Removes the temporary GameRoot assemblies used while Creator saves each
   * MachineVisual prefab. This must run in the Cocos scene process: deleting
   * those serialized nodes by text editing would corrupt scene ownership and
   * violates the project asset contract.
   */
  async cleanupMachineVisualResidue() {
    const gameRoot = getGameRootFromEditorScene();
    if (!gameRoot) {
      const { director } = require('cc');
      const scene = director.getScene();
      return {
        pending: true,
        sceneName: scene?.name || null,
        rootChildren: scene?.children.map((node) => node.name) || [],
      };
    }
    const residues = gameRoot.children.filter((child) => /^MachineVisual_LV[1-5]$/.test(child.name));
    for (const residue of residues) {
      residue.removeFromParent();
      residue.destroy();
    }
    await Editor.Message.request('scene', 'save-scene');
    return { saved: true, removed: residues.map((node) => node.name), count: residues.length };
  },
  async verifyMachineVisuals() {
    const { director } = require('cc');
    const library = director.getScene()?.getChildByName('GameRoot')?.getChildByName('MachineVisualLibrary')
      ?.getComponent(getComponentClass('MachineVisualLibrary')) || null;
    if (!library) return { ok: false, error: 'GameRoot/MachineVisualLibrary is missing.' };
    try {
      library.validate();
    } catch (error) {
      return { ok: false, error: error.message };
    }
    return {
      ok: true,
      levels: MACHINE_VISUAL_SPECS.map((spec) => ({ level: spec.level, parts: spec.parts.map((part) => part.name) })),
      chassisTexture: library.bulldozerColorTexture?.name || null,
      factoryTexture: library.factoryColorTexture?.name || null,
    };
  },
  async installMachineChassisTemplate() {
    const { director } = require('cc');
    const gameRoot = director.getScene()?.getChildByName('GameRoot') || null;
    const library = gameRoot?.getChildByName('WorldArtLibrary')?.getComponent(getComponentClass('WorldArtLibrary')) || null;
    if (!library) throw new Error('GameRoot/WorldArtLibrary with the WorldArtLibrary component is required.');

    const prefab = await getImportedGltfPrefab(MACHINE_CHASSIS_TEMPLATE_SPEC.url);
    const colorTexture = await getImportedGltfTexture(MACHINE_CHASSIS_TEMPLATE_SPEC.url);
    const result = addObjectArtTemplate(library, MACHINE_CHASSIS_TEMPLATE_SPEC, prefab);
    library.bulldozerColorTexture = colorTexture;
    await Editor.Message.request('scene', 'save-scene');
    return {
      saved: true,
      created: result.created,
      template: MACHINE_CHASSIS_TEMPLATE_SPEC.name,
      // Prefab creation is intentionally not performed from a scene script:
      // Creator shows a native overwrite dialog for an existing asset and
      // suspends the script until it times out. The runtime consumes the
      // Creator-saved WorldArtLibrary template directly.
      prefab: null,
      prefabCreation: 'not-run-from-scene-script',
    };
  },
  async verifyMachineChassisTemplate() {
    const { director } = require('cc');
    const library = director.getScene()?.getChildByName('GameRoot')?.getChildByName('WorldArtLibrary')
      ?.getComponent(getComponentClass('WorldArtLibrary')) || null;
    const template = library?.bulldozerTemplate || null;
    return {
      ok: !!template && template.children.length > 0 && !template.active,
      template: template?.name || null,
      childCount: template?.children.length || 0,
      active: template?.active ?? null,
    };
  },
  async installObjectArtRegistry() {
    const { director } = require('cc');
    const scene = director.getScene();
    const gameRoot = scene?.getChildByName('GameRoot');
    const library = gameRoot?.getChildByName('WorldArtLibrary')?.getComponent(getComponentClass('WorldArtLibrary')) || null;
    if (!library) throw new Error('GameRoot/WorldArtLibrary with the WorldArtLibrary component is required.');

    const created = [];
    const reused = [];
    for (const spec of OBJECT_ART_TEMPLATE_SPECS) {
      // Reading an already-bound glTF through asset-db causes Creator to
      // re-import every embedded-image subasset. Several legacy recyclable
      // models intentionally have embedded colour maps, so that needless
      // re-import can emit a platform-format error despite the template being
      // complete and usable. Only resolve an asset when the scene genuinely
      // needs to create its wrapper.
      if (library[spec.property]?.children.length > 0) {
        reused.push(spec.name);
        continue;
      }
      const prefab = await getImportedGltfPrefab(spec.url);
      const result = addObjectArtTemplate(library, spec, prefab);
      (result.created ? created : reused).push(spec.name);
    }

    // This PNG is an explicit Creator asset reference, not an embedded glTF
    // subasset, so the editor can serialize it reliably into WorldArtLibrary.
    if (!library.prettyParkColorTexture) {
      library.prettyParkColorTexture = await getImportedPngTexture(PRETTY_PARK_COLOR_TEXTURE_URL);
    }

    // The registry deliberately uses unit spawn scale. Existing audited art
    // keeps its established in-editor size through the same template rule.
    normalizeExistingTemplate(library.constructionConeTemplate, 'constructionConeTemplate', [7, 7, 7]);
    normalizeExistingTemplate(library.tireTemplate, 'tireTemplate', [2.5, 2.5, 2.5]);
    normalizeExistingTemplate(library.sedanTemplate, 'sedanTemplate', [1.35, 1.35, 1.35]);

    await Editor.Message.request('scene', 'save-scene');
    return { saved: true, created, reused, total: OBJECT_ART_TEMPLATE_SPECS.length, prettyParkTexture: library.prettyParkColorTexture?.name || null };
  },
  async verifyObjectArtRegistry() {
    const gameRoot = getGameRootFromEditorScene();
    const library = gameRoot?.getChildByName('WorldArtLibrary')?.getComponent(getComponentClass('WorldArtLibrary')) || null;
    if (!library) return { ok: false, error: 'GameRoot/WorldArtLibrary is missing.' };
    const missing = OBJECT_ART_TEMPLATE_SPECS
      .filter((spec) => !library[spec.property] || library[spec.property].children.length === 0)
      .map((spec) => spec.property);
    return {
      ok: missing.length === 0,
      total: OBJECT_ART_TEMPLATE_SPECS.length,
      bound: OBJECT_ART_TEMPLATE_SPECS.length - missing.length,
      missing,
      prettyParkTexture: library.prettyParkColorTexture?.name || null,
    };
  },
  async normalizeWorldArtUnits() {
    const library = getGameRootFromEditorScene()?.getChildByName('WorldArtLibrary')
      ?.getComponent(getComponentClass('WorldArtLibrary')) || null;
    if (!library) return { pending: true, reason: 'GameRoot/WorldArtLibrary is not loaded yet.' };

    const normalized = [];
    for (const spec of WORLD_ART_UNIT_NORMALIZATION) {
      const template = library[spec.property];
      normalizeExistingTemplate(template, spec.property, spec.scale);
      normalized.push({ property: spec.property, scale: spec.scale });
    }

    await Editor.Message.request('scene', 'save-scene');
    return { saved: true, normalized };
  },
  async installInfiniteWorld() {
    const { director, Node } = require('cc');
    const scene = director.getScene();
    const gameRoot = scene?.getChildByName('GameRoot');
    if (!gameRoot) throw new Error('Game.scene does not contain GameRoot');
    const gameManager = gameRoot.getComponent(getComponentClass('GameManager'));
    if (!gameManager) throw new Error('GameRoot is missing GameManager');

    let worldRoot = gameRoot.getChildByName('InfiniteWorldRoot');
    if (!worldRoot) {
      worldRoot = new Node('InfiniteWorldRoot');
      gameRoot.addChild(worldRoot);
    }
    let manager = worldRoot.getComponent(getComponentClass('InfiniteWorldManager'));
    if (!manager) manager = worldRoot.addComponent(getComponentClass('InfiniteWorldManager'));
    gameManager.infiniteWorldManager = manager;
    await Editor.Message.request('scene', 'save-scene');
    return { saved: true, path: 'GameRoot/InfiniteWorldRoot', rootUuid: worldRoot.uuid, component: 'InfiniteWorldManager' };
  },
  async verifyInfiniteWorld() {
    const { director } = require('cc');
    const gameRoot = director.getScene()?.getChildByName('GameRoot');
    const worldRoot = gameRoot?.getChildByName('InfiniteWorldRoot') || null;
    const manager = worldRoot?.getComponent(getComponentClass('InfiniteWorldManager')) || null;
    const gameManager = gameRoot?.getComponent(getComponentClass('GameManager')) || null;
    return {
      ok: !!worldRoot && !!manager && gameManager?.infiniteWorldManager === manager,
      rootExists: !!worldRoot,
      componentExists: !!manager,
      gameManagerBound: gameManager?.infiniteWorldManager === manager,
    };
  },
  async addJoystickOverlay() {
    const { director } = require('cc');
    const endless = director.getScene()?.getChildByName('Canvas')?.getChildByName('EndlessHUD');
    if (!endless) throw new Error('Game.scene does not contain Canvas/EndlessHUD');
    const joystick = addJoystickOverlay(endless);
    await Editor.Message.request('scene', 'save-scene');
    return { saved: true, path: 'Canvas/EndlessHUD/Joystick', uuid: joystick.uuid };
  },
  async prepareHomeSprites() {
    return prepareHomeSprites();
  },
  async verifyHome() {
    const { director, Sprite, Button } = require('cc');
    const root = director.getScene()?.getChildByName('Canvas')?.getChildByName('HomePage');
    if (!root) {
      return { ok: false, error: 'Canvas/HomePage is missing from the open scene.' };
    }

    const requiredSprites = [
      'Background', 'CoinPanel', 'MachineStatus', 'CoinIcon', 'Logo',
      'HeroBlackHole', 'BtnStart', 'BtnMode', 'BtnSkin', 'BtnMachine', 'BtnSettings',
    ];
    const missingSpriteFrames = requiredSprites.filter((name) => {
      const sprite = getHomeNode(root, name)?.getComponent(Sprite);
      return !sprite?.spriteFrame;
    });
    const buttonNames = ['BtnStart', 'BtnMode', 'BtnSkin', 'BtnMachine', 'BtnSettings'];
    const missingButtons = buttonNames.filter((name) => !getHomeNode(root, name)?.getComponent(Button));
    return {
      ok: !!root.getChildByName('SafeAreaRoot') && missingSpriteFrames.length === 0 && missingButtons.length === 0,
      rootUuid: root.uuid,
      spriteCount: requiredSprites.length - missingSpriteFrames.length,
      buttonCount: buttonNames.length - missingButtons.length,
      missingSpriteFrames,
      missingButtons,
    };
  },
  async verifyModeSelect() {
    const { director, Sprite, Button } = require('cc');
    const root = director.getScene()?.getChildByName('Canvas')?.getChildByName('ModeSelectPage');
    if (!root) return { ok: false, error: 'Canvas/ModeSelectPage is missing from the open scene.' };

    const requiredSprites = ['Background', 'BtnBack', 'Header', 'ShelfArena', 'BtnArena', 'ShelfEndless', 'BtnEndless'];
    const buttonNames = ['BtnBack', 'BtnArena', 'BtnEndless'];
    const missingSpriteFrames = requiredSprites.filter((name) => !root.getChildByName(name)?.getComponent(Sprite)?.spriteFrame);
    const missingButtons = buttonNames.filter((name) => !root.getChildByName(name)?.getComponent(Button));
    const arena = root.getChildByName('BtnArena')?.getComponent(Button);
    return {
      ok: missingSpriteFrames.length === 0 && missingButtons.length === 0 && arena?.interactable === true,
      rootUuid: root.uuid,
      spriteCount: requiredSprites.length - missingSpriteFrames.length,
      buttonCount: buttonNames.length - missingButtons.length,
      arenaEnabled: arena?.interactable === true,
      missingSpriteFrames,
      missingButtons,
    };
  },
  async buildModeSelect() {
    const { director, UITransform, Color, Sprite } = require('cc');
    const scene = director.getScene();
    const canvas = scene?.getChildByName('Canvas');
    if (!canvas) throw new Error('Game.scene does not contain Canvas');

    const oldMode = canvas.getChildByName('ModeSelectPage');
    if (oldMode) oldMode.destroy();

    const root = createNode('ModeSelectPage', canvas, 720, 1280);
    const page = root.addComponent(getComponentClass('UIPage'));
    page.pageId = 1;
    const modeCaption = (parent, name, text, fontSize, x, y, width, height, color) => {
      const label = createLabel(name, parent, text, fontSize, color);
      place(label, x, y, width, height);
      return label;
    };

    await createSprite('Background', root, 720, 1280, 'db://assets/textures/home/mode_background.png');
    const back = await createImageButton('BtnBack', root, 104, 104, 'db://assets/textures/home/mode_back.png');
    // Keep the back control fully inside the portrait safe area. The former
    // x=-286 placed 22px of the 104px button outside the 720px design frame,
    // which became a visibly clipped corner on 390px phones.
    place(back, -238, 486, 104, 104);
    const header = await createSprite('Header', root, 430, 100, 'db://assets/textures/home/mode_header.png');
    // Leave a small top breathing room so the title artwork is not cropped by
    // the fixed-width portrait viewport.
    place(header, 24, 478, 430, 100);

    // The V2 mode contract deliberately presents only two real routes.  Do
    // not place locked legacy cards below them: that would imply unavailable
    // game systems and violates the focused vertical-slice navigation.
    const arenaShelf = await createSprite('ShelfArena', root, 600, 42, 'db://assets/textures/home/mode_card_shelf.png');
    place(arenaShelf, 0, 164, 600, 42);
    const arena = await createImageButton('BtnArena', root, 610, 202, 'db://assets/textures/home/mode_arena_card.png', true);
    place(arena, 0, 274, 610, 202);
    // The source artwork was created before ArenaMatchManager existed and
    // carries a stale “功能建设中” badge. Cover only that badge with an
    // authored Sprite surface and a truthful capability label; the button
    // beneath remains the same real local 1v7 match route.
    const arenaAvailability = await createSprite('ArenaAvailability', root, 236, 44, 'db://assets/textures/home/home_hud_panel.png');
    arenaAvailability.getComponent(Sprite).color = new Color(37, 106, 193, 255);
    place(arenaAvailability, -158, 204, 236, 44);
    const arenaAvailabilityLabel = createLabel('ArenaAvailabilityLabel', root, '1v7 本地竞技 · 已开放', 17, new Color(255, 255, 255, 255));
    place(arenaAvailabilityLabel, -158, 204, 224, 34);

    const endlessShelf = await createSprite('ShelfEndless', root, 600, 42, 'db://assets/textures/home/mode_card_shelf.png');
    place(endlessShelf, 0, -76, 600, 42);
    const endless = await createImageButton('BtnEndless', root, 610, 202, 'db://assets/textures/home/mode_endless_card.png');
    place(endless, 0, 34, 610, 202);

    const bestCaption = createLabel('EndlessBestCaption', root, '最高分', 19, new Color(255, 255, 255, 255));
    bestCaption.getComponent(UITransform).setContentSize(100, 34);
    place(bestCaption, -164, -60, 100, 34);
    const bestValue = createLabel('EndlessBestValue', root, '0', 20, new Color(229, 255, 91, 255));
    bestValue.getComponent(UITransform).setContentSize(110, 34);
    place(bestValue, -79, -60, 110, 34);

    root.addComponent(getComponentClass('ModeSelectPageController'));
    root.active = false;
    await Editor.Message.request('scene', 'save-scene');
    // Existing projects own the previously saved prefab. Overwriting it from a
    // scene script opens Creator's native confirmation dialog and blocks the
    // workflow; the runtime consumes this Creator-saved scene page directly.
    return { prefab: null, prefabCreation: 'not-run-from-scene-script', rootUuid: root.uuid };
  },
  async buildHome() {
    const { director, UITransform, Widget, Color, Sprite } = require('cc');
    const scene = director.getScene();
    const canvas = scene && scene.getChildByName('Canvas');
    if (!canvas) throw new Error('Game.scene does not contain Canvas');

    const oldHome = canvas.getChildByName('HomePage');
    if (oldHome) oldHome.destroy();

    const root = createNode('HomePage', canvas, 720, 1280);
    root.addComponent(getComponentClass('UIPage'));
    root.addComponent(getComponentClass('HomePageController'));
    root.addComponent(getComponentClass('HomePageVisual'));

    // Home is a non-interactive destination rather than an active gameplay
    // camera. Use the authored, text-free city park art to meet the V2 bright
    // isometric city composition; it carries no coins, levels or gameplay
    // state, all of which remain bound to the live controllers above it.
    const background = await createSprite('Background', root, 720, 1280, 'db://assets/textures/home/home_city_park.png');
    background.getComponent(Sprite).color = new Color(255, 255, 255, 255);
    const safeArea = createNode('SafeAreaRoot', root, 720, 1280);
    const safeAreaWidget = safeArea.addComponent(Widget);
    safeAreaWidget.isAlignTop = safeAreaWidget.isAlignBottom = true;
    safeAreaWidget.isAlignLeft = safeAreaWidget.isAlignRight = true;
    safeAreaWidget.top = safeAreaWidget.bottom = safeAreaWidget.left = safeAreaWidget.right = 0;
    const coinPanel = await createSprite('CoinPanel', safeArea, 236, 66, 'db://assets/textures/home/home_hud_panel.png');
    const machinePanel = await createSprite('MachineStatus', safeArea, 236, 66, 'db://assets/textures/home/home_hud_panel.png');
    await createSprite('CoinIcon', safeArea, 54, 54, 'db://assets/textures/home/home_coin.png');
    createLabel('CoinValue', safeArea, '0', 34, new Color(255, 222, 83, 255));
    createLabel('MachineName', safeArea, '黑洞回收机', 22, new Color(255, 255, 255, 255));
    createLabel('MachineValue', safeArea, 'LV.1', 30, new Color(255, 222, 83, 255));
    await createSprite('Logo', safeArea, 600, 180, 'db://assets/textures/home/home_logo.png');
    await createSprite('HeroBlackHole', safeArea, 360, 360, 'db://assets/textures/home/home_blackhole_hero.png');
    await createButton('BtnStart', safeArea, '开始吞噬', 46, 'db://assets/textures/home/home_start_button.png');
    await createButton('BtnMode', safeArea, '模式', 25, 'db://assets/textures/home/home_action_mode.png');
    await createButton('BtnSkin', safeArea, '皮肤', 25, 'db://assets/textures/home/home_action_skin.png');
    await createButton('BtnMachine', safeArea, '机器', 25, 'db://assets/textures/home/home_action_machine.png');
    await createButton('BtnSettings', safeArea, '设置', 20, 'db://assets/textures/home/home_settings.png');

    const title = safeArea.getChildByName('Logo');
    title.getComponent(UITransform).setContentSize(600, 180);
    coinPanel.getComponent(UITransform).setContentSize(236, 66);
    machinePanel.getComponent(UITransform).setContentSize(236, 66);

    // The runtime reads this Creator-saved scene page directly. Do not force
    // an overwrite of a separately user-owned HomePage.prefab: Creator would
    // present an overwrite dialog and make automated scene authoring ambiguous.
    await Editor.Message.request('scene', 'save-scene');
    return { prefab: 'scene-owned', rootUuid: root.uuid };
  },
  /**
   * Build the Home "machine" destination through Creator's scene process.
   * The page contains only read-only runtime/configuration facts; it never
   * grants levels or coins and is intentionally not an upgrade shop.
   */
  async buildMachineInfoPage() {
    const { director, Color } = require('cc');
    const scene = director.getScene();
    const canvas = scene?.getChildByName('Canvas');
    if (!canvas) throw new Error('Game.scene does not contain Canvas');
    await prepareRuntimeUISprites();

    const oldPage = canvas.getChildByName('MachineInfoPage');
    if (oldPage) oldPage.destroy();
    const page = createNode('MachineInfoPage', canvas, 720, 1280);
    const pageComponent = page.addComponent(getComponentClass('UIPage'));
    pageComponent.pageId = 8;
    const caption = (name, text, fontSize, x, y, width, height, color = new Color(255, 255, 255, 255)) => {
      const label = createLabel(name, page, text, fontSize, color);
      place(label, x, y, width, height);
      return label;
    };
    const dim = createDimSprite('DimOverlay', page, 720, 1280, new Color(5, 15, 33, 214));
    place(dim, 0, 0, 720, 1280);
    const card = createRoundedPanel('MachineCard', page, 660, 1120, new Color(255, 253, 247, 255), 42);
    place(card, 0, 0, 660, 1120);
    const ribbon = createTitleRibbon('MachineRibbon', page, 500, 108, new Color(52, 153, 98, 255));
    place(ribbon, 0, 462, 500, 108);
    caption('Title', '机器档案', 54, 0, 462, 470, 76, new Color(255, 239, 161, 255));
    caption('Subtitle', '当前回收能力与真实成长记录', 22, 0, 386, 500, 40, new Color(74, 56, 99, 255));

    const currentPanel = createRoundedPanel('CurrentPanel', page, 560, 206, new Color(237, 250, 239, 255), 24);
    place(currentPanel, 0, 258, 560, 206);
    caption('CurrentNameValue', '初级黑洞 · LV.1', 30, 0, 314, 520, 46, new Color(35, 106, 65, 255));
    caption('CurrentMassCaption', '当前质量', 19, -173, 246, 150, 30, new Color(78, 98, 82, 255));
    caption('CurrentMassValue', '0 kg', 22, -173, 212, 150, 36, new Color(44, 76, 54, 255));
    caption('CurrentRadiusCaption', '吸附半径', 19, 0, 246, 150, 30, new Color(78, 98, 82, 255));
    caption('CurrentRadiusValue', '2.4 m', 22, 0, 212, 150, 36, new Color(44, 76, 54, 255));
    caption('CurrentTierCaption', '可吸附', 19, 173, 246, 150, 30, new Color(78, 98, 82, 255));
    caption('CurrentTierValue', 'T1', 22, 173, 212, 150, 36, new Color(44, 76, 54, 255));
    caption('ProgressValue', '下一等级：0 / 900 kg', 20, 0, 142, 500, 38, new Color(114, 63, 193, 255));

    for (let level = 1; level <= 5; level += 1) {
      const y = 54 - (level - 1) * 105;
      const row = createRoundedPanel(`LevelRow${level}`, page, 564, 82, new Color(244, 239, 255, 255), 18);
      place(row, 0, y, 564, 82);
      caption(`LevelRowText${level}`, `LV.${level}`, 19, 0, y, 530, 64, new Color(78, 58, 104, 255));
    }

    createGraphicButton('BtnBack', page, '返回首页', 0, -502, 390, 84, new Color(105, 70, 190, 255), new Color(255, 255, 255, 255), 28);
    page.addComponent(getComponentClass('MachineInfoPageController'));
    page.active = false;
    await Editor.Message.request('scene', 'save-scene');
    return { saved: true, path: 'Canvas/MachineInfoPage', rootUuid: page.uuid };
  },
  /**
   * Saves the skin-selection page through the Creator scene process. Every
   * card, Label and Button is a serialized node; runtime code only binds live
   * save data and never fabricates an unlock UI.
   */
  async buildSkinSelectionPage() {
    const { director, Color, Sprite } = require('cc');
    const scene = director.getScene();
    const canvas = scene?.getChildByName('Canvas');
    if (!canvas) throw new Error('Game.scene does not contain Canvas');
    await prepareRuntimeUISprites();

    const oldPage = canvas.getChildByName('SkinSelectionPage');
    if (oldPage) oldPage.destroy();
    const page = createNode('SkinSelectionPage', canvas, 720, 1280);
    const pageComponent = page.addComponent(getComponentClass('UIPage'));
    pageComponent.pageId = 9;
    const caption = (name, text, fontSize, x, y, width, height, color = new Color(255, 255, 255, 255)) => {
      const label = createLabel(name, page, text, fontSize, color);
      place(label, x, y, width, height);
      return label;
    };
    const dim = createDimSprite('DimOverlay', page, 720, 1280, new Color(5, 15, 33, 222));
    place(dim, 0, 0, 720, 1280);
    const card = createRoundedPanel('SkinPageCard', page, 660, 1140, new Color(255, 253, 247, 255), 42);
    place(card, 0, 0, 660, 1140);
    const ribbon = createTitleRibbon('SkinRibbon', page, 506, 104, new Color(103, 71, 192, 255));
    place(ribbon, 0, 470, 506, 104);
    caption('Title', '引力核心皮肤', 50, 0, 470, 476, 72, new Color(255, 239, 161, 255));
    const coinPanel = createRoundedPanel('CoinPanel', page, 228, 56, new Color(34, 62, 106, 245), 18);
    place(coinPanel, 188, 392, 228, 56);
    caption('CoinCaption', '金币', 18, 128, 392, 82, 32, new Color(233, 244, 255, 255));
    caption('CoinValue', '0', 22, 206, 392, 92, 36, new Color(255, 222, 83, 255));
    const previewPanel = createRoundedPanel('PreviewPanel', page, 568, 148, new Color(238, 232, 255, 255), 24);
    place(previewPanel, 0, 325, 568, 148);
    const preview = await createSprite('PreviewBlackHole', page, 118, 118, 'db://assets/textures/home/home_blackhole_hero.png');
    preview.getComponent(Sprite).color = new Color(224, 213, 255, 255);
    place(preview, -206, 325, 118, 118);
    caption('PreviewNameValue', '紫晶奇点', 25, 48, 350, 310, 36, new Color(83, 58, 126, 255));
    caption('PreviewDescriptionValue', '当前装备的引力核心', 16, 48, 303, 342, 44, new Color(93, 82, 115, 255));

    const rowY = [190, 82, -26, -134, -242];
    for (let index = 0; index < SKIN_PAGE_ACCENTS.length; index += 1) {
      const cardIndex = index + 1;
      const y = rowY[index];
      const row = createRoundedPanel(`SkinCard_${cardIndex}`, page, 568, 88, new Color(246, 242, 235, 255), 18);
      place(row, 0, y, 568, 88);
      const accent = createRoundedPanel(`SkinAccent_${cardIndex}`, page, 46, 46, new Color(...SKIN_PAGE_ACCENTS[index]), 16);
      place(accent, -240, y, 46, 46);
      caption(`SkinName_${cardIndex}`, `皮肤 ${cardIndex}`, 21, -86, y + 17, 320, 32, new Color(70, 53, 98, 255));
      // The selected skin's full description is deliberately displayed in
      // PreviewDescriptionValue above. Reserving this row's second line for
      // ownership avoids a narrow-phone text collision with the action.
      caption(`SkinDescription_${cardIndex}`, '', 1, -86, y - 17, 1, 1, new Color(104, 91, 122, 0));
      caption(`SkinState_${cardIndex}`, '点击使用', 15, -86, y - 17, 320, 28, new Color(95, 110, 95, 255));
      createGraphicButton(`BtnSkin_${cardIndex}`, page, '选择', 210, y, 112, 56, new Color(...SKIN_PAGE_ACCENTS[index]), new Color(255, 255, 255, 255), 18);
    }
    caption('StatusValue', '选择免费皮肤，或使用局内获得的金币解锁', 17, 0, -360, 560, 38, new Color(99, 80, 127, 255));
    createGraphicButton('BtnBack', page, '返回首页', 0, -488, 390, 84, new Color(105, 70, 190, 255), new Color(255, 255, 255, 255), 28);
    page.addComponent(getComponentClass('SkinSelectionPageController'));
    page.active = false;
    await Editor.Message.request('scene', 'save-scene');
    return { saved: true, path: 'Canvas/SkinSelectionPage', rootUuid: page.uuid, cards: SKIN_PAGE_ACCENTS.length };
  },
  async verifySkinSelectionPage() {
    const { director, Button } = require('cc');
    const page = director.getScene()?.getChildByName('Canvas')?.getChildByName('SkinSelectionPage') || null;
    const buttonNames = ['BtnBack', ...SKIN_PAGE_ACCENTS.map((_entry, index) => `BtnSkin_${index + 1}`)];
    const labelNames = ['CoinValue', 'PreviewNameValue', 'PreviewDescriptionValue', 'StatusValue', ...SKIN_PAGE_ACCENTS.flatMap((_entry, index) => [
      `SkinName_${index + 1}`, `SkinDescription_${index + 1}`, `SkinState_${index + 1}`,
    ])];
    const missingButtons = buttonNames.filter((name) => !page?.getChildByName(name)?.getComponent(Button));
    const missingLabels = labelNames.filter((name) => !page?.getChildByName(name));
    return {
      ok: !!page && !!page.getComponent(getComponentClass('SkinSelectionPageController')) && missingButtons.length === 0 && missingLabels.length === 0,
      rootUuid: page?.uuid || null,
      cardCount: SKIN_PAGE_ACCENTS.filter((_entry, index) => !!page?.getChildByName(`SkinCard_${index + 1}`)).length,
      missingButtons,
      missingLabels,
    };
  },
  /**
   * Attach arena authority through Cocos Creator itself. The component is
   * intentionally never added by game runtime code, so a missing scene save
   * cannot masquerade as a working arena.
   */
  async installArenaMatch() {
    const { director, Node } = require('cc');
    const scene = director.getScene();
    const gameRoot = scene?.getChildByName('GameRoot');
    if (!gameRoot) throw new Error('Game.scene does not contain GameRoot');
    const gameManager = gameRoot.getComponent(getComponentClass('GameManager'));
    if (!gameManager) throw new Error('GameRoot is missing GameManager');
    let root = gameRoot.getChildByName('ArenaMatchRoot');
    if (!root) {
      root = new Node('ArenaMatchRoot');
      gameRoot.addChild(root);
    }
    let arena = root.getComponent(getComponentClass('ArenaMatchManager'));
    if (!arena) arena = root.addComponent(getComponentClass('ArenaMatchManager'));
    root.active = false;
    gameManager.arenaMatchManager = arena;
    await Editor.Message.request('scene', 'save-scene');
    return { saved: true, path: 'GameRoot/ArenaMatchRoot', rootUuid: root.uuid, component: 'ArenaMatchManager' };
  },
  async verifyArenaMatch() {
    const { director } = require('cc');
    const gameRoot = director.getScene()?.getChildByName('GameRoot');
    const root = gameRoot?.getChildByName('ArenaMatchRoot') || null;
    const arena = root?.getComponent(getComponentClass('ArenaMatchManager')) || null;
    const gameManager = gameRoot?.getComponent(getComponentClass('GameManager')) || null;
    return {
      ok: !!root && !!arena && gameManager?.arenaMatchManager === arena,
      rootExists: !!root,
      componentExists: !!arena,
      gameManagerBound: gameManager?.arenaMatchManager === arena,
    };
  },
  async buildRuntimePages() {
    const { director, Color, UITransform, Sprite } = require('cc');
    const scene = director.getScene();
    const canvas = scene?.getChildByName('Canvas');
    if (!canvas) throw new Error('Game.scene does not contain Canvas');
    await prepareRuntimeUISprites();
    const RuntimePageInputRouter = getComponentClass('RuntimePageInputRouter');
    if (!canvas.getComponent(RuntimePageInputRouter)) canvas.addComponent(RuntimePageInputRouter);

    for (const name of ['EndlessHUD', 'ArenaHUD', 'RevivePage', 'PausePage', 'SettlementPage']) {
      const oldPage = canvas.getChildByName(name);
      if (oldPage) oldPage.destroy();
    }

    const caption = (parent, name, text, fontSize, x, y, width = 300, height = 48, color = new Color(255, 255, 255, 255)) => {
      const label = createLabel(name, parent, text, fontSize, color);
      place(label, x, y, width, height);
      return label;
    };
    // Endless gameplay HUD. The labels are updated from live GameManager data.
    const endless = createNode('EndlessHUD', canvas, 720, 1280);
    const endlessPage = endless.addComponent(getComponentClass('UIPage'));
    endlessPage.pageId = 3;
    const topShade = await createSprite('TopShade', endless, 720, 156, 'db://assets/textures/home/home_hud_panel.png');
    topShade.getComponent(Sprite).color = new Color(12, 27, 44, 228);
    // Canvas uses a letterboxed portrait viewport. These top controls are
    // calibrated against the actual UI camera (rather than raw 1280 px
    // coordinates) so they remain inside the phone safe area.
    place(topShade, 0, 483, 720, 156);
    const coinPanel = await createSprite('CoinPanel', endless, 218, 64, 'db://assets/textures/home/home_hud_panel.png');
    place(coinPanel, -210, 430, 218, 64);
    const levelPanel = await createSprite('LevelPanel', endless, 250, 64, 'db://assets/textures/home/home_hud_panel.png');
    place(levelPanel, 106, 430, 250, 64);
    const regionPanel = await createSprite('RegionPanel', endless, 258, 54, 'db://assets/textures/home/home_hud_panel.png');
    place(regionPanel, 0, 346, 258, 54);
    await createSprite('CoinIcon', endless, 46, 46, 'db://assets/textures/home/home_coin.png');
    place(endless.getChildByName('CoinIcon'), -294, 430, 46, 46);
    caption(endless, 'CoinValue', '0', 28, -188, 430, 132, 48, new Color(255, 222, 83, 255));
    caption(endless, 'LevelValue', 'LV.1 回收小车', 20, 106, 443, 238, 34);
    caption(endless, 'MassValue', '质量 0 kg', 18, 106, 409, 238, 30, new Color(219, 242, 255, 255));
    caption(endless, 'RegionValue', '卧室杂物区', 18, 0, 346, 240, 32, new Color(232, 245, 255, 255));
    createGraphicButton('BtnPause', endless, 'Ⅱ', 274, 474, 58, 58, new Color(42, 75, 111, 245), new Color(255, 255, 255, 255), 31);
    addJoystickOverlay(endless);
    endless.addComponent(getComponentClass('EndlessHUDController'));
    endless.active = false;

    // Arena gameplay HUD. Its five leaderboard rows, timer, mass, rank and
    // kills are all replaced by ArenaHUDController from ArenaMatchManager's
    // real match snapshot; no design-time scores are presented as live data.
    const arena = createNode('ArenaHUD', canvas, 720, 1280);
    const arenaPage = arena.addComponent(getComponentClass('UIPage'));
    arenaPage.pageId = 2;
    // Keep the match data visible but leave the city and nearby competitors
    // readable. The older board occupied most of the upper-left portrait
    // playfield and made the arena look empty even when real bots were there.
    const arenaBoard = createRoundedPanel('LeaderboardPanel', arena, 236, 276, new Color(12, 27, 56, 226), 24);
    place(arenaBoard, -226, 352, 236, 276);
    caption(arena, 'ArenaTitle', '黑洞乱斗', 27, -226, 465, 214, 42, new Color(255, 239, 164, 255));
    for (let index = 0; index < 5; index++) {
      const row = createRoundedPanel(`TopRow${index + 1}`, arena, 208, 34, new Color(49, 74, 124, 220), 10);
      place(row, -226, 408 - index * 43, 208, 34);
      caption(arena, `Top${index + 1}`, `${index + 1}. 等待匹配`, 15, -226, 408 - index * 43, 196, 30, new Color(244, 249, 255, 255));
    }
    const timerPanel = createRoundedPanel('TimerPanel', arena, 160, 62, new Color(255, 248, 232, 244), 20);
    place(timerPanel, 0, 492, 160, 62);
    caption(arena, 'TimerValue', '03:00', 28, 0, 492, 148, 46, new Color(68, 56, 101, 255));
    const statusPanel = createRoundedPanel('StatusPanel', arena, 220, 82, new Color(15, 42, 79, 232), 19);
    place(statusPanel, 222, 415, 220, 82);
    caption(arena, 'RankValue', '第 - / 8', 19, 222, 434, 200, 30, new Color(255, 239, 164, 255));
    caption(arena, 'MassValue', '0 kg', 18, 222, 405, 200, 28, new Color(235, 248, 255, 255));
    caption(arena, 'KillCaption', '淘汰', 14, 183, 380, 58, 24, new Color(185, 218, 255, 255));
    caption(arena, 'KillValue', '0', 20, 251, 380, 46, 26, new Color(255, 205, 77, 255));
    caption(arena, 'StatusValue', '等待开局', 17, 0, -518, 420, 34, new Color(245, 249, 255, 255));
    createGraphicButton('BtnPause', arena, 'Ⅱ', 294, 500, 58, 58, new Color(42, 75, 111, 245), new Color(255, 255, 255, 255), 31);
    // The arrows are ordinary Creator-saved HUD nodes. ArenaHUDController
    // activates them only when a live bot is actually outside the 3D camera
    // viewport, so they do not pretend to be a minimap or a scripted marker.
    const createBotArrow = (name, text, x, y) => {
      const arrow = createRoundedPanel(name, arena, 58, 58, new Color(111, 73, 225, 230), 29);
      place(arrow, x, y, 58, 58);
      const label = createLabel(`${name}Label`, arrow, text, 30, new Color(255, 255, 255, 255));
      label.getComponent(UITransform).setContentSize(50, 50);
      label.setPosition(0, 0, 0);
      arrow.active = false;
    };
    createBotArrow('BotArrowLeft', '←', -276, 26);
    createBotArrow('BotArrowRight', '→', 276, 26);
    createBotArrow('BotArrowTop', '↑', 0, 350);
    createBotArrow('BotArrowBottom', '↓', 0, -344);
    addJoystickOverlay(arena);
    arena.addComponent(getComponentClass('ArenaHUDController'));
    arena.active = false;

    // Revive is an actual post-defeat branch. Countdown, rank and loss text
    // are updated from the live match; the buttons either respawn the player
    // or end the real local match.
    const revive = createNode('RevivePage', canvas, 720, 1280);
    const revivePage = revive.addComponent(getComponentClass('UIPage'));
    revivePage.pageId = 4;
    const reviveDim = createDimSprite('DimOverlay', revive, 720, 1280, new Color(5, 13, 31, 208));
    place(reviveDim, 0, 0, 720, 1280);
    const reviveCard = createRoundedPanel('ReviveCard', revive, 620, 900, new Color(255, 250, 238, 255), 42);
    place(reviveCard, 0, -28, 620, 900);
    // Reuse the existing Creator-imported, text-free singularity artwork as
    // a visual focal point. It sits behind the urgent ribbon, while match
    // facts and both real actions remain separate editor-saved controls.
    const reviveHero = await createSprite('ReviveBlackHoleHero', revive, 246, 246, 'db://assets/textures/home/home_blackhole_hero.png');
    place(reviveHero, 0, 164, 246, 246);
    // Three saved, non-interactive accent strokes give the revive branch the
    // same urgent colour hierarchy as the approved V2 direction.  The two
    // real buttons remain the only actionable controls on this page.
    const reviveAccentPurple = createRoundedPanel('ReviveAccentPurple', revive, 470, 38, new Color(166, 74, 225, 255), 18);
    place(reviveAccentPurple, 0, 292, 470, 38);
    reviveAccentPurple.setRotationFromEuler(0, 0, 8);
    const reviveAccentOrange = createRoundedPanel('ReviveAccentOrange', revive, 500, 38, new Color(255, 116, 22, 255), 18);
    place(reviveAccentOrange, 0, 264, 500, 38);
    reviveAccentOrange.setRotationFromEuler(0, 0, -7);
    const reviveAccentBlue = createRoundedPanel('ReviveAccentBlue', revive, 460, 38, new Color(72, 163, 255, 255), 18);
    place(reviveAccentBlue, 0, 236, 460, 38);
    reviveAccentBlue.setRotationFromEuler(0, 0, 6);
    const reviveRibbon = createTitleRibbon('ReviveRibbon', revive, 440, 102, new Color(105, 70, 190, 255));
    place(reviveRibbon, 0, 264, 440, 102);
    caption(revive, 'Title', '复活继续', 52, 0, 264, 420, 74, new Color(255, 230, 102, 255));
    caption(revive, 'LossValue', '黑洞被吞噬 · 掉落了部分质量', 23, 0, 36, 510, 46, new Color(74, 56, 99, 255));
    const countdownPanel = createRoundedPanel('CountdownPanel', revive, 218, 96, new Color(238, 231, 255, 255), 24);
    place(countdownPanel, 0, -46, 218, 96);
    caption(revive, 'CountdownValue', '2.5s', 40, 0, -46, 198, 72, new Color(105, 70, 190, 255));
    caption(revive, 'RankValue', '当前第 - / 8', 23, 0, -128, 420, 42, new Color(74, 56, 99, 255));
    await createPrimaryActionButton('BtnRevive', revive, '立即复活', 0, -250, 392, 98, 32);
    createGraphicButton('BtnGiveUp', revive, '结束本局', 0, -378, 340, 78, new Color(105, 70, 190, 255), new Color(255, 255, 255, 255), 26);
    revive.addComponent(getComponentClass('RevivePageController'));
    revive.active = false;

    // Pause page. Gameplay is frozen by GameManager before this page is shown.
    const pause = createNode('PausePage', canvas, 720, 1280);
    const pausePage = pause.addComponent(getComponentClass('UIPage'));
    pausePage.pageId = 6;
    const dim = createDimSprite('DimOverlay', pause, 720, 1280, new Color(4, 12, 27, 218));
    place(dim, 0, 0, 720, 1280);
    const pauseCard = createRoundedPanel('PauseCard', pause, 620, 640, new Color(247, 245, 255, 255), 40);
    place(pauseCard, 0, 10, 620, 640);
    const pauseRibbon = createTitleRibbon('PauseRibbon', pause, 440, 92, new Color(105, 70, 190, 255));
    place(pauseRibbon, 0, 250, 440, 92);
    caption(pause, 'Title', '游戏暂停', 50, 0, 250, 420, 74, new Color(255, 255, 255, 255));
    caption(pause, 'Subtitle', '当前进度已冻结', 24, 0, 156, 440, 46, new Color(74, 56, 99, 255));
    await createPrimaryActionButton('BtnResume', pause, '继续游戏', 0, 44, 390, 104, 34);
    createGraphicButton('BtnSettle', pause, '结束并结算', 0, -94, 340, 88, new Color(122, 87, 212, 255), new Color(255, 255, 255, 255), 28);
    createGraphicButton('BtnHome', pause, '返回首页', 0, -208, 340, 78, new Color(69, 139, 218, 255), new Color(255, 255, 255, 255), 26);
    pause.addComponent(getComponentClass('PausePageController'));
    pause.active = false;

    // The base card is used for endless results. Arena gets a separately
    // composed, editor-saved top-five panel which is populated exclusively
    // from ArenaMatchManager's live leaderboard by SettlementPageController.
    const settlement = createNode('SettlementPage', canvas, 720, 1280);
    const settlementPage = settlement.addComponent(getComponentClass('UIPage'));
    settlementPage.pageId = 5;
    const settlementDim = createDimSprite('DimOverlay', settlement, 720, 1280, new Color(5, 14, 29, 210));
    place(settlementDim, 0, 0, 720, 1280);
    const settlementCard = createRoundedPanel('SettlementCard', settlement, 660, 1120, new Color(255, 248, 230, 255), 42);
    place(settlementCard, 0, 0, 660, 1120);
    const settlementRibbon = createTitleRibbon('SettlementRibbon', settlement, 492, 112, new Color(105, 70, 190, 255));
    place(settlementRibbon, 0, 452, 492, 112);
    const settlementCoinLeft = await createSprite('SettlementCoinLeft', settlement, 66, 66, 'db://assets/textures/home/home_coin.png');
    place(settlementCoinLeft, -266, 452, 66, 66);
    const settlementCoinRight = await createSprite('SettlementCoinRight', settlement, 66, 66, 'db://assets/textures/home/home_coin.png');
    place(settlementCoinRight, 266, 452, 66, 66);
    caption(settlement, 'Title', '本局结算', 56, 0, 452, 470, 78, new Color(255, 222, 86, 255));
    caption(settlement, 'Subtitle', '无尽吞噬 · 本局数据', 24, 0, 370, 420, 46, new Color(73, 55, 99, 255));
    const rowColor = new Color(74, 56, 40, 255);
    for (const y of [223, 143, 63, -17, -97]) {
      const row = createRoundedPanel(`StatRow_${y}`, settlement, 530, 66, new Color(249, 239, 255, 255), 18);
      place(row, 0, y, 530, 62);
    }
    caption(settlement, 'AbsorbedCaption', '吞噬物品', 26, -166, 223, 220, 44, rowColor);
    caption(settlement, 'AbsorbedValue', '0', 32, 164, 223, 180, 48, new Color(114, 63, 193, 255));
    caption(settlement, 'MassCaption', '最终质量', 26, -166, 143, 220, 44, rowColor);
    caption(settlement, 'MassValue', '0 kg', 32, 164, 143, 180, 48, new Color(114, 63, 193, 255));
    caption(settlement, 'CoinCaption', '获得金币', 26, -166, 63, 220, 44, rowColor);
    caption(settlement, 'CoinValue', '0', 32, 164, 63, 180, 48, new Color(214, 143, 25, 255));
    caption(settlement, 'LevelCaption', '最终等级', 26, -166, -17, 220, 44, rowColor);
    caption(settlement, 'LevelValue', 'LV.1', 32, 164, -17, 180, 48, new Color(68, 129, 209, 255));
    caption(settlement, 'RegionCaption', '探索区域', 26, -166, -97, 220, 44, rowColor);
    caption(settlement, 'RegionValue', '1', 32, 164, -97, 180, 48, new Color(62, 154, 95, 255));
    const arenaLeaderboard = createRoundedPanel('ArenaLeaderboardPanel', settlement, 570, 530, new Color(242, 237, 255, 255), 26);
    place(arenaLeaderboard, 0, 100, 570, 530);
    caption(settlement, 'ArenaResult', '第 - / 8 名 · 0 kg', 24, 0, 322, 510, 40, new Color(77, 54, 109, 255));
    const arenaRankColors = [
      new Color(255, 207, 66, 255),
      new Color(183, 210, 240, 255),
      new Color(224, 157, 89, 255),
      new Color(126, 104, 206, 255),
      new Color(95, 152, 212, 255),
    ];
    for (let index = 0; index < 5; index += 1) {
      const rank = index + 1;
      const y = 248 - index * 74;
      const row = createRoundedPanel(`ArenaRankRow_${rank}`, settlement, 522, 66, new Color(255, 255, 255, 230), 18);
      place(row, 0, y, 522, 66);
      const badge = createRoundedPanel(`ArenaRankBadgePanel_${rank}`, settlement, 50, 50, arenaRankColors[index], 16);
      place(badge, -212, y, 50, 50);
      caption(settlement, `ArenaRankBadge_${rank}`, `${rank}`, 24, -212, y, 46, 42, new Color(60, 43, 25, 255));
      caption(settlement, `ArenaRankName_${rank}`, `选手 ${rank}`, 23, -110, y, 152, 42, new Color(56, 42, 82, 255));
      caption(settlement, `ArenaRankScore_${rank}`, '0 kg · 0 淘汰', 18, 118, y, 210, 38, new Color(101, 82, 125, 255));
    }
    const arenaPlayerRow = createRoundedPanel('ArenaPlayerRow', settlement, 522, 70, new Color(221, 248, 205, 255), 18);
    place(arenaPlayerRow, 0, -124, 522, 70);
    const arenaPlayerBadge = createRoundedPanel('ArenaPlayerBadgePanel', settlement, 50, 50, new Color(104, 193, 89, 255), 16);
    place(arenaPlayerBadge, -212, -124, 50, 50);
    caption(settlement, 'ArenaPlayerBadge', '-', 24, -212, -124, 46, 42, new Color(25, 82, 32, 255));
    caption(settlement, 'ArenaPlayerName', '我', 26, -110, -124, 152, 42, new Color(29, 118, 37, 255));
    caption(settlement, 'ArenaPlayerScore', '0 kg · 0 淘汰', 18, 118, -124, 210, 38, new Color(42, 122, 53, 255));
    const arenaStatSpecs = [
      { key: 'Mass', x: -184, caption: '最终质量', value: '0 kg', color: new Color(114, 63, 193, 255) },
      { key: 'Kills', x: 0, caption: '击败对手', value: '0 次', color: new Color(217, 126, 40, 255) },
      { key: 'Time', x: 184, caption: '生存时长', value: '0:00', color: new Color(56, 137, 198, 255) },
    ];
    for (const stat of arenaStatSpecs) {
      const panel = createRoundedPanel(`ArenaStat${stat.key}Panel`, settlement, 164, 104, new Color(241, 237, 255, 255), 22);
      place(panel, stat.x, -244, 164, 104);
      caption(settlement, `ArenaStat${stat.key}Caption`, stat.caption, 17, stat.x, -221, 150, 30, new Color(83, 63, 108, 255));
      caption(settlement, `ArenaStat${stat.key}Value`, stat.value, 25, stat.x, -259, 152, 40, stat.color);
    }
    const arenaReward = createRoundedPanel('ArenaRewardPanel', settlement, 522, 94, new Color(255, 244, 202, 255), 24);
    place(arenaReward, 0, -366, 522, 94);
    caption(settlement, 'ArenaRewardCaption', '本局获得金币', 22, -150, -348, 244, 38, new Color(120, 80, 31, 255));
    caption(settlement, 'ArenaRewardValue', '+0', 34, 164, -348, 180, 46, new Color(215, 139, 20, 255));
    caption(settlement, 'ArenaRewardBreakdown', '质量 0 · 收集 0 · 淘汰 0 · 生存 0 · 名次 0', 15, 0, -385, 480, 28, new Color(137, 104, 58, 255));
    arenaLeaderboard.active = false;
    settlement.getChildByName('ArenaResult').active = false;
    for (let rank = 1; rank <= 5; rank += 1) {
      settlement.getChildByName(`ArenaRankRow_${rank}`).active = false;
      settlement.getChildByName(`ArenaRankBadgePanel_${rank}`).active = false;
      settlement.getChildByName(`ArenaRankBadge_${rank}`).active = false;
      settlement.getChildByName(`ArenaRankName_${rank}`).active = false;
      settlement.getChildByName(`ArenaRankScore_${rank}`).active = false;
    }
    for (const name of ['ArenaPlayerRow', 'ArenaPlayerBadgePanel', 'ArenaPlayerBadge', 'ArenaPlayerName', 'ArenaPlayerScore']) {
      settlement.getChildByName(name).active = false;
    }
    for (const name of [
      'ArenaStatMassPanel', 'ArenaStatKillsPanel', 'ArenaStatTimePanel', 'ArenaRewardPanel',
      'ArenaStatMassCaption', 'ArenaStatMassValue', 'ArenaStatKillsCaption', 'ArenaStatKillsValue',
      'ArenaStatTimeCaption', 'ArenaStatTimeValue', 'ArenaRewardCaption', 'ArenaRewardValue', 'ArenaRewardBreakdown',
    ]) {
      settlement.getChildByName(name).active = false;
    }
    await createPrimaryActionButton('BtnRestart', settlement, '再来一局', -142, -480, 270, 94, 28);
    createGraphicButton('BtnHome', settlement, '返回首页', 142, -480, 270, 94, new Color(105, 70, 190, 255), new Color(255, 255, 255, 255), 28);
    settlement.addComponent(getComponentClass('SettlementPageController'));
    settlement.active = false;

    await Editor.Message.request('scene', 'save-scene');
    return {
      savedPages: ['EndlessHUD', 'ArenaHUD', 'RevivePage', 'PausePage', 'SettlementPage'],
      prefabCreation: 'not-run-from-scene-script',
    };
  },
  async verifyRuntimePages() {
    const { director, Button } = require('cc');
    const canvas = director.getScene()?.getChildByName('Canvas');
    const requirements = [
      { name: 'EndlessHUD', component: 'EndlessHUDController', buttons: ['BtnPause'], nodes: ['Joystick', 'JoystickBase', 'JoystickKnob'] },
      { name: 'ArenaHUD', component: 'ArenaHUDController', buttons: ['BtnPause'], nodes: ['Top1', 'Top2', 'Top3', 'Top4', 'Top5', 'TimerValue', 'Joystick'] },
      { name: 'RevivePage', component: 'RevivePageController', buttons: ['BtnRevive', 'BtnGiveUp'], nodes: ['CountdownValue', 'RankValue'] },
      { name: 'PausePage', component: 'PausePageController', buttons: ['BtnResume', 'BtnSettle', 'BtnHome'] },
      { name: 'SettlementPage', component: 'SettlementPageController', buttons: ['BtnRestart', 'BtnHome'], nodes: ['ArenaLeaderboardPanel', 'ArenaRankRow_1', 'ArenaRankRow_5', 'ArenaStatMassValue', 'ArenaRewardValue'] },
      { name: 'MachineInfoPage', component: 'MachineInfoPageController', buttons: ['BtnBack'], nodes: ['CurrentNameValue', 'CurrentMassValue', 'CurrentRadiusValue', 'CurrentTierValue', 'ProgressValue', 'LevelRowText1', 'LevelRowText5'] },
    ];
    const report = requirements.map((requirement) => {
      const root = canvas?.getChildByName(requirement.name);
      const missingButtons = requirement.buttons.filter((buttonName) => !root?.getChildByName(buttonName)?.getComponent(Button));
      const joystick = root?.getChildByName('Joystick');
      const missingNodes = (requirement.nodes || []).filter((nodeName) => !root?.getChildByName(nodeName) && !joystick?.getChildByName(nodeName));
      return {
        name: requirement.name,
        exists: !!root,
        controller: !!root?.getComponent(getComponentClass(requirement.component)),
        missingButtons,
        missingNodes,
      };
    });
    const LegacyRoundedPanelGraphic = getComponentClass('RoundedPanelGraphic');
    const legacyPanelCount = canvas ? canvas.getComponentsInChildren(LegacyRoundedPanelGraphic).length : -1;
    return {
      ok: report.every((entry) => entry.exists && entry.controller && entry.missingButtons.length === 0 && entry.missingNodes.length === 0) && legacyPanelCount === 0,
      report,
      legacyPanelCount,
    };
  },
};
