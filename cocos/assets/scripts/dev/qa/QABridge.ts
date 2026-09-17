/**
 * Read-only browser diagnostics for explicitly requested QA runtimes.
 *
 * This bridge is deliberately not a Component and is never a gameplay
 * authority.  It serializes observed engine/UI state for the external CDP
 * acceptance runner without exposing Cocos Nodes, Components, setters, or
 * event emitters back to the browser.
 */
import {
  Button,
  Camera,
  Canvas,
  director,
  Label,
  MeshRenderer,
  Node,
  Sprite,
  UITransform,
  Vec3,
  view,
} from 'cc';
import { PortraitGameplayCameraController } from '../../camera/PortraitGameplayCameraController';
import { MACHINE_EVOLUTION_CONFIG, SKINS_CONFIG } from '../../data/GameConfig';
import { saveService } from '../../data/SaveService';
import { ArenaMatchManager, ArenaMatchSnapshot } from '../../gameplay/ArenaMatchManager';
import { CompressionSystem } from '../../gameplay/CompressionSystem';
import { PlayerController } from '../../gameplay/PlayerController';
import { GameSessionState } from '../../gameplay/session/GameSessionCoordinator';
import { BlackHoleMachine } from '../../machine/BlackHoleMachine';
import { AuthoritativeArenaSnapshot, ColyseusArenaClient } from '../../network/ColyseusArenaClient';
import { NetworkArenaReplica } from '../../network/NetworkArenaReplica';
import { ArenaHUDController } from '../../ui/ArenaHUDController';
import { HUDView } from '../../ui/HUDView';
import { RuntimePageInputRouter } from '../../ui/RuntimePageInputRouter';
import { InfiniteWorldManager } from '../../world/InfiniteWorldManager';
import { WorldCompositionProbe } from './WorldCompositionProbe';

export interface QABridgeReadModel {
  readonly getGameState: () => GameSessionState;
  readonly getHUD: () => HUDView | null;
  readonly getMachine: () => BlackHoleMachine | null;
  readonly getPlayerController: () => PlayerController | null;
  readonly getCompressionSystem: () => CompressionSystem | null;
  readonly getWorld: () => InfiniteWorldManager | null;
  readonly getMainCamera: () => Camera | null;
  readonly getArenaMatchManager: () => ArenaMatchManager | null;
  readonly getNetworkClient: () => ColyseusArenaClient;
  readonly getNetworkReplica: () => NetworkArenaReplica | null;
  readonly getArenaSnapshot: () => ArenaMatchSnapshot | null;
  readonly getCameraOffset: (state: GameSessionState) => Readonly<Vec3>;
  readonly getSessionSnapshot: () => Readonly<Record<string, unknown>>;
  readonly getSaveSnapshot: () => Readonly<Record<string, unknown>>;
}

interface InstalledQABridge {
  readonly snapshot: () => Record<string, unknown>;
}

type QAHost = typeof globalThis & {
  __BHR_QA__?: InstalledQABridge;
};

/**
 * Browser QA adapter.  It is installed only by an explicitly requested
 * `?qa=1` runtime, so normal release/player sessions do not execute
 * diagnostics.  The public browser object stays intentionally tiny.
 */
export class QABridge {
  private installedBridge: InstalledQABridge | null = null;

  public constructor(private readonly read: QABridgeReadModel) {}

  public install(): void {
    const bridge: InstalledQABridge = { snapshot: () => this.snapshot() };
    const host = globalThis as QAHost;
    host.__BHR_QA__ = bridge;
    this.installedBridge = bridge;
  }

  public dispose(): void {
    const host = globalThis as QAHost;
    if (this.installedBridge && host.__BHR_QA__ === this.installedBridge) {
      delete host.__BHR_QA__;
    }
    this.installedBridge = null;
  }

