/** 编辑器保存的暂停页交互。 */
import { _decorator, Button, Component } from 'cc';
import { eventBus } from '../core/EventBus';

const { ccclass } = _decorator;

@ccclass('PausePageController')
export class PausePageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.bind('BtnResume', () => eventBus.emit('UI_TRIGGER_PAUSE'));
    this.bind('BtnSettle', () => eventBus.emit('GAME_TRIGGER_SETTLEMENT'));
    this.bind('BtnHome', () => eventBus.emit('GAME_RETURN_HOME'));
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
      console.error(`[PausePageController] Missing serialized ${name}.`);
      return;
    }
    button.node.on(Button.EventType.CLICK, handler, this);
    this.bindings.push([button, handler]);
  }
}
