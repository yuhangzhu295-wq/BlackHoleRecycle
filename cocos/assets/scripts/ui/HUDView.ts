/**
 * 极简核心玩法 HUD (HUDView.ts)
 * 严格遵循第一阶段规则：仅包含 质量/进度、机器等级、金币、暂停、单个磁暴技能按键
 */
import { _decorator, Component, Label, Button, Node } from 'cc';
import { eventBus } from '../core/EventBus';

const { ccclass, property } = _decorator;

@ccclass('HUDView')
export class HUDView extends Component {
  @property(Label)
  public massLabel: Label | null = null;

  @property(Label)
  public levelLabel: Label | null = null;

  @property(Label)
  public coinsLabel: Label | null = null;

  @property(Button)
  public pauseButton: Button | null = null;

  @property(Button)
  public magnetStormButton: Button | null = null;

  public updateStats(mass: number, level: number, levelTitle: string, coins: number): void {
    if (this.massLabel) {
      this.massLabel.string = `质量: ${Math.round(mass)} kg`;
    }
    if (this.levelLabel) {
      this.levelLabel.string = `LV.${level} ${levelTitle}`;
    }
    if (this.coinsLabel) {
      this.coinsLabel.string = `🪙 ${coins}`;
    }
  }

  public onMagnetStormClicked(): void {
    eventBus.emit('UI_TRIGGER_MAGNET_STORM');
  }

  public onPauseClicked(): void {
    eventBus.emit('UI_TRIGGER_PAUSE');
  }
}
