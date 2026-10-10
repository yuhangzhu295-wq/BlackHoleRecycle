/**
 * Mode Ready 页面控制器（无尽探索 / 竞技乱斗 共用）。
 * 挂载于编辑器保存的 EndlessReadyPage / ArenaReadyPage 节点。
 *
 * 正式流程：HOME → MODE SELECT → MODE READY → START → GAMEPLAY。
 * 模式卡只负责进入本页，绝不直接开局；只有 BtnStart 才发出开局事件。
 * 导出 MODE_READY_LAYOUT 供契约测试在无 Cocos 运行时的情况下解析验证。
 *
 * V7 PHASE 6/7：本页此前只有浮空文字——预览图没有卡片框，统计行没有底板，
 * 竞技规则没有面板，CTA 文字比参考稿小。参考稿
 * （design-reference/ui-v4-expanded/06-endless-ready.png、07-arena-ready.png）
 * 明确画出：带深色边框的预览卡 + 说明文字、两条深色统计底板、竞技规则面板、
 * 以及大号金色 CTA。这里改为从 `game-art` 的 `ui/prefabs` 复用预制件：
 *   UICard   → 预览卡（边框 + 预览图 + “地图预览 / 竞技场预览”说明）
 *   UIHudBar → 两条统计底板（说明左、数值右）
 *   UIPanel  → 竞技规则面板（仅竞技模式显示）
 *   UIButton → CTA 视觉（金色 9-slice + 大字标签）
 * 全部资源缺失时自动退回本页原来的样子，不影响开局流程。
 */
