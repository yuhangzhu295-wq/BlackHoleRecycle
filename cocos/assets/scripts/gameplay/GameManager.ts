/**
 * 游戏主控制器 (GameManager.ts)
 * 驱动 Cocos Creator 3.8.x 核心玩法主循环
 */
import { _decorator, Component, Node, Camera, Vec3, math } from 'cc';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';
import { WorldChunkManager } from '../world/WorldChunkManager';
import { CompressibleObject } from './CompressibleObject';
import { HUDView } from '../ui/HUDView';
import { eventBus } from '../core/EventBus';
import { saveService } from '../data/SaveService';
import { analyticsService } from '../analytics/AnalyticsService';
import { platformAdapter } from '../platform/EditorPlatformAdapter';

const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
  @property(BlackHoleMachine)
  public machine: BlackHoleMachine | null = null;

  @property(WorldChunkManager)
  public chunkManager: WorldChunkManager | null = null;

  @property(Camera)
  public mainCamera: Camera | null = null;

  @property(HUDView)
  public hud: HUDView | null = null;

  public score: number = 0;
  public totalAbsorbedCount: number = 0;
  public currentCoins: number = 0;
  private cameraOffset: Vec3 = new Vec3(0, 16, 11);
  private cameraTarget: Vec3 = new Vec3();

  onLoad(): void {
    platformAdapter.init();
    this.currentCoins = saveService.data.coins;
    this.bindEvents();
    this.initWorld();
  }

  private initWorld(): void {
    if (this.chunkManager) {
      // 提供对象工厂方法创建 CompressibleObject
      this.chunkManager.init(() => {
        const objNode = new Node('CompressibleObject');
        this.node.addChild(objNode);
        const comp = objNode.addComponent(CompressibleObject);
        return comp;
      });
    }

    analyticsService.track('endless_start', {
      initialCoins: this.currentCoins
    });
  }

  private bindEvents(): void {
    eventBus.on('MACHINE_EVOLVED', ({ level, config }) => {
      platformAdapter.vibrate('heavy');
      analyticsService.track('machine_evolve', {
        level,
        mass: this.machine?.currentMass || 0
      });
      this.updateHUD();
    });

    eventBus.on('UI_TRIGGER_MAGNET_STORM', () => {
      if (this.machine && !this.machine.isMagnetStormActive) {
        this.machine.triggerMagnetStorm(6.0);
        analyticsService.track('magnet_storm', {
          duration: 6.0
        });
      }
    });

    eventBus.on('UI_TRIGGER_PAUSE', () => {
      console.log('[GameManager] Game paused');
    });
  }

  public update(dt: number): void {
    if (!this.machine) return;

    const machinePos = this.machine.node.getPosition();

    // 1. 摄像机等轴平滑跟随
    if (this.mainCamera) {
      this.cameraTarget.set(
        machinePos.x * 0.4,
        machinePos.y + this.cameraOffset.y,
        machinePos.z + this.cameraOffset.z
      );
      const camPos = this.mainCamera.node.getPosition();
      camPos.x = math.lerp(camPos.x, this.cameraTarget.x, dt * 6.0);
      camPos.y = math.lerp(camPos.y, this.cameraTarget.y, dt * 6.0);
      camPos.z = math.lerp(camPos.z, this.cameraTarget.z, dt * 6.0);
      this.mainCamera.node.setPosition(camPos);
    }

    // 2. 地图分块流式加载与物体吸附更新
    if (this.chunkManager) {
      this.chunkManager.updateChunks(machinePos.z);
      this.chunkManager.updateObjects(
        dt,
        machinePos,
        this.machine.getSuctionRadius(),
        this.machine.getMaxTier(),
        this.machine.isMagnetStormActive,
        (absorbedObj) => this.onObjectAbsorbed(absorbedObj)
      );
    }

    this.updateHUD();
  }

  public onObjectAbsorbed(obj: CompressibleObject): void {
    if (!this.machine) return;

    const t = obj.template;
    this.totalAbsorbedCount++;
    this.score += t.value * 10;

    // 质量累加与检查升级
    this.machine.addMass(t.mass);

    // 金币产出
    const earnedCoins = Math.max(1, Math.round(t.value * this.machine.currentConfig.compressionEfficiency));
    this.currentCoins += earnedCoins;
    saveService.addCoins(earnedCoins);

    analyticsService.track('object_absorb', {
      type: t.type,
      tier: t.tier,
      mass: t.mass,
      totalMass: this.machine.currentMass
    });

    platformAdapter.vibrate('light');
  }

  private updateHUD(): void {
    if (this.hud && this.machine) {
      this.hud.updateStats(
        this.machine.currentMass,
        this.machine.currentLevel,
        this.machine.currentConfig.title,
        this.currentCoins
      );
    }
  }
}
