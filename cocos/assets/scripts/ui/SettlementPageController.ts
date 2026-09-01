/** 编辑器保存的结算页数据绑定与真实按钮事件。 */
import { _decorator, Button, Component, Label } from 'cc';
import { eventBus } from '../core/EventBus';

const { ccclass } = _decorator;

@ccclass('SettlementPageController')
export class SettlementPageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.bind('BtnRestart', () => eventBus.emit('GAME_START_ENDLESS'));
    this.bind('BtnHome', () => eventBus.emit('GAME_RETURN_HOME'));
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) {
      button.node.off(Button.EventType.CLICK, handler, this);
    }
    this.bindings.length = 0;
  }

  public updateStats(absorbed: number, coins: number, level: number, regions: number, mass: number): void {
    this.setLabel('AbsorbedValue', `${Math.max(0, absorbed)}`);
    this.setLabel('CoinValue', `${Math.max(0, coins)}`);
    this.setLabel('LevelValue', `LV.${Math.max(1, level)}`);
    this.setLabel('RegionValue', `${Math.max(1, regions)}`);
    this.setLabel('MassValue', `${Math.round(Math.max(0, mass))} kg`);
  }

  private bind(name: string, handler: () => void): void {
    const button = this.node.getChildByName(name)?.getComponent(Button);
    if (!button) {
      console.error(`[SettlementPageController] Missing serialized ${name}.`);
      return;
    }
    button.node.on(Button.EventType.CLICK, handler, this);
    this.bindings.push([button, handler]);
  }

  private setLabel(name: string, value: string): void {
    const label = this.node.getChildByName(name)?.getComponent(Label);
    if (label) label.string = value;
  }
}
