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

  private domContainer: HTMLDivElement | null = null;
  private domMassText: HTMLSpanElement | null = null;
  private domLevelText: HTMLSpanElement | null = null;
  private domCoinsText: HTMLSpanElement | null = null;

  onLoad(): void {
    this.ensureVisibleHUD();
  }

  private ensureVisibleHUD(): void {
    // 若在浏览器 / Web 环境中运行且未在场景中手动拖拽 Label，创建极简原生 Web HUD 浮层保障第一画面绝对可见
    if (typeof document !== 'undefined') {
      let hudRoot = document.getElementById('cocos-runtime-hud') as HTMLDivElement;
      if (!hudRoot) {
        hudRoot = document.createElement('div');
        hudRoot.id = 'cocos-runtime-hud';
        hudRoot.style.position = 'fixed';
        hudRoot.style.top = '0';
        hudRoot.style.left = '0';
        hudRoot.style.width = '100vw';
        hudRoot.style.pointerEvents = 'none';
        hudRoot.style.display = 'flex';
        hudRoot.style.flexDirection = 'column';
        hudRoot.style.zIndex = '999999';
        hudRoot.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        hudRoot.style.padding = '16px';
        hudRoot.style.boxSizing = 'border-box';

        const topBar = document.createElement('div');
        topBar.style.display = 'flex';
        topBar.style.justifyContent = 'space-between';
        topBar.style.alignItems = 'center';
        topBar.style.width = '100%';

        // 左侧等级与质量
        const leftBox = document.createElement('div');
        leftBox.style.background = 'rgba(15, 23, 42, 0.75)';
        leftBox.style.backdropFilter = 'blur(8px)';
        leftBox.style.padding = '8px 14px';
        leftBox.style.borderRadius = '12px';
        leftBox.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        leftBox.style.color = '#ffffff';

        this.domLevelText = document.createElement('div');
        this.domLevelText.style.fontSize = '14px';
        this.domLevelText.style.fontWeight = 'bold';
        this.domLevelText.style.color = '#38bdf8';
        this.domLevelText.innerText = 'LV.1 回收小车';

        this.domMassText = document.createElement('div');
        this.domMassText.style.fontSize = '13px';
        this.domMassText.style.color = '#94a3b8';
        this.domMassText.innerText = '质量: 0 / 900 kg';

        leftBox.appendChild(this.domLevelText);
        leftBox.appendChild(this.domMassText);

        // 右侧金币与暂停
        const rightBox = document.createElement('div');
        rightBox.style.display = 'flex';
        rightBox.style.alignItems = 'center';
        rightBox.style.gap = '8px';

        const coinsPill = document.createElement('div');
        coinsPill.style.background = 'rgba(15, 23, 42, 0.75)';
        coinsPill.style.backdropFilter = 'blur(8px)';
        coinsPill.style.padding = '8px 14px';
        coinsPill.style.borderRadius = '12px';
        coinsPill.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        coinsPill.style.color = '#fbbf24';
        coinsPill.style.fontWeight = 'bold';
        coinsPill.style.fontSize = '14px';
        coinsPill.innerText = '🪙 0';
        this.domCoinsText = coinsPill;

        rightBox.appendChild(coinsPill);

        topBar.appendChild(leftBox);
        topBar.appendChild(rightBox);
        hudRoot.appendChild(topBar);

        document.body.appendChild(hudRoot);
        this.domContainer = hudRoot;
      }
    }
  }

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

    // 更新 Web DOM HUD
    if (this.domLevelText) {
      this.domLevelText.innerText = `LV.${level} ${levelTitle}`;
    }
    if (this.domMassText) {
      this.domMassText.innerText = `质量: ${Math.round(mass)} kg`;
    }
    if (this.domCoinsText) {
      this.domCoinsText.innerText = `🪙 ${coins}`;
    }
  }

  public onMagnetStormClicked(): void {
    eventBus.emit('UI_TRIGGER_MAGNET_STORM');
  }

  public onPauseClicked(): void {
    eventBus.emit('UI_TRIGGER_PAUSE');
  }
}
