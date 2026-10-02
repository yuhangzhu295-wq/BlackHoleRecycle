/**
 * V7 PHASE 4: the runtime host for the singularity's two authored effect assets.
 *
 * This is the *only* place that instantiates `RimEnergy.prefab` and
 * `SuctionParticles.prefab`, and it exists so `BlackHoleMachine` keeps owning
 * gameplay while the effects own nothing but presentation.
 *
 * The two contracts it preserves, both inherited from `ArtLoader`:
 *
 *   1. **It never blocks and never breaks.** A missing or malformed asset
 *      leaves the effect simply absent. The singularity, its materials and all
 *      gameplay continue to render exactly as before.
 *
 *   2. **It never renders an unresolved material.** A particle or rim renderer
 *      whose material did not resolve is deactivated rather than drawn, because
 *      Creator's fallback for a missing material is a hot-magenta surface. The
 *      acceptance gate asserts on those pixels, and a visual upgrade must not
 *      be able to introduce one. Adoption is retried for a bounded number of
 *      frames, then abandoned with a single warning.
 *
 * Everything it varies comes from `SingularityVisualProfile`; this file only
 * applies it to nodes and material instances.
 */
import { Color, MeshRenderer, Node, ParticleSystem, Vec3 } from 'cc';
import { ArtLoader } from '../core/ArtLoader';
import { RENDER_EFFECT } from '../core/RenderProfile';
import {
  SingularityLevelVisuals,
  singularityDevourScale,
  singularityRimEnergyScale,
  singularitySuctionEmission,
} from './SingularityVisualProfile';

/** Bounded adoption retries, mirroring `ArtLoader`'s non-blocking contract. */
const MAX_ADOPT_ATTEMPTS = 60;
/** The energy gyro's own slow spin, opposite the rim so it reads as a gyro. */
const RIM_ENERGY_SPIN_DEG_PER_SEC = -26;
/** The suction stream's own slow swirl, so the inflow spirals inward. */
const PARTICLE_SWIRL_DEG_PER_SEC = 34;
/**
 * Height of the emitter plane above the core origin, before `funnelSpread`.
 *
 * Measured, not guessed. The authored body is a cylinder of radius 1.10 and
 * half-height 0.0275 centred at y 0.01, and the particle effect renders with
 * `depthTest: true, depthWrite: false`. At y 0 the whole emitter ring sits
 * *inside* that opaque cylinder, so every particle was depth-culled and the
 * effect drew nothing at all while still reporting a live emission rate.
 * 0.30 clears the highest decorative layer (HoleRing at 0.268) at every level.
 */
const PARTICLE_PLANE_HEIGHT = 0.30;

interface ParticleAdoption {
  readonly root: Node;
  readonly system: ParticleSystem;
}

interface RimEnergyAdoption {
  readonly root: Node;
  readonly renderers: readonly MeshRenderer[];
  readonly halo: Node | null;
}

export class SingularityEffects {
  private particles: ParticleAdoption | null = null;
  private rimEnergy: RimEnergyAdoption | null = null;

  private particleAdoptAttempts = 0;
  private rimEnergyAdoptAttempts = 0;
  private particleRequested = false;
  private rimEnergyRequested = false;
  private particleAbandoned = false;
  private rimEnergyAbandoned = false;

  private particleRate = 0;
  private particleSpin = 0;
  private rimEnergySpin = 0;
  private rimEnergyColor: string | null = null;
  private particleColor: string | null = null;
  private visuals: SingularityLevelVisuals | null = null;
  private readonly tint = new Color();

  public constructor(private readonly coreNode: Node) {}

  /**
   * Kick off both non-blocking requests. Idempotent: `ArtLoader` caches the
   * prefab and this only ever asks once.
   */
  public ensureRequested(): void {
    if (!this.particleRequested) {
      this.particleRequested = true;
      ArtLoader.instantiateArt('blackhole.suctionParticles', 'game-art',
        (art) => this.adoptParticles(art.node),
        (reason) => this.abandonParticles(reason));
    }
    if (!this.rimEnergyRequested) {
      this.rimEnergyRequested = true;
      ArtLoader.instantiateArt('blackhole.rimEnergy', 'game-art',
        (art) => this.adoptRimEnergy(art.node),
        (reason) => this.abandonRimEnergy(reason));
    }
  }

