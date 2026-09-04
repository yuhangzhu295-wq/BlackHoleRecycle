/**
 * 游戏主控制器与运行时生命周期驱动 (GameManager.ts)
 */
import { _decorator, Component, Node, Camera, Vec3, math, director, DirectionalLight, Color, Canvas, MeshRenderer, Sprite, UITransform, view, ResolutionPolicy } from 'cc';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';
import { InfiniteWorldManager } from '../world/InfiniteWorldManager';
import { CompressibleObject } from './CompressibleObject';
import { HUDView } from '../ui/HUDView';
import { RuntimePageInputRouter } from '../ui/RuntimePageInputRouter';
import { CompressionSystem } from './CompressionSystem';
import { PlayerController } from './PlayerController';
import { ArenaMatchManager, ArenaMatchSnapshot } from './ArenaMatchManager';
import { eventBus } from '../core/EventBus';
import { saveService } from '../data/SaveService';
import { analyticsService } from '../analytics/AnalyticsService';
import { platformAdapter } from '../platform/EditorPlatformAdapter';
import { MACHINE_EVOLUTION_CONFIG } from '../data/GameConfig';

const { ccclass, property } = _decorator;

export type GameSessionState = 'HOME' | 'MODE_SELECT' | 'PLAYING' | 'ARENA' | 'REVIVING' | 'PAUSED' | 'SETTLEMENT';

@ccclass('GameManager')
export class GameManager extends Component {
  @property(BlackHoleMachine)
  public machine: BlackHoleMachine | null = null;

  /** The editor-saved production 2D grid. Legacy WorldChunkManager is not used here. */
  @property(InfiniteWorldManager)
  public infiniteWorldManager: InfiniteWorldManager | null = null;

  @property(Camera)
  public mainCamera: Camera | null = null;

  @property(HUDView)
  public hud: HUDView | null = null;

  /** Creator-saved arena authority; no runtime fallback is permitted. */
  @property(ArenaMatchManager)
  public arenaMatchManager: ArenaMatchManager | null = null;

  public playerController: PlayerController | null = null;
  public compressionSystem: CompressionSystem | null = null;

  public score: number = 0;
  public totalAbsorbedCount: number = 0;
  /** Real per-tier intake ledger; read-only QA exposes what gameplay actually absorbed. */
  private absorbedTierCounts: Record<number, number> = {};
  public currentCoins: number = 0;
  public isPaused: boolean = false;
  public gameState: GameSessionState = 'HOME';
  public regionsVisitedCount: number = 1;
  private pausedGameplayState: 'PLAYING' | 'ARENA' = 'PLAYING';
  private lastSessionMode: 'ENDLESS' | 'ARENA' = 'ENDLESS';

  // Portrait isometric framing: the centre ray deliberately lands ahead of the
  // machine so the player remains in the lower interaction band.
  // Pull the portrait camera closer to the playable district. The previous
  // framing made the real black-hole core and surrounding authored props read
  // as tiny test objects instead of the dense, isometric city composition
  // established by the V2 visual contract.
  private cameraOffset: Vec3 = new Vec3(0, 16.6, 16.2);
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
   * SHOW_ALL preserves the tested 3D portrait viewport. The surrounding page
   * backdrop is styled separately so it does not present as a black browser
   * frame on narrow devices.
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
      // A portrait WebGL view has a very narrow horizontal frustum.  A small
      // vertical FOV expansion keeps the authored street assets in frame
      // without changing the game-space camera follow or any collision data.
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

    // 5. Production streaming is an editor-saved 2D InfiniteWorldManager.
    // Do not create an unsaved fallback here: that would silently return to a
    // z-only runtime hierarchy and violate the scene-asset contract.
    if (!this.infiniteWorldManager) {
      this.infiniteWorldManager = scene?.getComponentInChildren(InfiniteWorldManager) || null;
      if (!this.infiniteWorldManager) {
        throw new Error('[GameManager] Missing editor-saved InfiniteWorldManager. Run the Cocos world installer before previewing.');
      }
    }

