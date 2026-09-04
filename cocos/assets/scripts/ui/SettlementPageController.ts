/** 编辑器保存的结算页数据绑定与真实按钮事件。 */
import { _decorator, Button, Component, Label } from 'cc';
import { eventBus } from '../core/EventBus';
import { ArenaMatchSnapshot } from '../gameplay/ArenaMatchManager';

const { ccclass } = _decorator;

@ccclass('SettlementPageController')
export class SettlementPageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.bind('BtnRestart', () => eventBus.emit('GAME_RESTART_CURRENT'));
    this.bind('BtnHome', () => eventBus.emit('GAME_RETURN_HOME'));
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) {
      button.node.off(Button.EventType.CLICK, handler, this);
    }
    this.bindings.length = 0;
  }

  public updateStats(absorbed: number, coins: number, level: number, regions: number, mass: number): void {
    this.setArenaLeaderboardVisible(false);
    this.setLabel('Title', '本局结算');
    this.setLabel('Subtitle', '无尽吞噬 · 本局数据');
    this.setLabel('AbsorbedCaption', '吞噬物品');
    this.setLabel('CoinCaption', '获得金币');
    this.setLabel('LevelCaption', '最终等级');
    this.setLabel('RegionCaption', '探索区域');
    this.setLabel('AbsorbedValue', `${Math.max(0, absorbed)}`);
    this.setLabel('CoinValue', `${Math.max(0, coins)}`);
    this.setLabel('LevelValue', `LV.${Math.max(1, level)}`);
    this.setLabel('RegionValue', `${Math.max(1, regions)}`);
    this.setLabel('MassValue', `${Math.round(Math.max(0, mass))} kg`);
  }

  /** Arena uses the same saved settlement card, with labels bound to match facts. */
  public updateArenaStats(snapshot: ArenaMatchSnapshot): void {
    this.setArenaLeaderboardVisible(true);
    this.setLabel('Title', '竞技结算');
    this.setLabel('Subtitle', snapshot.reason === 'FORFEIT' ? '黑洞乱斗 · 已退出' : '黑洞乱斗 · 时间结束');
    this.setLabel('ArenaResult', `第 ${snapshot.localRank || '-'} / ${snapshot.competitorCount} 名 · ${Math.round(snapshot.localMass)} kg`);

    // The ranking panel is intentionally filled only from the match snapshot.
    // Keep the player-visible row even when they are outside the top ranks:
    // a top-five-only list can otherwise hide the result that this screen is
    // supposed to explain.  This is a layout choice, not synthetic ranking
    // data; score, mass, eliminations and placement remain match facts.
    const leaders = snapshot.leaderboard.filter((entry) => !entry.isLocal).slice(0, 4);
    for (let index = 0; index < 5; index += 1) {
      const entry = leaders[index];
      const row = this.node.getChildByName(`ArenaRankRow_${index + 1}`);
      if (!row) continue;
      row.active = Boolean(entry);
      this.setNodeActive(`ArenaRankBadgePanel_${index + 1}`, Boolean(entry));
      this.setNodeActive(`ArenaRankBadge_${index + 1}`, Boolean(entry));
      this.setNodeActive(`ArenaRankName_${index + 1}`, Boolean(entry));
      this.setNodeActive(`ArenaRankScore_${index + 1}`, Boolean(entry));
      if (!entry) continue;
      const rank = snapshot.leaderboard.findIndex((candidate) => candidate.id === entry.id) + 1;
      this.setLabel(`ArenaRankBadge_${index + 1}`, `${rank}`);
      this.setLabel(`ArenaRankName_${index + 1}`, entry.name);
      this.setLabel(`ArenaRankScore_${index + 1}`, `${Math.round(entry.mass)} kg · ${entry.kills} 淘汰`);
    }

    const local = snapshot.leaderboard.find((entry) => entry.isLocal) || null;
    this.setNodeActive('ArenaPlayerRow', Boolean(local));
    this.setNodeActive('ArenaPlayerBadgePanel', Boolean(local));
    this.setNodeActive('ArenaPlayerBadge', Boolean(local));
    this.setNodeActive('ArenaPlayerName', Boolean(local));
    this.setNodeActive('ArenaPlayerScore', Boolean(local));
    if (local) {
      this.setLabel('ArenaPlayerBadge', `${snapshot.localRank || '-'}`);
      this.setLabel('ArenaPlayerName', '我');
      this.setLabel('ArenaPlayerScore', `${Math.round(local.mass)} kg · ${local.kills} 淘汰`);
    }
  }

  private bind(name: string, handler: () => void): void {
    const button = this.node.getChildByName(name)?.getComponent(Button);
    if (!button) {
      console.error(`[SettlementPageController] Missing serialized ${name}.`);
      return;
    }
    button.node.on(Button.EventType.CLICK, handler, this);
    this.bindings.push([button, handler]);
  }

  private setLabel(name: string, value: string): void {
    const label = this.node.getChildByName(name)?.getComponent(Label);
    if (label) label.string = value;
  }

  private setArenaLeaderboardVisible(visible: boolean): void {
    const leaderboard = this.node.getChildByName('ArenaLeaderboardPanel');
    if (leaderboard) leaderboard.active = visible;
    const result = this.node.getChildByName('ArenaResult');
    if (result) result.active = visible;
    for (let rank = 1; rank <= 5; rank += 1) {
      this.setNodeActive(`ArenaRankRow_${rank}`, visible);
      this.setNodeActive(`ArenaRankBadgePanel_${rank}`, visible);
      this.setNodeActive(`ArenaRankBadge_${rank}`, visible);
      this.setNodeActive(`ArenaRankName_${rank}`, visible);
      this.setNodeActive(`ArenaRankScore_${rank}`, visible);
    }
    for (const name of ['ArenaPlayerRow', 'ArenaPlayerBadgePanel', 'ArenaPlayerBadge', 'ArenaPlayerName', 'ArenaPlayerScore']) {
      this.setNodeActive(name, visible);
    }
    for (const child of this.node.children) {
      if (child.name.startsWith('StatRow_') || /^(Absorbed|Mass|Coin|Level|Region)(Caption|Value)$/.test(child.name)) {
        child.active = !visible;
      }
    }
  }

  private setNodeActive(name: string, active: boolean): void {
    const node = this.node.getChildByName(name);
    if (node) node.active = active;
  }
}
