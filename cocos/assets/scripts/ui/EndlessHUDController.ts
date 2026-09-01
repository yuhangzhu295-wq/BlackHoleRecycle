/**
 * 编辑器保存的无尽模式 HUD 数据绑定器。
 * 正式节点由 Cocos Prefab 提供；本组件不在运行时创建 UI。
 */
import { _decorator, Button, Component, Label } from 'cc';
import { eventBus } from '../core/EventBus';

const { ccclass } = _decorator;

@ccclass('EndlessHUDController')
export class EndlessHUDController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.bindPause();
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) {
      button.node.off(Button.EventType.CLICK, handler, this);
    }
    this.bindings.length = 0;
  }

  public updateStats(mass: number, level: number, levelTitle: string, coins: number, regionName: string): void {
    this.setLabel('LevelValue', `LV.${level} ${levelTitle}`);
    this.setLabel('MassValue', `质量 ${Math.round(mass)} kg`);
    this.setLabel('CoinValue', Math.max(0, Math.floor(coins)).toLocaleString('en-US'));
    this.setLabel('RegionValue', regionName);
  }

  private bindPause(): void {
    const button = this.node.getChildByName('BtnPause')?.getComponent(Button);
    if (!button) {
      console.error('[EndlessHUDController] Missing serialized BtnPause.');
      return;
    }
    const handler = () => eventBus.emit('UI_TRIGGER_PAUSE');
    button.node.on(Button.EventType.CLICK, handler, this);
    this.bindings.push([button, handler]);
  }

  private setLabel(name: string, value: string): void {
    const label = this.node.getChildByName(name)?.getComponent(Label);
    if (label) label.string = value;
  }
}
