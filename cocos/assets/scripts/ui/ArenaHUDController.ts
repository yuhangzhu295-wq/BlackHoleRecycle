/** Editor-saved arena HUD bindings. All values originate from ArenaMatchManager. */
import { _decorator, Button, Camera, Color, Component, director, instantiate, Label, LabelOutline, Node, UIOpacity, UITransform, Vec3, view } from 'cc';
import { eventBus } from '../core/EventBus';
import { ArenaMatchSnapshot } from '../gameplay/ArenaMatchManager';
import { CompressibleObject } from '../gameplay/CompressibleObject';
import { applyHudSafeAreaInset } from './HudSafeAreaInset';
import { PickupFeedbackDiagnostics, PickupFeedbackPresenter } from './PickupFeedbackPresenter';
import { TierLockDiagnostics, TierLockPresenter } from './TierLockPresenter';
import { TierUpgradeDiagnostics, TierUpgradePresenter } from './TierUpgradePresenter';

const { ccclass } = _decorator;

const TITLE_HOLD_SECONDS = 2.0;
const TITLE_FADE_SECONDS = 0.8;

const formatClock = (seconds: number): string => {
  const remaining = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
};

@ccclass('ArenaHUDController')
export class ArenaHUDController extends Component {
  private bindings: Array<[Button, () => void]> = [];
  private readonly projectedBotPosition: Vec3 = new Vec3();
  /**
   * Live world-to-HUD nameplates. These never own competitor state: each
   * string and screen position is refreshed from ArenaMatchSnapshot so the
   * portrait arena remains legible without static or invented opponent data.
   */
  private readonly competitorNameplates = new Map<string, Node>();
  private pickupFeedback: PickupFeedbackPresenter | null = null;
  /**
   * V4 reference 10 State B. Short, non-blocking upgrade banner driven by the
   * existing MACHINE_EVOLVED event. Bot evolutions are filtered out inside the
   * presenter, so a 1v7 match never announces an opponent's upgrade.
   */
  private tierUpgrade: TierUpgradePresenter | null = null;
  /**
   * V4 reference 10 State A. Readable "需要 LV.X" prompt, projected onto the HUD
   * because a Label on a code-built node never renders in a built player.
   */
  private tierLock: TierLockPresenter | null = null;
  private titleElapsed = 0;

  onEnable(): void {
    this.titleElapsed = 0;
    const titleNode = this.node.getChildByName('ArenaTitle');
    if (titleNode) {
      titleNode.active = true;
      const opacity = titleNode.getComponent(UIOpacity) || titleNode.addComponent(UIOpacity);
      opacity.opacity = 255;
    }
    this.pickupFeedback ||= new PickupFeedbackPresenter(this.node, 'Top1');
    this.tierUpgrade ||= new TierUpgradePresenter(this.node, 'MassValue');
    this.tierUpgrade.enable();
    this.tierLock ||= new TierLockPresenter(this.node, 'TimerValue');
    this.bind('BtnPause', () => eventBus.emit('UI_TRIGGER_PAUSE'));
    this.applyStatusStyle();
  }

  onDisable(): void {
    this.titleElapsed = 0;
    for (const [button, handler] of this.bindings) button.node.off(Button.EventType.CLICK, handler, this);
    this.bindings.length = 0;
    for (const nameplate of this.competitorNameplates.values()) nameplate.destroy();
    this.competitorNameplates.clear();
    this.pickupFeedback?.clear();
    this.tierUpgrade?.disable();
    this.tierLock?.clear();
  }

