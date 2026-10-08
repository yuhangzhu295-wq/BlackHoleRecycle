/**
 * Generate the reusable UI Kit prefabs from the authored 9-slice frames.
 *
 * The Kit exists because the pages currently hand-place their own copies of the
 * same shapes: a pill, a stat block, a progress readout, a leaderboard row. The
 * brief names the gaps this fills -- an *editable* mode card (the old ones have
 * their copy baked into the artwork and cannot be used as controls), a brand
 * header, normalised currency/level pills, a progress bar (Machine Info has only
 * the text `ProgressValue` today), and standalone HUD stat / leaderboard-row
 * units.
 *
 * Generating rather than hand-writing the JSON is deliberate: a `.prefab` is an
 * object graph whose `__id__` references and per-node `cc.PrefabInfo` /
 * `cc.UITransform` counts have to line up exactly, and Cocos reports a mismatch
 * as a silent import failure rather than an error. Regenerating is also how a
 * texture uuid change gets picked up, so this file is the single source of truth
 * for the Kit's structure.
 *
 * Run: node scripts/generate_ui_kit_prefabs.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const UI_ROOT = path.join(repoRoot, 'cocos', 'assets', 'game_art', 'ui');
const TEXTURES_DIR = path.join(UI_ROOT, 'textures');
const PREFABS_DIR = path.join(UI_ROOT, 'prefabs');

/** Deterministic 22-char id in the same alphabet Creator uses for fileIds. */
const fileId = (seed) => createHash('sha1').update(seed).digest('base64').replace(/[=+/]/g, 'A').slice(0, 22);

/** Deterministic uuid v4-shaped id, so regenerating does not churn the metas. */
function uuidFor(seed) {
  const hex = createHash('sha1').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}`
    + `-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Resolve `<texture>.png.meta` to the spriteFrame uuid a Sprite must reference. */
function frameUuid(textureName) {
  const metaPath = path.join(TEXTURES_DIR, `${textureName}.png.meta`);
  if (!existsSync(metaPath)) throw new Error(`no texture meta for ${textureName}`);
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  return `${meta.uuid}@f9941`;
}

const COLOR = (r, g, b, a = 255) => ({ __type__: 'cc.Color', r, g, b, a });
const VEC3 = (x, y, z = 0) => ({ __type__: 'cc.Vec3', x, y, z });
const VEC2 = (x, y) => ({ __type__: 'cc.Vec2', x, y });

/**
 * One node of a Kit prefab.
 * @param {string} name
 * @param {[number, number]} size
 * @param {object} [options]
 */
const node = (name, size, options = {}) => ({
  name,
  size,
  pos: options.pos ?? [0, 0],
  sprite: options.sprite ?? null,
  label: options.label ?? null,
});

