import { CompressibleObject, ObjectMotionState } from '../gameplay/CompressibleObject';

export type DynamicVehicleState = 'DRIVE' | 'TURN' | 'ATTRACTED' | 'SUCKING' | 'ABSORBED';

/**
 * A route-driven vehicle that delegates every consumption state to the
 * ordinary CompressibleObject FSM. It never grants mass or removes itself.
 */
export class DynamicVehicle {
  public state: DynamicVehicleState = 'DRIVE';
  private direction: number = 1;

  public constructor(
    public readonly id: string,
    public readonly kind: 'sedan' | 'delivery_van' | 'garbage_truck',
    public readonly object: CompressibleObject,
    private minX: number,
    private maxX: number,
    private readonly speed: number,
  ) {}

  public update(dt: number): void {
    const objectState = this.object.getState();
    if (objectState !== 'IDLE') {
      this.state = this.fromObjectState(objectState);
      return;
    }
    const position = this.object.getPosition();
    let nextX = position.x + this.direction * this.speed * Math.max(0, dt);
    if (nextX > this.maxX || nextX < this.minX) {
      this.direction *= -1;
      nextX = Math.max(this.minX, Math.min(this.maxX, nextX));
      this.state = 'TURN';
    } else {
      this.state = 'DRIVE';
    }
    this.object.setRoutePosition(nextX, position.z, this.direction > 0 ? 90 : -90);
  }

  public applyWorldRebase(shiftX: number): void {
    this.minX -= shiftX;
    this.maxX -= shiftX;
  }

  public getSnapshot(): Record<string, unknown> {
    const position = this.object.getPosition();
    return {
      id: this.id,
      kind: this.kind,
      state: this.state,
      x: position.x,
      z: position.z,
      objectState: this.object.getState(),
    };
  }

  private fromObjectState(state: ObjectMotionState): DynamicVehicleState {
    if (state === 'ATTRACTED') return 'ATTRACTED';
    if (state === 'SUCKING') return 'SUCKING';
    return 'ABSORBED';
  }
}
