/**
 * Fallback hit routing for editor-saved full-screen pages in a letterboxed
 * browser viewport.  The normal Cocos Button path remains the primary path;
 * this only handles a touch whose native event target is Canvas because the
 * engine did not hit a visible Button after SHOW_ALL scaling.
 */
import { _decorator, Component, EventTouch, Node, UITransform, Vec2, view } from 'cc';
import { eventBus } from '../core/EventBus';

const { ccclass } = _decorator;

export interface RuntimePageInputDiagnostic {
  targetName: string | null;
  touchX: number;
  touchY: number;
  action: 'NONE' | 'PAUSE' | 'RESUME' | 'SETTLE' | 'HOME' | 'RESTART';
}

@ccclass('RuntimePageInputRouter')
export class RuntimePageInputRouter extends Component {
  /** Read-only data consumed by the Cocos runtime acceptance bridge. */
  public lastInputDiagnostic: RuntimePageInputDiagnostic = {
    targetName: null, touchX: 0, touchY: 0, action: 'NONE',
  };

  onEnable(): void {
    // Capture precedes Cocos' target-phase Button hit test. This is required
    // when SHOW_ALL makes a Button's native hit rectangle diverge from its
    // rendered position: use the editor-saved visual rect first.
    this.node.on(Node.EventType.TOUCH_END, this.onCanvasTouchEnd, this, true);
  }

  onDisable(): void {
    this.node.off(Node.EventType.TOUCH_END, this.onCanvasTouchEnd, this, true);
  }

  private onCanvasTouchEnd(event: EventTouch): void {
    // In a letterboxed browser viewport Cocos may target an active page root
    // instead of Canvas even when its child Button visual is under the touch.
    // Route by the current visible page and the editor-saved Button transform,
    // never by event.target identity. The page transitions below are spatially
    // disjoint, so a native Button click cannot toggle the same action twice.

    const location = event.getLocation();
    this.lastInputDiagnostic = {
      targetName: (event.target as Node | null)?.name || null,
      touchX: location.x,
      touchY: location.y,
      action: 'NONE',
    };

    if (this.hitVisibleButton('EndlessHUD', 'BtnPause', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'PAUSE';
      eventBus.emit('UI_TRIGGER_PAUSE');
      return;
    }

    if (this.hitVisibleButton('PausePage', 'BtnResume', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'RESUME';
      eventBus.emit('UI_TRIGGER_PAUSE');
      return;
    }
    if (this.hitVisibleButton('PausePage', 'BtnSettle', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'SETTLE';
      eventBus.emit('GAME_TRIGGER_SETTLEMENT');
      return;
    }
    if (this.hitVisibleButton('PausePage', 'BtnHome', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'HOME';
      eventBus.emit('GAME_RETURN_HOME');
      return;
    }

    if (this.hitVisibleButton('SettlementPage', 'BtnRestart', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'RESTART';
      eventBus.emit('GAME_START_ENDLESS');
      return;
    }
    if (this.hitVisibleButton('SettlementPage', 'BtnHome', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'HOME';
      eventBus.emit('GAME_RETURN_HOME');
    }
  }

  private hitVisibleButton(pageName: string, buttonName: string, event: EventTouch): boolean {
    const page = this.node.getChildByName(pageName);
    const button = page?.getChildByName(buttonName);
    const transform = button?.getComponent(UITransform);
    if (!button?.activeInHierarchy || !transform) return false;

    const viewport = view.getViewportRect();
    const design = view.getDesignResolutionSize();
    if (viewport.width <= 0 || viewport.height <= 0 || design.width <= 0 || design.height <= 0) {
      return false;
    }

    // EventTouch is expressed in the actual browser viewport, with a
    // bottom-left origin. Canvas UI lives in the portrait design space.
    const location = event.getLocation();
    const designPoint = new Vec2(
      (location.x / viewport.width) * design.width,
      (location.y / viewport.height) * design.height
    );
    return transform.isHit(designPoint);
  }
}
