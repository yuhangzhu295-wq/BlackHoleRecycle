/**
 * 黑洞吸尘机 3D 核心组件与 5 级结构进化系统 (BlackHoleMachine.ts)
 */
import { _decorator, Component, Node, Vec3, math, MeshRenderer, Color } from 'cc';
import { IMachineEvolutionConfig, MACHINE_EVOLUTION_CONFIG, ObjectTier } from '../data/GameConfig';
import { eventBus } from '../core/EventBus';
import { MeshFactory } from '../core/MeshFactory';

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
  public targetPos: Vec3 = new Vec3(0, 0, 0);
  public isMagnetStormActive: boolean = false;
  private magnetStormTimer: number = 0;

  // 内部视觉节点容器
  private visualRoot: Node | null = null;
  private bodyMeshRenderer: MeshRenderer | null = null;
  private holeRim: Node | null = null;

  onLoad(): void {
    this.buildVisibleGeometry();
    this.applyEvolutionLevel(1, false);
  }

  /**
   * 自动构建可见的 3D 低模清洁车底盘、四轮、黑洞核心与进化部件
   */
  private buildVisibleGeometry(): void {
    if (this.visualRoot) return;

    this.visualRoot = new Node('VisualRoot');
    this.node.addChild(this.visualRoot);

    // 1. 主车身 (Body)
    const bodyNode = new Node('MainBody');
    bodyNode.setPosition(0, 0.28, 0);
    this.visualRoot.addChild(bodyNode);
    this.bodyMeshRenderer = MeshFactory.attachMesh(
      bodyNode,
      MeshFactory.getBoxMesh(1.0, 0.35, 1.4),
      '#2b7fff',
      0.4,
      0.2
    );

    // 前保险杠
    const bumperNode = new Node('FrontBumper');
    bumperNode.setPosition(0, 0.18, -0.75);
    this.visualRoot.addChild(bumperNode);
    MeshFactory.attachMesh(bumperNode, MeshFactory.getBoxMesh(1.1, 0.2, 0.2), '#1e293b');

    // 2. 四只车轮 (Wheels)
    const wheelPositions = [
      [-0.55, 0.18, -0.45], // FL
      [0.55, 0.18, -0.45],  // FR
      [-0.55, 0.18, 0.45],  // RL
      [0.55, 0.18, 0.45]    // RR
    ];
    for (let i = 0; i < wheelPositions.length; i++) {
      const [wx, wy, wz] = wheelPositions[i];
      const wheel = new Node(`Wheel_${i}`);
      wheel.setPosition(wx, wy, wz);
      this.visualRoot.addChild(wheel);
      MeshFactory.attachMesh(wheel, MeshFactory.getCylinderMesh(0.18, 0.18, 0.14), '#0f172a');
    }

    // 3. 黑洞核心 (Core)
    this.coreNode = new Node('CoreNode');
    this.coreNode.setPosition(0, 0.48, -0.15);
    this.visualRoot.addChild(this.coreNode);

    // 黑洞中心深渊 (纯黑无反光)
    const holeInner = new Node('HoleInner');
    holeInner.setPosition(0, 0, 0);
    this.coreNode.addChild(holeInner);
    MeshFactory.attachMesh(holeInner, MeshFactory.getCylinderMesh(0.42, 0.42, 0.08), '#000000', 1.0, 0.0);

    // 发光外环 (青色 #00e5ff)
    this.holeRim = new Node('HoleRing');
    this.holeRim.setPosition(0, 0.02, 0);
    this.coreNode.addChild(this.holeRim);
    MeshFactory.attachMesh(this.holeRim, MeshFactory.getTorusMesh(0.48, 0.06), '#00e5ff', 0.1, 0.5);

    // 4. LV2 磁力双涡轮 (TurbineNode)
    this.turbineNode = new Node('TurbineRoot');
    this.visualRoot.addChild(this.turbineNode);

    const turbineL = new Node('Turbine_L');
    turbineL.setPosition(-0.75, 0.38, 0.05);
    this.turbineNode.addChild(turbineL);
    MeshFactory.attachMesh(turbineL, MeshFactory.getCylinderMesh(0.25, 0.25, 0.55), '#34c759');

    const turbineR = new Node('Turbine_R');
    turbineR.setPosition(0.75, 0.38, 0.05);
    this.turbineNode.addChild(turbineR);
    MeshFactory.attachMesh(turbineR, MeshFactory.getCylinderMesh(0.25, 0.25, 0.55), '#34c759');

    this.turbineNode.active = false;

    // 5. LV3 冲压压缩机 (CrusherNode)
    this.crusherNode = new Node('CrusherNode');
    this.crusherNode.setPosition(0, 0.65, 0.55);
    this.visualRoot.addChild(this.crusherNode);
    MeshFactory.attachMesh(this.crusherNode, MeshFactory.getBoxMesh(1.1, 0.6, 0.5), '#ff9500');
    this.crusherNode.active = false;

    // 6. LV4 引力稳定翼 (GravityWingNode)
    this.gravityWingNode = new Node('GravityWingNode');
    this.visualRoot.addChild(this.gravityWingNode);

    const wingL = new Node('Wing_L');
    wingL.setPosition(-1.1, 0.45, 0.1);
    this.gravityWingNode.addChild(wingL);
    MeshFactory.attachMesh(wingL, MeshFactory.getBoxMesh(0.8, 0.15, 0.9), '#af52de');

    const wingR = new Node('Wing_R');
    wingR.setPosition(1.1, 0.45, 0.1);
    this.gravityWingNode.addChild(wingR);
    MeshFactory.attachMesh(wingR, MeshFactory.getBoxMesh(0.8, 0.15, 0.9), '#af52de');

    this.gravityWingNode.active = false;

    // 7. LV5 奇点光环 (SingularityHaloNode)
    this.singularityHaloNode = new Node('SingularityHaloNode');
    this.singularityHaloNode.setPosition(0, 1.35, 0);
    this.visualRoot.addChild(this.singularityHaloNode);
    MeshFactory.attachMesh(this.singularityHaloNode, MeshFactory.getTorusMesh(1.1, 0.08), '#ffffff');
    this.singularityHaloNode.active = false;
  }

  public setTargetPosition(x: number, z: number): void {
    // 开放 36m 区域：限制在 [-16.0, 16.0] 范围内畅行无阻
    this.targetPos.x = math.clamp(x, -16.0, 16.0);
    this.targetPos.z = z;
  }

  public isPaused: boolean = false;

  public update(dt: number): void {
    if (this.isPaused || dt <= 0) return;
    // 1. 平滑移动
    const curPos = this.node.getPosition();
    const speed = this.currentConfig.moveSpeed;
    curPos.x = math.lerp(curPos.x, this.targetPos.x, Math.min(1.0, dt * speed * 1.5));
    curPos.z = math.lerp(curPos.z, this.targetPos.z, Math.min(1.0, dt * speed * 1.5));
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
