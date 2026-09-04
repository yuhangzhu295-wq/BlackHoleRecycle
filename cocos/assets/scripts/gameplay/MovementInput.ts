import { Vec2, math } from 'cc';

/** A normalized, device-independent movement source. */
export interface IMovementInput {
  readonly moveInput: Readonly<Vec2>;
  readonly isActive: boolean;
  reset(): void;
}

abstract class JoystickMovementInput implements IMovementInput {
  public readonly moveInput: Vec2 = new Vec2();
  public isActive: boolean = false;

  protected anchorX: number = 0;
  protected anchorY: number = 0;

  public constructor(
    private readonly maximumRadius: number = 92,
    private readonly deadZone: number = 0.1,
  ) {}

  public begin(x: number, y: number): void {
    this.anchorX = x;
    this.anchorY = y;
    this.isActive = true;
    this.moveInput.set(0, 0);
  }

  public update(x: number, y: number): void {
    if (!this.isActive) return;

    const dx = x - this.anchorX;
    const dy = y - this.anchorY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const normalizedMagnitude = math.clamp01(distance / this.maximumRadius);
    if (normalizedMagnitude <= this.deadZone || distance <= 0.0001) {
      this.moveInput.set(0, 0);
      return;
    }

    const remappedMagnitude = (normalizedMagnitude - this.deadZone) / (1 - this.deadZone);
    this.moveInput.set(dx / distance * remappedMagnitude, dy / distance * remappedMagnitude);
  }

  public reset(): void {
    this.isActive = false;
    this.moveInput.set(0, 0);
  }
}

/** The only source allowed to own a live touch pointer for the movement joystick. */
export class TouchJoystickInput extends JoystickMovementInput {
  public activeTouchId: number | null = null;

  public tryBegin(touchId: number | null, x: number, y: number): boolean {
    if (touchId === null || this.activeTouchId !== null) return false;
    this.activeTouchId = touchId;
    this.begin(x, y);
    return true;
  }

  public updateTouch(touchId: number | null, x: number, y: number): void {
    if (touchId === null || touchId !== this.activeTouchId) return;
    this.update(x, y);
  }

  public endTouch(touchId: number | null): void {
    if (touchId === null || touchId !== this.activeTouchId) return;
    this.activeTouchId = null;
    this.reset();
  }

  public override reset(): void {
    this.activeTouchId = null;
    super.reset();
  }
}

/** Mouse uses the same fixed-radius joystick behavior for desktop testing. */
export class MouseJoystickInput extends JoystickMovementInput {
  public beginMouse(x: number, y: number): void {
    this.begin(x, y);
  }

  public updateMouse(x: number, y: number): void {
    this.update(x, y);
  }

  public endMouse(): void {
    this.reset();
  }
}

/** Runtime bot adapter; the world/AI layer supplies normalized desired steering. */
export class BotMovementInput implements IMovementInput {
  public readonly moveInput: Vec2 = new Vec2();
  public isActive: boolean = false;

  public setMoveInput(x: number, y: number): void {
    const magnitude = Math.sqrt(x * x + y * y);
    if (magnitude <= 0.0001) {
      this.reset();
      return;
    }
    const scale = Math.min(1, magnitude) / magnitude;
    this.moveInput.set(x * scale, y * scale);
    this.isActive = true;
  }

  public reset(): void {
    this.moveInput.set(0, 0);
    this.isActive = false;
  }
}

/**
 * Adapter for an authoritative remote-player input stream.
 *
 * This intentionally does not inherit the bot adapter: a networked player
 * may only move from a newer server-approved sample.  Keeping the sequence
 * guard here prevents an out-of-order WebSocket/Colyseus packet from reviving
 * an old direction after the client has already received a release sample.
 */
export class NetworkMovementInput implements IMovementInput {
  public readonly moveInput: Vec2 = new Vec2();
  public isActive: boolean = false;
  private latestSequence: number = -1;

  public applyAuthoritativeInput(sequence: number, x: number, y: number, active: boolean): boolean {
    if (!Number.isFinite(sequence) || sequence <= this.latestSequence) return false;
    this.latestSequence = sequence;

    if (!active || !Number.isFinite(x) || !Number.isFinite(y)) {
      this.moveInput.set(0, 0);
      this.isActive = false;
      return true;
    }

    const magnitude = Math.sqrt(x * x + y * y);
    if (magnitude <= 0.0001) {
      this.moveInput.set(0, 0);
      this.isActive = false;
      return true;
    }

    const scale = Math.min(1, magnitude) / magnitude;
    this.moveInput.set(x * scale, y * scale);
    this.isActive = true;
    return true;
  }

  public reset(): void {
    this.moveInput.set(0, 0);
    this.isActive = false;
  }
}
