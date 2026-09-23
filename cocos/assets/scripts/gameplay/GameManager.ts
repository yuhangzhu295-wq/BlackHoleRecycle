/**
 * 游戏主控制器与运行时生命周期驱动 (GameManager.ts)
 */
import { _decorator, Component, Node, Camera, Vec3, director, DirectionalLight, Color, Label, LabelOutline, UITransform, instantiate } from 'cc';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';
import { InfiniteWorldManager } from '../world/InfiniteWorldManager';
import { CompressibleObject } from './CompressibleObject';
import { PortraitGameplayCameraController } from '../camera/PortraitGameplayCameraController';
import { GameSessionCoordinator, GameSessionState } from './session/GameSessionCoordinator';
import { QABridge } from '../dev/qa/QABridge';
import { HUDView } from '../ui/HUDView';
import { CompressionSystem } from './CompressionSystem';
import { PlayerController } from './PlayerController';
import { ArenaMatchManager, ArenaMatchSnapshot } from './ArenaMatchManager';
import { AuthoritativeArenaSnapshot, ColyseusArenaClient } from '../network/ColyseusArenaClient';
import { NetworkArenaReplica } from '../network/NetworkArenaReplica';
import { WorldArtLibrary } from '../world/WorldArtLibrary';
import { eventBus } from '../core/EventBus';
import { saveService } from '../data/SaveService';
import { analyticsService } from '../analytics/AnalyticsService';
import { platformAdapter } from '../platform/EditorPlatformAdapter';
import { SKINS_CONFIG } from '../data/GameConfig';