  /**
   * The live rim-energy root, for `BlackHoleMachine.getAnimatedDecorationNodes`.
   *
   * It is a frame-animated decoration: it spins and pulses every frame, so it
   * must stay out of the gated silhouette measurement for the same reason the
   * swirls do. Null until the asset adopts.
   */
  public getRimEnergyNode(): Node | null {
    return this.rimEnergy?.root || null;
  }

  /** Apply the level's look. Safe to call before either asset has adopted. */
  public applyLevel(visuals: SingularityLevelVisuals): void {
    this.visuals = visuals;
    this.applyRimEnergyTint(visuals.rimEnergyColor);
    this.applyParticleTint(visuals.particleColor);
  }

  /**
   * Drive the effects from real state.
   *
   * @param dt            frame delta in seconds
   * @param suctionFeedback the world's live suction load, 0..1
   * @param devourPulse   the decaying 0..1 pulse raised when a target is absorbed
   * @param elapsed       the machine's visual clock, for the rim breathing
   */
  public update(dt: number, suctionFeedback: number, devourPulse: number, elapsed: number): void {
    this.retryAdoption();
    const visuals = this.visuals;
    if (!visuals) return;

    this.updateParticles(visuals, suctionFeedback, devourPulse, dt);
    this.updateRimEnergy(visuals, suctionFeedback, devourPulse, elapsed, dt);
  }

  /** Read-only evidence for the acceptance bridge. */
  public getDiagnostics(): Readonly<Record<string, unknown>> {
    const particleMaterial = this.particles?.system.getRenderMaterial(0) || null;
    const rimMaterial = this.rimEnergy?.renderers[0]?.getRenderMaterial(0) || null;
    return {
      suctionParticles: {
        resident: !!this.particles,
        requested: this.particleRequested,
        abandoned: this.particleAbandoned,
        active: this.particles?.root.activeInHierarchy || false,
        ratePerSecond: Number(this.particleRate.toFixed(2)),
        effect: particleMaterial?.effectName || null,
        valid: particleMaterial?.validate() || false,
        internals: this.particleInternals(),
      },
      rimEnergy: {
        resident: !!this.rimEnergy,
        requested: this.rimEnergyRequested,
        abandoned: this.rimEnergyAbandoned,
        active: this.rimEnergy?.root.activeInHierarchy || false,
        rings: this.rimEnergy?.renderers.length || 0,
        effect: rimMaterial?.effectName || null,
        valid: rimMaterial?.validate() || false,
      },
    };
  }

  /**
   * Engine-side particle state, for diagnosing a silently-empty emitter.
   *
   * This is the diagnostic that found the real defect in this phase: the
   * emitter was resident, playing, material-valid and reporting a live emission
   * rate, while the plane it emitted on sat *inside* the opaque body cylinder
   * and every particle was depth-culled. "Reports a rate" is not "draws", so
   * the model's own enabled flag is worth being able to read. Read-only; no
   * setter.
   */
  private particleInternals(): Readonly<Record<string, unknown>> | null {
    const system = this.particles?.system || null;
    if (!system) return null;
    // `model` is engine-internal and not in the public declaration, so it is
    // reached through a narrow read-only view rather than a broad `any`.
    const model = (system.processor as unknown as {
      model?: { enabled?: boolean; subModels?: readonly unknown[] } | null;
    } | null)?.model || null;
    return {
      isPlaying: system.isPlaying,
      capacity: system.capacity,
      hasProcessor: !!system.processor,
      hasModel: !!model,
      modelEnabled: model?.enabled ?? null,
      subModelCount: model?.subModels?.length ?? null,
      enabledInHierarchy: system.enabledInHierarchy,
      worldY: Number(system.node.worldPosition.y.toFixed(3)),
    };
  }

