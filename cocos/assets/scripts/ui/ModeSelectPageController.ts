/**
 * 编辑器保存的 V2 模式选择页交互。
 * 竞技模式在真实竞技业务完成前保持禁用，避免用占位逻辑冒充可玩模式。
 */
import { _decorator, Button, Component, Label } from 'cc';
import { eventBus } from '../core/EventBus';
import { saveService } from '../data/SaveService';

const { ccclass } = _decorator;

@ccclass('ModeSelectPageController')
export class ModeSelectPageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.disableArenaUntilImplemented();
    this.refreshProfile();
    this.bind('BtnBack', () => eventBus.emit('MODE_BACK_REQUESTED'));
    this.bind('BtnEndless', () => eventBus.emit('MODE_ENDLESS_REQUESTED'));
  }

  onDisable(): void {
    for (const [button, handler] of this.bindings) {
      button.node.off(Button.EventType.CLICK, handler, this);
    }
    this.bindings.length = 0;
  }

  private bind(name: string, handler: () => void): void {
    const button = this.node.getChildByName(name)?.getComponent(Button);
    if (!button) {
      console.error(`[ModeSelectPageController] Missing serialized Button: ${name}`);
      return;
    }
    button.node.on(Button.EventType.CLICK, handler, this);
    this.bindings.push([button, handler]);
  }

  private disableArenaUntilImplemented(): void {
    const arena = this.node.getChildByName('BtnArena');
    const button = arena?.getComponent(Button);
    if (button) button.interactable = false;
  }

  private refreshProfile(): void {
    const bestLabel = this.node.getChildByName('EndlessBestValue')?.getComponent(Label);
    if (bestLabel) bestLabel.string = Math.max(0, Math.floor(saveService.data.highScore)).toLocaleString('en-US');
  }
}
