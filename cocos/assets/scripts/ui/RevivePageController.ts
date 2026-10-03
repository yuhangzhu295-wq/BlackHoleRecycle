/** Revive page controller.
 *
 * Shows a 5-second countdown while the arena match clock is frozen.
 * On expiry the player is automatically forfeited to the Settlement screen.
 * Clicking BtnRevive instantly respawns via the real ArenaMatchManager.reviveLocal path.
 * Clicking BtnGiveUp forfeits immediately.
 *
 * No QA mutations, no fake ads, no forced grants.
 */
import { _decorator, Button, Color, Component, Label, Layers, Node, Sprite, UITransform } from 'cc';
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
    this.applyCountdownStyle();
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
    this.setLabel('CountdownValue', `${Math.ceil(this.countdownRemaining)}s`);
  }

  private applyCountdownStyle(): void {
    const panel = this.node.getChildByName('CountdownPanel');
    if (panel) {
      panel.setPosition(0, -46, 0);
      const sprite = panel.getComponent(Sprite);
      if (sprite) sprite.color = new Color(255, 238, 238, 255);
      const transform = panel.getComponent(UITransform);
      if (transform) transform.setContentSize(260, 116);
    }

    let labelNode = this.node.getChildByName('CountdownLabel');
    if (!labelNode) {
      labelNode = new Node('CountdownLabel');
      labelNode.layer = Layers.Enum.UI_2D;
      this.node.addChild(labelNode);
      const transform = labelNode.addComponent(UITransform);
      transform.setContentSize(120, 26);
      labelNode.setPosition(-40, -32, 0);
      const label = labelNode.addComponent(Label);
      label.string = '自动放弃倒计时';
      label.fontSize = 16;
      label.lineHeight = 22;
      label.isBold = true;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.color = new Color(210, 48, 48, 255);
    } else {
      labelNode.setPosition(-40, -32, 0);
      const transform = labelNode.getComponent(UITransform);
      if (transform) transform.setContentSize(120, 26);
      const label = labelNode.getComponent(Label);
      if (label) {
        label.string = '自动放弃倒计时';
        label.fontSize = 16;
        label.lineHeight = 22;
        label.isBold = true;
        label.color = new Color(210, 48, 48, 255);
      }
    }

    const valueNode = this.node.getChildByName('CountdownValue');
    if (valueNode) {
      valueNode.setPosition(75, -32, 0);
      const transform = valueNode.getComponent(UITransform);
      if (transform) transform.setContentSize(50, 30);
      const label = valueNode.getComponent(Label);
      if (label) {
        label.fontSize = 26;
        label.lineHeight = 30;
        label.isBold = true;
        label.color = new Color(235, 35, 35, 255);
      }
    }
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
