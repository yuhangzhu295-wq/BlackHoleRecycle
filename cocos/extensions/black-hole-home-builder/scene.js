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

// Each wrapper is a regular scene Node saved by Cocos Creator. The glTF
// prefab stays as its child and receives the normalization scale here, rather
// than accepting arbitrary runtime scale values per object type.
const OBJECT_ART_TEMPLATE_SPECS = [
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
  const { Node, UITransform, Label, Color, Layers, HorizontalTextAlignment, VerticalTextAlignment } = require('cc');
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(600, fontSize + 22);
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = fontSize + 12;
  label.color = color || new Color(255, 255, 255, 255);
  label.horizontalAlign = HorizontalTextAlignment.CENTER;
  label.verticalAlign = VerticalTextAlignment.CENTER;
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
  async buildMachineVisuals() {
    const { director, Node } = require('cc');
    const gameRoot = director.getScene()?.getChildByName('GameRoot');
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
      const prefab = await getImportedGltfPrefab(spec.url);
      const result = addObjectArtTemplate(library, spec, prefab);
      (result.created ? created : reused).push(spec.name);
    }

    // The registry deliberately uses unit spawn scale. Existing audited art
    // keeps its established in-editor size through the same template rule.
    normalizeExistingTemplate(library.constructionConeTemplate, 'constructionConeTemplate', [7, 7, 7]);
    normalizeExistingTemplate(library.tireTemplate, 'tireTemplate', [2.5, 2.5, 2.5]);
    normalizeExistingTemplate(library.sedanTemplate, 'sedanTemplate', [1.35, 1.35, 1.35]);

    await Editor.Message.request('scene', 'save-scene');
    return { saved: true, created, reused, total: OBJECT_ART_TEMPLATE_SPECS.length };
  },
  async verifyObjectArtRegistry() {
    const { director } = require('cc');
    const gameRoot = director.getScene()?.getChildByName('GameRoot');
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
    };
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
      ok: missingSpriteFrames.length === 0 && missingButtons.length === 0 && arena?.interactable === false,
      rootUuid: root.uuid,
      spriteCount: requiredSprites.length - missingSpriteFrames.length,
      buttonCount: buttonNames.length - missingButtons.length,
      arenaDisabled: arena?.interactable === false,
      missingSpriteFrames,
      missingButtons,
    };
  },
  async buildModeSelect() {
    const { director, UITransform, Color } = require('cc');
    const scene = director.getScene();
    const canvas = scene?.getChildByName('Canvas');
    if (!canvas) throw new Error('Game.scene does not contain Canvas');

    const oldMode = canvas.getChildByName('ModeSelectPage');
    if (oldMode) oldMode.destroy();

    const root = createNode('ModeSelectPage', canvas, 720, 1280);
    const page = root.addComponent(getComponentClass('UIPage'));
    page.pageId = 1;

    await createSprite('Background', root, 720, 1280, 'db://assets/textures/home/mode_background.png');
    const back = await createImageButton('BtnBack', root, 104, 104, 'db://assets/textures/home/mode_back.png');
    place(back, -286, 540, 104, 104);
    const header = await createSprite('Header', root, 500, 116, 'db://assets/textures/home/mode_header.png');
    place(header, 0, 530, 500, 116);

    const arenaShelf = await createSprite('ShelfArena', root, 600, 52, 'db://assets/textures/home/mode_card_shelf.png');
    place(arenaShelf, 0, 78, 600, 52);
    const arena = await createImageButton('BtnArena', root, 610, 278, 'db://assets/textures/home/mode_arena_card.png', false);
    place(arena, 0, 185, 610, 278);

    const endlessShelf = await createSprite('ShelfEndless', root, 600, 52, 'db://assets/textures/home/mode_card_shelf.png');
    place(endlessShelf, 0, -292, 600, 52);
    const endless = await createImageButton('BtnEndless', root, 610, 278, 'db://assets/textures/home/mode_endless_card.png');
    place(endless, 0, -185, 610, 278);
    const bestCaption = createLabel('EndlessBestCaption', root, '最高分', 19, new Color(255, 255, 255, 255));
    bestCaption.getComponent(UITransform).setContentSize(100, 34);
    place(bestCaption, -164, -247, 100, 34);
    const bestValue = createLabel('EndlessBestValue', root, '0', 20, new Color(229, 255, 91, 255));
    bestValue.getComponent(UITransform).setContentSize(110, 34);
    place(bestValue, -79, -247, 110, 34);

    root.addComponent(getComponentClass('ModeSelectPageController'));
    root.active = false;
    await Editor.Message.request('scene', 'save-scene');
    await Editor.Message.request('scene', 'create-prefab', root.uuid, 'db://assets/prefabs/ui/ModeSelectPage.prefab');
    await Editor.Message.request('scene', 'save-scene');
    return { prefab: 'db://assets/prefabs/ui/ModeSelectPage.prefab', rootUuid: root.uuid };
  },
  async buildHome() {
    const { director, UITransform, Widget, Color } = require('cc');
    const scene = director.getScene();
    const canvas = scene && scene.getChildByName('Canvas');
    if (!canvas) throw new Error('Game.scene does not contain Canvas');

    const oldHome = canvas.getChildByName('HomePage');
    if (oldHome) oldHome.destroy();

    const root = createNode('HomePage', canvas, 720, 1280);
    root.addComponent(getComponentClass('UIPage'));
    root.addComponent(getComponentClass('HomePageController'));
    root.addComponent(getComponentClass('HomePageVisual'));

    await createSprite('Background', root, 720, 1280, 'db://assets/textures/home/home_city_park.png');
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

    await Editor.Message.request('scene', 'save-scene');
    await Editor.Message.request('scene', 'create-prefab', root.uuid, 'db://assets/prefabs/ui/HomePage.prefab');
    await Editor.Message.request('scene', 'save-scene');
    return { prefab: 'db://assets/prefabs/ui/HomePage.prefab', rootUuid: root.uuid };
  },
  async buildRuntimePages() {
    const { director, Color, Graphics, UITransform, Sprite } = require('cc');
    const scene = director.getScene();
    const canvas = scene?.getChildByName('Canvas');
    if (!canvas) throw new Error('Game.scene does not contain Canvas');
    const RuntimePageInputRouter = getComponentClass('RuntimePageInputRouter');
    if (!canvas.getComponent(RuntimePageInputRouter)) canvas.addComponent(RuntimePageInputRouter);

    for (const name of ['EndlessHUD', 'PausePage', 'SettlementPage']) {
      const oldPage = canvas.getChildByName(name);
      if (oldPage) oldPage.destroy();
    }

    const caption = (parent, name, text, fontSize, x, y, width = 300, height = 48, color = new Color(255, 255, 255, 255)) => {
      const label = createLabel(name, parent, text, fontSize, color);
      place(label, x, y, width, height);
      return label;
    };
    const imageButton = async (name, parent, text, x, y, width, height, assetUrl, fontSize = 30) => {
      const button = await createImageButton(name, parent, width, height, assetUrl);
      place(button, x, y, width, height);
      caption(button, `${name}Label`, text, fontSize, 0, 0, width, height);
      return button;
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
    await imageButton('BtnPause', endless, '暂停', 240, 461, 82, 82, 'db://assets/textures/home/home_settings.png', 19);
    addJoystickOverlay(endless);
    endless.addComponent(getComponentClass('EndlessHUDController'));
    endless.active = false;

    // Pause page. Gameplay is frozen by GameManager before this page is shown.
    const pause = createNode('PausePage', canvas, 720, 1280);
    const pausePage = pause.addComponent(getComponentClass('UIPage'));
    pausePage.pageId = 6;
    const dim = await createSprite('DimOverlay', pause, 720, 1280, 'db://assets/textures/home/home_hud_panel.png');
    dim.getComponent(Sprite).color = new Color(4, 12, 27, 226);
    place(dim, 0, 0, 720, 1280);
    const pauseCard = await createSprite('PauseCard', pause, 620, 640, 'db://assets/textures/home/home_hud_panel.png');
    pauseCard.getComponent(Sprite).color = new Color(24, 47, 76, 255);
    place(pauseCard, 0, 10, 620, 640);
    caption(pause, 'Title', '游戏暂停', 54, 0, 222, 520, 82, new Color(255, 222, 83, 255));
    caption(pause, 'Subtitle', '当前进度已冻结', 24, 0, 146, 440, 46, new Color(222, 240, 255, 255));
    await imageButton('BtnResume', pause, '继续游戏', 0, 54, 382, 104, 'db://assets/textures/home/home_start_button.png', 34);
    await imageButton('BtnSettle', pause, '结束并结算', 0, -86, 320, 94, 'db://assets/textures/home/home_action_skin.png', 29);
    await imageButton('BtnHome', pause, '返回首页', 0, -205, 320, 88, 'db://assets/textures/home/home_action_mode.png', 27);
    pause.addComponent(getComponentClass('PausePageController'));
    pause.active = false;

    // Endless settlement. Every displayed result is overwritten with session data.
    const settlement = createNode('SettlementPage', canvas, 720, 1280);
    const settlementPage = settlement.addComponent(getComponentClass('UIPage'));
    settlementPage.pageId = 5;
    const settlementDim = await createSprite('DimOverlay', settlement, 720, 1280, 'db://assets/textures/home/home_hud_panel.png');
    settlementDim.getComponent(Sprite).color = new Color(5, 14, 29, 230);
    place(settlementDim, 0, 0, 720, 1280);
    const settlementCard = await createSprite('SettlementCard', settlement, 660, 940, 'db://assets/textures/home/home_hud_panel.png');
    settlementCard.getComponent(Sprite).color = new Color(249, 243, 229, 255);
    place(settlementCard, 0, 18, 660, 940);
    caption(settlement, 'Title', '本局结算', 56, 0, 382, 520, 86, new Color(115, 65, 196, 255));
    caption(settlement, 'Subtitle', '无尽吞噬', 27, 0, 321, 420, 52, new Color(73, 55, 99, 255));
    const rowColor = new Color(74, 56, 40, 255);
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
    await imageButton('BtnRestart', settlement, '再来一局', -128, -296, 258, 94, 'db://assets/textures/home/home_start_button.png', 28);
    await imageButton('BtnHome', settlement, '返回首页', 128, -296, 258, 94, 'db://assets/textures/home/home_action_skin.png', 28);
    settlement.addComponent(getComponentClass('SettlementPageController'));
    settlement.active = false;

    await Editor.Message.request('scene', 'save-scene');
    return {
      savedPages: ['EndlessHUD', 'PausePage', 'SettlementPage'],
      prefabCreation: 'not-run-from-scene-script',
    };
  },
  async verifyRuntimePages() {
    const { director, Button } = require('cc');
    const canvas = director.getScene()?.getChildByName('Canvas');
    const requirements = [
      { name: 'EndlessHUD', component: 'EndlessHUDController', buttons: ['BtnPause'], nodes: ['Joystick', 'JoystickBase', 'JoystickKnob'] },
      { name: 'PausePage', component: 'PausePageController', buttons: ['BtnResume', 'BtnSettle', 'BtnHome'] },
      { name: 'SettlementPage', component: 'SettlementPageController', buttons: ['BtnRestart', 'BtnHome'] },
    ];
    const report = requirements.map((requirement) => {
      const root = canvas?.getChildByName(requirement.name);
      const missingButtons = requirement.buttons.filter((buttonName) => !root?.getChildByName(buttonName)?.getComponent(Button));
      const missingNodes = (requirement.nodes || []).filter((nodeName) => !root?.getChildByName(nodeName));
      return {
        name: requirement.name,
        exists: !!root,
        controller: !!root?.getComponent(getComponentClass(requirement.component)),
        missingButtons,
        missingNodes,
      };
    });
    return { ok: report.every((entry) => entry.exists && entry.controller && entry.missingButtons.length === 0 && entry.missingNodes.length === 0), report };
  },
};
