/**
 * 可吸附回收实体：维护 IDLE -> ATTRACTED -> SUCKING -> ABSORBED -> RECYCLED
 * 状态机。正式可见物仅实例化 Cocos Creator 导入并保存的 glTF 美术模板。
 */
import { _decorator, Color, Component, director, Label, Node, Vec3 } from 'cc';
import { IObjectTemplate, ObjectTier, OBJECT_TEMPLATES } from '../data/GameConfig';
import { getSuctionTierProfile, SuctionMotionCalculator } from './SuctionMotion';
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
  /** 锁定提示冷却：提示消失后数秒内不重复弹出，避免高 Tier 目标头顶持续闪烁。 */
  private lockCooldownTimer: number = 0;
  private visualNode: Node | null = null;
  private lockIndicatorNode: Node | null = null;
  private lockLabel: Label | null = null;
  /** The actual machine currently pulling this entity into its black hole. */
  private captureOwnerId: string | null = null;
  /** Optional physical spin for a real moving vehicle during the shared suction FSM. */
  private suctionSpinDegreesPerSecond: number = 0;
  private visualYawDegrees: number = 0;
  private visualRollDegrees: number = 0;
  /**
   * V4 reference 09 legibility clock. How long this body has visibly been
   * fighting the pull. Read-only presentation state; it never affects motion,
   * mass, tier or the suction profile.
   */
  private strainSeconds: number = 0;
  /**
   * Ordered motion-state transitions since the last entry into IDLE.
   *
   * The suction window is far shorter than a runtime observation can sample:
   * for tier 1 the object is ATTRACTED for roughly 0.2s and then SUCKING for
   * `suckDuration` = 0.35s, while one full QA composition snapshot blocks the
   * browser main thread for longer than that. Recording the sequence here lets
   * a lifecycle gate read the true order instead of racing it. Mirrors the
   * existing `CompressionSystem.stateHistory` diagnostic.
   */
  public stateHistory: ObjectMotionState[] = ['IDLE'];
  private static readonly STATE_HISTORY_LIMIT = 16;

  public getPosition(): Vec3 {
    return this.currentPos;
  }

  /** Read-only ordered FSM evidence; see `stateHistory`. */
  public getStateHistory(): readonly ObjectMotionState[] {
    return this.stateHistory;
  }

  /**
   * Single transition entry point for this entity's motion FSM.
   *
   * `FSM.setState` reports whether the state actually changed, so a no-op
   * transition is never recorded. Entering IDLE starts a new lifecycle, so the
   * history always describes exactly the current attraction attempt.
   */
  private transitionTo(nextState: ObjectMotionState): void {
    if (!this.fsm.setState(nextState)) return;
    if (nextState === 'IDLE') this.stateHistory.length = 0;
    this.stateHistory.push(nextState);
    if (this.stateHistory.length > CompressibleObject.STATE_HISTORY_LIMIT) this.stateHistory.shift();
  }

  /**
   * Used solely by real route-driven dynamic entities while they remain IDLE.
   * Once a vehicle enters the existing attraction FSM, the suction system owns
   * its position and this method intentionally becomes a no-op.
   */
  public setRoutePosition(x: number, z: number, yawDegrees: number): void {
    this.relocateIdle(x, z, yawDegrees);
  }

  /**
   * DynamicVehicle configures this after spawning from an ordinary T5 vehicle
   * template. No mass, tier or state is altered; it only makes the existing
   * attraction/suction motion legible for a large vehicle.
   */
  public setSuctionSpin(degreesPerSecond: number): void {
    this.suctionSpinDegreesPerSecond = Math.max(0, degreesPerSecond);
  }

  /**
   * Reposition an existing, still-idle world object without changing its
   * template, tier, mass or suction state. Dynamic traffic and arena setup
   * share this instead of manufacturing a cosmetic duplicate.
   */
  public relocateIdle(x: number, z: number, yawDegrees: number = 0): boolean {
    if (this.fsm.getState() !== 'IDLE') return false;
    this.currentPos.set(x, this.currentPos.y, z);
    this.node.setPosition(this.currentPos);
    this.visualYawDegrees = yawDegrees;
    this.visualRollDegrees = 0;
    this.visualNode?.setRotationFromEuler(0, this.visualYawDegrees, this.visualRollDegrees);
    return true;
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

    // 等级不足反馈是轻量文字提示，而不是 3.5 倍放大的交通锥模型。
    // 此前的 constructionCone 警告锥会在每辆 T5 车顶形成"红色帽子"，
    // 属于视觉污染；正式反馈只有一行短暂的 "需要 LV.X" 文字。
    this.lockIndicatorNode = new Node('TierLockWarning');
    this.lockIndicatorNode.setPosition(0, 1.2, 0);
    this.node.addChild(this.lockIndicatorNode);
    const lockLabelNode = new Node('TierLockLabel');
    this.lockIndicatorNode.addChild(lockLabelNode);
    this.lockLabel = lockLabelNode.addComponent(Label);
    this.lockLabel.string = '';
    this.lockLabel.fontSize = 26;
    this.lockLabel.color = new Color(255, 92, 92, 255);
    this.lockIndicatorNode.active = false;
  }

  private initFSM(): void {
    this.fsm
      .registerState('IDLE', {
        enter: () => {
          this.suckTimer = 0;
          this.node.setScale(Vec3.ONE);
          // A target that escaped the pull must read as normal traffic again.
          this.strainSeconds = 0;
          this.visualRollDegrees = 0;
          this.visualNode?.setRotationFromEuler(0, this.visualYawDegrees, this.visualRollDegrees);
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
    if (this.lockLabel) this.lockLabel.string = '';
    this.suckTimer = 0;
    this.isLockAlertActive = false;
    this.lockTimer = 0;
    this.lockCooldownTimer = 0;
    this.captureOwnerId = null;
    this.suctionSpinDegreesPerSecond = 0;
    this.visualYawDegrees = 0;
    this.visualRollDegrees = 0;
    this.strainSeconds = 0;

    this.buildVisibleNode();
    this.applyTemplateArt();
    this.transitionTo('IDLE');
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

  public getCaptureOwnerId(): string | null {
    return this.captureOwnerId;
  }

  public showLockAlert(): void {
    if (this.lockTimer > 0 || this.lockCooldownTimer > 0) return;
    this.isLockAlertActive = true;
    this.lockTimer = 1.4;
    this.lockCooldownTimer = 1.4 + 3.5;
    if (this.lockLabel) this.lockLabel.string = '需要 LV.' + this.template.tier;
    // 提示文字浮在目标本体上方，目标越大浮得越高，但不遮挡远处视野。
    if (this.lockIndicatorNode) {
      this.lockIndicatorNode.setPosition(0, 0.9 + Math.min(1.8, this.template.radius * 0.7), 0);
      this.lockIndicatorNode.active = true;
    }
  }

  public isShowingLockAlert(): boolean {
    return this.isLockAlertActive;
  }

  /**
   * Single source of truth for the prompt text. The HUD-side `TierLockPresenter`
   * renders this, because a Label on a code-built node is never batched in a
   * built player (no RenderRoot2D ancestor, wrong layer).
   */
  public getLockAlertText(): string {
    return this.isLockAlertActive ? `需要 LV.${this.template.tier}` : '';
  }

  /**
   * V4 reference 09 / 10 runtime evidence. A single readable phase name for the
   * current suction state, so runtime captures and contract tests can assert
   * the real chain instead of inferring it. Read-only: it never advances or
   * rewrites the FSM.
   */
  public getSuctionPhase(): string {
    const state = this.fsm.getState();
    if (state === 'IDLE') return this.isLockAlertActive ? 'LOCKED_LEVEL' : 'IDLE';
    return state;
  }

  /** Seconds this body has visibly been fighting the pull (V4 reference 09). */
  public getStrainSeconds(): number {
    return this.strainSeconds;
  }

  public updateMotion(
    dt: number,
    machinePos: Vec3,
    suctionRadius: number,
    machineMaxTier: ObjectTier,
    isMagnetStorm: boolean = false,
    consumerId: string = 'endless-player',
    suctionPullMultiplier: number = 1.0,
  ): boolean {
    const state = this.fsm.getState();
    if (state === 'ABSORBED' || state === 'RECYCLED') return false;

    // A bot cannot earn an object which has already entered the same real
    // suction state for another competitor.
    if (this.captureOwnerId && this.captureOwnerId !== consumerId) return false;

    if (this.lockTimer > 0) {
      this.lockTimer -= dt;
      if (this.lockTimer <= 0) {
        this.isLockAlertActive = false;
        if (this.lockIndicatorNode) this.lockIndicatorNode.active = false;
      }
    }
    if (this.lockCooldownTimer > 0) this.lockCooldownTimer -= dt;

    const dx = machinePos.x - this.currentPos.x;
    const dz = machinePos.z - this.currentPos.z;
    const distSq = dx * dx + dz * dz;
    const profile = getSuctionTierProfile(this.template.tier);

    if (state === 'IDLE') {
      if (distSq >= suctionRadius * suctionRadius) return false;
      if (this.template.tier > machineMaxTier && !isMagnetStorm) {
        // 等级不足：给出明确的 LV.X 反馈，目标仅被引力轻微拉动，
        // 绝不进入正式 ATTRACTED/SUCKING/ABSORBED 流程。
        // 对峙距离保证锁定目标停在黑洞边缘之外，不会被拖进核心造成"已吞"错觉。
        this.showLockAlert();
        const lockedDist = Math.sqrt(distSq);
        const standoff = Math.max(suctionRadius * 0.45, this.template.radius * 0.5);
        if (lockedDist > standoff) {
          const creep = Math.min(1.1 * Math.max(0.1, suctionPullMultiplier) * dt, lockedDist - standoff);
          this.currentPos.x += (dx / lockedDist) * creep;
          this.currentPos.z += (dz / lockedDist) * creep;
          this.node.setPosition(this.currentPos);
        }
        return false;
      }

      // Complete the IDLE -> ATTRACTED handoff in this frame. Waiting for
      // the next tick loses the first pull step at streaming/rebase edges and
      // can leave a player chasing a target that has already started moving.
      this.captureOwnerId = consumerId;
      this.transitionTo('ATTRACTED');
    }

    if (state === 'ATTRACTED' || state === 'SUCKING') {
      // ATTRACTED 目标被拖出引力圈后挣脱回 IDLE：T4/T5 必须主动追逐/卡位，
      // 从黑洞边缘掠过不能完成吞噬。已进入核心 SUCKING 的目标不再挣脱。
      if (state === 'ATTRACTED' && !isMagnetStorm) {
        const escapeRadius = suctionRadius * profile.escapeRadiusFactor;
        if (distSq > escapeRadius * escapeRadius) {
          this.captureOwnerId = null;
          this.suckTimer = 0;
          this.node.setScale(Vec3.ONE);
          this.transitionTo('IDLE');
          return false;
        }
      }
      if (state === 'SUCKING') this.suckTimer += dt;
      else if (Math.sqrt(distSq) < 0.6) this.transitionTo('SUCKING');

      // V4 reference 09 legibility: a large target must visibly fight the pull
      // instead of looking like it is passing by. Tier 4/5 gains a slow,
      // readable strain roll while it is being dragged. This is additive
      // presentation only: no new mesh, no particles, no change to motion,
      // mass, tier or the per-tier suction profile.
      if (this.template.tier >= 4) {
        this.strainSeconds += dt;
        const strain = Math.min(1, this.strainSeconds / 1.6);
        this.visualRollDegrees = Math.sin(this.strainSeconds * 3.4) * 14 * strain;
      }

      const result = SuctionMotionCalculator.computeMotion(
        this.currentPos, machinePos, suctionRadius, dt, this.suckTimer, 0.4, isMagnetStorm,
        suctionPullMultiplier,
        this.template.tier,
      );
      this.currentPos.set(result.newPosition);
      this.node.setPosition(this.currentPos);
      this.node.setScale(result.newScale);
      if (this.suctionSpinDegreesPerSecond > 0) {
        const spinMultiplier = state === 'SUCKING' ? 2.5 : 1;
        this.visualYawDegrees += this.suctionSpinDegreesPerSecond * spinMultiplier * dt;
        this.visualRollDegrees += this.suctionSpinDegreesPerSecond * 0.35 * spinMultiplier * dt;
      }
      if (this.suctionSpinDegreesPerSecond > 0 || this.template.tier >= 4) {
        this.visualNode?.setRotationFromEuler(0, this.visualYawDegrees, this.visualRollDegrees);
      }
      if (result.isAbsorbed) {
        this.transitionTo('ABSORBED');
        return true;
      }
    }
    return false;
  }

  public recycle(): void {
    this.captureOwnerId = null;
    this.transitionTo('RECYCLED');
  }
}
