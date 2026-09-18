/**
 * Headless scene authoring: inject EndlessReadyPage and ArenaReadyPage into
 * Game.scene as children of Canvas, composed entirely from cloned, already
 * editor-saved ModeSelectPage nodes (same sprites, fonts, outlines).
 *
 * The script is idempotent: if both pages already exist it exits without
 * touching the file. It never rewrites unrelated scene content.
 *
 * Ready-page flow contract: HOME -> MODE SELECT -> MODE READY -> START ->
 * GAMEPLAY. Mode cards must never start a match directly.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scenePath = path.join(rootDirectory, 'cocos/assets/scenes/Game.scene');
const raw = JSON.parse(fs.readFileSync(scenePath, 'utf8'));

const PAGE_ROOT_NAMES = ['EndlessReadyPage', 'ArenaReadyPage'];
const existing = PAGE_ROOT_NAMES.filter((name) =>
  raw.some((entry) => entry.__type__ === 'cc.Node' && entry._name === name));
if (existing.length === PAGE_ROOT_NAMES.length) {
  console.log('[SKIP] EndlessReadyPage and ArenaReadyPage already authored.');
  process.exit(0);
}
if (existing.length > 0) {
  console.error('[ABORT] Partial ready-page authoring detected; resolve manually:', existing.join(', '));
  process.exit(1);
}

const MODE_READY_CONTROLLER_TYPE = 'b0c2f0UmRlLwICQDuOZar+8';
const usedIds = new Set(raw.map((entry) => entry._id).filter(Boolean));
const newId = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (;;) {
    const bytes = crypto.randomBytes(16);
    let id = '';
    for (let i = 0; i < 22; i += 1) id += alphabet[bytes[i] & 63];
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
};

const byName = (name) => {
  const index = raw.findIndex((entry) => entry.__type__ === 'cc.Node' && entry._name === name);
  if (index < 0) throw new Error(`scene node not found: ${name}`);
  return index;
};

const modeSelectIndex = byName('ModeSelectPage');
const modeSelectRoot = raw[modeSelectIndex];
const canvasIndex = modeSelectRoot._parent.__id__;
const canvasNode = raw[canvasIndex];
if (!canvasNode || canvasNode._name !== 'Canvas') throw new Error('ModeSelectPage parent is not Canvas');

// Source children of ModeSelectPage, resolved by name.
const sourceChild = (name) => {
  for (const ref of modeSelectRoot._children) {
    const child = raw[ref.__id__];
    if (child._name === name) return ref.__id__;
  }
  throw new Error(`ModeSelectPage child not found: ${name}`);
};

const SOURCE = {
  background: sourceChild('Background'),
  btnBack: sourceChild('BtnBack'),
  header: sourceChild('Header'),
  btnArena: sourceChild('BtnArena'),
  btnEndless: sourceChild('BtnEndless'),
  bestCaption: sourceChild('EndlessBestCaption'),
  bestValue: sourceChild('EndlessBestValue'),
};

const allocate = (entry) => {
  raw.push(entry);
  return raw.length - 1;
};

const cloneComponent = (componentIndex, ownerNodeIndex) => {
  const copy = JSON.parse(JSON.stringify(raw[componentIndex]));
  copy.node = { __id__: ownerNodeIndex };
  if ('_id' in copy) copy._id = newId();
  return allocate(copy);
};

/**
 * Clone a leaf node with its components. Optionally drop component types
 * (e.g. cc.Button for the non-interactive MapPreview) and override the
 * primary cc.Label string.
 */
const cloneLeafNode = (sourceIndex, name, parentIndex, options = {}) => {
  const source = raw[sourceIndex];
  if ((source._children || []).length > 0) throw new Error(`expected leaf node: ${source._name}`);
  const node = JSON.parse(JSON.stringify(source));
  node._name = name;
  node._parent = { __id__: parentIndex };
  node._children = [];
  node._components = [];
  node._active = options.active !== undefined ? options.active : true;
  node._id = newId();
  const nodeIndex = allocate(node);
  for (const ref of source._components) {
    const component = raw[ref.__id__];
    if (options.dropTypes && options.dropTypes.includes(component.__type__)) continue;
    const componentIndex = cloneComponent(ref.__id__, nodeIndex);
    if (options.labelText && component.__type__ === 'cc.Label') {
      raw[componentIndex]._string = options.labelText;
    }
    node._components.push({ __id__: componentIndex });
  }
  return nodeIndex;
};

