/**
 * 可吸附压缩物体组件 (CompressibleObject.ts)
 * 具备 IDLE -> ATTRACTED -> SUCKING -> ABSORBED -> RECYCLED 完整状态机
 */
import { _decorator, Component, Node, Vec3 } from 'cc';
import { IObjectTemplate, ObjectTier, OBJECT_TEMPLATES } from '../data/GameConfig';
import { SuctionMotionCalculator } from './SuctionMotion';
import { FSM } from '../core/FSM';

const { ccclass, property } = _decorator;

export type ObjectMotionState = 'IDLE' | 'ATTRACTED' | 'SUCKING' | 'ABSORBED' | 'RECYCLED';

@ccclass('CompressibleObject')
export class CompressibleObject extends Component {
  public template: IObjectTemplate = OBJECT_TEMPLATES[0];

  private fsm: FSM<ObjectMotionState> = new FSM<ObjectMotionState>('IDLE', this);
  private currentPos: Vec3 = new Vec3();
  private suckTimer: number = 0;
  private isLockAlertActive: boolean = false;
  private lockTimer: number = 0;

  onLoad(): void {
    this.initFSM();
  }

  private initFSM(): void {
    this.fsm
      .registerState('IDLE', {
        enter: () => {
          this.suckTimer = 0;
          this.node.setScale(Vec3.ONE);
        }
      })
      .registerState('ATTRACTED', {
        enter: () => {}
      })
      .registerState('SUCKING', {
        enter: () => {
          this.suckTimer = 0;
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
    this.fsm.setState('IDLE');
  }

  public getState(): ObjectMotionState {
    return this.fsm.getState();
  }

  public showLockAlert(): void {
    if (this.lockTimer > 0) return;
    this.isLockAlertActive = true;
    this.lockTimer = 1.0;
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