  // -------------------------------------------------------------------------
  // Particles
  // -------------------------------------------------------------------------

  private adoptParticles(root: Node): void {
    const system = root.getComponentInChildren(ParticleSystem);
    if (!system) {
      this.abandonParticles(new Error('[SingularityEffects] SuctionParticles.prefab carries no cc.ParticleSystem'));
      return;
    }
    if (!this.particleMaterialUsable(system)) {
      // Keep it inactive and retry: a glTF sub-model or a lazily bound material
      // can settle a frame or two after instantiation. Drawing it now would
      // risk Creator's magenta missing-material fallback.
      root.active = false;
      this.coreNode.addChild(root);
      this.particles = { root, system };
      return;
    }
    root.active = true;
    if (!root.parent) this.coreNode.addChild(root);
    this.particles = { root, system };
    this.startParticles(system);
    this.applyParticleTint(this.visuals?.particleColor || null);
  }

  /**
   * Start the emitter explicitly rather than relying on `playOnAwake`.
   *
   * `playOnAwake` is serialised `true`, and the engine calls `play()` from
   * `onEnable` only when the node is activated. This instance is activated by
   * `addChild` after `instantiate`, so being explicit removes any dependence on
   * that ordering. `play()` is idempotent. `capacity` is re-assigned so the
   * model's capacity is applied through the property's setter, which is a no-op
   * while `processor` is still null during deserialisation.
   */
  private startParticles(system: ParticleSystem): void {
    system.capacity = system.capacity;
    system.play();
  }

  private particleMaterialUsable(system: ParticleSystem): boolean {
    const material = system.getRenderMaterial(0);
    // The authored material must be the particle effect, not merely *a*
    // material: `builtin-unlit` has no particle vertex contract and would draw
    // the emitter's geometry as garbage. The effect asset's own name is
    // `particles/builtin-particle` (its path inside the editor's effect folder),
    // so this matches on the name rather than an exact equality that the
    // editor's prefix would break.
    const effect = material?.effectName || '';
    return !!material && material.validate() && effect.includes('builtin-particle');
  }

  private abandonParticles(reason: unknown): void {
    if (this.particleAbandoned) return;
    this.particleAbandoned = true;
    console.warn('[SingularityEffects] Authored suction particles unavailable; the singularity renders without them.', reason);
  }

  private updateParticles(
    visuals: SingularityLevelVisuals,
    suctionFeedback: number,
    devourPulse: number,
    dt: number,
  ): void {
    const particles = this.particles;
    if (!particles) return;
    if (!particles.root.activeInHierarchy && !this.particleMaterialUsable(particles.system)) return;

    // Emission is the real signal: zero load and no devour pulse means zero
    // particles per second, so an idle singularity emits nothing at all.
    const rate = singularitySuctionEmission(visuals, suctionFeedback, devourPulse);
    this.particleRate = rate;
    particles.system.rateOverTime.constant = rate;

    // A slow swirl makes the inward streams spiral instead of converging
    // straight down the radius.
    this.particleSpin += PARTICLE_SWIRL_DEG_PER_SEC * dt * visuals.spinMultiplier;
    particles.root.setRotationFromEuler(0, this.particleSpin, 0);
    // Held above the opaque body so the additive particles are actually drawn;
    // it tracks the level's funnel depth so the inflow stays above the vortex.
    particles.root.setPosition(0, PARTICLE_PLANE_HEIGHT * visuals.funnelSpread, 0);
  }

  private applyParticleTint(hex: string | null): void {
    if (!hex || !this.particles) return;
    if (this.particleColor === hex) return;
    this.particleColor = hex;
    Color.fromHEX(this.tint, hex);
    // `GradientRange.color` is the emitter's constant start colour, so this
    // tints every newly born particle without touching the shared material.
    this.particles.system.startColor.color = this.tint.clone();
  }

  // -------------------------------------------------------------------------
  // Rim energy
  // -------------------------------------------------------------------------

