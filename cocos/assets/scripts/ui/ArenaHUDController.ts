/** Editor-saved arena HUD bindings. All values originate from ArenaMatchManager. */
import { _decorator, Button, Camera, Color, Component, director, instantiate, Label, LabelOutline, Node, UITransform, Vec3, view } from 'cc';
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
  private readonly projectedBotPosition: Vec3 = new Vec3();
  /**
   * Live world-to-HUD nameplates. These never own competitor state: each
   * string and screen position is refreshed from ArenaMatchSnapshot so the
   * portrait arena remains legible without static or invented opponent data.
   */
  private readonly competitorNameplates = new Map<string, Node>();

  onEnable(): void {
    this.bind('BtnPause', () => eventBus.emit('UI_TRIGGER_PAUSE'));
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) button.node.off(Button.EventType.CLICK, handler, this);
    this.bindings.length = 0;
    for (const nameplate of this.competitorNameplates.values()) nameplate.destroy();
    this.competitorNameplates.clear();
  }

  public updateMatch(snapshot: ArenaMatchSnapshot): void {
    this.setLabel('TimerValue', formatClock(snapshot.remainingSeconds));
    this.setLabel('RankValue', `第 ${snapshot.localRank || '-'} / ${snapshot.competitorCount}`);
    this.setLabel('MassValue', `${Math.round(snapshot.localMass)} kg`);
    this.setLabel('KillValue', `${snapshot.localKills}`);
    const warmup = Math.max(0, snapshot.combatWarmupRemainingSeconds);
    this.setLabel('StatusValue', warmup > 0
      ? `安全准备 ${Math.ceil(warmup)}s`
      : snapshot.localAlive
        ? `吞噬 ${snapshot.localConsumed} · ${snapshot.localRespawnSeconds > 0 ? '重生中' : '战斗中'}`
        : `重生 ${snapshot.localRespawnSeconds.toFixed(1)}s`);
    snapshot.leaderboard.slice(0, 5).forEach((entry, index) => {
      const prefix = entry.isLocal ? '你' : entry.name;
      const life = entry.alive ? '' : ' · 重生';
      this.setLabel(`Top${index + 1}`, `${index + 1}. ${prefix}  ${entry.mass}kg${life}`);
    });
    this.updateOffscreenBotArrows(snapshot);
    this.updateCompetitorNameplates(snapshot);
  }

  /**
   * Keep the real local player and every living arena opponent visually tied
   * to their gameplay authority. This is intentionally UI-only: the labels
   * cannot change movement, pickup, mass, collision, combat, or ranking.
   */
  private updateCompetitorNameplates(snapshot: ArenaMatchSnapshot): void {
    const camera = director.getScene()?.getComponentInChildren(Camera) || null;
    const viewport = view.getViewportRect();
    const hudTransform = this.node.getComponent(UITransform) || null;
    if (!camera || !hudTransform || viewport.width <= 0 || viewport.height <= 0) return;

    const activeIds = new Set<string>();
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
        label.string = competitor.isLocal ? '我' : competitor.name;
        label.color = competitor.isLocal ? new Color(104, 238, 104, 255) : new Color(255, 255, 255, 255);
        label.fontSize = competitor.isLocal ? 34 : 24;
        label.lineHeight = competitor.isLocal ? 38 : 28;
      }
      // Camera screen coordinates are expressed in the current viewport;
      // ArenaHUD is a fixed 720×1280 canvas. Normalize before mapping so the
      // labels remain aligned at all verified portrait aspect ratios.
      nameplate.setPosition(
        (normalizedX - 0.5) * hudTransform.width,
        (normalizedY - 0.5) * hudTransform.height + 36,
        0,
      );
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
    const camera = director.getScene()?.getComponentInChildren(Camera) || null;
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
