/**
 * V8 first-run one-time onboarding presentation for Endless mode.
 *
 * Checkpoint progression:
 *  - t in [0, 3)s:  你是黑洞 · 吞掉一切
 *  - t in [3, 6)s:  拖动屏幕移动
 *  - t in [6, 10)s: 比你小的都能吞下
 *  - t >= 10s or first swallowed object: complete tutorial, dismiss, persist tutorialCompleted = true
 *
 * Rules:
 *  - Clones an editor-saved Label template (`RegionValue`), never constructs
 *    a font or material path at runtime.
 *  - Presentation-only: only mutates `tutorialCompleted` on `SaveService`.
 */
import { Color, Graphics, instantiate, Label, LabelOutline, Node, UIOpacity, UITransform } from 'cc';
import { SaveService } from '../data/SaveService';
import { HUD_SEMANTIC, UI_METRICS, colorFromToken } from './UIStyleTokens';

const HINT_WIDTH = 460;
const HINT_HEIGHT = 64;
const HINT_Y = 140;

const PANEL_FILL = { r: 35, g: 25, b: 65, a: 220 };
const PANEL_BORDER = { r: 120, g: 85, b: 230, a: 200 };
const TEXT_COLOR = { r: 255, g: 245, b: 200, a: 255 };
const OUTLINE_COLOR = HUD_SEMANTIC.textOutline;

export interface FirstRunHintDiagnostics {
  readonly activeCount: number;
  readonly lastText: string;
  readonly stage: number;
  readonly emittedCount: number;
}

interface ActiveHintBanner {
  readonly node: Node;
  readonly label: Label;
  readonly opacity: UIOpacity;
}

export class FirstRunHintPresenter {
  private banner: ActiveHintBanner | null = null;
  private elapsed = 0;
  private currentStage = 0;
  private emittedCount = 0;
  private lastText = '';
  private completed = false;

  public constructor(
    private readonly host: Node,
    private readonly templateName: string,
  ) {}

  public update(dt: number): void {
    if (this.completed) return;

    const saveService = SaveService.getInstance();
    if (saveService.data.tutorialCompleted) {
      this.completed = true;
      this.clear();
      return;
    }

    if (!this.host.activeInHierarchy) {
      return;
    }

    this.elapsed += Math.max(0, dt);

    if (this.elapsed >= 10.0) {
      this.finishTutorial();
      return;
    }

    let targetStage = 1;
    let targetText = '你是黑洞 · 吞掉一切';
    if (this.elapsed >= 6.0) {
      targetStage = 3;
      targetText = '比你小的都能吞下';
    } else if (this.elapsed >= 3.0) {
      targetStage = 2;
      targetText = '拖动屏幕移动';
    }

    if (this.currentStage !== targetStage || !this.banner || !this.banner.node.isValid) {
      this.showStage(targetStage, targetText);
    }
  }

  public onObjectAbsorbed(): void {
    if (this.completed) return;
    const saveService = SaveService.getInstance();
    if (saveService.data.tutorialCompleted) {
      this.completed = true;
      this.clear();
      return;
    }
    this.finishTutorial();
  }

  private finishTutorial(): void {
    this.completed = true;
    const saveService = SaveService.getInstance();
    saveService.data.tutorialCompleted = true;
    saveService.save();
    this.clear();
  }

  public clear(): void {
    if (this.banner?.node.isValid) {
      this.banner.node.destroy();
    }
    this.banner = null;
  }

  public isShowing(): boolean {
    return Boolean(
      !this.completed &&
      this.banner &&
      this.banner.node.isValid &&
      this.banner.node.activeInHierarchy
    );
  }

  public getDiagnostics(): FirstRunHintDiagnostics {
    return {
      activeCount: this.isShowing() ? 1 : 0,
      lastText: this.lastText,
      stage: this.currentStage,
      emittedCount: this.emittedCount,
    };
  }

  private showStage(stage: number, text: string): void {
    if (!this.host.activeInHierarchy) return;
    const template = this.host.getChildByName(this.templateName) || null;
    const hostTransform = this.host.getComponent(UITransform) || null;
    if (!template || !hostTransform) {
      console.error(`[FirstRunHintPresenter] Missing active ${this.templateName} Label template.`);
      return;
    }

    if (!this.banner || !this.banner.node.isValid) {
      const container = new Node('FirstRunHintBanner');
      container.layer = this.host.layer;
      this.host.addChild(container);
      const containerTransform = container.addComponent(UITransform);
      containerTransform.setContentSize(HINT_WIDTH, HINT_HEIGHT);
      container.setPosition(0, HINT_Y, 0);

      const panelNode = new Node('Panel');
      panelNode.layer = this.host.layer;
      container.addChild(panelNode);
      const panelTransform = panelNode.addComponent(UITransform);
      panelTransform.setContentSize(HINT_WIDTH, HINT_HEIGHT);
      const panel = panelNode.addComponent(Graphics);
      panel.fillColor = new Color(PANEL_FILL.r, PANEL_FILL.g, PANEL_FILL.b, PANEL_FILL.a);
      panel.roundRect(-HINT_WIDTH * 0.5, -HINT_HEIGHT * 0.5, HINT_WIDTH, HINT_HEIGHT, 16);
      panel.fill();
      panel.lineWidth = 2;
      panel.strokeColor = new Color(PANEL_BORDER.r, PANEL_BORDER.g, PANEL_BORDER.b, PANEL_BORDER.a);
      panel.roundRect(-HINT_WIDTH * 0.5, -HINT_HEIGHT * 0.5, HINT_WIDTH, HINT_HEIGHT, 16);
      panel.stroke();

      const textNode = instantiate(template);
      textNode.name = 'HintText';
      container.addChild(textNode);
      const textTransform = textNode.getComponent(UITransform);
      if (textTransform) textTransform.setContentSize(HINT_WIDTH, HINT_HEIGHT);
      textNode.setPosition(0, 0, 0);

      const label = textNode.getComponent(Label);
      if (!label) {
        container.destroy();
        console.error(`[FirstRunHintPresenter] Serialized ${this.templateName} has no Label.`);
        return;
      }
      label.fontSize = UI_METRICS.fontHeading;
      label.lineHeight = 36;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.color = new Color(TEXT_COLOR.r, TEXT_COLOR.g, TEXT_COLOR.b, TEXT_COLOR.a);
      const outline = textNode.getComponent(LabelOutline) || textNode.addComponent(LabelOutline);
      outline.width = 3;
      outline.color = colorFromToken(OUTLINE_COLOR);

      const opacity = container.addComponent(UIOpacity);
      opacity.opacity = 255;

      this.banner = { node: container, label, opacity };
    }

    if (this.banner?.label) {
      this.banner.label.string = text;
    }
    this.currentStage = stage;
    this.lastText = text;
    this.emittedCount++;
  }
}
