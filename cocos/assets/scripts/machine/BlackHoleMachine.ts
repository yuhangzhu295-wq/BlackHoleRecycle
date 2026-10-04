/**
 * 黑洞吸尘机 3D 核心组件与 5 级结构进化系统 (BlackHoleMachine.ts)
 */
import { _decorator, Color, Component, director, Mesh, MeshRenderer, Node, Vec3, math } from 'cc';
import { MACHINE_ASSEMBLY_PALETTE, MACHINE_PALETTE } from '../core/RenderProfile';
import { BlobShadow } from '../core/BlobShadow';
import { ArtLoader } from '../core/ArtLoader';
import { BLOB_SHADOW_PROFILE } from '../core/RenderProfile';
import { IMachineEvolutionConfig, MACHINE_EVOLUTION_CONFIG, ObjectTier, PLAYER_FEEL_CONFIG } from '../data/GameConfig';
import { eventBus } from '../core/EventBus';
import { MeshFactory } from '../core/MeshFactory';
import { MachineVisualLibrary } from './MachineVisualLibrary';
import { SingularityEffects } from './SingularityEffects';
import {
  SingularityLevelVisuals,
  VORTEX_LAYERS,
  decayDevourPulse,
  getSingularityLevelVisuals,
  singularityDevourScale,
  vortexLayerAngularStep,
  vortexLayerEuler,
  vortexLayerHeight,
} from './SingularityVisualProfile';
import { WorldArtLibrary } from '../world/WorldArtLibrary';
import { saveService } from '../data/SaveService';

const { ccclass, property } = _decorator;

/** The mesh selection changes only what a competitor displays, never its mass, radius or controls. */
export type MachinePresentation = 'HYBRID' | 'SINGULARITY' | 'MACHINE' | 'BOT';

@ccclass('BlackHoleMachine')
export class BlackHoleMachine extends Component {
  @property(Node)
  public coreNode: Node | null = null;

  @property(Node)
  public turbineNode: Node | null = null;

  @property(Node)
  public crusherNode: Node | null = null;

  @property(Node)
  public gravityWingNode: Node | null = null;

  @property(Node)
  public singularityHaloNode: Node | null = null;

  public currentLevel: number = 1;
  public currentConfig: IMachineEvolutionConfig = MACHINE_EVOLUTION_CONFIG[0];
  public currentMass: number = 0;
  public readonly velocity: Vec3 = new Vec3();
  public isMagnetStormActive: boolean = false;
  private magnetStormTimer: number = 0;

  /**
   * Only the player's own machine owns the account's persisted progression.
   *
   * `saveService` is a process-wide singleton, so an unguarded write lets an
   * opponent's mass become the player's `machineMass` — and because
   * `setMachineProgression` raises `machineLevel` monotonically, an opponent
   * that reaches LV2+ would hand the player a free level. Arena bots
   * (`ArenaMatchManager`) and replicated remote players (`NetworkArenaReplica`)
   * are real `BlackHoleMachine` instances, so their owners clear this flag.
   */
  public persistsProgression: boolean = true;

  // 内部视觉节点容器
  private visualRoot: Node | null = null;
  private chassisNode: Node | null = null;
  /** Creator-saved audited bulldozer instance used by Arena opponents. */
  private arenaBotVisual: Node | null = null;
  private holeRim: Node | null = null;
  private innerSwirl: Node | null = null;
  private midSwirl: Node | null = null;
  private outerSwirl: Node | null = null;
  private shimmerSwirl: Node | null = null;
  private readonly levelVisuals: Node[] = [];
  private visualElapsed: number = 0;
  /**
   * PHASE 4: the authored rim-energy and suction-particle assets, plus the
   * profile state that drives them. Purely presentational; nothing here is read
   * back into suction, mass, tier, collision or the FSM.
   */
  private effects: SingularityEffects | null = null;
  /**
   * The five decorative layers in `VORTEX_LAYERS` order, cached so the
   * per-frame vortex animation does no name lookup. `holeRim` is the last one.
   */
  private readonly vortexLayerNodes: Array<Node | null> = [];
  /** Accumulated spin per layer, in degrees. See `vortexLayerAngularStep`. */
  private readonly layerSpinAngles: number[] = [];
  /** The level's resolved look. Always defined after `applyEvolutionLevel`. */
  private levelAppearance: SingularityLevelVisuals = getSingularityLevelVisuals({
    level: 1, baseColor: '#2b7fff', rimColor: '#00e5ff',
  });
  /**
   * Decaying 0..1 response raised once per real absorption by
   * `triggerDevourPulse`. Visual only.
   */
  private devourPulse: number = 0;
  /**
   * Imported glTF renderers may finish their first Web Mobile sub-model setup
   * one frame after a machine is activated. Rebind the approved material on
   * the following frames so an arena bot never flashes Creator's magenta
   * fallback while its real chassis is coming online.
   */
  private materialRebindFrames: number = 0;
  private readonly movementDirection: Vec3 = new Vec3();
  private movementMagnitude: number = 0;
  private presentation: MachinePresentation = 'HYBRID';
  /** Hex tint for this competitor's real imported crawler model only. */
  private arenaBotTint: string = MACHINE_ASSEMBLY_PALETTE.chassis;
  /**
   * Live suction feedback level, 0..1, driven by how many targets are actually
   * being pulled in this frame. The V6 brief section 4 asks the singularity to
   * react in ATTRACTED and SUCKING; without this the machine looks identical
   * whether it is idle or eating, which was the weakest part of the opening
   * read. Purely visual: no suction radius, mass, tier or collision is touched.
   */
  private suctionFeedback: number = 0;
  /** Seconds remaining on the level-up flourish, and its total duration. */
  private levelUpFlourish: number = 0;
  private static readonly LEVEL_UP_FLOURISH_SECONDS = 0.9;
  /**
   * True once the authored singularity asset has replaced the runtime
   * primitives. Read-only evidence that the V7 migration actually took effect
   * at runtime, rather than only in the repository.
   */
  private authoredSingularityAdopted: boolean = false;
  /**
   * Guards the one-shot asset request. `onLoad` can run before the asset
   * manager is ready to resolve a bundle, so the request is retried from
   * `update` until it succeeds or the budget is spent.
   */
  private singularityLoadAttempts: number = 0;
  private static readonly MAX_SINGULARITY_LOAD_ATTEMPTS = 90;
  /**
   * The seven core part names, shared by the structure builder, the authored
   * bind and the degraded fallback so the three cannot drift. The per-frame
   * animation, `applyCoreSkin` and the silhouette measurement all bind to these
   * names, so they are a contract, not a convenience.
   */
  private static readonly CORE_PART_NAMES: readonly string[] = [
    'AbyssBase', 'HoleInner', 'InnerSwirl', 'MidSwirl', 'OuterSwirl', 'ShimmerSwirl', 'HoleRing',
  ];
  /**
   * The requested skin colours. Recorded rather than applied immediately,
   * because the core nodes own no mesh until the authored asset binds (or the
   * degraded fallback runs). Re-applied at that moment so a skin chosen before
   * the asset arrives is never lost.
   */
  private coreSkin: { readonly bodyColor: string; readonly rimColor: string } | null = null;
  /**
   * Latches a terminal load failure so the retry loop stops instead of
   * warning every frame. A missing asset is a repository problem, not a
   * per-frame condition, and flooding the console would hide real errors.
   */
  private singularityLoadAbandoned: boolean = false;

