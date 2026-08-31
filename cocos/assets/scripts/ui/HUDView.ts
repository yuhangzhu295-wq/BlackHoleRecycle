import {
  _decorator, Component, Label, Button, Node, Canvas, UITransform, Widget, Layers, Color, view, HorizontalTextAlignment, Sprite, SpriteFrame, director
} from 'cc';
import { eventBus } from '../core/EventBus';
import { saveService } from '../data/SaveService';

const { ccclass, property } = _decorator;

@ccclass('HUDView')
export class HUDView extends Component {
  public massLabel: Label | null = null;
  public levelLabel: Label | null = null;
  public coinsLabel: Label | null = null;

  private screens: Map<string, Node> = new Map();

  onLoad(): void {
    this.ensureNativeHUD();
    this.showScreen('Home');
  }

  private ensureNativeHUD(): void {
    const canvasNode = new Node('RuntimeHUDCanvas');
    canvasNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(canvasNode);
    canvasNode.addComponent(Canvas);

    const canvasTransform = canvasNode.getComponent(UITransform) ?? canvasNode.addComponent(UITransform);
    canvasTransform.setContentSize(view.getVisibleSize());

    // --- HOME SCREEN ---
    const homeScreen = this.createScreenNode('Home', canvasNode);
    this.createLabel(homeScreen, '黑洞回收站', 0, 150, false, Color.WHITE, 40, true);
    this.createButton(homeScreen, '开始游戏', 0, 0, () => this.showScreen('ModeSelect'));
    this.createLabel(homeScreen, `金币: ${saveService.data.coins}`, 0, -100, false, new Color(251, 191, 36), 24, true);

    // --- MODE SELECT SCREEN ---
    const modeScreen = this.createScreenNode('ModeSelect', canvasNode);
    this.createLabel(modeScreen, '选择模式', 0, 150, false, Color.WHITE, 36, true);
    this.createButton(modeScreen, '无尽模式', 0, 0, () => {
      this.showScreen('Gameplay');
      // Emit event to start game
    });

    // --- GAMEPLAY SCREEN ---
    const gameplayScreen = this.createScreenNode('Gameplay', canvasNode);
    this.levelLabel = this.createLabel(gameplayScreen, 'LV.1 回收小车', 16, 16, true, new Color(56, 189, 248), 22, false);
    this.massLabel = this.createLabel(gameplayScreen, '质量: 0 kg', 16, 44, true, Color.WHITE, 20, false);
    this.coinsLabel = this.createLabel(gameplayScreen, '🪙 0', 16, 16, false, new Color(251, 191, 36), 22, false);
    // Pause button
    this.createButton(gameplayScreen, '||', 16, 16, () => {
      eventBus.emit('UI_TRIGGER_PAUSE');
    }, false);

    // --- PAUSE SCREEN ---
    const pauseScreen = this.createScreenNode('Pause', canvasNode);
    this.createLabel(pauseScreen, '已暂停', 0, 150, false, Color.WHITE, 36, true);
    this.createButton(pauseScreen, '继续', 0, 0, () => {
      eventBus.emit('UI_TRIGGER_PAUSE');
    });
    this.createButton(pauseScreen, '返回首页', 0, -80, () => {
      if (director.isPaused()) director.resume();
      this.showScreen('Home');
    });

    // --- SETTLEMENT SCREEN ---
    const settlementScreen = this.createScreenNode('Settlement', canvasNode);
    this.createLabel(settlementScreen, '回收完成！', 0, 150, false, Color.WHITE, 36, true);
    this.createLabel(settlementScreen, '吸入: 0   金币: 0', 0, 50, false, Color.WHITE, 24, true);
    this.createButton(settlementScreen, '返回首页', 0, -50, () => {
      this.showScreen('Home');
    });
    
    // --- COMPRESSION / UPGRADE / REGION ---
    this.createScreenNode('Compression', canvasNode);
    this.createScreenNode('Upgrade', canvasNode);
    this.createScreenNode('RegionSwitch', canvasNode);
  }

  public showScreen(name: string): void {
    this.screens.forEach((node, key) => {
      node.active = (key === name);
    });
  }

  private createScreenNode(name: string, parent: Node): Node {
    const screenNode = new Node(`Screen_${name}`);
    screenNode.layer = Layers.Enum.UI_2D;
    const t = screenNode.addComponent(UITransform);
    t.setContentSize(view.getVisibleSize());
    const w = screenNode.addComponent(Widget);
    w.isAlignTop = w.isAlignBottom = w.isAlignLeft = w.isAlignRight = true;
    w.top = w.bottom = w.left = w.right = 0;
    parent.addChild(screenNode);
    this.screens.set(name, screenNode);
    screenNode.active = false;
    return screenNode;
  }

  private createLabel(parent: Node, text: string, margin: number, topOrY: number, alignLeft: boolean, color: Color, fontSize: number, isCenterY: boolean): Label {
    const node = new Node('Label');
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    const t = node.addComponent(UITransform);
    t.setContentSize(300, fontSize + 10);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 6;
    label.color = color;
    label.horizontalAlign = alignLeft ? HorizontalTextAlignment.LEFT : (isCenterY ? HorizontalTextAlignment.CENTER : HorizontalTextAlignment.RIGHT);

    const w = node.addComponent(Widget);
    if (isCenterY) {
      w.isAlignVerticalCenter = true;
      w.verticalCenter = topOrY;
      w.isAlignHorizontalCenter = true;
      w.horizontalCenter = margin;
    } else {
      w.isAlignTop = true;
      w.top = topOrY;
      if (alignLeft) { w.isAlignLeft = true; w.left = margin; }
      else { w.isAlignRight = true; w.right = margin; }
    }
    return label;
  }

  private createButton(parent: Node, text: string, x: number, y: number, callback: () => void, isCenter: boolean = true) {
    const node = new Node('Button');
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    const t = node.addComponent(UITransform);
    t.setContentSize(isCenter ? 200 : 50, 50);

    const bg = node.addComponent(Sprite);
    // In real app, we use a SpriteFrame. Here we just rely on Label or fallback.
    
    const label = this.createLabel(node, text, 0, 0, false, Color.BLACK, 24, true);

    const btn = node.addComponent(Button);
    node.on(Button.EventType.CLICK, callback, this);

    const w = node.addComponent(Widget);
    if (isCenter) {
      w.isAlignVerticalCenter = true;
      w.verticalCenter = y;
      w.isAlignHorizontalCenter = true;
      w.horizontalCenter = x;
    } else {
      w.isAlignTop = true; w.top = y;
      w.isAlignRight = true; w.right = x;
    }
  }

  public updateStats(mass: number, level: number, levelTitle: string, coins: number): void {
    if (this.massLabel) this.massLabel.string = `质量: ${Math.round(mass)} kg`;
    if (this.levelLabel) this.levelLabel.string = `LV.${level} ${levelTitle}`;
    if (this.coinsLabel) this.coinsLabel.string = `🪙 ${coins}`;
  }
}
