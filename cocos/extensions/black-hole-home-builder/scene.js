'use strict';

const { join } = require('path');
module.paths.push(join(Editor.App.path, 'node_modules'));

function getComponentClass(name) {
  const { js } = require('cc');
  const type = js.getClassByName(name);
  if (!type) throw new Error(`Cocos script component is not imported: ${name}`);
  return type;
}

function createNode(name, parent, width, height) {
  const { Node, UITransform, Graphics, Layers } = require('cc');
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  parent.addChild(node);
  const transform = node.addComponent(UITransform);
  transform.setContentSize(width, height);
  node.addComponent(Graphics);
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

function createButton(name, parent, caption, fontSize) {
  const { Button, UITransform } = require('cc');
  const node = createNode(name, parent, 180, 120);
  node.addComponent(Button);
  const labelNode = createLabel(`${name}Label`, node, caption, fontSize);
  labelNode.getComponent(UITransform).setContentSize(520, fontSize + 22);
  return node;
}

exports.load = function load() {};
exports.unload = function unload() {};

exports.methods = {
  async buildHome() {
    const { director, UITransform, Label, Color } = require('cc');
    const scene = director.getScene();
    const canvas = scene && scene.getChildByName('Canvas');
    if (!canvas) throw new Error('Game.scene does not contain Canvas');

    const oldHome = canvas.getChildByName('HomePage');
    if (oldHome) oldHome.destroy();

    const root = createNode('HomePage', canvas, 960, 1280);
    root.addComponent(getComponentClass('UIPage'));
    root.addComponent(getComponentClass('HomePageController'));
    root.addComponent(getComponentClass('HomePageVisual'));

    createNode('Background', root, 960, 1280);
    createNode('TopBar', root, 920, 104);
    const coinPanel = createNode('CoinPanel', root, 236, 66);
    const machinePanel = createNode('MachineStatus', root, 236, 66);
    createLabel('CoinValue', root, '0', 34, new Color(255, 222, 83, 255));
    createLabel('MachineName', root, '黑洞回收机', 22, new Color(255, 255, 255, 255));
    createLabel('MachineValue', root, 'LV.1', 30, new Color(255, 222, 83, 255));
    createLabel('Logo', root, '黑洞吞噬大战', 62, new Color(255, 255, 255, 255));
    createNode('HeroBlackHole', root, 400, 400);
    createButton('BtnStart', root, '开始吞噬', 46);
    createButton('BtnMode', root, '模式选择', 25);
    createButton('BtnSkin', root, '皮肤', 30);
    createButton('BtnMachine', root, '机器', 30);
    createButton('BtnSettings', root, '⚙', 38);

    const title = root.getChildByName('Logo');
    title.getComponent(UITransform).setContentSize(760, 90);
    coinPanel.getComponent(UITransform).setContentSize(236, 66);
    machinePanel.getComponent(UITransform).setContentSize(236, 66);

    await Editor.Message.request('scene', 'create-prefab', root.uuid, 'db://assets/prefabs/ui/HomePage.prefab');
    await Editor.Message.request('scene', 'save-scene');
    return { prefab: 'db://assets/prefabs/ui/HomePage.prefab', rootUuid: root.uuid };
  },
};
