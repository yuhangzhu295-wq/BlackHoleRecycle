/**
 * 编辑器保存的无尽模式 HUD 数据绑定器。
 * 正式节点由 Cocos Prefab 提供；本组件不在运行时创建 UI。
 */
import { _decorator, Button, Color, Component, Label, Vec3 } from 'cc';
import { eventBus } from '../core/EventBus';
import { PickupFeedbackDiagnostics, PickupFeedbackPresenter } from './PickupFeedbackPresenter';

const { ccclass } = _decorator;

@ccclass('EndlessHUDController')
export class EndlessHUDController extends Component {
  private bindings: Array<[Button, () => void]> = [];
  private pickupFeedback: PickupFeedbackPresenter | null = null;

  onEnable(): void {
    // Individual live stat pills already provide all required information.
    // Do not cover the upper fifth of the portrait city with the legacy full
    // width shade; the gameplay reference keeps this space visible.
    const topShade = this.node.getChildByName('TopShade');
    if (topShade) topShade.active = false;
    this.pickupFeedback ||= new PickupFeedbackPresenter(this.node, 'CoinValue');
    this.bindPause();
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) {
      button.node.off(Button.EventType.CLICK, handler, this);
    }
    this.bindings.length = 0;
    this.pickupFeedback?.clear();
  }

  public updateStats(mass: number, level: number, levelTitle: string, coins: number, regionName: string): void {
    this.setLabel('LevelValue', `LV.${level} ${levelTitle}`);
    this.setLabel('MassValue', `质量 ${Math.round(mass)} kg`);
    this.setLabel('CoinValue', Math.max(0, Math.floor(coins)).toLocaleString('en-US'));
    this.setLabel('RegionValue', regionName);
  }

  public showAbsorbFeedback(position: Readonly<Vec3>, score: number, tier: number): void {
    const color = tier >= 3 ? new Color(255, 190, 65, 255)
      : tier === 2 ? new Color(255, 225, 95, 255)
        : new Color(255, 255, 255, 255);
    this.pickupFeedback?.emit(position, score, color);
  }

  public getPickupFeedbackDiagnostics(): PickupFeedbackDiagnostics | null {
    return this.pickupFeedback?.getDiagnostics() || null;
  }

  update(dt: number): void {
    this.pickupFeedback?.update(dt);
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
