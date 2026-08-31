/**
 * 可吸附压缩物体组件 (CompressibleObject.ts)
 * 具备真实可见 3D 网格渲染、等级锁标指示与 IDLE -> ATTRACTED -> SUCKING -> ABSORBED -> RECYCLED 完整状态机
 */
import { _decorator, Component, Node, Vec3, MeshRenderer } from 'cc';
import { IObjectTemplate, ObjectTier, OBJECT_TEMPLATES, ObjectShape } from '../data/GameConfig';
import { SuctionMotionCalculator } from './SuctionMotion';
import { FSM } from '../core/FSM';
import { MeshFactory } from '../core/MeshFactory';

const { ccclass } = _decorator;

export type ObjectMotionState = 'IDLE' | 'ATTRACTED' | 'SUCKING' | 'ABSORBED' | 'RECYCLED';

@ccclass('CompressibleObject')
export class CompressibleObject extends Component {
  public template: IObjectTemplate = OBJECT_TEMPLATES[0];

  private fsm: FSM<ObjectMotionState> = new FSM<ObjectMotionState>('IDLE', this);
  private currentPos: Vec3 = new Vec3();
  private suckTimer: number = 0;
  private isLockAlertActive: boolean = false;
  private lockTimer: number = 0;

  private visualNode: Node | null = null;
  private lockIndicatorNode: Node | null = null;
  private meshRenderer: MeshRenderer | null = null;

  onLoad(): void {
    this.buildVisibleNode();
    this.initFSM();
  }

  private buildVisibleNode(): void {
    if (this.visualNode) return;

    this.visualNode = new Node('Visual');
    this.node.addChild(this.visualNode);

    this.lockIndicatorNode = new Node('LockIndicator');
    this.lockIndicatorNode.setPosition(0, 0.8, 0);
    this.node.addChild(this.lockIndicatorNode);

    // 锁标：小型红色高亮标记
    MeshFactory.attachMesh(
      this.lockIndicatorNode,
      MeshFactory.getBoxMesh(0.3, 0.3, 0.1),
      '#e11d48',
      0.3,
      0.5
    );
    this.lockIndicatorNode.active = false;
  }

  private initFSM(): void {
    this.fsm
      .registerState('IDLE', {
        enter: () => {
          this.suckTimer = 0;
          this.node.setScale(Vec3.ONE);
          if (this.lockIndicatorNode) this.lockIndicatorNode.active = false;
        }
      })
      .registerState('ATTRACTED', {
        enter: () => {
          if (this.lockIndicatorNode) this.lockIndicatorNode.active = false;
        }
      })
      .registerState('SUCKING', {
        enter: () => {
          this.suckTimer = 0;
          if (this.lockIndicatorNode) this.lockIndicatorNode.active = false;
        }
      })
      .registerState('ABSORBED', {
        enter: () => {
          this.node.active = false;
        }
      })
      .registerState('RECYCLED', {
        enter: () => {
          this.node.active = false;
        }
      });
  }

  public spawn(template: IObjectTemplate, x: number, z: number, y: number = 0.35): void {
    this.template = template;
    this.currentPos.set(x, y, z);
    this.node.setPosition(this.currentPos);
    this.node.setScale(Vec3.ONE);
    this.node.active = true;
    this.suckTimer = 0;
    this.isLockAlertActive = false;
    this.lockTimer = 0;

    this.buildVisibleNode();
    this.applyTemplateMesh();
    this.fsm.setState('IDLE');
  }