// UIPage script component type, reused from the ModeSelectPage root.
const uiPageComponent = modeSelectRoot._components
  .map((ref) => raw[ref.__id__])
  .find((component) => component && 'pageId' in component);
if (!uiPageComponent) throw new Error('UIPage component not found on ModeSelectPage');

const buildReadyPage = (pageName, pageId, mode, titleText, cardSource, statCaptionText) => {
  const rootIndex = allocate({ __placeholder__: true });
  const childRefs = [];
  const addChild = (index) => { childRefs.push({ __id__: index }); return index; };

  addChild(cloneLeafNode(SOURCE.background, 'Background', rootIndex));
  addChild(cloneLeafNode(SOURCE.btnBack, 'BtnBack', rootIndex));
  addChild(cloneLeafNode(SOURCE.header, 'Header', rootIndex));
  addChild(cloneLeafNode(SOURCE.bestCaption, 'HeaderTitle', rootIndex, { labelText: titleText }));
  addChild(cloneLeafNode(cardSource, 'MapPreview', rootIndex, { dropTypes: ['cc.Button'] }));
  addChild(cloneLeafNode(SOURCE.bestCaption, 'StatCaption', rootIndex, { labelText: statCaptionText }));
  addChild(cloneLeafNode(SOURCE.bestValue, 'StatValue', rootIndex, { labelText: '0' }));
  addChild(cloneLeafNode(SOURCE.bestCaption, 'MachineCaption', rootIndex, { labelText: '当前机器' }));
  addChild(cloneLeafNode(SOURCE.bestValue, 'MachineValue', rootIndex, { labelText: '' }));
  addChild(cloneLeafNode(SOURCE.bestCaption, 'IntroText', rootIndex, { labelText: '' }));
  addChild(cloneLeafNode(cardSource, 'BtnStart', rootIndex));
  addChild(cloneLeafNode(SOURCE.bestCaption, 'BtnStartLabel', rootIndex, { labelText: mode === 0 ? '开始探索' : '开始乱斗' }));

  // Root components: UITransform + UIPage(pageId) + ModeReadyPageController(mode).
  const uiTransformIndex = cloneComponent(
    modeSelectRoot._components.find((ref) => raw[ref.__id__].__type__ === 'cc.UITransform').__id__,
    rootIndex,
  );
  const uiPageIndex = (() => {
    const uiPage = JSON.parse(JSON.stringify(uiPageComponent));
    uiPage.node = { __id__: rootIndex };
    uiPage.pageId = pageId;
    if ('_id' in uiPage) uiPage._id = newId();
    return allocate(uiPage);
  })();

  const controllerIndex = allocate({
    __type__: MODE_READY_CONTROLLER_TYPE,
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: rootIndex },
    _enabled: true,
    __prefab: null,
    mode,
    _id: newId(),
  });

  const root = JSON.parse(JSON.stringify(modeSelectRoot));
  root._name = pageName;
  root._parent = { __id__: canvasIndex };
  root._children = childRefs;
  root._components = [
    { __id__: uiTransformIndex },
    { __id__: uiPageIndex },
    { __id__: controllerIndex },
  ];
  root._active = false;
  root._id = newId();
  raw[rootIndex] = root;
  canvasNode._children.push({ __id__: rootIndex });
  return rootIndex;
};

buildReadyPage('EndlessReadyPage', 10, 0, '无尽探索', SOURCE.btnEndless, '历史最高纪录');
buildReadyPage('ArenaReadyPage', 11, 1, '竞技乱斗', SOURCE.btnArena, '对局规则');

fs.writeFileSync(scenePath, JSON.stringify(raw, null, 2));
console.log('[OK] Authored EndlessReadyPage + ArenaReadyPage into Game.scene (children of Canvas).');
