/** 编辑器保存的结算页数据绑定与真实按钮事件。 */
import { _decorator, Button, Component, Label } from 'cc';
import {
  INNER_PANEL_INSET_DESIGN_PX,
  fitSlicedPanelToSafeSpan,
  pagePanelHalfWidth,
  trackPanelNarrowing,
} from './PageSafeArea';
import { eventBus } from '../core/EventBus';
import { ArenaMatchSnapshot, ArenaSettlementReward } from '../gameplay/ArenaMatchManager';
import { GameSessionMode, MODE_TITLES } from '../gameplay/session/GameSessionCoordinator';

const { ccclass } = _decorator;

/** Sliced panels narrower than the card, inset so they read as nested. */
const INNER_PANEL_NODES: readonly string[] = ['StatRow_223', 'StatRow_143', 'StatRow_63', 'StatRow_-17', 'StatRow_-97', 'ArenaLeaderboardPanel', 'ArenaPlayerRow', 'ArenaRewardPanel', 'ArenaStatMassPanel', 'ArenaStatKillsPanel', 'ArenaStatTimePanel', 'ArenaRankRow_1', 'ArenaRankRow_2', 'ArenaRankRow_3', 'ArenaRankRow_4', 'ArenaRankRow_5'];

/** Simple-sprite corner badges that follow the card's narrowing. */
const CARD_SATELLITE_NODES: readonly string[] = ['SettlementCoinLeft', 'SettlementCoinRight'];

