/**
 * V7 PHASE 4: the singularity's authored-look profile.
 *
 * Everything the singularity's *appearance* varies with lives here as data:
 * the vortex layer geometry, the level-driven glow palette and the suction /
 * devour response curves. `BlackHoleMachine` consumes these; nothing in this
 * file touches suction radius, mass, tiers, collision or the FSM.
 *
 * Two properties matter and are deliberate:
 *
 *   1. **It is pure.** No `cc` import, no engine type, no side effect. That is
 *      what makes the whole visual contract unit-testable without a renderer,
 *      and it is why the numbers below can be asserted directly instead of
 *      being inferred from a screenshot.
 *
 *   2. **The level palette is the project's existing level data.** Levels
 *      already declare `baseColor` / `rimColor` in `MACHINE_EVOLUTION_CONFIG`;
 *      until now nothing read them for the singularity, so LV1..LV5 looked
 *      almost identical on the core itself. The colours are passed in rather
 *      than re-typed here, so the level definition stays in one place.
 *
 * ## The rotation finding
 *
 * PHASE 2 left the per-frame Euler rotation intact, and the brief asks to
 * verify it still works. It does run, but it was **not visible**: every layer
 * is a torus lying in the XZ plane (`cocos/primitive/torus.ts` line 71-73:
 * `y = tube * sin(v)`), so it is rotationally symmetric about the Y axis it was
 * being spun around. Rotating a torus about its own symmetry axis maps it onto
 * itself — the animation changed the node's Euler angles and nothing on screen.
 * The five layers were also nearly coplanar (y 0.105-0.125), which is why the
 * brief's "flat discs" description is accurate.
 *
 * The fix is geometric and data-driven: tilt each layer off its own axis so the
 * Y spin *precesses* it (visible motion), give the layers opposite spin
 * directions so they read as counter-rotating streams, and spread them
 * vertically into a funnel. `VORTEX_LAYERS` below is that declaration.
 */

/** One rotating layer of the vortex. */
export interface SingularityVortexLayer {
  /** Node name, matching the structure `BlackHoleMachine` builds. */
  readonly name: string;
  /** Height above the core origin, in metres (pre-`funnelSpread`). */
  readonly y: number;
  /** X tilt in degrees. Non-zero is what makes the Y spin visible. */
  readonly tiltX: number;
  /** Z tilt in degrees. */
  readonly tiltZ: number;
  /** Base angular speed in degrees per second about Y. */
  readonly spinDegPerSec: number;
  /** +1 / -1 so adjacent layers counter-rotate into a vortex. */
  readonly direction: 1 | -1;
}

/**
 * The five decorative layers, ordered inner to outer.
 *
 * The rim (`HoleRing`) is deliberately left flat and slow: it is the stable
 * horizon the eye reads the vortex against, and a wobbling rim would read as a
 * broken outline. The four inner layers carry the tilt and the counter-rotation.
 */
export const VORTEX_LAYERS: readonly SingularityVortexLayer[] = [
  { name: 'InnerSwirl', y: 0.100, tiltX: 16, tiltZ: 10, spinDegPerSec: 90, direction: 1 },
  { name: 'MidSwirl', y: 0.145, tiltX: -20, tiltZ: -22, spinDegPerSec: 72, direction: -1 },
  { name: 'OuterSwirl', y: 0.190, tiltX: 24, tiltZ: 18, spinDegPerSec: 55, direction: -1 },
  { name: 'ShimmerSwirl', y: 0.235, tiltX: -28, tiltZ: 34, spinDegPerSec: 38, direction: 1 },
  { name: 'HoleRing', y: 0.268, tiltX: 0, tiltZ: 0, spinDegPerSec: 18, direction: 1 },
];

/**
 * The authored node names that animate every frame and therefore must never be
 * merged into the gated silhouette. `BlackHoleMachine.getAnimatedDecorationNodes`
 * resolves these names to the live nodes; keeping the list here means the
 * animation code and the measurement exclusion cannot drift apart.
 *
 * `RimEnergy` is the PHASE 4 authored glow ring. It is included because it
 * spins and pulses with the rim, which is exactly the "frame-animated
 * decoration" the exclusion exists for.
 */
export const ANIMATED_DECORATION_NODE_NAMES: readonly string[] = [
  'InnerSwirl', 'MidSwirl', 'OuterSwirl', 'ShimmerSwirl', 'HoleRing', 'RimEnergy',
];

/** The level-derived inputs the profile needs. Passed in, never re-typed. */
export interface SingularityLevelInput {
  readonly level: number;
  /** `MACHINE_EVOLUTION_CONFIG[level-1].baseColor`. */
  readonly baseColor: string;
  /** `MACHINE_EVOLUTION_CONFIG[level-1].rimColor`. */
  readonly rimColor: string;
}

/** The resolved per-level look, plus the response curve values for that level. */
export interface SingularityLevelVisuals {
  readonly level: number;
  /** Additive rim-energy tint (authored material instance). */
  readonly rimEnergyColor: string;
  /** Suction particle tint. */
  readonly particleColor: string;
  /** Hue applied to the rim torus and the shimmer glint. */
  readonly rimColor: string;
  /** Particles per second at full suction. Zero load always emits zero. */
  readonly particleRate: number;
  /** Multiplies every layer's angular speed. */
  readonly spinMultiplier: number;
  /** Multiplies the layer height spread, deepening the funnel. */
  readonly funnelSpread: number;
  /** Multiplies the authored rim-energy scale. */
  readonly energyScale: number;
}

