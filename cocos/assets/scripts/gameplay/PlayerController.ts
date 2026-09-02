/**
 * 玩家触控与拖拽控制器 (PlayerController.ts)
 */
import { _decorator, Component, input, Input, EventTouch, EventMouse, Camera, Vec2, Vec3, director, view } from 'cc';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';
import { IMovementInput, MouseJoystickInput, TouchJoystickInput } from './MovementInput';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {
  @property(BlackHoleMachine)
  public machine: BlackHoleMachine | null = null;

  @property(Camera)
  public mainCamera: Camera | null = null;

  /** The normalized device-independent movement vector, always inside [-1, 1]. */
  public readonly moveInput: Vec2 = new Vec2();
  public isDragging: boolean = false;
  public isPaused: boolean = false;
  public readonly touchInput: TouchJoystickInput = new TouchJoystickInput(92, 0.1);
  public readonly mouseInput: MouseJoystickInput = new MouseJoystickInput(92, 0.1);

  private readonly cameraForwardXZ: Vec3 = new Vec3();
  private readonly cameraRightXZ: Vec3 = new Vec3();
  private readonly movementDirection: Vec3 = new Vec3();

  onLoad(): void {
    if (!this.machine) {
      this.machine = this.getComponent(BlackHoleMachine);
    }
    if (!this.mainCamera) {
      const scene = director.getScene();
      const camNode = scene?.getChildByName('Main Camera');
      if (camNode) {
        this.mainCamera = camNode.getComponent(Camera);
      }
    }

    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);

    input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
  }

  onDestroy(): void {
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);

    input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
  }

  private onTouchStart(event: EventTouch): void {
    if (this.isPaused) return;
    const location = event.getLocation();
    if (!this.isInJoystickArea(location.x, location.y)) return;
    this.touchInput.tryBegin(event.getID(), location.x, location.y);
    this.refreshActiveState();
  }

  private onTouchMove(event: EventTouch): void {
    if (this.isPaused) return;
    const location = event.getLocation();
    this.touchInput.updateTouch(event.getID(), location.x, location.y);
    this.refreshActiveState();
  }

  private onTouchEnd(event: EventTouch): void {
    // Cocos reports the changed point in EventTouch, but in a multi-touch end
    // sequence its identifier is not the reliable source of truth for whether
    // the joystick owner remains down. Input.getAllTouches() is the engine's
    // current touch manager after the end/cancel has been applied.
    const activeTouchId = this.touchInput.activeTouchId;
    const activeTouchStillDown = activeTouchId !== null && input.getAllTouches()
      .some((touch) => touch.getID() === activeTouchId);
    if (!activeTouchStillDown && activeTouchId !== null) {
      this.touchInput.endTouch(activeTouchId);
    }
    this.refreshActiveState();
  }

  private onMouseDown(event: EventMouse): void {
    if (this.isPaused) return;
    if (event.getButton() === 0) {
      const location = event.getLocation();
      this.mouseInput.beginMouse(location.x, location.y);
      this.refreshActiveState();
    }
  }

  private onMouseMove(event: EventMouse): void {
    if (this.isPaused || !this.mouseInput.isActive || this.touchInput.isActive) return;
    const location = event.getLocation();
    this.mouseInput.updateMouse(location.x, location.y);
    this.refreshActiveState();
  }

  private onMouseUp(): void {
    this.mouseInput.endMouse();
    this.refreshActiveState();
  }

  private isInJoystickArea(x: number, y: number): boolean {
    const viewport = view.getViewportRect();
    return x >= viewport.x + viewport.width * 0.45 &&
      x <= viewport.x + viewport.width &&
      y >= viewport.y &&
      y <= viewport.y + viewport.height * 0.52;
  }

  private getActiveInput(): IMovementInput {
    return this.touchInput.isActive ? this.touchInput : this.mouseInput;
  }

  private refreshActiveState(): void {
    this.isDragging = this.touchInput.isActive || this.mouseInput.isActive;
  }

  update(): void {
    if (!this.machine || this.isPaused) {
      this.moveInput.set(0, 0);
      this.machine?.stopMovement();
      return;
    }

    if (!this.mainCamera) {
      const scene = director.getScene();
      this.mainCamera = scene?.getChildByName('Main Camera')?.getComponent(Camera) || null;
    }
    if (!this.mainCamera) return;

    const source = this.getActiveInput();
    this.moveInput.set(source.moveInput.x, source.moveInput.y);
    const magnitude = this.moveInput.length();
    if (magnitude <= 0.0001) {
      this.machine.stopMovement();
      return;
    }

    const cameraForward = this.mainCamera.node.forward;
    const cameraRight = this.mainCamera.node.right;
    this.cameraForwardXZ.set(cameraForward.x, 0, cameraForward.z).normalize();
    this.cameraRightXZ.set(cameraRight.x, 0, cameraRight.z).normalize();
    this.movementDirection.set(
      this.cameraRightXZ.x * this.moveInput.x + this.cameraForwardXZ.x * this.moveInput.y,
      0,
      this.cameraRightXZ.z * this.moveInput.x + this.cameraForwardXZ.z * this.moveInput.y,
    );
    if (this.movementDirection.lengthSqr() > 0.0001) this.movementDirection.normalize();
    this.machine.setMovementDirection(this.movementDirection, Math.min(1, magnitude));
  }
}
