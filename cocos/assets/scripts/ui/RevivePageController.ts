/** Editor-saved revive page; buttons execute actual match actions via GameManager. */
import { _decorator, Button, Component, Label } from 'cc';
import { eventBus } from '../core/EventBus';
import { ArenaMatchSnapshot } from '../gameplay/ArenaMatchManager';

const { ccclass } = _decorator;

@ccclass('RevivePageController')
export class RevivePageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.bind('BtnRevive', () => eventBus.emit('ARENA_REVIVE_REQUESTED'));
    this.bind('BtnGiveUp', () => eventBus.emit('ARENA_GIVE_UP_REQUESTED'));
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) button.node.off(Button.EventType.CLICK, handler, this);
    this.bindings.length = 0;
  }

  public updateState(snapshot: ArenaMatchSnapshot): void {
    const seconds = Math.max(0, snapshot.localRespawnSeconds).toFixed(1);
    this.setLabel('CountdownValue', `${seconds}s`);
    this.setLabel('RankValue', `当前第 ${snapshot.localRank || '-'} / ${snapshot.competitorCount}`);
    this.setLabel('LossValue', `被吞噬后掉落了部分质量 · 已击败 ${snapshot.localKills} 名对手`);
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
