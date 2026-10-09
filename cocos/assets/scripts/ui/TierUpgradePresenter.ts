/**
 * V4 reference 10, State B — the short tier-upgrade feedback.
 *
 * Design lock (`cocos/docs/design-reference/ui-v4-expanded/design-lock.md` §10):
 *   on upgrade, briefly show  升级！ / LV.X XXX黑洞 / 解锁更大型目标
 *   then it goes away. No full-screen upgrade page, no interstitial, no
 *   persistent badge.
 *
 * Implementation rules inherited from the existing HUD presenters:
 *  - It clones an editor-saved Label (`LevelValue` / `CoinValue`) as its glyph
 *    template, exactly like `PickupFeedbackPresenter`, so the banner uses the
 *    same Creator-owned font configuration as the permanent HUD and never
 *    constructs a new glyph or material path at runtime.
 *  - It is driven by the existing `MACHINE_EVOLVED` event. It never computes
 *    progression itself and never mutates gameplay state.
 *
 * V7 PHASE 7: the banner **panel** is now the authored `UIPopup` prefab
 * (`game_art/ui/prefabs/UIPopup.prefab`, a 9-slice purple panel with a gold
 * `升级！` title). The presenter only sizes it and sets the dynamic detail.
 * The old `cc.Graphics` rounded rect survives as a **degradation path**,
 * reachable only when the authored prefab is unavailable, and in that path the
 * cloned glyph carries all three lines so no copy is ever lost.
 */
import { Color, Graphics, instantiate, Label, LabelOutline, Node, UIOpacity, UITransform } from 'cc';

import { eventBus } from '../core/EventBus';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';
import { UIAssetLibrary } from './UIAssetLibrary';
import { colorFromToken, HUD_SEMANTIC } from './UIStyleTokens';
import { pagePanelHalfWidth } from './PageSafeArea';

const BANNER_DURATION_SECONDS = 2.0;
/** Keep the text fully legible for most of its short life, then fade. */
const BANNER_FADE_START = 0.7;
const BANNER_POP_IN_SECONDS = 0.18;

/**
 * 720x1280 design space. The real 390x844 runtime frame showed 330 crowding the
 * top HUD row (coins / level / region / pause) into one unreadable band, so the
 * banner now sits clear below it: at 180 its 3-line text block spans roughly
 * 0.33-0.43 of the visible height, leaving the HUD band untouched.
 */
/**
 * Authored banner width. On a 20:9 phone the UI camera shows only ~576 design
 * px, so this is narrowed at runtime by `bannerWidth()`; the panel is a sliced
 * `UIPopup`, so narrowing is lossless.
 */
const BANNER_WIDTH = 600;
const BANNER_HEIGHT = 200;
const BANNER_Y = 180;

/** Vertical placement of the cloned glyph when the authored title is present. */
const DETAIL_Y = -34;

const PANEL_FILL = { r: 91, g: 33, b: 182, a: 236 };
const PANEL_BORDER = { r: 15, g: 20, b: 38, a: 255 };
const TITLE_COLOR = { r: 255, g: 208, b: 0, a: 255 };
const OUTLINE_COLOR = HUD_SEMANTIC.textOutline;

interface IMachineEvolvedPayload {
  readonly level?: number;
  readonly config?: { readonly title?: string };
  readonly machine?: BlackHoleMachine;
}

interface ActiveBanner {
  readonly node: Node;
  readonly opacity: UIOpacity;
  elapsed: number;
}

export interface TierUpgradeDiagnostics {
  readonly emittedCount: number;
  readonly activeCount: number;
  readonly lastLevel: number;
  readonly lastTitle: string;
  readonly lastText: string;
  /** V7: true when the authored UIPopup prefab supplied the banner panel. */
  readonly usesAuthoredPanel: boolean;
  readonly fallbackReason: string | null;
  /**
   * Level-ups that produced no banner, and why.
   *
   * `MACHINE_EVOLVED` can arrive while the HUD is inactive, or with no template
   * Label to clone, and `show()` returns before `emittedCount` moves. From the
   * outside that is indistinguishable from "no banner was emitted", which is what
   * made the gameplay gate's banner-coverage assertion look like a sampling bug:
   * runs reached level 2 and reported 0 banner samples. Recording the reason
   * separates "the banner was suppressed" from "it was drawn and the harness
   * missed it".
   */
  readonly suppressedCount: number;
  readonly lastSuppressReason: string | null;
}

