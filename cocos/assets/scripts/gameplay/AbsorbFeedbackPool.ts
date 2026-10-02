/**
 * V7 PHASE 5: the pooled runtime host for the authored absorb burst.
 *
 * The brief asks for a real vanish effect at the absorption point, driven by the
 * real absorb event (`GameManager.onObjectAbsorbed`) and *bounded*, so absorbing
 * dozens of objects neither leaks nodes nor tanks the frame rate.
 *
 * Design:
 *
 *   1. **Authored.** The burst is `game_art/prefabs/blackhole/AbsorbBurst.prefab`,
 *      a real `cc.ParticleSystem` over the authored `MAT_BLACKHOLE_PARTICLE`
 *      material and the Default-Particle texture. Nothing here builds geometry.
 *
 *   2. **Pooled and bounded.** `ABSORB_FEEDBACK.poolSize` nodes are created once
 *      and round-robined. Emitting never allocates; a reused slot is reset with
 *      `stop()` (which clears live particles) and then `play()`. The live node
 *      count is therefore a constant, no matter how many absorptions happen.
 *
 *   3. **Visible collapse.** The slot's root is scaled by `absorbBurstScale`
 *      over the burst's life, so the burst is pulled into the hole instead of
 *      blinking out. See `AbsorbFeedbackProfile` for why this curve is applied
 *      to the effect rather than to the pooled object node.
 *
 *   4. **Degrades, never breaks.** Missing/malformed asset or an unresolved
 *      material leaves the effect absent after a bounded retry, exactly like
 *      `SingularityEffects`. A missing burst must never stop play.
 *
 * Nothing here is a gameplay authority: it reads a world position and writes
 * only to its own effect nodes.
 */
import { instantiate, Node, ParticleSystem, Vec3 } from 'cc';
import { ArtLoader } from '../core/ArtLoader';
import {
  ABSORB_FEEDBACK,
  absorbBurstProgress,
  absorbBurstScale,
} from './AbsorbFeedbackProfile';

/** Bounded adoption retries, mirroring `SingularityEffects` / `ArtLoader`. */
const MAX_ADOPT_ATTEMPTS = 60;

interface BurstSlot {
  readonly root: Node;
  readonly system: ParticleSystem;
  elapsed: number;
  active: boolean;
}

export class AbsorbFeedbackPool {
  private slots: BurstSlot[] = [];
  private requested = false;
  private ready = false;
  private abandoned = false;
  private adoptAttempts = 0;
  private nextSlot = 0;
  private emittedCount = 0;
  private suppressedCount = 0;
  private lastScale = ABSORB_FEEDBACK.startScale;

  public constructor(private readonly host: Node) {}

  /** Kick off the non-blocking load. Idempotent. */
  public ensureRequested(): void {
    if (this.requested) return;
    this.requested = true;
    ArtLoader.instantiateArt('blackhole.absorbBurst', 'game-art',
      (art) => this.adopt(art.node),
      (reason) => this.abandon(reason));
  }

  /**
   * Emit one burst at a world position. Called once per real absorption.
   *
   * The Y is pinned to `ABSORB_FEEDBACK.heightAboveGround`: the absorbed object
   * has already sunk below the ground plane (`SuctionMotionCalculator` lerps its
   * Y to -0.8), so the object's own Y would place the burst under the world.
   */
  public emit(worldPosition: Readonly<Vec3>): void {
    if (!this.ready || this.slots.length === 0) {
      this.suppressedCount += 1;
      return;
    }
    const slot = this.slots[this.nextSlot % this.slots.length];
    this.nextSlot += 1;

    slot.root.active = true;
    slot.root.setWorldPosition(worldPosition.x, ABSORB_FEEDBACK.heightAboveGround, worldPosition.z);
    slot.root.setScale(ABSORB_FEEDBACK.startScale, ABSORB_FEEDBACK.startScale, ABSORB_FEEDBACK.startScale);
    slot.elapsed = 0;
    slot.active = true;
    // `stop()` resets the playback clock and clears any particles left from the
    // previous use of this slot; `play()` restarts emission. Both are idempotent.
    slot.system.stop();
    slot.system.play();
    this.lastScale = ABSORB_FEEDBACK.startScale;
    this.emittedCount += 1;
  }

