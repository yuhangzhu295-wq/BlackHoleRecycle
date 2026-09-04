/**
 * Creator-saved machine reference page.
 *
 * It exposes only live machine state, persisted unlock history and the
 * authored evolution configuration.  There is deliberately no "upgrade"
 * action here: levels are earned through the real absorption loop.
 */
import { _decorator, Button, Component, director, Label, Node } from 'cc';
import { eventBus } from '../core/EventBus';
import { MACHINE_EVOLUTION_CONFIG } from '../data/GameConfig';
import { saveService } from '../data/SaveService';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';

const { ccclass } = _decorator;

@ccclass('MachineInfoPageController')
export class MachineInfoPageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.refresh();
    this.bind('BtnBack', () => eventBus.emit('MACHINE_INFO_BACK_REQUESTED'));
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) {
      button.node.off(Button.EventType.CLICK, handler, this);
    }
    this.bindings.length = 0;
  }

  private refresh(): void {
    const machine = director.getScene()?.getComponentInChildren(BlackHoleMachine) || null;
    const currentLevel = Math.max(1, Math.min(MACHINE_EVOLUTION_CONFIG.length, machine?.currentLevel || 1));
    const current = machine?.currentConfig || MACHINE_EVOLUTION_CONFIG[currentLevel - 1];
    const highestLevel = Math.max(1, Math.min(MACHINE_EVOLUTION_CONFIG.length, saveService.data.machineLevel));
    const next = MACHINE_EVOLUTION_CONFIG[currentLevel] || null;

    this.setLabel('CurrentNameValue', `${current.title} · LV.${current.level}`);
    this.setLabel('CurrentMassValue', `${Math.floor(machine?.currentMass || 0).toLocaleString('en-US')} kg`);
    this.setLabel('CurrentRadiusValue', `${current.suctionRadius.toFixed(1)} m`);
    this.setLabel('CurrentTierValue', `T${current.maxTier}`);
    this.setLabel('ProgressValue', next
      ? `下一等级：${Math.floor(machine?.currentMass || 0).toLocaleString('en-US')} / ${next.massThreshold.toLocaleString('en-US')} kg`
      : '已到达最高等级');

    for (const config of MACHINE_EVOLUTION_CONFIG) {
      const isCurrent = config.level === currentLevel;
      const isUnlocked = config.level <= highestLevel;
      const state = isCurrent ? '当前使用' : isUnlocked ? '已解锁' : config.level === highestLevel + 1 ? '下一目标' : '未解锁';
      this.setLabel(
        `LevelRowText${config.level}`,
        `LV.${config.level}  ${config.title}  ·  ${config.suctionRadius.toFixed(1)}m / T${config.maxTier}  ·  ${state}`,
      );
    }
  }

  private bind(name: string, handler: () => void): void {
    const button = this.node.getChildByName(name)?.getComponent(Button) || null;
    if (!button) {
      console.error(`[MachineInfoPageController] Missing serialized Button: ${name}`);
      return;
    }
    button.node.on(Button.EventType.CLICK, handler, this);
    this.bindings.push([button, handler]);
  }

  private setLabel(name: string, value: string): void {
    const label = this.node.getChildByName(name)?.getComponent(Label) || null;
    if (label) label.string = value;
  }
}