const { ccclass, property } = _decorator;

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
  public regionsVisitedCount: number = 1;
  private readonly session = new GameSessionCoordinator();
  private portraitCameraController: PortraitGameplayCameraController | null = null;
  /** Installed only for an explicit browser acceptance session (`?qa=1`). */
  private qaBridge: QABridge | null = null;
  /** Read-only QA evidence for real Home skin selection requests. */
  private homeSkinSelectionCount: number = 0;
  /**
   * Transport is intentionally created with the game root rather than hidden
   * behind a browser-only global. It is not advertised as online matchmaking
   * until its replicated snapshots drive the arena renderer.
   */
  private readonly networkArenaClient: ColyseusArenaClient = new ColyseusArenaClient();
  /** Exists only after the explicit endpoint probe enters its visible arena route. */
  private networkArenaReplica: NetworkArenaReplica | null = null;
  private networkArenaProbeRequested: boolean = false;
  /** Prevents duplicate account settlement when the final server snapshot is redelivered. */
  private networkSettlementShown: boolean = false;
  /** Match id copied from the authoritative room for persistent idempotency. */
  private networkArenaMatchId: string | null = null;
  /** Send the exact normalized joystick intent to a joined authoritative room at 20Hz. */
  private networkInputAccumulator: number = 0;

  /**
   * A compact, native in-game identifier required by the Mini Game filing
   * screenshots. It deliberately reuses a Creator-saved HUD Label template
   * rather than placing text into captured images or introducing a separate
   * font/material path. The Home page already has the large game logo.
   */
  private registrationBranding: Node | null = null;
  private registrationBrandingVisible: boolean | null = null;

  /** Compatibility read model for QA and existing gameplay comparisons. */
  public get gameState(): GameSessionState {
    return this.session.state;
  }

  /** Pause belongs to the session coordinator, never to a duplicate flag. */
  public get isPaused(): boolean {
    return this.session.isPaused;
  }

  private get pausedGameplayState(): 'PLAYING' | 'ARENA' | 'NETWORK_ARENA' {
    return this.session.pausedGameplayState;
  }

  private get lastSessionMode(): 'ENDLESS' | 'ARENA' {
    return this.session.lastSessionMode;
  }

  onLoad(): void {
    platformAdapter.init();
    this.currentCoins = saveService.data.coins;
    this.autoBindDependencies();
    this.createRegistrationBranding();
    this.applySavedCoreSkin();
    this.initPortraitCameraController();
    this.initLighting();
    this.bindEvents();
    this.initWorld();
    this.installQABridgeIfRequested();
    this.startNetworkProbeIfRequested();
  }

  onDestroy(): void {
    this.qaBridge?.dispose();
    this.qaBridge = null;
    this.portraitCameraController?.dispose();
    this.portraitCameraController = null;
    // A future server-backed arena can outlive a scene transition. Always
    // release the real Colyseus room instead of leaving a live socket behind.
    void this.networkArenaClient.leave();
    this.clearNetworkArenaReplica();
  }

  /** The saved gameplay camera receives its portrait contract through a focused service. */
  private initPortraitCameraController(): void {
    if (!this.mainCamera) {
      console.error('[GameManager] Missing editor-saved gameplay Camera. Portrait presentation cannot start.');
      return;
    }
    this.portraitCameraController = new PortraitGameplayCameraController(this.mainCamera);
    this.portraitCameraController.activate();
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

  /**
   * Adds a non-interactive in-game title to the Canvas for all non-Home
   * screens. The template originates from the Creator-saved Endless HUD, so
   * Web Mobile uses the same serialized Label configuration as the authored
   * production UI. This is a runtime presentation node only; it owns no
   * gameplay state and does not alter scene/prefab serialization.
   */
  private createRegistrationBranding(): void {
    const canvas = director.getScene()?.getChildByName('Canvas') || null;
    const template = canvas?.getChildByName('EndlessHUD')?.getChildByName('LevelValue') || null;
    if (!canvas || !template) {
      console.error('[GameManager] Cannot create registration branding: serialized Canvas/LevelValue template is missing.');
      return;
    }

    const branding = instantiate(template);
    branding.name = 'RegistrationBranding';
    canvas.addChild(branding);
    const transform = branding.getComponent(UITransform);
    transform?.setContentSize(280, 48);
    branding.setPosition(0, 580, 0);

    const label = branding.getComponent(Label);
    if (!label) {
      branding.destroy();
      console.error('[GameManager] Cannot create registration branding: serialized LevelValue template has no Label.');
      return;
    }
    label.string = '黑洞回收站';
    label.fontSize = 30;
    label.lineHeight = 38;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.color = new Color(255, 245, 184, 255);
    const outline = branding.getComponent(LabelOutline) || branding.addComponent(LabelOutline);
    outline.width = 3;
    outline.color = new Color(13, 30, 52, 255);

    this.registrationBranding = branding;
    this.registrationBrandingVisible = null;
    this.syncRegistrationBranding();
  }

  private syncRegistrationBranding(): void {
    if (!this.registrationBranding?.isValid) return;
    // Home already presents the full-size, artwork-backed "黑洞回收站" logo.
    // Every other player-visible page and gameplay state must retain the
    // concise title identifier required by the filing screenshot rules.
    const visible = this.gameState !== 'HOME';
    if (visible === this.registrationBrandingVisible) return;
    this.registrationBranding.active = visible;
    this.registrationBrandingVisible = visible;
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

    // A region whose art never arrived cannot be shown at all, so the player gets
    // an explicit message and a real Retry instead of an empty world.
    eventBus.on('UI_REGION_ART_FAILED', ({ message, coord }: { message: string; coord: { x: number; z: number } }) => {
      platformAdapter.showRetryDialog('区域资源加载失败', message, () => {
        void this.infiniteWorldManager?.retryRegionArt(coord);
      });
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

    eventBus.on('HOME_SKIN_REQUESTED', () => {
      this.openSkinSelection();
    });

    eventBus.on('SKIN_PAGE_BACK_REQUESTED', () => {
      this.returnToHome();
    });

    eventBus.on('SKIN_PAGE_SELECT_REQUESTED', (skinId: unknown) => {
      this.selectSkinFromPage(skinId);
    });

    eventBus.on('HOME_MACHINE_REQUESTED', () => {
      this.openMachineInfo();
    });

    eventBus.on('MACHINE_INFO_BACK_REQUESTED', () => {
      this.returnToHome();
    });

    eventBus.on('MODE_BACK_REQUESTED', () => {
      this.returnToHome();
    });

    eventBus.on('MODE_ENDLESS_REQUESTED', () => {
      // 模式卡只进入 Ready 页，绝不直接开局。
      this.openModeReady('ENDLESS');
    });

    eventBus.on('MODE_ARENA_REQUESTED', () => {
      this.openModeReady('ARENA');
    });

    eventBus.on('READY_START_REQUESTED', () => {
      if (this.gameState !== 'MODE_READY') return;
      if (this.pendingReadyMode === 'ARENA') this.startArenaGame();
      else this.startEndlessGame();
    });

    eventBus.on('READY_BACK_REQUESTED', () => {
      if (this.gameState !== 'MODE_READY') return;
      this.pendingReadyMode = null;
      this.openV2ModeSelect();
    });

    eventBus.on('ARENA_REVIVE_REQUESTED', () => {
      // Re-enable match clock before instant respawn so the player enters an active arena.
      this.arenaMatchManager?.setMatchPaused(false);
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

  private applySavedCoreSkin(): void {
    const skin = SKINS_CONFIG.find((entry) => entry.id === saveService.data.currentSkinId) || SKINS_CONFIG[0];
    if (!skin) return;
    this.machine?.applyCoreSkin(skin.color, skin.rimColor);
  }

  /** Opens the editor-saved selection page; no runtime substitute is created. */
  private openSkinSelection(): void {
    if (this.gameState !== 'HOME') return;
    const canvas = director.getScene()?.getChildByName('Canvas');
    const home = canvas?.getChildByName('HomePage') || null;
    const mode = canvas?.getChildByName('ModeSelectPage') || null;
    const machineInfo = canvas?.getChildByName('MachineInfoPage') || null;
    const page = canvas?.getChildByName('SkinSelectionPage') || null;
    if (!page) {
      console.error('[GameManager] Missing editor-saved SkinSelectionPage. Skin action is unavailable.');
      return;
    }
    if (home) home.active = false;
    if (mode) mode.active = false;
    if (machineInfo) machineInfo.active = false;
    page.active = true;
    this.setPlayerSimulationPaused(true);
    this.hud?.hideAllScreens();
    this.session.openSkinSelection();
  }

  /** Applies a free skin or atomically unlocks a paid configured skin. */
  private selectSkinFromPage(skinId: unknown): void {
    if (this.gameState !== 'SKIN_SELECTION' || typeof skinId !== 'string') return;
    const skin = SKINS_CONFIG.find((entry) => entry.id === skinId) || null;
    if (!skin) {
      eventBus.emit('SKIN_PAGE_STATUS', '未找到该皮肤配置');
      return;
    }
    const alreadyOwned = skin.unlocked || saveService.data.unlockedSkins.includes(skin.id);
    if (!alreadyOwned && !saveService.unlockSkin(skin.id)) {
      const missing = Math.max(0, skin.price - saveService.data.coins);
      const message = `金币不足，还差 ${missing.toLocaleString('en-US')} 金币`;
      eventBus.emit('SKIN_PAGE_STATUS', message);
      platformAdapter.showToast(message, 'none');
      return;
    }
    const wasSelected = saveService.data.currentSkinId === skin.id;
    const selected = saveService.selectSkin(skin.id);
    // A native Button and the capture router can both observe the same
    // pointer release on some mobile WebGL builds. If the first observation
    // already completed the persisted unlock-and-equip transaction, a second
    // observation is idempotent even when the storage bridge briefly returns
    // a malformed ownership array. Accept only the concrete persisted
    // current id as the duplicate-success proof; never manufacture ownership.
    const duplicateTransaction = !selected
      && saveService.data.currentSkinId === skin.id
      && saveService.data.unlockedSkins.includes(skin.id);
    if (!selected && !duplicateTransaction) {
      eventBus.emit('SKIN_PAGE_STATUS', '皮肤存档写入失败');
      return;
    }
    if (!wasSelected) this.homeSkinSelectionCount++;
    this.applySavedCoreSkin();
    eventBus.emit('HOME_SKIN_CHANGED', skin);
    const message = alreadyOwned || skin.unlocked ? `已装备：${skin.name}` : `已解锁并装备：${skin.name}`;
    eventBus.emit('SKIN_PAGE_STATUS', message);
    platformAdapter.vibrate('light');
    platformAdapter.showToast(message, 'success');
  }

  public startEndlessGame(): void {
    this.arenaMatchManager?.stopMatch();
    this.clearNetworkArenaReplica();
    this.infiniteWorldManager?.setGameplayObjectsVisible(true);
    this.setV2HomeVisible(false);
    this.session.beginEndless();
    this.setPlayerSimulationPaused(false);
    
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
    if (this.networkArenaProbeRequested && this.networkArenaClient.snapshot) {
      this.startNetworkArenaGame(this.networkArenaClient.snapshot);
      return;
    }
    if (!this.machine || !this.infiniteWorldManager || !this.arenaMatchManager) {
      console.error('[GameManager] Arena cannot start without the Creator-saved machine, world and match manager.');
      return;
    }
    this.clearNetworkArenaReplica();
    this.infiniteWorldManager.setGameplayObjectsVisible(true);
    this.setV2HomeVisible(false);
    this.session.beginArena(false);
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
    this.setPlayerSimulationPaused(false);
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

  /**
   * Enters the same visible arena page, but leaves every gameplay value to the
   * joined Colyseus room. This is intentionally available only to the explicit
   * endpoint probe until deployment/matchmaking and server-side reward storage
   * are production-ready.
   */
  private startNetworkArenaGame(initialSnapshot: AuthoritativeArenaSnapshot): void {
    if (!this.machine || !this.infiniteWorldManager || !this.arenaMatchManager) {
      console.error('[GameManager] Network arena cannot start without the Creator-saved machine, world and match manager.');
      return;
    }
    const artLibrary = director.getScene()?.getComponentInChildren(WorldArtLibrary) || null;
    if (!artLibrary) {
      console.error('[GameManager] Network arena cannot render without the Creator-saved WorldArtLibrary.');
      return;
    }

    this.arenaMatchManager.stopMatch();
    this.clearNetworkArenaReplica();
    this.networkArenaMatchId = initialSnapshot.matchId;
    this.setV2HomeVisible(false);
    this.session.beginArena(true);
    this.networkSettlementShown = false;
    this.totalAbsorbedCount = 0;
    this.absorbedTierCounts = {};
    this.score = 0;
    this.sessionStartCoins = this.currentCoins;
    this.machine.node.active = true;
    this.machine.resetMovement();
    this.infiniteWorldManager.resetSession(Vec3.ZERO);
    // The pooled Endless/offline arena objects exist only for those local
    // authorities. A connected screen shows replicated objects exclusively.
    this.infiniteWorldManager.setGameplayObjectsVisible(false);
    this.setPlayerSimulationPaused(false);
    this.networkArenaReplica = new NetworkArenaReplica(this.node, this.machine, artLibrary);
    this.networkArenaReplica.sync(initialSnapshot);
    this.hud?.showScreen('Arena');
    this.hud?.updateArena(this.toNetworkArenaSnapshot(initialSnapshot));
    analyticsService.track('arena_start', {
      roster: initialSnapshot.players.length,
      bots: initialSnapshot.players.filter((player) => player.isBot).length,
      mode: 'colyseus-authoritative-probe',
    });
  }

  public togglePause(): void {
    if (this.gameState !== 'PLAYING' && this.gameState !== 'ARENA' && this.gameState !== 'NETWORK_ARENA' && this.gameState !== 'PAUSED') return;

    if (!this.isPaused) this.session.pause();
    else this.session.resume();

    if (this.playerController) this.playerController.isPaused = this.isPaused;
    if (this.compressionSystem) this.compressionSystem.isPaused = this.isPaused;
    if (this.machine) this.machine.isPaused = this.isPaused;
    if (this.pausedGameplayState === 'ARENA') this.arenaMatchManager?.setMatchPaused(this.isPaused);

    if (this.hud) {
      this.hud.showScreen(this.isPaused ? 'Pause' : this.pausedGameplayState === 'PLAYING' ? 'Gameplay' : 'Arena');
    }
  }

  public returnToHome(): void {
    if (this.networkArenaClient.status === 'CONNECTED' || this.networkArenaClient.status === 'CONNECTING') {
      void this.networkArenaClient.leave();
    }
    this.arenaMatchManager?.stopMatch();
    this.networkSettlementShown = false;
    this.networkArenaMatchId = null;
    this.clearNetworkArenaReplica();
    this.infiniteWorldManager?.setGameplayObjectsVisible(true);
    this.session.returnHome();
    // A home/menu page has no joystick.  Pausing the real machine prevents a
    // lower-screen drag from becoming an invisible gameplay input.
    this.setPlayerSimulationPaused(true);
    this.arenaMatchManager?.setMatchPaused(false);
    if (this.machine) this.machine.node.active = true;
    this.hud?.hideAllScreens();
    this.setV2HomeVisible(true);
  }

  public triggerSettlement(): void {
    if (this.lastSessionMode === 'ARENA' && (
      this.gameState === 'NETWORK_ARENA'
      || (this.gameState === 'PAUSED' && this.pausedGameplayState === 'NETWORK_ARENA')
    )) {
      const snapshot = this.networkArenaClient.snapshot;
      if (snapshot?.phase === 'FINISHED') {
        this.showNetworkArenaSettlement(this.toNetworkArenaSnapshot(snapshot));
      } else if (this.networkArenaClient.requestForfeit()) {
        if (this.gameState === 'PAUSED') this.session.resume();
        this.setPlayerSimulationPaused(false);
        this.hud?.showScreen('Arena');
      } else {
        this.returnToHome();
      }
      return;
    }
    if (this.lastSessionMode === 'ARENA' && (
      this.gameState === 'ARENA'
      || this.gameState === 'REVIVING'
      || (this.gameState === 'PAUSED' && this.pausedGameplayState === 'ARENA')
    )) {
      this.arenaMatchManager?.forfeitLocal();
      return;
    }
    this.session.enterSettlement('endless-settlement');
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
    this.session.enterReviving();
    if (this.playerController) this.playerController.isPaused = true;
    if (this.compressionSystem) this.compressionSystem.isPaused = true;
    // Freeze the arena respawn clock so the revive page countdown governs timing.
    this.arenaMatchManager?.setMatchPaused(true);
    this.hud?.updateRevive(snapshot);
    this.hud?.showScreen('Revive');
  }

  private resumeArenaAfterRespawn(snapshot: ArenaMatchSnapshot): void {
    this.session.resumeArenaAfterRevive();
    if (this.playerController) this.playerController.isPaused = false;
    if (this.compressionSystem) this.compressionSystem.isPaused = false;
    if (this.machine) this.machine.isPaused = false;
    this.arenaMatchManager?.setMatchPaused(false);
    this.hud?.updateArena(snapshot);
    this.hud?.showScreen('Arena');
  }

  private showArenaSettlement(snapshot: ArenaMatchSnapshot): void {
    this.session.enterSettlement('arena-settlement');
    if (this.playerController) this.playerController.isPaused = true;
    if (this.compressionSystem) this.compressionSystem.isPaused = true;
    if (this.machine) this.machine.isPaused = true;
    this.arenaMatchManager?.setMatchPaused(true);
    // ArenaMatchManager produces this ledger once from the finished match.
    // SaveService keeps the account-side idempotency key if delivery repeats
    // after a page reload or a duplicate UI event.
    const reward = this.arenaMatchManager?.claimSettlementReward() || snapshot.settlementReward;
    const matchId = this.arenaMatchManager?.getMatchId() || snapshot.matchId;
    if (reward.coins > 0 && matchId) saveService.claimArenaSettlement(matchId, reward.coins);
    this.currentCoins = saveService.data.coins;
    this.hud?.updateArenaSettlement(snapshot, reward);
    this.hud?.showScreen('Settlement');
  }

  private showNetworkArenaSettlement(snapshot: ArenaMatchSnapshot): void {
    const canSettle = this.gameState === 'NETWORK_ARENA'
      || (this.gameState === 'PAUSED' && this.pausedGameplayState === 'NETWORK_ARENA');
    if (this.networkSettlementShown || !canSettle) return;
    this.networkSettlementShown = true;
    this.session.enterSettlement('network-arena-settlement');
    this.setPlayerSimulationPaused(true);
    const reward = snapshot.settlementReward;
    if (reward.coins > 0 && this.networkArenaMatchId) {
      saveService.claimArenaSettlement(this.networkArenaMatchId, reward.coins);
      this.currentCoins = saveService.data.coins;
    }
    this.hud?.updateArenaSettlement(snapshot, reward);
    this.hud?.showScreen('Settlement');
  }

  public onObjectAbsorbed(obj: CompressibleObject): void {
    if (!this.machine) return;
    const t = obj.template;
    this.totalAbsorbedCount++;
    this.absorbedTierCounts[t.tier] = (this.absorbedTierCounts[t.tier] || 0) + 1;
    this.score += t.value * 10;
    this.hud?.showAbsorbFeedback(obj.getPosition(), t.value * 10, t.tier);

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
      // Progression and presentation now share a region-to-district mapping.
      // Keep the HUD truthful to the actual progression region rather than
      // showing whichever decorative district a coordinate hash happened to
      // pick for this streamed cell.
      const regionName = this.infiniteWorldManager?.getCurrentRegionName()
        || this.infiniteWorldManager?.getCurrentDistrictName()
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
    const machineInfo = canvas?.getChildByName('MachineInfoPage');
    const skinSelection = canvas?.getChildByName('SkinSelectionPage');
    const endlessReady = canvas?.getChildByName('EndlessReadyPage');
    const arenaReady = canvas?.getChildByName('ArenaReadyPage');
    if (home) home.active = visible;
    if (mode) mode.active = false;
    if (machineInfo) machineInfo.active = false;
    if (skinSelection) skinSelection.active = false;
    if (endlessReady) endlessReady.active = false;
    if (arenaReady) arenaReady.active = false;
  }

  /** Mode Select 的模式卡只打开对应的 Ready 确认页，绝不直接开局。 */
  private pendingReadyMode: 'ENDLESS' | 'ARENA' | null = null;

  private openModeReady(mode: 'ENDLESS' | 'ARENA'): void {
    if (this.gameState !== 'MODE_SELECT') return;
    const canvas = director.getScene()?.getChildByName('Canvas');
    const home = canvas?.getChildByName('HomePage') || null;
    const modeSelect = canvas?.getChildByName('ModeSelectPage') || null;
    const page = canvas?.getChildByName(mode === 'ARENA' ? 'ArenaReadyPage' : 'EndlessReadyPage') || null;
    if (!page) {
      console.error('[GameManager] Missing editor-saved ' + (mode === 'ARENA' ? 'ArenaReadyPage' : 'EndlessReadyPage') + '. Mode ready flow is unavailable.');
      return;
    }
    this.pendingReadyMode = mode;
    if (home) home.active = false;
    if (modeSelect) modeSelect.active = false;
    page.active = true;
    this.setPlayerSimulationPaused(true);
    this.hud?.hideAllScreens();
    this.session.openModeReady(mode);
  }

  /** 仅显示由 Cocos Creator 保存的 V2 模式选择页，不回退到旧运行时 HUD。 */
  private openV2ModeSelect(): void {
    const canvas = director.getScene()?.getChildByName('Canvas');
    const home = canvas?.getChildByName('HomePage');
    const mode = canvas?.getChildByName('ModeSelectPage');
    const skinSelection = canvas?.getChildByName('SkinSelectionPage');
    const endlessReady = canvas?.getChildByName('EndlessReadyPage');
    const arenaReady = canvas?.getChildByName('ArenaReadyPage');
    if (!mode) {
      console.error('[GameManager] Missing editor-saved ModeSelectPage. Legacy HUD fallback is disabled.');
      return;
    }

    if (home) home.active = false;
    if (skinSelection) skinSelection.active = false;
    if (endlessReady) endlessReady.active = false;
    if (arenaReady) arenaReady.active = false;
    mode.active = true;
    this.setPlayerSimulationPaused(true);
    this.hud?.hideAllScreens();
    this.session.openModeSelect();
  }

  /** Opens the Creator-saved, read-only machine progression page from Home. */
  private openMachineInfo(): void {
    if (this.gameState !== 'HOME') return;
    const canvas = director.getScene()?.getChildByName('Canvas');
    const home = canvas?.getChildByName('HomePage') || null;
    const mode = canvas?.getChildByName('ModeSelectPage') || null;
    const skinSelection = canvas?.getChildByName('SkinSelectionPage') || null;
    const page = canvas?.getChildByName('MachineInfoPage') || null;
    if (!page) {
      console.error('[GameManager] Missing editor-saved MachineInfoPage. Machine action is unavailable.');
      return;
    }
    if (home) home.active = false;
    if (mode) mode.active = false;
    if (skinSelection) skinSelection.active = false;
    page.active = true;
    this.setPlayerSimulationPaused(true);
    this.hud?.hideAllScreens();
    this.session.openMachineInfo();
  }

  private setPlayerSimulationPaused(paused: boolean): void {
    if (this.playerController) this.playerController.isPaused = paused;
    if (this.compressionSystem) this.compressionSystem.isPaused = paused;
    if (this.machine) {
      this.machine.isPaused = paused;
      if (paused) this.machine.stopMovement();
    }
  }

  /**
   * The browser bridge is a DEV/acceptance-only observer. Production flows
   * neither allocate it nor expose a global mutable backdoor.
   */
  private installQABridgeIfRequested(): void {
    const runtimeLocation = (globalThis as { location?: { search?: unknown } }).location;
    if (typeof runtimeLocation?.search !== 'string') return;
    if (new URLSearchParams(runtimeLocation.search).get('qa') !== '1') return;

    this.qaBridge?.dispose();
    this.qaBridge = new QABridge({
      getGameState: () => this.gameState,
      getHUD: () => this.hud,
      getMachine: () => this.machine,
      getPlayerController: () => this.playerController,
      getCompressionSystem: () => this.compressionSystem,
      getWorld: () => this.infiniteWorldManager,
      getMainCamera: () => this.mainCamera,
      getArenaMatchManager: () => this.arenaMatchManager,
      getNetworkClient: () => this.networkArenaClient,
      getNetworkReplica: () => this.networkArenaReplica,
      getArenaSnapshot: () => this.networkArenaClient.snapshot
        && (this.gameState === 'NETWORK_ARENA' || this.networkSettlementShown)
        ? this.toNetworkArenaSnapshot(this.networkArenaClient.snapshot)
        : this.arenaMatchManager?.getSnapshot() || null,
      getCameraOffset: (state) => this.portraitCameraController?.getActiveOffset(state) || Vec3.ZERO,
      getSessionSnapshot: () => ({
        absorbed: this.totalAbsorbedCount,
        absorbedTiers: { ...this.absorbedTierCounts },
        coinsEarned: this.currentCoins - this.sessionStartCoins,
        score: this.score,
        regionsVisited: this.regionsVisitedCount,
      }),
      getSaveSnapshot: () => ({
        coins: saveService.data.coins,
        claimedArenaSettlementIds: [...saveService.data.claimedArenaSettlementIds],
        machineLevel: saveService.data.machineLevel,
        bestMass: saveService.data.highScore,
        skinId: saveService.data.currentSkinId,
        unlockedSkinIds: [...saveService.data.unlockedSkins],
        homeSkinSelectionCount: this.homeSkinSelectionCount,
      }),
    });
    this.qaBridge.install();
  }

  /**
   * Explicitly opt-in browser integration probe. It exists to exercise the
   * exact Cocos bundle against an actual Colyseus room without turning the
   * user-facing local 1v7 arena into a mislabeled online mode. Production
   * sessions receive no endpoint and therefore never open this connection.
   */
  private startNetworkProbeIfRequested(): void {
    const runtimeLocation = (globalThis as { location?: { search?: unknown } }).location;
    if (typeof runtimeLocation?.search !== 'string') return;
    const endpoint = new URLSearchParams(runtimeLocation.search).get('arenaProbe')?.trim() || '';
    if (!endpoint) return;
    this.networkArenaProbeRequested = true;
    void this.networkArenaClient.join(endpoint, 'Cocos Runtime Probe').catch((error: unknown) => {
      // Preserve the real handshake failure for browser console/QA evidence;
      // do not synthesize an offline room if the endpoint is unavailable.
      console.error('[GameManager] Colyseus runtime probe failed.', error);
    });
  }

  /** Destroy renderer-only nodes before returning to a local game authority. */
  private clearNetworkArenaReplica(): void {
    this.networkArenaReplica?.clear();
    this.networkArenaReplica = null;
  }

  /**
   * Adapts an authoritative schema snapshot into the existing HUD-only view
   * model. No field here feeds gameplay; it merely gives the already saved
   * arena page clocks, rank, nameplates and status from the real room.
   */
  private toNetworkArenaSnapshot(snapshot: AuthoritativeArenaSnapshot): ArenaMatchSnapshot {
    const localId = snapshot.localSessionId;
    const ordered = [...snapshot.players]
      .sort((left, right) => right.mass - left.mass || right.kills - left.kills || left.id.localeCompare(right.id));
    const local = ordered.find((player) => player.id === localId) || null;
    const localRank = local ? ordered.findIndex((player) => player.id === local.id) + 1 : 0;
    const elapsedSeconds = snapshot.elapsedMilliseconds / 1000;
    const durationSeconds = snapshot.durationMilliseconds / 1000;
    return {
      matchId: snapshot.matchId,
      running: snapshot.phase === 'RUNNING',
      elapsedSeconds,
      remainingSeconds: Math.max(0, durationSeconds - elapsedSeconds),
      // The dedicated server shields newcomers itself, so this HUD field is
      // inferred only for the local replica and is never used as a rule.
      combatWarmupRemainingSeconds: (local?.shieldMilliseconds || 0) / 1000,
      durationSeconds,
      competitorCount: ordered.length,
      localRank,
      localAlive: local?.alive || false,
      localRespawnSeconds: (local?.respawnMilliseconds || 0) / 1000,
      localKills: local?.kills || 0,
      localConsumed: local?.collected || 0,
      localMass: local?.mass || 0,
      leaderboard: ordered.map((player) => ({
        id: player.id,
        name: player.displayName,
        isLocal: player.id === localId,
        mass: player.mass,
        kills: player.kills,
        consumed: player.collected,
        alive: player.alive,
        shieldSeconds: player.shieldMilliseconds / 1000,
        behavior: player.id === localId ? 'LOCAL' : 'ROAM',
        position: { x: player.x, z: player.z },
      })),
      botStates: {},
      eliminationCount: ordered.reduce((total, player) => total + player.kills, 0),
      reason: snapshot.phase === 'FINISHED'
        ? snapshot.finishReason === 'FORFEIT' ? 'FORFEIT' : 'TIME'
        : 'RUNNING',
      settlementReward: {
        coins: local?.settlementCoins || 0,
        massCoins: local?.settlementMassCoins || 0,
        collectedCoins: local?.settlementCollectedCoins || 0,
        eliminationCoins: local?.settlementEliminationCoins || 0,
        survivalCoins: local?.settlementSurvivalCoins || 0,
        placementCoins: local?.settlementPlacementCoins || 0,
      },
    };
  }

  update(dt: number): void {
    this.syncRegistrationBranding();
    this.forwardNetworkArenaInput(dt);
    // 1. 暂停短路保护
    if (this.isPaused) return;
    if (!this.machine || !this.mainCamera) return;

    if (this.gameState === 'NETWORK_ARENA' && this.networkArenaClient.snapshot && this.networkArenaReplica) {
      // Snapshot replication is deliberately the first authority step each
      // frame, before streaming/camera work reads the local position.
      this.networkArenaReplica.sync(this.networkArenaClient.snapshot);
    }
    let mPos = this.machine.node.position.clone();

    // 2. Drive streaming plus the active gameplay authority.
    if (this.gameState === 'PLAYING' || this.gameState === 'ARENA' || this.gameState === 'NETWORK_ARENA' || this.gameState === 'REVIVING') {
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
            this.machine.getSuctionPullMultiplier(),
            (obj) => this.onObjectAbsorbed(obj)
          );
        } else if (this.gameState === 'NETWORK_ARENA') {
          // Unlike the local fallback, this branch never invokes the Cocos
          // arena simulation. The server snapshot is the only source of
          // movement, intake, evolution, combat, respawn and leaderboard.
          const snapshot = this.networkArenaClient.snapshot;
          if (snapshot) {
            const arenaSnapshot = this.toNetworkArenaSnapshot(snapshot);
            if (snapshot.phase === 'FINISHED') this.showNetworkArenaSettlement(arenaSnapshot);
            else this.hud?.updateArena(arenaSnapshot);
          }
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
      // V4 reference 10 State A. The locked-target prompt is a HUD projection of
      // a real body that is being pulled but not swallowed, so it has to be
      // refreshed every gameplay frame from the live world objects.
      if (this.gameState === 'PLAYING' || this.gameState === 'ARENA') {
        this.hud?.updateTierLock(
          this.infiniteWorldManager?.getAllObjects() || [],
          this.mainCamera,
        );
      }
    }

    // The already scene-saved camera remains the concrete dependency; the
    // portrait service owns its viewport, FOV and follow mathematics.
    this.portraitCameraController?.updateFollow(mPos, this.gameState, dt);
  }

  /**
   * This is transport only: the local joystick remains the sole source of
   * player intent, while the Colyseus room remains the sole authority for the
   * remote position. No mass, pickup, combat or movement state is written by
   * this method. It is dormant unless an explicit arena endpoint joined.
   */
  private forwardNetworkArenaInput(dt: number): void {
    if (this.networkArenaClient.status !== 'CONNECTED') return;
    this.networkInputAccumulator += Math.max(0, dt);
    if (this.networkInputAccumulator < 0.05) return;
    this.networkInputAccumulator = 0;
    const input = this.playerController?.moveInput;
    const active = this.gameState === 'NETWORK_ARENA' && !this.isPaused && !!input && input.lengthSqr() > 0.01;
    this.networkArenaClient.sendMovement(
      active ? input!.x : 0,
      active ? input!.y : 0,
      active,
    );
  }
}
