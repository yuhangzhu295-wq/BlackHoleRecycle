/**
 * 玩家触控与鼠标拖拽控制器 (PlayerController.ts)
 */
import { _decorator, Component, Node, Vec3, input, Input, EventTouch, EventMouse, Camera, geometry, director } from 'cc';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {
  @property(BlackHoleMachine)
  public machine: BlackHoleMachine | null = null;

  @property(Camera)
  public mainCamera: Camera | null = null;

  private isDragging: boolean = false;
  private groundPlane: geometry.Plane = new geometry.Plane(0, 1, 0, 0);

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
    this.isDragging = true;
    this.handleInputPosition(event.getLocation());
  }

  private onTouchMove(event: EventTouch): void {
    if (!this.isDragging) return;
    this.handleInputPosition(event.getLocation());
  }

  private onTouchEnd(): void {
    this.isDragging = false;
  }

  private onMouseDown(event: EventMouse): void {
    if (event.getButton() === 0) {
      this.isDragging = true;
      this.handleInputPosition(event.getLocation());
    }
  }

  private onMouseMove(event: EventMouse): void {
    if (!this.isDragging) return;
    this.handleInputPosition(event.getLocation());
  }

  private onMouseUp(): void {
    this.isDragging = false;
  }

  private handleInputPosition(loc: { x: number; y: number }): void {
    if (!this.machine) return;
    if (!this.mainCamera) {
      const scene = director.getScene();
      const camNode = scene?.getChildByName('Main Camera');
      if (camNode) {
        this.mainCamera = camNode.getComponent(Camera);
      }
    }

    if (this.mainCamera) {
      const ray = new geometry.Ray();
      this.mainCamera.screenPointToRay(loc.x, loc.y, ray);
      const hitDist = geometry.intersect.rayPlane(ray, this.groundPlane);
      if (hitDist > 0) {
        const hitX = ray.o.x + ray.d.x * hitDist;
        const hitZ = ray.o.z + ray.d.z * hitDist;
        this.machine.setTargetPosition(hitX, hitZ);
      }
    }
  }
}
