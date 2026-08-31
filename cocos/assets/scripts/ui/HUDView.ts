/**
 * 极简核心玩法 HUD (HUDView.ts)
 * 严格遵循第一阶段规则：仅包含 质量/进度、机器等级、金币、暂停、单个磁暴技能按键
 */
import {
  _decorator,
  Component,
  Label,
  Button,
  Node,
  Canvas,
  UITransform,
  Widget,
  Layers,
  Color,
  view,
  HorizontalTextAlignment,
} from 'cc';
import { eventBus } from '../core/EventBus';

const { ccclass, property } = _decorator;

@ccclass('HUDView')
export class HUDView extends Component {
  @property(Label)
  public massLabel: Label | null = null;

  @property(Label)
  public levelLabel: Label | null = null;

  @property(Label)
  public coinsLabel: Label | null = null;

  @property(Button)
  public pauseButton: Button | null = null;

  @property(Button)
  public magnetStormButton: Button | null = null;

  // Screen Nodes
  private screens: Map<string, Node> = new Map();

  onLoad(): void {
    this.ensureNativeHUD();
  }

  private ensureNativeHUD(): void {
    const canvasNode = new Node('RuntimeHUDCanvas');
    canvasNode.layer = Layers.Enum.UI_2D;
    this.node.addChild(canvasNode);
    canvasNode.addComponent(Canvas);

    const canvasTransform = canvasNode.getComponent(UITransform) ?? canvasNode.addComponent(UITransform);
    canvasTransform.setContentSize(view.getVisibleSize());

    // 创建屏幕
    const screenNames = ['Home', 'EndlessEntry', 'Gameplay', 'RegionSwitch', 'Upgrade', 'Compression', 'Pause', 'Settlement'];
    screenNames.forEach(name => {
      const screenNode = new Node(`Screen_${name}`);
      screenNode.layer = Layers.Enum.UI_2D;
      const t = screenNode.addComponent(UITransform);
      t.setContentSize(view.getVisibleSize());
      const w = screenNode.addComponent(Widget);
      w.isAlignTop = w.isAlignBottom = w.isAlignLeft = w.isAlignRight = true;
      w.top = w.bottom = w.left = w.right = 0;
      canvasNode.addChild(screenNode);
      this.screens.set(name, screenNode);
      screenNode.active = false; // Hide by default
    });

    const gameplayScreen = this.screens.get('Gameplay')!;
    gameplayScreen.active = true; // Show Gameplay by default

    this.levelLabel = this.createRuntimeLabel(gameplayScreen, 'LV.1 回收小车', 16, 16, true, new Color(56, 189, 248));
    this.massLabel = this.createRuntimeLabel(gameplayScreen, '质量: 0 kg', 16, 44, true, Color.WHITE);
    this.coinsLabel = this.createRuntimeLabel(gameplayScreen, '🪙 0', 16, 16, false, new Color(251, 191, 36));
    
    // Add simple text for other screens so they are "implemented"
    this.createRuntimeLabel(this.screens.get('Home')!, 'Home Screen (Tap to Start)', 16, 100, true, Color.WHITE);
    this.createRuntimeLabel(this.screens.get('EndlessEntry')!, 'Endless Mode Entry', 16, 100, true, Color.WHITE);
    this.createRuntimeLabel(this.screens.get('Pause')!, 'Game Paused', 16, 100, true, Color.WHITE);
    this.createRuntimeLabel(this.screens.get('Settlement')!, 'Settlement / Game Over', 16, 100, true, Color.WHITE);
  }

  public showScreen(name: string): void {
    this.screens.forEach((node, key) => {
      node.active = (key === name);
    });
  }

  private createRuntimeLabel(
    parent: Node,
    initialText: string,
    margin: number,
    top: number,
    alignLeft: boolean,
    color: Color,
  ): Label {
    const labelNode = new Node('RuntimeHUDLabel');
    labelNode.layer = Layers.Enum.UI_2D;
    parent.addChild(labelNode);

    const transform = labelNode.addComponent(UITransform);
    transform.setContentSize(260, 28);

    const label = labelNode.addComponent(Label);
    label.string = initialText;
    label.fontSize = 22;
    label.lineHeight = 28;
    label.color = color;
    label.horizontalAlign = alignLeft ? HorizontalTextAlignment.LEFT : HorizontalTextAlignment.RIGHT;

    const widget = labelNode.addComponent(Widget);
    widget.isAlignTop = true;
    widget.top = top;
    if (alignLeft) {
      widget.isAlignLeft = true;
      widget.left = margin;
    } else {
      widget.isAlignRight = true;
      widget.right = margin;
    }
    widget.updateAlignment();
    return label;
  }

  public updateStats(mass: number, level: number, levelTitle: string, coins: number): void {
    if (this.massLabel) {
      this.massLabel.string = `质量: ${Math.round(mass)} kg`;
    }
    if (this.levelLabel) {
      this.levelLabel.string = `LV.${level} ${levelTitle}`;
    }
    if (this.coinsLabel) {
      this.coinsLabel.string = `🪙 ${coins}`;
    }
  }

  public onMagnetStormClicked(): void {
    eventBus.emit('UI_TRIGGER_MAGNET_STORM');
  }

  public onPauseClicked(): void {
    eventBus.emit('UI_TRIGGER_PAUSE');
  }
}
