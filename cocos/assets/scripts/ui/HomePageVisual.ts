/**
 * Home 预制体的布局器。正式视觉由编辑器保存的 Sprite 资源提供；这里不生成
 * Graphics 原型，也不根据桌面窗口尺寸重排为横屏。
 */
import { _decorator, Component, Node, UITransform, view } from 'cc';
import {
  applyHudSafeAreaInset,
  hudDesignToFrameScale,
  hudVisibleHalfWidth,
  HUD_INTERACTIVE_MARGIN_SCREEN_PX,
} from './HudSafeAreaInset';

const { ccclass } = _decorator;

type HomeLayoutEntry = readonly [width: number, height: number, x: number, y: number];

// Keep runtime geometry aligned with home.json without serializing authoring data.
// V4 reference (05-home.png) button order left-to-right: 模式 / 机器 / 皮肤
const HOME_LAYOUT: Readonly<Record<string, HomeLayoutEntry>> = {
  Background: [720, 1280, 0, 0],
  // Move panels 16 px inward from canvas edges to clear device safe-area insets.
  // Design-space left edge of CoinPanel: 720/2 - (224-16) - 110 = 42 px (was 26 px).
  CoinPanel: [220, 64, -208, 564],
  MachineStatus: [220, 64, 208, 564],
  CoinIcon: [54, 54, -286, 560],
  CoinValue: [140, 50, -174, 560],
  MachineName: [200, 34, 200, 580],
  MachineValue: [200, 34, 200, 544],
  Logo: [600, 180, 0, 370],
  HeroBlackHole: [360, 360, 0, 30],
  // V4: BtnStart is wider (~490 px in reference); 480 keeps safe margins.
  BtnStart: [480, 104, 0, -312],
  // V4 order: 模式 (left) · 机器 (center) · 皮肤 (right)
  BtnMode: [160, 112, -208, -468],
  BtnMachine: [160, 112, 0, -468],
  BtnSkin: [160, 112, 208, -468],
  BtnSettings: [80, 80, 288, -540],
};

/** The three action cards, left to right, as authored in `HOME_LAYOUT`. */
const ACTION_ROW: readonly string[] = ['BtnMode', 'BtnMachine', 'BtnSkin'];

/** Caption offset from the card centre, in design px (see `layout`). */
const ACTION_LABEL_Y = -32;

/**
 * Screen-px inset the top panels keep from the frame edge. The table above
 * authors a 16 px inset from the canvas edge (see the `CoinPanel` note), which
 * only holds on 9:16; on taller frames the panels overflow and the clamp would
 * otherwise pull them back to a 0 px margin, i.e. flush against the edge and
 * under the corner radius.
 */
const TOP_PANEL_EDGE_INSET_SCREEN_PX = 16;

@ccclass('HomePageVisual')
export class HomePageVisual extends Component {
  onEnable(): void {
    this.layout();
    view.on('canvas-resize', this.layout, this);
  }

  onDisable(): void {
    view.off('canvas-resize', this.layout, this);
  }

  private layout(): void {
    // Product UI owns a 720×1280 portrait design space. Widgets may later
    // apply safe-area offsets, but desktop window dimensions must never
    // stretch the gameplay page into a landscape composition.
    for (const [name, [width, height, x, y]] of Object.entries(HOME_LAYOUT)) {
      this.resize(name, width, height, x, y);
    }

    this.centerButtonLabel('BtnStart');
    // The three small action cards carry pictograms in their upper half. Keep
    // their captions on the lower strip just like the V2 home reference;
    // centering them over the icons made both affordances harder to read.
    this.positionButtonLabel('BtnMode', ACTION_LABEL_Y);
    this.positionButtonLabel('BtnSkin', ACTION_LABEL_Y);
    this.positionButtonLabel('BtnMachine', ACTION_LABEL_Y);

    // Both steps below exist because the 720-wide design space is wider than
    // the space the UI camera actually shows on any phone taller than 9:16.
    // Order matters: the row is resized first so the clamp sees the final rects.
    this.fitActionRow();
    const safeAreaRoot = this.node.getChildByName('SafeAreaRoot');
    if (safeAreaRoot) {
      applyHudSafeAreaInset(safeAreaRoot, {
        labelMarginScreenPx: TOP_PANEL_EDGE_INSET_SCREEN_PX,
      });
    }
  }

  /**
   * Shrink the action row about its centre when the reference composition is
   * wider than the frame can show.
   *
   * The reference row spans design x = ±288 (centres ±208, cards 160 wide).
   * Against the design space that actually reaches the screen — `1280 / aspect`
   * wide, 576 design px at 412x915 — that leaves 0.1 screen px of margin, which
   * is inside the corner radius of every 20:9 device. Translation cannot fix it
   * (`applyHudSafeAreaInset` would recentre and change nothing), and narrowing
   * the spacing alone would push the cards into each other, so the row scales.
   * Both axes take the same factor, so the authored card art is not distorted,
   * and the step is a no-op on 9:16 and wider, where the reference already fits.
   */
  private fitActionRow(): void {
    const cards: Node[] = [];
    for (const name of ACTION_ROW) {
      const card = this.findNode(name);
      if (!card) return;
      cards.push(card);
    }

    const frameScale = hudDesignToFrameScale(this.node) || 1;
    const safeHalfWidth = hudVisibleHalfWidth(this.node)
      - HUD_INTERACTIVE_MARGIN_SCREEN_PX / frameScale;

    let authoredHalfSpan = 0;
    for (const name of ACTION_ROW) {
      const entry = HOME_LAYOUT[name];
      authoredHalfSpan = Math.max(authoredHalfSpan, Math.abs(entry[2]) + entry[0] / 2);
    }
    const rowScale = Math.min(1, safeHalfWidth / authoredHalfSpan);
    if (rowScale >= 1) return;

    for (let index = 0; index < ACTION_ROW.length; index += 1) {
      const name = ACTION_ROW[index];
      const [width, height, x] = HOME_LAYOUT[name];
      const card = cards[index];
      const transform = card.getComponent(UITransform);
      transform?.setContentSize(width * rowScale, height * rowScale);
      card.setPosition(x * rowScale, HOME_LAYOUT[name][3], 0);
      // The caption is a child of the card, so the clamp never measures it and
      // it must follow the card's scale by hand or it overflows the smaller card.
      const label = card.getChildByName(`${name}Label`);
      if (label) {
        label.setPosition(0, ACTION_LABEL_Y * rowScale, 0);
        label.setScale(rowScale, rowScale, 1);
      }
    }
  }

  private resize(name: string, width: number, height: number, x: number, y: number): void {
    const node = this.findNode(name);
    const transform = node?.getComponent(UITransform);
    if (!node || !transform) return;
    transform.setContentSize(width, height);
    node.setPosition(x, y, 0);
  }

  private centerButtonLabel(buttonName: string): void {
    this.positionButtonLabel(buttonName, 0);
  }

  private positionButtonLabel(buttonName: string, y: number): void {
    const button = this.findNode(buttonName);
    const label = button?.getChildByName(`${buttonName}Label`);
    if (label) label.setPosition(0, y, 0);
  }

  private findNode(name: string): Node | null {
    return this.node.getChildByName(name) ?? this.node.getChildByName('SafeAreaRoot')?.getChildByName(name) ?? null;
  }

}