  onLoad(): void {
    this.buildVisibleGeometry();
    this.currentMass = Math.max(0, saveService.data.machineMass || 0);
    const savedLevel = Math.max(1, Math.min(MACHINE_EVOLUTION_CONFIG.length, saveService.data.machineLevel || 1));
    // Loading only mirrors the save, so it must never write back. A bot is
    // created with `addComponent`, which runs this hook before its owner can
    // clear `persistsProgression`, so the guard has to hold here too.
    this.withoutPersisting(() => this.applyEvolutionLevel(savedLevel, false));
  }

  /** Single gate for every write to the account's persisted progression. */
  private persistProgression(): void {
    if (!this.persistsProgression) return;
    saveService.setMachineProgression(this.currentMass, this.currentLevel);
  }

  private withoutPersisting(action: () => void): void {
    const previous = this.persistsProgression;
    this.persistsProgression = false;
    try {
      action();
    } finally {
      this.persistsProgression = previous;
    }
  }

  /**
   * 玩家本体必须首先读作“黑洞”，而不是一辆贴了黑洞图标的汽车。
   * 黑洞圆盘和涡流的网格与材质来自已授权的 SingularityVortex 资产；
   * 五个等级的车体结构始终实例化由 Creator 保存的真实低模预制体。
   */
  private buildVisibleGeometry(): void {
    if (this.visualRoot) return;

    this.visualRoot = new Node('VisualRoot');
    this.node.addChild(this.visualRoot);

    const visualLibrary = this.getVisualLibrary();
    visualLibrary.validate();
    for (let level = 1; level <= 5; level++) {
      this.levelVisuals.push(visualLibrary.instantiateLevel(level, this.visualRoot));
    }
    this.chassisNode = this.levelVisuals[0] || null;

    // The level roots are intentionally distinct full assemblies, not a
    // scaled LV1 mesh. These references also retain the existing gameplay
    // contract used by the vertical-slice regression.
    this.turbineNode = this.levelVisuals[1] || null;
    this.crusherNode = this.levelVisuals[2] || null;
    this.gravityWingNode = this.levelVisuals[3] || null;
    this.singularityHaloNode = this.levelVisuals[4] || null;

    // 2. 黑洞核心：低矮、宽阔的深渊圆盘，在竖屏俯视镜头下保持为清楚的圆形。
    //
    // V7 PHASE 2B: the authored singularity is the ONLY construction path. This
    // block builds the *structure* the animation, the skin and the silhouette
    // measurement bind to — the seven named nodes and their transforms — and
    // nothing else. The meshes and materials come from
    // `game_art/blackhole/SingularityVortex.glb` in `adoptAuthoredSingularity`.
    // No primitive is created here, so nothing is built that would then have to
    // be thrown away when the asset arrives.
    this.coreNode = new Node('CoreNode');
    this.coreNode.setPosition(0, 0.16, 0);
    // The singularity is the game's primary interactive affordance. Scale its
    // visual layers together (not its physical suction radius) so it remains
    // legible in a mobile isometric city without changing game balance.
    this.coreNode.setScale(1.32, 1.0, 1.32);
    this.visualRoot.addChild(this.coreNode);

    // A deep-violet body keeps the singularity readable against the green
    // district once the authored asset binds its material.
    this.createCorePart('AbyssBase', 0.01);
    // Black centre (visual only; this is deliberately smaller than the rim
    // so the full object reads as a glossy vortex instead of a flat void).
    this.createCorePart('HoleInner', 0.06);

    // 多层紫色涡流环：它们是黑洞特效的实体表现，随时间反向转动以传达吞噬感。
    // Keep these as a visual-only effect. They do not stand in for a game object
    // and never define the real suction radius or collision area.
    //
    // V7 PHASE 4: the layer heights and tilts now come from
    // `SingularityVisualProfile.VORTEX_LAYERS`. The authored structure was
    // nearly coplanar (y 0.105-0.125), and every layer was spun about the Y axis
    // of a torus that is rotationally symmetric about that axis — so the
    // "rotation animation" changed Euler angles and nothing on screen. The
    // profile tilts each layer off its own axis (making the spin visible),
    // counter-rotates neighbours and spreads them into a funnel.
    this.vortexLayerNodes.length = 0;
    this.layerSpinAngles.length = 0;
    for (const layer of VORTEX_LAYERS) {
      this.vortexLayerNodes.push(this.createCorePart(layer.name, layer.y));
      this.layerSpinAngles.push(0);
    }
    this.innerSwirl = this.vortexLayerNodes[0] || null;
    this.midSwirl = this.vortexLayerNodes[1] || null;
    this.outerSwirl = this.vortexLayerNodes[2] || null;
    this.shimmerSwirl = this.vortexLayerNodes[3] || null;
    // 发光外环是黑洞的视觉轮廓，不能被用作真实吸附半径的地图标尺。
    this.holeRim = this.vortexLayerNodes[4] || null;

    // PHASE 4 authored effects. Both requests are non-blocking and both degrade
    // to "absent" rather than breaking, so this cannot stop the singularity from
    // rendering.
    this.effects = new SingularityEffects(this.coreNode);
    this.effects.ensureRequested();

    // The singularity must read as sitting on the road, not hovering over it.
    // One shared transparent quad, no shadow map and no dynamic light.
    BlobShadow.attach(this.node, BLOB_SHADOW_PROFILE.diameter.player);

  }

