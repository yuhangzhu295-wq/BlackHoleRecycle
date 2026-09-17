/** Revive page controller.
 *
 * Shows a 5-second countdown while the arena match clock is frozen.
 * On expiry the player is automatically forfeited to the Settlement screen.
 * Clicking BtnRevive instantly respawns via the real ArenaMatchManager.reviveLocal path.
 * Clicking BtnGiveUp forfeits immediately.
 *
 * No QA mutations, no fake ads, no forced grants.
 */
import { _decorator, Button, Component, Label } from 'cc';
import { eventBus } from '../core/EventBus';
import { ArenaMatchSnapshot } from '../gameplay/ArenaMatchManager';

const { ccclass } = _decorator;

const REVIVE_COUNTDOWN_SECONDS = 5.0;

@ccclass('RevivePageController')
export class RevivePageController extends Component {
  private bindings: Array<[Button, () => void]> = [];
  /** Separate countdown owned by this page; independent of the frozen arena respawn clock. */
  private countdownRemaining: number = REVIVE_COUNTDOWN_SECONDS;
  private countdownActive: boolean = false;

  onEnable(): void {
    this.bind('BtnRevive', () => eventBus.emit('ARENA_REVIVE_REQUESTED'));
    this.bind('BtnGiveUp', () => eventBus.emit('ARENA_GIVE_UP_REQUESTED'));
    this.countdownRemaining = REVIVE_COUNTDOWN_SECONDS;
    this.countdownActive = true;
    this.refreshCountdownLabel();
  }

  onDisable(): void {
    this.countdownActive = false;
    for (const [button, handler] of this.bindings) button.node.off(Button.EventType.CLICK, handler, this);
    this.bindings.length = 0;
  }

  update(dt: number): void {
    if (!this.countdownActive) return;
    this.countdownRemaining = Math.max(0, this.countdownRemaining - dt);
    this.refreshCountdownLabel();
    if (this.countdownRemaining <= 0) {
      this.countdownActive = false;
      // Countdown expired: forfeit to settlement without fake ad or forced grant.
      eventBus.emit('ARENA_GIVE_UP_REQUESTED');
    }
  }

  public updateState(snapshot: ArenaMatchSnapshot): void {
    // Rank and loss info come from the real snapshot; countdown is page-owned.
    this.setLabel('RankValue', `当前第 ${snapshot.localRank || '-'} / ${snapshot.competitorCount}`);
    this.setLabel('LossValue', `被吞噬后掉落了部分质量 · 已击败 ${snapshot.localKills} 名对手`);
  }

  private refreshCountdownLabel(): void {
    this.setLabel('CountdownValue', `${Math.ceil(this.countdownRemaining)}`);
  }

  private bind(name: string, handler: () => void): void {
    const button = this.node.getChildByName(name)?.getComponent(Button);
    if (!button) {
      console.error(`[RevivePageController] Missing serialized ${name}.`);
      return;
    }
    button.node.on(Button.EventType.CLICK, handler, this);
    this.bindings.push([button, handler]);
  }

  private setLabel(name: string, value: string): void {
    const label = this.node.getChildByName(name)?.getComponent(Label);
    if (label) label.string = value;
  }
}
