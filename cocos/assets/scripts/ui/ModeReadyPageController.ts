/**
 * Mode Ready 页面控制器（无尽探索 / 竞技乱斗 共用）。
 * 挂载于编辑器保存的 EndlessReadyPage / ArenaReadyPage 节点。
 *
 * 正式流程：HOME → MODE SELECT → MODE READY → START → GAMEPLAY。
 * 模式卡只负责进入本页，绝不直接开局；只有 BtnStart 才发出开局事件。
 * 导出 MODE_READY_LAYOUT 供契约测试在无 Cocos 运行时的情况下解析验证。
 */
import { _decorator, Button, Component, Enum, Label, Node, UITransform } from 'cc';
import { eventBus } from '../core/EventBus';
import { MACHINE_EVOLUTION_CONFIG } from '../data/GameConfig';
import { saveService } from '../data/SaveService';

const { ccclass, property } = _decorator;

export enum ModeReadyKind {
  ENDLESS = 0,
  ARENA = 1,
}

// [width, height, cocosX, cocosY] in the 720x1280 design space,
// using the same center-origin conversion as MODE_SELECT_LAYOUT.
export const MODE_READY_LAYOUT = {
  Background:     [720, 1280,    0,    0],
  BtnBack:        [ 80,   80, -300,  568],
  Header:         [430,  100,    0,  534],
  HeaderTitle:    [500,   64,    0,  534],
  MapPreview:     [560,  280,    0,  310],
  StatCaption:    [240,   44, -150,  118],
  StatValue:      [280,   44,  140,  118],
  MachineCaption: [240,   44, -150,   58],
  MachineValue:   [280,   44,  140,   58],
  IntroText:      [600,  150,    0,  -80],
  BtnStart:       [480,  150,    0, -290],
  BtnStartLabel:  [440,   60,    0, -290],
} as const;

@ccclass('ModeReadyPageController')
export class ModeReadyPageController extends Component {
  @property({ type: Enum(ModeReadyKind), tooltip: '该 Ready 页对应的玩法模式。' })
  public mode: ModeReadyKind = ModeReadyKind.ENDLESS;

  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.applyLayout();
    this.hideStaleHeaderTitle();
    this.refreshProfile();
    this.bind('BtnBack', () => eventBus.emit('READY_BACK_REQUESTED'));
    this.bind('BtnStart', () => eventBus.emit('READY_START_REQUESTED'));
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) {
      button.node.off(Button.EventType.CLICK, handler, this);
    }
    this.bindings.length = 0;
  }

  /** Apply layout table to existing scene nodes without touching Game.scene/prefab/meta. */
  private applyLayout(): void {
    for (const [name, [width, height, x, y]] of Object.entries(MODE_READY_LAYOUT)) {
      this.resizeAndPlace(name, width, height, x, y);
    }
  }

  /**
   * The Ready page reuses old serialized UI where a large "模式选择" title node
   * still sits at the top. It overlaps the per-mode HeaderTitle ("无尽探索" /
   * "竞技乱斗"). Clear its label or hide the whole node so only the correct
   * mode title is visible. Does not change prefab/meta/UUID/session architecture.
   */
  private hideStaleHeaderTitle(): void {
    const header = this.findNode('Header');
    if (!header) return;
    const label = header.getComponent(Label) ?? header.getComponentInChildren(Label);
    if (label) {
      label.string = '';
      return;
    }
    header.active = false;
  }

  private resizeAndPlace(name: string, width: number, height: number, x: number, y: number): void {
    const node = this.findNode(name);
    if (!node) return;
    const transform = node.getComponent(UITransform);
    if (transform) transform.setContentSize(width, height);
    node.setPosition(x, y, 0);
  }

  private findNode(name: string): Node | null {
    return this.node.getChildByName(name)
      ?? this.node.getChildByName('SafeAreaRoot')?.getChildByName(name)
      ?? null;
  }

  private bind(name: string, handler: () => void): void {
    const button = this.node.getChildByName(name)?.getComponent(Button);
    if (!button) {
      console.error('[ModeReadyPageController] Missing serialized Button: ' + name);
      return;
    }
    button.node.on(Button.EventType.CLICK, handler, this);
    this.bindings.push([button, handler]);
  }

  private setLabel(name: string, text: string): void {
    const label = this.findNode(name)?.getComponent(Label);
    if (label) label.string = text;
  }

  private refreshProfile(): void {
    const machineLevel = Math.max(1, Math.min(MACHINE_EVOLUTION_CONFIG.length, saveService.data.machineLevel || 1));
    const machine = MACHINE_EVOLUTION_CONFIG[machineLevel - 1];
    this.setLabel('MachineValue', `LV.${machineLevel} ${machine.title}`);
    if (this.mode === ModeReadyKind.ENDLESS) {
      this.setLabel('HeaderTitle', '无尽探索');
      this.setLabel('StatCaption', '历史最高纪录');
      this.setLabel('StatValue', Math.max(0, Math.floor(saveService.data.highScore)).toLocaleString('en-US'));
      this.setLabel('IntroText', '吞噬 → 成长 → 解锁更大物体\n持续探索无限城市，冲击更高 Mass 纪录');
      this.setLabel('BtnStartLabel', '开始探索');
    } else {
      this.setLabel('HeaderTitle', '竞技乱斗');
      this.setLabel('StatCaption', '对局规则');
      this.setLabel('StatValue', '8 人 · 3:00 限时');
      this.setLabel('IntroText', '吞噬资源成长，淘汰弱小玩家\n躲避比你更大的对手，阵亡可复活');
      this.setLabel('BtnStartLabel', '开始乱斗');
    }
  }
}