/**
 * The per-level response curve. Index 0 is LV1.
 *
 * These are appearance-only magnitudes. Higher levels spin faster, pull harder
 * on the eye, and deepen the funnel; none of them is read back into gameplay.
 *
 * `particleRate` was raised after a real capture: at the gameplay camera 1 m is
 * about 32 screen pixels, so the original 12/s at a 5.5 cm particle drew ~2 px
 * sparks that were not legible on a phone. The rate and the prefab's
 * `startSize` were both raised together — a rate alone would only have made
 * more invisible dots.
 */
const LEVEL_RESPONSE = [
  { spinMultiplier: 1.00, particleRate: 18, funnelSpread: 1.00, energyScale: 1.00 },
  { spinMultiplier: 1.15, particleRate: 23, funnelSpread: 1.08, energyScale: 1.06 },
  { spinMultiplier: 1.30, particleRate: 28, funnelSpread: 1.16, energyScale: 1.12 },
  { spinMultiplier: 1.48, particleRate: 34, funnelSpread: 1.24, energyScale: 1.18 },
  { spinMultiplier: 1.70, particleRate: 40, funnelSpread: 1.32, energyScale: 1.25 },
] as const;

/** Clamp a level number to the 1..5 range the game defines. */
export function normalizeSingularityLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(LEVEL_RESPONSE.length, Math.max(1, Math.round(level)));
}

/**
 * How long a devour pulse takes to decay back to rest, in seconds.
 *
 * A devour pulse is raised once per real absorption, so the response is driven
 * by an actual gameplay event rather than by a timer that happens to correlate
 * with eating.
 */
export const DEVOUR_PULSE_SECONDS = 0.45;

/** Advance a devour pulse by one frame. */
export function decayDevourPulse(pulse: number, dt: number): number {
  if (!Number.isFinite(pulse) || pulse <= 0) return 0;
  return Math.max(0, pulse - dt / DEVOUR_PULSE_SECONDS);
}

/** Resolve the level's full look. The level palette comes from the caller. */
export function getSingularityLevelVisuals(input: SingularityLevelInput): SingularityLevelVisuals {
  const level = normalizeSingularityLevel(input.level);
  const response = LEVEL_RESPONSE[level - 1];
  // The rim hue is the level's own rim colour. It is what makes LV1..LV5
  // visibly different on the core instead of only on the upgrade modules.
  const rim = input.rimColor || input.baseColor;
  return {
    level,
    rimColor: rim,
    rimEnergyColor: rim,
    particleColor: rim,
    particleRate: response.particleRate,
    spinMultiplier: response.spinMultiplier,
    funnelSpread: response.funnelSpread,
    energyScale: response.energyScale,
  };
}

/** The layer's height above the core origin for a given funnel spread. */
export function vortexLayerHeight(layer: SingularityVortexLayer, funnelSpread: number): number {
  return layer.y * funnelSpread;
}

/**
 * The angle this layer advances by in one frame, in degrees.
 *
 * The caller accumulates the result rather than recomputing `elapsed * speed`:
 * a multiplier that changes at level-up would otherwise snap every layer to a
 * new absolute angle in a single frame. Accumulating the *step* keeps the
 * speed change smooth.
 */
export function vortexLayerAngularStep(
  layer: SingularityVortexLayer,
  spinMultiplier: number,
  suctionFeedback: number,
  dt: number,
): number {
  const load = clamp01(suctionFeedback);
  // The vortex visibly accelerates while the machine is eating.
  return layer.spinDegPerSec * spinMultiplier * (1 + load * 0.6) * dt;
}

/**
 * The layer's Euler angles for a given accumulated spin angle.
 *
 * `x`/`z` are the static tilt that makes the Y spin visible. Without them the
 * layer would spin about its own symmetry axis and produce no visible change at
 * all (see the file header).
 */
export function vortexLayerEuler(
  layer: SingularityVortexLayer,
  spinAngle: number,
): { readonly x: number; readonly y: number; readonly z: number } {
  return {
    x: layer.tiltX,
    y: layer.direction * spinAngle,
    z: layer.tiltZ,
  };
}

/**
 * Emission rate in particles per second.
 *
 * Zero when nothing is being sucked, which is the brief's "must be silent when
 * nothing is being sucked": an idle singularity emits no new particles at all,
 * and the ones already alive simply finish their lifetime.
 */
export function singularitySuctionEmission(
  visuals: SingularityLevelVisuals,
  suctionFeedback: number,
  devourPulse: number,
): number {
  const load = clamp01(suctionFeedback);
  const pulse = clamp01(devourPulse);
  if (load <= 0 && pulse <= 0) return 0;
  return visuals.particleRate * (0.2 + 0.8 * load) + visuals.particleRate * 1.5 * pulse;
}

/**
 * The scale multiplier applied to the *decorative* layers while the machine is
 * absorbing.
 *
 * It is intentionally never applied to `AbyssBase` / `HoleInner`: those are the
 * structural body the gated `playerWidthRatio` silhouette is measured from, so
 * scaling them would move a camera-framing gate with a gameplay event. The
 * decoration layers are excluded from that measurement by
 * `getAnimatedDecorationNodes`, which is what makes this response free.
 */
export function singularityDevourScale(suctionFeedback: number, devourPulse: number): number {
  const load = clamp01(suctionFeedback);
  const pulse = clamp01(devourPulse);
  return 1 + load * 0.10 + pulse * 0.16;
}

/** The rim energy's own pulse: slow breathing at rest, a swell under load. */
export function singularityRimEnergyScale(
  visuals: SingularityLevelVisuals,
  elapsed: number,
  suctionFeedback: number,
  devourPulse: number,
): number {
  const load = clamp01(suctionFeedback);
  const pulse = clamp01(devourPulse);
  const breathing = Math.sin(elapsed * 1.8) * 0.015;
  return visuals.energyScale * (1 + breathing + load * 0.10 + pulse * 0.34);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
