/**
 * Home 预制体的数据绑定与交互控制。
 * 节点、Sprite、Label、Button 均由 Cocos Creator 保存到 HomePage.prefab；
 * 本组件只读取真实存档数据、绑定事件并驱动已存在的组件。
 */
import { _decorator, Button, Color, Component, director, Label, Node, Sprite } from 'cc';
import { eventBus } from '../core/EventBus';
import { MACHINE_EVOLUTION_CONFIG, SKINS_CONFIG } from '../data/GameConfig';
import { saveService } from '../data/SaveService';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';

const { ccclass } = _decorator;

@ccclass('HomePageController')
export class HomePageController extends Component {
  private buttonBindings: Array<[Button, () => void]> = [];
  private removeSkinChangedListener: (() => void) | null = null;

  onEnable(): void {
    this.refreshProfile();
    this.hideUnavailableActions();
    this.bindButtons();
    this.removeSkinChangedListener = eventBus.on('HOME_SKIN_CHANGED', this.refreshProfile, this);
  }

  onDisable(): void {
    for (const [button, handler] of this.buttonBindings) {
      button.node.off(Button.EventType.CLICK, handler, this);
    }
    this.buttonBindings.length = 0;
    this.removeSkinChangedListener?.();
    this.removeSkinChangedListener = null;
  }

  public refreshProfile(): void {
    const coinLabel = this.findLabel('CoinValue');
    if (coinLabel) {
      coinLabel.string = this.formatNumber(saveService.data.coins);
    }

    // The home status must represent the machine that is actually loaded in
    // the 3D scene, not merely a historical best level stored on disk.  A
    // separate machine page explains persistent progression; this compact
    // card stays truthful about the current playable machine.
    const machine = director.getScene()?.getComponentInChildren(BlackHoleMachine) || null;
    const savedLevel = Math.max(1, Math.min(MACHINE_EVOLUTION_CONFIG.length, saveService.data.machineLevel));
    const machineConfig = machine?.currentConfig || MACHINE_EVOLUTION_CONFIG[savedLevel - 1];

    const machineLabel = this.findLabel('MachineValue');
    if (machineLabel) {
      machineLabel.string = `LV.${machineConfig.level}`;
    }

    const machineName = this.findLabel('MachineName');
    if (machineName) {
      machineName.string = machineConfig.title;
    }

    const skin = SKINS_CONFIG.find((entry) => entry.id === saveService.data.currentSkinId) || SKINS_CONFIG[0];
    const hero = this.findNode('HeroBlackHole')?.getComponent(Sprite) || null;
    if (hero && skin) {
      const tint = new Color();
      Color.fromHEX(tint, skin.rimColor);
      hero.color = tint;
    }
  }

  private bindButtons(): void {
    this.bindButton('BtnStart', () => eventBus.emit('HOME_START_REQUESTED'));
    this.bindButton('BtnMode', () => eventBus.emit('HOME_MODE_REQUESTED'));
    // The Canvas-level RuntimePageInputRouter remains the SHOW_ALL fallback.
    // This native binding is also required after Creator rebuilds a page:
    // when the engine correctly targets BtnSkin, its capture fallback is not
    // guaranteed to hit the design-space rect.  The fallback marks that
    // event handled before target delivery, so one physical tap still cycles
    // exactly one genuinely unlocked skin.
    this.bindButton('BtnSkin', () => eventBus.emit('HOME_SKIN_REQUESTED'));
    this.bindButton('BtnMachine', () => eventBus.emit('HOME_MACHINE_REQUESTED'));
  }

  /**
   * “皮肤”与“机器”均已接到真实存档或机器状态。设置尚未有正式
   * Creator 页面支撑，因此不能作为灰色假按钮出现在玩家界面中。
   */
  private hideUnavailableActions(): void {
    for (const name of ['BtnSettings']) {
      const node = this.findNode(name);
      if (node) node.active = false;
    }
  }

  private bindButton(name: string, handler: () => void): void {
    const node = this.findNode(name);
    const button = node?.getComponent(Button);
    if (!button) {
      console.error(`[HomePageController] Missing serialized Button: ${name}`);
      return;
    }
    button.node.on(Button.EventType.CLICK, handler, this);
    this.buttonBindings.push([button, handler]);
  }

  private findLabel(name: string): Label | null {
    return this.findNode(name)?.getComponent(Label) ?? null;
  }

  private findNode(name: string): Node | null {
    return this.node.getChildByName(name) ?? this.node.getChildByName('SafeAreaRoot')?.getChildByName(name) ?? null;
  }

  private formatNumber(value: number): string {
    return Math.max(0, Math.floor(value)).toLocaleString('en-US');
  }
}