/** The seven shapes the brief names as missing. */
const KIT = {
  // Editable replacement for the mode cards, whose copy is baked into the art.
  UIModeCard: {
    size: [610, 278],
    nodes: [
      node('UIModeCard', [610, 278], { sprite: { texture: 'ui_card_9slice', type: 1 } }),
      node('Title', [420, 64], { pos: [0, 78], label: { string: '竞技乱斗', fontSize: 46 } }),
      node('Subtitle', [420, 40], { pos: [0, 24], label: { string: '多人竞技', fontSize: 28 } }),
      node('Badge', [220, 48], { pos: [-155, -84], sprite: { texture: 'ui_hud_bar_9slice', type: 1 } }),
      node('BadgeLabel', [200, 36], { pos: [-155, -84], label: { string: '已开放', fontSize: 24 } }),
    ],
  },
  UIBrandHeader: {
    size: [500, 116],
    nodes: [
      node('UIBrandHeader', [500, 116], { sprite: { texture: 'ui_hud_bar_9slice', type: 1 } }),
      node('Title', [460, 72], { label: { string: '黑洞回收站', fontSize: 54 } }),
    ],
  },
  UICurrencyPill: {
    size: [220, 64],
    nodes: [
      node('UICurrencyPill', [220, 64], { sprite: { texture: 'ui_hud_bar_9slice', type: 1 } }),
      node('Caption', [72, 40], { pos: [-68, 0], label: { string: '金币', fontSize: 28 } }),
      node('Value', [120, 44], { pos: [36, 0], label: { string: '0', fontSize: 32 } }),
    ],
  },
  UILevelPill: {
    size: [220, 64],
    nodes: [
      node('UILevelPill', [220, 64], { sprite: { texture: 'ui_hud_bar_9slice', type: 1 } }),
      node('Caption', [72, 40], { pos: [-68, 0], label: { string: '等级', fontSize: 28 } }),
      node('Value', [132, 44], { pos: [30, 0], label: { string: 'LV.1', fontSize: 32 } }),
    ],
  },
  // Machine Info shows progression as text only (`ProgressValue`) today.
  UIProgressBar: {
    size: [500, 38],
    nodes: [
      node('UIProgressBar', [500, 38], {}),
      node('Track', [500, 38], { sprite: { texture: 'ui_hud_bar_9slice', type: 1 } }),
      node('Fill', [250, 30], {
        pos: [-125, 0],
        sprite: { texture: 'ui_hud_bar_9slice', type: 1, color: COLOR(104, 238, 104) },
      }),
      node('Value', [300, 32], { label: { string: '0 / 900 kg', fontSize: 20 } }),
    ],
  },
  UIHudStat: {
    size: [164, 104],
    nodes: [
      node('UIHudStat', [164, 104], { sprite: { texture: 'ui_card_9slice', type: 1 } }),
      node('Caption', [150, 30], { pos: [0, 24], label: { string: '吞噬', fontSize: 22 } }),
      node('Value', [152, 40], { pos: [0, -22], label: { string: '0', fontSize: 26 } }),
    ],
  },
  UILeaderboardRow: {
    size: [522, 66],
    nodes: [
      node('UILeaderboardRow', [522, 66], { sprite: { texture: 'ui_hud_bar_9slice', type: 1 } }),
      node('Rank', [50, 42], { pos: [-224, 0], label: { string: '1', fontSize: 22 } }),
      node('Name', [180, 42], { pos: [-96, 0], label: { string: '玩家', fontSize: 23 } }),
      node('Score', [210, 38], { pos: [150, 0], label: { string: '0', fontSize: 18 } }),
    ],
  },
};

function buildLabel(spec) {
  return {
    __type__: 'cc.Label',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    _enabled: true,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: COLOR(255, 255, 255),
    _string: spec.string,
    _horizontalAlign: 1,
    _verticalAlign: 1,
    _actualFontSize: spec.fontSize,
    _fontSize: spec.fontSize,
    _fontFamily: 'Arial',
    _lineHeight: Math.round(spec.fontSize * 1.3),
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
    _outlineColor: COLOR(0, 0, 0),
    _outlineWidth: 2,
    _enableShadow: false,
    _shadowColor: COLOR(0, 0, 0),
    _shadowOffset: VEC2(2, 2),
    _shadowBlur: 2,
  };
}

function buildSprite(spec) {
  return {
    __type__: 'cc.Sprite',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    _enabled: true,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: spec.color ?? COLOR(255, 255, 255),
    _spriteFrame: {
      __uuid__: frameUuid(spec.texture),
      __expectedType__: 'cc.SpriteFrame',
    },
    _type: spec.type,
    _fillType: 0,
    // CUSTOM: the prefab's own contentSize drives the 9-slice, not the texture.
    _sizeMode: 0,
    _fillCenter: VEC2(0, 0),
    _fillStart: 0,
    _fillRange: 0,
    _isTrimmedMode: true,
    _useGrayscale: false,
    _atlas: null,
  };
}

/**
 * Lay out the object graph so every `__id__` resolves.
 *
 * Order: the cc.Prefab, then every node, then every component (each followed by
 * its cc.CompPrefabInfo), then one cc.PrefabInfo per node. Components are
 * emitted as `cc.UITransform`, then the sprite, then the label, and ids are
 * assigned in that same order. Cocos requires one `cc.UITransform` and one
 * `cc.PrefabInfo` per node -- which the contract test asserts -- so both counts
 * are derived from `specs` rather than written by hand.
 */
