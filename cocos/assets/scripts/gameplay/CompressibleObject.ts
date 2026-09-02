/**
 * 可吸附回收实体：维护 IDLE -> ATTRACTED -> SUCKING -> ABSORBED -> RECYCLED
 * 状态机。正式可见物仅实例化 Cocos Creator 导入并保存的 glTF 美术模板。
 */
import { _decorator, Component, director, Node, Vec3 } from 'cc';
import { IObjectTemplate, ObjectTier, OBJECT_TEMPLATES } from '../data/GameConfig';
import { SuctionMotionCalculator } from './SuctionMotion';
import { FSM } from '../core/FSM';
import { WorldArtKind, WorldArtLibrary } from '../world/WorldArtLibrary';

const { ccclass } = _decorator;

export type ObjectMotionState = 'IDLE' | 'ATTRACTED' | 'SUCKING' | 'ABSORBED' | 'RECYCLED';

interface IObjectVisualDefinition {
  readonly kind: WorldArtKind;
  readonly scale: Vec3;
  readonly yOffset: number;
  readonly yaw: number;
}

@ccclass('CompressibleObject')
export class CompressibleObject extends Component {
  public template: IObjectTemplate = OBJECT_TEMPLATES[0];
  public runtimeId: string = '';

  private fsm: FSM<ObjectMotionState> = new FSM<ObjectMotionState>('IDLE', this);
  private currentPos: Vec3 = new Vec3();
  private suckTimer: number = 0;
  private isLockAlertActive: boolean = false;
  private lockTimer: number = 0;
  private visualNode: Node | null = null;
  private lockIndicatorNode: Node | null = null;

  public getPosition(): Vec3 {
    return this.currentPos;
  }

  onLoad(): void {
    this.buildVisibleNode();
    this.initFSM();
  }

