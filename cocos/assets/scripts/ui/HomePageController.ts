/**
 * Home 预制体的数据绑定与交互控制。
 * 节点、Label、Button、Graphics 均由 Cocos Creator 保存到 HomePage.prefab；
 * 本组件只读取真实存档数据、绑定事件并驱动已存在的组件。
 */
import { _decorator, Button, Component, Label, Node } from 'cc';
import { eventBus } from '../core/EventBus';
import { saveService } from '../data/SaveService';

const { ccclass } = _decorator;

@ccclass('HomePageController')
export class HomePageController extends Component {
  private buttonBindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.refreshProfile();
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

    const machineLabel = this.findLabel('MachineValue');
    if (machineLabel) {
      machineLabel.string = `LV.${saveService.data.machineLevel}`;
    }

    const machineName = this.findLabel('MachineName');
    if (machineName) {
      machineName.string = '黑洞回收机';
    }
  }

  private bindButtons(): void {
    this.bindButton('BtnStart', () => eventBus.emit('HOME_START_REQUESTED'));
    this.bindButton('BtnMode', () => eventBus.emit('HOME_MODE_REQUESTED'));
    this.bindButton('BtnSkin', () => eventBus.emit('HOME_SKIN_REQUESTED'));
    this.bindButton('BtnMachine', () => eventBus.emit('HOME_MACHINE_REQUESTED'));
    this.bindButton('BtnSettings', () => eventBus.emit('HOME_SETTINGS_REQUESTED'));
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
