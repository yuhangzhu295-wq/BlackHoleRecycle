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
  ArenaAvailability:      [220,    48,  160,  140],
  ArenaAvailabilityLabel: [220,    48,  160,  140],
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
    const button = this.node.getChildByName(name)?.getComponent(Button);
    if (!button) {
      console.error('[ModeSelectPageController] Missing serialized Button: ' + name);
      return;
    }
    button.node.on(Button.EventType.CLICK, handler, this);
    this.bindings.push([button, handler]);
  }

  private refreshProfile(): void {
    const bestLabel = this.node.getChildByName('EndlessBestValue')?.getComponent(Label);
    if (bestLabel) bestLabel.string = Math.max(0, Math.floor(saveService.data.highScore)).toLocaleString('en-US');
  }
}
