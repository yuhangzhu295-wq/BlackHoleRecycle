/**
 * 编辑器保存的 V2 模式选择页交互。
 * Arena is enabled only after its actual eight-competitor match manager has
 * been installed in the Creator-saved scene.
 */
import { _decorator, Button, Component, Label } from 'cc';
import { eventBus } from '../core/EventBus';
import { saveService } from '../data/SaveService';

const { ccclass } = _decorator;

@ccclass('ModeSelectPageController')
export class ModeSelectPageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.refreshProfile();
    this.bind('BtnBack', () => eventBus.emit('MODE_BACK_REQUESTED'));
    this.bind('BtnArena', () => eventBus.emit('MODE_ARENA_REQUESTED'));
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

  private refreshProfile(): void {
    const bestLabel = this.node.getChildByName('EndlessBestValue')?.getComponent(Label);
    if (bestLabel) bestLabel.string = Math.max(0, Math.floor(saveService.data.highScore)).toLocaleString('en-US');
  }
}
