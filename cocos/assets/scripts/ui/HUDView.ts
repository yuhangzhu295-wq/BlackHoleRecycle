/**
 * 原生 UI 视图层管理器 (HUDView.ts)
 * 包含：Home、ModeSelect、Gameplay、Pause、Settlement 5 大核心界面
 */
import {
  _decorator, Component, Label, Button, Node, Canvas, UITransform, Widget, Layers, Color, view, HorizontalTextAlignment, Graphics, director, js, input, Input, EventTouch, EventMouse, Vec3
} from 'cc';
import { eventBus } from '../core/EventBus';
import { saveService } from '../data/SaveService';

const { ccclass, property } = _decorator;

@ccclass('HUDView')
export class HUDView extends Component {
  public massLabel: Label | null = null;
  public levelLabel: Label | null = null;
  public coinsLabel: Label | null = null;
  public regionLabel: Label | null = null;
  
  // Settlement UI references
  public settlementStatsLabel: Label | null = null;

  public currentScreenName: string = 'Home';
  private screens: Map<string, Node> = new Map();

  onLoad(): void {
    this.ensureNativeHUD();
    this.showScreen('Home');

    input.on(Input.EventType.TOUCH_END, this.handleGlobalTouch, this);
    input.on(Input.EventType.MOUSE_UP, this.handleGlobalMouse, this);
  }

  onDestroy(): void {
    input.off(Input.EventType.TOUCH_END, this.handleGlobalTouch, this);
    input.off(Input.EventType.MOUSE_UP, this.handleGlobalMouse, this);
  }

  private handleGlobalTouch(event: EventTouch): void {
    this.checkButtonHit(event.getUILocation());
  }

  private handleGlobalMouse(event: EventMouse): void {
    this.checkButtonHit(event.getUILocation());
  }

  private checkButtonHit(uiLoc: { x: number; y: number }): void {
    const screenNode = this.screens.get(this.currentScreenName);
    if (!screenNode || !screenNode.active) return;

    // 若在 Gameplay 界面点击右上角区域，精准触发暂停
    if (this.currentScreenName === 'Gameplay') {
      if (uiLoc.x > 480 && uiLoc.y > 450) {
        eventBus.emit('UI_TRIGGER_PAUSE');
        return;
      }
    }

    for (const child of screenNode.children) {
      if (child.name.startsWith('Btn_') && child.active) {
        const trans = child.getComponent(UITransform);
        if (trans) {
          const local = trans.convertToNodeSpaceAR(new Vec3(uiLoc.x, uiLoc.y, 0));
          const hw = (trans.width / 2) + 30;
          const hh = (trans.height / 2) + 30;
          if (local.x >= -hw && local.x <= hw && local.y >= -hh && local.y <= hh) {
            child.emit(Node.EventType.TOUCH_END);
            break;
          }
        }
      }
    }
  }

