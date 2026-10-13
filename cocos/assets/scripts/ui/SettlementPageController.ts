/** 编辑器保存的结算页数据绑定与真实按钮事件。 */
import { _decorator, Button, Color, Component, Label, Node, Sprite } from 'cc';
import {
  INNER_PANEL_INSET_DESIGN_PX,
  fitSlicedPanelToSafeSpan,
  pagePanelHalfWidth,
  trackPanelNarrowing,
} from './PageSafeArea';
import { eventBus } from '../core/EventBus';
import { ArenaMatchSnapshot, ArenaSettlementReward } from '../gameplay/ArenaMatchManager';
import { GameSessionMode, MODE_TITLES } from '../gameplay/session/GameSessionCoordinator';
import { colorFromToken } from './UIStyleTokens';

const { ccclass } = _decorator;

/** Sliced panels narrower than the card, inset so they read as nested. */
const INNER_PANEL_NODES: readonly string[] = ['StatRow_223', 'StatRow_143', 'StatRow_63', 'StatRow_-17', 'StatRow_-97', 'ArenaLeaderboardPanel', 'ArenaPlayerRow', 'ArenaRewardPanel', 'ArenaStatMassPanel', 'ArenaStatKillsPanel', 'ArenaStatTimePanel', 'ArenaRankRow_1', 'ArenaRankRow_2', 'ArenaRankRow_3', 'ArenaRankRow_4', 'ArenaRankRow_5'];

/** Simple-sprite corner badges that follow the card's narrowing. */
const CARD_SATELLITE_NODES: readonly string[] = ['SettlementCoinLeft', 'SettlementCoinRight'];

/**
 * The 称号 DESIGN_06 prints under each leaderboard row's name.
 *
 * Derived from the row's own placement and kill count, never invented: a row
 * cannot claim a title its record does not support.
 *
 * Placement is the BASE and kills PROMOTE. Both orderings are real match facts,
 * but placement is what the board is sorted by, so keying the ladder off it is
 * what makes the column read as a hierarchy -- keyed off kills alone, every row
 * in a low-kill match carries the same 萌新黑洞 and the column says nothing. Kills
 * still lift a high-scoring player out of the band their placement would give
 * them, so nobody who fought their way up is labelled a beginner.
 */
function rankTitle(rank: number, kills: number): string {
  if (rank === 1) return '黑洞之王';
  if (rank === 2 || kills >= 8) return '吞噬达人';
  if (rank === 3 || kills >= 4) return '城市清道夫';
  if (rank === 4 || kills >= 1) return '稳健发育';
  return '萌新黑洞';
}

/**
 * `ArenaResult` sits on two different surfaces. In Arena the leaderboard panel is
 * visible and dark, and the line falls inside it; in Endless that panel is hidden
 * and the line sits on the light card. Sampled from DESIGN_06 for the dark case
 * and kept at the authored card colour for the light one.
 */
