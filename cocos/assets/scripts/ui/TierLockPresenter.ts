/**
 * V4 reference 10 (State A) — the readable "需要 LV.X" prompt for a target the
 * machine is still not allowed to swallow.
 *
 * `CompressibleObject` already owns the mechanic: the locked body is only pulled
 * by the outer suction field, creeps to a standoff ring, and never enters the
 * formal swallow. It also flips `isShowingLockAlert()`. What it could not do is
 * make that state *visible*: its prompt is a `cc.Label` on a node built in code,
 * and in a built player such a node has neither a `RenderRoot2D` ancestor nor
 * the `UI_2D` layer, so the glyph is never batched and never drawn.
 *
 * So the readable prompt is produced here, on the HUD, by projecting the locked
 * body's world position onto the screen. It reuses the proven
 * `PickupFeedbackPresenter` contract: clone an editor-saved Label and never
 * build a glyph, font or material path at runtime. It is presentation only — it
 * reads `isShowingLockAlert()` and never advances the FSM, mass or tier.
 */
import { Camera, Color, instantiate, Label, LabelOutline, Node, UITransform, Vec3, view } from 'cc';
import { CompressibleObject } from '../gameplay/CompressibleObject';
import { colorFromToken, HUD_SEMANTIC } from './UIStyleTokens';
import { hudDesignToFrameScale, hudVisibleHalfHeight, hudVisibleHalfWidth } from './HudSafeAreaInset';

const CHIP_WIDTH = 210;
const CHIP_HEIGHT = 56;
const CHIP_FONT_SIZE = 30;
/** Height above the body's origin, so the chip clears the model's own volume. */
const CHIP_WORLD_OFFSET_Y = 1.7;
/**
 * Screen px the chip keeps from the frame edge once it has been clamped into the
 * safe span. The pickup feedback uses the same inset for the same reason.
 */
const CHIP_EDGE_INSET_SCREEN_PX = 12;

export interface TierLockDiagnostics {
  readonly emittedCount: number;
  readonly activeCount: number;
  readonly lastText: string;
  readonly lastPosition: Readonly<{ x: number; y: number }>;
  readonly lastTier: number;
}

export class TierLockPresenter {
  private chip: Node | null = null;
  private chipLabel: Label | null = null;
  private emittedCount = 0;
  private lastText = '';
  private lastTier = 0;
  private readonly lastPosition = { x: 0, y: 0 };
  private readonly projected = new Vec3();

  public constructor(
    private readonly host: Node,
    private readonly templateName: string,
  ) {}

  /** Called once per gameplay frame by the owning HUD controller. */
  public update(objects: readonly CompressibleObject[], camera: Camera | null): void {
    if (!this.host.activeInHierarchy) {
      this.hide();
      return;
    }
    const locked = objects.find((object) => object.isShowingLockAlert()) || null;
    if (!locked || !camera) {
      this.hide();
      return;
    }
    const text = locked.getLockAlertText();
    if (!text) {
      this.hide();
      return;
    }
    const template = this.host.getChildByName(this.templateName) || null;
    const hostTransform = this.host.getComponent(UITransform) || null;
    const viewport = view.getViewportRect();
    if (!template || !hostTransform || viewport.width <= 0 || viewport.height <= 0) {
      this.hide();
      return;
    }

    const position = locked.getPosition();
    const screen = camera.worldToScreen(
      new Vec3(position.x, position.y + CHIP_WORLD_OFFSET_Y, position.z),
      this.projected,
    );
    const normalizedX = (screen.x - viewport.x) / viewport.width;
    const normalizedY = (screen.y - viewport.y) / viewport.height;
    // Off-frame targets have nothing to point at; near-edge ones do.
    //
    // This used to discard anything within a 0.06 / 0.1 margin of the edge, and
    // that guard only tested the *anchor* point -- so a 210 px-wide chip anchored
    // just inside the margin still hung 29 px off the frame at 412x915, and the
    // player got no prompt at all for a body they were standing next to. §40
    // settled the same question for the pickup feedback: clamp to the safe edge,
    // do not drop the feedback.
    if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
      this.hide();
      return;
    }

    const chip = this.ensureChip(template);
    const label = this.chipLabel;
    if (!chip || !label) return;
    if (label.string !== text) label.string = text;
    const frameScale = hudDesignToFrameScale(this.host) || 1;
    const inset = CHIP_EDGE_INSET_SCREEN_PX / frameScale;
    const limitX = Math.max(0, hudVisibleHalfWidth(this.host) - inset - CHIP_WIDTH / 2);
    const limitY = Math.max(0, hudVisibleHalfHeight(this.host) - inset - CHIP_HEIGHT / 2);
    const rawX = (normalizedX - 0.5) * hostTransform.width;
    const rawY = (normalizedY - 0.5) * hostTransform.height;
    const chipX = Math.min(limitX, Math.max(-limitX, rawX));
    const chipY = Math.min(limitY, Math.max(-limitY, rawY));
    chip.setPosition(chipX, chipY, 0);
    chip.active = true;
    this.lastText = text;
    this.lastTier = locked.template.tier;
    this.lastPosition.x = chipX;
    this.lastPosition.y = chipY;
  }

  public clear(): void {
    if (this.chip?.isValid) this.chip.destroy();
    this.chip = null;
    this.chipLabel = null;
    this.lastText = '';
    this.lastTier = 0;
  }

  public getDiagnostics(): TierLockDiagnostics {
    return {
      emittedCount: this.emittedCount,
      activeCount: this.chip?.isValid && this.chip.activeInHierarchy ? 1 : 0,
      lastText: this.lastText,
      lastPosition: { ...this.lastPosition },
      lastTier: this.lastTier,
    };
  }

  private hide(): void {
    if (this.chip?.isValid && this.chip.active) this.chip.active = false;
  }

  private ensureChip(template: Node): Node | null {
    if (this.chip?.isValid) return this.chip;
    const node = instantiate(template);
    node.name = 'TierLockChip';
    // The clone keeps the template's serialized UI_2D layer, which is exactly
    // what a code-built node would be missing.
    this.host.addChild(node);
    const transform = node.getComponent(UITransform);
    transform?.setContentSize(CHIP_WIDTH, CHIP_HEIGHT);
    const label = node.getComponent(Label);
    if (!label) {
      node.destroy();
      console.error(`[TierLockPresenter] Serialized ${this.templateName} has no Label.`);
      return null;
    }
    label.string = '';
    label.fontSize = CHIP_FONT_SIZE;
    label.lineHeight = CHIP_FONT_SIZE + 6;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    // Locked-target crimson, matching the V4 `--alert-crimson` token.
    label.color = colorFromToken(HUD_SEMANTIC.danger);
    const outline = node.getComponent(LabelOutline) || node.addComponent(LabelOutline);
    outline.width = 4;
    outline.color = colorFromToken(HUD_SEMANTIC.textOutline);
    this.chip = node;
    this.chipLabel = label;
    this.emittedCount++;
    return node;
  }
}
