/**
 * 可吸附回收实体：维护 IDLE -> ATTRACTED -> SUCKING -> ABSORBED -> RECYCLED
 * 状态机。正式可见物仅实例化 Cocos Creator 导入并保存的 glTF 美术模板。
 */
import { _decorator, Component, director, Node, Vec3 } from 'cc';
import { IObjectTemplate, ObjectTier, OBJECT_TEMPLATES } from '../data/GameConfig';
import { SuctionMotionCalculator } from './SuctionMotion';
import { FSM } from '../core/FSM';
import { getObjectArtBinding } from '../world/ObjectArtRegistry';
import { WorldArtLibrary } from '../world/WorldArtLibrary';

const { ccclass } = _decorator;

export type ObjectMotionState = 'IDLE' | 'ATTRACTED' | 'SUCKING' | 'ABSORBED' | 'RECYCLED';

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

  /** Keep render-space pooled objects aligned when the infinite world rebases. */
  public applyWorldRebase(shift: Readonly<Vec3>): void {
    this.currentPos.subtract(shift);
    this.node.setPosition(this.currentPos);
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
    const definition = getObjectArtBinding(this.template.type);
    this.getArtLibrary().spawn(
      definition.kind,
      this.visualNode,
      new Vec3(0, definition.yOffset, 0),
      definition.scale,
      definition.yaw,
      `Art_${this.template.type}`
    );
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