  public updateMatch(snapshot: ArenaMatchSnapshot): void {
    // A 390x844 device crops ~64 design px from each side of the 720x1280
    // design, which cut the leaderboard, the status panel and the pause button.
    applyHudSafeAreaInset(this.node);
    this.setLabel('TimerValue', formatClock(snapshot.remainingSeconds));
    this.setLabel('RankValue', `第 ${snapshot.localRank || '-'} / ${snapshot.competitorCount}`);
    // No space before the unit: the serialized LabelOutline bridges the space at
    // this font size and renders it as a hyphen, which reads like a negative mass.
    this.setLabel('MassValue', `${Math.round(snapshot.localMass)}kg`);
    this.setLabel('KillValue', `${snapshot.localKills}`);
    const statusNode = this.node.getChildByName('StatusValue');
    if (statusNode) {
      const warmup = Math.max(0, snapshot.combatWarmupRemainingSeconds);
      const isRespawning = !snapshot.localAlive || snapshot.localRespawnSeconds > 0;
      if (warmup > 0) {
        statusNode.active = true;
        this.setLabel('StatusValue', `安全准备 ${Math.ceil(warmup)}s`);
      } else if (isRespawning) {
        statusNode.active = true;
        this.setLabel('StatusValue', `重生 ${Math.max(0, snapshot.localRespawnSeconds).toFixed(1)}s`);
      } else {
        statusNode.active = false;
      }
    }
    // Top 3 + Me leaderboard:
    // Display Top 3 competitors. If local player is within Top 3, show 4th competitor on row 4.
    // If local player is 4th or lower, show local player on row 4 with their real rank.
    // Row 5 is hidden to save HUD space.
    const top3 = snapshot.leaderboard.slice(0, 3);
    const localInTop3 = top3.some((entry) => entry.isLocal);
    const row4Entry = localInTop3
      ? snapshot.leaderboard[3] || null
      : snapshot.leaderboard.find((entry) => entry.isLocal) || null;
    const row4Rank = localInTop3 ? 4 : snapshot.localRank || 4;

    const displayRows: Array<{ rank: number; entry: typeof snapshot.leaderboard[0] | null }> = [
      { rank: 1, entry: top3[0] || null },
      { rank: 2, entry: top3[1] || null },
      { rank: 3, entry: top3[2] || null },
      { rank: row4Rank, entry: row4Entry },
    ];

    displayRows.forEach(({ rank, entry }, index) => {
      const rowNode = this.node.getChildByName(`TopRow${index + 1}`);
      const labelNode = this.node.getChildByName(`Top${index + 1}`);
      if (!entry) {
        if (rowNode) rowNode.active = false;
        if (labelNode) labelNode.active = false;
        return;
      }
      if (rowNode) rowNode.active = true;
      if (labelNode) labelNode.active = true;
      const prefix = entry.isLocal ? '你' : entry.name;
      const life = entry.alive ? '' : ' · 重生';
      this.setLabel(`Top${index + 1}`, `${rank}. ${prefix}  ${entry.mass}kg${life}`);
    });

    const topRow5 = this.node.getChildByName('TopRow5');
    if (topRow5) topRow5.active = false;
    const top5 = this.node.getChildByName('Top5');
    if (top5) top5.active = false;
    this.updateOffscreenBotArrows(snapshot);
    this.updateCompetitorNameplates(snapshot);
  }

  /**
   * Keep the real local player and every living arena opponent visually tied
   * to their gameplay authority. This is intentionally UI-only: the labels
   * cannot change movement, pickup, mass, collision, combat, or ranking.
   */
  private getGameplayCamera(): Camera | null {
    return director.getScene()?.getChildByName('Main Camera')?.getComponent(Camera) || null;
  }