  private applyTemplateMesh(): void {
    if (!this.visualNode) return;
    this.visualNode.removeAllChildren();

    const t = this.template;

    if (t.type === 'soda_can' || t.type === 'water_bottle' || t.type === 'battery') {
      const node = new Node('Body');
      this.visualNode.addChild(node);
      const h = t.height || 0.5;
      const mesh = MeshFactory.getCylinderMesh(t.radius, t.radius, h);
      this.meshRenderer = MeshFactory.attachMesh(node, mesh, t.color, 0.5, 0.3);

      if (t.type === 'soda_can') {
        const top = new Node('Top');
        top.setPosition(0, h / 2 + 0.05, 0);
        this.visualNode.addChild(top);
        MeshFactory.attachMesh(top, MeshFactory.getCylinderMesh(t.radius * 0.8, t.radius * 0.8, 0.1), '#d1d5db', 0.8, 0.8);
      }
    } else if (t.type === 'book_stack') {
      const s = t.size || [0.5, 0.3, 0.5];
      const node = new Node('Book1');
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], s[1]*0.6, s[2]), t.color, 0.8, 0.1);
      
      const node2 = new Node('Book2');
      node2.setPosition(0, s[1]*0.6, 0);
      this.visualNode.addChild(node2);
      MeshFactory.attachMesh(node2, MeshFactory.getBoxMesh(s[0]*0.9, s[1]*0.4, s[2]*0.9), '#ffffff', 0.8, 0.1);
    } else if (t.type === 'chair') {
      const s = t.size || [0.8, 1.2, 0.8];
      const node = new Node('Seat');
      node.setPosition(0, s[1]*0.4, 0);
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], 0.2, s[2]), t.color, 0.8, 0.1);
      
      const back = new Node('Back');
      back.setPosition(0, s[1]*0.8, -s[2]*0.4);
      this.visualNode.addChild(back);
      MeshFactory.attachMesh(back, MeshFactory.getBoxMesh(s[0], s[1]*0.6, 0.2), t.color, 0.8, 0.1);
    } else if (t.type === 'small_table') {
      const s = t.size || [1.5, 0.6, 1.0];
      const node = new Node('Top');
      node.setPosition(0, s[1], 0);
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], 0.1, s[2]), t.color, 0.7, 0.1);
    } else if (t.type === 'monitor') {
      const s = t.size || [1.2, 0.8, 0.3];
      const node = new Node('Screen');
      node.setPosition(0, s[1]*0.5, 0);
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], s[1], s[2]), t.color, 0.5, 0.8);
    } else if (t.type === 'shelf') {
      const s = t.size || [2.5, 3.5, 1.0];
      const node = new Node('Frame');
      node.setPosition(0, s[1]*0.5, 0);
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], s[1], s[2]), t.color, 0.5, 0.9);
    } else if (t.type === 'car') {
      const s = t.size || [2.5, 1.5, 4.5];
      const node = new Node('Chassis');
      node.setPosition(0, s[1]*0.3, 0);
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], s[1]*0.6, s[2]), t.color, 0.3, 0.8);
      
      const top = new Node('Top');
      top.setPosition(0, s[1]*0.8, -s[2]*0.1);
      this.visualNode.addChild(top);
      MeshFactory.attachMesh(top, MeshFactory.getBoxMesh(s[0]*0.9, s[1]*0.4, s[2]*0.5), '#111111', 0.2, 0.9);
    } else if (t.shape === ObjectShape.BOX) {
      const s = t.size || [0.6, 0.5, 0.6];
      const node = new Node('Box');
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], s[1], s[2]), t.color, 0.9, 0.0);
    } else if (t.shape === ObjectShape.CONE) {
      const node = new Node('Cone');
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getConeMesh(t.radius, t.height || 0.7), t.color, 0.6, 0.1);
      
      const base = new Node('Base');
      base.setPosition(0, - (t.height || 0.7) / 2, 0);
      this.visualNode.addChild(base);
      MeshFactory.attachMesh(base, MeshFactory.getBoxMesh(t.radius*2.2, 0.1, t.radius*2.2), '#ffffff', 0.6, 0.1);
    } else {
      const node = new Node('Default');
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getSphereMesh(t.radius), t.color, 0.5, 0.1);
    }
  }

  public getState(): ObjectMotionState {
    return this.fsm.getState();
  }

  public showLockAlert(): void {
    if (this.lockTimer > 0) return;
    this.isLockAlertActive = true;
    this.lockTimer = 1.0;
    if (this.lockIndicatorNode) {
      this.lockIndicatorNode.active = true;
    }
  }

  public isShowingLockAlert(): boolean {
    return this.isLockAlertActive;
  }

  public updateMotion(
    dt: number,
    machinePos: Vec3,
    suctionRadius: number,
    machineMaxTier: ObjectTier,
    isMagnetStorm: boolean = false
  ): boolean {
    const state = this.fsm.getState();
    if (state === 'ABSORBED' || state === 'RECYCLED') return false;

    // 更新等级锁标计时
    if (this.lockTimer > 0) {
      this.lockTimer -= dt;
      if (this.lockTimer <= 0) {
        this.isLockAlertActive = false;
        if (this.lockIndicatorNode) this.lockIndicatorNode.active = false;
      }
    }

    const dx = machinePos.x - this.currentPos.x;
    const dz = machinePos.z - this.currentPos.z;
    const distSq = dx * dx + dz * dz;

    // 1. IDLE 状态下距离与 Tier 判定
    if (state === 'IDLE') {
      if (distSq < suctionRadius * suctionRadius) {
        if (this.template.tier > machineMaxTier && !isMagnetStorm) {
          this.showLockAlert();
        } else {
          this.fsm.setState('ATTRACTED');
        }
      }
      return false;
    }

    // 2. 引力吸附与下潜动力学
    if (state === 'ATTRACTED' || state === 'SUCKING') {
      if (state === 'SUCKING') {
        this.suckTimer += dt;
      } else if (Math.sqrt(distSq) < 0.6) {
        this.fsm.setState('SUCKING');
      }

      const res = SuctionMotionCalculator.computeMotion(
        this.currentPos,
        machinePos,
        suctionRadius,
        dt,
        this.suckTimer,
        0.4,
        isMagnetStorm
      );

      this.currentPos.set(res.newPosition);
      this.node.setPosition(this.currentPos);
      this.node.setScale(res.newScale);

      if (res.isAbsorbed) {
        this.fsm.setState('ABSORBED');
        return true; // 返回 true 表示本帧成功吞噬
      }
    }

    return false;
  }

  public recycle(): void {
    this.fsm.setState('RECYCLED');
  }
}