function buildPrefab(name, specs) {
  const nodeCount = specs.length;
  const plan = specs.map((spec) => {
    const kinds = ['uiTransform'];
    if (spec.sprite) kinds.push('sprite');
    if (spec.label) kinds.push('label');
    return kinds;
  });

  const nodeIds = specs.map((_, index) => 1 + index);
  let cursor = 1 + nodeCount;
  const componentIds = plan.map((kinds) => kinds.map(() => {
    const pair = { component: cursor, compPrefabInfo: cursor + 1 };
    cursor += 2;
    return pair;
  }));
  const prefabInfoIds = specs.map(() => cursor++);

  const objects = new Array(cursor);
  objects[0] = {
    __type__: 'cc.Prefab',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    data: { __id__: nodeIds[0] },
    optimizationPolicy: 0,
    persistent: false,
  };

  for (let i = 0; i < nodeCount; i += 1) {
    const spec = specs[i];
    objects[nodeIds[i]] = {
      __type__: 'cc.Node',
      _name: spec.name,
      _objFlags: 0,
      __editorExtras__: {},
      _parent: i === 0 ? null : { __id__: nodeIds[0] },
      _children: [],
      _active: true,
      _components: componentIds[i].map((pair) => ({ __id__: pair.component })),
      _prefab: { __id__: prefabInfoIds[i] },
      _lpos: VEC3(spec.pos[0], spec.pos[1]),
      _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
      _lscale: VEC3(1, 1, 1),
      _mobility: 0,
      _layer: 33554432,
      _euler: VEC3(0, 0, 0),
      _id: '',
    };
    if (i > 0) objects[nodeIds[0]]._children.push({ __id__: nodeIds[i] });
  }

  for (let i = 0; i < nodeCount; i += 1) {
    const spec = specs[i];
    plan[i].forEach((kind, index) => {
      const { component, compPrefabInfo } = componentIds[i][index];
      const seed = `${name}:${spec.name}:${kind}`;
      const body = kind === 'uiTransform'
        ? {
          __type__: 'cc.UITransform',
          _name: '',
          _objFlags: 0,
          __editorExtras__: {},
          _enabled: true,
          _contentSize: { __type__: 'cc.Size', width: spec.size[0], height: spec.size[1] },
          _anchorPoint: VEC2(0.5, 0.5),
          _id: '',
        }
        : kind === 'sprite'
          ? buildSprite(spec.sprite)
          : buildLabel(spec.label);
      objects[component] = {
        ...body,
        node: { __id__: nodeIds[i] },
        __prefab: { __id__: compPrefabInfo },
      };
      objects[compPrefabInfo] = { __type__: 'cc.CompPrefabInfo', fileId: fileId(seed) };
    });
  }

  for (let i = 0; i < nodeCount; i += 1) {
    objects[prefabInfoIds[i]] = {
      __type__: 'cc.PrefabInfo',
      root: { __id__: nodeIds[0] },
      asset: { __id__: 0 },
      fileId: fileId(`${name}:node:${specs[i].name}`),
      instance: null,
      targetOverrides: null,
      nestedPrefabInstanceRoots: null,
    };
  }

  return objects;
}

mkdirSync(PREFABS_DIR, { recursive: true });

for (const [name, definition] of Object.entries(KIT)) {
  const objects = buildPrefab(name, definition.nodes);
  const prefabPath = path.join(PREFABS_DIR, `${name}.prefab`);
  const metaPath = `${prefabPath}.meta`;
  writeFileSync(prefabPath, `${JSON.stringify(objects, null, 2)}\n`, 'utf8');
  const meta = {
    ver: '1.1.50',
    importer: 'prefab',
    imported: true,
    uuid: uuidFor(`prefab:${name}`),
    files: ['.json'],
    subMetas: {},
    userData: {},
  };
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  console.log(`${name}.prefab: ${objects.length} objects, ${definition.nodes.length} nodes`);
}
console.log(`\nwrote ${Object.keys(KIT).length} prefabs to ${path.relative(repoRoot, PREFABS_DIR)}`);
