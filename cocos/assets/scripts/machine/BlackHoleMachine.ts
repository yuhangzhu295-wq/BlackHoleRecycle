/**
 * 黑洞吸尘机 3D 核心组件与 5 级结构进化系统 (BlackHoleMachine.ts)
 */
import { _decorator, Color, Component, director, MeshRenderer, Node, Vec3, math } from 'cc';
import { IMachineEvolutionConfig, MACHINE_EVOLUTION_CONFIG, ObjectTier } from '../data/GameConfig';
import { eventBus } from '../core/EventBus';
import { MeshFactory } from '../core/MeshFactory';
import { MachineVisualLibrary } from './MachineVisualLibrary';

const { ccclass, property } = _decorator;

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
  private holeRim: Node | null = null;
  private innerSwirl: Node | null = null;
  private outerSwirl: Node | null = null;
  private readonly levelVisuals: Node[] = [];
  private visualElapsed: number = 0;
  private readonly movementDirection: Vec3 = new Vec3();
  private movementMagnitude: number = 0;

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
    this.visualRoot.addChild(this.coreNode);

    // 黑洞中心深渊 (纯黑无反光)
    const holeInner = new Node('HoleInner');
    holeInner.setPosition(0, 0, 0);
    this.coreNode.addChild(holeInner);
    MeshFactory.attachMesh(holeInner, MeshFactory.getCylinderMesh(0.96, 0.96, 0.10), '#05040e', 1.0, 0.0);

    // 三层紫色涡流环：它们是黑洞特效的实体表现，随时间反向转动以传达吞噬感。
    this.innerSwirl = new Node('InnerSwirl');
    this.innerSwirl.setPosition(0, 0.065, 0);
    this.coreNode.addChild(this.innerSwirl);
    MeshFactory.attachMesh(this.innerSwirl, MeshFactory.getTorusMesh(0.40, 0.04), '#b89cff', 0.1, 0.5);

    this.outerSwirl = new Node('OuterSwirl');
    this.outerSwirl.setPosition(0, 0.075, 0);
    this.outerSwirl.setRotationFromEuler(0, 0, 16);
    this.coreNode.addChild(this.outerSwirl);
    MeshFactory.attachMesh(this.outerSwirl, MeshFactory.getTorusMesh(0.70, 0.05), '#7654e8', 0.1, 0.5);

    // 发光外环是黑洞的视觉轮廓，不能被用作真实吸附半径的地图标尺。
    this.holeRim = new Node('HoleRing');
    this.holeRim.setPosition(0, 0.09, 0);
    this.coreNode.addChild(this.holeRim);
    MeshFactory.attachMesh(this.holeRim, MeshFactory.getTorusMesh(0.92, 0.045), '#8f6cf2', 0.1, 0.5);

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
      visual.active = index === level - 1;
    });
    const activeAssembly = this.levelVisuals[level - 1] || null;
    if (activeAssembly) this.getVisualLibrary().applyActiveLevelMaterials(activeAssembly, level);

    // 玩法吸附半径可快速增长；视觉外环仅作受控的等级提示，避免高等级
    // 出现覆盖街区、看起来像碰撞范围的浅色大圆。
    if (this.holeRim) {
      const ringScale = 1.0 + Math.min(0.38, Math.max(0, this.currentConfig.suctionRadius - 2.4) * 0.075);
      this.holeRim.setScale(new Vec3(ringScale, 1.0, ringScale));
    }

    // 缩放整体底盘
    const s = this.currentConfig.scale;
    this.node.setScale(new Vec3(s, s, s));

    if (triggerEvent) {
      eventBus.emit('MACHINE_EVOLVED', {
        level: this.currentLevel,
        config: this.currentConfig
      });
    }
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