  /** Advance the collapse curve and retire finished bursts. */
  public update(dt: number): void {
    if (!this.ready) {
      this.retryAdoption();
      return;
    }
    const step = Math.max(0, dt);
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.elapsed += step;
      const progress = absorbBurstProgress(slot.elapsed);
      const scale = absorbBurstScale(progress);
      slot.root.setScale(scale, scale, scale);
      this.lastScale = scale;
      if (progress >= 1) {
        slot.system.stop();
        slot.root.active = false;
        slot.active = false;
      }
    }
  }

  /** Read-only evidence for the acceptance bridge. Never a setter. */
  public getDiagnostics(): Readonly<Record<string, unknown>> {
    let activeCount = 0;
    let liveParticles = 0;
    for (const slot of this.slots) {
      if (slot.active) activeCount += 1;
      // Engine-side particle count, so a silently-empty emitter can be told
      // apart from one that is emitting. `getParticleCount` is 0 when the CPU
      // processor is not attached.
      liveParticles += slot.system.getParticleCount();
    }
    const first = this.slots[0]?.system || null;
    // Engine-side render state, mirroring the PHASE 4 diagnostic that found a
    // resident emitter being entirely depth-culled while still reporting a live
    // emission rate. "Reports particles" is not "draws particles", so the model
    // enabled flag and the emitter's world Y are both readable here. Read-only.
    const model = (first?.processor as unknown as {
      model?: { enabled?: boolean; subModels?: readonly unknown[] } | null;
    } | null)?.model || null;
    const activeSlot = this.slots.find((slot) => slot.active) || null;
    return {
      requested: this.requested,
      resident: this.slots.length > 0,
      ready: this.ready,
      abandoned: this.abandoned,
      poolSize: ABSORB_FEEDBACK.poolSize,
      liveNodes: this.slots.length,
      activeCount,
      liveParticles,
      firstSystemPlaying: first?.isPlaying ?? null,
      modelEnabled: model?.enabled ?? null,
      subModelCount: model?.subModels?.length ?? null,
      activeWorldY: activeSlot ? Number(activeSlot.root.worldPosition.y.toFixed(3)) : null,
      activeWorldPosition: activeSlot ? {
        x: Number(activeSlot.root.worldPosition.x.toFixed(3)),
        y: Number(activeSlot.root.worldPosition.y.toFixed(3)),
        z: Number(activeSlot.root.worldPosition.z.toFixed(3)),
      } : null,
      activeScale: activeSlot ? Number(activeSlot.root.scale.x.toFixed(3)) : null,
      emittedCount: this.emittedCount,
      suppressedCount: this.suppressedCount,
      lastScale: Number(this.lastScale.toFixed(3)),
      materialEffect: first?.getRenderMaterial(0)?.effectName || null,
    };
  }

  // -------------------------------------------------------------------------

  private adopt(template: Node): void {
    if (this.abandoned) {
      template.destroy();
      return;
    }
    // One prefab instance is cloned into the fixed pool. `ArtLoader` returns a
    // single materialised node, and its in-flight guard means a second request
    // would be dropped, so the pool is built by cloning here.
    const slots: BurstSlot[] = [];
    for (let index = 0; index < ABSORB_FEEDBACK.poolSize; index += 1) {
      const root = index === 0 ? template : instantiate(template);
      root.name = `AbsorbBurst_${index}`;
      root.active = false;
      if (!root.parent) this.host.addChild(root);
      const system = root.getComponentInChildren(ParticleSystem);
      if (!system) {
        root.destroy();
        this.abandon(new Error('[AbsorbFeedbackPool] AbsorbBurst.prefab carries no cc.ParticleSystem'));
        return;
      }
      slots.push({ root, system, elapsed: 0, active: false });
    }
    this.slots = slots;
    this.ready = this.materialsUsable();
  }

  private materialsUsable(): boolean {
    return this.slots.length > 0 && this.slots.every((slot) => {
      const material = slot.system.getRenderMaterial(0);
      // The authored material must be the particle effect. `builtin-unlit` has
      // no particle vertex contract, so anything else would draw garbage; an
      // unresolved material is Creator's magenta fallback and must not be drawn.
      return !!material && material.validate()
        && (material.effectName || '').includes('builtin-particle');
    });
  }

  /**
   * A pool that was not drawable at instantiation gets a bounded number of
   * chances to settle. It is never force-activated: that is the magenta risk.
   */
  private retryAdoption(): void {
    if (this.abandoned || this.slots.length === 0) return;
    if (this.adoptAttempts >= MAX_ADOPT_ATTEMPTS) return;
    this.adoptAttempts += 1;
    if (this.materialsUsable()) {
      this.ready = true;
    } else if (this.adoptAttempts === MAX_ADOPT_ATTEMPTS) {
      this.abandon(new Error('[AbsorbFeedbackPool] burst material never resolved'));
    }
  }

  private abandon(reason: unknown): void {
    if (this.abandoned) return;
    this.abandoned = true;
    this.ready = false;
    console.warn('[AbsorbFeedbackPool] Authored absorb burst unavailable; absorption renders without it.', reason);
  }
}
