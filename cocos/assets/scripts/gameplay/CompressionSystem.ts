import { _decorator, Component, Node, Vec3, math, director } from 'cc';
import { CompressibleObject } from './CompressibleObject';
import { MeshFactory } from '../core/MeshFactory';
import { saveService } from '../data/SaveService';
import { analyticsService } from '../analytics/AnalyticsService';
import { platformAdapter } from '../platform/EditorPlatformAdapter';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';
import { eventBus } from '../core/EventBus';

const { ccclass, property } = _decorator;

export type CompressionState = 'IDLE' | 'BUFFERING' | 'READY' | 'COMPRESSING' | 'EJECTING' | 'COLLECTING';

@ccclass('CompressionSystem')
export class CompressionSystem extends Component {
  public state: CompressionState = 'IDLE';
  public bufferMass: number = 0;
  public bufferValue: number = 0;
  public bufferCount: number = 0;
  public resourceBlockCount: number = 0;
  public storedResources: number = 0;
  
  private massThreshold: number = 500;
  private timer: number = 0;
  
  public machine: BlackHoleMachine | null = null;
  private ejectNode: Node | null = null;
  private currentBlock: Node | null = null;

  onLoad() {
    this.ejectNode = new Node('EjectPort');
    this.ejectNode.setPosition(0, 1.5, -1.0);
    this.node.addChild(this.ejectNode);
  }

  public absorbObject(obj: CompressibleObject, machine: BlackHoleMachine): void {
    if (this.state === 'IDLE' || this.state === 'BUFFERING' || this.state === 'READY') {
      this.bufferMass += obj.template.mass;
      this.bufferValue += obj.template.value;
      this.bufferCount += 1;
      this.machine = machine;
      
      if (this.state === 'IDLE') this.state = 'BUFFERING';
      
      if (this.bufferMass >= this.massThreshold || this.bufferCount >= 5) {
        this.state = 'READY';
      }
    }
  }

  update(dt: number) {
    if (this.state === 'READY') {
      this.state = 'COMPRESSING';
      this.timer = 0;
      if (this.machine) {
        // Machine shake effect
        const pos = this.machine.node.getPosition();
        this.machine.node.setPosition(pos.x, pos.y + 0.2, pos.z);
        platformAdapter.vibrate('medium');
      }
    } else if (this.state === 'COMPRESSING') {
      this.timer += dt;
      if (this.timer >= 0.5) {
        this.state = 'EJECTING';
        this.timer = 0;
        this.spawnResourceBlock();
      }
    } else if (this.state === 'EJECTING') {
      this.timer += dt;
      if (this.currentBlock) {
        const p = this.currentBlock.getPosition();
        this.currentBlock.setPosition(p.x, p.y + dt * 2.0, p.z - dt * 2.0); // Fly back and up
      }
      
      if (this.timer >= 0.8) {
        this.state = 'COLLECTING';
      }
    } else if (this.state === 'COLLECTING') {
      this.resourceBlockCount++;
      const earnedCoins = Math.max(1, Math.round(this.bufferValue * (this.machine?.currentConfig.compressionEfficiency || 1.0)));
      this.storedResources += earnedCoins;
      saveService.addCoins(earnedCoins);
      
      
      
      // Cleanup
      if (this.currentBlock) {
        this.currentBlock.destroy();
        this.currentBlock = null;
      }
      
      // Feed mass to machine to allow real evolution
      if (this.machine) {
        this.machine.addMass(this.bufferMass);
      }
      
      eventBus.emit('UI_UPDATE_HUD', { coins: saveService.data.coins });
      platformAdapter.vibrate('light');
      
      this.bufferMass = 0;
      this.bufferValue = 0;
      this.bufferCount = 0;
      this.state = 'IDLE';
    }
  }
  
  private spawnResourceBlock() {
    this.currentBlock = new Node('ResourceBlock');
    this.currentBlock.setPosition(0, 0, 0);
    this.ejectNode?.addChild(this.currentBlock);
    MeshFactory.attachMesh(this.currentBlock, MeshFactory.getBoxMesh(0.5, 0.5, 0.5), '#ffd600', 0.4, 0.8);
  }
}