  /**
   * One named core node. It owns no MeshRenderer until the authored asset binds
   * (or the degraded fallback runs), which is what keeps the normal path free of
   * runtime-created geometry.
   */
  private createCorePart(name: string, y: number): Node {
    const node = new Node(name);
    node.setPosition(0, y, 0);
    this.coreNode!.addChild(node);
    return node;
  }

  /**
   * Bind the authored singularity onto the structure built above.
   *
   * The asset's node names match the structure's names exactly, so the per-frame
   * Euler animation, the skin recolouring and the silhouette measurement all keep
   * working against the same nodes: only the Mesh and Material behind each node
   * are added. A terminal load failure falls back to the documented primitive
   * core so a missing asset degrades instead of leaving the player invisible.
   */
  private adoptAuthoredSingularity(): void {
    ArtLoader.instantiateArt('blackhole.core', 'game-art', (art) => {
      if (!this.isValid || !this.coreNode?.isValid) return;
      const authored = art.node.getChildByName('SingularityVortex') || art.node.getChildByName('CoreNode') || art.node;
      let bound = 0;
      for (const name of BlackHoleMachine.CORE_PART_NAMES) {
        const target = this.coreNode.getChildByName(name);
        const sourceRenderer = authored.getChildByName(name)?.getComponent(MeshRenderer) || null;
        if (!target || !sourceRenderer?.mesh) continue;
        const renderer = target.getComponent(MeshRenderer) || target.addComponent(MeshRenderer);
        // Mesh and material come from the asset; the node, its transform and
        // its animation stay exactly where they are.
        renderer.mesh = sourceRenderer.mesh;
        const slotCount = Math.max(1, sourceRenderer.sharedMaterials.length, sourceRenderer.mesh.struct.primitives.length);
        for (let slot = 0; slot < slotCount; slot += 1) {
          const material = sourceRenderer.getRenderMaterial(slot) || sourceRenderer.getRenderMaterial(0);
          if (material) renderer.setMaterial(material, slot);
        }
        bound += 1;
      }
      if (bound === 0) {
        // The asset loaded but carries none of the named parts. Treat that as a
        // broken asset rather than leaving the player with an invisible core.
        this.activatePrimitiveCoreFallback('[BlackHoleMachine] Authored singularity carries no bindable core parts.');
        return;
      }
      this.authoredSingularityAdopted = true;
      this.applyLevelAppearance();
    }, (reason) => {
      this.activatePrimitiveCoreFallback(reason);
    });
  }