@ccclass('SettlementPageController')
export class SettlementPageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    // Announced so the audio layer can play the reward cue without the page
    // reaching into it; the page itself stays a view.
    eventBus.emit('SETTLEMENT_SHOWN');
    this.refreshSubtitle();
    this.bind('BtnRestart', () => eventBus.emit('GAME_RESTART_CURRENT'));
    this.bind('BtnHome', () => eventBus.emit('GAME_RETURN_HOME'));
    this.fitToVisibleDesignSpace();
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
    this.setLabel('Subtitle', `${MODE_TITLES.ENDLESS} · 本局数据`);
    this.setLabel('AbsorbedCaption', '吞噬物品');
    this.setLabel('CoinCaption', '获得金币');
    this.setLabel('LevelCaption', '最终等级');
    this.setLabel('RegionCaption', '探索区域');
    this.setLabel('AbsorbedValue', `${Math.max(0, absorbed)}`);
    this.setLabel('CoinValue', `${Math.max(0, coins)}`);
    this.setLabel('LevelValue', `LV.${Math.max(1, level)}`);
    this.setLabel('RegionValue', `${Math.max(1, regions)}`);
    this.setLabel('MassValue', `${Math.round(Math.max(0, mass))} kg`);

    // Endless keeps the three stat cards and the reward bar. The board is a fixed
    // 660x1120, so hiding them left its lower half empty; and the five equal-width
    // rows they replace were never the final visual. The captions are re-labelled
    // to Endless's own facts, so nothing claims a rank or an elimination that this
    // mode does not have.
    this.setLabel('ArenaStatMassCaption', '最终质量');
    this.setLabel('ArenaStatMassValue', `${Math.round(Math.max(0, mass))} kg`);
    this.setLabel('ArenaStatKillsCaption', '吞噬物品');
    this.setLabel('ArenaStatKillsValue', `${Math.max(0, absorbed)}`);
    this.setLabel('ArenaStatTimeCaption', '最终等级');
    this.setLabel('ArenaStatTimeValue', `LV.${Math.max(1, level)}`);
    this.setLabel('ArenaRewardCaption', '本局获得金币');
    this.setLabel('ArenaRewardValue', `+${Math.max(0, coins)}`);
    // Endless has no reward ledger to itemise, and an empty line is better than a
    // breakdown of numbers that were never computed.
    this.setLabel('ArenaRewardBreakdown', '');

    // Endless has no leaderboard, so the middle of the board -- the region the
    // leaderboard occupies in Arena, y -165..365 -- would be empty. The real
    // content is distributed across that region instead of being left stacked at
    // the bottom. None of these nodes is pinned by
    // docs/design-contracts/settlement.json (which pins only the overlay, the
    // card, the leaderboard, the breakdown, and the two buttons), so this is a
    // composition choice rather than a contract change.
    // A summary line, not a restatement of one card.
    this.setLabel('ArenaResult', `吞噬 ${Math.max(0, absorbed)} 件 · 最终质量 ${Math.round(Math.max(0, mass))} kg`);
    // A panel and its caption/value labels are siblings, not parent and children,
    // so moving a panel alone leaves its text behind -- which is exactly what
    // happened the first time this was written. The authored offsets are caption
    // +23 and value -15 from the panel's own y; a cluster moves as a unit.
    this.placeCluster(250, [['ArenaResult', 0, 0]]);
    // Caption and value sit below the icon now that each card carries one: the
    // panel is 140 tall, the icon occupies +17..+63, so +2/-36 keeps the three
    // stacked without overlap.
    this.placeCluster(30, [
      ['ArenaStatMassPanel', -184, 0], ['ArenaStatMassCaption', -184, 2], ['ArenaStatMassValue', -184, -36],
      ['ArenaStatKillsPanel', 0, 0], ['ArenaStatKillsCaption', 0, 2], ['ArenaStatKillsValue', 0, -36],
      ['ArenaStatTimePanel', 184, 0], ['ArenaStatTimeCaption', 184, 2], ['ArenaStatTimeValue', 184, -36],
    ]);
    this.placeCluster(-190, [
      ['ArenaRewardPanel', 0, 0], ['ArenaRewardCaption', -150, 19], ['ArenaRewardValue', 164, 19],
    ]);
  }

  /**
   * Position a cluster of settlement nodes at `anchorY`, each offset from it.
   *
   * Only nodes the settlement layout contract does not pin are moved:
   * `docs/design-contracts/settlement.json` pins the overlay, the card, the
   * leaderboard, the reward breakdown and the two buttons, and none of those is
   * passed here.
   */
  private placeCluster(anchorY: number, members: readonly (readonly [string, number, number])[]): void {
    for (const [name, x, offsetY] of members) {
      const node = this.node.getChildByName(name);
      if (node) node.setPosition(x, anchorY + offsetY, 0);
    }
  }

  /** Arena uses the same saved settlement card, with labels bound to match facts. */
  public updateArenaStats(snapshot: ArenaMatchSnapshot, reward: ArenaSettlementReward): void {
    this.setArenaLeaderboardVisible(true);
    this.setLabel('Title', '竞技结算');
    this.setLabel('Subtitle', snapshot.reason === 'FORFEIT' ? `${MODE_TITLES.ARENA} · 已退出` : `${MODE_TITLES.ARENA} · 时间结束`);
    this.setLabel('ArenaResult', `第 ${snapshot.localRank || '-'} / ${snapshot.competitorCount} 名 · ${Math.round(snapshot.localMass)} kg`);
    this.setLabel('ArenaStatMassValue', `${Math.round(snapshot.localMass)} kg`);
    this.setLabel('ArenaStatKillsValue', `${snapshot.localKills} 次`);
    this.setLabel('ArenaStatTimeValue', this.formatDuration(snapshot.elapsedSeconds));
    this.setLabel('ArenaRewardValue', `+${reward.coins}`);
    this.setLabel(
      'ArenaRewardBreakdown',
      `质量 ${reward.massCoins} · 收集 ${reward.collectedCoins} · 淘汰 ${reward.eliminationCoins} · 生存 ${reward.survivalCoins} · 名次 ${reward.placementCoins}`,
    );

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

  /**
   * Fit the authored 720-wide composition into the design space the UI camera
   * actually shows: `1280 / aspect` wide, not the 720 `view.getVisibleSize()`
   * reports. No-op on 9:16, where the reference composition already fits.
   *
   * SettlementCard is 660 design px wide against the 576.3 design px a 20:9 phone
   * shows, so 29.9 screen px of it is off each edge and its rounded border is
   * cropped. It, the stat rows and the leaderboard rows are all SLICED, so
   * narrowing them is lossless and leaves the vertical composition untouched.
   *
   * The two corner coin badges are Simple sprites: they keep their size and follow
   * the card's narrowing proportionally, which is why they are tracked rather than
   * resized. SettlementRibbon (492) stays inside the 509 px card.
   */
  private fitToVisibleDesignSpace(): void {
    const panelHalfWidth = pagePanelHalfWidth(this.node);
    const card = fitSlicedPanelToSafeSpan(this.node.getChildByName('SettlementCard'), panelHalfWidth);
    for (const panelName of INNER_PANEL_NODES) {
      fitSlicedPanelToSafeSpan(
        this.node.getChildByName(panelName), panelHalfWidth, INNER_PANEL_INSET_DESIGN_PX);
    }
    for (const satelliteName of CARD_SATELLITE_NODES) {
      trackPanelNarrowing(this.node.getChildByName(satelliteName), card.factor);
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
    // The result line is the settlement's headline in both modes: Arena shows the
    // placing, Endless the mass. Only the ranking rows below it are arena-only.
    this.setNodeActive('ArenaResult', true);
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
    // The five equal-width rows are retired in both modes: the stat cards carry
    // the same facts in a composition that matches the reference.
    for (const child of this.node.children) {
      if (child.name.startsWith('StatRow_') || /^(Absorbed|Mass|Coin|Level|Region)(Caption|Value)$/.test(child.name)) {
        child.active = false;
      }
    }
    // The three stat cards and the reward bar are shown in both modes -- Arena
    // binds them to match facts, Endless to its own -- so the board is never
    // half empty. Only the leaderboard is arena-only.
    for (const name of [
      'ArenaStatMassPanel', 'ArenaStatKillsPanel', 'ArenaStatTimePanel', 'ArenaRewardPanel',
      'ArenaStatMassCaption', 'ArenaStatMassValue', 'ArenaStatKillsCaption', 'ArenaStatKillsValue',
      'ArenaStatTimeCaption', 'ArenaStatTimeValue', 'ArenaRewardCaption', 'ArenaRewardValue',
    ]) {
      this.setNodeActive(name, true);
    }
    this.setNodeActive('ArenaRewardBreakdown', visible);
  }

  private refreshSubtitle(): void {
    const subtitle = this.node.getChildByName('Subtitle')?.getComponent(Label);
    if (!subtitle) return;
    if (subtitle.string.includes('无尽吞噬')) {
      subtitle.string = subtitle.string.replace('无尽吞噬', MODE_TITLES.ENDLESS);
    }
    if (subtitle.string.includes('黑洞乱斗')) {
      subtitle.string = subtitle.string.replace('黑洞乱斗', MODE_TITLES.ARENA);
    }
  }

  private formatDuration(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${`${total % 60}`.padStart(2, '0')}`;
  }

  private setNodeActive(name: string, active: boolean): void {
    const node = this.node.getChildByName(name);
    if (node) node.active = active;
  }
}