import { _decorator, Button, Component, Enum, instantiate, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { applyPageTextTokens } from './UIStyleTokens';
import {
  clampNodeIntoSafeSpan,
  fitSlicedPanelToSafeSpan,
  pagePanelHalfWidth,
  pageSafeHalfWidth,
} from './PageSafeArea';
import { eventBus } from '../core/EventBus';
import { MACHINE_EVOLUTION_CONFIG } from '../data/GameConfig';
import { saveService } from '../data/SaveService';
import { MapPreviewGraphic, MapPreviewKind } from './MapPreviewGraphic';
import { UIAssetLibrary } from './UIAssetLibrary';

const { ccclass, property } = _decorator;

export enum ModeReadyKind {
  ENDLESS = 0,
  ARENA = 1,
}

// [width, height, cocosX, cocosY] in the 720x1280 design space,
// using the same center-origin conversion as MODE_SELECT_LAYOUT.
export const MODE_READY_LAYOUT = {
  Background:     [720, 1280,    0,    0],
  BtnBack:        [ 80,   80, -245,  568],
  Header:         [430,  100,    0,  534],
  // The page title is the element that tells the player which mode they are
  // about to start, so it has to outrank the brand watermark. `RegistrationBranding`
  // (GameManager) draws 黑洞回收站 at Canvas level, design y 553..607, fontSize 30,
  // on every non-Home screen; the serialized HeaderTitle was 19px, i.e. the
  // watermark was the loudest thing on the page. Measured against the adopted
  // reference (`ui-v9.5-adopted/03-endless-ready.png`), the title runs ~2.4x the
  // brand line, which at this design width is ~66px.
  //
  // The title's band is bounded by MapPreview's top (design 470) and the
  // watermark's bottom (design 553), so it is 74 tall at design 512 and the
  // preview does NOT move: the UICard's own caption strip sits 152 design units
  // *below* the preview origin, so lowering the preview by 24 pushed that caption
  // 20.5 units into StatPanelTop. Measured on the 390x844 capture.
  HeaderTitle:    [520,   74,    0,  512],
  // V7: the preview keeps the 560x260 authored-art aspect and leaves room for
  // the UICard's own caption strip directly under it.
  MapPreview:     [560,  260,    0,  340],
  // V7: two UIHudBar rows, caption flush left / value flush right, matching the
  // reference's stat panels (06) and "当前机器 | LV.3 重力黑洞" row (07).
  StatPanelTop:   [580,   76,    0,  126],
  StatPanelBottom:[580,   76,    0,   42],
  StatCaption:    [260,   40, -125,  126],
  StatValue:      [260,   40,  125,  126],
  MachineCaption: [260,   40, -125,   42],
  MachineValue:   [260,   40,  125,   42],
  // V7: the arena rule list sits on a UIPanel (reference 07); Endless keeps the
  // bare two-line copy from reference 06.
  IntroPanel:     [580,  180,    0, -106],
  IntroText:      [500,  150,    0, -106],
  BtnStart:       [480,  150,    0, -290],
  BtnStartLabel:  [440,   60,    0, -290],
} as const;

/** Child node names this controller mounts from the authored prefab library. */
const STAT_PANEL_TOP = 'StatPanelTop';
const STAT_PANEL_BOTTOM = 'StatPanelBottom';
const INTRO_PANEL = 'IntroPanel';
const START_ART = 'BtnStartArt';


/** Sliced stat panels authored wider than a 20:9 frame can show. */
const READY_PANEL_NODES: readonly string[] = ['StatPanelTop', 'StatPanelBottom'];

@ccclass('ModeReadyPageController')
export class ModeReadyPageController extends Component {
  @property({ type: Enum(ModeReadyKind), tooltip: '该 Ready 页对应的玩法模式。' })
  public mode: ModeReadyKind = ModeReadyKind.ENDLESS;

  private bindings: Array<[Button, () => void]> = [];
  private waitingForPanels = false;

  onEnable(): void {
    this.mountAuthoredPanels();
    this.applyLayout();
    this.hideStaleHeaderTitle();
    this.applyMapPreview();
    this.applyStartButton();
    this.refreshProfile();
    this.bind('BtnBack', () => eventBus.emit('READY_BACK_REQUESTED'));
    this.bind('BtnStart', () => eventBus.emit('READY_START_REQUESTED'));
    this.fitToVisibleDesignSpace();
    // V9 §20/§22: this page serialises its own text colours, and several are
    // imperceptible variants of a token. Folding them here makes the token file
    // the source of the colour actually drawn. See PAGE_TEXT_DRIFT.
    applyPageTextTokens(this.node);
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) {
      button.node.off(Button.EventType.CLICK, handler, this);
    }
    this.bindings.length = 0;
  }

  /** Apply layout table to existing scene nodes without touching Game.scene/prefab/meta. */
  private applyLayout(): void {
    for (const [name, [width, height, x, y]] of Object.entries(MODE_READY_LAYOUT)) {
      this.resizeAndPlace(name, width, height, x, y);
    }
    // `BtnStartArt` is a child of BtnStart, not a page-level node, so it is not
    // in the table. BtnStart's serialized size is 610x202; without this sync the
    // CTA art would keep that size instead of the locked 480x150.
    const button = this.findNode('BtnStart');
    const art = button?.getChildByName(START_ART);
    const buttonTransform = button?.getComponent(UITransform);
    if (art && buttonTransform) {
      art.getComponent(UITransform)?.setContentSize(buttonTransform.width, buttonTransform.height);
    }
  }

  /**
   * V7 PHASE 6/7. Mount the authored UI prefabs the reference page needs. Every
   * mount is idempotent (an existing child is reused) and returns null when the
   * library is not resident yet, in which case the page keeps its original
   * floating-label look and re-tries once the assets arrive.
   */
  private mountAuthoredPanels(): void {
    UIAssetLibrary.ensure();
    const top = this.mountPanelBehind(STAT_PANEL_TOP, 'hudBar', 'StatCaption');
    const bottom = this.mountPanelBehind(STAT_PANEL_BOTTOM, 'hudBar', 'MachineCaption');
    this.mountPanelBehind(INTRO_PANEL, 'panel', 'IntroText');
    this.mountStartArt();
    this.applyIntroPanelVisibility();

    if (top && bottom) return;
    if (this.waitingForPanels) return;
    this.waitingForPanels = true;
    UIAssetLibrary.whenReady(() => {
      this.waitingForPanels = false;
      if (!this.node?.isValid || !this.node.activeInHierarchy) return;
      this.mountAuthoredPanels();
      this.applyLayout();
      this.applyStartButton();
      this.refreshProfile();
    });
  }

  /**
   * Instantiate `prefabKey` and insert it directly behind `referenceName`, so
   * the page's existing labels keep rendering on top of the new panel.
   */
  private mountPanelBehind(name: string, prefabKey: 'panel' | 'hudBar', referenceName: string): Node | null {
    const existing = this.node.getChildByName(name);
    if (existing) return existing;
    const prefab = UIAssetLibrary.getPrefab(prefabKey);
    if (!prefab) return null;
    const panel = instantiate(prefab);
    panel.name = name;
    panel.layer = this.node.layer;
    this.node.addChild(panel);
    const reference = this.findNode(referenceName);
    if (reference) panel.setSiblingIndex(reference.getSiblingIndex());
    return panel;
  }

  /** V7: the CTA visual is the authored UIButton; its label carries the copy. */
  private mountStartArt(): void {
    const button = this.findNode('BtnStart');
    if (!button?.isValid) return;
    if (button.getChildByName(START_ART)) return;
    const prefab = UIAssetLibrary.getPrefab('button');
    if (!prefab) return;
    const art = instantiate(prefab);
    art.name = START_ART;
    art.layer = button.layer;
    button.addChild(art);
    art.setPosition(0, 0, 0);
    const buttonTransform = button.getComponent(UITransform);
    art.getComponent(UITransform)?.setContentSize(
      buttonTransform?.width || 480,
      buttonTransform?.height || 150,
    );
  }

  private applyIntroPanelVisibility(): void {
    const introPanel = this.node.getChildByName(INTRO_PANEL);
    if (introPanel) introPanel.active = this.mode === ModeReadyKind.ARENA;
  }

  /**
   * The Ready page reuses old serialized UI where a large "模式选择" title node
   * still sits at the top. It overlaps the per-mode HeaderTitle ("无尽探索" /
   * "竞技乱斗"). Clear its label or hide the whole node so only the correct
   * mode title is visible. Does not change prefab/meta/UUID/session architecture.
   */
  private hideStaleHeaderTitle(): void {
    const header = this.findNode('Header');
    if (!header) return;
    // Clear any stale label text, then hide the Header sprite/background entirely.
    // The Ready page uses HeaderTitle for its per-mode title (无尽探索 / 竞技乱斗),
    // so the old Header node (which carries baked 黑洞回收站 / 模式选择 artwork)
    // must not be visible here at all.
    const label = header.getComponent(Label) ?? header.getComponentInChildren(Label);
    if (label) label.string = '';
    header.active = false;
  }

  /**
   * V4 reference 06 / 07. Give `MapPreview` a real map preview instead of the
   * mode-card artwork, whose title and description are baked into pixels.
   * `MapPreviewGraphic` adopts the authored thumbnail SpriteFrame from the
   * `game-art` UI library, so the page no longer draws the preview in code.
   */
  private applyMapPreview(): void {
    const preview = this.findNode('MapPreview');
    if (!preview) return;
    const graphic = preview.getComponent(MapPreviewGraphic) || preview.addComponent(MapPreviewGraphic);
    graphic.kind = this.mode === ModeReadyKind.ENDLESS ? MapPreviewKind.CITY : MapPreviewKind.ARENA;
    graphic.redraw();
  }

  /**
   * V7: with the authored UIButton mounted, the serialized BtnStart artwork is
   * switched off so the two do not double-draw. Without it, fall back to the
   * old behaviour: the serialized Ready pages reuse the *mode card* artwork for
   * `BtnStart`, whose baked copy collided with the CTA label, so the clean Home
   * CTA frame is borrowed at runtime instead.
   */
  private applyStartButton(): void {
    const button = this.findNode('BtnStart');
    const sprite = button?.getComponent(Sprite);
    if (!button || !sprite) return;
    const hasAuthoredArt = Boolean(button.getChildByName(START_ART));
    if (hasAuthoredArt) {
      sprite.enabled = false;
      return;
    }
    sprite.enabled = true;
    const serializedFrame = sprite.spriteFrame;
    const cleanFrame = this.findHomeCtaFrame(serializedFrame);
    if (!cleanFrame) {
      console.warn('[ModeReadyPageController] clean CTA frame unavailable; keeping serialized artwork.');
      return;
    }
    sprite.spriteFrame = cleanFrame;
    // BtnStartLabel is a page-level sibling (not a child of BtnStart) and is
    // already placed by MODE_READY_LAYOUT at the button centre (0, -290);
    // leaving it there keeps the CTA text centred on the clean frame.
  }

  /** Locates the Home page's main CTA frame; it is already loaded in this scene. */
  private findHomeCtaFrame(rejectFrame: SpriteFrame | null): SpriteFrame | null {
    const home = this.node.parent?.getChildByName('HomePage');
    if (!home) return null;
    const homeStart = home.getChildByName('SafeAreaRoot')?.getChildByName('BtnStart')
      ?? home.getChildByName('BtnStart');
    const frame = homeStart?.getComponent(Sprite)?.spriteFrame ?? null;
    if (!frame || frame === rejectFrame) return null;
    return frame;
  }

  private resizeAndPlace(name: string, width: number, height: number, x: number, y: number): void {
    const node = this.findNode(name);
    if (!node) return;
    const transform = node.getComponent(UITransform);
    if (transform) transform.setContentSize(width, height);
    node.setPosition(x, y, 0);
  }

  /**
   * Fit the authored 720-wide composition into the design space the UI camera
   * actually shows: `1280 / aspect` wide, not the 720 `view.getVisibleSize()`
   * reports. No-op on 9:16, where the reference composition already fits.
   *
   * BtnBack is authored at design x = -285 against a usable half-width of 288.2
   * at 412x915, i.e. 2.3 screen px from the edge -- inside the corner radius of
   * a 20:9 phone. It is interactive, so it takes the locked 24 px margin, on its
   * own rather than through the cluster clamp.
   *
   * StatPanelTop and StatPanelBottom are 580 design px wide (+/-290), so they are
   * clipped by 1.3 px per side; they are Sliced, so narrowing is lossless and
   * leaves the vertical composition untouched. MapPreview and PreviewCard are
   * Graphics surfaces, not Sliced sprites, and are left alone: resizing a node
   * that a Graphics component draws into would clip the drawing rather than
   * scale it. They sit 5.8 px inside the frame, unclipped.
   */
  private fitToVisibleDesignSpace(): void {
    const back = MODE_READY_LAYOUT.BtnBack;
    clampNodeIntoSafeSpan(this.findNode('BtnBack'), back[2], back[0], pageSafeHalfWidth(this.node));
    for (const panelName of READY_PANEL_NODES) {
      fitSlicedPanelToSafeSpan(this.findNode(panelName), pagePanelHalfWidth(this.node));
    }
  }

  private findNode(name: string): Node | null {
    return this.node.getChildByName(name)
      ?? this.node.getChildByName('SafeAreaRoot')?.getChildByName(name)
      ?? null;
  }

  private bind(name: string, handler: () => void): void {
    const button = this.node.getChildByName(name)?.getComponent(Button);
    if (!button) {
      console.error('[ModeReadyPageController] Missing serialized Button: ' + name);
      return;
    }
    button.node.on(Button.EventType.CLICK, handler, this);
    this.bindings.push([button, handler]);
  }

  private setLabel(name: string, text: string): void {
    const label = this.findNode(name)?.getComponent(Label);
    if (label) label.string = text;
  }

  private setLabelAlign(name: string, align: number): void {
    const label = this.findNode(name)?.getComponent(Label);
    if (label) label.horizontalAlign = align;
  }

  /**
   * Size the page title as the dominant line. `MODE_READY_LAYOUT` owns the box;
   * the serialized label's own 19px is too small to outrank the brand watermark,
   * and a Label's font size is not something the layout table can express.
   */
  private configureHeaderTitle(): void {
    const label = this.findNode('HeaderTitle')?.getComponent(Label);
    if (!label) return;
    label.fontSize = 66;
    label.lineHeight = 74;
    label.overflow = Label.Overflow.SHRINK;
  }

  private configureIntroText(align: number, fontSize: number, lineHeight: number): void {
    const label = this.findNode('IntroText')?.getComponent(Label);
    if (!label) return;
    label.horizontalAlign = align;
    label.overflow = Label.Overflow.CLAMP;
    label.fontSize = fontSize;
    label.lineHeight = lineHeight;
  }

  /**
   * Fill one stat row. When the UIHudBar prefab is mounted its own Caption/Value
   * labels carry the text and the page-level pair is hidden — otherwise the two
   * pairs would draw on top of each other. Without the prefab the page-level
   * labels keep the text, exactly as before. Either way both labels keep their
   * string so the read-only QA projection still reports the real values.
   */
  private applyStatRow(
    panelName: string,
    captionName: string,
    valueName: string,
    caption: string,
    value: string,
  ): void {
    const panel = this.node.getChildByName(panelName);
    const barCaption = panel?.getChildByName('Caption')?.getComponent(Label) || null;
    const barValue = panel?.getChildByName('Value')?.getComponent(Label) || null;
    const usesBar = Boolean(barCaption && barValue);
    if (barCaption) barCaption.string = caption;
    if (barValue) barValue.string = value;
    this.setLabel(captionName, caption);
    this.setLabel(valueName, value);
    const captionNode = this.findNode(captionName);
    const valueNode = this.findNode(valueName);
    if (captionNode) captionNode.active = !usesBar;
    if (valueNode) valueNode.active = !usesBar;
  }

  /**
   * The CTA copy lives on the authored UIButton's own label when that prefab is
   * mounted, so the page-level BtnStartLabel is hidden to avoid double text.
   * Without the prefab the page-level label keeps the copy, as before. Either
   * way the string stays set, so the read-only QA projection still reports it.
   */
  private setStartLabel(text: string): void {
    const artLabel = this.findNode('BtnStart')?.getChildByName(START_ART)?.getChildByName('Label')?.getComponent(Label);
    this.setLabel('BtnStartLabel', text);
    const pageLabel = this.findNode('BtnStartLabel');
    if (pageLabel) pageLabel.active = !artLabel;
    if (artLabel) artLabel.string = text;
  }

  private refreshProfile(): void {
    const machineLevel = Math.max(1, Math.min(MACHINE_EVOLUTION_CONFIG.length, saveService.data.machineLevel || 1));
    const machine = MACHINE_EVOLUTION_CONFIG[machineLevel - 1];
    this.applyIntroPanelVisibility();
    this.configureHeaderTitle();
    if (this.mode === ModeReadyKind.ENDLESS) {
      this.setLabel('HeaderTitle', '无尽探索');
      this.setLabelAlign('IntroText', Label.HorizontalAlign.CENTER);
      this.configureIntroText(Label.HorizontalAlign.CENTER, 20, 32);
      this.applyStatRow(
        STAT_PANEL_TOP, 'StatCaption', 'StatValue',
        '历史最高纪录',
        Math.max(0, Math.floor(saveService.data.highScore)).toLocaleString('en-US'),
      );
      // V4 design-lock.md §06: exactly these two lines, nothing longer.
      this.setLabel('IntroText', '不断吞噬 · 不断成长\n解锁更大目标');
      this.setStartLabel('开始探索 ▶');
    } else {
      this.setLabel('HeaderTitle', '竞技乱斗');
      // Reference 07 lists the rules left-aligned inside the panel; reference 06
      // centres the two-line copy.
      this.setLabelAlign('IntroText', Label.HorizontalAlign.LEFT);
      this.configureIntroText(Label.HorizontalAlign.LEFT, 20, 28);
      this.applyStatRow(STAT_PANEL_TOP, 'StatCaption', 'StatValue', '对局规则', '8 人 · 3:00');
      // V4 design-lock.md §07: the five real match rules, in this order.
      this.setLabel('IntroText', '• 8 人\n• 3:00\n• 吞噬成长\n• 淘汰弱小玩家\n• 躲避更大玩家');
      this.setStartLabel('开始乱斗 ▶');
    }
    this.applyStatRow(
      STAT_PANEL_BOTTOM, 'MachineCaption', 'MachineValue',
      '当前机器', `LV.${machineLevel} ${machine.title}`,
    );
  }
}
