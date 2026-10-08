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
    // ShelfArena / ShelfEndless carry mode_card_shelf.png, which is an empty
    // white capsule bar with no content of its own. In the portrait frame they
    // read as two blank white sprite bars floating between the title and the
    // mode cards, which the V6 brief forbids by name ("empty sprite bar",
    // "placeholder rectangle"). The mode cards already frame themselves, so the
    // decorative shelves are pure residue. They stay in MODE_SELECT_LAYOUT so
    // the layout contract keeps asserting their authored geometry; only their
    // visibility is suppressed here.
    for (const emptyShelf of ['ShelfArena', 'ShelfEndless']) {
      const shelf = this.findNode(emptyShelf);
      if (shelf) shelf.active = false;
    }
  }
}

