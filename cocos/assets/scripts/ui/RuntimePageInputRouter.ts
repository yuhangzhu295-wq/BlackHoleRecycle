/**
 * Fallback hit routing for editor-saved full-screen portrait pages. The normal
 * Cocos Button path remains primary; this handles the Canvas target when a
 * browser forwards a touch before the nested Button target resolves.
 */
import { _decorator, Component, EventTouch, Node, UITransform, Vec2, view } from 'cc';
import { eventBus } from '../core/EventBus';

const { ccclass } = _decorator;

export interface RuntimePageInputDiagnostic {
  targetName: string | null;
  touchX: number;
  touchY: number;
  uiTouchX: number;
  uiTouchY: number;
  action: 'NONE' | 'HOME_START' | 'HOME_MODE' | 'HOME_SKIN' | 'HOME_MACHINE' | 'MACHINE_BACK' | 'MODE_BACK' | 'MODE_ARENA' | 'MODE_ENDLESS'
    | 'PAUSE' | 'RESUME' | 'SETTLE' | 'HOME' | 'RESTART' | 'REVIVE' | 'GIVE_UP';
}

@ccclass('RuntimePageInputRouter')
export class RuntimePageInputRouter extends Component {
  /** Read-only data consumed by the Cocos runtime acceptance bridge. */
  public lastInputDiagnostic: RuntimePageInputDiagnostic = {
    targetName: null, touchX: 0, touchY: 0, uiTouchX: 0, uiTouchY: 0, action: 'NONE',
  };

  onEnable(): void {
    // Capture precedes Cocos' target-phase Button hit test. Use the saved
    // visual rectangle first so full-height mobile canvas events remain
    // reliable even when the browser targets Canvas.
    this.node.on(Node.EventType.TOUCH_END, this.onCanvasTouchEnd, this, true);
  }

  onDisable(): void {
    this.node.off(Node.EventType.TOUCH_END, this.onCanvasTouchEnd, this, true);
  }

  private onCanvasTouchEnd(event: EventTouch): void {
    // Cocos can target an active page root instead of Canvas even when its
    // child Button visual is under the touch. Route by the current visible page
    // and editor-saved Button transform, never by event.target identity. The
    // page transitions below are spatially disjoint, so a native Button click
    // cannot toggle the same action twice.

    const location = event.getLocation();
    const uiLocation = event.getUILocation();
    this.lastInputDiagnostic = {
      targetName: (event.target as Node | null)?.name || null,
      touchX: location.x,
      touchY: location.y,
      uiTouchX: uiLocation.x,
      uiTouchY: uiLocation.y,
      action: 'NONE',
    };

    // Home and mode pages use the same Canvas/SHOW_ALL transform as the
    // runtime overlays. On a mobile browser their visible Button can receive
    // Canvas as the native target, so route the actual touched serialized
    // rect before considering in-game controls.
    if (this.hitVisibleButton('HomePage', 'BtnStart', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'HOME_START';
      eventBus.emit('HOME_START_REQUESTED');
      return;
    }
    if (this.hitVisibleButton('HomePage', 'BtnMode', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'HOME_MODE';
      eventBus.emit('HOME_MODE_REQUESTED');
      return;
    }
    if (this.hitVisibleButton('HomePage', 'BtnSkin', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'HOME_SKIN';
      eventBus.emit('HOME_SKIN_REQUESTED');
      return;
    }
    if (this.hitVisibleButton('HomePage', 'BtnMachine', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'HOME_MACHINE';
      eventBus.emit('HOME_MACHINE_REQUESTED');
      return;
    }
    if (this.hitVisibleButton('MachineInfoPage', 'BtnBack', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'MACHINE_BACK';
      eventBus.emit('MACHINE_INFO_BACK_REQUESTED');
      return;
    }
    if (this.hitVisibleButton('ModeSelectPage', 'BtnBack', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'MODE_BACK';
      eventBus.emit('MODE_BACK_REQUESTED');
      return;
    }
    if (this.hitVisibleButton('ModeSelectPage', 'BtnArena', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'MODE_ARENA';
      eventBus.emit('MODE_ARENA_REQUESTED');
      return;
    }
    if (this.hitVisibleButton('ModeSelectPage', 'BtnEndless', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'MODE_ENDLESS';
      eventBus.emit('MODE_ENDLESS_REQUESTED');
      return;
    }

    if (this.hitVisibleButton('EndlessHUD', 'BtnPause', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'PAUSE';
      eventBus.emit('UI_TRIGGER_PAUSE');
      return;
    }
    if (this.hitVisibleButton('ArenaHUD', 'BtnPause', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'PAUSE';
      eventBus.emit('UI_TRIGGER_PAUSE');
      return;
    }

    if (this.hitVisibleButton('RevivePage', 'BtnRevive', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'REVIVE';
      eventBus.emit('ARENA_REVIVE_REQUESTED');
      return;
    }
    if (this.hitVisibleButton('RevivePage', 'BtnGiveUp', event)) {
      event.propagationStopped = true;
      this.lastInputDiagnostic.action = 'GIVE_UP';
      eventBus.emit('ARENA_GIVE_UP_REQUESTED');
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
      eventBus.emit('GAME_RESTART_CURRENT');
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
    // Home page controls are deliberately grouped under SafeAreaRoot so they
    // stay inside notch/inset bounds. Runtime pages keep their controls at the
    // page root. Resolve both editor-saved layouts without fabricating a
    // replacement Button or relying on an unrelated Canvas event target.
    const button = page?.getChildByName(buttonName)
      || page?.getChildByName('SafeAreaRoot')?.getChildByName(buttonName);
    const transform = button?.getComponent(UITransform);
    if (!button?.activeInHierarchy || !transform) return false;

    const viewport = view.getViewportRect();
    const visible = view.getVisibleSize();
    if (viewport.width <= 0 || viewport.height <= 0 || visible.width <= 0 || visible.height <= 0) {
      return false;
    }
    // EventTouch.getLocation is viewport-local with a bottom-left origin.
    // Convert it to the actual visible Canvas space, rather than the 9:16
    // nominal design size. FIXED_WIDTH deliberately makes this taller on
    // modern phones and `UITransform.isHit` operates in that visible space.
    const location = event.getLocation();
    return transform.isHit(new Vec2(
      (location.x / viewport.width) * visible.width,
      (location.y / viewport.height) * visible.height,
    ));
  }
}
