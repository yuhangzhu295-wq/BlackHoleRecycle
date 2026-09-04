/**
 * Short-lived, data-backed pickup feedback for the portrait playfields.
 *
 * It deliberately clones an editor-saved Label instead of constructing a new
 * glyph/material path at runtime. Web Mobile then uses the same Creator-owned
 * font configuration as the permanent HUD, while the text is emitted only
 * after a genuine CompressibleObject reaches ABSORBED.
 */
import { Camera, Color, director, instantiate, Label, LabelOutline, Node, UITransform, Vec3, view } from 'cc';

interface ActiveFeedback {
  readonly node: Node;
  readonly label: Label;
  elapsed: number;
}

const FEEDBACK_DURATION_SECONDS = 1.8;
const FEEDBACK_FADE_START = 0.88;

export interface PickupFeedbackDiagnostics {
  readonly emittedCount: number;
  readonly activeCount: number;
  readonly lastText: string;
  readonly lastPosition: Readonly<{ x: number; y: number }>;
  readonly lastOpacity: number;
}

export class PickupFeedbackPresenter {
  private readonly projectedPosition = new Vec3();
  private readonly active: ActiveFeedback[] = [];
  private emittedCount = 0;
  private lastText = '';
  private readonly lastPosition = { x: 0, y: 0 };
  private lastOpacity = 0;

  public constructor(
    private readonly host: Node,
    private readonly templateName: string,
  ) {}

  public emit(worldPosition: Readonly<Vec3>, score: number, color: Readonly<Color>): void {
    if (!this.host.activeInHierarchy) return;
    const template = this.host.getChildByName(this.templateName) || null;
    const hostTransform = this.host.getComponent(UITransform) || null;
    const camera = director.getScene()?.getComponentInChildren(Camera) || null;
    const viewport = view.getViewportRect();
    if (!template || !hostTransform || !camera || viewport.width <= 0 || viewport.height <= 0) {
      console.error(`[PickupFeedbackPresenter] Missing active ${this.templateName} Label or camera.`);
      return;
    }

    const screen = camera.worldToScreen(
      new Vec3(worldPosition.x, worldPosition.y + 0.95, worldPosition.z),
      this.projectedPosition,
    );
    const normalizedX = (screen.x - viewport.x) / viewport.width;
    const normalizedY = (screen.y - viewport.y) / viewport.height;
    // Feedback outside the game viewport would be unhelpful and could overlap
    // a phone notch. The gameplay fact is still recorded in diagnostics.
    if (normalizedX < 0.05 || normalizedX > 0.95 || normalizedY < 0.08 || normalizedY > 0.9) return;

    const node = instantiate(template);
    node.name = `AbsorbFeedback_${this.emittedCount + 1}`;
    this.host.addChild(node);
    const transform = node.getComponent(UITransform);
    transform?.setContentSize(142, 50);
    const label = node.getComponent(Label);
    if (!label) {
      node.destroy();
      console.error(`[PickupFeedbackPresenter] Serialized ${this.templateName} has no Label.`);
      return;
    }
    const text = `+${Math.max(0, Math.round(score))}`;
    label.string = text;
    label.fontSize = 34;
    label.lineHeight = 38;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.color = new Color(color.r, color.g, color.b, 255);
    const outline = node.getComponent(LabelOutline) || node.addComponent(LabelOutline);
    outline.width = 3;
    outline.color = new Color(15, 20, 38, 255);
    const feedbackX = (normalizedX - 0.5) * hostTransform.width;
    const feedbackY = (normalizedY - 0.5) * hostTransform.height + 30;
    node.setPosition(feedbackX, feedbackY, 0);
    node.setScale(1.15, 1.15, 1);
    this.active.push({ node, label, elapsed: 0 });
    this.emittedCount++;
    this.lastText = text;
    this.lastPosition.x = feedbackX;
    this.lastPosition.y = feedbackY;
    this.lastOpacity = 255;
  }

  public update(dt: number): void {
    for (let index = this.active.length - 1; index >= 0; index--) {
      const feedback = this.active[index];
      if (!feedback.node.isValid) {
        this.active.splice(index, 1);
        continue;
      }
      feedback.elapsed += Math.max(0, dt);
      const progress = Math.min(1, feedback.elapsed / FEEDBACK_DURATION_SECONDS);
      feedback.node.setPosition(
        feedback.node.position.x,
        feedback.node.position.y + dt * 72,
        feedback.node.position.z,
      );
      const scale = 1.15 - progress * 0.24;
      feedback.node.setScale(scale, scale, 1);
      // Keep score text fully legible for almost all of its short lifetime.
      // A linear fade had already reduced the label to near-transparent by
      // the first trustworthy portrait evidence frame, even though the node
      // was still technically alive.
      const fadeProgress = progress <= FEEDBACK_FADE_START
        ? 0
        : (progress - FEEDBACK_FADE_START) / (1 - FEEDBACK_FADE_START);
      const current = feedback.label.color;
      const opacity = Math.round((1 - fadeProgress) * 255);
      feedback.label.color = new Color(current.r, current.g, current.b, opacity);
      this.lastOpacity = opacity;
      if (progress >= 1) {
        feedback.node.destroy();
        this.active.splice(index, 1);
      }
    }
  }

  public clear(): void {
    this.active.forEach((feedback) => feedback.node.destroy());
    this.active.length = 0;
  }

  public getDiagnostics(): PickupFeedbackDiagnostics {
    return {
      emittedCount: this.emittedCount,
      activeCount: this.active.filter((feedback) => feedback.node.isValid && feedback.node.activeInHierarchy).length,
      lastText: this.lastText,
      lastPosition: { ...this.lastPosition },
      lastOpacity: this.lastOpacity,
    };
  }
}