  private ensureNativeHUD(): void {
    const scene = director.getScene();
    let canvasNode = scene?.getChildByName('Canvas') || this.node.getChildByName('RuntimeHUDCanvas');
    if (!canvasNode) {
      canvasNode = new Node('RuntimeHUDCanvas');
      canvasNode.layer = Layers.Enum.UI_2D;
      this.node.addChild(canvasNode);
      canvasNode.addComponent(Canvas);
    }

    const canvasTransform = canvasNode.getComponent(UITransform) ?? canvasNode.addComponent(UITransform);
    canvasTransform.setContentSize(view.getVisibleSize());

    // --- 1. HOME SCREEN ---
    const homeScreen = this.createScreenNode('Home', canvasNode);
    this.createLabel(homeScreen, '黑洞回收站', 0, 160, false, new Color(56, 189, 248), 38, true);
    this.createLabel(homeScreen, '3D 解压物理吞噬', 0, 105, false, new Color(203, 213, 225), 20, true);
    
    this.createButton(homeScreen, 'Btn_Start', '开始游戏', 0, -10, 220, 60, () => {
      this.showScreen('ModeSelect');
      eventBus.emit('UI_SWITCH_SCREEN', { screen: 'ModeSelect' });
    });
    
    this.createLabel(homeScreen, `🪙 资产: ${saveService.data.coins}  |  最高机器: LV.${saveService.data.machineLevel}`, 0, -110, false, new Color(251, 191, 36), 20, true);

    // --- 2. MODE SELECT SCREEN ---
    const modeScreen = this.createScreenNode('ModeSelect', canvasNode);
    this.createLabel(modeScreen, '选择模式', 0, 150, false, Color.WHITE, 34, true);
    
    this.createButton(modeScreen, 'Btn_Endless', '🚀 无尽回收模式', 0, 20, 240, 60, () => {
      this.showScreen('Gameplay');
      eventBus.emit('GAME_START_ENDLESS');
      eventBus.emit('UI_SWITCH_SCREEN', { screen: 'Gameplay' });
    });

    this.createButton(modeScreen, 'Btn_ModeBack', '返回首页', 0, -80, 180, 48, () => {
      this.showScreen('Home');
      eventBus.emit('UI_SWITCH_SCREEN', { screen: 'Home' });
    });

    // --- 3. GAMEPLAY SCREEN ---
    const gameplayScreen = this.createScreenNode('Gameplay', canvasNode);
    this.levelLabel = this.createLabel(gameplayScreen, 'LV.1 回收小车', 20, 24, true, new Color(56, 189, 248), 22, false);
    this.massLabel = this.createLabel(gameplayScreen, '质量: 0 kg', 20, 56, true, Color.WHITE, 18, false);
    this.coinsLabel = this.createLabel(gameplayScreen, '🪙 0', 80, 24, false, new Color(251, 191, 36), 22, false);
    this.regionLabel = this.createLabel(gameplayScreen, '【卧室杂物区】', 0, 24, false, new Color(226, 232, 240), 20, false, true);

    // 暂停按钮 (右上角)
    this.createButton(gameplayScreen, 'Btn_Pause', '❚❚', 20, 20, 48, 48, () => {
      eventBus.emit('UI_TRIGGER_PAUSE');
    }, false);

    // --- 4. PAUSE SCREEN ---
    const pauseScreen = this.createScreenNode('Pause', canvasNode);
    this.createBackgroundOverlay(pauseScreen);
    this.createLabel(pauseScreen, '游戏已暂停', 0, 140, false, Color.WHITE, 36, true);
    
    this.createButton(pauseScreen, 'Btn_Resume', '继续游戏', 0, 20, 200, 56, () => {
      eventBus.emit('UI_TRIGGER_PAUSE');
    });
    
    this.createButton(pauseScreen, 'Btn_PauseSettle', '结束本局并结算', 0, -50, 220, 54, () => {
      eventBus.emit('GAME_TRIGGER_SETTLEMENT');
    });

    this.createButton(pauseScreen, 'Btn_PauseHome', '直接返回首页', 0, -120, 180, 46, () => {
      eventBus.emit('GAME_RETURN_HOME');
      this.showScreen('Home');
    });

    // --- 5. SETTLEMENT SCREEN ---
    const settlementScreen = this.createScreenNode('Settlement', canvasNode);
    this.createBackgroundOverlay(settlementScreen);
    this.createLabel(settlementScreen, '回收大获成功！', 0, 160, false, new Color(74, 222, 128), 36, true);
    
    this.settlementStatsLabel = this.createLabel(
      settlementScreen,
      '吸入物品: 0\n获得金币: 0\n机器等级: LV.1\n探索区域: 1\n本局质量: 0 kg',
      0, 30, false, Color.WHITE, 20, true
    );
    
    this.createButton(settlementScreen, 'Btn_Restart', '再来一局', 0, -70, 200, 54, () => {
      this.showScreen('Gameplay');
      eventBus.emit('GAME_START_ENDLESS');
    });

    this.createButton(settlementScreen, 'Btn_SettlementHome', '返回首页', 0, -140, 200, 54, () => {
      this.showScreen('Home');
      eventBus.emit('GAME_RETURN_HOME');
    });
  }

