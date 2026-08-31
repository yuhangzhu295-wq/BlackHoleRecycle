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
  public compressionSystem: CompressionSystem | null = null;
  public isPaused: boolean = false;

  private cameraOffset: Vec3 = new Vec3(0, 16.0, 11.0);
  private cameraTarget: Vec3 = new Vec3();

  onLoad(): void {
    platformAdapter.init();
    this.currentCoins = saveService.data.coins;
    this.autoBindDependencies();
    this.initLighting();
    this.bindEvents();
    this.initWorld();
    
    // Inject STRICT READ-ONLY QA_MODE
    (window as any).__BHR_QA__ = {
      snapshot: () => {
        return {
          scene: director.getScene()?.name,
          gameState: this.isPaused ? 'PAUSED' : 'PLAYING',
          machineMass: this.machine?.currentMass || 0,
          machineLevel: this.machine?.currentLevel || 1,
          player: {
            x: this.machine?.node.position.x,
            y: this.machine?.node.position.y,
            z: this.machine?.node.position.z,
          },
          compression: {
            state: this.compressionSystem?.state,
            bufferMass: this.compressionSystem?.bufferMass,
            bufferCount: this.compressionSystem?.bufferCount,
            resourceBlockCount: this.compressionSystem?.resourceBlockCount,
            storedResources: this.compressionSystem?.storedResources
          },
          world: {
            currentRegion: this.chunkManager?.currentTheme.id,
            activeAreaCount: this.chunkManager?.activeChunks.length
          },
          session: {
            absorbed: this.totalAbsorbedCount,
            coinsEarned: this.currentCoins,
            score: this.score
          },
          save: {
            coins: saveService.data.coins
          }
        };
      }
    };
  }

  private autoBindDependencies(): void {
    if (!this.machine) {
      this.machine = this.node.getComponentInChildren(BlackHoleMachine);
    }
    if (!this.mainCamera) {
      this.mainCamera = this.node.scene.getComponentInChildren(Camera);
    }
    if (!this.hud) {
      this.hud = this.node.getComponentInChildren(HUDView);
      if (!this.hud) {
        const runtimeHudNode = new Node('RuntimeHUD');
        this.node.addChild(runtimeHudNode);
        this.hud = runtimeHudNode.addComponent(HUDView);
      }
    }
    if (!this.compressionSystem) {
      this.compressionSystem = this.node.getComponent(CompressionSystem) || this.node.addComponent(CompressionSystem);
    }
    if (!this.chunkManager) {
      this.chunkManager = this.node.getComponentInChildren(WorldChunkManager);
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

  private initLighting(): void {
    const scene = director.getScene();
    if (scene && !scene.getChildByName('MainLight')) {
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
      this.updateHUD();
    });

    eventBus.on('UI_UPDATE_HUD', (data: any) => {
      this.currentCoins = data.coins;
      this.updateHUD();
    });

    eventBus.on('UI_TRIGGER_PAUSE', () => {
      if (director.isPaused()) {
        director.resume();
        if (this.hud) this.hud.showScreen('Gameplay');
      } else {
        director.pause();
        if (this.hud) this.hud.showScreen('Pause');
      }
    });
  }

  public onObjectAbsorbed(obj: CompressibleObject): void {
    if (!this.machine) return;
    const t = obj.template;
    this.totalAbsorbedCount++;
    this.score += t.value * 10;

    // Use actual Compression System instead of fake setTimeout
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
      this.hud.updateStats(
        this.machine.currentMass,
        this.machine.currentLevel,
        this.machine.currentConfig.title,
        this.currentCoins
      );
    }
  }

  update(dt: number): void {
    if (!this.machine || !this.mainCamera) return;

    const mPos = this.machine.node.position;
    
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
