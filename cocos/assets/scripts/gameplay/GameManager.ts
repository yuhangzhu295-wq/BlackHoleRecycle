/**
 * 游戏主控制器与运行时生命周期驱动 (GameManager.ts)
 */
import { _decorator, Component, Node, Camera, Vec3, math, director, DirectionalLight, Color, Canvas, UITransform, view, ResolutionPolicy } from 'cc';
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

  // 9:16 竖屏等轴相机参数。目标在画面下方，为前方街区保留探索空间。
  private cameraOffset: Vec3 = new Vec3(0, 17.5, 15.0);
  private cameraTarget: Vec3 = new Vec3();
  private readonly portraitWidth = 720;
  private readonly portraitHeight = 1280;

  onLoad(): void {
    platformAdapter.init();
    this.currentCoins = saveService.data.coins;
    this.autoBindDependencies();
    this.applyPortraitRuntimeContract();
    this.initLighting();
    this.bindEvents();
    this.initWorld();
    this.setupQABridge();
  }

  onDestroy(): void {
    view.off('canvas-resize', this.applyPortraitRuntimeContract, this);
  }

  /**
   * Keep the WebGL camera and Canvas in the same 9:16 letterboxed game view.
   * SHOW_ALL is deliberate: FIXED_WIDTH expands the visible 3D surface to a
   * landscape desktop frame, which leaves a portrait UI on top of a wide world.
   */
  private applyPortraitRuntimeContract(): void {
    view.setDesignResolutionSize(
      this.portraitWidth,
      this.portraitHeight,
      ResolutionPolicy.SHOW_ALL
    );
    view.off('canvas-resize', this.applyPortraitRuntimeContract, this);
    view.on('canvas-resize', this.applyPortraitRuntimeContract, this);

    if (this.mainCamera) {
      // CameraFOVAxis.VERTICAL is value 0 in the Cocos Creator 3.8.3 engine.
      // The generated project declarations do not re-export that enum, while
      // Camera.fovAxis remains the native engine property being configured.
      this.mainCamera.fovAxis = 0;
      this.mainCamera.fov = 48;
    }
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

    eventBus.on('HOME_START_REQUESTED', () => {
      this.openV2ModeSelect();
    });

    eventBus.on('HOME_MODE_REQUESTED', () => {
      this.openV2ModeSelect();
    });

    eventBus.on('MODE_BACK_REQUESTED', () => {
      this.returnToHome();
    });

    eventBus.on('MODE_ENDLESS_REQUESTED', () => {
      this.startEndlessGame();
    });
  }

  private sessionStartCoins: number = 0;

  public startEndlessGame(): void {
    this.setV2HomeVisible(false);
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
    this.hud?.hideAllScreens();
    this.setV2HomeVisible(true);
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

  private setV2HomeVisible(visible: boolean): void {
    const canvas = director.getScene()?.getChildByName('Canvas');
    const home = canvas?.getChildByName('HomePage');
    const mode = canvas?.getChildByName('ModeSelectPage');
    if (home) home.active = visible;
    if (mode) mode.active = false;
  }

  /** 仅显示由 Cocos Creator 保存的 V2 模式选择页，不回退到旧运行时 HUD。 */
  private openV2ModeSelect(): void {
    const canvas = director.getScene()?.getChildByName('Canvas');
    const home = canvas?.getChildByName('HomePage');
    const mode = canvas?.getChildByName('ModeSelectPage');
    if (!mode) {
      console.error('[GameManager] Missing editor-saved ModeSelectPage. Legacy HUD fallback is disabled.');
      return;
    }

    if (home) home.active = false;
    mode.active = true;
    this.hud?.hideAllScreens();
    this.gameState = 'MODE_SELECT';
  }

  /**
   * 只读布局快照：用于真机/预览运行时排查 UI 被裁切或缩放错误，
   * 不暴露任何修改场景或游戏状态的能力。
   */
  private getV2HomeLayoutSnapshot(): Record<string, unknown> {
    const canvas = director.getScene()?.getChildByName('Canvas') || null;
    const home = canvas?.getChildByName('HomePage') || null;
    const homeNode = (name: string): Node | null => home?.getChildByName(name) || home?.getChildByName('SafeAreaRoot')?.getChildByName(name) || null;
    const canvasComponent = canvas?.getComponent(Canvas) || null;
    const uiCamera = canvas?.getChildByName('UICamera')?.getComponent(Camera) || null;
    const describe = (node: Node | null): Record<string, unknown> | null => {
      if (!node) return null;
      const transform = node.getComponent(UITransform);
      return {
        active: node.activeInHierarchy,
        x: node.position.x,
        y: node.position.y,
        width: transform?.width || 0,
        height: transform?.height || 0,
        scaleX: node.scale.x,
        scaleY: node.scale.y
      };
    };

    const design = view.getDesignResolutionSize();
    const visible = view.getVisibleSize();
    const frame = view.getFrameSize();
    const viewport = view.getViewportRect();
    const targetRatio = this.portraitWidth / this.portraitHeight;
    return {
      design: { width: design.width, height: design.height },
      visible: { width: visible.width, height: visible.height },
      frame: { width: frame.width, height: frame.height },
      portrait: {
        targetRatio,
        frameRatio: frame.height > 0 ? frame.width / frame.height : null,
        viewport: { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height },
        designIsPortrait: design.width < design.height,
        frameIsPortrait: frame.width < frame.height,
        viewportIsPortrait: viewport.width < viewport.height,
        viewportWithinFrame:
          viewport.x >= 0 && viewport.y >= 0 &&
          viewport.x + viewport.width <= frame.width &&
          viewport.y + viewport.height <= frame.height,
        viewportRatio: viewport.height > 0 ? viewport.width / viewport.height : null,
      },
      canvas: {
        ...describe(canvas),
        alignCanvasWithScreen: canvasComponent?.alignCanvasWithScreen ?? null
      },
      uiCamera: uiCamera ? {
        projection: uiCamera.projection,
        orthoHeight: uiCamera.orthoHeight,
        x: uiCamera.node.position.x,
        y: uiCamera.node.position.y,
        z: uiCamera.node.position.z
      } : null,
      home: describe(home),
      logo: describe(homeNode('Logo')),
      hero: describe(homeNode('HeroBlackHole')),
      start: describe(homeNode('BtnStart')),
      mode: describe(homeNode('BtnMode')),
      skin: describe(homeNode('BtnSkin')),
      machine: describe(homeNode('BtnMachine'))
    };
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
          ui: this.getV2HomeLayoutSnapshot(),
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
        camera: {
          fov: this.mainCamera?.fov ?? null,
          fovAxis: this.mainCamera?.fovAxis ?? null,
          position: {
            x: this.mainCamera?.node.position.x ?? 0,
            y: this.mainCamera?.node.position.y ?? 0,
            z: this.mainCamera?.node.position.z ?? 0,
          },
          forward: {
            x: this.mainCamera?.node.forward.x ?? 0,
            z: this.mainCamera?.node.forward.z ?? 0,
          },
          right: {
            x: this.mainCamera?.node.right.x ?? 0,
            z: this.mainCamera?.node.right.z ?? 0,
          },
        },
        machine: {
            level: this.machine?.currentLevel || 1,
          mass: this.machine?.currentMass || 0,
          requiredMass: (MACHINE_EVOLUTION_CONFIG[Math.min(4, (this.machine?.currentLevel || 1))] || MACHINE_EVOLUTION_CONFIG[0]).massThreshold,
          suctionRadius: this.machine?.getSuctionRadius() || 2.4,
          maxTier: this.machine?.getMaxTier() || 1,
          target: {
            x: this.machine?.targetPos.x ?? 0,
            z: this.machine?.targetPos.z ?? 0,
          },
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

    // 3. 相机平滑跟随 (垂直 FOV 锁定的 9:16 俯视视角)
    Vec3.add(this.cameraTarget, mPos, this.cameraOffset);
    const cPos = this.mainCamera.node.position;
    this.mainCamera.node.setPosition(
      math.lerp(cPos.x, this.cameraTarget.x, dt * 5.0),
      math.lerp(cPos.y, this.cameraTarget.y, dt * 5.0),
      math.lerp(cPos.z, this.cameraTarget.z, dt * 5.0)
    );
    this.mainCamera.node.setRotationFromEuler(-50, 0, 0);
  }
}
