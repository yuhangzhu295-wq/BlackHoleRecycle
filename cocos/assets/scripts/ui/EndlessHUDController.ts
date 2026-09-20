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
    // The UI layer renders fit-height, not fit-width: `UICamera` is orthographic
    // with `orthoHeight = 640` (= designHeight / 2), so at 390x844 the usable
    // design half-width is `640 * (390/844) = 295.75` rather than 360. The row
    // is authored 622 design px wide, so it is clamped by
    // `applyHudSafeAreaInset` below. (This is not a viewport crop: the global
    // policy is `ResolutionPolicy.FIXED_WIDTH`, under which the viewport returns
    // the full design width and takes the surplus vertically.)
    applyHudSafeAreaInset(this.node);
    this.setLabel('LevelValue', `LV.${level} ${levelTitle}`);
    // No space anywhere in the mass readout. At fontSize 18 the serialized
    // `cc.LabelOutline` carries no `_width`, so it uses the default 2 and each
    // glyph's outline grows 2px into an adjacent ~4px space and fills it. Both
    // spaces did this: `质量 56150 kg` rendered as `质量-56150-kg`, and after
    // only the unit space was removed the remaining one still rendered
    // `质量-3715kg`, which reads like a negative mass in the real frame. The
    // unit is already bare, so drop this space too and keep the authored
    // outline style rather than weakening it.
    this.setLabel('MassValue', `质量${Math.round(mass)}kg`);
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
