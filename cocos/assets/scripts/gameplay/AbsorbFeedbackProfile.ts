/**
 * V7 PHASE 5 absorb-feedback profile.
 *
 * The absorption beat's *visible* scale curve. It is deliberately pure data with
 * no `cc` import, exactly like `SingularityVisualProfile`, so a contract test can
 * compile and execute it and assert the real curve rather than a regex.
 *
 * Why the curve lives here and not on the absorbed object node:
 *
 * `CompressibleObject` enters `ABSORBED`, and in the *same frame* the world calls
 * `removeAbsorbedCollectible(...)` -> `ObjectPool.release(...)` -> `recycle()`,
 * whose `RECYCLED` entry sets `node.active = false`. No frame is ever rendered
 * while the object is in `ABSORBED`, so a scale curve applied to that node would
 * be dead code. (Evidence: `InfiniteWorldManager.updateObjects` calls
 * `onAbsorb(object)` and then immediately releases the object; see lines around
 * 1542-1548.)
 *
 * The visible collapse is therefore applied to the pooled authored burst that is
 * emitted at the absorption point: the burst root scales from `startScale` to
 * `endScale` over `burstDurationSeconds`, so the effect is sucked into the hole
 * instead of blinking out. The object's own shrink already exists and is
 * unchanged: `SuctionMotionCalculator.computeMotion` drives the node from scale 1
 * down to 0.01 across the tier's `suckDuration` while the state is `SUCKING`.
 *
 * Nothing here is a gameplay value: no mass, radius, tier, suction radius,
 * collision, reward or FSM transition reads it.
 */

/** Where the burst is emitted. The object's own Y is below ground when it is absorbed. */
export interface AbsorbFeedbackProfile {
  /** Fixed pool size. Absorbing dozens of objects never allocates a new node. */
  readonly poolSize: number;
  /** How long the emitted burst lives before it is deactivated and reused. */
  readonly burstDurationSeconds: number;
  /** Authored particle lifetime, mirrored from the prefab for diagnostics. */
  readonly particleLifetimeSeconds: number;
  /** Root scale at the moment of emission. */
  readonly startScale: number;
  /** Root scale at the end of the collapse. */
  readonly endScale: number;
  /**
   * Y of the burst origin, in machine-local metres.
   *
   * `SuctionMotionCalculator` lerps the absorbed object's Y to -0.8 as it sinks,
   * so the raw object position is below the opaque ground plane at absorption and
   * a burst placed there would be depth-occluded. 0.34 clears the machine body
   * (top face y 0.0375) and the highest decorative layer (HoleRing y 0.268) at
   * every level, matching the PHASE 4 particle-plane fix.
   */
  readonly heightAboveGround: number;
}

export const ABSORB_FEEDBACK: AbsorbFeedbackProfile = {
  poolSize: 6,
  burstDurationSeconds: 0.6,
  particleLifetimeSeconds: 0.55,
  startScale: 1.0,
  endScale: 0.0,
  heightAboveGround: 0.34,
};

/**
 * Fraction of the burst spent at full scale before the collapse begins.
 *
 * The puff hangs for a beat so it is legible on a phone before it snaps in.
 * A pure ease-in from progress 0 was measured too brief to read at the gameplay
 * camera, where the whole burst is only ~10 px across.
 */
export const ABSORB_HOLD_FRACTION = 0.3;

/** Clamp any elapsed/progress value into 0..1 without importing `cc.math`. */
export function clampAbsorbProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Linear progress of one burst, from its elapsed seconds. */
export function absorbBurstProgress(elapsedSeconds: number): number {
  return clampAbsorbProgress(elapsedSeconds / ABSORB_FEEDBACK.burstDurationSeconds);
}

/**
 * The collapse curve.
 *
 * Holds at `startScale` for the first `ABSORB_HOLD_FRACTION`, then collapses with
 * a quadratic ease-in so the disappearance reads as a gulp rather than a linear
 * fade. Monotonic from `startScale` (progress 0) to `endScale` (progress 1).
 */
export function absorbBurstScale(progress: number): number {
  const t = clampAbsorbProgress(progress);
  if (t <= ABSORB_HOLD_FRACTION) return ABSORB_FEEDBACK.startScale;
  const u = (t - ABSORB_HOLD_FRACTION) / (1 - ABSORB_HOLD_FRACTION);
  const eased = u * u;
  return ABSORB_FEEDBACK.startScale + (ABSORB_FEEDBACK.endScale - ABSORB_FEEDBACK.startScale) * eased;
}