  private adoptRimEnergy(root: Node): void {
    const renderers: MeshRenderer[] = [];
    const visit = (node: Node): void => {
      const renderer = node.getComponent(MeshRenderer);
      if (renderer) renderers.push(renderer);
      node.children.forEach(visit);
    };
    visit(root);
    if (!renderers.length) {
      this.abandonRimEnergy(new Error('[SingularityEffects] RimEnergy.prefab carries no cc.MeshRenderer'));
      return;
    }
    const usable = renderers.every((renderer) => {
      const material = renderer.getRenderMaterial(0);
      return !!material && material.validate() && material.effectName === RENDER_EFFECT;
    });
    const halo = root.getChildByName('RimEnergyHalo');
    if (!usable) {
      root.active = false;
      this.coreNode.addChild(root);
      this.rimEnergy = { root, renderers, halo };
      return;
    }
    root.active = true;
    if (!root.parent) this.coreNode.addChild(root);
    this.rimEnergy = { root, renderers, halo };
    this.applyRimEnergyTint(this.visuals?.rimEnergyColor || null);
  }

  private abandonRimEnergy(reason: unknown): void {
    if (this.rimEnergyAbandoned) return;
    this.rimEnergyAbandoned = true;
    console.warn('[SingularityEffects] Authored rim energy unavailable; the singularity renders without it.', reason);
  }

  private updateRimEnergy(
    visuals: SingularityLevelVisuals,
    suctionFeedback: number,
    devourPulse: number,
    elapsed: number,
    dt: number,
  ): void {
    const rim = this.rimEnergy;
    if (!rim) return;
    this.rimEnergySpin += RIM_ENERGY_SPIN_DEG_PER_SEC * dt * visuals.spinMultiplier;
    const scale = singularityRimEnergyScale(visuals, elapsed, suctionFeedback, devourPulse)
      * singularityDevourScale(suctionFeedback, devourPulse);
    rim.root.setRotationFromEuler(0, this.rimEnergySpin, 0);
    rim.root.setScale(new Vec3(scale, 1, scale));
    // The halo counter-rotates inside the blade, which is what stops the pair
    // reading as a single rigid ring.
    if (rim.halo) rim.halo.setRotationFromEuler(14, -this.rimEnergySpin * 1.8, 0);
  }

  private applyRimEnergyTint(hex: string | null): void {
    if (!hex || !this.rimEnergy) return;
    if (this.rimEnergyColor === hex) return;
    this.rimEnergyColor = hex;
    Color.fromHEX(this.tint, hex);
    for (const renderer of this.rimEnergy.renderers) {
      const material = renderer.getMaterialInstance(0);
      material?.setProperty('mainColor', this.tint);
    }
  }

  // -------------------------------------------------------------------------

  /**
   * A node that was held inactive pending a usable material gets a bounded
   * number of chances to become drawable, then is left off. It is never
   * force-activated, because that is exactly the magenta risk this guards.
   */
  private retryAdoption(): void {
    if (this.particles && !this.particles.root.activeInHierarchy
      && this.particleAdoptAttempts < MAX_ADOPT_ATTEMPTS) {
      this.particleAdoptAttempts += 1;
      if (this.particleMaterialUsable(this.particles.system)) {
        this.particles.root.active = true;
        this.startParticles(this.particles.system);
        this.applyParticleTint(this.visuals?.particleColor || null);
      }
    }
    if (this.rimEnergy && !this.rimEnergy.root.activeInHierarchy
      && this.rimEnergyAdoptAttempts < MAX_ADOPT_ATTEMPTS) {
      this.rimEnergyAdoptAttempts += 1;
      const usable = this.rimEnergy.renderers.every((renderer) => {
        const material = renderer.getRenderMaterial(0);
        return !!material && material.validate() && material.effectName === RENDER_EFFECT;
      });
      if (usable) {
        this.rimEnergy.root.active = true;
        this.applyRimEnergyTint(this.visuals?.rimEnergyColor || null);
      }
    }
  }
}