  /**
   * Degraded fallback ONLY. The authored asset is the production path; this
   * exists so a missing or malformed asset cannot leave the player invisible.
   * It rebuilds exactly the seven primitives the authored asset replaced, at the
   * same sizes, so the silhouette and every gameplay contract stay identical.
   */
  private activatePrimitiveCoreFallback(reason: unknown): void {
    if (this.singularityLoadAbandoned) return;
    this.singularityLoadAbandoned = true;
    // One warning per machine, then stop asking. The fallback keeps rendering,
    // so a missing asset degrades instead of breaking play.
    console.warn('[BlackHoleMachine] Authored singularity unavailable; using the degraded primitive core.', reason);
    if (!this.coreNode?.isValid) return;
    this.attachPrimitiveCorePart('AbyssBase', MeshFactory.getCylinderMesh(1.10, 1.10, 0.055, 64), MACHINE_PALETTE.abyssBase, 1.0, 0.0);
    this.attachPrimitiveCorePart('HoleInner', MeshFactory.getCylinderMesh(0.56, 0.56, 0.075, 64), MACHINE_PALETTE.holeInner, 1.0, 0.0);
    this.attachPrimitiveCorePart('InnerSwirl', MeshFactory.getTorusMesh(0.38, 0.035), MACHINE_PALETTE.innerSwirl, 0.1, 0.5);
    this.attachPrimitiveCorePart('MidSwirl', MeshFactory.getTorusMesh(0.55, 0.026), MACHINE_PALETTE.midSwirl, 0.1, 0.5);
    this.attachPrimitiveCorePart('OuterSwirl', MeshFactory.getTorusMesh(0.72, 0.045), MACHINE_PALETTE.outerSwirl, 0.1, 0.5);
    this.attachPrimitiveCorePart('ShimmerSwirl', MeshFactory.getTorusMesh(0.87, 0.018), MACHINE_PALETTE.shimmerSwirl, 0.08, 0.55);
    this.attachPrimitiveCorePart('HoleRing', MeshFactory.getTorusMesh(1.03, 0.04), MACHINE_PALETTE.holeRing, 0.1, 0.5);
    this.applyLevelAppearance();
  }

  private attachPrimitiveCorePart(name: string, mesh: Mesh, hex: string, roughness: number, metallic: number): void {
    const node = this.coreNode?.getChildByName(name) || null;
    if (node) MeshFactory.attachMesh(node, mesh, hex, roughness, metallic);
  }

  private getVisualLibrary(): MachineVisualLibrary {
    const library = director.getScene()?.getComponentInChildren(MachineVisualLibrary) || null;
    if (!library) throw new Error('[BlackHoleMachine] Missing editor-saved MachineVisualLibrary; primitive machine fallbacks are prohibited.');
    return library;
  }

  /**
   * Whether the authored singularity asset is the source of the core's meshes
   * and materials. Exposed for the acceptance report so the V7 migration is
   * provable at runtime rather than only visible in the repository.
   */
  public isUsingAuthoredSingularity(): boolean {
    return this.authoredSingularityAdopted;
  }