export class TierUpgradePresenter {
  private unsubscribe: (() => void) | null = null;
  private banner: ActiveBanner | null = null;
  private emittedCount = 0;
  private lastLevel = 0;
  private lastTitle = '';
  private lastText = '';
  /** Narrowed banner width for this device; see BANNER_WIDTH. */
  private bannerWidth = BANNER_WIDTH;
  private usesAuthoredPanel = false;
  private fallbackReason: string | null = null;
  private suppressedCount = 0;
  private lastSuppressReason: string | null = null;

  public constructor(
    private readonly host: Node,
    private readonly templateName: string,
  ) {}

  public enable(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = eventBus.on('MACHINE_EVOLVED', this.onEvolved, this);
  }

  public disable(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clear();
  }

  /** Only the local player's evolution is announced; bots stay silent. */
  private onEvolved(payload: IMachineEvolvedPayload): void {
    if (payload?.machine?.isBotPresentation?.()) {
      this.recordSuppressed('bot-presentation');
      return;
    }
    const level = Math.max(1, Math.round(Number(payload?.level) || 0));
    if (level <= 1) {
      this.recordSuppressed('level<=1');
      return;
    }
    this.show(level, payload?.config?.title || '');
  }

  /** Why a level-up produced no banner; see `TierUpgradeDiagnostics`. */
  private recordSuppressed(reason: string): void {
    this.suppressedCount += 1;
    this.lastSuppressReason = reason;
  }

  private show(level: number, title: string): void {
    if (!this.host.activeInHierarchy) {
      this.recordSuppressed('host-inactive');
      return;
    }
    const template = this.host.getChildByName(this.templateName) || null;
    const hostTransform = this.host.getComponent(UITransform) || null;
    if (!template || !hostTransform) {
      this.recordSuppressed('missing-template');
      console.error(`[TierUpgradePresenter] Missing active ${this.templateName} Label template.`);
      return;
    }

    this.clear();

    // The authored 600 design px is wider than a 20:9 frame shows.
    this.bannerWidth = Math.min(BANNER_WIDTH, pagePanelHalfWidth(this.host) * 2);

    const container = new Node(`TierUpgradeBanner_${this.emittedCount + 1}`);
    // A code-created Node starts on Layers.Enum.DEFAULT, which the UI camera
    // never draws. Copying the host layer is what makes the banner visible in a
    // built player; the cloned Label below is already UI_2D and rendered alone,
    // which is why the text used to show up without its panel.
    container.layer = this.host.layer;
    this.host.addChild(container);
    const containerTransform = container.addComponent(UITransform);
    containerTransform.setContentSize(this.bannerWidth, BANNER_HEIGHT);
    container.setPosition(0, BANNER_Y, 0);

    // Panel first so it renders behind the glyphs (sibling order owns draw order).
    const panelNode = this.mountPanel(container);

    const textNode = instantiate(template);
    container.addChild(textNode);
    const textTransform = textNode.getComponent(UITransform);
    if (textTransform) textTransform.setContentSize(this.bannerWidth, BANNER_HEIGHT);
    textNode.setPosition(0, panelNode ? DETAIL_Y : 0, 0);
    const label = textNode.getComponent(Label);
    if (!label) {
      container.destroy();
      console.error(`[TierUpgradePresenter] Serialized ${this.templateName} has no Label.`);
      return;
    }

    // With the authored panel the headline is the prefab's own gold title; the
    // cloned HUD glyph then carries only the dynamic detail lines. Without it,
    // the glyph carries the whole locked copy so nothing is lost.
    const tierHint = level === 2 ? '现可吸附 T2 中型物件'
      : level === 3 ? '现可吸附 T3 大型家具'
      : level === 4 ? '现可吸附 T4 重型设备'
      : level === 5 ? '现可吸附 T5 车辆与建筑'
      : '解锁更大型目标';
    const detail = `LV.${level} ${title}\n解锁更大型目标 (${tierHint})`;
    const text = panelNode ? detail : `升级！\n${detail}`;
    label.string = text;
    label.fontSize = panelNode ? 30 : 34;
    label.lineHeight = panelNode ? 40 : 46;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.color = new Color(TITLE_COLOR.r, TITLE_COLOR.g, TITLE_COLOR.b, TITLE_COLOR.a);
    const outline = textNode.getComponent(LabelOutline) || textNode.addComponent(LabelOutline);
    outline.width = 4;
    outline.color = colorFromToken(OUTLINE_COLOR);

    const opacity = container.addComponent(UIOpacity);
    opacity.opacity = 255;
    container.setScale(0.86, 0.86, 1);

    this.banner = { node: container, opacity, elapsed: 0 };
    this.emittedCount++;
    this.lastLevel = level;
    this.lastTitle = title;
    this.lastText = text;
  }

