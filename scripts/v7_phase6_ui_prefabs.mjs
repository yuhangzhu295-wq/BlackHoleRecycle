/**
 * V7 PHASE 6/7: the authored UI texture metas and the reusable UI prefab library.
 *
 * ## Why this generator also writes the `.png.meta`
 *
 * Creator assigns a uuid the first time it imports an asset, which would force a
 * two-pass build (import, read uuids, then write prefabs). The image importer's
 * sub-asset ids are deterministic, though: measured across all 24 PNG metas in
 * this project, `texture` is always `6c48a` and `spriteFrame` is always `f9941`.
 * So the meta can be written here with a stable uuid, the prefab can reference
 * `<uuid>@f9941` in the same pass, and Creator resolves the whole graph in one
 * import. An existing meta that Creator already imported is never rewritten —
 * its uuid is read back instead, so a re-run cannot orphan a reference.
 *
 * ## Where the library lives, and why
 *
 * `cocos/assets/game_art/ui/prefabs/`. The brief allows either this or
 * `cocos/assets/prefabs/ui/`; `game_art` is chosen because it is a declared
 * bundle, and a Cocos bundle packs **every** asset under its folder. That was
 * measured, not assumed: `cocos/build/web-mobile/assets/game-art/config.json`
 * lists 49 asset paths including the `prefabs/vehicles/Sedan` category prefab
 * that nothing at runtime loads. The `main` bundle by contrast lists 4 paths,
 * because an asset under `assets/` only ships when a scene references it — and
 * the pre-existing `assets/prefabs/ui/*.prefab` files are in fact absent from
 * the built `main` bundle. A reusable library that must be loadable but is not
 * scene-referenced therefore has to live in a bundle.
 *
 * ## Why the prefabs carry no `cc.Button`
 *
 * `UIButton.prefab` is the button *visual* (9-slice frame + centred label). The
 * interactable `cc.Button` stays the scene-authored one on the page node. A
 * second Button nested under it would own the touch and could stop the real
 * click from reaching the page handler, which is exactly the kind of silent
 * regression the layout/touch contracts exist to catch. The visual is reusable;
 * the interaction stays where the locked geometry already is.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(repo, 'cocos', 'assets');
const uiRoot = path.join(assets, 'game_art', 'ui');
const texturesDir = path.join(uiRoot, 'textures');
const prefabsDir = path.join(uiRoot, 'prefabs');

const UI_2D_LAYER = 33554432;

// ---------------------------------------------------------------------------
// 1. Deterministic uuids (stable across re-runs).
// ---------------------------------------------------------------------------

/** FNV-1a seeded, formatted as a v4-shaped uuid. Deterministic per seed. */
function stableUuid(seed) {
  let hash = 2166136261;
  const hex = [];
  for (let index = 0; index < 32; index += 1) {
    hash ^= seed.charCodeAt(index % seed.length) + index;
    hash = Math.imul(hash, 16777619);
    let value = (hash >>> 0) % 16;
    if (index === 12) value = 4;
    if (index === 16) value = (value & 0x3) | 0x8;
    hex.push(value.toString(16));
  }
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 32)}`;
}

const FILE_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function fileId(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let out = '';
  for (let index = 0; index < 22; index += 1) {
    hash ^= hash << 13; hash ^= hash >>> 17; hash ^= hash << 5;
    hash = Math.imul(hash, 2654435761);
    out += FILE_ID_ALPHABET[Math.abs(hash) % 64];
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Texture metas.
// ---------------------------------------------------------------------------

/**
 * `border` is the 9-slice inset; `packable: false` keeps a sliced frame out of
 * the dynamic atlas so its border texels cannot be re-laid-out under it.
 */
const TEXTURES = [
  { name: 'map_preview_city', width: 560, height: 260 },
  { name: 'map_preview_arena', width: 560, height: 260 },
  { name: 'joystick_base', width: 196, height: 196 },
  { name: 'joystick_knob', width: 76, height: 76 },
  { name: 'ui_panel_9slice', width: 128, height: 128, border: 34 },
  { name: 'ui_card_9slice', width: 160, height: 160, border: 44 },
  { name: 'ui_button_9slice', width: 192, height: 128, border: 48 },
  { name: 'ui_popup_9slice', width: 128, height: 128, border: 36 },
  { name: 'ui_hud_bar_9slice', width: 128, height: 64, border: 30 },
];

function textureMeta(name, spec) {
  const uuid = stableUuid('ui-texture:' + name);
  const textureUuid = `${uuid}@6c48a`;
  const spriteUuid = `${uuid}@f9941`;
  const border = spec.border || 0;
  return {
    meta: {
      ver: '1.0.27',
      importer: 'image',
      imported: false,
      uuid,
      files: ['.json', '.png'],
      subMetas: {
        '6c48a': {
          importer: 'texture',
          uuid: textureUuid,
          displayName: name,
          id: '6c48a',
          name: 'texture',
          userData: {
            wrapModeS: 'clamp',
            wrapModeT: 'clamp',
            minfilter: 'linear',
            magfilter: 'linear',
            mipfilter: 'none',
            anisotropy: 0,
            isUuid: true,
            imageUuidOrDatabaseUri: uuid,
            visible: false,
          },
          ver: '1.0.22',
          imported: false,
          files: ['.json'],
          subMetas: {},
        },
        f9941: {
          importer: 'sprite-frame',
          uuid: spriteUuid,
          displayName: name,
          id: 'f9941',
          name: 'spriteFrame',
          userData: {
            trimType: 'none',
            trimThreshold: 1,
            rotated: false,
            offsetX: 0,
            offsetY: 0,
            trimX: 0,
            trimY: 0,
            width: spec.width,
            height: spec.height,
            rawWidth: spec.width,
            rawHeight: spec.height,
            borderTop: border,
            borderBottom: border,
            borderLeft: border,
            borderRight: border,
            packable: border === 0,
            pixelsToUnit: 100,
            pivotX: 0.5,
            pivotY: 0.5,
            meshType: 0,
            isUuid: true,
            imageUuidOrDatabaseUri: textureUuid,
            atlasUuid: '',
          },
          ver: '1.0.12',
          imported: false,
          files: ['.json'],
          subMetas: {},
        },
      },
      userData: {
        hasAlpha: true,
        type: 'sprite-frame',
        fixAlphaTransparencyArtifacts: false,
        redirect: textureUuid,
      },
    },
    uuid,
    spriteUuid,
  };
}

/** uuid of the spriteFrame sub-asset, reading back an already-imported meta. */
function ensureTextureMeta(spec) {
  const pngPath = path.join(texturesDir, spec.name + '.png');
  if (!fs.existsSync(pngPath)) {
    throw new Error(`[phase6-ui] missing texture ${spec.name}.png; run scripts/generate_ui_prefab_assets.py first`);
  }
  const metaPath = pngPath + '.meta';
  if (fs.existsSync(metaPath)) {
    const existing = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (existing.imported && existing.uuid && existing.subMetas?.f9941?.uuid) {
      return { uuid: existing.uuid, spriteUuid: existing.subMetas.f9941.uuid, written: false };
    }
  }
  const built = textureMeta(spec.name, spec);
  fs.writeFileSync(metaPath, JSON.stringify(built.meta, null, 2) + '\n', 'utf8');
  return { uuid: built.uuid, spriteUuid: built.spriteUuid, written: true };
}

// ---------------------------------------------------------------------------
// 3. Prefab serialisation.
// ---------------------------------------------------------------------------

const vec3 = (x, y, z) => ({ __type__: 'cc.Vec3', x, y, z });
const vec2 = (x, y) => ({ __type__: 'cc.Vec2', x, y });
const quat = () => ({ __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 });
const color = (r, g, b, a = 255) => ({ __type__: 'cc.Color', r, g, b, a });

/** Builds one prefab from a nested node spec. */
function buildPrefab(prefabName, root) {
  const objects = [];
  const allocate = (object) => {
    objects.push(object);
    return objects.length - 1;
  };

  const prefabId = allocate({
    __type__: 'cc.Prefab',
    _name: prefabName,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    data: { __id__: 1 },
    optimizationPolicy: 0,
    persistent: false,
  });
  if (prefabId !== 0) throw new Error('[phase6-ui] prefab object must be index 0');

  // A child spec's `_prefab` PrefabInfo must be allocated after its components,
  // so build the whole tree with placeholders and patch the ids afterwards.
  const nodeRefs = [];

  const buildNode = (spec, parentId, seed) => {
    const nodeIndex = objects.length;
    objects.push(null);
    nodeRefs.push({ nodeIndex, spec, parentId, seed });

    const children = (spec.children || []).map((child, index) =>
      buildNode(child, nodeIndex, `${seed}/${child.name}#${index}`));
    spec.__children = children;

    const componentRefs = [];
    const pushComponent = (component, fileIdSeed) => {
      const compPrefabInfoId = allocate({ __type__: 'cc.CompPrefabInfo', fileId: fileId(fileIdSeed + ':comp') });
      component.node = { __id__: nodeIndex };
      component.__prefab = { __id__: compPrefabInfoId };
      componentRefs.push({ __id__: allocate(component) });
    };

    const size = spec.size || { width: 100, height: 100 };
    pushComponent({
      __type__: 'cc.UITransform',
      _name: '', _objFlags: 0, __editorExtras__: {},
      _enabled: true,
      _contentSize: { __type__: 'cc.Size', width: size.width, height: size.height },
      _anchorPoint: vec2(spec.anchor?.x ?? 0.5, spec.anchor?.y ?? 0.5),
      _id: '',
    }, seed + ':ui');

    if (spec.sprite) {
      pushComponent({
        __type__: 'cc.Sprite',
        _name: '', _objFlags: 0, __editorExtras__: {},
        _enabled: true,
        _customMaterial: null,
        _srcBlendFactor: 2,
        _dstBlendFactor: 4,
        _color: color(...(spec.sprite.color || [255, 255, 255, 255])),
        _spriteFrame: { __uuid__: spec.sprite.frame, __expectedType__: 'cc.SpriteFrame' },
        _type: spec.sprite.sliced ? 1 : 0,
        _fillType: 0,
        _sizeMode: 0,
        _fillCenter: vec2(0, 0),
        _fillStart: 0,
        _fillRange: 0,
        _isTrimmedMode: true,
        _useGrayscale: false,
        _atlas: null,
        _id: '',
      }, seed + ':sprite');
    }

    if (spec.label) {
      const fontSize = spec.label.fontSize;
      pushComponent({
        __type__: 'cc.Label',
        _name: '', _objFlags: 0, __editorExtras__: {},
        _enabled: true,
        _customMaterial: null,
        _srcBlendFactor: 2,
        _dstBlendFactor: 4,
        _color: color(...(spec.label.color || [255, 255, 255, 255])),
        _string: spec.label.string,
        _horizontalAlign: spec.label.align ?? 1,
        _verticalAlign: 1,
        _actualFontSize: fontSize,
        _fontSize: fontSize,
        _fontFamily: 'Arial',
        _lineHeight: spec.label.lineHeight ?? Math.round(fontSize * 1.3),
        _overflow: 0,
        _enableWrapText: true,
        _font: null,
        _isSystemFontUsed: true,
        _spacingX: 0,
        _isItalic: false,
        _isBold: false,
        _isUnderline: false,
        _underlineHeight: 2,
        _cacheMode: 0,
        _enableOutline: false,
        _outlineColor: color(0, 0, 0, 255),
        _outlineWidth: 2,
        _enableShadow: false,
        _shadowColor: color(0, 0, 0, 255),
        _shadowOffset: vec2(2, 2),
        _shadowBlur: 2,
        _id: '',
      }, seed + ':label');
      if (spec.label.outline) {
        pushComponent({
          __type__: 'cc.LabelOutline',
          _name: '', _objFlags: 0, __editorExtras__: {},
          _enabled: true,
          _id: '',
        }, seed + ':outline');
      }
    }

    spec.__components = componentRefs;
    return nodeIndex;
  };

  buildNode(root, null, prefabName);

  // Patch every node now that all ids exist.
  for (const entry of nodeRefs) {
    const { nodeIndex, spec, parentId, seed } = entry;
    objects[nodeIndex] = {
      __type__: 'cc.Node',
      _name: spec.name,
      _objFlags: 0,
      __editorExtras__: {},
      _parent: parentId === null ? null : { __id__: parentId },
      _children: spec.__children.map((id) => ({ __id__: id })),
      _active: true,
      _components: spec.__components,
      _prefab: { __id__: allocate({ __type__: 'cc.PrefabInfo', root: { __id__: 1 }, asset: { __id__: 0 }, fileId: fileId(seed + ':node'), instance: null, targetOverrides: null, nestedPrefabInstanceRoots: null }) },
      _lpos: vec3(spec.position?.x ?? 0, spec.position?.y ?? 0, spec.position?.z ?? 0),
      _lrot: quat(),
      _lscale: vec3(1, 1, 1),
      _mobility: 0,
      _layer: UI_2D_LAYER,
      _euler: vec3(0, 0, 0),
      _id: '',
    };
  }

  return objects;
}