  /**
   * Read-only renderer state for real Web Mobile visual QA. This deliberately
   * exposes no material or mesh setter: it only lets the acceptance bridge
   * prove which saved model parts and runtime effects are actually rendered.
   */
  public getVisualMaterialDiagnostics(): ReadonlyArray<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    const visit = (node: Node, path: string): void => {
      const renderer = node.getComponent(MeshRenderer);
      if (renderer) {
        const primitiveCount = renderer.mesh?.struct.primitives.length || 0;
        const slotCount = Math.max(1, renderer.sharedMaterials.length, primitiveCount);
        const slots = Array.from({ length: slotCount }, (_, index) => {
          const material = renderer.getRenderMaterial(index);
          const rawColor = material?.getProperty('mainColor');
          const color = rawColor instanceof Color
            ? { r: rawColor.r, g: rawColor.g, b: rawColor.b, a: rawColor.a }
            : null;
          return {
            index,
            effect: material?.effectName || null,
            valid: material?.validate() || false,
            color,
          };
        });
        rows.push({ path, active: node.activeInHierarchy, primitiveCount, slots });
      }
      node.children.forEach((child) => visit(child, `${path}/${child.name}`));
    };
    if (this.visualRoot) visit(this.visualRoot, this.visualRoot.name);
    return rows;
  }

  /**
   * The decorative layers whose transform changes every frame: the four
   * rotating/pulsing swirls and the rotating level-indicator rim.
   *
   * They are drawn, so they belong in a render audit, but they must never be
   * merged into a *silhouette* measurement. `MeshRenderer.model.worldBounds`
   * is the AABB of the node's local AABB box transformed into world space, so
   * for a node that spins about Y it reports the box's rotated extent, which
   * inflates by up to sqrt(2) and oscillates with the animation phase. Merging
   * these into `playerWidthRatio` turns a camera-framing metric into a reading
   * of `visualElapsed`: HoleRing spins at 18 deg/s, so its apparent width has a
   * 5 s period and the metric swung between 0.221 and 0.304 against a declared
   * 0.22-0.30 band (measured 0.3038/0.3041/0.3036 on three consecutive runs at
   * HEAD, against a 0.2792 sample from the previous harness revision).
   *
   * The structural body (`AbyssBase` + `HoleInner`) is static, and its true
   * half-extent (1.10 x 1.85 = 2.035) is larger than the ring's phase-invariant
   * radius (1.07 x 1.85 = 1.9795), so the structural body *is* the
   * phase-invariant silhouette. Exposing the set here keeps one source of truth
   * next to the code that animates it, instead of a node-name list in the QA
   * layer that could silently drift.
   */
  public getAnimatedDecorationNodes(): readonly Node[] {
    // The contact-shadow quad is a ground decoration, not part of the machine's
    // drawn silhouette. It is deliberately WIDER than the body (4.4 m vs the
    // level-1 disc's 2.9 m, see BLOB_SHADOW_PROFILE.diameter) so it reads as a
    // footprint, and merging it into the gated silhouette therefore reported the
    // shadow's width as the player's: the gated `playerWidthRatio` came out at
    // 0.235 (arena) / 0.459 (endless) when the body alone is 0.2255 / 0.30. The
    // metric is documented as the structural body, so the shadow is excluded
    // here alongside the frame-animated layers. It is looked up by name because
    // `BlobShadow.attach` creates it lazily after the first frame.
    const contactShadow = this.node.getChildByName(BLOB_SHADOW_PROFILE.nodeName);
    const nodes: Node[] = [
      this.innerSwirl, this.midSwirl, this.outerSwirl, this.shimmerSwirl, this.holeRim,
      // PHASE 4's authored rim-energy ring spins and pulses every frame, so it
      // is a frame-animated decoration by the same definition and is excluded
      // from the gated silhouette for the same reason. It is null until the
      // asset adopts, which is why the list is built per call.
      this.effects?.getRimEnergyNode() || null,
      contactShadow,
    ].filter((node): node is Node => !!node && node.isValid);
    return nodes;
  }

  /**
   * Read-only evidence that the PHASE 4 authored effects actually adopted at
   * runtime, plus the emission rate the real suction load produced. Exposed for
   * the acceptance bridge only; there is no setter.
   */
  public getSingularityVisualDiagnostics(): Readonly<Record<string, unknown>> {
    return {
      level: this.levelAppearance.level,
      rimColor: this.levelAppearance.rimColor,
      spinMultiplier: this.levelAppearance.spinMultiplier,
      funnelSpread: this.levelAppearance.funnelSpread,
      suctionFeedback: this.suctionFeedback,
      devourPulse: Number(this.devourPulse.toFixed(3)),
      paused: this.isPaused,
      effects: this.effects?.getDiagnostics() || null,
    };
  }

  /**
   * How much suction is happening this frame, 0..1. The world sets it from the
   * real count of targets in ATTRACTED/SUCKING, so the feedback is driven by
   * gameplay state rather than by a timer.
   */
  public setSuctionFeedback(level: number): void {
    this.suctionFeedback = math.clamp01(level);
  }

  /**
   * Visual response to the live suction level, the devour pulse and the
   * level-up flourish.
   *
   * PHASE 4 consolidated what used to be two overlapping blocks (one in
   * `update`, one in the former `updateSuctionFeedback`) into this single pass,
   * because the two disagreed: `update` set the base rotation and the feedback
   * pass immediately overwrote three of the five layers with a different
   * formula. One source of truth is also what lets the layer table live in
   * `SingularityVisualProfile` instead of being spread across both.
   *
   * Every transform here is applied to the *decorative* layers, which
   * `getAnimatedDecorationNodes` excludes from the gated silhouette. The
   * structural body (`AbyssBase`, `HoleInner`) is never scaled, so the
   * `playerWidthRatio` gate cannot move with a gameplay event. No gameplay
   * value is read or written.
   */
  private applySingularityAnimation(dt: number): void {
    if (this.levelUpFlourish > 0) this.levelUpFlourish = Math.max(0, this.levelUpFlourish - dt);
    const flourish = this.levelUpFlourish / BlackHoleMachine.LEVEL_UP_FLOURISH_SECONDS;
    this.devourPulse = decayDevourPulse(this.devourPulse, dt);
    const load = this.suctionFeedback;
    const appearance = this.levelAppearance;
    const devourScale = singularityDevourScale(load, this.devourPulse);

    // The vortex: each layer advances its own accumulated angle, so a
    // `spinMultiplier` change at level-up is a speed change and not a snap to a
    // new absolute angle. The tilt makes that spin visible at all (see
    // `SingularityVisualProfile`), and the spread turns the stack into a funnel.
    for (let index = 0; index < VORTEX_LAYERS.length; index += 1) {
      const layer = VORTEX_LAYERS[index];
      const node = this.vortexLayerNodes[index] || null;
      if (!node) continue;
      this.layerSpinAngles[index] += vortexLayerAngularStep(layer, appearance.spinMultiplier, load, dt);
      const euler = vortexLayerEuler(layer, this.layerSpinAngles[index]);
      node.setRotationFromEuler(euler.x, euler.y, euler.z);
      node.setPosition(0, vortexLayerHeight(layer, appearance.funnelSpread), 0);
    }

    // Rim: idle breathing, then a swell under load, then the level-up burst,
    // all multiplied by the devour response so absorbing reads as growth.
    if (this.holeRim) {
      const breathing = Math.sin(this.visualElapsed * 1.8) * 0.015;
      const burst = flourish > 0 ? flourish * 0.34 : 0;
      const scale = this.holeRimBaseScale * (1 + breathing + load * 0.10 + burst) * devourScale;
      this.holeRim.setScale(scale, 1, scale);
    }
    if (this.shimmerSwirl) {
      const glitter = 1 + Math.sin(this.visualElapsed * (2.4 + load * 6)) * (0.035 + load * 0.05);
      const scale = glitter * devourScale * (1 + flourish * 0.18);
      this.shimmerSwirl.setScale(scale, 1, scale);
    }

    // The authored effects read the same real state: the world's suction load
    // and the per-absorption pulse. Nothing else drives them.
    this.effects?.update(dt, load, this.devourPulse, this.visualElapsed);
  }

  /**
   * Raise the devour response once per real absorption.
   *
   * Called by the gameplay layer from its absorb callback, so the response is
   * driven by an actual event rather than by a timer. Visual only: it is read
   * by decoration scale and particle emission and written nowhere.
   */
  public triggerDevourPulse(): void {
    this.devourPulse = 1;
  }

  /** The rim's level-derived scale, kept separate so feedback multiplies it. */
  private get holeRimBaseScale(): number {
    return 1.0 + Math.min(0.38, Math.max(0, this.currentConfig.suctionRadius - 2.4) * 0.075);
  }

  /** Receives camera-relative, normalized intent. It contains no arena/world boundary logic. */
  public setMovementDirection(direction: Readonly<Vec3>, magnitude: number): void {
    this.movementDirection.set(direction.x, 0, direction.z);
    if (this.movementDirection.lengthSqr() > 0.0001) this.movementDirection.normalize();
    this.movementMagnitude = math.clamp01(magnitude);
  }

  public stopMovement(): void {
    this.movementMagnitude = 0;
    this.movementDirection.set(0, 0, 0);
    // A released touch is a hard gameplay stop. Clearing residual velocity
    // prevents a short final suction approach from coasting outside the live
    // pickup radius between touch samples.
    this.velocity.set(0, 0, 0);
  }

  public resetMovement(): void {
    this.stopMovement();
    this.velocity.set(0, 0, 0);
  }

  public getMovementDirection(): Readonly<Vec3> {
    return this.movementDirection;
  }

  public getMovementMagnitude(): number {
    return this.movementMagnitude;
  }

  public getMoveSpeed(): number {
    return this.currentConfig.moveSpeed;
  }

  public isPaused: boolean = false;

  public update(dt: number): void {
    if (this.materialRebindFrames > 0) {
      const activeAssembly = this.levelVisuals[this.currentLevel - 1] || null;
      if (activeAssembly?.activeInHierarchy) {
        this.getVisualLibrary().applyActiveLevelMaterials(activeAssembly, this.currentLevel);
      }
      this.materialRebindFrames--;
    }
    if (this.isPaused || dt <= 0) return;
    // V7 PHASE 2B. The core structure is built with no meshes; this request is
    // what turns it into the authored singularity. If the asset never arrives,
    // `activatePrimitiveCoreFallback` supplies the documented degraded core so
    // the player is never left invisible.
    //
    // The request lives here rather than in onLoad because onLoad can run
    // before the asset manager is ready to resolve a bundle; retrying from the
    // update loop is what makes the bind reliable. Once the asset is resident
    // the loader answers synchronously, so this settles on the first frame
    // after it arrives.
    if (!this.authoredSingularityAdopted && !this.singularityLoadAbandoned
      && this.singularityLoadAttempts < BlackHoleMachine.MAX_SINGULARITY_LOAD_ATTEMPTS) {
      this.singularityLoadAttempts += 1;
      this.adoptAuthoredSingularity();
    }
    this.visualElapsed += dt;
    // One pass owns every decorative transform (vortex layers, rim, effects).
    this.applySingularityAnimation(dt);
    // 1. Continuous velocity integration. Boundaries belong to arena/world systems,
    // never to this reusable machine component.
    const curPos = this.node.getPosition();
    const speed = this.currentConfig.moveSpeed * this.movementMagnitude;
    const targetVelocityX = this.movementDirection.x * speed;
    const targetVelocityZ = this.movementDirection.z * speed;
    const responseFactor = this.movementMagnitude > 0
      ? PLAYER_FEEL_CONFIG.accelerationResponse
      : PLAYER_FEEL_CONFIG.decelerationResponse;
    const response = Math.min(1.0, dt * responseFactor);
    this.velocity.x = math.lerp(this.velocity.x, targetVelocityX, response);
    this.velocity.z = math.lerp(this.velocity.z, targetVelocityZ, response);
    if (this.movementMagnitude === 0 && Math.abs(this.velocity.x) + Math.abs(this.velocity.z) < 0.01) {
      this.velocity.set(0, 0, 0);
    }
    curPos.x += this.velocity.x * dt;
    curPos.z += this.velocity.z * dt;
    this.node.setPosition(curPos);

    // 2. 磁暴倒计时
    if (this.isMagnetStormActive) {
      this.magnetStormTimer -= dt;
      if (this.magnetStormTimer <= 0) {
        this.isMagnetStormActive = false;
        eventBus.emit('MAGNET_STORM_ENDED');
      }
    }
  }

  public addMass(amount: number): boolean {
    this.currentMass += Math.max(0, amount);
    this.persistProgression();
    return this.checkEvolution();
  }

  public checkEvolution(): boolean {
    for (let i = MACHINE_EVOLUTION_CONFIG.length - 1; i >= 0; i--) {
      const cfg = MACHINE_EVOLUTION_CONFIG[i];
      if (this.currentMass >= cfg.massThreshold) {
        if (cfg.level > this.currentLevel) {
          this.applyEvolutionLevel(cfg.level, true);
          return true;
        }
        break;
      }
    }
    return false;
  }

  public applyEvolutionLevel(level: number, triggerEvent: boolean = true): void {
    this.currentLevel = level;
    this.currentConfig = MACHINE_EVOLUTION_CONFIG[level - 1] || MACHINE_EVOLUTION_CONFIG[0];
    this.persistProgression();

    // Exactly one Creator-saved upgrade assembly is selected per level.
    // HYBRID is the player-facing presentation: its chassis is suppressed so
    // LV1 reads as the black hole from the reference, while the authored
    // upgrade modules (starting with LV2's real turbines) remain visible.
    // MACHINE is deliberately left as the complete saved assembly for places
    // that need to present the recycler vehicle itself.
    this.levelVisuals.forEach((visual, index) => {
      visual.active = (this.presentation === 'HYBRID' || this.presentation === 'MACHINE') && index === level - 1;
    });
    const activeAssembly = this.levelVisuals[level - 1] || null;
    if (activeAssembly?.active) {
      const chassis = activeAssembly.getChildByName('CrawlerChassis') || null;
      if (chassis) chassis.active = this.presentation !== 'HYBRID';
      this.getVisualLibrary().applyActiveLevelMaterials(activeAssembly, level);
      this.materialRebindFrames = 2;
    }

    // 玩法吸附半径可快速增长；视觉外环仅作受控的等级提示，避免高等级
    // 出现覆盖街区、看起来像碰撞范围的浅色大圆。
    if (this.holeRim) {
      // The per-frame feedback multiplies this base, so the level-derived rim
      // size is set here once and the animation layer only adds load and burst.
      const ringScale = this.holeRimBaseScale;
      this.holeRim.setScale(new Vec3(ringScale, 1.0, ringScale));
    }

    // V7 PHASE 4: the singularity's own appearance follows the level.
    // `MACHINE_EVOLUTION_CONFIG` already declares a `baseColor`/`rimColor` per
    // level, but until now nothing read them for the core — so LV1..LV5 differed
    // only by which upgrade assembly was active. The level now drives the rim
    // hue, the additive rim-energy colour, the particle colour, the vortex speed
    // and the funnel depth. A player skin is re-applied last and still wins.
    this.levelAppearance = getSingularityLevelVisuals({
      level,
      baseColor: this.currentConfig.baseColor,
      rimColor: this.currentConfig.rimColor,
    });
    this.applyLevelAppearance();
    if (this.coreNode) {
      this.coreNode.active = this.presentation !== 'MACHINE' && this.presentation !== 'BOT';
      // Arena's local player is intentionally a singularity rather than a
      // crawler. Make that real play target visually dominant without
      // changing the suction radius or collision/gameplay calculations.
      // The prior 1.32 scale read as a small token in portrait play beside
      // the full-size competitor vehicles.
      // Preserve a clear local-player silhouette after the portrait camera
      // widens enough to frame the surrounding city.
      // Arena needs the local singularity to read as the player's focal
      // point, but it must not hide the 1v7 city block, rivals and real
      // pickup clusters behind a screen-filling disc.
      // The actual portrait capture is the authority here: 3.05 filled over
      // half the phone width and obscured the nearby vehicles.  This size
      // keeps the local singularity near the 18–23% target without changing
      // physical suction range, mass or collisions.
      //
      // 1.85 -> 1.92 (2026-09-22). The old `playerWidthRatio` reading was not a
      // framing measurement: it merged the frame-animated decorative layers,
      // and `model.worldBounds` reports a rotating node's rotated *box* AABB, so
      // the number oscillated 0.221-0.304 with HoleRing's 5 s spin period. With
      // the decorations excluded the metric is deterministic, and it measured
      // the structural body at 0.2173 on two consecutive runs — 0.0027 under
      // the LOCKED contract floor of `cameraComposition.playerWidthRatioMin`
      // (0.22). This is a visual-only scale (X/Z; Y is untouched, so
      // `playerScreenYRatio` cannot move): +3.8% takes the silhouette to ~0.2255,
      // inside both the contract band [0.22, 0.30] and this comment's 18-23%
      // intent. It changes no suction radius, mass, or collision.
      const coreScale = this.presentation === 'SINGULARITY' ? 1.92 : 1.32;
      this.coreNode.setScale(coreScale, 1.0, coreScale);
    }
    if (this.presentation === 'BOT') this.ensureArenaBotVisual();
    if (this.arenaBotVisual) this.arenaBotVisual.active = this.presentation === 'BOT';

    // 缩放整体底盘
    const s = this.currentConfig.scale;
    this.node.setScale(new Vec3(s, s, s));

    if (triggerEvent) {
      eventBus.emit('MACHINE_EVOLVED', {
        level: this.currentLevel,
        config: this.currentConfig,
        // A match can contain several real BlackHoleMachine instances. The
        // profile listener must distinguish the local player from arena bots.
        machine: this,
      });
    }
    // Level up is the growth moment the brief asks to be unmistakable, so the
    // rim gets a short burst. Skipped on the silent load path (`triggerEvent`
    // false) because restoring a save is not a player-visible event.
    if (triggerEvent && this.presentation !== 'BOT') {
      this.levelUpFlourish = BlackHoleMachine.LEVEL_UP_FLOURISH_SECONDS;
      this.triggerDevourPulse();
    }
  }

  /**
   * Arena presents the local player as the black hole and opponents as their
   * actual Creator-saved crawler machines, matching the competitive visual
   * language while retaining the same real gameplay component underneath.
   */
  public setPresentation(presentation: MachinePresentation): void {
    if (this.presentation === presentation) return;
    this.presentation = presentation;
    this.applyEvolutionLevel(this.currentLevel, false);
  }

  /**
   * Read-only identity check for presentation-layer listeners. A match can
   * contain several real BlackHoleMachine instances, so MACHINE_EVOLVED
   * consumers must be able to tell a bot apart from the local player without
   * reading private state.
   */
  public isBotPresentation(): boolean {
    return this.presentation === 'BOT';
  }

  /**
   * Gives an arena competitor a distinct visual identity without changing the
   * shared glTF geometry, gameplay mass, collision radius or material of any
   * other world vehicle. Each renderer receives a cloned native Material.
   */
  public setArenaBotTint(hex: string): void {
    this.arenaBotTint = hex;
    this.applyArenaBotTint();
  }

  /**
   * Apply the resolved level look to the core and to the authored effects.
   *
   * Called on every level change, and again at bind time (the level can be
   * applied before the authored asset has bound, in which case there is no
   * renderer to tint yet). The skin is applied last so a chosen skin always
   * wins over the level palette.
   */
  private applyLevelAppearance(): void {
    this.tintCorePart('HoleRing', this.levelAppearance.rimColor);
    this.tintCorePart('ShimmerSwirl', this.levelAppearance.rimColor);
    this.effects?.applyLevel(this.levelAppearance);
    this.applyCoreSkinToCore();
  }

  /**
   * Applies the selected player skin to the actual native MeshRenderers that
   * make up the singularity. This has no bearing on suction radius, mass,
   * collisions or bot materials.
   *
   * V7 PHASE 2B: the skin tints the authored material instance instead of
   * replacing it, so the authored asset stays the definition of the material
   * (effect, technique, blend/depth state) and only the per-part colour varies.
   * When the core has not bound yet the request is recorded and re-applied at
   * bind time, so a skin chosen before the asset arrives is never lost.
   */
  public applyCoreSkin(bodyColor: string, rimColor: string): void {
    if (this.presentation === 'BOT') return;
    this.coreSkin = { bodyColor, rimColor };
    this.applyCoreSkinToCore();
  }

  private applyCoreSkinToCore(): void {
    if (!this.coreSkin) return;
    const { bodyColor, rimColor } = this.coreSkin;
    this.tintCorePart('AbyssBase', bodyColor);
    this.tintCorePart('HoleInner', MACHINE_PALETTE.holeInner);
    this.tintCorePart('InnerSwirl', rimColor);
    this.tintCorePart('MidSwirl', rimColor);
    this.tintCorePart('OuterSwirl', bodyColor);
    this.tintCorePart('ShimmerSwirl', MACHINE_PALETTE.shimmerSwirl);
    this.tintCorePart('HoleRing', rimColor);
  }

  /**
   * Tint one core part through its renderer-local material instance. Writing to
   * the instance (not the shared material) is what keeps a skin from leaking
   * into the authored asset or into another machine.
   */
  private tintCorePart(name: string, hex: string): void {
    const renderer = this.coreNode?.getChildByName(name)?.getComponent(MeshRenderer) || null;
    if (!renderer) return;
    const material = renderer.getMaterialInstance(0);
    if (!material) return;
    const color = new Color();
    Color.fromHEX(color, hex);
    material.setProperty('mainColor', color);
  }

  /**
   * Arena bots use the same Creator-saved, audited bulldozer template that
   * decorates the real streamed world. This prevents a glTF sub-model from
   * falling back to magenta during the first Web Mobile frame while preserving
   * the bot's genuine BlackHoleMachine movement, mass and combat authority.
   */
  private ensureArenaBotVisual(): void {
    if (this.arenaBotVisual || !this.visualRoot) return;
    const library = director.getScene()?.getComponentInChildren(WorldArtLibrary) || null;
    if (!library) throw new Error('[BlackHoleMachine] Missing editor-saved WorldArtLibrary for Arena bot art.');
    this.arenaBotVisual = library.spawn(
      'bulldozer',
      this.visualRoot,
      new Vec3(0, 0.03, 0.88),
      // Keep bot silhouettes readable beside the local singularity instead
      // of allowing a source-scale crawler to dominate the portrait frame.
      // This is a visual child only; the size was calibrated from the real
      // portrait capture so seven opponents remain readable without blocking
      // the actual local target, mass, movement or combat calculations.
      new Vec3(1.45, 1.45, 1.45),
      180,
      'ArenaBotBulldozer',
    );
    this.applyArenaBotTint();
  }

  private applyArenaBotTint(): void {
    if (!this.arenaBotVisual) return;
    const library = director.getScene()?.getComponentInChildren(WorldArtLibrary) || null;
    if (!library) throw new Error('[BlackHoleMachine] Missing editor-saved WorldArtLibrary for Arena bot material.');
    library.applyTintedMaterial('bulldozer', this.arenaBotVisual, this.arenaBotTint);
  }

  public triggerMagnetStorm(duration: number = 6.0): void {
    this.isMagnetStormActive = true;
    this.magnetStormTimer = duration;
    eventBus.emit('MAGNET_STORM_STARTED', { duration });
  }

  public getSuctionRadius(): number {
    const base = this.currentConfig.suctionRadius;
    return this.isMagnetStormActive ? base * 1.8 : base;
  }

  public getMaxTier(): ObjectTier {
    return this.currentConfig.maxTier;
  }

  public getSuctionPullMultiplier(): number {
    return this.currentConfig.suctionPullMultiplier;
  }
}
