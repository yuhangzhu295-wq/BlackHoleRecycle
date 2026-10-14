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

/**
 * The two cards' text, in one place.
 *
 * It used to live in the card art (`mode_card_*_framed.png`), which made the mode
 * names untranslatable and meant any new card art would take the titles with it.
 * `compose_mode_layers.py` recorded that as a deliberate deferral and named the
 * ordering constraint: the art cannot be stripped of its text before the Labels
 * exist. The art now renders with `with_text=False`, and these strings are the
 * only copy of them.
 */
export const MODE_CARD_TEXT = {
  BtnArena: {
    title: '竞技乱斗',
    subtitle: '多人竞技',
    callout: '实时对战，吞噬最强对手！',
    badge: '1v7 本地竞技 · 已开放',
  },
  BtnEndless: {
    title: '无尽探索',
    subtitle: '生存挑战',
    callout: '无限地图，挑战更高分数！',
    badge: '最高分',
  },
} as const;

/** The card art's own width; the Labels are authored against it and scale with the card. */
const MODE_CARD_ART_WIDTH = 610;
/** The card art's own height, for the vertical half of the same scale. */
const MODE_CARD_ART_HEIGHT = 278;
/** The arena card's badge box in art coordinates, from the art's own draw call. */
const MODE_CARD_BADGE_BOX: readonly [number, number, number, number] = [36, 208, 252, 257];

/** [label suffix, which MODE_CARD_TEXT field it carries]. */
const MODE_CARD_LINES: readonly (readonly ['Title' | 'Subtitle' | 'Callout',
  'title' | 'subtitle' | 'callout'])[] = [
  ['Title', 'title'], ['Subtitle', 'subtitle'], ['Callout', 'callout'],
];

@ccclass('ModeSelectPageController')
export class ModeSelectPageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.applyLayout();
    this.fitToVisibleDesignSpace();
    this.hideStaleResiduals();
    this.refreshProfile();
    this.applyCardText();
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

  /**
   * Bind each card's text and keep it on the artwork.
   *
   * The card's box is rewritten at runtime from 610x278 to whatever the safe span
   * allows (519x236 at 390x844), which scales the ART but not its children. The
   * lines therefore live in a `CardText` container holding the art's own
   * coordinates, and one uniform scale on that container carries both their
   * positions and their sizes. Scaling the labels individually while leaving
   * their positions in art coordinates is what put the title 13 screen px high on
   * the first attempt.
   */
  private applyCardText(): void {
    for (const cardName of MODE_CARD_NODES) {
      const card = this.findNode(cardName);
      const transform = card?.getComponent(UITransform);
      if (!card || !transform) continue;
      const text = MODE_CARD_TEXT[cardName as keyof typeof MODE_CARD_TEXT];
      const factorX = transform.width / MODE_CARD_ART_WIDTH;
      const factorY = transform.height / MODE_CARD_ART_HEIGHT;
      const prefix = cardName.replace('Btn', '');

      const container = card.getChildByName(`${prefix}CardText`);
      if (container) container.setScale(factorX, factorY, 1);
      for (const [suffix, field] of MODE_CARD_LINES) {
        const label = card.getChildByName(`${prefix}CardText`)?.getChildByName(`${prefix}Card${suffix}`)
          ?.getComponent(Label);
        if (label) label.string = text[field];
      }

      // The badge labels are page-level, not in the container, because the endless
      // one sits beside a live score value that MODE_SELECT_LAYOUT already places.
      // The arena one is not in the layout table at all, so nothing else puts it
      // anywhere: left at its authored position it drew across the subtitle. Its
      // blue box is drawn by the card art, so the text is centred on the art's own
      // badge box -- art (36,208)-(252,257) -- mapped through the live factors.
      const badgeName = cardName === 'BtnArena' ? 'ArenaAvailabilityLabel' : 'EndlessBestCaption';
      const badge = this.findNode(badgeName)?.getComponent(Label);
      if (!badge) continue;
      badge.string = text.badge;
      badge.node.active = true;
      if (cardName === 'BtnArena') {
        const boxCentreX = (MODE_CARD_BADGE_BOX[0] + MODE_CARD_BADGE_BOX[2]) / 2;
        const boxCentreY = (MODE_CARD_BADGE_BOX[1] + MODE_CARD_BADGE_BOX[3]) / 2;
        badge.node.setPosition(
          (boxCentreX - MODE_CARD_ART_WIDTH / 2) * factorX,
          (MODE_CARD_ART_HEIGHT / 2 - boxCentreY) * factorY + card.position.y,
          0,
        );
      }
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
    // EndlessBestCaption used to be cleared here because the BtnEndless artwork
    // had "最高分" baked into its pixels and the label duplicated it. The art no
    // longer carries any text, so the label is the only copy and `applyCardText`
    // sets it.
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
    // ArenaAvailabilityLabel used to be cleared and deactivated here, because the
    // card artwork already carried the same badge text in its pixels. The art no
    // longer carries any text, so the label is the only copy of it and
    // `applyCardText` sets and shows it.
    // ArenaAvailability badge sprite stays hidden: the art still draws the badge's
    // blue box, so showing the sprite too would draw that box twice.
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