  private updateCompetitorNameplates(snapshot: ArenaMatchSnapshot): void {
    const camera = this.getGameplayCamera();
    const viewport = view.getViewportRect();
    const hudTransform = this.node.getComponent(UITransform) || null;
    if (!camera || !hudTransform || viewport.width <= 0 || viewport.height <= 0) return;

    const activeIds = new Set<string>();
    // Opponents the match manager reports as currently able to defeat the local
    // player. Computed by the combat rule itself, never re-derived here.
    const threatIds = new Set(snapshot.localThreatIds || []);
    const positionedNameplates: Array<{ node: Node; x: number; y: number }> = [];

    for (const competitor of snapshot.leaderboard) {
      const nameplate = this.getOrCreateNameplate(competitor.id);
      activeIds.add(competitor.id);
      if (!competitor.alive) {
        nameplate.active = false;
        continue;
      }

      const screen = camera.worldToScreen(
        new Vec3(competitor.position.x, 1.35, competitor.position.z),
        this.projectedBotPosition,
      );
      const normalizedX = (screen.x - viewport.x) / viewport.width;
      const normalizedY = (screen.y - viewport.y) / viewport.height;
      // Reserve the actual 184-design-unit nameplate width so a moving
      // competitor never leaves a clipped half-name at a portrait edge.
      // Off-screen opponents retain the existing direction arrows instead.
      const inside = normalizedX >= 0.15 && normalizedX <= 0.85 && normalizedY >= 0.04 && normalizedY <= 0.94;
      nameplate.active = inside;
      if (!inside) continue;

      const label = nameplate.getComponent(Label);
      if (label) {
        // A dangerous opponent gets the word, not just a colour: colour alone is
        // the first thing lost to a busy background or a colour-blind player.
        const isThreat = !competitor.isLocal && threatIds.has(competitor.id);
        label.string = competitor.isLocal ? '我' : isThreat ? `危险 ${competitor.name}` : competitor.name;
        label.color = competitor.isLocal ? new Color(104, 238, 104, 255)
          : isThreat ? new Color(255, 92, 92, 255)
            : new Color(255, 255, 255, 255);
        label.fontSize = competitor.isLocal ? 34 : isThreat ? 26 : 24;
        label.lineHeight = competitor.isLocal ? 38 : isThreat ? 30 : 28;
      }
      // Camera screen coordinates are expressed in the current viewport;
      // ArenaHUD is a fixed 720×1280 canvas. Normalize before mapping so the
      // labels remain aligned at all verified portrait aspect ratios.
      const baseX = (normalizedX - 0.5) * hudTransform.width;
      const baseY = (normalizedY - 0.5) * hudTransform.height + 36;
      positionedNameplates.push({ node: nameplate, x: baseX, y: baseY });
    }

    // Nameplate stacking avoidance: when multiple living competitors cluster together,
    // their nameplates can overlap. We relax overlapping nameplates along Y without hiding any.
    const MIN_NAMEPLATE_GAP_X = 140;
    const MIN_NAMEPLATE_GAP_Y = 32;
    for (let iter = 0; iter < 4; iter += 1) {
      for (let i = 0; i < positionedNameplates.length; i += 1) {
        for (let j = i + 1; j < positionedNameplates.length; j += 1) {
          const a = positionedNameplates[i];
          const b = positionedNameplates[j];
          const dx = Math.abs(a.x - b.x);
          if (dx < MIN_NAMEPLATE_GAP_X) {
            const dy = b.y - a.y;
            if (Math.abs(dy) < MIN_NAMEPLATE_GAP_Y) {
              const overlap = MIN_NAMEPLATE_GAP_Y - Math.abs(dy);
              const shift = overlap * 0.5;
              if (dy >= 0) {
                b.y += shift;
                a.y -= shift;
              } else {
                b.y -= shift;
                a.y += shift;
              }
            }
          }
        }
      }
    }

    for (const item of positionedNameplates) {
      item.node.setPosition(item.x, item.y, 0);
    }

    for (const [id, nameplate] of this.competitorNameplates) {
      if (!activeIds.has(id)) nameplate.active = false;
    }
  }

  private getOrCreateNameplate(id: string): Node {
    const existing = this.competitorNameplates.get(id);
    if (existing?.isValid) return existing;

    // New `Label` components can be active yet have no glyph material in the
    // minified Web Mobile package. Clone an editor-saved, already rendered
    // ArenaHUD label instead, retaining its Creator-owned font and glyph
    // configuration while the content and position remain live gameplay data.
    const template = this.node.getChildByName('Top1');
    if (!template) throw new Error('[ArenaHUDController] Missing serialized Top1 label template.');
    const nameplate = instantiate(template);
    nameplate.name = `ArenaCompetitorNameplate_${id}`;
    this.node.addChild(nameplate);
    const transform = nameplate.getComponent(UITransform);
    transform?.setContentSize(184, 34);
    const label = nameplate.getComponent(Label);
    if (!label) throw new Error('[ArenaHUDController] Top1 template has no serialized Label.');
    label.fontSize = 24;
    label.lineHeight = 28;
    label.enableWrapText = false;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    const outline = nameplate.getComponent(LabelOutline) || nameplate.addComponent(LabelOutline);
    outline.width = 3;
    outline.color = new Color(10, 16, 28, 255);
    this.competitorNameplates.set(id, nameplate);
    return nameplate;
  }

