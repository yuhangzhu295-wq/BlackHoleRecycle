/** 编辑器保存的暂停页交互。 */
import { _decorator, Button, Component } from 'cc';
import { fitSlicedPanelToSafeSpan, pageSafeHalfWidth } from './PageSafeArea';
import { eventBus } from '../core/EventBus';

const { ccclass } = _decorator;

@ccclass('PausePageController')
export class PausePageController extends Component {
  private bindings: Array<[Button, () => void]> = [];

  onEnable(): void {
    this.bind('BtnResume', () => eventBus.emit('UI_TRIGGER_PAUSE'));
    this.bind('BtnSettle', () => eventBus.emit('GAME_TRIGGER_SETTLEMENT'));
    this.bind('BtnHome', () => eventBus.emit('GAME_RETURN_HOME'));
    // The panel is authored 620 design px wide against the 576.3 design px a
    // 20:9 phone shows, so 15.6 screen px of it is off each edge and its
    // rounded border is cropped. Sliced, so narrowing is lossless.
    fitSlicedPanelToSafeSpan(this.node.getChildByName('PauseCard'), pageSafeHalfWidth(this.node));
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