function writePrefab(name, objects) {
  fs.mkdirSync(prefabsDir, { recursive: true });
  const file = path.join(prefabsDir, name + '.prefab');
  fs.writeFileSync(file, JSON.stringify(objects, null, 2) + '\n', 'utf8');
  const metaPath = file + '.meta';
  if (!fs.existsSync(metaPath)) {
    const uuid = stableUuid('ui-prefab:' + name);
    fs.writeFileSync(metaPath, JSON.stringify({
      ver: '1.1.50',
      importer: 'prefab',
      imported: false,
      uuid,
      files: ['.json'],
      subMetas: {},
      userData: { syncNodeName: name },
    }, null, 2) + '\n', 'utf8');
  }
  return file;
}

// ---------------------------------------------------------------------------
// 4. Run.
// ---------------------------------------------------------------------------

const frames = new Map();
const metaWrites = [];
for (const spec of TEXTURES) {
  const resolved = ensureTextureMeta(spec);
  frames.set(spec.name, resolved.spriteUuid);
  if (resolved.written) metaWrites.push(spec.name);
}

const frame = (name) => {
  const uuid = frames.get(name);
  if (!uuid) throw new Error('[phase6-ui] unknown frame ' + name);
  return uuid;
};

const panel = {
  name: 'UIPanel',
  size: { width: 320, height: 160 },
  sprite: { frame: frame('ui_panel_9slice'), sliced: true },
};

