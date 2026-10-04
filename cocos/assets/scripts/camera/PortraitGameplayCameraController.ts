import { Camera, math, Rect, ResolutionPolicy, Vec3, view } from 'cc';
import { CAMERA_PROFILE } from '../core/RenderProfile';
import { PLAYER_FEEL_CONFIG } from '../data/GameConfig';
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
  public static readonly DESIGN_WIDTH = CAMERA_PROFILE.designWidth;
  public static readonly DESIGN_HEIGHT = CAMERA_PROFILE.designHeight;

  private currentLevel: number = 1;

  private readonly endlessPreset: PortraitCameraPreset = {
    offset: CAMERA_PROFILE.endless.offset.clone(),
    pitchDegrees: CAMERA_PROFILE.endless.pitchDegrees,
  };

  private readonly endlessLevelPresets: readonly PortraitCameraPreset[] =
    CAMERA_PROFILE.endless.levelOffsets.map((offset) => ({
      offset: offset.clone(),
      pitchDegrees: CAMERA_PROFILE.endless.pitchDegrees,
    }));

  private readonly arenaPreset: PortraitCameraPreset = {
    offset: CAMERA_PROFILE.arena.offset.clone(),
    pitchDegrees: CAMERA_PROFILE.arena.pitchDegrees,
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

  public setLevel(level: number): void {
    if (Number.isFinite(level)) {
      this.currentLevel = Math.max(1, Math.min(5, Math.floor(level)));
    }
  }

  public getCurrentLevel(): number {
    return this.currentLevel;
  }

  public applyPortraitContract(): void {
    view.setDesignResolutionSize(
      PortraitGameplayCameraController.DESIGN_WIDTH,
      PortraitGameplayCameraController.DESIGN_HEIGHT,
      ResolutionPolicy.FIXED_WIDTH,
    );

    // CameraFOVAxis.VERTICAL is value 0 in Cocos Creator 3.8.3. The project
    // declarations expose fovAxis as a native numeric Camera property. Both
    // values come from the shared V6 render profile so the saved scene and the
    // runtime framing cannot drift apart unnoticed.
    this.camera.fovAxis = CAMERA_PROFILE.fovAxis;
    this.camera.fov = CAMERA_PROFILE.fov;

    const frame = view.getFrameSize();
    const targetRatio = PortraitGameplayCameraController.DESIGN_WIDTH / PortraitGameplayCameraController.DESIGN_HEIGHT;
    const frameRatio = frame.height > 0 ? frame.width / frame.height : targetRatio;
    this.camera.camera.viewport = frameRatio > targetRatio
      ? new Rect((1 - targetRatio / frameRatio) * 0.5, 0, targetRatio / frameRatio, 1)
      : new Rect(0, 0, 1, 1);
  }

  public updateFollow(playerPosition: Readonly<Vec3>, state: GameSessionState, dt: number, level?: number): void {
    if (level !== undefined && Number.isFinite(level)) {
      this.currentLevel = Math.max(1, Math.min(5, Math.floor(level)));
    }
    const preset = this.getPreset(state, this.currentLevel);
    Vec3.add(this.targetPosition, playerPosition, preset.offset);
    const current = this.camera.node.position;
    const factor = Math.min(1.0, dt * PLAYER_FEEL_CONFIG.cameraFollowSharpness);
    this.camera.node.setPosition(
      math.lerp(current.x, this.targetPosition.x, factor),
      math.lerp(current.y, this.targetPosition.y, factor),
      math.lerp(current.z, this.targetPosition.z, factor),
    );
    this.camera.node.setRotationFromEuler(preset.pitchDegrees, 0, 0);
  }

  public getActiveOffset(state: GameSessionState, level?: number): Readonly<Vec3> {
    return this.getPreset(state, level).offset;
  }

  public getPreset(state: GameSessionState, level?: number): Readonly<PortraitCameraPreset> {
    if (state === 'ARENA' || state === 'NETWORK_ARENA' || state === 'REVIVING') {
      return this.arenaPreset;
    }
    const targetLevel = Math.max(1, Math.min(5, Math.floor(level ?? this.currentLevel)));
    return this.endlessLevelPresets[targetLevel - 1] || this.endlessPreset;
  }

  public getTargetPosition(): Readonly<Vec3> {
    return this.targetPosition;
  }

  public getOffsetError(): { x: number; y: number; z: number; distance: number } {
    const current = this.camera.node.position;
    const dx = current.x - this.targetPosition.x;
    const dy = current.y - this.targetPosition.y;
    const dz = current.z - this.targetPosition.z;
    return {
      x: dx,
      y: dy,
      z: dz,
      distance: Math.sqrt(dx * dx + dy * dy + dz * dz),
    };
  }
}