  private snapshot(): Record<string, unknown> {
    const gameState = this.read.getGameState();
    const machine = this.read.getMachine();
    const playerController = this.read.getPlayerController();
    const mainCamera = this.read.getMainCamera();
    const world = this.read.getWorld();
    const arenaManager = this.read.getArenaMatchManager();
    const networkClient = this.read.getNetworkClient();
    const networkReplica = this.read.getNetworkReplica();
    const compressionSystem = this.read.getCompressionSystem();
    const viewport = view.getViewportRect();
    const goldenCityComposition = WorldCompositionProbe.getGoldenCityCompositionDiagnostics(
      world,
      mainCamera,
      machine?.node || null,
      arenaManager?.getCompositionCompetitors() || [],
    );
    const currentCellVisualDiagnostics = WorldCompositionProbe.getCurrentCellVisualDiagnostics(world);
    const goldenPlayer = goldenCityComposition?.player || null;
    const playerViewport = goldenPlayer?.screenBounds && viewport.width > 0 && viewport.height > 0 ? {
      x: ((goldenPlayer.screenBounds.left + goldenPlayer.screenBounds.right) * 0.5 - viewport.x) / viewport.width,
      y: goldenPlayer.screenYRatio,
      width: goldenPlayer.widthRatio,
      measured: true,
    } : null;
    const allObjects = world?.getAllObjects() || [];
    const sampledObjects = allObjects.map((object) => {
      const position = object.getPosition();
      return {
        runtimeId: object.runtimeId,
        type: object.template.type,
        tier: object.template.tier,
        state: object.getState(),
        x: position ? position.x : 0,
        z: position ? position.z : 0,
        lockVisible: object.isShowingLockAlert(),
      };
    });

    return {
      scene: director.getScene()?.name || 'Game',
      uiScreen: this.read.getHUD()?.currentScreenName || 'Home',
      gameState,
      ui: this.getUILayoutSnapshot(),
      player: {
        position: {
          x: machine?.node.position.x || 0,
          y: machine?.node.position.y || 0,
          z: machine?.node.position.z || 0,
        },
        x: machine?.node.position.x || 0,
        y: machine?.node.position.y || 0,
        z: machine?.node.position.z || 0,
        isMoving: playerController?.isDragging || false,
        isDragging: playerController?.isDragging || false,
      },
      camera: {
        fov: mainCamera?.fov ?? null,
        fovAxis: mainCamera?.fovAxis ?? null,
        offset: (() => {
          const offset = this.read.getCameraOffset(gameState);
          return { x: offset.x, y: offset.y, z: offset.z };
        })(),
        playerViewport,
        position: {
          x: mainCamera?.node.position.x ?? 0,
          y: mainCamera?.node.position.y ?? 0,
          z: mainCamera?.node.position.z ?? 0,
        },
        forward: {
          x: mainCamera?.node.forward.x ?? 0,
          z: mainCamera?.node.forward.z ?? 0,
        },
        right: {
          x: mainCamera?.node.right.x ?? 0,
          z: mainCamera?.node.right.z ?? 0,
        },
      },
      machine: {
        level: machine?.currentLevel || 1,
        mass: machine?.currentMass || 0,
        requiredMass: (MACHINE_EVOLUTION_CONFIG[Math.min(4, (machine?.currentLevel || 1))] || MACHINE_EVOLUTION_CONFIG[0]).massThreshold,
        suctionRadius: machine?.getSuctionRadius() || 2.4,
        maxTier: machine?.getMaxTier() || 1,
        movementInput: {
          x: playerController?.moveInput.x ?? 0,
          y: playerController?.moveInput.y ?? 0,
        },
        activeTouchId: playerController?.touchInput.activeTouchId ?? null,
        touchDiagnostic: playerController?.lastTouchDiagnostic ?? null,
        controller: playerController ? {
          enabled: playerController.enabled,
          activeInHierarchy: playerController.node.activeInHierarchy,
          nodeName: playerController.node.name,
        } : null,
        velocity: {
          x: machine?.velocity.x ?? 0,
          z: machine?.velocity.z ?? 0,
        },
        visualMaterials: machine?.getVisualMaterialDiagnostics() || [],
      },
      world: {
        currentRegion: world?.currentTheme.id || 'bedroom',
        regionIndex: world?.getRegionIndex() || 0,
        activeCellCount: world?.activeCells.size || 0,
        visibleObjectCount: world?.getVisibleObjectCount() || 0,
        streaming: world ? {
          ...world.getSnapshot(),
          goldenCityComposition,
          visualDiagnostics: currentCellVisualDiagnostics,
        } : null,
      },
      // Engine-side observations only; never CDP DOM metrics or test labels.
      performance: this.getPerformanceSnapshot(world),
      arena: this.read.getArenaSnapshot(),
      settlement: this.getSettlementSnapshot(),
      network: {
        status: networkClient.status,
        lastError: networkClient.lastError,
        snapshot: networkClient.snapshot,
        replica: networkReplica?.getDiagnostics() || null,
      },
      sceneVisuals: this.getActiveVisualDiagnostics(),
      objects: sampledObjects,
      compression: {
        state: compressionSystem?.state || 'IDLE',
        stateHistory: compressionSystem?.stateHistory ? Array.from(compressionSystem.stateHistory) : [],
        bufferMass: compressionSystem?.bufferMass || 0,
        bufferCount: compressionSystem?.bufferCount || 0,
        resourceBlockCount: compressionSystem?.resourceBlockCount || 0,
        storedResources: compressionSystem?.storedResources || 0,
      },
      session: this.read.getSessionSnapshot(),
      save: this.read.getSaveSnapshot(),
    };
  }

