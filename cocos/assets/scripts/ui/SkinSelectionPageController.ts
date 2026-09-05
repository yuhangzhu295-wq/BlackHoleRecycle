/**
 * Creator-saved skin selection page.
 *
 * All cards and Buttons are authored in Game.scene. This controller only
 * reads saved ownership, renders the corresponding state, and forwards a
 * player's actual tap to GameManager; it never grants currency or unlocks a
 * cosmetic by itself.
 */
import { _decorator, Button, Color, Component, Label, Node, Sprite } from 'cc';
import { eventBus } from '../core/EventBus';
import { SKINS_CONFIG } from '../data/GameConfig';
import { saveService } from '../data/SaveService';

const { ccclass } = _decorator;

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
