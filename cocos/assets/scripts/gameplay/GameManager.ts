/**
 * 游戏主控制器与运行时生命周期驱动 (GameManager.ts)
 */
import { _decorator, Component, Node, Camera, Vec3, math, director } from 'cc';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';
import { WorldChunkManager } from '../world/WorldChunkManager';
import { CompressibleObject } from './CompressibleObject';
import { HUDView } from '../ui/HUDView';
import { PlayerController } from './PlayerController';
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

  // 9:16 竖屏友好等轴相机偏移 (高 16m, 后 11m)
  private cameraOffset: Vec3 = new Vec3(0, 16.0, 11.0);
  private cameraTarget: Vec3 = new Vec3();

  onLoad(): void {
    platformAdapter.init();
    this.currentCoins = saveService.data.coins;
    this.autoBindDependencies();
    this.bindEvents();
    this.initWorld();
    
    // Inject QA_MODE
    (window as any).__BHR_QA__ = {
      snapshot: () => {
        return {
          score: this.score,
          coins: this.currentCoins,
          machineLevel: this.machine?.currentLevel,
          machineMass: this.machine?.currentMass,
          activeChunks: this.chunkManager?.activeChunks.length
        };
      },
      triggerEvolve: () => {
        this.machine?.applyEvolutionLevel((this.machine?.currentLevel || 1) + 1, true);
      }
    };
  }

  start(): void {
    // 3 秒运行时健康自检
    this.scheduleOnce(() => {
      this.performRuntimeHealthCheck();
    }, 3.0);
  }

  /**
   * 自动容错绑定场景中可能未在 Inspector 拖拽的关键组件
   */
  private autoBindDependencies(): void {
    const scene = director.getScene();
    if (!scene) return;

    if (!this.mainCamera) {
      const camNode = scene.getChildByName('Main Camera') || this.node.scene?.getChildByName('Main Camera');
      if (camNode) {
        this.mainCamera = camNode.getComponent(Camera);
      }
    }

    if (!this.machine) {
      const machineNode = scene.getChildByName('BlackHoleMachine') || this.node.getChildByName('BlackHoleMachine');
      if (machineNode) {
        this.machine = machineNode.getComponent(BlackHoleMachine);
      } else {
        // 场景中若无机器节点，则自动在 GameRoot 下挂载
        const mNode = new Node('BlackHoleMachine');
        mNode.setPosition(0, 0, 4.0); // 初始位于画面下方
        this.node.addChild(mNode);
        this.machine = mNode.addComponent(BlackHoleMachine);
        mNode.addComponent(PlayerController);
      }
    }

    if (!this.chunkManager) {
      this.chunkManager = this.node.getComponent(WorldChunkManager) || this.node.addComponent(WorldChunkManager);
    }

    if (!this.hud) {
      const hudNode = scene.getChildByName('Canvas') || this.node.getChildByName('HUD');
      if (hudNode) {
        this.hud = hudNode.getComponent(HUDView);
      } else {
        // The first vertical slice must always expose its runtime status in a
        // browser preview. HUDView creates the Web overlay where a Canvas HUD
        // has not yet been authored in the scene.
        const runtimeHudNode = new Node('RuntimeHUD');
        this.node.addChild(runtimeHudNode);
        this.hud = runtimeHudNode.addComponent(HUDView);
      }
    }
  }

  private initWorld(): void {
    if (this.chunkManager) {
      this.chunkManager.init(() => {
        const objNode = new Node('CompressibleObject');
        const comp = objNode.addComponent(CompressibleObject);
        return comp;
      });
    }

    analyticsService.track('endless_start', {
      initialCoins: this.currentCoins
    });

    console.log('🎮 [GameManager] Cocos 3D World Initialized successfully!');
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

    // 1. 摄像机等轴平滑跟随 (保持机器位于画面下方 40%)
    if (this.mainCamera) {
      // 强制设置相机俯角，确保 9:16 和 35~55度的视角要求
      this.mainCamera.node.setRotationFromEuler(-45, 0, 0);
      
      this.cameraTarget.set(
        machinePos.x * 0.45,
        machinePos.y + this.cameraOffset.y,
        machinePos.z + this.cameraOffset.z
      );
      const camPos = this.mainCamera.node.getPosition();
      camPos.x = math.lerp(camPos.x, this.cameraTarget.x, dt * 5.0);
      camPos.y = math.lerp(camPos.y, this.cameraTarget.y, dt * 5.0);
      camPos.z = math.lerp(camPos.z, this.cameraTarget.z, dt * 5.0);
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

    // Compression Recycle Mechanic: Absorb -> Mass Buffer -> Compress Animation -> Spawn Block -> Collect
    console.log(`[Compression Recycle] Absorbed ${t.name}, buffering mass...`);
    this.machine.addMass(t.mass);
    this.updateHUD();

    setTimeout(() => {
      if (!this.machine) return;
      console.log(`[Compression Recycle] Compressed ${t.name}, spawning resource block and collecting coins!`);
      const earnedCoins = Math.max(1, Math.round(t.value * this.machine.currentConfig.compressionEfficiency));
      this.currentCoins += earnedCoins;
      saveService.addCoins(earnedCoins);
      this.updateHUD();
      platformAdapter.vibrate('light');
    }, 400);

    analyticsService.track('object_absorb', {
      type: t.type,
      tier: t.tier,
      mass: t.mass,
      totalMass: this.machine.currentMass
    });
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

  /**
   * 运行时健康自检 (Health Check)
   */
  private performRuntimeHealthCheck(): void {
    let passed = true;
    const errors: string[] = [];

    if (!this.machine || !this.machine.node.active) {
      passed = false;
      errors.push('Machine Node does not exist or inactive');
    }

    if (!this.chunkManager || this.chunkManager.activeChunks.length === 0) {
      passed = false;
      errors.push('WorldChunkManager active chunks count is 0');
    }

    let activeTrashCount = 0;
    if (this.chunkManager) {
      for (const chunk of this.chunkManager.activeChunks) {
        activeTrashCount += chunk.objects.filter(o => o.node.active).length;
      }
    }
    if (activeTrashCount < 10) {
      passed = false;
      errors.push(`Active visible trash count too low: ${activeTrashCount} < 10`);
    }

    if (!this.mainCamera) {
      passed = false;
      errors.push('Main Camera reference is missing');
    }

    if (passed) {
      console.log(`✅ [Runtime Health Check] PASS (Machine: LV.${this.machine?.currentLevel}, Active Chunks: ${this.chunkManager?.activeChunks.length}, Visible Trash: ${activeTrashCount})`);
    } else {
      console.error('❌ [Runtime Health Check] FAILED:', errors.join('; '));
    }
  }
}