  /** Read-only Web Mobile evidence for the live entity labels. */
  public getNameplateDiagnostics(): ReadonlyArray<Record<string, unknown>> {
    return Array.from(this.competitorNameplates, ([id, node]) => ({
      id,
      active: node.isValid && node.activeInHierarchy,
      label: node.getComponent(Label)?.string || '',
      x: node.position.x,
      y: node.position.y,
    }));
  }

  public showAbsorbFeedback(position: Readonly<Vec3>, score: number, tier: number): void {
    const color = tier >= 3 ? new Color(255, 190, 65, 255)
      : tier === 2 ? new Color(255, 225, 95, 255)
        : new Color(255, 255, 255, 255);
    this.pickupFeedback?.emit(position, score, color);
  }

  public getPickupFeedbackDiagnostics(): PickupFeedbackDiagnostics | null {
    return this.pickupFeedback?.getDiagnostics() || null;
  }

  public getTierUpgradeDiagnostics(): TierUpgradeDiagnostics | null {
    return this.tierUpgrade?.getDiagnostics() || null;
  }

  /** Driven once per gameplay frame by HUDView; reads the FSM, never drives it. */
  public updateTierLock(objects: readonly CompressibleObject[], camera: Camera | null): void {
    this.tierLock?.update(objects, camera);
  }

  public getTierLockDiagnostics(): TierLockDiagnostics | null {
    return this.tierLock?.getDiagnostics() || null;
  }

  update(dt: number): void {
    this.pickupFeedback?.update(dt);
    this.tierUpgrade?.update(dt);
    this.updateTitleFade(dt);
  }

  private updateTitleFade(dt: number): void {
    const titleNode = this.node.getChildByName('ArenaTitle');
    if (!titleNode || !titleNode.active) return;
    this.titleElapsed += Math.max(0, dt);
    if (this.titleElapsed < TITLE_HOLD_SECONDS) return;
    const fadeProgress = Math.min(1, (this.titleElapsed - TITLE_HOLD_SECONDS) / TITLE_FADE_SECONDS);
    const opacity = titleNode.getComponent(UIOpacity) || titleNode.addComponent(UIOpacity);
    opacity.opacity = Math.round((1 - fadeProgress) * 255);
    if (fadeProgress >= 1) {
      titleNode.active = false;
    }
  }

  /**
   * The four arrow Nodes are authored and saved by Creator with the HUD.
   * This controller only decides whether each has a real off-screen opponent
   * to point toward; it never creates visual substitutes or invents targets.
   */
  private updateOffscreenBotArrows(snapshot: ArenaMatchSnapshot): void {
    const arrows = {
      Left: false,
      Right: false,
      Top: false,
      Bottom: false,
    };
    const camera = this.getGameplayCamera();
    const viewport = view.getViewportRect();
    if (camera && viewport.width > 0 && viewport.height > 0) {
      for (const competitor of snapshot.leaderboard) {
        if (competitor.isLocal || !competitor.alive) continue;
        const screen = camera.worldToScreen(
          new Vec3(competitor.position.x, 0.65, competitor.position.z),
          this.projectedBotPosition,
        );
        const inside = screen.x >= viewport.x && screen.x <= viewport.x + viewport.width
          && screen.y >= viewport.y && screen.y <= viewport.y + viewport.height;
        if (inside) continue;
        const dx = screen.x - (viewport.x + viewport.width * 0.5);
        const dy = screen.y - (viewport.y + viewport.height * 0.5);
        if (Math.abs(dx) >= Math.abs(dy)) arrows[dx < 0 ? 'Left' : 'Right'] = true;
        else arrows[dy < 0 ? 'Bottom' : 'Top'] = true;
      }
    }
    for (const side of Object.keys(arrows) as Array<keyof typeof arrows>) {
      const arrow = this.node.getChildByName(`BotArrow${side}`);
      if (arrow) arrow.active = arrows[side];
    }
  }

  private applyStatusStyle(): void {
    const statusNode = this.node.getChildByName('StatusValue');
    if (!statusNode) return;
    const label = statusNode.getComponent(Label);
    if (label) {
      label.color = new Color(255, 255, 255, 255);
      label.isBold = true;
    }
    const outline = statusNode.getComponent(LabelOutline) || statusNode.addComponent(LabelOutline);
    outline.width = 3;
    outline.color = new Color(10, 16, 28, 255);
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
