/**
 * Home 预制体的数据绑定与交互控制。
 * 节点、Sprite、Label、Button 均由 Cocos Creator 保存到 HomePage.prefab；
 * 本组件只读取真实存档数据、绑定事件并驱动已存在的组件。
 */
import { _decorator, Button, Component, Label, Node } from 'cc';
import { eventBus } from '../core/EventBus';
import { MACHINE_EVOLUTION_CONFIG } from '../data/GameConfig';
import { saveService } from '../data/SaveService';

const { ccclass } = _decorator;

@ccclass('HomePageController')
export class HomePageController extends Component {
  private buttonBindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.refreshProfile();
    this.setUnavailableActionsDisabled();
    this.bindButtons();
  }

  onDisable(): void {
    for (const [button, handler] of this.buttonBindings) {
      button.node.off(Button.EventType.CLICK, handler, this);
    }
    this.buttonBindings.length = 0;
  }

  public refreshProfile(): void {
    const coinLabel = this.findLabel('CoinValue');
    if (coinLabel) {
      coinLabel.string = this.formatNumber(saveService.data.coins);
    }

    const savedLevel = Math.max(1, Math.min(MACHINE_EVOLUTION_CONFIG.length, saveService.data.machineLevel));
    const machineConfig = MACHINE_EVOLUTION_CONFIG[savedLevel - 1];

    const machineLabel = this.findLabel('MachineValue');
    if (machineLabel) {
      machineLabel.string = `LV.${machineConfig.level}`;
    }

    const machineName = this.findLabel('MachineName');
    if (machineName) {
      machineName.string = machineConfig.title;
    }
  }

  private bindButtons(): void {
    this.bindButton('BtnStart', () => eventBus.emit('HOME_START_REQUESTED'));
    this.bindButton('BtnMode', () => eventBus.emit('HOME_MODE_REQUESTED'));
  }

  /**
   * 皮肤、机器和设置还没有对应的编辑器保存页面。保持它们可点击会形成假按钮，
   * 因而在对应正式页面完成以前明确禁用，而不是吞掉用户输入或伪造反馈。
   */
  private setUnavailableActionsDisabled(): void {
    for (const name of ['BtnSkin', 'BtnMachine', 'BtnSettings']) {
      const node = this.node.getChildByName(name);
      const button = node?.getComponent(Button);
      if (button) button.interactable = false;

    }
  }

  private bindButton(name: string, handler: () => void): void {
    const node = this.node.getChildByName(name);
    const button = node?.getComponent(Button);
    if (!button) {
      console.error(`[HomePageController] Missing serialized Button: ${name}`);
      return;
    }
    button.node.on(Button.EventType.CLICK, handler, this);
    this.buttonBindings.push([button, handler]);
  }

  private findLabel(name: string): Label | null {
    return this.node.getChildByName(name)?.getComponent(Label) ?? null;
  }

  private formatNumber(value: number): string {
    return Math.max(0, Math.floor(value)).toLocaleString('en-US');
  }
}
