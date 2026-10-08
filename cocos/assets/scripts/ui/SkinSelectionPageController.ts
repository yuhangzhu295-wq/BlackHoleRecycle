/**
 * Creator-saved skin selection page.
 *
 * All cards and Buttons are authored in Game.scene. This controller only
 * reads saved ownership, renders the corresponding state, and forwards a
 * player's actual tap to GameManager; it never grants currency or unlocks a
 * cosmetic by itself.
 */
import { _decorator, Button, Color, Component, Label, Node, Sprite } from 'cc';
import { applyPageTextTokens } from './UIStyleTokens';
import {
  INNER_PANEL_INSET_DESIGN_PX,
  fitSlicedPanelToSafeSpan,
  pagePanelHalfWidth,
  trackPanelNarrowing,
} from './PageSafeArea';
import { eventBus } from '../core/EventBus';
import { SKINS_CONFIG } from '../data/GameConfig';
import { saveService } from '../data/SaveService';

const { ccclass } = _decorator;

/** Sliced panels narrower than the card, inset so they read as nested. */
const INNER_PANEL_NODES: readonly string[] = ['PreviewPanel', 'SkinCard_1', 'SkinCard_2', 'SkinCard_3', 'SkinCard_4', 'SkinCard_5'];

@ccclass('SkinSelectionPageController')
export class SkinSelectionPageController extends Component {
  private bindings: Array<[Button, () => void]> = [];
  private removeSkinChangedListener: (() => void) | null = null;
  private removeStatusListener: (() => void) | null = null;

  onEnable(): void {
    this.refresh();
    this.bind('BtnBack', () => eventBus.emit('SKIN_PAGE_BACK_REQUESTED'));
    SKINS_CONFIG.forEach((skin, index) => {
      this.bind(`BtnSkin_${index + 1}`, () => eventBus.emit('SKIN_PAGE_SELECT_REQUESTED', skin.id));
    });
    this.removeSkinChangedListener = eventBus.on('HOME_SKIN_CHANGED', this.refresh, this);
    this.removeStatusListener = eventBus.on('SKIN_PAGE_STATUS', this.showStatus, this);
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
    this.removeSkinChangedListener?.();
    this.removeSkinChangedListener = null;
    this.removeStatusListener?.();
    this.removeStatusListener = null;
  }

  private refresh(): void {
    const selected = SKINS_CONFIG.find((entry) => entry.id === saveService.data.currentSkinId) || SKINS_CONFIG[0];
    this.setLabel('CoinValue', Math.max(0, Math.floor(saveService.data.coins)).toLocaleString('en-US'));
    this.setLabel('PreviewNameValue', selected?.name || '紫晶奇点');
    this.setLabel('PreviewDescriptionValue', selected?.description || '当前装备的引力核心');
    const preview = this.node.getChildByName('PreviewBlackHole')?.getComponent(Sprite) || null;
    if (preview && selected) {
      const tint = new Color();
      Color.fromHEX(tint, selected.rimColor);
      preview.color = tint;
    }

    SKINS_CONFIG.forEach((skin, index) => {
      const cardIndex = index + 1;
      const isOwned = skin.unlocked || saveService.data.unlockedSkins.includes(skin.id);
      const isSelected = selected?.id === skin.id;
      this.setLabel(`SkinName_${cardIndex}`, skin.name);
      // Per-card long descriptions made the portrait list visually collide at
      // narrow aspect ratios. The selected item's full description remains in
      // the dedicated preview panel; cards retain only a truthful ownership
      // state and their title.
      this.setLabel(`SkinDescription_${cardIndex}`, '');
      this.setLabel(`SkinState_${cardIndex}`, isSelected ? '已装备' : isOwned ? '点击使用' : `解锁 ${skin.price.toLocaleString('en-US')} 金币`);
      const button = this.node.getChildByName(`BtnSkin_${cardIndex}`)?.getComponent(Button) || null;
      if (button) button.interactable = true;
      const panel = this.node.getChildByName(`SkinCard_${cardIndex}`)?.getComponent(Sprite) || null;
      if (panel) panel.color = isSelected
        ? new Color(229, 215, 255, 255)
        : isOwned
          ? new Color(242, 250, 244, 255)
          : new Color(246, 242, 235, 255);
    });
  }

  private showStatus(message: unknown): void {
    this.setLabel('StatusValue', typeof message === 'string' ? message : '请选择一个皮肤');
    this.refresh();
  }

  /**
   * Fit the authored 720-wide composition into the design space the UI camera
   * actually shows: `1280 / aspect` wide, not the 720 `view.getVisibleSize()`
   * reports. No-op on 9:16, where the reference composition already fits.
   *
   * SkinPageCard is 660 design px wide against the 576.3 design px a 20:9 phone
   * shows, so 29.9 screen px of it is off each edge and its rounded border is
   * cropped. It, PreviewPanel and the five SkinCards are all SLICED, so narrowing
   * them is lossless and leaves the page's vertical composition untouched.
   *
   * Every label on the page is 323 design px or narrower at runtime, so it still
   * fits the narrowed panels; SkinRibbon (430) stays inside the 509 px card.
   */
  private fitToVisibleDesignSpace(): void {
    const panelHalfWidth = pagePanelHalfWidth(this.node);
    const card = fitSlicedPanelToSafeSpan(this.node.getChildByName('SkinPageCard'), panelHalfWidth);
    for (const panelName of INNER_PANEL_NODES) {
      fitSlicedPanelToSafeSpan(
        this.node.getChildByName(panelName), panelHalfWidth, INNER_PANEL_INSET_DESIGN_PX);
    }
  }

  private bind(name: string, handler: () => void): void {
    const button = this.node.getChildByName(name)?.getComponent(Button) || null;
    if (!button) {
      console.error(`[SkinSelectionPageController] Missing serialized Button: ${name}`);
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
