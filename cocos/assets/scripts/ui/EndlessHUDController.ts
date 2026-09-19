/**
 * 编辑器保存的无尽模式 HUD 数据绑定器。
 * 正式节点由 Cocos Prefab 提供；本组件不在运行时创建 UI。
 */
import { _decorator, Button, Camera, Color, Component, Label, Vec3 } from 'cc';
import { eventBus } from '../core/EventBus';
import { CompressibleObject } from '../gameplay/CompressibleObject';
import { applyHudSafeAreaInset } from './HudSafeAreaInset';
import { PickupFeedbackDiagnostics, PickupFeedbackPresenter } from './PickupFeedbackPresenter';
import { TierLockDiagnostics, TierLockPresenter } from './TierLockPresenter';
import { TierUpgradeDiagnostics, TierUpgradePresenter } from './TierUpgradePresenter';

const { ccclass } = _decorator;

@ccclass('EndlessHUDController')
export class EndlessHUDController extends Component {
  private bindings: Array<[Button, () => void]> = [];
  private pickupFeedback: PickupFeedbackPresenter | null = null;
  /**
   * V4 reference 10 State B. A short, non-blocking upgrade banner driven by the
   * existing MACHINE_EVOLVED event; it is not a page and owns no gameplay state.
   */
  private tierUpgrade: TierUpgradePresenter | null = null;
  /**
   * V4 reference 10 State A. The readable "需要 LV.X" prompt, projected onto the
   * screen because a Label on a code-built node never renders in a built player.
   */
  private tierLock: TierLockPresenter | null = null;

  onEnable(): void {
    // Individual live stat pills already provide all required information.
    // Do not cover the upper fifth of the portrait city with the legacy full
    // width shade; the gameplay reference keeps this space visible.
    const topShade = this.node.getChildByName('TopShade');
    if (topShade) topShade.active = false;
    this.pickupFeedback ||= new PickupFeedbackPresenter(this.node, 'CoinValue');
    // Reuse an already serialized HUD label as the glyph template so the banner
    // shares the permanent HUD's Creator-owned font configuration.
    this.tierUpgrade ||= new TierUpgradePresenter(this.node, 'LevelValue');
    this.tierUpgrade.enable();
    this.tierLock ||= new TierLockPresenter(this.node, 'RegionValue');
    this.bindPause();
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) {
      button.node.off(Button.EventType.CLICK, handler, this);
    }
    this.bindings.length = 0;
    this.pickupFeedback?.clear();
    this.tierUpgrade?.disable();
    this.tierLock?.clear();
  }

  public updateStats(mass: number, level: number, levelTitle: string, coins: number, regionName: string): void {
    // A 390x844 device crops ~64 design px from each side of the 720x1280
    // design, which cut the coin pill and the pause button with the frame edge.
    applyHudSafeAreaInset(this.node);
    this.setLabel('LevelValue', `LV.${level} ${levelTitle}`);
    // No space before the unit: at fontSize 18 the serialized LabelOutline
    // (default width 2) bridges the ~4px space between `56150` and `kg`, which
    // renders as a hyphen and reads like a negative number in the real frame.
    this.setLabel('MassValue', `质量 ${Math.round(mass)}kg`);
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

  public getTierUpgradeDiagnostics(): TierUpgradeDiagnostics | null {
    return this.tierUpgrade?.getDiagnostics() || null;
  }

  /** Driven once per gameplay frame by HUDView; reads the FSM, never drives it. */
  public updateTierLock(objects: readonly CompressibleObject[], camera: Camera | null): void {
    this.tierLock?.update(objects, camera);
  }

  public getTierLockDiagnostics(): TierLockDiagnostics | null {
    return this.tierLock?.getDiagnostics() || null;
  }

  update(dt: number): void {
    this.pickupFeedback?.update(dt);
    this.tierUpgrade?.update(dt);
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
