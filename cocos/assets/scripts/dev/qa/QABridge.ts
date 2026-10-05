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
import { getHudSafeAreaPass } from '../../ui/HudSafeAreaInset';
import { HUDView } from '../../ui/HUDView';
import { JoystickVisual } from '../../ui/JoystickVisual';
import { MapPreviewGraphic } from '../../ui/MapPreviewGraphic';
import { RuntimePageInputRouter } from '../../ui/RuntimePageInputRouter';
import { UIAssetLibrary } from '../../ui/UIAssetLibrary';
import { InfiniteWorldManager } from '../../world/InfiniteWorldManager';
import { DistrictMapLibrary } from '../../world/DistrictMapLibrary';
import { BlobShadow } from '../../core/BlobShadow';
import { MaterialLibrary } from '../../core/MaterialLibrary';
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
  /** V7 PHASE 5: pooled absorb-burst evidence, or null when no runtime host exists. */
  readonly getAbsorbFeedbackDiagnostics: () => Readonly<Record<string, unknown>> | null;
  readonly getPortraitCameraController?: () => PortraitGameplayCameraController | null;
}

export interface PlayerControlTraceFrame {
  readonly timestamp: number;
  readonly frameDt: number;
  readonly inputMagnitude: number;
  readonly inputDirection: { readonly x: number; readonly y: number };
  readonly desiredDirection: { readonly x: number; readonly y: number; readonly z: number };
  readonly currentVelocity: { readonly x: number; readonly y: number; readonly z: number; readonly speed: number };
  readonly desiredVelocity: { readonly x: number; readonly y: number; readonly z: number; readonly speed: number };
  readonly playerPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly acceleration: number;
  readonly deceleration: number;
  readonly turnAngle: number;
  readonly cameraOffsetError: { readonly x: number; readonly y: number; readonly z: number; readonly distance: number };
  readonly cameraPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly cameraTargetPosition: { readonly x: number; readonly y: number; readonly z: number };
  /**
   * V8.1 CONTROL_TRACE_FORENSICS. Render-space position is only meaningful
   * together with the logical origin, so both are recorded. `externalWriteCount`
   * is the machine's own tally of position changes that its movement integration
   * did not make; a jump that coincides with a rise in this counter is an
   * external write, not player motion.
   */
  readonly logicalOrigin: { readonly x: number; readonly z: number };
  readonly rebaseCount: number;
  readonly currentCell: { readonly x: number; readonly z: number };
  readonly gameState: string;
  readonly machinePaused: boolean;
  readonly movementMagnitude: number;
  readonly externalWriteCount: number;
  readonly externalWriteDelta: { readonly x: number; readonly z: number };
  readonly externalWriteSource: string;
  /** The dt the machine itself integrated with, and how far it moved. */
  readonly integrationDt: number;
  readonly integrationDistance: number;
  readonly machineUpdateCount: number;
}

interface InstalledQABridge {
  readonly snapshot: () => Record<string, unknown>;
  readonly getControlTrace: () => PlayerControlTraceFrame[];
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
  private lastSpeed: number = 0;
  private latestTraceFrame: PlayerControlTraceFrame | null = null;
  private readonly controlTraceBuffer: PlayerControlTraceFrame[] = [];
  private totalFramesRecorded: number = 0;

  public constructor(private readonly read: QABridgeReadModel) {}

