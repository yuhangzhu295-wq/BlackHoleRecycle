/** Editor-saved arena HUD bindings. All values originate from ArenaMatchManager. */
import { _decorator, Button, Component, Label } from 'cc';
import { eventBus } from '../core/EventBus';
import { ArenaMatchSnapshot } from '../gameplay/ArenaMatchManager';

const { ccclass } = _decorator;

const formatClock = (seconds: number): string => {
  const remaining = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
};

@ccclass('ArenaHUDController')
export class ArenaHUDController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.bind('BtnPause', () => eventBus.emit('UI_TRIGGER_PAUSE'));
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) button.node.off(Button.EventType.CLICK, handler, this);
    this.bindings.length = 0;
  }

  public updateMatch(snapshot: ArenaMatchSnapshot): void {
    this.setLabel('TimerValue', formatClock(snapshot.remainingSeconds));
    this.setLabel('RankValue', `第 ${snapshot.localRank || '-'} / ${snapshot.competitorCount}`);
    this.setLabel('MassValue', `${Math.round(snapshot.localMass)} kg`);
    this.setLabel('KillValue', `${snapshot.localKills}`);
    this.setLabel('StatusValue', snapshot.localAlive
      ? `吞噬 ${snapshot.localConsumed} · ${snapshot.localRespawnSeconds > 0 ? '重生中' : '战斗中'}`
      : `重生 ${snapshot.localRespawnSeconds.toFixed(1)}s`);
    snapshot.leaderboard.slice(0, 5).forEach((entry, index) => {
      const prefix = entry.isLocal ? '你' : entry.name;
      const life = entry.alive ? '' : ' · 重生';
      this.setLabel(`Top${index + 1}`, `${index + 1}. ${prefix}  ${entry.mass}kg${life}`);
    });
  }

  private bind(name: string, handler: () => void): void {
    const button = this.node.getChildByName(name)?.getComponent(Button);
    if (!button) {
      console.error(`[ArenaHUDController] Missing serialized ${name}.`);
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