  public showScreen(name: string): void {
    this.currentScreenName = name;
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

  private createBackgroundOverlay(parent: Node): void {
    const bgNode = new Node('DarkOverlay');
    bgNode.layer = Layers.Enum.UI_2D;
    parent.addChild(bgNode);
    const t = bgNode.addComponent(UITransform);
    t.setContentSize(view.getVisibleSize());
    const g = bgNode.addComponent(Graphics);
    g.fillColor = new Color(15, 23, 42, 220); // 半透明深色蒙层
    g.rect(-view.getVisibleSize().width/2, -view.getVisibleSize().height/2, view.getVisibleSize().width, view.getVisibleSize().height);
    g.fill();
  }

  private createLabel(
    parent: Node,
    text: string,
    margin: number,
    topOrY: number,
    alignLeft: boolean,
    color: Color,
    fontSize: number,
    isCenterY: boolean,
    isCenterTop: boolean = false
  ): Label {
    const node = new Node('Label');
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    const t = node.addComponent(UITransform);
    t.setContentSize(360, (fontSize + 8) * (text.split('\n').length || 1));
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.color = color;
    label.horizontalAlign = alignLeft ? HorizontalTextAlignment.LEFT : (isCenterY || isCenterTop ? HorizontalTextAlignment.CENTER : HorizontalTextAlignment.RIGHT);

    const w = node.addComponent(Widget);
    if (isCenterY) {
      w.isAlignVerticalCenter = true;
      w.verticalCenter = topOrY;
      w.isAlignHorizontalCenter = true;
      w.horizontalCenter = margin;
    } else if (isCenterTop) {
      w.isAlignTop = true;
      w.top = topOrY;
      w.isAlignHorizontalCenter = true;
      w.horizontalCenter = 0;
    } else {
      w.isAlignTop = true;
      w.top = topOrY;
      if (alignLeft) {
        w.isAlignLeft = true;
        w.left = margin;
      } else {
        w.isAlignRight = true;
        w.right = margin;
      }
    }
    return label;
  }

  private createButton(
    parent: Node,
    nodeName: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    callback: () => void,
    isCenter: boolean = true
  ): Node {
    const node = new Node(nodeName);
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    const t = node.addComponent(UITransform);
    t.setContentSize(width, height);

    // 绘制按钮圆角背景
    const g = node.addComponent(Graphics);
    g.fillColor = isCenter ? new Color(59, 130, 246) : new Color(71, 85, 105);
    g.roundRect(-width / 2, -height / 2, width, height, 10);
    g.fill();

    // 按钮文字
    const labelNode = new Node('BtnLabel');
    labelNode.layer = Layers.Enum.UI_2D;
    node.addChild(labelNode);
    const lt = labelNode.addComponent(UITransform);
    lt.setContentSize(width, height);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = isCenter ? 22 : 18;
    label.color = Color.WHITE;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;

    const btn = node.addComponent(Button);
    node.on(Button.EventType.CLICK, callback, this);
    node.on(Node.EventType.TOUCH_END, callback, this);

    if (isCenter) {
      node.setPosition(x, y, 0);
      const w = node.addComponent(Widget);
      w.isAlignVerticalCenter = true;
      w.verticalCenter = y;
      w.isAlignHorizontalCenter = true;
      w.horizontalCenter = x;
      w.updateAlignment();
    } else {
      const vs = view.getVisibleSize();
      const halfW = (vs.width > 0 ? vs.width : 960) / 2;
      const halfH = (vs.height > 0 ? vs.height : 640) / 2;
      node.setPosition(halfW - (width / 2) - x, halfH - (height / 2) - y, 0);
      const w = node.addComponent(Widget);
      w.isAlignTop = true;
      w.top = y;
      w.isAlignRight = true;
      w.right = x;
      w.updateAlignment();
    }

    return node;
  }

  public updateStats(mass: number, level: number, levelTitle: string, coins: number, regionName?: string): void {
    if (this.massLabel) this.massLabel.string = `质量: ${Math.round(mass)} kg`;
    if (this.levelLabel) this.levelLabel.string = `LV.${level} ${levelTitle}`;
    if (this.coinsLabel) this.coinsLabel.string = `🪙 ${coins}`;
    if (this.regionLabel && regionName) this.regionLabel.string = `【${regionName}】`;
  }

  public updateSettlement(absorbed: number, coins: number, level: number, regions: number, mass: number = 0): void {
    if (this.settlementStatsLabel) {
      this.settlementStatsLabel.string = `吸入物品: ${absorbed}\n获得金币: ${coins}\n最终等级: LV.${level}\n探索区域数: ${regions}\n本局质量: ${Math.round(mass)} kg`;
    }
  }
}

js.setClassName('679abvk+jtLlL14cyMtoApA', HUDView);
js.setClassName('HUDView', HUDView);
