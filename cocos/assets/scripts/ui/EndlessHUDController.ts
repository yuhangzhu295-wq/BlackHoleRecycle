/**
 * 编辑器保存的无尽模式 HUD 数据绑定器。
 * 正式节点由 Cocos Prefab 提供；本组件不在运行时创建 UI。
 */
import { _decorator, Button, Camera, Color, Component, instantiate, Label, Node, Sprite, UITransform, Vec3 } from 'cc';
import { eventBus } from '../core/EventBus';
import { MACHINE_EVOLUTION_CONFIG } from '../data/GameConfig';
import { CompressibleObject } from '../gameplay/CompressibleObject';
import { applyHudSafeAreaInset } from './HudSafeAreaInset';
import { FirstRunHintDiagnostics, FirstRunHintPresenter } from './FirstRunHintPresenter';
import { PickupFeedbackDiagnostics, PickupFeedbackPresenter } from './PickupFeedbackPresenter';
import { TierLockDiagnostics, TierLockPresenter } from './TierLockPresenter';
import { TierUpgradeDiagnostics, TierUpgradePresenter } from './TierUpgradePresenter';
import { UIAssetLibrary } from './UIAssetLibrary';
import { colorFromToken, HUD_SEMANTIC, tierUpgradeColor } from './UIStyleTokens';

const { ccclass } = _decorator;

/** Child node the authored progress bar is mounted as. */
const PROGRESS_BAR_NODE = 'ProgressBar';

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
  /**
   * V8 first-run one-time onboarding presentation for Endless mode.
   */
  private firstRunHints: FirstRunHintPresenter | null = null;

  /** V12 PHASE G: the authored progression bar mounted under the level panel. */
  private progressBar: Node | null = null;

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
    this.firstRunHints ||= new FirstRunHintPresenter(this.node, 'RegionValue');
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
    this.firstRunHints?.clear();
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
    this.mountProgressBar();
    this.applyProgressBar(mass, level);
    this.setLabel('CoinValue', Math.max(0, Math.floor(coins)).toLocaleString('en-US'));
    this.setLabel('RegionValue', regionName);
  }

  /**
   * V12 PHASE G. DESIGN_03 puts a progress bar and a 下一级 readout under the mass
   * line; the HUD had the level and the mass but nothing showing how far the next
   * machine was. The bar is the authored UIProgressBar the Machine Info page
   * already mounts, so this reuses that prefab rather than drawing a new one.
   *
   * Unlike Machine Info, the bar keeps its OWN `Value` label instead of hiding it:
   * that label sits inside the track, which is exactly where the reference prints
   * 下一级, so the readout needs no new scene node.
   */
  private mountProgressBar(): void {
    if (this.progressBar?.isValid) return;
    const reference = this.node.getChildByName('LevelPanel');
    const prefab = UIAssetLibrary.getPrefab('progressBar');
    if (!reference || !prefab) {
      UIAssetLibrary.ensure();
      return;
    }
    const bar = instantiate(prefab);
    bar.name = PROGRESS_BAR_NODE;
    bar.layer = this.node.layer;
    this.node.addChild(bar);
    bar.setSiblingIndex(reference.getSiblingIndex());
    // Centred, and directly under the level panel, which spans y 398..462.
    //
    // Not aligned to the panel's own x: the panel sits at x=62 (it shares the top
    // row with the coin pill), while the bar's Track child is 500 wide, so
    // following the panel pushed the track 13.9 design px past the right edge --
    // caught by verify:gameplay-visuals as `Track w500 R13.9`. Centred at 0 the
    // track spans +-250, inside the 288.2 usable half-width of the tightest
    // viewport. A constant x also removes the ordering dependence that made the
    // bar land at 19 or 62 depending on whether the HUD safe-area clamp had run
    // before it was mounted.
    //
    // Clearance is taken from the TRACK, not from this node: the bar is 26 tall
    // but its Track child is 38 and it is the track that draws. At y=392 the
    // track reached 411, so its top 13 units sat behind the level panel and
    // behind the coin pill beside it. 372 leaves a 7-unit gap below 398.
    bar.setPosition(0, 372, 0);
    bar.getComponent(UITransform)?.setContentSize(250, 26);
    this.progressBar = bar;
  }

  /** Fill the track from the real mass against the next level's threshold. */
  private applyProgressBar(mass: number, level: number): void {
    const bar = this.progressBar;
    if (!bar?.isValid) return;
    const clamped = Math.max(1, Math.min(MACHINE_EVOLUTION_CONFIG.length, level));
    const next = MACHINE_EVOLUTION_CONFIG[clamped] || null;
    const ratio = next ? Math.max(0, Math.min(1, mass / next.massThreshold)) : 1;
    const value = bar.getChildByName('Value')?.getComponent(Label) || null;
    if (value) {
      value.node.active = true;
      value.string = next ? `下一级 ${next.title}` : '已满级';
    }
    const track = bar.getChildByName('Track');
    const fill = bar.getChildByName('Fill');
    const trackWidth = track?.getComponent(UITransform)?.width || 0;
    const fillTransform = fill?.getComponent(UITransform);
    if (!fill || !fillTransform || !(trackWidth > 0)) return;
    const width = Math.max(2, trackWidth * ratio);
    fillTransform.setContentSize(width, fillTransform.height);
    fill.setPosition(-trackWidth / 2 + width / 2, fill.position.y, 0);
  }

  public showAbsorbFeedback(position: Readonly<Vec3>, score: number, tier: number): void {
    const color = tierUpgradeColor(tier);
    this.pickupFeedback?.emit(position, score, color);
    this.firstRunHints?.onObjectAbsorbed();
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

  public getFirstRunHintDiagnostics(): FirstRunHintDiagnostics | null {
    return this.firstRunHints?.getDiagnostics() || null;
  }

  update(dt: number): void {
    this.pickupFeedback?.update(dt);
    this.tierUpgrade?.update(dt);
    this.firstRunHints?.update(dt);
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
