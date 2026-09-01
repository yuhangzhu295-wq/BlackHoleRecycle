/**
 * 玩家触控与拖拽控制器 (PlayerController.ts)
 */
import { _decorator, Component, Node, Vec3, input, Input, EventTouch, EventMouse, Camera, geometry, director, view } from 'cc';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {
  @property(BlackHoleMachine)
  public machine: BlackHoleMachine | null = null;

  @property(Camera)
  public mainCamera: Camera | null = null;

  public isDragging: boolean = false;
  public isPaused: boolean = false;
  private groundPlane: geometry.Plane = new geometry.Plane(0, 1, 0, 0);
  private dragStartLocation: { x: number; y: number } | null = null;
  private dragAnchorPosition: Vec3 = new Vec3();
  private readonly portraitDragDistance = 22.0;

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
    this.isDragging = this.beginDrag(event.getLocation());
  }

  private onTouchMove(event: EventTouch): void {
    if (this.isPaused || !this.isDragging) return;
    this.updateDrag(event.getLocation());
  }

  private onTouchEnd(): void {
    this.isDragging = false;
    this.dragStartLocation = null;
  }

  private onMouseDown(event: EventMouse): void {
    if (this.isPaused) return;
    if (event.getButton() === 0) {
      this.isDragging = this.beginDrag(event.getLocation());
    }
  }

  private onMouseMove(event: EventMouse): void {
    if (this.isPaused || !this.isDragging) return;
    this.updateDrag(event.getLocation());
  }

  private onMouseUp(): void {
    this.isDragging = false;
    this.dragStartLocation = null;
  }

  private beginDrag(loc: { x: number; y: number }): boolean {
    if (this.isPaused) return false;
    if (!this.machine) return false;

    // SHOW_ALL creates left/right letterbox bars when a desktop frame is wider
    // than 9:16. Inputs originating in those bars must not steer the machine.
    const viewport = view.getViewportRect();
    const isInsideGameViewport =
      loc.x >= viewport.x && loc.x <= viewport.x + viewport.width &&
      loc.y >= viewport.y && loc.y <= viewport.y + viewport.height;
    if (!isInsideGameViewport) return false;

    if (!this.mainCamera) {
      const scene = director.getScene();
      const camNode = scene?.getChildByName('Main Camera');
      if (camNode) {
        this.mainCamera = camNode.getComponent(Camera);
      }
    }

    if (!this.mainCamera) return false;

    // Keep a real camera-to-ground ray check so black bars, a rotated frame or
    // an invalid camera cannot produce a movement command.
    const ray = new geometry.Ray();
    this.mainCamera.screenPointToRay(loc.x, loc.y, ray);
    if (geometry.intersect.rayPlane(ray, this.groundPlane) <= 0) return false;

    this.dragStartLocation = { x: loc.x, y: loc.y };
    const machinePosition = this.machine.node.position;
    this.dragAnchorPosition.set(machinePosition.x, 0, machinePosition.z);
    return true;
  }

  /**
   * Portrait controls are delta-driven rather than absolute-ground driven.
   * This keeps a drag toward the bottom of a tall phone moving backwards from
   * the player, even while the follow camera has advanced since touch start.
   */
  private updateDrag(loc: { x: number; y: number }): void {
    if (!this.machine || !this.mainCamera || !this.dragStartLocation) return;

    const viewport = view.getViewportRect();
    const isInsideGameViewport =
      loc.x >= viewport.x && loc.x <= viewport.x + viewport.width &&
      loc.y >= viewport.y && loc.y <= viewport.y + viewport.height;
    if (!isInsideGameViewport) return;

    const ray = new geometry.Ray();
    this.mainCamera.screenPointToRay(loc.x, loc.y, ray);
    if (geometry.intersect.rayPlane(ray, this.groundPlane) <= 0) return;

    const dragX = (loc.x - this.dragStartLocation.x) / Math.max(1, viewport.width);
    const dragY = (loc.y - this.dragStartLocation.y) / Math.max(1, viewport.height);
    const cameraRight = this.mainCamera.node.right;
    const cameraForward = this.mainCamera.node.forward;

    this.machine.setTargetPosition(
      this.dragAnchorPosition.x + (cameraRight.x * dragX - cameraForward.x * dragY) * this.portraitDragDistance,
      this.dragAnchorPosition.z + (cameraRight.z * dragX - cameraForward.z * dragY) * this.portraitDragDistance
    );
  }
}
