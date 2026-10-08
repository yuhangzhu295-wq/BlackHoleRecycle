/**
 * Creator-saved machine reference page.
 *
 * It exposes only live machine state, persisted unlock history and the
 * authored evolution configuration.  There is deliberately no "upgrade"
 * action here: levels are earned through the real absorption loop.
 */
import { _decorator, Button, Component, director, instantiate, Label, Node, Sprite, UITransform } from 'cc';
import { applyPageTextTokens } from './UIStyleTokens';
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
import { UIAssetLibrary } from './UIAssetLibrary';
import { colorFromToken } from './UIStyleTokens';
import { HUD_SEMANTIC } from '../core/RenderProfile';

const { ccclass } = _decorator;

/** Sliced panels narrower than the card, inset so they read as nested. */
const INNER_PANEL_NODES: readonly string[] = ['CurrentPanel', 'LevelRow1', 'LevelRow2', 'LevelRow3', 'LevelRow4', 'LevelRow5'];

/** Node name of the mounted V9 UI Kit progress bar. */
const PROGRESS_BAR_NODE = 'ProgressBar';

@ccclass('MachineInfoPageController')
export class MachineInfoPageController extends Component {
  private progressBar: Node | null = null;
  private waitingForProgressBar = false;
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.refresh();
    this.bind('BtnBack', () => eventBus.emit('MACHINE_INFO_BACK_REQUESTED'));
    this.mountProgressBar();
    this.fitToVisibleDesignSpace();
    // V9 §20/§22: this page serialises its own text colours, and several are
    // imperceptible variants of a token. Folding them here makes the token file
    // the source of the colour actually drawn. See PAGE_TEXT_DRIFT.
    applyPageTextTokens(this.node);
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) {
      button.node.off(Button.EventType.CLICK, handler, this);
    }
    this.bindings.length = 0;
  }

  private refresh(): void {
    const { level, mass } = this.machineState();
    const currentLevel = Math.max(1, Math.min(MACHINE_EVOLUTION_CONFIG.length, level));
    const current = MACHINE_EVOLUTION_CONFIG[currentLevel - 1];
    const highestLevel = Math.max(1, Math.min(MACHINE_EVOLUTION_CONFIG.length, saveService.data.machineLevel));
    const next = MACHINE_EVOLUTION_CONFIG[currentLevel] || null;

    this.setLabel('CurrentNameValue', `${current.title} · LV.${current.level}`);
    this.setLabel('CurrentMassValue', `${Math.floor(mass).toLocaleString('en-US')} kg`);
    this.setLabel('CurrentRadiusValue', `${current.suctionRadius.toFixed(1)} m`);
    this.setLabel('CurrentTierValue', `T${current.maxTier}`);
    this.setLabel('ProgressValue', next
      ? `下一等级：${Math.floor(mass).toLocaleString('en-US')} / ${next.massThreshold.toLocaleString('en-US')} kg`
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

    this.applyProgressBar();
  }

  /**
   * V9 UI Kit. Machine Info reported progression as text only (`ProgressValue`);
   * this mounts the authored UIProgressBar behind that readout so the page shows
   * a real track and fill. It also exercises the Kit in the live runtime -- a
   * prefab that is merely declared in `UIAssetLibrary` is not a shipped one.
   *
   * The bar sits behind the text rather than under it because the page has no
   * vertical room for a separate row: `ProgressValue` spans y 107..145 and
   * `LevelRow1` starts at y 95. The fill is therefore drawn translucent so the
   * readout stays legible on top of it.
   */
  private mountProgressBar(): void {
    UIAssetLibrary.ensure();
    // The prefab may already be resident, in which case the mount succeeds
    // synchronously and the bar still has to be filled -- returning here without
    // applying left the fill at the prefab's authored half-width, which is what
    // the geometry measurement caught.
    if (this.mountProgressBarNode()) {
      this.applyProgressBar();
      return;
    }
    if (this.waitingForProgressBar) return;
    this.waitingForProgressBar = true;
    UIAssetLibrary.whenReady(() => {
      this.waitingForProgressBar = false;
      if (!this.node?.isValid || !this.node.activeInHierarchy) return;
      if (!this.mountProgressBarNode()) return;
      this.applyProgressBar();
      // The new node is a child of the page, so the clamp has to see it.
      this.fitToVisibleDesignSpace();
    });
  }

  private mountProgressBarNode(): boolean {
    if (this.node.getChildByName(PROGRESS_BAR_NODE)) return true;
    const reference = this.node.getChildByName('ProgressValue');
    const prefab = UIAssetLibrary.getPrefab('progressBar');
    if (!reference || !prefab) return false;

    const bar = instantiate(prefab);
    bar.name = PROGRESS_BAR_NODE;
    bar.layer = this.node.layer;
    this.node.addChild(bar);
    // Directly behind the readout, so the page's own text renders on top.
    bar.setSiblingIndex(reference.getSiblingIndex());
    bar.setPosition(reference.position.x, reference.position.y, 0);

    // The page already renders the value; the prefab's own label would double it.
    const ownLabel = bar.getChildByName('Value');
    if (ownLabel) ownLabel.active = false;

    const fill = bar.getChildByName('Fill')?.getComponent(Sprite);
    if (fill) {
      const tint = colorFromToken(HUD_SEMANTIC.killable).clone();
      tint.a = 96;
      fill.color = tint;
    }
    this.progressBar = bar;
    return true;
  }

  /** Fill the bar to the machine's progress toward the next evolution tier. */
  private applyProgressBar(): void {
    const bar = this.progressBar;
    if (!bar?.isValid) return;
    const { level, mass } = this.machineState();
    const clampedLevel = Math.max(1, Math.min(MACHINE_EVOLUTION_CONFIG.length, level));
    const next = MACHINE_EVOLUTION_CONFIG[clampedLevel] || null;
    const ratio = next ? Math.max(0, Math.min(1, mass / next.massThreshold)) : 1;

    const track = bar.getChildByName('Track');
    const fill = bar.getChildByName('Fill');
    const trackWidth = track?.getComponent(UITransform)?.width || 0;
    const fillTransform = fill?.getComponent(UITransform);
    if (!fill || !fillTransform || !(trackWidth > 0)) return;
    const width = Math.max(2, trackWidth * ratio);
    fillTransform.setContentSize(width, fillTransform.height);
    // The fill grows from the track's left edge, so it is centred at half its
    // own width from that edge rather than anchored.
    fill.setPosition(-trackWidth / 2 + width / 2, fill.position.y, 0);
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

  /**
   * The live machine when one is in the scene, otherwise the saved progression.
   *
   * This page is an archive and it is reached from Home, where no
   * `BlackHoleMachine` exists -- so reading only the scene component made it
   * report 0 kg forever while the level rows read the save, i.e. the page
   * disagreed with itself. `machineMass` is written by `setMachineProgression`
   * during play, so the save is the correct source here.
   */
  private machineState(): { level: number; mass: number } {
    const machine = director.getScene()?.getComponentInChildren(BlackHoleMachine) || null;
    if (machine) return { level: machine.currentLevel, mass: machine.currentMass };
    return {
      level: Math.max(1, saveService.data.machineLevel || 1),
      mass: Math.max(0, saveService.data.machineMass || 0),
    };
  }

  private setLabel(name: string, value: string): void {
    const label = this.node.getChildByName(name)?.getComponent(Label) || null;
    if (label) label.string = value;
  }


}