const RESULT_ON_DARK_BOARD: readonly [number, number, number] = [202, 215, 244];
const RESULT_ON_LIGHT_CARD: readonly [number, number, number] = [77, 54, 109];

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

  public updateStats(
    absorbed: number, coins: number, level: number, regions: number, mass: number,
    /** Per-tier absorption counts, already formatted; '' when there is nothing to itemise. */
    tierBreakdown: string = '',
  ): void {
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
    // Endless pays coins only, so the reference's three reward tiles would be two
    // rewards this mode never grants -- which the canon forbids alongside fake
    // buttons. What Endless does have is a real per-tier absorption ledger, so that
    // is what itemises the card, and it is also what fills the lower half the
    // reference fills with its reward row.
    this.setLabel('ArenaRewardBreakdown', tierBreakdown);
    // `setArenaLeaderboardVisible(false)` ran at the top of this branch and hid
    // this node with the rest of the arena-only furniture, before the text above
    // was known. It is the reward ledger in Arena and the absorption ledger here,
    // so it belongs on screen whenever it has something to say.
    this.setNodeActive('ArenaRewardBreakdown', tierBreakdown !== '');

    // Endless has no leaderboard, so the middle of the board -- the region the
    // leaderboard occupies in Arena, y -165..365 -- would be empty. The real
    // content is distributed across that region instead of being left stacked at
    // the bottom. None of these nodes is pinned by
    // docs/design-contracts/settlement.json (which pins only the overlay, the
    // card, the leaderboard, the breakdown, and the two buttons), so this is a
    // composition choice rather than a contract change.
    // A summary line, not a restatement of one card.
    this.setLabel('ArenaResult', `吞噬 ${Math.max(0, absorbed)} 件 · 最终质量 ${Math.round(Math.max(0, mass))} kg`);
    this.setLabelColour('ArenaResult', ...RESULT_ON_LIGHT_CARD);
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
    // V12: DESIGN_06 leads the arena settlement with the RANK as the page
    // headline -- a big 第 1 名 -- and puts the mode and the reason underneath,
    // with mass, kills and time as the stat cards below. The rank used to be the
    // headline of ArenaResult instead, which made the page lead with the words
    // 竞技结算 and buried the one number the player actually came to read.
    this.setLabel('Title', `第 ${snapshot.localRank || '-'} 名`);
    this.setLabel('Subtitle', snapshot.reason === 'FORFEIT'
      ? `${MODE_TITLES.ARENA} · 竞技结算 · 已退出`
      : `${MODE_TITLES.ARENA} · 竞技结算 · 时间结束`);
    // Rank moved to the title, so this line carries what the title no longer
    // does: the size of the field. Mass stays in the stat card rather than being
    // repeated here.
    this.setLabel('ArenaResult', `共 ${snapshot.competitorCount} 人参赛 · 击败 ${Math.max(0, snapshot.localKills)} 名对手`);
    this.setLabelColour('ArenaResult', ...RESULT_ON_DARK_BOARD);
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
      this.setNodeActive(`ArenaRankAvatar_${index + 1}`, Boolean(entry));
      this.setNodeActive(`ArenaRankName_${index + 1}`, Boolean(entry));
      this.setNodeActive(`ArenaRankTitle_${index + 1}`, Boolean(entry));
      this.setNodeActive(`ArenaRankScore_${index + 1}`, Boolean(entry));
      if (!entry) continue;
      const rank = snapshot.leaderboard.findIndex((candidate) => candidate.id === entry.id) + 1;
      this.setLabel(`ArenaRankBadge_${index + 1}`, `${rank}`);
      this.setAvatarTint(`ArenaRankAvatar_${index + 1}`, entry.tint);
      // V12: DESIGN_06 gives each leaderboard row a 称号 on its own line under the
      // name. The titles are DERIVED from the row's real rank and kill count rather
      // than invented, so a row cannot claim a title its record does not support --
      // the same rule that keeps the stat cards off the design's sample numbers.
      this.setLabel(`ArenaRankName_${index + 1}`, entry.name);
      this.setLabel(`ArenaRankTitle_${index + 1}`, rankTitle(rank, entry.kills));
      // The reference's right-hand column is the row's mass and nothing else; the
      // player's own eliminations are the 击败对手 stat card's job, and repeating
      // them in every row is what made five rows read as one block of text.
      this.setLabel(`ArenaRankScore_${index + 1}`, `${Math.round(entry.mass)} kg`);
    }

    const local = snapshot.leaderboard.find((entry) => entry.isLocal) || null;
    this.setNodeActive('ArenaPlayerRow', Boolean(local));
    this.setNodeActive('ArenaPlayerBadgePanel', Boolean(local));
    this.setNodeActive('ArenaPlayerBadge', Boolean(local));
    this.setNodeActive('ArenaPlayerAvatar', Boolean(local));
    this.setNodeActive('ArenaPlayerName', Boolean(local));
    this.setNodeActive('ArenaPlayerTitle', Boolean(local));
    this.setNodeActive('ArenaPlayerScore', Boolean(local));
    if (local) {
      this.setLabel('ArenaPlayerBadge', `${snapshot.localRank || '-'}`);
      this.setAvatarTint('ArenaPlayerAvatar', local.tint);
      this.setLabel('ArenaPlayerName', '我');
      this.setLabel('ArenaPlayerTitle', rankTitle(snapshot.localRank, snapshot.localKills));
      this.setLabel('ArenaPlayerScore', `${Math.round(local.mass)} kg`);
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
    const label = this.findNode(name)?.getComponent(Label);
    if (label) label.string = value;
  }

  /**
   * Set a label's colour at runtime.
   *
   * `ArenaResult` is the one line that moves between surfaces: in Arena it sits
   * INSIDE the dark leaderboard panel, and in Endless the panel is hidden and it
   * sits on the light card. One serialized colour cannot be legible on both --
   * dark on the dark panel was unreadable, which is how this was found.
   */
  private setLabelColour(name: string, r: number, g: number, b: number): void {
    const label = this.findNode(name)?.getComponent(Label);
    if (label) label.color = new Color(r, g, b, 255);
  }

  /**
   * Find a node by name anywhere under this page.
   *
   * The leaderboard's avatar and 称号 are children of their ROW rather than of the
   * page, so a direct-child lookup reports them missing and every binding to them
   * silently does nothing -- which is what left the 称号 blank and all seven
   * avatars untinted the first time this was wired. Names on this page are
   * unique, so a search finds the same node the direct lookup would for the
   * bindings that already worked.
   */
  private findNode(name: string): Node | null {
    const walk = (node: Node): Node | null => {
      if (node.name === name) return node;
      for (const child of node.children) {
        const hit = walk(child);
        if (hit) return hit;
      }
      return null;
    };
    return walk(this.node);
  }

  /**
   * Tint a row's avatar with that competitor's own hole colour.
   *
   * The disc ships as ONE white-ring image; the colour is the node's Sprite tint,
   * which is what lets seven rows read as seven different holes from a single
   * asset. `colorFromToken` hands out a shared cached instance, so a copy is made
   * here rather than writing through it.
   */
  private setAvatarTint(name: string, hex: string): void {
    const sprite = this.findNode(name)?.getComponent(Sprite);
    if (!sprite) return;
    const source = colorFromToken(hex);
    sprite.color = new Color(source.r, source.g, source.b, 255);
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
      this.setNodeActive(`ArenaRankAvatar_${rank}`, visible);
      this.setNodeActive(`ArenaRankName_${rank}`, visible);
      this.setNodeActive(`ArenaRankTitle_${rank}`, visible);
      this.setNodeActive(`ArenaRankScore_${rank}`, visible);
    }
    for (const name of [
      'ArenaPlayerRow', 'ArenaPlayerBadgePanel', 'ArenaPlayerBadge', 'ArenaPlayerAvatar',
      'ArenaPlayerName', 'ArenaPlayerTitle', 'ArenaPlayerScore',
    ]) {
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
    const node = this.findNode(name);
    if (node) node.active = active;
  }
}
