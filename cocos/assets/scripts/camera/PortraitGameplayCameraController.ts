import { Camera, math, Rect, ResolutionPolicy, Vec3, view } from 'cc';
import type { GameSessionState } from '../gameplay/session/GameSessionCoordinator';

export interface PortraitCameraPreset {
  readonly offset: Readonly<Vec3>;
  readonly pitchDegrees: number;
}

/**
 * Owns the mobile portrait presentation contract for the already
 * Creator-saved gameplay Camera. This is deliberately not a Component and
 * never creates a camera or a Node at runtime: a missing saved camera remains
 * a real configuration error in GameManager.
 */
export class PortraitGameplayCameraController {
  public static readonly DESIGN_WIDTH = 720;
  public static readonly DESIGN_HEIGHT = 1280;

  private readonly endlessPreset: PortraitCameraPreset = {
    offset: new Vec3(0, 20.0, 18.5),
    pitchDegrees: -42,
  };

  private readonly arenaPreset: PortraitCameraPreset = {
    offset: new Vec3(0, 44.0, 27.0),
    pitchDegrees: -55,
  };

  private readonly targetPosition = new Vec3();
  private readonly onCanvasResize = (): void => this.applyPortraitContract();

  public constructor(private readonly camera: Camera) {}

  public activate(): void {
    this.applyPortraitContract();
    view.off('canvas-resize', this.onCanvasResize, this);
    view.on('canvas-resize', this.onCanvasResize, this);
  }

  public dispose(): void {
    view.off('canvas-resize', this.onCanvasResize, this);
  }

  public applyPortraitContract(): void {
    view.setDesignResolutionSize(
      PortraitGameplayCameraController.DESIGN_WIDTH,
      PortraitGameplayCameraController.DESIGN_HEIGHT,
      ResolutionPolicy.FIXED_WIDTH,
    );

    // CameraFOVAxis.VERTICAL is value 0 in Cocos Creator 3.8.3. The project
    // declarations expose fovAxis as a native numeric Camera property.
    this.camera.fovAxis = 0;
    this.camera.fov = 44;

    const frame = view.getFrameSize();
    const targetRatio = PortraitGameplayCameraController.DESIGN_WIDTH / PortraitGameplayCameraController.DESIGN_HEIGHT;
    const frameRatio = frame.height > 0 ? frame.width / frame.height : targetRatio;
    this.camera.camera.viewport = frameRatio > targetRatio
      ? new Rect((1 - targetRatio / frameRatio) * 0.5, 0, targetRatio / frameRatio, 1)
      : new Rect(0, 0, 1, 1);
  }

  public updateFollow(playerPosition: Readonly<Vec3>, state: GameSessionState, dt: number): void {
    const preset = this.getPreset(state);
    Vec3.add(this.targetPosition, playerPosition, preset.offset);
    const current = this.camera.node.position;
    this.camera.node.setPosition(
      math.lerp(current.x, this.targetPosition.x, dt * 5.0),
      math.lerp(current.y, this.targetPosition.y, dt * 5.0),
      math.lerp(current.z, this.targetPosition.z, dt * 5.0),
    );
    this.camera.node.setRotationFromEuler(preset.pitchDegrees, 0, 0);
  }

  public getActiveOffset(state: GameSessionState): Readonly<Vec3> {
    return this.getPreset(state).offset;
  }

  public getPreset(state: GameSessionState): Readonly<PortraitCameraPreset> {
    return state === 'ARENA' || state === 'NETWORK_ARENA' || state === 'REVIVING'
      ? this.arenaPreset
      : this.endlessPreset;
  }
}
