/**
 * 黑洞吸尘机 3D 核心组件与 5 级结构进化系统 (BlackHoleMachine.ts)
 */
import { _decorator, Component, director, Node, Vec3, math } from 'cc';
import { IMachineEvolutionConfig, MACHINE_EVOLUTION_CONFIG, ObjectTier } from '../data/GameConfig';
import { eventBus } from '../core/EventBus';
import { MeshFactory } from '../core/MeshFactory';
import { WorldArtLibrary } from '../world/WorldArtLibrary';

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
  private visualElapsed: number = 0;
  private readonly movementDirection: Vec3 = new Vec3();
  private movementMagnitude: number = 0;

  onLoad(): void {
    this.buildVisibleGeometry();
    this.applyEvolutionLevel(1, false);
  }

  /**
   * 玩家本体必须首先读作“黑洞”，而不是一辆贴了黑洞图标的汽车。
   * 黑洞圆盘和涡流是特效本体，故使用原生网格；等级外挂（涡轮、压缩模块）
   * 始终使用由 Creator 导入、保存的真实低模资产。
   */
  private buildVisibleGeometry(): void {
    if (this.visualRoot) return;

    this.visualRoot = new Node('VisualRoot');
    this.node.addChild(this.visualRoot);

    const art = this.getArtLibrary();

    // 1. LV1 回收机底盘。它来自 Creator 已导入保存的审计过的履带推土机
    // 网格，不是由 Box/Cylinder 临时拼出的伪车辆。黑洞安装在车体上方，
    // 因此玩家首先仍读作“移动黑洞”，但从轮廓能看出其回收机械身份。
    this.chassisNode = new Node('RecyclingCrawlerChassis');
    this.visualRoot.addChild(this.chassisNode);
    art.spawn(
      'bulldozer',
      this.chassisNode,
      // Keep the carrier behind the suction mouth rather than hidden under it.
      // In the top-down portrait camera this exposes the cab and track outline
      // while leaving the black hole as the leading, readable gameplay core.
      new Vec3(0, 0.02, 0.78),
      new Vec3(1, 1, 1),
      180,
      'AuditedBulldozerChassis'
    );

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

    // 发光外环：等级增长时以真实吸附半径同步扩大。
    this.holeRim = new Node('HoleRing');
    this.holeRim.setPosition(0, 0.09, 0);
    this.coreNode.addChild(this.holeRim);
    MeshFactory.attachMesh(this.holeRim, MeshFactory.getTorusMesh(1.0, 0.06), '#d0c2ff', 0.1, 0.5);

    // 3. LV2 磁力双涡轮 (TurbineNode)
    this.turbineNode = new Node('TurbineRoot');
    this.visualRoot.addChild(this.turbineNode);

    art.spawn('turbineWheel', this.turbineNode, new Vec3(-1.48, 0.34, 0.05), new Vec3(0.72, 0.72, 0.72), 0, 'MagneticTurbineLeft');
    art.spawn('turbineWheel', this.turbineNode, new Vec3(1.48, 0.34, 0.05), new Vec3(0.72, 0.72, 0.72), 0, 'MagneticTurbineRight');

    this.turbineNode.active = false;

    // 4. LV3 冲压压缩机 (CrusherNode)
    this.crusherNode = new Node('CrusherNode');
    this.visualRoot.addChild(this.crusherNode);
    art.spawn('recyclingBox', this.crusherNode, new Vec3(0, 0.48, 0.58), new Vec3(1.45, 0.85, 1.1), 0, 'CompressionModule');
    this.crusherNode.active = false;

    // 5. LV4 引力稳定翼 (GravityWingNode)
    this.gravityWingNode = new Node('GravityWingNode');
    this.visualRoot.addChild(this.gravityWingNode);

    art.spawn('turbineWheel', this.gravityWingNode, new Vec3(-1.8, 0.38, 0.05), new Vec3(1.15, 0.5, 1.15), 0, 'GravityWingLeft');
    art.spawn('turbineWheel', this.gravityWingNode, new Vec3(1.8, 0.38, 0.05), new Vec3(1.15, 0.5, 1.15), 0, 'GravityWingRight');

    this.gravityWingNode.active = false;

    // 6. LV5 奇点光环 (SingularityHaloNode)
    this.singularityHaloNode = new Node('SingularityHaloNode');
    this.singularityHaloNode.setPosition(0, 1.35, 0);
    this.visualRoot.addChild(this.singularityHaloNode);
    MeshFactory.attachMesh(this.singularityHaloNode, MeshFactory.getTorusMesh(1.1, 0.08), '#ffffff');
    this.singularityHaloNode.active = false;
  }

  private getArtLibrary(): WorldArtLibrary {
    const library = director.getScene()?.getComponentInChildren(WorldArtLibrary) || null;
    if (!library) throw new Error('[BlackHoleMachine] Missing editor-saved WorldArtLibrary; production chassis fallback is prohibited.');
    return library;
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

    // 结构模块显隐控制
    if (this.turbineNode) {
      this.turbineNode.active = level >= 2;
    }
    if (this.crusherNode) {
      this.crusherNode.active = level >= 3;
    }
    if (this.gravityWingNode) {
      this.gravityWingNode.active = level >= 4;
    }
    if (this.singularityHaloNode) {
      this.singularityHaloNode.active = level >= 5;
    }

    // 缩放吸力外环
    if (this.holeRim) {
      const ringScale = Math.max(1.0, this.currentConfig.suctionRadius / 2.4);
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
