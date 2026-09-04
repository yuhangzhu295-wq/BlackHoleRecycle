/** Editor-saved arena HUD bindings. All values originate from ArenaMatchManager. */
import { _decorator, Button, Camera, Component, director, Label, Vec3, view } from 'cc';
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
    this.updateOffscreenBotArrows(snapshot);
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
