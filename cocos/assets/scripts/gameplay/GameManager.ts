/**
 * 游戏主控制器与运行时生命周期驱动 (GameManager.ts)
 */
import { _decorator, Component, Node, Camera, Vec3, math, director, DirectionalLight, Color } from 'cc';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';
import { WorldChunkManager } from '../world/WorldChunkManager';
import { CompressibleObject } from './CompressibleObject';
import { HUDView } from '../ui/HUDView';
import { CompressionSystem } from './CompressionSystem';
import { PlayerController } from './PlayerController';
import { eventBus } from '../core/EventBus';
import { saveService } from '../data/SaveService';
import { analyticsService } from '../analytics/AnalyticsService';
import { platformAdapter } from '../platform/EditorPlatformAdapter';
import { MACHINE_EVOLUTION_CONFIG } from '../data/GameConfig';

const { ccclass, property } = _decorator;

export type GameSessionState = 'HOME' | 'MODE_SELECT' | 'PLAYING' | 'PAUSED' | 'SETTLEMENT';

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

  public playerController: PlayerController | null = null;
  public compressionSystem: CompressionSystem | null = null;

  public score: number = 0;
  public totalAbsorbedCount: number = 0;
  public currentCoins: number = 0;
  public isPaused: boolean = false;
  public gameState: GameSessionState = 'HOME';
  public regionsVisitedCount: number = 1;

  // 9:16 竖屏等轴相机参数 (高度 16m, 偏移 11m, 俯角 -45°)
  private cameraOffset: Vec3 = new Vec3(0, 16.0, 11.0);
  private cameraTarget: Vec3 = new Vec3();

  onLoad(): void {
    platformAdapter.init();
    this.currentCoins = saveService.data.coins;
    this.autoBindDependencies();
    this.initLighting();
    this.bindEvents();
    this.initWorld();
    this.setupQABridge();
  }

  private autoBindDependencies(): void {
    const scene = director.getScene();

    // 1. 自动挂载或查找 BlackHoleMachine
    if (!this.machine) {
      this.machine = scene?.getComponentInChildren(BlackHoleMachine) || null;
      if (!this.machine) {
        const machineNode = new Node('BlackHoleMachine');
        this.node.addChild(machineNode);
        this.machine = machineNode.addComponent(BlackHoleMachine);
      }
    }

    // 2. 自动挂载或查找 PlayerController
    if (!this.playerController && this.machine) {
      const pc = this.machine.getComponent(PlayerController) || this.machine.addComponent(PlayerController);
      this.playerController = pc;
      if (pc) pc.machine = this.machine;
    }

    // 3. 自动查找主相机
    if (!this.mainCamera) {
      this.mainCamera = scene?.getComponentInChildren(Camera) || null;
      if (this.playerController && this.mainCamera) {
        this.playerController.mainCamera = this.mainCamera;
      }
    }

    // 4. 自动挂载或查找 CompressionSystem
    if (!this.compressionSystem) {
      this.compressionSystem = this.node.getComponent(CompressionSystem) || this.node.addComponent(CompressionSystem);
      if (this.machine) {
        this.compressionSystem.machine = this.machine;
      }
    }

    // 5. 自动挂载或查找 WorldChunkManager
    if (!this.chunkManager) {
      this.chunkManager = scene?.getComponentInChildren(WorldChunkManager) || null;
      if (!this.chunkManager) {
        const chunkManagerNode = new Node('WorldChunkManager');
        this.node.addChild(chunkManagerNode);
        this.chunkManager = chunkManagerNode.addComponent(WorldChunkManager);
      }
    }

    // 6. 自动挂载或查找 HUDView
    if (!this.hud) {
      this.hud = scene?.getComponentInChildren(HUDView) || null;
      if (!this.hud) {
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

    analyticsService.track('game_launch');
    console.log('🎮 [GameManager] Cocos 3D World Initialized successfully!');
  }

  private initLighting(): void {
    const scene = director.getScene();
    if (scene && !scene.getChildByName('MainLight') && !scene.getChildByName('Main Light')) {
      const lightNode = new Node('MainLight');
      lightNode.setRotationFromEuler(-45, -45, 0);
      scene.addChild(lightNode);
      const dirLight = lightNode.addComponent(DirectionalLight);
      if (dirLight) {
        dirLight.illuminance = 65000;
        dirLight.color = new Color(255, 255, 250);
      }
    }
  }

  private bindEvents(): void {
    eventBus.on('MACHINE_EVOLVED', ({ level, config }) => {
      platformAdapter.vibrate('heavy');
      saveService.setMachineLevel(level);
      this.updateHUD();
    });

    eventBus.on('UI_UPDATE_HUD', (data: any) => {
      this.currentCoins = data.coins;
      this.updateHUD();
    });

    eventBus.on('GAME_START_ENDLESS', () => {
      this.startEndlessGame();
    });

    eventBus.on('GAME_RETURN_HOME', () => {
      this.returnToHome();
    });

    eventBus.on('GAME_TRIGGER_SETTLEMENT', () => {
      this.triggerSettlement();
    });

    eventBus.on('UI_TRIGGER_PAUSE', () => {
      this.togglePause();
    });
  }

  private sessionStartCoins: number = 0;

  public startEndlessGame(): void {
    this.gameState = 'PLAYING';
    this.isPaused = false;
    if (this.playerController) this.playerController.isPaused = false;
    if (this.compressionSystem) this.compressionSystem.isPaused = false;
    if (this.machine) this.machine.isPaused = false;
    
    this.totalAbsorbedCount = 0;
    this.score = 0;
    this.regionsVisitedCount = 1;
    this.sessionStartCoins = this.currentCoins;

    // 将机器归位
    if (this.machine) {
      this.machine.node.setPosition(0, 0, 0);
      this.machine.setTargetPosition(0, 0);
    }

    analyticsService.track('endless_start', {
      initialCoins: this.currentCoins
    });

    if (this.hud) {
      this.hud.showScreen('Gameplay');
    }

    this.updateHUD();
  }

  public togglePause(): void {
    if (this.gameState !== 'PLAYING' && this.gameState !== 'PAUSED') return;

    this.isPaused = !this.isPaused;
    this.gameState = this.isPaused ? 'PAUSED' : 'PLAYING';

    if (this.playerController) this.playerController.isPaused = this.isPaused;
    if (this.compressionSystem) this.compressionSystem.isPaused = this.isPaused;
    if (this.machine) this.machine.isPaused = this.isPaused;

    if (this.hud) {
      this.hud.showScreen(this.isPaused ? 'Pause' : 'Gameplay');
    }
  }

  public returnToHome(): void {
    this.isPaused = false;
    this.gameState = 'HOME';
    if (this.playerController) this.playerController.isPaused = false;
    if (this.compressionSystem) this.compressionSystem.isPaused = false;
    if (this.machine) this.machine.isPaused = false;
    if (this.hud) this.hud.showScreen('Home');
  }

  public triggerSettlement(): void {
    this.gameState = 'SETTLEMENT';
    this.isPaused = true;
    if (this.playerController) this.playerController.isPaused = true;
    if (this.compressionSystem) this.compressionSystem.isPaused = true;
    if (this.machine) this.machine.isPaused = true;

    if (this.hud) {
      this.hud.updateSettlement(
        this.totalAbsorbedCount,
        Math.max(0, this.currentCoins - this.sessionStartCoins),
        this.machine?.currentLevel || 1,
        this.regionsVisitedCount,
        this.machine?.currentMass || 0
      );
      this.hud.showScreen('Settlement');
    }
  }

  public onObjectAbsorbed(obj: CompressibleObject): void {
    if (!this.machine) return;
    const t = obj.template;
    this.totalAbsorbedCount++;
    this.score += t.value * 10;

    // 严谨进入实体压缩缓冲系统 (不立即加金币与质量)
    if (this.compressionSystem) {
      this.compressionSystem.absorbObject(obj, this.machine);
    }
    
    analyticsService.track('object_absorb', {
      type: t.type,
      tier: t.tier,
      mass: t.mass,
      totalMass: this.machine.currentMass
    });
  }

  private updateHUD(): void {
    if (this.hud && this.machine) {
      const regionName = this.chunkManager?.currentTheme.name || '卧室杂物区';
      this.hud.updateStats(
        this.machine.currentMass,
        this.machine.currentLevel,
        this.machine.currentConfig.title,
        this.currentCoins,
        regionName
      );
    }
  }

  private setupQABridge(): void {
    // 注入严格只读的 QA Bridge (无任何 setter 或内部状态修补后门)
    (window as any).__BHR_QA__ = {
      snapshot: () => {
        const mPos = this.machine?.node.position;
        const allObjs = this.chunkManager?.getAllObjects() || [];
        const sampledObjs = allObjs.map(o => {
          const p = o.getPosition();
          return {
            runtimeId: o.runtimeId,
            type: o.template.type,
            tier: o.template.tier,
            state: o.getState(),
            x: p ? p.x : 0,
            z: p ? p.z : 0,
            lockVisible: o.isShowingLockAlert()
          };
        });

        return {
          scene: director.getScene()?.name || 'Game',
          uiScreen: this.hud?.currentScreenName || 'Home',
          gameState: this.gameState,
          player: {
            position: {
              x: mPos ? mPos.x : 0,
              y: mPos ? mPos.y : 0,
              z: mPos ? mPos.z : 0
            },
            x: mPos ? mPos.x : 0,
            y: mPos ? mPos.y : 0,
            z: mPos ? mPos.z : 0,
            isMoving: this.playerController?.isDragging || false,
            isDragging: this.playerController?.isDragging || false
          },
          machine: {
            level: this.machine?.currentLevel || 1,
            mass: this.machine?.currentMass || 0,
            requiredMass: (MACHINE_EVOLUTION_CONFIG[Math.min(4, (this.machine?.currentLevel || 1))] || MACHINE_EVOLUTION_CONFIG[0]).massThreshold,
            suctionRadius: this.machine?.getSuctionRadius() || 2.4,
            maxTier: this.machine?.getMaxTier() || 1
          },
          world: {
            currentRegion: this.chunkManager?.currentTheme.id || 'bedroom',
            regionIndex: this.chunkManager?.getRegionIndex() || 0,
            activeChunkCount: this.chunkManager?.activeChunks.length || 0,
            activeAreaCount: this.chunkManager?.activeChunks.length || 0,
            visibleObjectCount: this.chunkManager?.getVisibleObjectCount() || 0
          },
          objects: sampledObjs,
          compression: {
            state: this.compressionSystem?.state || 'IDLE',
            stateHistory: this.compressionSystem?.stateHistory ? [...this.compressionSystem.stateHistory] : [],
            bufferMass: this.compressionSystem?.bufferMass || 0,
            bufferCount: this.compressionSystem?.bufferCount || 0,
            resourceBlockCount: this.compressionSystem?.resourceBlockCount || 0,
            storedResources: this.compressionSystem?.storedResources || 0
          },
          session: {
            absorbed: this.totalAbsorbedCount,
            coinsEarned: this.currentCoins - this.sessionStartCoins,
            score: this.score,
            regionsVisited: this.regionsVisitedCount
          },
          save: {
            coins: saveService.data.coins,
            machineLevel: saveService.data.machineLevel,
            bestMass: saveService.data.highScore
          }
        };
      }
    };
  }

  update(dt: number): void {
    // 1. 暂停短路保护
    if (this.isPaused) return;
    if (!this.machine || !this.mainCamera) return;

    const mPos = this.machine.node.position;

    // 2. 驱动场景物理与物体状态机
    if (this.gameState === 'PLAYING') {
      if (this.chunkManager) {
        // 更新分块流式生成与回收
        this.chunkManager.updateChunks(mPos.z);
        this.regionsVisitedCount = Math.max(this.regionsVisitedCount, this.chunkManager.getRegionIndex() + 1);

        // 驱动可压缩物体的引力、运动、碰撞与吞噬判定
        this.chunkManager.updateObjects(
          dt,
          mPos,
          this.machine.getSuctionRadius(),
          this.machine.getMaxTier(),
          this.machine.isMagnetStormActive,
          (obj) => this.onObjectAbsorbed(obj)
        );
      }

      this.updateHUD();
    }

    // 3. 相机平滑跟随 (始终保持 9:16 -45° 舒适俯角)
    Vec3.add(this.cameraTarget, mPos, this.cameraOffset);
    const cPos = this.mainCamera.node.position;
    this.mainCamera.node.setPosition(
      math.lerp(cPos.x, this.cameraTarget.x, dt * 5.0),
      math.lerp(cPos.y, this.cameraTarget.y, dt * 5.0),
      math.lerp(cPos.z, this.cameraTarget.z, dt * 5.0)
    );
    this.mainCamera.node.setRotationFromEuler(-45, 0, 0);
  }
}