  private buildVisibleNode(): void {
    if (this.visualNode) return;

    this.visualNode = new Node('Visual');
    this.node.addChild(this.visualNode);

    // 锁定反馈复用审计的锥桶模型，而不是红色 Box 占位符。
    this.lockIndicatorNode = new Node('TierLockWarning');
    this.lockIndicatorNode.setPosition(0, 0.8, 0);
    this.node.addChild(this.lockIndicatorNode);
    this.getArtLibrary().spawn(
      'constructionCone',
      this.lockIndicatorNode,
      Vec3.ZERO,
      new Vec3(3.5, 3.5, 3.5),
      0,
      'TierLockedWarning'
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
          this.suckTimer = 0;
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
          this.node.setScale(Vec3.ZERO);
          this.node.active = false;
        }
      })
      .registerState('RECYCLED', {
        enter: () => {
          this.node.active = false;
        }
      });
  }

  public spawn(template: IObjectTemplate, x: number, z: number, y: number = 0.35, customId?: string): void {
    this.template = template;
    this.runtimeId = customId || `${template.type}_${Math.round(x * 10)}_${Math.round(z * 10)}`;
    this.currentPos.set(x, y, z);
    this.node.setPosition(this.currentPos);
    this.node.setScale(Vec3.ONE);
    this.node.active = true;
    this.suckTimer = 0;
    this.isLockAlertActive = false;
    this.lockTimer = 0;

    this.buildVisibleNode();
    this.applyTemplateArt();
    this.fsm.setState('IDLE');
  }

  private applyTemplateArt(): void {
    if (!this.visualNode) return;
    this.visualNode.removeAllChildren();
    const definition = this.getVisualDefinition(this.template.type);
    this.getArtLibrary().spawn(
      definition.kind,
      this.visualNode,
      new Vec3(0, definition.yOffset, 0),
      definition.scale,
      definition.yaw,
      `Art_${this.template.type}`
    );
  }

  /** 每种可吞噬实体有明确的、已审计的真实模型绑定。 */
  private getVisualDefinition(type: string): IObjectVisualDefinition {
    switch (type) {
      case 'soda_can': return { kind: 'recyclingBolt', scale: new Vec3(1.1, 1.1, 1.1), yOffset: 0, yaw: 0 };
      case 'water_bottle': return { kind: 'recyclingBolt', scale: new Vec3(1.25, 1.25, 1.25), yOffset: 0, yaw: 90 };
      case 'battery': return { kind: 'recyclingBolt', scale: new Vec3(1.4, 1.4, 1.4), yOffset: 0, yaw: 45 };
      case 'toy': return { kind: 'recyclingBox', scale: new Vec3(0.55, 0.55, 0.55), yOffset: 0, yaw: 20 };
      case 'apple': return { kind: 'recyclingBolt', scale: new Vec3(0.9, 0.9, 0.9), yOffset: 0, yaw: 135 };
      case 'paper_ball': return { kind: 'recyclingBolt', scale: new Vec3(0.8, 0.8, 0.8), yOffset: 0, yaw: 180 };
      case 'book_stack': return { kind: 'recyclingBox', scale: new Vec3(0.8, 0.45, 0.8), yOffset: 0, yaw: 45 };
      case 'cardboard_box': return { kind: 'recyclingBox', scale: new Vec3(0.95, 0.8, 0.95), yOffset: 0, yaw: 0 };
      case 'cone': return { kind: 'constructionCone', scale: new Vec3(7, 7, 7), yOffset: 0, yaw: 0 };
      case 'trash_bag': return { kind: 'tire', scale: new Vec3(1.6, 1.6, 1.6), yOffset: 0.25, yaw: 0 };
      case 'paint_bucket': return { kind: 'recyclingBox', scale: new Vec3(0.65, 0.65, 0.65), yOffset: 0, yaw: 30 };
      case 'chair': return { kind: 'tire', scale: new Vec3(2.2, 2.2, 2.2), yOffset: 0.5, yaw: 90 };
      case 'small_table': return { kind: 'recyclingBox', scale: new Vec3(1.8, 1.1, 1.4), yOffset: 0, yaw: 20 };
      case 'monitor': return { kind: 'recyclingBox', scale: new Vec3(1.5, 1.15, 0.6), yOffset: 0, yaw: 0 };
      case 'tire': return { kind: 'tire', scale: new Vec3(2.5, 2.5, 2.5), yOffset: 0.7, yaw: 0 };
      case 'shelf': return { kind: 'recyclingBox', scale: new Vec3(3.5, 4.5, 1.7), yOffset: 0, yaw: 0 };
      case 'crate': return { kind: 'recyclingBox', scale: new Vec3(4.2, 4.2, 4.2), yOffset: 0, yaw: 30 };
      case 'sofa': return { kind: 'deliveryVan', scale: new Vec3(1.25, 1.25, 0.65), yOffset: 0.4, yaw: 90 };
      case 'car': return { kind: 'sedan', scale: new Vec3(1.35, 1.35, 1.35), yOffset: 0.4, yaw: 0 };
      case 'container': return { kind: 'deliveryVan', scale: new Vec3(2.5, 2.5, 2.5), yOffset: 0.75, yaw: 0 };
      default: throw new Error(`[CompressibleObject] No audited art binding for ${type}.`);
    }
  }

  private getArtLibrary(): WorldArtLibrary {
    const library = director.getScene()?.getComponentInChildren(WorldArtLibrary) || null;
    if (!library) throw new Error('[CompressibleObject] Missing editor-saved WorldArtLibrary; primitive fallback is prohibited.');
    return library;
  }

  public getState(): ObjectMotionState {
    return this.fsm.getState();
  }

  public showLockAlert(): void {
    if (this.lockTimer > 0) return;
    this.isLockAlertActive = true;
    this.lockTimer = 1.0;
    if (this.lockIndicatorNode) this.lockIndicatorNode.active = true;
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
    if (state === 'IDLE') {
      if (distSq < suctionRadius * suctionRadius) {
        if (this.template.tier > machineMaxTier && !isMagnetStorm) this.showLockAlert();
        else this.fsm.setState('ATTRACTED');
      }
      return false;
    }

    if (state === 'ATTRACTED' || state === 'SUCKING') {
      if (state === 'SUCKING') this.suckTimer += dt;
      else if (Math.sqrt(distSq) < 0.6) this.fsm.setState('SUCKING');

      const result = SuctionMotionCalculator.computeMotion(
        this.currentPos, machinePos, suctionRadius, dt, this.suckTimer, 0.4, isMagnetStorm
      );
      this.currentPos.set(result.newPosition);
      this.node.setPosition(this.currentPos);
      this.node.setScale(result.newScale);
      if (result.isAbsorbed) {
        this.fsm.setState('ABSORBED');
        return true;
      }
    }
    return false;
  }

  public recycle(): void {
    this.fsm.setState('RECYCLED');
  }
}
