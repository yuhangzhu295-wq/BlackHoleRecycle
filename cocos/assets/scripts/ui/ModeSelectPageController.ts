/**
 * V3 mode select page controller. Mounted on the editor-saved ModeSelectPage node.
 * Exports MODE_SELECT_LAYOUT so the test contract can parse and verify the table
 * without launching a Cocos runtime.
 *
 * Only two playable modes are exposed: Arena and Endless.
 * No locked, coming-soon, VIP, video-unlock, fake-room, black-hole-battle,
 * or time-limited-leaderboard entries are rendered or accessible from this page.
 */
import { _decorator, Button, Component, Label, Node, UITransform } from 'cc';
import { applyPageTextTokens } from './UIStyleTokens';
import { eventBus } from '../core/EventBus';
import { saveService } from '../data/SaveService';
import { clampNodeIntoSafeSpan, fitNodeIntoSafeSpan, pageSafeHalfWidth } from './PageSafeArea';

const { ccclass } = _decorator;

// [width, height, cocosX, cocosY] in the 720x1280 design space.
// cocosX = tlX + w/2 - 360   (Cocos center-origin, x positive right)
// cocosY = 640 - (tlY + h/2) (Cocos center-origin, y positive up)
export const MODE_SELECT_LAYOUT = {
  Background:             [720,  1280,    0,    0],
  BtnBack:                [ 80,    80, -300,  568],
  Header:                 [500,   116,    0,  474],
  ShelfArena:             [600,    52,    0,  358],
  BtnArena:               [610,   278,    0,  185],
  ArenaAvailability:      [220,    48, -140,   80],
  ShelfEndless:           [600,    52,    0,   -6],
  BtnEndless:             [610,   278,    0, -179],
  EndlessBestCaption:     [240,    44, -170, -274],
  EndlessBestValue:       [280,    44,  150, -274],
} as const;

/** The two playable mode cards, which are wider than a 20:9 frame can show. */
const MODE_CARD_NODES: readonly (keyof typeof MODE_SELECT_LAYOUT)[] = ['BtnArena', 'BtnEndless'];
/** Decorative plinths: [shelf, the card it belongs under]. */
const MODE_SHELF_PAIRS: readonly (readonly [keyof typeof MODE_SELECT_LAYOUT, keyof typeof MODE_SELECT_LAYOUT])[] = [
  ['ShelfArena', 'BtnArena'],
  ['ShelfEndless', 'BtnEndless'],
];
/** How far the card's bottom edge sits down over the plinth, in design px. */
const PLINTH_OVERLAP = 10;

