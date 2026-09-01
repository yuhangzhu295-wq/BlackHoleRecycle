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

exports.load = function load() {};
exports.unload = function unload() {};

exports.methods = {
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
      const sprite = root.getChildByName(name)?.getComponent(Sprite);
      return !sprite?.spriteFrame;
    });
    const buttonNames = ['BtnStart', 'BtnMode', 'BtnSkin', 'BtnMachine', 'BtnSettings'];
    const missingButtons = buttonNames.filter((name) => !root.getChildByName(name)?.getComponent(Button));
    return {
      ok: missingSpriteFrames.length === 0 && missingButtons.length === 0,
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
    const { director, UITransform, Label, Color } = require('cc');
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
    const coinPanel = await createSprite('CoinPanel', root, 236, 66, 'db://assets/textures/home/home_hud_panel.png');
    const machinePanel = await createSprite('MachineStatus', root, 236, 66, 'db://assets/textures/home/home_hud_panel.png');
    await createSprite('CoinIcon', root, 54, 54, 'db://assets/textures/home/home_coin.png');
    createLabel('CoinValue', root, '0', 34, new Color(255, 222, 83, 255));
    createLabel('MachineName', root, '黑洞回收机', 22, new Color(255, 255, 255, 255));
    createLabel('MachineValue', root, 'LV.1', 30, new Color(255, 222, 83, 255));
    await createSprite('Logo', root, 600, 180, 'db://assets/textures/home/home_logo.png');
    await createSprite('HeroBlackHole', root, 360, 360, 'db://assets/textures/home/home_blackhole_hero.png');
    await createButton('BtnStart', root, '开始吞噬', 46, 'db://assets/textures/home/home_start_button.png');
    await createButton('BtnMode', root, '模式', 25, 'db://assets/textures/home/home_action_mode.png');
    await createButton('BtnSkin', root, '皮肤', 25, 'db://assets/textures/home/home_action_skin.png');
    await createButton('BtnMachine', root, '机器', 25, 'db://assets/textures/home/home_action_machine.png');
    await createButton('BtnSettings', root, '设置', 20, 'db://assets/textures/home/home_settings.png');

    const title = root.getChildByName('Logo');
    title.getComponent(UITransform).setContentSize(600, 180);
    coinPanel.getComponent(UITransform).setContentSize(236, 66);
    machinePanel.getComponent(UITransform).setContentSize(236, 66);

    await Editor.Message.request('scene', 'save-scene');
    await Editor.Message.request('scene', 'create-prefab', root.uuid, 'db://assets/prefabs/ui/HomePage.prefab');
    await Editor.Message.request('scene', 'save-scene');
    return { prefab: 'db://assets/prefabs/ui/HomePage.prefab', rootUuid: root.uuid };
  },
  async buildRuntimePages() {
    const { director, Color, UITransform, Sprite } = require('cc');
    const scene = director.getScene();
    const canvas = scene?.getChildByName('Canvas');
    if (!canvas) throw new Error('Game.scene does not contain Canvas');

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
      caption(button, `${name}Label`, text, fontSize, 0, 0, width, height);
      return button;
    };

    // Endless gameplay HUD. The labels are updated from live GameManager data.
    const endless = createNode('EndlessHUD', canvas, 720, 1280);
    const endlessPage = endless.addComponent(getComponentClass('UIPage'));
    endlessPage.pageId = 3;
    const topShade = await createSprite('TopShade', endless, 720, 156, 'db://assets/textures/home/home_hud_panel.png');
    topShade.getComponent(Sprite).color = new Color(12, 27, 44, 228);
    place(topShade, 0, 558, 720, 156);
    const coinPanel = await createSprite('CoinPanel', endless, 218, 64, 'db://assets/textures/home/home_hud_panel.png');
    place(coinPanel, -210, 563, 218, 64);
    const levelPanel = await createSprite('LevelPanel', endless, 250, 64, 'db://assets/textures/home/home_hud_panel.png');
    place(levelPanel, 106, 563, 250, 64);
    const regionPanel = await createSprite('RegionPanel', endless, 258, 54, 'db://assets/textures/home/home_hud_panel.png');
    place(regionPanel, 0, 490, 258, 54);
    await createSprite('CoinIcon', endless, 46, 46, 'db://assets/textures/home/home_coin.png');
    place(endless.getChildByName('CoinIcon'), -294, 563, 46, 46);
    caption(endless, 'CoinValue', '0', 28, -188, 563, 132, 48, new Color(255, 222, 83, 255));
    caption(endless, 'LevelValue', 'LV.1 回收小车', 20, 106, 576, 238, 34);
    caption(endless, 'MassValue', '质量 0 kg', 18, 106, 542, 238, 30, new Color(219, 242, 255, 255));
    caption(endless, 'RegionValue', '卧室杂物区', 18, 0, 490, 240, 32, new Color(232, 245, 255, 255));
    await imageButton('BtnPause', endless, '暂停', 292, 562, 82, 82, 'db://assets/textures/home/home_settings.png', 19);
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
    await Editor.Message.request('scene', 'create-prefab', endless.uuid, 'db://assets/prefabs/ui/EndlessHUD.prefab');
    await Editor.Message.request('scene', 'create-prefab', pause.uuid, 'db://assets/prefabs/ui/PausePage.prefab');
    await Editor.Message.request('scene', 'create-prefab', settlement.uuid, 'db://assets/prefabs/ui/SettlementPage.prefab');
    await Editor.Message.request('scene', 'save-scene');
    return {
      prefabs: [
        'db://assets/prefabs/ui/EndlessHUD.prefab',
        'db://assets/prefabs/ui/PausePage.prefab',
        'db://assets/prefabs/ui/SettlementPage.prefab',
      ],
    };
  },
  async verifyRuntimePages() {
    const { director, Button } = require('cc');
    const canvas = director.getScene()?.getChildByName('Canvas');
    const requirements = [
      { name: 'EndlessHUD', component: 'EndlessHUDController', buttons: ['BtnPause'] },
      { name: 'PausePage', component: 'PausePageController', buttons: ['BtnResume', 'BtnSettle', 'BtnHome'] },
      { name: 'SettlementPage', component: 'SettlementPageController', buttons: ['BtnRestart', 'BtnHome'] },
    ];
    const report = requirements.map((requirement) => {
      const root = canvas?.getChildByName(requirement.name);
      const missingButtons = requirement.buttons.filter((buttonName) => !root?.getChildByName(buttonName)?.getComponent(Button));
      return {
        name: requirement.name,
        exists: !!root,
        controller: !!root?.getComponent(getComponentClass(requirement.component)),
        missingButtons,
      };
    });
    return { ok: report.every((entry) => entry.exists && entry.controller && entry.missingButtons.length === 0), report };
  },
};