  /** UI layout evidence remains entirely on the QA side of the boundary. */
  private getUILayoutSnapshot(): Record<string, unknown> {
    const canvas = director.getScene()?.getChildByName('Canvas') || null;
    const home = canvas?.getChildByName('HomePage') || null;
    const mode = canvas?.getChildByName('ModeSelectPage') || null;
    const endlessHud = canvas?.getChildByName('EndlessHUD') || null;
    const arenaHud = canvas?.getChildByName('ArenaHUD') || null;
    const revivePage = canvas?.getChildByName('RevivePage') || null;
    const pausePage = canvas?.getChildByName('PausePage') || null;
    const settlementPage = canvas?.getChildByName('SettlementPage') || null;
    const machineInfoPage = canvas?.getChildByName('MachineInfoPage') || null;
    const skinSelectionPage = canvas?.getChildByName('SkinSelectionPage') || null;
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
      const button = node.getComponent(Button);
      return {
        active: node.activeInHierarchy,
        interactable: button?.interactable ?? null,
        x: node.position.x,
        y: node.position.y,
        width: transform?.width || 0,
        height: transform?.height || 0,
        scaleX: node.scale.x,
        scaleY: node.scale.y,
        world: worldPoint ? { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z } : null,
        screen: screenPoint && viewport.width > 0 && viewport.height > 0 ? {
          x: (screenPoint.x - viewport.x) / viewport.width,
          y: 1 - (screenPoint.y - viewport.y) / viewport.height,
        } : null,
      };
    };
    const labelText = (node: Node | null): string | null => node?.getComponent(Label)?.string || null;
    const design = view.getDesignResolutionSize();
    const visible = view.getVisibleSize();
    const frame = view.getFrameSize();
    const targetRatio = PortraitGameplayCameraController.DESIGN_WIDTH / PortraitGameplayCameraController.DESIGN_HEIGHT;
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
        viewportWithinFrame: viewport.x >= 0 && viewport.y >= 0
          && viewport.x + viewport.width <= frame.width && viewport.y + viewport.height <= frame.height,
        viewportRatio: viewport.height > 0 ? viewport.width / viewport.height : null,
      },
      canvas: { ...describe(canvas), alignCanvasWithScreen: canvasComponent?.alignCanvasWithScreen ?? null },
      uiCamera: uiCamera ? {
        projection: uiCamera.projection,
        orthoHeight: uiCamera.orthoHeight,
        x: uiCamera.node.position.x,
        y: uiCamera.node.position.y,
        z: uiCamera.node.position.z,
      } : null,
      home: describe(home),
      modePage: describe(mode),
      machineInfo: describe(machineInfoPage),
      skinSelection: describe(skinSelectionPage),
      skinSelectionBack: describe(skinSelectionPage?.getChildByName('BtnBack') || null),
      skinSelectionData: {
        coin: labelText(skinSelectionPage?.getChildByName('CoinValue') || null),
        previewName: labelText(skinSelectionPage?.getChildByName('PreviewNameValue') || null),
        previewDescription: labelText(skinSelectionPage?.getChildByName('PreviewDescriptionValue') || null),
        status: labelText(skinSelectionPage?.getChildByName('StatusValue') || null),
        states: SKINS_CONFIG.map((_skin, index) => labelText(skinSelectionPage?.getChildByName(`SkinState_${index + 1}`) || null)),
      },
      skinSelectionButtons: SKINS_CONFIG.map((_skin, index) => describe(skinSelectionPage?.getChildByName(`BtnSkin_${index + 1}`) || null)),
      machineInfoBack: describe(machineInfoPage?.getChildByName('BtnBack') || null),
      machineInfoData: {
        currentName: labelText(machineInfoPage?.getChildByName('CurrentNameValue') || null),
        currentMass: labelText(machineInfoPage?.getChildByName('CurrentMassValue') || null),
        currentRadius: labelText(machineInfoPage?.getChildByName('CurrentRadiusValue') || null),
        currentTier: labelText(machineInfoPage?.getChildByName('CurrentTierValue') || null),
        progress: labelText(machineInfoPage?.getChildByName('ProgressValue') || null),
        levelRows: MACHINE_EVOLUTION_CONFIG.map((config) => labelText(machineInfoPage?.getChildByName(`LevelRowText${config.level}`) || null)),
      },
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
      pickupFeedback: this.read.getHUD()?.getPickupFeedbackDiagnostics() || null,
      arenaHUD: {
        root: describe(arenaHud),
        pauseButton: describe(arenaHud?.getChildByName('BtnPause') || null),
        joystick: describe(arenaHud?.getChildByName('Joystick') || null),
        timer: describe(arenaHud?.getChildByName('TimerValue') || null),
        nameplates: arenaHud?.getComponent(ArenaHUDController)?.getNameplateDiagnostics() || [],
      },
      formalPages: {
        pause: describe(pausePage),
        pauseResume: describe(pausePage?.getChildByName('BtnResume') || null),
        pauseSettle: describe(pausePage?.getChildByName('BtnSettle') || null),
        pauseHome: describe(pausePage?.getChildByName('BtnHome') || null),
        settlement: describe(settlementPage),
        settlementRestart: describe(settlementPage?.getChildByName('BtnRestart') || null),
        settlementHome: describe(settlementPage?.getChildByName('BtnHome') || null),
        settlementData: {
          title: labelText(settlementPage?.getChildByName('Title') || null),
          subtitle: labelText(settlementPage?.getChildByName('Subtitle') || null),
          result: labelText(settlementPage?.getChildByName('ArenaResult') || null),
          mass: labelText(settlementPage?.getChildByName('ArenaStatMassValue') || null),
          kills: labelText(settlementPage?.getChildByName('ArenaStatKillsValue') || null),
          time: labelText(settlementPage?.getChildByName('ArenaStatTimeValue') || null),
          reward: labelText(settlementPage?.getChildByName('ArenaRewardValue') || null),
          breakdown: labelText(settlementPage?.getChildByName('ArenaRewardBreakdown') || null),
          localRow: {
            badge: labelText(settlementPage?.getChildByName('ArenaPlayerBadge') || null),
            name: labelText(settlementPage?.getChildByName('ArenaPlayerName') || null),
            score: labelText(settlementPage?.getChildByName('ArenaPlayerScore') || null),
          },
          rows: [1, 2, 3, 4, 5].map((rank) => ({
            active: settlementPage?.getChildByName(`ArenaRankRow_${rank}`)?.activeInHierarchy || false,
            badge: labelText(settlementPage?.getChildByName(`ArenaRankBadge_${rank}`) || null),
            name: labelText(settlementPage?.getChildByName(`ArenaRankName_${rank}`) || null),
            score: labelText(settlementPage?.getChildByName(`ArenaRankScore_${rank}`) || null),
          })),
        },
        revive: describe(revivePage),
        reviveNow: describe(revivePage?.getChildByName('BtnRevive') || null),
        reviveGiveUp: describe(revivePage?.getChildByName('BtnGiveUp') || null),
      },
      runtimePageInput: runtimePageInput?.lastInputDiagnostic || null,
      registrationBranding: describe(canvas?.getChildByName('RegistrationBranding') || null),
      registrationBrandingText: labelText(canvas?.getChildByName('RegistrationBranding') || null),
      logo: describe(homeNode('Logo')),
      hero: describe(homeNode('HeroBlackHole')),
      start: describe(homeNode('BtnStart')),
      mode: describe(homeNode('BtnMode')),
      skin: describe(homeNode('BtnSkin')),
      machine: describe(homeNode('BtnMachine')),
      settings: describe(homeNode('BtnSettings')),
    };
  }

  private getSettlementSnapshot(): Record<string, unknown> | null {
    const arena = this.read.getArenaSnapshot();
    if (!arena?.matchId) return null;
    const claimedIds = this.read.getSaveSnapshot().claimedArenaSettlementIds;
    const claimed = Array.isArray(claimedIds) && claimedIds.includes(arena.matchId);
    return {
      matchId: arena.matchId,
      claimed,
      ...arena.settlementReward,
    };
  }

  /** Read-only scan used to identify real Web Mobile visual fallbacks. */
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
        if (slots.some((slot) => !slot.valid || !slot.effect)) invalidMeshes.push({ path, primitiveCount, slots });
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

  /** Read-only Cocos scene and streamed-object counters for performance QA. */
  private getPerformanceSnapshot(world: InfiniteWorldManager | null): Record<string, unknown> {
    let sceneNodeCount = 0;
    let activeNodeCount = 0;
    let activeMeshRendererCount = 0;
    let activeMeshPrimitiveCount = 0;
    const visit = (node: Node): void => {
      if (!node.isValid) return;
      sceneNodeCount += 1;
      if (node.activeInHierarchy) {
        activeNodeCount += 1;
        const renderer = node.getComponent(MeshRenderer);
        if (renderer) {
          activeMeshRendererCount += 1;
          activeMeshPrimitiveCount += renderer.mesh?.struct.primitives.length || 0;
        }
      }
      node.children.forEach(visit);
    };
    const scene = director.getScene();
    if (scene) visit(scene);

    const objects = world?.getAllObjects() || [];
    const isVehicle = (runtimeId: string): boolean => runtimeId.startsWith('traffic_');
    const isAvailable = (state: string): boolean => state !== 'ABSORBED' && state !== 'RECYCLED';
    const activeObjects = objects.filter((object) => object.node.activeInHierarchy);
    const visibleObjects = activeObjects.filter((object) => isAvailable(object.getState()));
    const count = (items: typeof objects, predicate: (runtimeId: string) => boolean): number =>
      items.filter((object) => predicate(object.runtimeId)).length;
    const countAvailable = (predicate: (runtimeId: string) => boolean): number =>
      count(visibleObjects, predicate);

    return {
      cocos: {
        sceneNodeCount,
        activeNodeCount,
        activeMeshRendererCount,
        activeMeshPrimitiveCount,
        // Cocos 3.8 exposes no stable public counter for batches, draw calls,
        // or distinct mesh assets in this production build.
        meshAssetCount: 'BLOCKED_UNEXPOSED',
        drawCalls: 'BLOCKED_UNEXPOSED',
        batches: 'BLOCKED_UNEXPOSED',
      },
      world: {
        activeCellRegisteredObjectCount: objects.length,
        activeObjectCount: activeObjects.length,
        lifecycleVisibleObjectCount: visibleObjects.length,
        activeCollectibleCount: count(activeObjects, (runtimeId) => !isVehicle(runtimeId)),
        lifecycleVisibleCollectibleCount: countAvailable((runtimeId) => !isVehicle(runtimeId)),
        activeVehicleCount: count(activeObjects, isVehicle),
        lifecycleVisibleVehicleCount: countAvailable(isVehicle),
      },
    };
  }
}