  public install(): void {
    const bridge: InstalledQABridge = {
      snapshot: () => this.snapshot(),
      getControlTrace: () => this.controlTraceBuffer.slice(),
    };
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

  public recordControlTraceFrame(dt: number): void {
    const machine = this.read.getMachine();
    const playerController = this.read.getPlayerController();
    const cameraController = this.read.getPortraitCameraController ? this.read.getPortraitCameraController() : null;
    const mainCamera = this.read.getMainCamera();
    if (!machine || dt <= 0) return;

    const moveInput = playerController?.moveInput;
    const inputMagnitude = moveInput ? moveInput.length() : 0;
    const inputDirection = {
      x: moveInput?.x ?? 0,
      y: moveInput?.y ?? 0,
    };

    const desiredDir = playerController?.getDesiredMovementDirection() ?? machine.getMovementDirection();
    const desiredDirection = {
      x: desiredDir.x,
      y: desiredDir.y,
      z: desiredDir.z,
    };

    const vx = machine.velocity.x;
    const vz = machine.velocity.z;
    const currentSpeed = Math.sqrt(vx * vx + vz * vz);
    const currentVelocity = {
      x: vx,
      y: 0,
      z: vz,
      speed: currentSpeed,
    };

    const targetSpeed = machine.getMoveSpeed() * machine.getMovementMagnitude();
    const desiredVelocity = {
      x: desiredDir.x * targetSpeed,
      y: 0,
      z: desiredDir.z * targetSpeed,
      speed: targetSpeed,
    };

    const pos = machine.node.position;
    const playerPosition = {
      x: pos.x,
      y: pos.y,
      z: pos.z,
    };

    const speedDelta = (currentSpeed - this.lastSpeed) / dt;
    const acceleration = speedDelta > 0 ? speedDelta : 0;
    const deceleration = speedDelta < 0 ? -speedDelta : 0;
    this.lastSpeed = currentSpeed;

    let turnAngle = 0;
    if (currentSpeed > 0.01 && (desiredDirection.x !== 0 || desiredDirection.z !== 0)) {
      const desiredLen = Math.sqrt(desiredDirection.x * desiredDirection.x + desiredDirection.z * desiredDirection.z);
      if (desiredLen > 0.0001) {
        const dot = (vx * desiredDirection.x + vz * desiredDirection.z) / (currentSpeed * desiredLen);
        const clampedDot = Math.max(-1, Math.min(1, dot));
        turnAngle = Math.acos(clampedDot) * (180 / Math.PI);
      }
    }

    const camOffsetError = cameraController ? cameraController.getOffsetError() : { x: 0, y: 0, z: 0, distance: 0 };
    const camPos = mainCamera?.node.position ?? Vec3.ZERO;
    const camTargetPos = cameraController ? cameraController.getTargetPosition() : Vec3.ZERO;

    // CONTROL_TRACE_FORENSICS: the origin, the rebase tally and the machine's
    // own external-write counter turn "position changed a lot" into an
    // attributable event instead of a suspicion.
    const world = this.read.getWorld();
    const forensics = machine.positionForensics;

    const frame: PlayerControlTraceFrame = {
      timestamp: performance.now(),
      frameDt: dt,
      inputMagnitude,
      inputDirection,
      desiredDirection,
      currentVelocity,
      desiredVelocity,
      playerPosition,
      acceleration,
      deceleration,
      turnAngle,
      cameraOffsetError: camOffsetError,
      cameraPosition: { x: camPos.x, y: camPos.y, z: camPos.z },
      cameraTargetPosition: { x: camTargetPos.x, y: camTargetPos.y, z: camTargetPos.z },
      logicalOrigin: { x: world?.logicalOrigin.x ?? 0, z: world?.logicalOrigin.z ?? 0 },
      rebaseCount: world?.rebaseCount ?? 0,
      currentCell: { x: world?.currentCell.x ?? 0, z: world?.currentCell.z ?? 0 },
      gameState: this.read.getGameState(),
      machinePaused: machine.isPaused,
      movementMagnitude: machine.getMovementMagnitude(),
      externalWriteCount: forensics.externalWriteCount,
      externalWriteDelta: { x: forensics.lastExternalDeltaX, z: forensics.lastExternalDeltaZ },
      externalWriteSource: forensics.lastExternalSource,
      integrationDt: forensics.lastIntegrationDt,
      integrationDistance: forensics.lastIntegrationDistance,
      machineUpdateCount: forensics.updateCount,
    };

    this.latestTraceFrame = frame;
    this.controlTraceBuffer.push(frame);
    this.totalFramesRecorded += 1;
    if (this.controlTraceBuffer.length > 1200) {
      this.controlTraceBuffer.shift();
    }
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
      // Record the machine state beside the silhouette. The structural body
      // scales with the machine's level, so the player's measured width moves
      // with its level; without this the gate cannot tell a level change from a
      // framing change.
      machine ? { level: machine.currentLevel, suctionRadius: machine.getSuctionRadius() } : null,
      // The frame-animated decorative layers are excluded from the silhouette.
      // They spin every frame, and `model.worldBounds` reports a rotating
      // node's rotated *box* AABB (up to sqrt(2) too wide), so merging them made
      // `playerWidthRatio` track the animation clock instead of the camera.
      // The machine owns the list; the QA layer never hardcodes node names.
      machine ? machine.getAnimatedDecorationNodes() : [],
    );
    const lv5CompositionDiagnostic = WorldCompositionProbe.getLV5CompositionDiagnostic(
      world,
      mainCamera,
      machine?.node || null,
    );
    const currentCellVisualDiagnostics = WorldCompositionProbe.getCurrentCellVisualDiagnostics(world, mainCamera);
    const districtProbe = WorldCompositionProbe.getDistrictProbe(world, mainCamera, machine?.node || null);
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
        edibleCue: object.isShowingEdibleCue(),
        // Who has claimed this body. ArenaMatchManager grants a claim to the
        // first competitor in range, so ownership is what separates "the player
        // never ate" from "the bots took everything first".
        owner: object.getCaptureOwnerId(),
        stateEntries: object.getStateEntryCounts(),
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
        near: mainCamera?.near ?? null,
        far: mainCamera?.far ?? null,
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
        worldPosition: {
          x: mainCamera?.node.worldPosition.x ?? 0,
          y: mainCamera?.node.worldPosition.y ?? 0,
          z: mainCamera?.node.worldPosition.z ?? 0,
        },
        forward: {
          x: mainCamera?.node.forward.x ?? 0,
          y: mainCamera?.node.forward.y ?? 0,
          z: mainCamera?.node.forward.z ?? 0,
        },
        right: {
          x: mainCamera?.node.right.x ?? 0,
          y: mainCamera?.node.right.y ?? 0,
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
        // V7 migration evidence: proves at runtime whether the authored
        // singularity asset replaced the runtime primitives.
        usesAuthoredSingularity: machine?.isUsingAuthoredSingularity() ?? null,
        // V7 PHASE 4 evidence: whether the authored rim-energy ring and suction
        // particle emitter actually adopted, the effect each resolved to, and
        // the emission rate the world's real suction load produced. Read-only.
        singularityEffects: machine?.getSingularityVisualDiagnostics() ?? null,
      },
      // V7 PHASE 1 evidence: proves at runtime that the authored category
      // materials are resident, not merely present in the bundle on disk.
      materialLibrary: {
        ready: MaterialLibrary.isReady(),
        boundCategories: [...MaterialLibrary.boundCategories()],
        lastError: MaterialLibrary.getLastError(),
      },
      // V7 PHASE 3 evidence: the authored district map library state. Read-only
      // projection of the loader; it exposes no setter and no gameplay state.
      districtMaps: {
        ready: DistrictMapLibrary.isReady(),
        pending: DistrictMapLibrary.isPending(),
        boundDistricts: DistrictMapLibrary.boundDistricts().slice(),
        lastError: DistrictMapLibrary.getLastError(),
      },
      // V7 PHASE 6/7 evidence: the authored UI prefab library state. This is the
      // read-only proof that the reusable prefabs and the thumbnails they draw
      // are resident at runtime, not merely present in the bundle on disk.
      uiAssets: {
        ready: UIAssetLibrary.isReady(),
        pending: UIAssetLibrary.isPending(),
        boundFrames: UIAssetLibrary.boundFrames().slice(),
        boundPrefabs: UIAssetLibrary.boundPrefabs().slice(),
        lastError: UIAssetLibrary.getLastError(),
      },
      world: {
        currentRegion: world?.currentTheme.id || 'bedroom',
        regionIndex: world?.getRegionIndex() || 0,
        activeCellCount: world?.activeCells.size || 0,
        visibleObjectCount: world?.getVisibleObjectCount() || 0,
        streaming: world ? {
          ...world.getSnapshot(),
          goldenCityComposition,
          lv5CompositionDiagnostic,
          visualDiagnostics: currentCellVisualDiagnostics,
          districtProbe,
        } : null,
      },
      // Engine-side observations only; never CDP DOM metrics or test labels.
      performance: this.getPerformanceSnapshot(world),
      arena: this.read.getArenaSnapshot(),
      // V8.2.1 §7: the real suction candidate decision, not a QA re-derivation.
      arenaSuctionTrace: this.read.getArenaMatchManager()?.getSuctionTrace() || null,
      settlement: this.getSettlementSnapshot(),
      network: {
        status: networkClient.status,
        lastError: networkClient.lastError,
        snapshot: networkClient.snapshot,
        replica: networkReplica?.getDiagnostics() || null,
      },
      sceneVisuals: this.getActiveVisualDiagnostics(),
      contactShadows: BlobShadow.getLoadState(),
      // V7 PHASE 5 evidence: the pooled absorb burst. `liveNodes` is a constant
      // pool size no matter how many absorptions happened, and `emittedCount`
      // proves the burst fired from the real absorb event.
      absorbFeedback: this.read.getAbsorbFeedbackDiagnostics(),
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
      playerControlTrace: {
        latest: this.latestTraceFrame,
        recentCount: this.controlTraceBuffer.length,
        totalRecorded: this.totalFramesRecorded,
        recentFrames: this.controlTraceBuffer.slice(-120),
      },
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
    const endlessReadyPage = canvas?.getChildByName('EndlessReadyPage') || null;
    const arenaReadyPage = canvas?.getChildByName('ArenaReadyPage') || null;
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
    /**
     * V4 references 06 / 07. The Ready pages are the only formal screens that
     * are not HUDView pages, so they need their own read-only projection: the
     * gate must prove the real map preview replaced the baked mode-card art and
     * that the per-mode copy is the locked copy.
     */
    const readyPage = (node: Node | null): Record<string, unknown> | null => {
      if (!node) return null;
      const previewNode = node.getChildByName('MapPreview') || null;
      return {
        root: describe(node),
        back: describe(node.getChildByName('BtnBack') || null),
        title: labelText(node.getChildByName('HeaderTitle') || null),
        header: describe(node.getChildByName('Header') || null),
        preview: describe(previewNode),
        previewArt: previewNode?.getComponent(MapPreviewGraphic)?.getDiagnostics() || null,
        start: describe(node.getChildByName('BtnStart') || null),
        startLabel: labelText(node.getChildByName('BtnStartLabel') || null),
        stat: labelText(node.getChildByName('StatValue') || null),
        machine: labelText(node.getChildByName('MachineValue') || null),
        intro: labelText(node.getChildByName('IntroText') || null),
      };
    };
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
      modeHeader: describe(mode?.getChildByName('Header') || null),
      machineInfo: describe(machineInfoPage),
      machineInfoPanel: describe(machineInfoPage?.getChildByName('CurrentPanel') || null),
      machineInfoMassValue: describe(machineInfoPage?.getChildByName('CurrentMassValue') || null),
      skinSelection: describe(skinSelectionPage),
      skinSelectionCoinPanel: describe(skinSelectionPage?.getChildByName('CoinPanel') || null),
      skinSelectionPreviewPanel: describe(skinSelectionPage?.getChildByName('PreviewPanel') || null),
      skinSelectionPreviewName: describe(skinSelectionPage?.getChildByName('PreviewNameValue') || null),
      skinSelectionPreviewDesc: describe(skinSelectionPage?.getChildByName('PreviewDescriptionValue') || null),
      skinSelectionRow1Card: describe(skinSelectionPage?.getChildByName('SkinCard_1') || null),
      skinSelectionRow1State: describe(skinSelectionPage?.getChildByName('SkinState_1') || null),
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
        // V7 PHASE 7 evidence: authored joystick sprites vs the vector fallback.
        joystickArt: joystick?.getComponent(JoystickVisual)?.getDiagnostics() || null,
        /**
         * Why the clamp did or did not move anything. The clamp can be a silent
         * no-op from the frame's point of view — a wrong frame size, an early
         * return, or a full-bleed backdrop merging the whole row into one
         * unshiftable group all look identical on screen ("the pills are still
         * clipped"). This reports the pass's own inputs and per-group shifts.
         */
        safeArea: endlessHud ? getHudSafeAreaPass(endlessHud) : null,
        /**
         * V4 defect RT-08-HUD-CLIP. `describe(endlessHud)` returns the HUD
         * *container*, which is 720 design px wide by construction and is
         * therefore always wider than the 390 px fit-height viewport — a clip
         * assertion against the container can never pass and can never fail
         * meaningfully. The clipped nodes are the individual top-bar pills, so
         * they are projected one by one here and the on-screen rect is derived
         * from these records by the capture runner.
         */
        pills: {
          coin: describe(endlessHud?.getChildByName('CoinValue') || null),
          mass: describe(endlessHud?.getChildByName('MassValue') || null),
          level: describe(endlessHud?.getChildByName('LevelValue') || null),
          region: describe(endlessHud?.getChildByName('RegionValue') || null),
        },
        /**
         * The `*Value` children above are Labels, so their UITransform width is
         * the laid-out *text* width — not the pill background. The clipped node
         * named in the defect is the pill container (`CoinPanel` left edge −319
         * against a usable design x-range of ≈[−296, +296]), so the containers
         * are projected separately and are the ones the clip gate asserts on.
         */
        pillPanels: {
          coin: describe(endlessHud?.getChildByName('CoinPanel') || null),
          level: describe(endlessHud?.getChildByName('LevelPanel') || null),
          region: describe(endlessHud?.getChildByName('RegionPanel') || null),
        },
        pillText: {
          coin: labelText(endlessHud?.getChildByName('CoinValue') || null),
          mass: labelText(endlessHud?.getChildByName('MassValue') || null),
          level: labelText(endlessHud?.getChildByName('LevelValue') || null),
          region: labelText(endlessHud?.getChildByName('RegionValue') || null),
        },
      },
      pickupFeedback: this.read.getHUD()?.getPickupFeedbackDiagnostics() || null,
      tierUpgrade: this.read.getHUD()?.getTierUpgradeDiagnostics() || null,
      tierLock: this.read.getHUD()?.getTierLockDiagnostics() || null,
      firstRunHint: this.read.getHUD()?.getFirstRunHintDiagnostics() || null,
      endlessReady: readyPage(endlessReadyPage),
      arenaReady: readyPage(arenaReadyPage),
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
        // The defeat cause lives only in these two labels; without them the
        // gate can see that the page opened but not what it told the player.
        reviveRank: labelText(revivePage?.getChildByName('RankValue') || null),
        reviveLoss: labelText(revivePage?.getChildByName('LossValue') || null),
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
