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

const { ccclass } = _decorator;

// [width, height, cocosX, cocosY] in the 720x1280 design space.
// cocosX = tlX + w/2 - 360   (Cocos center-origin, x positive right)
// cocosY = 640 - (tlY + h/2) (Cocos center-origin, y positive up)
export const MODE_SELECT_LAYOUT = {
  Background:             [720,  1280,    0,    0],
  BtnBack:                [ 80,    80, -300,  568],
  Header:                 [500,   116,    0,  534],
  ShelfArena:             [600,    52,    0,  418],
  BtnArena:               [610,   278,    0,  245],
  // ArenaAvailability Sprite badge sits inside BtnArena and already carries the
  // label as a child node.  Keep it in the layout so it sizes correctly but move
  // ArenaAvailabilityLabel off-screen so the sibling text clone is invisible.
  ArenaAvailability:      [220,    48, -140,  140],
  ArenaAvailabilityLabel: [  2,     2, 2000, 2000],
  ShelfEndless:           [600,    52,    0,   54],
  BtnEndless:             [610,   278,    0, -119],
  EndlessBestCaption:     [240,    44, -170, -214],
  EndlessBestValue:       [280,    44,  150, -214],
} as const;

@ccclass('ModeSelectPageController')
export class ModeSelectPageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.applyLayout();
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
    // Ensure EndlessBestCaption shows the correct static text
    const captionLabel = this.findNode('EndlessBestCaption')?.getComponent(Label);
    if (captionLabel) {
      captionLabel.string = '最高分';
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
    // ArenaAvailabilityLabel is parked off-screen in the layout but ensure its
    // active state is preserved (it is invisible by position, not by active).
  }
}

