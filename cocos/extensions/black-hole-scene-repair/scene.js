'use strict';

const { join } = require('path');
module.paths.push(join(Editor.App.path, 'node_modules'));

function attachGameManager() {
  const { director, js, Node, Canvas, Camera, Label, UITransform, Widget, Layers, Color, HorizontalTextAlignment } = require('cc');
  const scene = director.getScene();
  const root = scene?.getChildByName('GameRoot');
  const gameManager = js.getClassByName('GameManager');
  const hudView = js.getClassByName('HUDView');

  if (!root) {
    throw new Error('GameRoot was not found in the active scene.');
  }
  if (!gameManager) {
    throw new Error('GameManager is not registered by the active scene.');
  }
  let managerAttached = false;
  if (!root.getComponent(gameManager)) {
    root.addComponent(gameManager);
    managerAttached = true;
  }

  if (!hudView) {
    throw new Error('HUDView is not registered by the active scene.');
  }

  let canvas = scene.getChildByName('Canvas');
  let hudAttached = false;
  if (!canvas) {
    canvas = new Node('Canvas');
    canvas.layer = Layers.Enum.UI_2D;
    scene.addChild(canvas);
    canvas.addComponent(Canvas);
    canvas.addComponent(UITransform).setContentSize(960, 640);
  }

  const canvasComponent = canvas.getComponent(Canvas) || canvas.addComponent(Canvas);
  if (!canvasComponent.cameraComponent) {
    const cameraNode = new Node('UICamera');
    cameraNode.layer = Layers.Enum.UI_2D;
    canvas.addChild(cameraNode);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.visibility = Layers.Enum.UI_2D;
    camera.priority = 1000;
    camera.clearFlags = Camera.ClearFlag.DONT_CLEAR;
    canvasComponent.cameraComponent = camera;
  }
  const uiCamera = canvasComponent.cameraComponent;
  uiCamera.projection = Camera.ProjectionType.ORTHO;
  uiCamera.visibility = Layers.Enum.UI_2D;
  uiCamera.priority = 1000;
  uiCamera.clearFlags = Camera.ClearFlag.DONT_CLEAR;

  if (!canvas.getComponent(hudView)) {
    const hud = canvas.addComponent(hudView);
    const makeLabel = (name, text, top, left, right, color) => {
      const labelNode = new Node(name);
      labelNode.layer = Layers.Enum.UI_2D;
      canvas.addChild(labelNode);
      labelNode.addComponent(UITransform).setContentSize(280, 32);
      const label = labelNode.addComponent(Label);
      label.string = text;
      label.fontSize = 22;
      label.lineHeight = 30;
      label.color = color;
      label.horizontalAlign = left === null ? HorizontalTextAlignment.RIGHT : HorizontalTextAlignment.LEFT;
      const widget = labelNode.addComponent(Widget);
      widget.isAlignTop = true;
      widget.top = top;
      if (left !== null) {
        widget.isAlignLeft = true;
        widget.left = left;
      } else {
        widget.isAlignRight = true;
        widget.right = right;
      }
      widget.updateAlignment();
      return label;
    };

    hud.levelLabel = makeLabel('LevelLabel', 'LV.1 回收小车', 16, 16, null, new Color(56, 189, 248));
    hud.massLabel = makeLabel('MassLabel', '质量: 0 kg', 48, 16, null, Color.WHITE);
    hud.coinsLabel = makeLabel('CoinsLabel', '🪙 0', 16, null, 16, new Color(251, 191, 36));
    hudAttached = true;
  }

  return { managerAttached, hudAttached, node: root.name };
}

exports.methods = { attachGameManager };

let attachTimer = null;

exports.load = () => {
  let attempts = 0;
  attachTimer = setInterval(() => {
    attempts += 1;
    try {
      const result = attachGameManager();
      console.log(`[black-hole-scene-repair] ${JSON.stringify(result)}`);
      clearInterval(attachTimer);
      attachTimer = null;
    } catch (error) {
      if (attempts >= 120) {
        console.error(`[black-hole-scene-repair] ${error instanceof Error ? error.message : String(error)}`);
        clearInterval(attachTimer);
        attachTimer = null;
      }
    }
  }, 500);
};

exports.unload = () => {
  if (attachTimer) {
    clearInterval(attachTimer);
    attachTimer = null;
  }
};