  /**
   * Authored `UIPopup` panel, or null when it is not resident yet. Returning
   * null is not an error: the caller keeps the vector panel and the full copy.
   */
  private mountPanel(container: Node): Node | null {
    const prefab = UIAssetLibrary.getPrefab('popup');
    if (prefab) {
      const panelNode = instantiate(prefab);
      panelNode.layer = this.host.layer;
      container.addChild(panelNode);
      panelNode.setPosition(0, 0, 0);
      panelNode.getComponent(UITransform)?.setContentSize(this.bannerWidth, BANNER_HEIGHT);
      const titleLabel = panelNode.getChildByName('Title')?.getComponent(Label);
      if (titleLabel) titleLabel.string = '升级！';
      this.usesAuthoredPanel = true;
      this.fallbackReason = null;
      return panelNode;
    }

    this.usesAuthoredPanel = false;
    this.fallbackReason = UIAssetLibrary.getLastError()
      || (UIAssetLibrary.isPending() ? 'authored UI assets pending' : 'authored UI assets unavailable');
    UIAssetLibrary.ensure();

    const panelNode = new Node('Panel');
    panelNode.layer = this.host.layer;
    container.addChild(panelNode);
    const panelTransform = panelNode.addComponent(UITransform);
    panelTransform.setContentSize(this.bannerWidth, BANNER_HEIGHT);
    const panel = panelNode.addComponent(Graphics);
    panel.fillColor = new Color(PANEL_FILL.r, PANEL_FILL.g, PANEL_FILL.b, PANEL_FILL.a);
    panel.roundRect(-this.bannerWidth * 0.5, -BANNER_HEIGHT * 0.5, this.bannerWidth, BANNER_HEIGHT, 20);
    panel.fill();
    panel.lineWidth = 6;
    panel.strokeColor = new Color(PANEL_BORDER.r, PANEL_BORDER.g, PANEL_BORDER.b, PANEL_BORDER.a);
    panel.roundRect(-this.bannerWidth * 0.5, -BANNER_HEIGHT * 0.5, this.bannerWidth, BANNER_HEIGHT, 20);
    panel.stroke();
    return null;
  }

  public update(dt: number): void {
    const banner = this.banner;
    if (!banner || !banner.node.isValid) return;
    banner.elapsed += Math.max(0, dt);
    const progress = Math.min(1, banner.elapsed / BANNER_DURATION_SECONDS);

    const popIn = Math.min(1, banner.elapsed / BANNER_POP_IN_SECONDS);
    const scale = 0.86 + 0.14 * popIn;
    banner.node.setScale(scale, scale, 1);

    const fadeProgress = progress <= BANNER_FADE_START
      ? 0
      : (progress - BANNER_FADE_START) / (1 - BANNER_FADE_START);
    banner.opacity.opacity = Math.round((1 - fadeProgress) * 255);

    if (progress >= 1) {
      banner.node.destroy();
      this.banner = null;
    }
  }

  public clear(): void {
    this.banner?.node.destroy();
    this.banner = null;
  }

  public isShowing(): boolean {
    return Boolean(this.banner && this.banner.node.isValid && this.banner.node.activeInHierarchy);
  }

  public getDiagnostics(): TierUpgradeDiagnostics {
    return {
      emittedCount: this.emittedCount,
      activeCount: this.isShowing() ? 1 : 0,
      lastLevel: this.lastLevel,
      lastTitle: this.lastTitle,
      lastText: this.lastText,
      usesAuthoredPanel: this.usesAuthoredPanel,
      fallbackReason: this.fallbackReason,
      suppressedCount: this.suppressedCount,
      lastSuppressReason: this.lastSuppressReason,
    };
  }
}