const card = {
  name: 'UICard',
  size: { width: 560, height: 260 },
  sprite: { frame: frame('ui_card_9slice'), sliced: true },
  children: [
    {
      name: 'Preview',
      position: { x: 0, y: 0 },
      size: { width: 544, height: 244 },
      sprite: { frame: frame('map_preview_city'), sliced: false },
    },
    {
      name: 'Caption',
      position: { x: 0, y: -152 },
      size: { width: 360, height: 34 },
      label: { string: '地图预览', fontSize: 22, color: [255, 255, 255, 255], outline: true, align: 1 },
    },
  ],
};

const hudBar = {
  name: 'UIHudBar',
  size: { width: 580, height: 76 },
  sprite: { frame: frame('ui_hud_bar_9slice'), sliced: true },
  children: [
    {
      name: 'Caption',
      position: { x: -120, y: 0 },
      size: { width: 300, height: 40 },
      label: { string: '说明', fontSize: 20, color: [255, 255, 255, 255], outline: true, align: 0 },
    },
    {
      name: 'Value',
      position: { x: 120, y: 0 },
      size: { width: 300, height: 40 },
      label: { string: '数值', fontSize: 22, color: [229, 255, 91, 255], outline: true, align: 2 },
    },
  ],
};

const popup = {
  name: 'UIPopup',
  size: { width: 600, height: 200 },
  sprite: { frame: frame('ui_popup_9slice'), sliced: true },
  children: [
    {
      name: 'Title',
      position: { x: 0, y: 52 },
      size: { width: 520, height: 56 },
      label: { string: '提示', fontSize: 42, color: [255, 208, 0, 255], outline: true, align: 1 },
    },
  ],
};

const button = {
  name: 'UIButton',
  size: { width: 480, height: 150 },
  sprite: { frame: frame('ui_button_9slice'), sliced: true },
  children: [
    {
      name: 'Label',
      position: { x: 0, y: 6 },
      size: { width: 440, height: 70 },
      label: { string: '按钮', fontSize: 46, color: [255, 255, 255, 255], outline: true, align: 1 },
    },
  ],
};

const written = [];
for (const spec of [panel, card, hudBar, popup, button]) {
  written.push(writePrefab(spec.name, buildPrefab(spec.name, spec)));
}

console.log(metaWrites.length
  ? 'wrote texture metas for: ' + metaWrites.join(', ')
  : 'all texture metas already imported by Creator; read the uuids back');
console.log('wrote ' + written.length + ' reusable UI prefabs:');
for (const file of written) {
  console.log('  ' + path.relative(repo, file).split(path.sep).join('/'));
}
console.log('\nCreator must import this now (the prefabs reference the texture spriteFrames by uuid).');