@ccclass('ModeSelectPageController')
export class ModeSelectPageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.applyLayout();
    this.fitToVisibleDesignSpace();
    this.hideStaleResiduals();
    this.refreshProfile();
    this.bind('BtnBack', () => eventBus.emit('MODE_BACK_REQUESTED'));
    this.bind('BtnArena', () => eventBus.emit('MODE_ARENA_REQUESTED'));
    this.bind('BtnEndless', () => eventBus.emit('MODE_ENDLESS_REQUESTED'));
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
    for (const [name, [width, height, x, y]] of Object.entries(MODE_SELECT_LAYOUT)) {
      this.resizeAndPlace(name, width, height, x, y);
    }
  }

  /**
   * Fit the authored 720-wide composition into the design space the UI camera
   * actually shows: `1280 / aspect` wide, i.e. 576.3 design px at 412x915, not
   * the 720 that `view.getVisibleSize()` reports. No-op on 9:16, where the
   * reference composition already fits.
   *
   * Each node is placed from its authored value, so repeated calls cannot drift.
   */
  private fitToVisibleDesignSpace(): void {
    const safeHalfWidth = pageSafeHalfWidth(this.node);

    // Authored at design x = -340..-260, which is 37 screen px off the left edge
    // at 412x915 -- the back button is cut in half there. Clamped on its own,
    // not through the cluster clamp: that groups it with `Header` (they overlap
    // vertically by 4 design px) and recentres the pair, which leaves the button
    // clipped anyway and pushes the correct header off the right edge.
    const back = MODE_SELECT_LAYOUT.BtnBack;
    clampNodeIntoSafeSpan(this.findNode('BtnBack'), back[2], back[0], safeHalfWidth);

    // Both cards are 610 design px wide (+/-305) against a 576.3 design px
    // visible width, so their rounded corners and the arrow affordance baked
    // into the sprite are cropped. They have no children, so resizing the
    // transform is the whole job; both axes take the same factor, so the card
    // art is not distorted.
    for (const cardName of MODE_CARD_NODES) {
      const [width, height, x] = MODE_SELECT_LAYOUT[cardName];
      fitNodeIntoSafeSpan(this.findNode(cardName), x, width, height, safeHalfWidth);
    }

    // The plinth is authored 600 design px against the same ~576 design px visible
    // width, so on its own it overflows the frame by about 2.8 screen px per side.
    // Narrow it to the card it sits under, less a small inset: the reference shows
    // a plinth slightly narrower than its card, and this keeps it inside the frame
    // at every aspect. Width only -- a slab's thickness must not scale with it.
    // Positioned from the card rather than from MODE_SELECT_LAYOUT: measured at
    // runtime, the authored shelf y put the plinth *above* its card (screen y
    // 168.8 against the card's 222.1) when the reference clearly has the card
    // sitting on the shelf. Deriving it here cannot drift from the card again.
    for (const [shelfName, cardName] of MODE_SHELF_PAIRS) {
      const card = this.findNode(cardName);
      const shelf = this.findNode(shelfName);
      const cardTransform = card?.getComponent(UITransform);
      const shelfTransform = shelf?.getComponent(UITransform);
      if (!card || !shelf || !cardTransform || !shelfTransform) continue;
      shelfTransform.setContentSize(cardTransform.width - 16, shelfTransform.height);
      shelf.setPosition(
        0,
        card.position.y - cardTransform.height / 2 - shelfTransform.height / 2 + PLINTH_OVERLAP,
        0,
      );
    }
  }

  private resizeAndPlace(name: string, width: number, height: number, x: number, y: number): void {
    const node = this.findNode(name);
    if (!node) return;
    const transform = node.getComponent(UITransform);
    if (transform) transform.setContentSize(width, height);
    node.setPosition(x, y, 0);
  }

  private findNode(name: string): Node | null {
    return this.node.getChildByName(name)
      ?? this.node.getChildByName('SafeAreaRoot')?.getChildByName(name)
      ?? null;
  }

  private bind(name: string, handler: () => void): void {
    const button = this.findNode(name)?.getComponent(Button);
    if (!button) {
      console.error('[ModeSelectPageController] Missing serialized Button: ' + name);
      return;
    }
    button.node.on(Button.EventType.CLICK, handler, this);
    this.bindings.push([button, handler]);
  }

 private refreshProfile(): void {
   const bestLabel = this.findNode('EndlessBestValue')?.getComponent(Label);
   if (bestLabel) {
     const score = Math.max(0, Math.floor(saveService.data.highScore));
     bestLabel.string = score.toLocaleString('en-US');
   }
    // EndlessBestCaption: the BtnEndless card artwork already has "最高分" baked into the
    // sprite pixels, so showing the label on top duplicates the text visually.
    // Clear the runtime label so only the baked artwork + score value are visible.
    const captionLabel = this.findNode('EndlessBestCaption')?.getComponent(Label);
    if (captionLabel) {
      captionLabel.string = '';
    }
 }

  /**
   * Suppress stale serialized text that the scene carries from an earlier layout
   * era.  The Header node may still hold a "黑洞回收站" subtitle label from when
   * the Mode Select prefab reused the Home header.  Clear it without hiding the
   * header sprite so the "模式选择" title remains visible.
   */
  private hideStaleResiduals(): void {
    // Clear any subtitle label baked into the Header node.
    const header = this.findNode('Header');
    if (header) {
      // The subtitle label is usually the second Label child; clear its string
      // rather than deactivating the node so the header sprite stays visible.
      const labels = header.getComponentsInChildren(Label);
      for (const lbl of labels) {
        if (lbl.string && lbl.string !== '模式选择') {
          lbl.string = '';
        }
      }
    }
    // ArenaAvailabilityLabel: clear text and deactivate node so it is never visible.
    const availLabel = this.findNode('ArenaAvailabilityLabel')?.getComponent(Label);
    if (availLabel) {
      availLabel.string = '';
      availLabel.node.active = false;
    }
    // ArenaAvailability badge sprite: hide it entirely — no availability schedule data
    // exists to display, so the blue badge strip must not appear on the mode card.
    const availBadge = this.findNode('ArenaAvailability');
    if (availBadge) availBadge.active = false;
    // ShelfArena / ShelfEndless were hidden because `mode_card_shelf.png` was a
    // blank white capsule with no 9-slice borders, and two floating white bars are
    // what the V6 brief forbids by name ("empty sprite bar", "placeholder
    // rectangle"). The placeholder has since been replaced with real plinth art --
    // a light top face over a darker front face, drawn by
    // `art-source/vector/generate_card_plinth.py` -- which is the element the
    // adopted Mode Select reference puts under every card. So the shelves are
    // shown again, and `mode_card_shelf.png.meta` now carries 16 px horizontal
    // 9-slice borders so a stretched card keeps square ends.
  }
}

