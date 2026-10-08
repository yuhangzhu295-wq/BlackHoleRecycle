/**
 * Creator-saved machine reference page.
 *
 * It exposes only live machine state, persisted unlock history and the
 * authored evolution configuration.  There is deliberately no "upgrade"
 * action here: levels are earned through the real absorption loop.
 */
import { _decorator, Button, Component, director, Label, Node } from 'cc';
import {
  INNER_PANEL_INSET_DESIGN_PX,
  fitSlicedPanelToSafeSpan,
  pagePanelHalfWidth,
  trackPanelNarrowing,
} from './PageSafeArea';
import { eventBus } from '../core/EventBus';
import { MACHINE_EVOLUTION_CONFIG } from '../data/GameConfig';
import { saveService } from '../data/SaveService';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';

const { ccclass } = _decorator;

/** Sliced panels narrower than the card, inset so they read as nested. */
const INNER_PANEL_NODES: readonly string[] = ['CurrentPanel', 'LevelRow1', 'LevelRow2', 'LevelRow3', 'LevelRow4', 'LevelRow5'];

@ccclass('MachineInfoPageController')
export class MachineInfoPageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.refresh();
    this.bind('BtnBack', () => eventBus.emit('MACHINE_INFO_BACK_REQUESTED'));
    this.fitToVisibleDesignSpace();
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

  /**
   * Fit the authored 720-wide composition into the design space the UI camera
   * actually shows: `1280 / aspect` wide, not the 720 `view.getVisibleSize()`
   * reports. No-op on 9:16, where the reference composition already fits.
   *
   * MachineCard is 660 design px wide against the 576.3 design px a 20:9 phone
   * shows, so 29.9 screen px of it is off each edge and its rounded border is
   * cropped. It and the five LevelRows (564) are all SLICED, so narrowing them is
   * lossless and leaves their height -- and the page's vertical composition --
   * untouched. The rows take an inner inset so they still read as sitting inside
   * the card rather than flush with it.
   *
   * Everything else is 500 design px or narrower (MachineRibbon 500, BtnBack 390),
   * so it stays inside the narrowed card unaided. The row captions are
   * `Label.Overflow.NONE` and therefore auto-sized; they measure 467 design px at
   * runtime, which still fits a 485 px row.
   */
  private fitToVisibleDesignSpace(): void {
    const panelHalfWidth = pagePanelHalfWidth(this.node);
    const card = fitSlicedPanelToSafeSpan(this.node.getChildByName('MachineCard'), panelHalfWidth);
    for (const panelName of INNER_PANEL_NODES) {
      fitSlicedPanelToSafeSpan(
        this.node.getChildByName(panelName), panelHalfWidth, INNER_PANEL_INSET_DESIGN_PX);
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
