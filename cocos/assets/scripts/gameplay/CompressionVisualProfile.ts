/**
 * V7 PHASE 5 resource-drop profile.
 *
 * `CompressionSystem.spawnResourceBlock()` spawns the real resource block after a
 * compression. Before this phase the block appeared at a fixed local point and
 * was then translated in a straight line, which read as "it is just there".
 *
 * This module is the authored eject/drop curve: a real arc that pops out of the
 * eject port, travels forward, spins and overshoots into its final scale. It is
 * pure data with no `cc` import (the same shape as `SingularityVisualProfile` and
 * `AbsorbFeedbackProfile`), so a contract test executes the curve instead of
 * pattern-matching the source.
 *
 * The eject *window* is unchanged: `CompressionSystem` still spends
 * `durationSeconds` (0.45 s, exactly the previous literal) in `EJECTING` before
 * moving to `COLLECTING`, so the runtime state chain, the reward timing and the
 * acceptance assertions are untouched. Only the path and the scale curve differ.
 *
 * The machine level still drives the feel: the height and forward travel are
 * scaled by the live `compressionEjectSpeed`, so LV1..LV5 keep their distinct
 * ejection feedback (`LEVEL_SPECIFIC_COMPRESSION_FEEDBACK`).
 */

export interface ResourceDropProfile {
  /** Eject window in seconds. Must stay equal to the previous hardcoded 0.45. */
  readonly durationSeconds: number;
  /** Peak pop height above the eject port, in metres, at the reference speed. */
  readonly launchHeight: number;
  /** Forward travel into the rear compartment at the reference speed. */
  readonly forwardDistance: number;
  /** Total spin across the eject. */
  readonly spinDegrees: number;
  /** Scale the block starts at, so it grows out of the port instead of popping in. */
  readonly startScale: number;
  /** Scale it settles at, which is the block's displayed size. */
  readonly endScale: number;
  /** `easeOutBack` overshoot constant, for a springy settle. */
  readonly overshoot: number;
  /** The `compressionEjectSpeed` this profile's distances were authored against. */
  readonly referenceEjectSpeed: number;
}

export const RESOURCE_DROP: ResourceDropProfile = {
  durationSeconds: 0.45,
  launchHeight: 0.55,
  forwardDistance: 0.9,
  spinDegrees: 220,
  startScale: 0.05,
  endScale: 1.0,
  overshoot: 1.70158,
  referenceEjectSpeed: 1.4,
};

export function clampDropProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Level-driven distance scale. Never zero, so a bad config cannot freeze the block. */
function speedScale(ejectSpeed: number): number {
  const safe = Number.isFinite(ejectSpeed) && ejectSpeed > 0 ? ejectSpeed : RESOURCE_DROP.referenceEjectSpeed;
  return Math.max(0.25, safe / RESOURCE_DROP.referenceEjectSpeed);
}

/**
 * Vertical offset over the eject. A half-sine pops the block up and brings it
 * back down to the port plane by the end of the window.
 */
export function resourceDropHeight(progress: number, ejectSpeed: number = RESOURCE_DROP.referenceEjectSpeed): number {
  const t = clampDropProgress(progress);
  return Math.sin(Math.PI * t) * RESOURCE_DROP.launchHeight * speedScale(ejectSpeed);
}

/** Forward offset over the eject. */
export function resourceDropForward(progress: number, ejectSpeed: number = RESOURCE_DROP.referenceEjectSpeed): number {
  const t = clampDropProgress(progress);
  return RESOURCE_DROP.forwardDistance * t * speedScale(ejectSpeed);
}

/** `easeOutBack`: springs past 1 then settles exactly on 1 at progress 1. */
function easeOutBack(t: number): number {
  const c1 = RESOURCE_DROP.overshoot;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/** Block scale over the eject, from `startScale` to `endScale` with a springy overshoot. */
export function resourceDropScale(progress: number): number {
  const t = clampDropProgress(progress);
  return RESOURCE_DROP.startScale + (RESOURCE_DROP.endScale - RESOURCE_DROP.startScale) * easeOutBack(t);
}

/** Yaw in degrees over the eject. */
export function resourceDropYaw(progress: number): number {
  return RESOURCE_DROP.spinDegrees * clampDropProgress(progress);
}