    // ArenaMatchManager owns real bots, resource claims, combat and respawn.
    // Requiring this Creator-saved component prevents a cosmetic UI page from
    // silently appearing without an actual match behind it.
    if (!this.arenaMatchManager) {
      this.arenaMatchManager = scene?.getComponentInChildren(ArenaMatchManager) || null;
      if (!this.arenaMatchManager) {
        throw new Error('[GameManager] Missing editor-saved ArenaMatchManager. Run the arena installer before previewing.');
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
    if (this.infiniteWorldManager) {
      this.infiniteWorldManager.init(() => {
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
    eventBus.on('MACHINE_EVOLVED', ({ level, machine: evolvedMachine }: { level: number; machine?: BlackHoleMachine }) => {
      if (evolvedMachine && evolvedMachine !== this.machine) return;
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

    eventBus.on('MODE_ARENA_REQUESTED', () => {
      this.startArenaGame();
    });

    eventBus.on('ARENA_REVIVE_REQUESTED', () => {
      this.arenaMatchManager?.reviveLocal();
    });

    eventBus.on('ARENA_GIVE_UP_REQUESTED', () => {
      this.arenaMatchManager?.forfeitLocal();
    });

    eventBus.on('GAME_RESTART_CURRENT', () => {
      if (this.lastSessionMode === 'ARENA') this.startArenaGame();
      else this.startEndlessGame();
    });
  }

  private sessionStartCoins: number = 0;

  public startEndlessGame(): void {
    this.arenaMatchManager?.stopMatch();
    this.lastSessionMode = 'ENDLESS';
    this.setV2HomeVisible(false);
    this.gameState = 'PLAYING';
    this.isPaused = false;
    if (this.playerController) this.playerController.isPaused = false;
    if (this.compressionSystem) this.compressionSystem.isPaused = false;
    if (this.machine) this.machine.isPaused = false;
    
    this.totalAbsorbedCount = 0;
    this.absorbedTierCounts = {};
    this.score = 0;
    this.regionsVisitedCount = 1;
    this.sessionStartCoins = this.currentCoins;

    // 将机器归位
    if (this.machine) {
      this.machine.node.active = true;
      this.machine.node.setPosition(0, 0, 0);
      this.machine.resetMovement();
      this.machine.setPresentation('HYBRID');
    }
    // Arena bots and their dropped fragments share the genuine world object
    // pool. A visible new Endless run must start with a fresh 3×3 resource
    // grid rather than inheriting objects consumed by the prior match.
    this.infiniteWorldManager?.resetSession(Vec3.ZERO);

    analyticsService.track('endless_start', {
      initialCoins: this.currentCoins
    });

    if (this.hud) {
      this.hud.showScreen('Gameplay');
    }

    this.updateHUD();
  }

  /** Starts the actual offline arena roster: local player plus seven real bots. */
  public startArenaGame(): void {
    if (!this.machine || !this.infiniteWorldManager || !this.arenaMatchManager) {
      console.error('[GameManager] Arena cannot start without the Creator-saved machine, world and match manager.');
      return;
    }
    this.lastSessionMode = 'ARENA';
    this.setV2HomeVisible(false);
    this.gameState = 'ARENA';
    this.isPaused = false;
    this.totalAbsorbedCount = 0;
    this.absorbedTierCounts = {};
    this.score = 0;
    this.sessionStartCoins = this.currentCoins;
    this.machine.node.active = true;
    this.machine.node.setPosition(0, 0, 0);
    this.machine.resetMovement();
    // Likewise, every arena's eight competitors begin against a freshly
    // generated resource field instead of a partially consumed endless run.
    this.infiniteWorldManager.resetSession(Vec3.ZERO);
    // The arena shares genuine world pickups with Endless. Reframe the same
    // T2 book stack beside the opening fight so it does not visually cover
    // the local singularity, without changing the Endless vertical slice.
    this.infiniteWorldManager.arrangeArenaOpening();
    this.playerController && (this.playerController.isPaused = false);
    this.compressionSystem && (this.compressionSystem.isPaused = false);
    this.machine.isPaused = false;
    this.hud?.showScreen('Arena');
    this.arenaMatchManager.startMatch(this.machine, this.infiniteWorldManager, {
      onLocalObjectAbsorbed: (object) => this.onObjectAbsorbed(object),
      onLocalDefeated: (snapshot) => this.openArenaRevive(snapshot),
      onLocalRespawned: (snapshot) => this.resumeArenaAfterRespawn(snapshot),
      onMatchFinished: (snapshot) => this.showArenaSettlement(snapshot),
    });
    this.hud?.updateArena(this.arenaMatchManager.getSnapshot());
    analyticsService.track('arena_start', { roster: 8, bots: 7, mode: 'local-offline' });
  }

  public togglePause(): void {
    if (this.gameState !== 'PLAYING' && this.gameState !== 'ARENA' && this.gameState !== 'PAUSED') return;

    if (!this.isPaused) {
      this.pausedGameplayState = this.gameState === 'ARENA' ? 'ARENA' : 'PLAYING';
      this.isPaused = true;
      this.gameState = 'PAUSED';
    } else {
      this.isPaused = false;
      this.gameState = this.pausedGameplayState;
    }

    if (this.playerController) this.playerController.isPaused = this.isPaused;
    if (this.compressionSystem) this.compressionSystem.isPaused = this.isPaused;
    if (this.machine) this.machine.isPaused = this.isPaused;
    if (this.pausedGameplayState === 'ARENA') this.arenaMatchManager?.setMatchPaused(this.isPaused);

    if (this.hud) {
      this.hud.showScreen(this.isPaused ? 'Pause' : this.pausedGameplayState === 'ARENA' ? 'Arena' : 'Gameplay');
    }
  }

  public returnToHome(): void {
    this.arenaMatchManager?.stopMatch();
    this.isPaused = false;
    this.gameState = 'HOME';
    if (this.playerController) this.playerController.isPaused = false;
    if (this.compressionSystem) this.compressionSystem.isPaused = false;
    if (this.machine) this.machine.isPaused = false;
    this.arenaMatchManager?.setMatchPaused(false);
    if (this.machine) this.machine.node.active = true;
    this.hud?.hideAllScreens();
    this.setV2HomeVisible(true);
  }

  public triggerSettlement(): void {
    if (this.lastSessionMode === 'ARENA' && (
      this.gameState === 'ARENA'
      || this.gameState === 'REVIVING'
      || (this.gameState === 'PAUSED' && this.pausedGameplayState === 'ARENA')
    )) {
      this.arenaMatchManager?.forfeitLocal();
      return;
    }
    this.gameState = 'SETTLEMENT';
    this.isPaused = true;
    if (this.playerController) this.playerController.isPaused = true;
    if (this.compressionSystem) this.compressionSystem.isPaused = true;
    if (this.machine) this.machine.isPaused = true;
    this.arenaMatchManager?.setMatchPaused(true);

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

  private openArenaRevive(snapshot: ArenaMatchSnapshot): void {
    this.gameState = 'REVIVING';
    if (this.playerController) this.playerController.isPaused = true;
    if (this.compressionSystem) this.compressionSystem.isPaused = true;
    this.hud?.updateRevive(snapshot);
    this.hud?.showScreen('Revive');
  }

  private resumeArenaAfterRespawn(snapshot: ArenaMatchSnapshot): void {
    this.gameState = 'ARENA';
    if (this.playerController) this.playerController.isPaused = false;
    if (this.compressionSystem) this.compressionSystem.isPaused = false;
    if (this.machine) this.machine.isPaused = false;
    this.arenaMatchManager?.setMatchPaused(false);
    this.hud?.updateArena(snapshot);
    this.hud?.showScreen('Arena');
  }

  private showArenaSettlement(snapshot: ArenaMatchSnapshot): void {
    this.gameState = 'SETTLEMENT';
    this.isPaused = true;
    if (this.playerController) this.playerController.isPaused = true;
    if (this.compressionSystem) this.compressionSystem.isPaused = true;
    if (this.machine) this.machine.isPaused = true;
    this.arenaMatchManager?.setMatchPaused(true);
    // ArenaMatchManager produces this ledger once from the finished match.
    // Saving here makes the visible result a genuine account change, while its
    // single-claim guard prevents duplicate coins if the page is reopened.
    const reward = this.arenaMatchManager?.claimSettlementReward() || snapshot.settlementReward;
    if (reward.coins > 0) this.currentCoins = saveService.addCoins(reward.coins);
    this.hud?.updateArenaSettlement(snapshot, reward);
    this.hud?.showScreen('Settlement');
  }

  public onObjectAbsorbed(obj: CompressibleObject): void {
    if (!this.machine) return;
    const t = obj.template;
    this.totalAbsorbedCount++;
    this.absorbedTierCounts[t.tier] = (this.absorbedTierCounts[t.tier] || 0) + 1;
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
      const regionName = this.infiniteWorldManager?.getCurrentDistrictName()
        || this.infiniteWorldManager?.currentTheme.name
        || '住宅街区';
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
    const mode = canvas?.getChildByName('ModeSelectPage') || null;
    const endlessHud = canvas?.getChildByName('EndlessHUD') || null;
    const arenaHud = canvas?.getChildByName('ArenaHUD') || null;
    const revivePage = canvas?.getChildByName('RevivePage') || null;
    const pausePage = canvas?.getChildByName('PausePage') || null;
    const settlementPage = canvas?.getChildByName('SettlementPage') || null;
    const joystick = endlessHud?.getChildByName('Joystick') || null;
    const homeNode = (name: string): Node | null => home?.getChildByName(name) || home?.getChildByName('SafeAreaRoot')?.getChildByName(name) || null;
    const canvasComponent = canvas?.getComponent(Canvas) || null;
    const runtimePageInput = canvas?.getComponent(RuntimePageInputRouter) || null;
    const uiCamera = canvas?.getChildByName('UICamera')?.getComponent(Camera) || null;
    const viewport = view.getViewportRect();
    const describe = (node: Node | null): Record<string, unknown> | null => {
      if (!node) return null;
      const transform = node.getComponent(UITransform);
      const worldPoint = transform?.convertToWorldSpaceAR(Vec3.ZERO, new Vec3()) || null;
      const screenPoint = worldPoint && uiCamera ? uiCamera.worldToScreen(worldPoint, new Vec3()) : null;
      return {
        active: node.activeInHierarchy,
        x: node.position.x,
        y: node.position.y,
        width: transform?.width || 0,
        height: transform?.height || 0,
        scaleX: node.scale.x,
        scaleY: node.scale.y,
        // Normalized visual centre after Canvas/viewport letterboxing. The
        // acceptance runner uses this read-only point to tap the actual
        // editor-saved button rather than assuming a design-resolution map.
        screen: screenPoint && viewport.width > 0 && viewport.height > 0 ? {
          x: (screenPoint.x - viewport.x) / viewport.width,
          y: 1 - (screenPoint.y - viewport.y) / viewport.height,
        } : null,
      };
    };

    const design = view.getDesignResolutionSize();
    const visible = view.getVisibleSize();
    const frame = view.getFrameSize();
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
      // Keep this distinct from the HomePage "mode" action button snapshot
      // below.  QA needs the page's actual hierarchy/visibility after the
      // user performs a touch navigation, not merely the trigger button.
      modePage: describe(mode),
      modeArena: describe(mode?.getChildByName('BtnArena') || null),
      modeEndless: describe(mode?.getChildByName('BtnEndless') || null),
      modeBrawlLocked: describe(mode?.getChildByName('LockedBrawlCard') || null),
      modeLeaderboardLocked: describe(mode?.getChildByName('LockedLeaderboardCard') || null),
      runtimeHUD: {
        endless: describe(endlessHud),
        pauseButton: describe(endlessHud?.getChildByName('BtnPause') || null),
        joystick: describe(joystick),
        joystickBase: describe(joystick?.getChildByName('JoystickBase') || null),
        joystickKnob: describe(joystick?.getChildByName('JoystickKnob') || null),
      },
      arenaHUD: {
        root: describe(arenaHud),
        pauseButton: describe(arenaHud?.getChildByName('BtnPause') || null),
        joystick: describe(arenaHud?.getChildByName('Joystick') || null),
        timer: describe(arenaHud?.getChildByName('TimerValue') || null),
      },
      formalPages: {
        pause: describe(pausePage),
        pauseResume: describe(pausePage?.getChildByName('BtnResume') || null),
        pauseSettle: describe(pausePage?.getChildByName('BtnSettle') || null),
        pauseHome: describe(pausePage?.getChildByName('BtnHome') || null),
        settlement: describe(settlementPage),
        settlementRestart: describe(settlementPage?.getChildByName('BtnRestart') || null),
        settlementHome: describe(settlementPage?.getChildByName('BtnHome') || null),
        revive: describe(revivePage),
        reviveNow: describe(revivePage?.getChildByName('BtnRevive') || null),
        reviveGiveUp: describe(revivePage?.getChildByName('BtnGiveUp') || null),
      },
      runtimePageInput: runtimePageInput?.lastInputDiagnostic || null,
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
        const viewport = view.getViewportRect();
        const playerVisualCenter = mPos ? new Vec3(mPos.x, mPos.y + 0.16, mPos.z) : null;
        const playerScreen = playerVisualCenter && this.mainCamera
          ? this.mainCamera.worldToScreen(playerVisualCenter, new Vec3())
          : null;
        const playerScreenLeft = playerVisualCenter && this.mainCamera
          ? this.mainCamera.worldToScreen(new Vec3(playerVisualCenter.x - 1.0 * (this.machine?.node.scale.x || 1), playerVisualCenter.y, playerVisualCenter.z), new Vec3())
          : null;
        const playerScreenRight = playerVisualCenter && this.mainCamera
          ? this.mainCamera.worldToScreen(new Vec3(playerVisualCenter.x + 1.0 * (this.machine?.node.scale.x || 1), playerVisualCenter.y, playerVisualCenter.z), new Vec3())
          : null;
        const playerViewport = playerScreen && viewport.width > 0 && viewport.height > 0 ? {
          x: (playerScreen.x - viewport.x) / viewport.width,
          y: 1 - (playerScreen.y - viewport.y) / viewport.height,
          width: playerScreenLeft && playerScreenRight
            ? Math.abs(playerScreenRight.x - playerScreenLeft.x) / viewport.width
            : 0,
        } : null;
        const allObjs = this.infiniteWorldManager?.getAllObjects() || [];
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
          offset: { x: this.cameraOffset.x, y: this.cameraOffset.y, z: this.cameraOffset.z },
          playerViewport,
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
          movementInput: {
            x: this.playerController?.moveInput.x ?? 0,
            y: this.playerController?.moveInput.y ?? 0,
          },
          activeTouchId: this.playerController?.touchInput.activeTouchId ?? null,
          touchDiagnostic: this.playerController?.lastTouchDiagnostic ?? null,
          controller: this.playerController ? {
            enabled: this.playerController.enabled,
            activeInHierarchy: this.playerController.node.activeInHierarchy,
            nodeName: this.playerController.node.name,
          } : null,
          velocity: {
            x: this.machine?.velocity.x ?? 0,
            z: this.machine?.velocity.z ?? 0,
          },
          visualMaterials: this.machine?.getVisualMaterialDiagnostics() || [],
          },
          world: {
            currentRegion: this.infiniteWorldManager?.currentTheme.id || 'bedroom',
            regionIndex: this.infiniteWorldManager?.getRegionIndex() || 0,
            activeCellCount: this.infiniteWorldManager?.activeCells.size || 0,
            visibleObjectCount: this.infiniteWorldManager?.getVisibleObjectCount() || 0,
            streaming: this.infiniteWorldManager?.getSnapshot() || null,
          },
          arena: this.arenaMatchManager?.getSnapshot() || null,
          sceneVisuals: this.getActiveVisualDiagnostics(),
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
            absorbedTiers: { ...this.absorbedTierCounts },
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

  /** Read-only scan used only to identify real Web Mobile visual fallbacks. */
  private getActiveVisualDiagnostics(): Record<string, unknown> {
    const invalidMeshes: Array<Record<string, unknown>> = [];
    const sprites: Array<Record<string, unknown>> = [];
    const visit = (node: Node, path: string): void => {
      if (!node.activeInHierarchy) return;
      const renderer = node.getComponent(MeshRenderer);
      if (renderer) {
        const primitiveCount = renderer.mesh?.struct.primitives.length || 0;
        const slotCount = Math.max(1, primitiveCount, renderer.sharedMaterials.length);
        const slots = Array.from({ length: slotCount }, (_, index) => {
          const material = renderer.getRenderMaterial(index);
          return { effect: material?.effectName || null, valid: material?.validate() || false };
        });
        if (slots.some((slot) => !slot.valid || !slot.effect)) {
          invalidMeshes.push({ path, primitiveCount, slots });
        }
      }
      const sprite = node.getComponent(Sprite);
      if (sprite) {
        sprites.push({
          path,
          frame: sprite.spriteFrame?.name || null,
          texture: sprite.spriteFrame?.texture?.name || null,
          frameValid: sprite.spriteFrame?.isValid || false,
          textureValid: sprite.spriteFrame?.texture?.isValid || false,
        });
      }
      node.children.forEach((child) => visit(child, `${path}/${child.name}`));
    };
    const scene = director.getScene();
    if (scene) visit(scene, scene.name);
    return { invalidMeshes, sprites };
  }

  update(dt: number): void {
    // 1. 暂停短路保护
    if (this.isPaused) return;
    if (!this.machine || !this.mainCamera) return;

    let mPos = this.machine.node.position.clone();

    // 2. Drive streaming plus the active gameplay authority.
    if (this.gameState === 'PLAYING' || this.gameState === 'ARENA' || this.gameState === 'REVIVING') {
      if (this.infiniteWorldManager) {
        // Production 2D grid streaming and origin rebasing. The machine remains
        // in compact render coordinates while the manager retains logical X/Z.
        const rebase = this.infiniteWorldManager.updateCells(mPos);
        if (rebase) {
          this.machine.node.setPosition(
            mPos.x - rebase.shift.x,
            mPos.y,
            mPos.z - rebase.shift.z,
          );
          mPos = this.machine.node.position.clone();
        }
        if (this.gameState === 'PLAYING') {
          this.regionsVisitedCount = Math.max(this.regionsVisitedCount, this.infiniteWorldManager.getRegionIndex() + 1);
          // Endless mode has exactly one resource consumer.
          this.infiniteWorldManager.updateObjects(
            dt,
            mPos,
            this.machine.getSuctionRadius(),
            this.machine.getMaxTier(),
            this.machine.isMagnetStormActive,
            (obj) => this.onObjectAbsorbed(obj)
          );
        } else {
          // ArenaMatchManager performs the same suction FSM with an explicit
          // owner per object, then resolves bots, gravity pull and respawn.
          this.arenaMatchManager?.updateMatch(dt);
          const snapshot = this.arenaMatchManager?.getSnapshot();
          if (snapshot) {
            if (this.gameState === 'ARENA') this.hud?.updateArena(snapshot);
            else this.hud?.updateRevive(snapshot);
          }
        }
      }
      if (this.gameState === 'PLAYING') this.updateHUD();
    }

    // 3. 相机平滑跟随 (垂直 FOV 锁定的 9:16 俯视视角)
    Vec3.add(this.cameraTarget, mPos, this.cameraOffset);
    const cPos = this.mainCamera.node.position;
    this.mainCamera.node.setPosition(
      math.lerp(cPos.x, this.cameraTarget.x, dt * 5.0),
      math.lerp(cPos.y, this.cameraTarget.y, dt * 5.0),
      math.lerp(cPos.z, this.cameraTarget.z, dt * 5.0)
    );
    this.mainCamera.node.setRotationFromEuler(-42, 0, 0);
  }
}
