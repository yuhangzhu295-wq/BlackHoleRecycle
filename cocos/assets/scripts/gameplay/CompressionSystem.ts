/**
 * 核心压缩回收系统 (CompressionSystem.ts)
 * 状态机：IDLE -> BUFFERING -> READY -> COMPRESSING -> EJECTING -> COLLECTING
 * 严格遵从：吸入缓冲 -> 压缩动画 -> 实体资源块弹出 -> 存入仓库 -> 结算金币与质量
 */
import { _decorator, Component, Node, Vec3, math, director } from 'cc';
import { CompressibleObject } from './CompressibleObject';
import { WorldArtLibrary } from '../world/WorldArtLibrary';
import { saveService } from '../data/SaveService';
import { platformAdapter } from '../platform/EditorPlatformAdapter';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';
import { eventBus } from '../core/EventBus';

const { ccclass, property } = _decorator;

export type CompressionState = 'IDLE' | 'BUFFERING' | 'READY' | 'COMPRESSING' | 'EJECTING' | 'COLLECTING';

@ccclass('CompressionSystem')
export class CompressionSystem extends Component {
  public state: CompressionState = 'IDLE';
  public stateHistory: Array<{ state: CompressionState; timestamp: number }> = [];
  public bufferMass: number = 0;
  public bufferValue: number = 0;
  public bufferCount: number = 0;
  public resourceBlockCount: number = 0;
  public storedResources: number = 0;
  
  // 阈值：吸收 3 个物品或累积 180 质量即可触发一次高反馈压缩
  private massThreshold: number = 180;
  private countThreshold: number = 3;
  private timer: number = 0;
  /**
   * Items can finish their physical suction while the previous resource block
   * is animating. They must remain payable; dropping them here made absorbed
   * objects disappear without ever contributing mass or coins.
   */
  private pendingMass: number = 0;
  private pendingValue: number = 0;
  private pendingCount: number = 0;
  
  public machine: BlackHoleMachine | null = null;
  public isPaused: boolean = false;

  private ejectNode: Node | null = null;
  private currentBlock: Node | null = null;

  private setState(nextState: CompressionState): void {
    if (this.state === nextState) return;
    this.state = nextState;
    this.stateHistory.push({ state: nextState, timestamp: Date.now() });
    if (this.stateHistory.length > 16) {
      this.stateHistory.shift();
    }
  }

  onLoad() {
    this.stateHistory = [{ state: 'IDLE', timestamp: Date.now() }];
    this.ejectNode = new Node('EjectPort');
    this.ejectNode.setPosition(0, 0.8, 0.5);
    this.node.addChild(this.ejectNode);
  }

  public absorbObject(obj: CompressibleObject, machine: BlackHoleMachine): void {
    this.machine = machine;
    if (this.state === 'COMPRESSING' || this.state === 'EJECTING' || this.state === 'COLLECTING') {
      this.pendingMass += obj.template.mass;
      this.pendingValue += obj.template.value;
      this.pendingCount += 1;
      return;
    }

    this.bufferMass += obj.template.mass;
    this.bufferValue += obj.template.value;
    this.bufferCount += 1;
    if (this.state === 'IDLE') {
      this.setState('BUFFERING');
    }
    if (this.bufferMass >= this.massThreshold || this.bufferCount >= this.countThreshold) {
      this.setState('READY');
    }
  }

  update(dt: number) {
    if (this.isPaused) return;

    if (this.state === 'READY') {
      this.setState('COMPRESSING');
      this.timer = 0;
      if (this.machine) {
        platformAdapter.vibrate('medium');
      }
    } else if (this.state === 'COMPRESSING') {
      this.timer += dt;
      // 压缩震颤动画
      if (this.machine) {
        const p = this.machine.node.getPosition();
        const shake = (Math.sin(this.timer * 35) * 0.08);
        this.machine.node.setPosition(p.x, p.y + shake, p.z);
      }

      if (this.timer >= 0.35) {
        this.setState('EJECTING');
        this.timer = 0;
        this.spawnResourceBlock();
      }
    } else if (this.state === 'EJECTING') {
      this.timer += dt;
      if (this.currentBlock) {
        const p = this.currentBlock.getPosition();
        // 资源块向上弹射并滑入后仓
        this.currentBlock.setPosition(p.x, p.y + dt * 1.5, p.z + dt * 1.2);
        this.currentBlock.setScale(Vec3.ONE.clone().multiplyScalar(Math.min(1.0, this.timer * 3.0)));
      }
      
      if (this.timer >= 0.45) {
        this.setState('COLLECTING');
      }
    } else if (this.state === 'COLLECTING') {
      this.resourceBlockCount++;
      const earnedCoins = Math.max(1, Math.round(this.bufferValue * (this.machine?.currentConfig.compressionEfficiency || 1.0)));
      this.storedResources += earnedCoins;
      
      // 金币在此刻真实到账
      saveService.addCoins(earnedCoins);
      
      // 销毁实体资源块
      if (this.currentBlock) {
        this.currentBlock.destroy();
        this.currentBlock = null;
      }
      
      // 质量在此刻真实注入机器，触发潜在升级
      if (this.machine) {
        this.machine.addMass(this.bufferMass);
      }
      
      eventBus.emit('UI_UPDATE_HUD', { coins: saveService.data.coins });
      platformAdapter.vibrate('light');
      
      // 重置缓冲池
      this.bufferMass = 0;
      this.bufferValue = 0;
      this.bufferCount = 0;
      if (this.pendingCount > 0) {
        this.bufferMass = this.pendingMass;
        this.bufferValue = this.pendingValue;
        this.bufferCount = this.pendingCount;
        this.pendingMass = 0;
        this.pendingValue = 0;
        this.pendingCount = 0;
        if (this.bufferMass >= this.massThreshold || this.bufferCount >= this.countThreshold) {
          this.setState('READY');
        } else {
          this.setState('BUFFERING');
        }
      } else {
        this.setState('IDLE');
      }
    }
  }
  
  private spawnResourceBlock() {
    this.currentBlock = new Node('ResourceBlock');
    this.currentBlock.setPosition(0, 0, 0);
    this.currentBlock.setScale(new Vec3(0.1, 0.1, 0.1));
    this.ejectNode?.addChild(this.currentBlock);
    
    const art = director.getScene()?.getComponentInChildren(WorldArtLibrary) || null;
    if (!art) throw new Error('[CompressionSystem] Missing editor-saved WorldArtLibrary; resource block fallback is prohibited.');
    art.spawn('recyclingBox', this.currentBlock, Vec3.ZERO, new Vec3(0.65, 0.65, 0.65), 20, 'CompressedResourceBlock');
  }
}
