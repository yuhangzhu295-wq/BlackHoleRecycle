import { Vec3 } from 'cc';
import { CompressibleObject, ObjectMotionState } from '../gameplay/CompressibleObject';

export type DynamicVehicleState = 'DRIVE' | 'TURN' | 'ATTRACTED' | 'SUCKING' | 'ABSORBED';

/** A point on an authored district-road loop in render-world coordinates. */
export interface RoadRoutePoint {
  x: number;
  z: number;
}

const ROUTE_EPSILON = 0.01;

/**
 * A route-driven vehicle that delegates every consumption state to the
 * ordinary CompressibleObject FSM. It never grants mass or removes itself.
 *
 * The route is deliberately stored in render coordinates: InfiniteWorldManager
 * applies the same origin rebase to both the object and these waypoints, so a
 * vehicle cannot jump back to a stale logical position after a long journey.
 */
export class DynamicVehicle {
  public state: DynamicVehicleState = 'DRIVE';
  private readonly route: RoadRoutePoint[];
  private nextRoutePoint: number = 1;
  private headingDegrees: number = 0;
  private turnCount: number = 0;

  public constructor(
    public readonly id: string,
    public readonly kind: 'sedan' | 'delivery_van' | 'garbage_truck',
    public readonly object: CompressibleObject,
    route: readonly RoadRoutePoint[],
    private readonly speed: number,
  ) {
    if (route.length < 4) {
      throw new Error(`[DynamicVehicle] ${id} needs a closed road loop with at least four points.`);
    }
    this.route = route.map((point) => ({ x: point.x, z: point.z }));
    const position = object.getPosition();
    const closestIndex = this.closestRoutePoint(position);
    this.nextRoutePoint = (closestIndex + 1) % this.route.length;
    this.headingDegrees = this.headingTo(position.x, position.z, this.route[this.nextRoutePoint]);
    // The pooled CompressibleObject remains the sole authority for mass and
    // absorption. This only supplies a vehicle-specific visual spin when that
    // real state machine transitions into ATTRACTED/SUCKING.
    this.object.setSuctionSpin(this.kind === 'sedan' ? 300 : this.kind === 'delivery_van' ? 240 : 190);
    this.object.setRoutePosition(position.x, position.z, this.headingDegrees);
  }

  public update(dt: number): void {
    const objectState = this.object.getState();
    if (objectState !== 'IDLE') {
      this.state = this.fromObjectState(objectState);
      return;
    }

    let x = this.object.getPosition().x;
    let z = this.object.getPosition().z;
    let remainingDistance = this.speed * Math.max(0, dt);
    let turnedThisFrame = false;

    // A low frame rate can cross a corner. Consume the residual movement on
    // the following road segment rather than stopping or teleporting.
    while (remainingDistance > ROUTE_EPSILON) {
      const target = this.route[this.nextRoutePoint];
      const dx = target.x - x;
      const dz = target.z - z;
      const distance = Math.hypot(dx, dz);
      if (distance <= ROUTE_EPSILON) {
        this.advanceRoutePoint();
        turnedThisFrame = true;
        continue;
      }
      const travel = Math.min(remainingDistance, distance);
      x += (dx / distance) * travel;
      z += (dz / distance) * travel;
      remainingDistance -= travel;
      if (travel >= distance - ROUTE_EPSILON) {
        this.advanceRoutePoint();
        turnedThisFrame = true;
      }
    }

    this.headingDegrees = this.headingTo(x, z, this.route[this.nextRoutePoint]);
    this.object.setRoutePosition(x, z, this.headingDegrees);
    this.state = turnedThisFrame ? 'TURN' : 'DRIVE';
  }

  public applyWorldRebase(shift: Readonly<Vec3>): void {
    this.route.forEach((point) => {
      point.x -= shift.x;
      point.z -= shift.z;
    });
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
      routeLength: this.route.length,
      nextRoutePoint: this.nextRoutePoint,
      headingDegrees: this.headingDegrees,
      turnCount: this.turnCount,
    };
  }

  private closestRoutePoint(position: Readonly<Vec3>): number {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    this.route.forEach((point, index) => {
      const distance = Math.hypot(point.x - position.x, point.z - position.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  }

  private advanceRoutePoint(): void {
    this.nextRoutePoint = (this.nextRoutePoint + 1) % this.route.length;
    this.turnCount++;
  }

  private headingTo(x: number, z: number, target: Readonly<RoadRoutePoint>): number {
    return Math.atan2(target.x - x, target.z - z) * 180 / Math.PI;
  }

  private fromObjectState(state: ObjectMotionState): DynamicVehicleState {
    if (state === 'ATTRACTED') return 'ATTRACTED';
    if (state === 'SUCKING') return 'SUCKING';
    return 'ABSORBED';
  }
}
