/**
 * 黑洞吸尘机 3D 核心组件与 5 级结构进化系统 (BlackHoleMachine.ts)
 */
import { _decorator, Color, Component, director, MeshRenderer, Node, Vec3, math } from 'cc';
import { IMachineEvolutionConfig, MACHINE_EVOLUTION_CONFIG, ObjectTier } from '../data/GameConfig';
import { eventBus } from '../core/EventBus';
import { MeshFactory } from '../core/MeshFactory';
import { MachineVisualLibrary } from './MachineVisualLibrary';
import { WorldArtLibrary } from '../world/WorldArtLibrary';

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

  // 内部视觉节点容器
  private visualRoot: Node | null = null;
  private chassisNode: Node | null = null;
  /** Creator-saved audited bulldozer instance used by Arena opponents. */
  private arenaBotVisual: Node | null = null;
  private holeRim: Node | null = null;
  private innerSwirl: Node | null = null;
  private outerSwirl: Node | null = null;
  private readonly levelVisuals: Node[] = [];
  private visualElapsed: number = 0;
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
  private arenaBotTint: string = '#35a85e';

  onLoad(): void {
    this.buildVisibleGeometry();
    this.applyEvolutionLevel(1, false);
  }

  /**
   * 玩家本体必须首先读作“黑洞”，而不是一辆贴了黑洞图标的汽车。
   * 黑洞圆盘和涡流是特效本体，故使用原生网格；五个等级的车体结构
   * 始终实例化由 Creator 保存的真实低模预制体。
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
    this.coreNode = new Node('CoreNode');
    this.coreNode.setPosition(0, 0.16, 0);
    // The singularity is the game's primary interactive affordance. Scale its
    // visual layers together (not its physical suction radius) so it remains
    // legible in a mobile isometric city without changing game balance.
    this.coreNode.setScale(1.32, 1.0, 1.32);
    this.visualRoot.addChild(this.coreNode);

    // A deep-violet body keeps the singularity readable against the green
    // district before the animated black core and luminous rings are added.
    const abyssBase = new Node('AbyssBase');
    abyssBase.setPosition(0, 0.01, 0);
    this.coreNode.addChild(abyssBase);
    MeshFactory.attachMesh(abyssBase, MeshFactory.getCylinderMesh(1.10, 1.10, 0.055, 64), '#281660', 1.0, 0.0);

    // Black centre (visual only; this is deliberately smaller than the rim
    // so the full object reads as a glossy vortex instead of a flat void).
    const holeInner = new Node('HoleInner');
    holeInner.setPosition(0, 0.06, 0);
    this.coreNode.addChild(holeInner);
    MeshFactory.attachMesh(holeInner, MeshFactory.getCylinderMesh(0.56, 0.56, 0.075, 64), '#05040e', 1.0, 0.0);

    // 三层紫色涡流环：它们是黑洞特效的实体表现，随时间反向转动以传达吞噬感。
    this.innerSwirl = new Node('InnerSwirl');
    this.innerSwirl.setPosition(0, 0.105, 0);
    this.coreNode.addChild(this.innerSwirl);
    MeshFactory.attachMesh(this.innerSwirl, MeshFactory.getTorusMesh(0.38, 0.035), '#e0d5ff', 0.1, 0.5);

    this.outerSwirl = new Node('OuterSwirl');
    this.outerSwirl.setPosition(0, 0.115, 0);
    this.outerSwirl.setRotationFromEuler(0, 0, 16);
    this.coreNode.addChild(this.outerSwirl);
    MeshFactory.attachMesh(this.outerSwirl, MeshFactory.getTorusMesh(0.72, 0.045), '#8b62f4', 0.1, 0.5);

    // 发光外环是黑洞的视觉轮廓，不能被用作真实吸附半径的地图标尺。
    this.holeRim = new Node('HoleRing');
    this.holeRim.setPosition(0, 0.125, 0);
    this.coreNode.addChild(this.holeRim);
    MeshFactory.attachMesh(this.holeRim, MeshFactory.getTorusMesh(1.03, 0.04), '#c8adff', 0.1, 0.5);

  }

  private getVisualLibrary(): MachineVisualLibrary {
    const library = director.getScene()?.getComponentInChildren(MachineVisualLibrary) || null;
    if (!library) throw new Error('[BlackHoleMachine] Missing editor-saved MachineVisualLibrary; primitive machine fallbacks are prohibited.');
    return library;
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

  /** Receives camera-relative, normalized intent. It contains no arena/world boundary logic. */
  public setMovementDirection(direction: Readonly<Vec3>, magnitude: number): void {
    this.movementDirection.set(direction.x, 0, direction.z);
    if (this.movementDirection.lengthSqr() > 0.0001) this.movementDirection.normalize();
    this.movementMagnitude = math.clamp01(magnitude);
  }

  public stopMovement(): void {
    this.movementMagnitude = 0;
    this.movementDirection.set(0, 0, 0);
  }

  public resetMovement(): void {
    this.stopMovement();
    this.velocity.set(0, 0, 0);
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
    this.visualElapsed += dt;
    if (this.innerSwirl) this.innerSwirl.setRotationFromEuler(0, this.visualElapsed * 90, 10);
    if (this.outerSwirl) this.outerSwirl.setRotationFromEuler(0, -this.visualElapsed * 55, 16);
    if (this.holeRim) this.holeRim.setRotationFromEuler(0, this.visualElapsed * 18, 0);
    // 1. Continuous velocity integration. Boundaries belong to arena/world systems,
    // never to this reusable machine component.
    const curPos = this.node.getPosition();
    const speed = this.currentConfig.moveSpeed * this.movementMagnitude;
    const targetVelocityX = this.movementDirection.x * speed;
    const targetVelocityZ = this.movementDirection.z * speed;
    const response = Math.min(1.0, dt * (this.movementMagnitude > 0 ? 18 : 32));
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

    // Exactly one full Creator-saved machine assembly is visible. Higher
    // levels therefore have genuinely different silhouettes and components.
    this.levelVisuals.forEach((visual, index) => {
      visual.active = (this.presentation === 'HYBRID' || this.presentation === 'MACHINE') && index === level - 1;
    });
    const activeAssembly = this.levelVisuals[level - 1] || null;
    if (activeAssembly?.active) {
      this.getVisualLibrary().applyActiveLevelMaterials(activeAssembly, level);
      this.materialRebindFrames = 2;
    }

    // 玩法吸附半径可快速增长；视觉外环仅作受控的等级提示，避免高等级
    // 出现覆盖街区、看起来像碰撞范围的浅色大圆。
    if (this.holeRim) {
      const ringScale = 1.0 + Math.min(0.38, Math.max(0, this.currentConfig.suctionRadius - 2.4) * 0.075);
      this.holeRim.setScale(new Vec3(ringScale, 1.0, ringScale));
    }
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
      const coreScale = this.presentation === 'SINGULARITY' ? 1.85 : 1.32;
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
   * Gives an arena competitor a distinct visual identity without changing the
   * shared glTF geometry, gameplay mass, collision radius or material of any
   * other world vehicle. Each renderer receives a cloned native Material.
   */
  public setArenaBotTint(hex: string): void {
    this.arenaBotTint = hex;
    this.applyArenaBotTint();
  }

  /**
   * Applies the selected player skin to the actual native MeshRenderers that
   * make up the singularity. This has no bearing on suction radius, mass,
   * collisions or bot materials.
   */
  public applyCoreSkin(bodyColor: string, rimColor: string): void {
    if (this.presentation === 'BOT') return;
    this.setCorePartMaterial('AbyssBase', bodyColor, 1.0, 0.0);
    this.setCorePartMaterial('HoleInner', '#05040e', 1.0, 0.0);
    this.setCorePartMaterial('InnerSwirl', rimColor, 0.1, 0.5);
    this.setCorePartMaterial('OuterSwirl', bodyColor, 0.1, 0.5);
    this.setCorePartMaterial('HoleRing', rimColor, 0.1, 0.5);
  }

  private setCorePartMaterial(name: string, hex: string, roughness: number, metallic: number): void {
    const renderer = this.coreNode?.getChildByName(name)?.getComponent(MeshRenderer) || null;
    renderer?.setMaterial(MeshFactory.getMaterial(hex, roughness, metallic), 0);
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
}
