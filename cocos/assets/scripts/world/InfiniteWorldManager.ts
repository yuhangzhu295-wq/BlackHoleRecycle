/**
 * Production endless-world streamer.  Unlike the retained legacy
 * WorldChunkManager, this owns a real two-dimensional X/Z grid around the
 * player and keeps logical world coordinates separate from rendered ones.
 */
import { _decorator, Component, director, instantiate, Node, Prefab, resources, Vec3 } from 'cc';
import { IObjectTemplate, IRegionThemeConfig, OBJECT_TEMPLATES, ObjectTier, REGION_THEMES } from '../data/GameConfig';
import { ObjectPool } from '../core/ObjectPool';
import { eventBus } from '../core/EventBus';
import { CompressibleObject } from '../gameplay/CompressibleObject';
import { CellItemGenerator, IChunkSpawnItem } from './ChunkConfig';
import { DistrictKind, DistrictTemplate, getDistrictTemplateForRegion } from './DistrictTemplates';
import { DynamicVehicle, RoadRoutePoint } from './DynamicVehicle';
import { WorldArtKind, WorldArtLibrary } from './WorldArtLibrary';
import { WorldStreamer } from './WorldStreamer';
import { WorldCellFactory } from './WorldCellFactory';
import type { WorldCellCoord as SharedWorldCellCoord, WorldRebase as SharedWorldRebase } from './WorldTypes';

const { ccclass, property } = _decorator;
const V3 = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);
const ONE = new Vec3(1, 1, 1);

export type WorldCellCoord = SharedWorldCellCoord;

/**
 * Narrow read-only view of a live streamed cell. It is intentionally useful
 * to engine-side systems such as traffic and development diagnostics, but is
 * never serialized through the browser-facing QA bridge.
 */
export interface WorldCellRuntimeContent {
  readonly coord: WorldCellCoord;
  readonly node: Node;
  readonly objects: readonly CompressibleObject[];
  readonly dynamicVehicles: readonly DynamicVehicle[];
}

export type WorldRebase = SharedWorldRebase;

function cellKey(coord: WorldCellCoord): string {
  return `${coord.x}:${coord.z}`;
}

function positiveMod(value: number, divisor: number): number {
  const result = value % divisor;
  return result < 0 ? result + divisor : result;
}

interface CollectibleRespawnSlot {
  readonly template: IObjectTemplate;
  readonly x: number;
  readonly z: number;
  readonly customId: string;
  availableAt: number;
  active: boolean;
}

interface TrafficRespawnSlot {
  readonly template: IObjectTemplate;
  readonly route: RoadRoutePoint[];
  spawnX: number;
  spawnZ: number;
  readonly id: string;
  readonly kind: 'sedan' | 'delivery_van' | 'garbage_truck';
  readonly speed: number;
  availableAt: number;
  active: boolean;
}

function isCollectibleObject(object: CompressibleObject): boolean {
  return !object.runtimeId.startsWith('traffic_') && !object.runtimeId.startsWith('arena_fragment_');
}

function isVehicleObject(object: CompressibleObject): boolean {
  return object.runtimeId.startsWith('traffic_');
}

/** One generated cell with its own Creator-imported environment and pooled loot. */
class InfiniteWorldCell {
  public readonly objects: CompressibleObject[] = [];
  public readonly dynamicVehicles: DynamicVehicle[] = [];
  private readonly collectibleSlots: CollectibleRespawnSlot[] = [];
  private readonly trafficSlots: TrafficRespawnSlot[] = [];
  private respawnClock = 0;
  public readonly district: DistrictTemplate;
  /** One Creator-imported CC0 landmark; never a gameplay or collision node. */
  private constructionLandmark: Node | null = null;
  // Imported glTF renderers can finish their Web Mobile sub-model setup after
  // the authored cell becomes active. Rebind the approved runtime material on
  // the next frames, matching the bounded machine visual lifecycle repair.
  private authoredMaterialRebindFrames: number = 0;
  private constructionMaterialRebindFrames: number = 0;

  public constructor(
    public readonly coord: WorldCellCoord,
    public readonly node: Node,
    public readonly theme: IRegionThemeConfig,
    district: DistrictTemplate,
    private readonly art: WorldArtLibrary,
    private readonly cellSize: number,
    public readonly isAuthored: boolean = false,
  ) {
    this.district = district;
    if (isAuthored) {
      this.art.hydrateAuthoredOpeningMaterials(this.node);
      this.authoredMaterialRebindFrames = 2;
    } else {
      this.buildEnvironment();
    }
  }

  public populate(
    items: readonly IChunkSpawnItem[],
    objectPool: ObjectPool<CompressibleObject>,
    logicalOrigin: Readonly<Vec3>,
  ): void {
    const centerX = this.coord.x * this.cellSize;
    const centerZ = this.coord.z * this.cellSize;
    for (const item of items) {
      const customId = item.customId || ('cell_' + this.coord.x + '_' + this.coord.z + '_collectible_' + this.collectibleSlots.length);
      const object = objectPool.get();
      object.spawn(
        item.template,
        centerX + item.localX - logicalOrigin.x,
        centerZ + item.localZ - logicalOrigin.z,
        0.35,
        customId,
      );
      this.objects.push(object);
      if (!customId.startsWith('arena_fragment_')) {
        this.collectibleSlots.push({
          template: item.template,
          x: centerX + item.localX,
          z: centerZ + item.localZ,
          customId,
          availableAt: 0,
          active: true,
        });
      }
    }
    this.populateDynamicTraffic(objectPool, logicalOrigin);
  }

  public populateAuthoredContent(
    objectPool: ObjectPool<CompressibleObject>,
    logicalOrigin: Readonly<Vec3>,
  ): void {
    const findNodeByName = (root: Node, targetName: string): Node | null => {
      if (root.name === targetName) return root;
      for (const child of root.children) {
        const found = findNodeByName(child, targetName);
        if (found) return found;
      }
      return null;
    };

    const spawnPointsRoot = findNodeByName(this.node, 'CollectibleSpawnPoints');
    if (!spawnPointsRoot) return;

    const t1Templates = OBJECT_TEMPLATES.filter((template) => template.tier === ObjectTier.T1);
    if (t1Templates.length === 0) return;

    const registerAuthoredSlot = (
      template: IObjectTemplate,
      anchor: Node,
      customId: string,
    ): void => {
      const worldPos = anchor.worldPosition;
      const object = objectPool.get();
      object.spawn(
        template,
        worldPos.x - logicalOrigin.x,
        worldPos.z - logicalOrigin.z,
        0.35,
        customId,
      );
      this.objects.push(object);
      this.collectibleSlots.push({
        template,
        x: worldPos.x,
        z: worldPos.z,
        customId,
        availableAt: 0,
        active: true,
      });
    };

    // Creator owns WHERE. These named groups are T1 respawn slots; their
    // positions and counts remain entirely in the prefab authoring data.
    const t1GroupNames = new Set(['TutorialStarter', 'Cluster_Park', 'Cluster_CitySquare']);
    for (const group of spawnPointsRoot.children) {
      if (!t1GroupNames.has(group.name)) continue;
      const spawnPoints = group.children.filter((child) => child.name.startsWith('SpawnPoint_'));
      spawnPoints.forEach((spawnPoint, index) => {
        registerAuthoredSlot(
          t1Templates[index % t1Templates.length],
          spawnPoint,
          `cluster_${group.name}_${index}`,
        );
      });
    }

    // The tutorial target has its own authored group so it cannot be confused
    // with a normal T1 cluster. Existing content has no such group yet, so the
    // named Creator anchor is an explicit deferred-authoring fallback.
    const t2Target = OBJECT_TEMPLATES.find((template) => template.tier === ObjectTier.T2);
    if (t2Target) {
      const tutorialTargetGroup = spawnPointsRoot.children.find((child) => child.name === 'TutorialT2Target');
      const targetSpawnPoint = tutorialTargetGroup?.children.find((child) => child.name.startsWith('SpawnPoint_'));
      if (targetSpawnPoint) {
        registerAuthoredSlot(t2Target, targetSpawnPoint, 'tutorial_t2_target');
      } else if (tutorialTargetGroup) {
        // A target group without a child point is itself the authored anchor.
        registerAuthoredSlot(t2Target, tutorialTargetGroup, 'tutorial_t2_target');
      } else {
        const deferredAnchor = findNodeByName(this.node, 'ClusterAnchor_RecyclingSquare');
        if (deferredAnchor) {
          console.warn('[DEFERRED_AUTHORING] TutorialT2Target is missing; using ClusterAnchor_RecyclingSquare.');
          registerAuthoredSlot(t2Target, deferredAnchor, 'tutorial_t2_target');
        }
      }
    }
  }

  public populateAuthoredTraffic(
    objectPool: ObjectPool<CompressibleObject>,
    logicalOrigin: Readonly<Vec3>,
  ): void {
    const findNodeByName = (root: Node, targetName: string): Node | null => {
      if (root.name === targetName) return root;
      for (const child of root.children) {
        const found = findNodeByName(child, targetName);
        if (found) return found;
      }
      return null;
    };

    const routesRoot = findNodeByName(this.node, 'TrafficRoutes');
    if (!routesRoot) return;
    const roadRouteNames = ['RoadWest', 'RoadNorth', 'RoadEast', 'RoadSouth'];
    const roadRoute = roadRouteNames
      .map((name) => findNodeByName(this.node, name))
      .filter((node): node is Node => Boolean(node))
      .map((node) => {
        const position = node.worldPosition;
        return { x: position.x - logicalOrigin.x, z: position.z - logicalOrigin.z };
      });
    if (roadRoute.length < 4) return;
    for (const anchor of routesRoot.children.filter((child) => child.name.startsWith('VehicleAnchor_'))) {
      const kind = anchor.name.includes('GarbageTruck')
        ? 'garbage_truck'
        : anchor.name.includes('DeliveryVan')
          ? 'delivery_van'
          : 'car';
      const template = OBJECT_TEMPLATES.find((candidate) => candidate.type === kind);
      if (!template) continue;
      const worldPos = anchor.worldPosition;
      const x = worldPos.x - logicalOrigin.x;
      const z = worldPos.z - logicalOrigin.z;
      const object = objectPool.get();
      const id = 'traffic_0_0_authored_' + anchor.name;
      object.spawn(template, x, z, 0.35, id);
      this.objects.push(object);
      const vehicleKind = kind === 'car' ? 'sedan' : kind;
      const speed = kind === 'car' ? 4.0 : kind === 'delivery_van' ? 3.2 : 2.6;
      this.dynamicVehicles.push(new DynamicVehicle(id, vehicleKind, object, roadRoute, speed));
      this.trafficSlots.push({ template, route: roadRoute.map((point) => ({ ...point })), spawnX: x, spawnZ: z, id, kind: vehicleKind, speed, availableAt: 0, active: true });
    }
  }

  public recycle(objectPool: ObjectPool<CompressibleObject>): void {
    this.objects.forEach((object) => {
      object.recycle();
      objectPool.release(object);
    });
    this.objects.length = 0;
    this.dynamicVehicles.length = 0;
    this.collectibleSlots.length = 0;
    this.trafficSlots.length = 0;
    this.node.destroy();
  }

  public advanceRespawnClock(dt: number): void {
    this.refreshRuntimeMaterialBindings();
    this.respawnClock += Math.max(0, dt);
  }

  private refreshRuntimeMaterialBindings(): void {
    if (this.authoredMaterialRebindFrames > 0 && this.node.activeInHierarchy) {
      this.art.hydrateAuthoredOpeningMaterials(this.node);
      this.authoredMaterialRebindFrames--;
    }
    if (this.constructionMaterialRebindFrames > 0 && this.constructionLandmark?.activeInHierarchy) {
      this.art.hydrateConstructionLandmarkMaterials(this.constructionLandmark);
      this.constructionMaterialRebindFrames--;
    }
  }

  public updateCollectibleRespawn(
    objectPool: ObjectPool<CompressibleObject>,
    logicalOrigin: Readonly<Vec3>,
    activeCollectibleCount: number,
    maxActiveCollectibles: number,
  ): number {
    let spawned = 0;
    for (const slot of this.collectibleSlots) {
      if (slot.active || slot.availableAt > this.respawnClock) continue;
      if (activeCollectibleCount + spawned >= maxActiveCollectibles) break;
      const object = objectPool.get();
      object.spawn(slot.template, slot.x - logicalOrigin.x, slot.z - logicalOrigin.z, 0.35, slot.customId);
      this.objects.push(object);
      slot.active = true;
      spawned += 1;
    }
    return spawned;
  }

  public removeAbsorbedCollectible(
    object: CompressibleObject,
    objectPool: ObjectPool<CompressibleObject>,
    respawnDelaySeconds: number,
  ): boolean {
    const objectIndex = this.objects.indexOf(object);
    if (objectIndex === -1) return false;
    this.objects.splice(objectIndex, 1);
    if (isCollectibleObject(object)) {
      const slot = this.collectibleSlots.find((candidate) => candidate.customId === object.runtimeId);
      if (slot) {
        slot.active = false;
        slot.availableAt = this.respawnClock + respawnDelaySeconds;
      }
    }
    objectPool.release(object);
    return true;
  }

  public updateDynamicTraffic(dt: number): void {
    this.dynamicVehicles.forEach((vehicle) => vehicle.update(dt));
  }

  public removeAbsorbedVehicle(object: CompressibleObject, objectPool: ObjectPool<CompressibleObject>, respawnDelaySeconds: number): boolean {
    const objectIndex = this.objects.indexOf(object);
    const vehicleIndex = this.dynamicVehicles.findIndex((vehicle) => vehicle.object === object);
    if (objectIndex === -1 || vehicleIndex === -1) return false;
    const vehicle = this.dynamicVehicles[vehicleIndex];
    this.objects.splice(objectIndex, 1);
    this.dynamicVehicles.splice(vehicleIndex, 1);
    const slot = this.trafficSlots.find((candidate) => candidate.id === vehicle.id);
    if (slot) {
      slot.active = false;
      slot.availableAt = this.respawnClock + respawnDelaySeconds;
    }
    objectPool.release(object);
    return true;
  }

  public replenishTraffic(objectPool: ObjectPool<CompressibleObject>, maxActiveVehicles: number, activeVehicleCount: number): number {
    let spawned = 0;
    for (const slot of this.trafficSlots) {
      if (slot.active || slot.availableAt > this.respawnClock) continue;
      if (activeVehicleCount + spawned >= maxActiveVehicles) break;
      const routeEntryBusy = this.dynamicVehicles.some((vehicle) => {
        const position = vehicle.object.getPosition();
        return Math.hypot(position.x - slot.spawnX, position.z - slot.spawnZ) < 5;
      });
      if (routeEntryBusy) continue;
      const object = objectPool.get();
      object.spawn(slot.template, slot.spawnX, slot.spawnZ, 0.35, slot.id);
      this.objects.push(object);
      this.dynamicVehicles.push(new DynamicVehicle(slot.id, slot.kind, object, slot.route, slot.speed));
      slot.active = true;
      spawned += 1;
    }
    return spawned;
  }

  public applyWorldRebase(shift: Readonly<Vec3>): void {
    this.objects.forEach((object) => object.applyWorldRebase(shift));
    this.dynamicVehicles.forEach((vehicle) => vehicle.applyWorldRebase(shift));
    this.trafficSlots.forEach((slot) => {
      slot.route.forEach((point) => { point.x -= shift.x; point.z -= shift.z; });
      slot.spawnX -= shift.x;
      slot.spawnZ -= shift.z;
    });
  }

  /**
   * Attach the artist-authored construction-site prefab only in the opening
   * city cell. The imported prefab is a background landmark: it carries no
   * CompressibleObject, Physics, collider, reward, or input components.
   */
  public addConstructionLandmark(prefab: Prefab): boolean {
    if (this.coord.x !== 0 || this.coord.z !== 0 || this.constructionLandmark || !this.node.isValid) return false;
    const landmark = instantiate(prefab);
    landmark.name = 'MajadroidConstructionLandmark';
    landmark.setPosition(0, 0.02, -26.5);
    landmark.setRotationFromEuler(0, 180, 0);
    // The source site spans a whole construction block. Scale it as a
    // distant skyline district so it enriches the portrait city without
    // obscuring the actual pickup and competitor lanes at the origin.
    landmark.setScale(0.145, 0.145, 0.145);
    this.node.addChild(landmark);
    this.constructionLandmark = landmark;
    this.art.hydrateConstructionLandmarkMaterials(landmark);
    this.constructionMaterialRebindFrames = 2;
    return true;
  }

  public hasConstructionLandmark(): boolean {
    return Boolean(this.constructionLandmark?.isValid && this.constructionLandmark.activeInHierarchy);
  }

  private spawn(
    kind: WorldArtKind,
    x: number,
    z: number,
    scale: Readonly<Vec3> = ONE,
    yaw: number = 0,
    name: string = kind,
    height: number = 0,
  ): void {
    this.art.spawn(kind, this.node, V3(x, height, z), scale, yaw, name);
  }

  private populateDynamicTraffic(objectPool: ObjectPool<CompressibleObject>, logicalOrigin: Readonly<Vec3>): void {
    const dynamicType: 'car' | 'delivery_van' | 'garbage_truck' | null = (() => {
      switch (this.district.kind) {
        // The opening bedroom region is now deliberately mapped to the
        // residential district.  Keep its visible road alive with a real
        // sedan instead of accidentally removing all dynamic traffic when
        // region and district semantics are kept consistent.
        case 'RESIDENTIAL': return 'car';
        case 'SUPERMARKET': return 'delivery_van';
        case 'WAREHOUSE': return 'garbage_truck';
        case 'PARKING': return 'car';
        case 'CONSTRUCTION': return 'garbage_truck';
        case 'DOWNTOWN': return 'car';
        default: return null;
      }
    })();
    if (!dynamicType) return;
    const template = OBJECT_TEMPLATES.find((candidate) => candidate.type === dynamicType);
    if (!template) throw new Error(`[InfiniteWorldCell] Missing dynamic vehicle template: ${dynamicType}`);
    const visualKind = dynamicType === 'car' ? 'sedan' : dynamicType;

    const centerX = this.coord.x * this.cellSize - logicalOrigin.x;
    const centerZ = this.coord.z * this.cellSize - logicalOrigin.z;
    const isOpeningCell = this.coord.x === 0 && this.coord.z === 0;
    const routeZ = centerZ + this.roadCenterZ;
    const routeHalfWidth = isOpeningCell ? 4 : 12;
    // Road kits are laid out around the cell centre. Keep traffic inside that
    // authored street corridor: it now drives a four-corner loop instead of
    // bouncing in a single X line, and each corner exposes a real TURN state.
    const route = [
      { x: centerX - routeHalfWidth, z: routeZ - 3 },
      { x: centerX + routeHalfWidth, z: routeZ - 3 },
      { x: centerX + routeHalfWidth, z: routeZ + 3 },
      { x: centerX - routeHalfWidth, z: routeZ + 3 },
    ];
    const start = route[0];
    const object = objectPool.get();
    object.spawn(template as IObjectTemplate, start.x, start.z, 0.35, `traffic_${this.coord.x}_${this.coord.z}_${visualKind}`);
    this.objects.push(object);
    this.dynamicVehicles.push(new DynamicVehicle(
      `traffic_${this.coord.x}_${this.coord.z}_${visualKind}`,
      visualKind,
      object,
      route,
      visualKind === 'sedan' ? 4.0 : visualKind === 'delivery_van' ? 3.2 : 2.6,
    ));
    this.trafficSlots.push({
      template,
      route: route.map((point) => ({ ...point })),
      spawnX: start.x,
      spawnZ: start.z,
      id: `traffic_${this.coord.x}_${this.coord.z}_${visualKind}`,
      kind: visualKind,
      speed: visualKind === 'sedan' ? 4.0 : visualKind === 'delivery_van' ? 3.2 : 2.6,
      availableAt: 0,
      active: true,
    });
  }

  /**
   * Deterministic district geometry in local cell space.  Cells are deliberately
   * composed on both axes: roads leave through all cardinal boundaries and
   * landmarks occupy the four corners, so east/west travel never reaches a void.
   */
  private buildEnvironment(): void {
    const half = this.cellSize * 0.5;

    // Four 32m grass quadrants cover the full 64m cell. `tile-low` is a 1m
    // source mesh: scale 16 here previously left a 16×16m hole at the cell
    // centre, exposing the scene skybox's neutral ground exactly where the
    // player spawns. The authored scene's legacy neutral floor is at y=0, so
    // streamed terrain is slightly above it and asphalt above the grass.
    for (const x of [-half * 0.5, half * 0.5]) {
      for (const z of [-half * 0.5, half * 0.5]) {
        this.spawn('terrainTile', x, z, V3(32, 1, 32), 0, 'DistrictGround', 0.01);
      }
    }

    // The spawn cell begins on grass with the road ahead of the player.  The
    // previous 12x crossroad occupied the whole portrait view and hid the
    // district landmarks, so it read as an empty asphalt test pad rather
    // than a navigable city neighbourhood.
    const roadZ = this.roadCenterZ;
    if (this.district.kind === 'RESIDENTIAL' || this.district.kind === 'PARK' || this.district.kind === 'DOWNTOWN') {
      // `road-crossroad-path` is authored as a 1 m kit piece. Scale it to a
      // true road junction so it spans the widened portrait city view rather
      // than reading as a small grey stamp behind the fountain.
      this.spawn('roadCrossroad', 0, roadZ, V3(12.0, 1, 12.0), 0, 'FourWayRoad', 0.05);
    } else {
      this.spawn('roadStraight', 0, roadZ, V3(12.0, 1, 18.0), this.district.kind === 'PARKING' ? 90 : 0, 'DistrictRoad', 0.05);
    }

    this.buildDistrictLandmarks(this.district.kind);
  }

  /** Street rendering and traffic must share the same local origin. */
  private get roadCenterZ(): number {
    return this.coord.x === 0 && this.coord.z === 0 ? -11 : 0;
  }

  /** Each branch uses only audited semantic glTF templates, never primitives. */
  private buildDistrictLandmarks(kind: DistrictKind): void {
    const isOpeningCell = this.coord.x === 0 && this.coord.z === 0;
    const lights = (): void => {
      for (const [x, z] of [[-5.3, -5.5], [5.3, -7.5], [-5.3, -15.5], [5.3, -17.5]]) {
        this.spawn('streetLight', x, z, V3(3.8, 3.8, 3.8), 0, 'DistrictStreetLight');
      }
    };
    const homes = (): void => {
      // The 9:16 camera's visible street corridor is narrower than a whole
      // 64m cell. Keep homes beside the opening road rather than at the far
      // corners so the first playable frame reads as a neighbourhood.
      this.spawn('buildingB', -6.8, -10.5, V3(1.35, 1.35, 1.35), 90, 'ResidentialHouseWest');
      this.spawn('buildingC', 6.8, -10.5, V3(1.35, 1.35, 1.35), -90, 'ResidentialHouseEast');
      // Actual CC0 commercial-kit landmarks frame the opening corridor. They
      // add a readable service-city silhouette around the player without
      // obstructing the starter recyclable cluster at z=5.
      // Keep the CC0 commercial kit landmarks in the portrait play camera's
      // field, framing the arena instead of leaving a large vacant lawn.
      // They are decorative scene art, not collision or resource objects.
      this.spawn('commercialBuildingF', -3.9, -13.5, V3(1.25, 1.25, 1.25), 90, 'NeighbourhoodMarket');
      this.spawn('commercialBuildingG', 3.9, -13.5, V3(1.25, 1.25, 1.25), -90, 'NeighbourhoodClinic');
      // Keep the centre of the road clear in the portrait view. A third tall
      // storefront at x=0 previously projected straight through the player
      // marker, so the first playable frame lost the clean city-park focal
      // space used by the V2 reference.
      if (!isOpeningCell) this.spawn('commercialBuildingH', 0, -16.2, V3(1.2, 1.2, 1.2), 0, 'NeighbourhoodService');
      // Tall city silhouettes make the opening arena read as a real urban
      // block instead of an isolated lawn. They remain background art and
      // do not participate in resource collisions or bot navigation.
      this.spawn('commercialSkyscraperA', -7.4, -17.2, V3(1.1, 1.1, 1.1), 90, 'ArenaSkylineWest');
      this.spawn('commercialSkyscraperB', 7.4, -17.2, V3(1.1, 1.1, 1.1), -90, 'ArenaSkylineEast');

      // A real CC0 park assembly makes the arena's first screen read as a
      // public garden instead of a bare turf field. These are visual-only
      // glTF instances: the playable suction lane remains physically clear.
      this.spawn('parkFountain', 0, -11.0, V3(1.15, 1.15, 1.15), 0, 'OpeningParkFountain', 0.07);
      this.spawn('parkBench', -5.5, -9.3, V3(1.2, 1.2, 1.2), 72, 'OpeningParkBenchWest', 0.07);
      this.spawn('parkBench', 5.5, -9.3, V3(1.2, 1.2, 1.2), -72, 'OpeningParkBenchEast', 0.07);
      this.spawn('parkTrashcan', -5.8, -12.5, V3(1.1, 1.1, 1.1), 0, 'OpeningParkTrashcanWest', 0.07);
      this.spawn('parkTrashcan', 5.8, -12.5, V3(1.1, 1.1, 1.1), 0, 'OpeningParkTrashcanEast', 0.07);
      this.spawn('parkLantern', -5.8, -6.2, V3(1.25, 1.25, 1.25), 0, 'OpeningParkLanternWest', 0.07);
      this.spawn('parkLantern', 5.8, -6.2, V3(1.25, 1.25, 1.25), 0, 'OpeningParkLanternEast', 0.07);
      this.spawn('parkHedgeLong', -7.2, -9.2, V3(1.2, 1.2, 1.2), 90, 'OpeningParkHedgeWest', 0.07);
      this.spawn('parkHedgeLong', 7.2, -9.2, V3(1.2, 1.2, 1.2), 90, 'OpeningParkHedgeEast', 0.07);
      this.spawn('parkHedgeCorner', -6.8, -13.0, V3(1.2, 1.2, 1.2), 0, 'OpeningParkHedgeCornerWest', 0.07);
      this.spawn('parkHedgeCorner', 6.8, -13.0, V3(1.2, 1.2, 1.2), 180, 'OpeningParkHedgeCornerEast', 0.07);
      this.spawn('parkBush', -4.9, -13.8, V3(1.2, 1.2, 1.2), 0, 'OpeningParkBushWest', 0.07);
      this.spawn('parkBush', 4.9, -13.8, V3(1.2, 1.2, 1.2), 0, 'OpeningParkBushEast', 0.07);
      this.spawn('parkFlowerA', -3.4, -8.0, V3(1.35, 1.35, 1.35), 0, 'OpeningParkFlowerWest', 0.07);
      this.spawn('parkFlowerB', 3.4, -8.0, V3(1.35, 1.35, 1.35), 0, 'OpeningParkFlowerEast', 0.07);
      const openingGrassTiles: ReadonlyArray<readonly [number, number]> = [
        [-6, -4], [0, -4], [6, -4], [-6, -15], [0, -15], [6, -15],
      ];
      openingGrassTiles.forEach(([x, z], index) => {
        this.spawn('parkGrassTile', x, z, V3(1.6, 1.0, 1.6), 0, `OpeningParkGrassTile${index}`, 0.025);
      });
      this.spawn('parkCobblePath', -3.0, -11.0, V3(1.22, 1.0, 1.22), 0, 'OpeningParkCobbleWest', 0.075);
      this.spawn('parkCobblePath', 3.0, -11.0, V3(1.22, 1.0, 1.22), 0, 'OpeningParkCobbleEast', 0.075);

      // Bring the same real park vocabulary down to the hole's play zone.
      // The centre and all starter-object routes stay clear; each item is
      // outside the active suction lane and has no collision component.
      this.spawn('parkBench', -5.4, 1.8, V3(0.82, 0.82, 0.82), 82, 'OpeningPlayBenchWest', 0.07);
      this.spawn('parkBench', 5.4, 1.8, V3(0.82, 0.82, 0.82), -82, 'OpeningPlayBenchEast', 0.07);
      this.spawn('parkHedgeLong', -7.2, 0.5, V3(1.0, 1.0, 1.0), 90, 'OpeningPlayHedgeWest', 0.07);
      this.spawn('parkHedgeLong', 7.2, 0.5, V3(1.0, 1.0, 1.0), 90, 'OpeningPlayHedgeEast', 0.07);
      this.spawn('parkBush', -6.6, 1.4, V3(0.68, 0.68, 0.68), 0, 'OpeningPlayBushWest', 0.07);
      this.spawn('parkBush', 6.6, 1.4, V3(0.68, 0.68, 0.68), 0, 'OpeningPlayBushEast', 0.07);
      this.spawn('parkFlowerA', -3.4, 3.5, V3(1.05, 1.05, 1.05), 0, 'OpeningPlayFlowerWest', 0.07);
      this.spawn('parkFlowerB', 3.4, 3.5, V3(1.05, 1.05, 1.05), 0, 'OpeningPlayFlowerEast', 0.07);
      this.spawn('parkTree', -10.2, 2.2, V3(0.52, 0.52, 0.52), 0, 'OpeningPlayTreeWest', 0.07);
      this.spawn('parkTreeLarge', 10.2, 2.2, V3(0.52, 0.52, 0.52), 0, 'OpeningPlayTreeEast', 0.07);

      // Frame the first playable lawn with actual imported city props. The
      // earlier opening contained correct road/building assets only at the
      // far edge, leaving the portrait playfield as an empty green plane.
      // These are decorative WorldArtLibrary instances, never generated
      // primitives and never duplicate collectible collision objects.
      this.spawn('parkTree', -7.6, 4.6, V3(1.0, 1.0, 1.0), 0, 'OpeningGardenTreeWest', 0.07);
      this.spawn('parkTreeLarge', 7.4, 5.2, V3(0.9, 0.9, 0.9), 0, 'OpeningGardenTreeEast', 0.07);
      this.spawn('pathStones', -8.0, 8.8, V3(2.7, 1, 3.6), 90, 'OpeningGardenWalkwayWest');
      this.spawn('pathStones', 8.0, 8.8, V3(2.7, 1, 3.6), 90, 'OpeningGardenWalkwayEast');
      this.spawn('recyclingBox', -4.9, 5.0, V3(0.9, 0.9, 0.9), 18, 'OpeningRecyclingBox');
      this.spawn('tire', 4.9, 5.3, V3(1.15, 1.15, 1.15), 0, 'OpeningTire');
      this.spawn('streetLight', -7.2, -0.8, V3(3.1, 3.1, 3.1), 0, 'OpeningStreetLightWest');
      this.spawn('streetLight', 7.2, -0.8, V3(3.1, 3.1, 3.1), 0, 'OpeningStreetLightEast');

      // Treat the first cell as a compact playable city park, not merely a
      // grass test range. Every entry below is an instantiated, audited GLB
      // template held by WorldArtLibrary; none is a plane/box stand-in and
      // none participates in collectible collision or suction. The grouping
      // leaves the centre lane clear for drag control while framing it with
      // the park trees visible in the portrait gameplay reference.
      const openingTrees: ReadonlyArray<readonly [number, number, number, string]> = [
        [-8.6, 10.5, 0.9, 'OpeningParkTreeFarWest'],
        [8.6, 10.5, 0.9, 'OpeningParkTreeFarEast'],
        [-10.4, 4.6, 0.56, 'OpeningParkTreeWest'],
        [10.4, 4.6, 0.56, 'OpeningParkTreeEast'],
        [-8.6, -3.4, 0.75, 'OpeningParkTreeRoadWest'],
        [8.6, -3.4, 0.75, 'OpeningParkTreeRoadEast'],
      ];
      openingTrees.forEach(([x, z, size, name], index) => {
        this.spawn(index % 2 === 0 ? 'parkTreeLarge' : 'parkTree', x, z, V3(size, size, size), 0, name, 0.07);
      });

      // The portrait arena's lower third is the approach corridor behind the
      // local singularity.  It used to be almost uninterrupted grass even
      // though the north edge already had a complete street, making the
      // opening match read as a prototype lawn.  Frame that corridor with
      // the same audited commercial/park kit used by the city itself.  All
      // of these are visual landmarks outside the centre route: real pooled
      // recycling objects, bots, movement and suction retain full authority.
      if (this.coord.x === 0 && this.coord.z === 0) {
        this.spawn('commercialBuildingF', -11.5, 7.4, V3(0.86, 0.86, 0.86), 90, 'OpeningParkMarketSouthWest');
        this.spawn('commercialBuildingG', 11.5, 7.4, V3(0.86, 0.86, 0.86), -90, 'OpeningParkClinicSouthEast');
        this.spawn('parkFountain', -8.1, 7.8, V3(0.58, 0.58, 0.58), 0, 'OpeningParkFountainSouthWest', 0.07);
        this.spawn('parkBench', -6.5, 4.8, V3(0.60, 0.60, 0.60), 78, 'OpeningParkBenchSouthWest', 0.07);
        this.spawn('parkBench', 6.5, 4.8, V3(0.60, 0.60, 0.60), -78, 'OpeningParkBenchSouthEast', 0.07);
        this.spawn('parkTrashcan', -5.9, 5.7, V3(0.9, 0.9, 0.9), 0, 'OpeningParkTrashcanSouthWest', 0.07);
        this.spawn('parkTrashcan', 5.9, 5.7, V3(0.9, 0.9, 0.9), 0, 'OpeningParkTrashcanSouthEast', 0.07);
        this.spawn('parkFlowerA', -3.8, 6.6, V3(1.05, 1.05, 1.05), 0, 'OpeningParkFlowerSouthWest', 0.07);
        this.spawn('parkFlowerB', 3.8, 6.6, V3(1.05, 1.05, 1.05), 0, 'OpeningParkFlowerSouthEast', 0.07);

        // Populate the lower portrait third with the same imported city/park
        // kit. The earlier north-only skyline left that portion as a broad
        // blank lawn once the camera tracked the local singularity. These
        // side landmarks match the reference composition (shops and a garden
        // framing the arena) while leaving x=0/z=0 and the joystick sightline
        // visually clear for real touch control.
        this.spawn('commercialBuildingF', -7.6, 8.8, V3(0.66, 0.66, 0.66), 90, 'OpeningSouthMarket');
        this.spawn('commercialBuildingG', 7.6, 8.8, V3(0.66, 0.66, 0.66), -90, 'OpeningSouthClinic');
        // Keep a pair of readable storefront silhouettes in the foreground
        // band as well.  The 390×844 reference composition shows city blocks
        // both ahead of and behind the singularity; placing these imported
        // landmarks at z=3.8 makes that lower framing survive the steeper
        // tactical camera used by Arena without touching the centre suction
        // lane or any gameplay object.
        this.spawn('commercialBuildingA', -8.4, 3.8, V3(1.55, 1.55, 1.55), 90, 'OpeningForegroundStoreWest');
        this.spawn('commercialBuildingD', 8.4, 3.8, V3(1.55, 1.55, 1.55), -90, 'OpeningForegroundStoreEast');
        this.spawn('parkFountain', 0, 8.4, V3(0.48, 0.48, 0.48), 0, 'OpeningSouthFountain', 0.07);
        this.spawn('parkTree', -5.8, 5.8, V3(0.46, 0.46, 0.46), 0, 'OpeningSouthTreeWest', 0.07);
        this.spawn('parkTreeLarge', 5.8, 5.8, V3(0.46, 0.46, 0.46), 0, 'OpeningSouthTreeEast', 0.07);
        this.spawn('parkBench', -3.8, 7.2, V3(0.48, 0.48, 0.48), 78, 'OpeningSouthBenchWest', 0.07);
        this.spawn('parkBench', 3.8, 7.2, V3(0.48, 0.48, 0.48), -78, 'OpeningSouthBenchEast', 0.07);
      }

    };
    const trees = (): void => {
      if (isOpeningCell) {
        // Source trees are deliberately tall assets. Put the two opening
        // specimens at the garden edges, not around the local origin, so
        // they frame rather than occlude the black-hole play target.
        this.spawn('treeLarge', -11.5, 5.2, V3(1.18, 1.18, 1.18), 0, 'DistrictTreeLarge');
        this.spawn('treeSmall', 11.5, 5.2, V3(1.18, 1.18, 1.18), 0, 'DistrictTreeSmall');
        return;
      }
      this.spawn('treeLarge', -4.8, 0.8, V3(2.65, 2.65, 2.65), 0, 'DistrictTreeLarge');
      this.spawn('treeSmall', 4.8, 0.8, V3(2.8, 2.8, 2.8), 0, 'DistrictTreeSmall');
    };
    switch (kind) {
      case 'RESIDENTIAL':
        homes(); trees(); lights();
        this.spawn('pathStones', -7.3, -14.5, V3(3.2, 1, 4.6), 90, 'ResidentialWalkway');
        this.spawn('fence', 7.3, -15.5, V3(3.2, 1.5, 3.8), 90, 'ResidentialFence');
      this.spawn('sedan', 3.1, -8.5, V3(1.35, 1.35, 1.35), -90, 'ResidentialParkedSedan');
        break;
      case 'PARK':
        lights();
        for (const [x, z] of [[-9, -8], [9, -8], [-9, 8], [9, 8]]) this.spawn('parkTreeLarge', x, z, V3(1.0, 1.0, 1.0), 0, 'ParkTree', 0.07);
        this.spawn('parkFountain', 0, -7, V3(1.15, 1.15, 1.15), 0, 'ParkFountain', 0.07);
        for (const [x, z, yaw] of [[-6, -7, 70], [6, -7, -70], [-6, 5, 110], [6, 5, -110]] as const) {
          this.spawn('parkBench', x, z, V3(1.2, 1.2, 1.2), yaw, 'ParkBench', 0.07);
        }
        for (const [x, z] of [[-5, -12], [5, -12], [-5, 11], [5, 11]] as const) {
          this.spawn('parkBush', x, z, V3(1.25, 1.25, 1.25), 0, 'ParkBush', 0.07);
        }
        this.spawn('parkHedgeLong', -8.5, 0, V3(1.2, 1.2, 1.2), 90, 'ParkHedgeWest', 0.07);
        this.spawn('parkHedgeLong', 8.5, 0, V3(1.2, 1.2, 1.2), 90, 'ParkHedgeEast', 0.07);
        for (const [x, z] of [[-6, -1], [0, -1], [6, -1], [-6, -13], [0, -13], [6, -13]] as const) {
          this.spawn('parkGrassTile', x, z, V3(1.6, 1.0, 1.6), 0, 'ParkGrassTile', 0.025);
        }
        this.spawn('parkCobblePath', -3, -7, V3(1.2, 1.0, 1.2), 0, 'ParkCobbleWest', 0.075);
        this.spawn('parkCobblePath', 3, -7, V3(1.2, 1.0, 1.2), 0, 'ParkCobbleEast', 0.075);
        this.spawn('parkTree', 0, -13, V3(1.0, 1.0, 1.0), 0, 'ParkTreeCenter', 0.07);
        this.spawn('pathStones', -8, 0, V3(3.5, 1, 7.5), 90, 'ParkWalkwayWest');
        this.spawn('pathStones', 8, 0, V3(3.5, 1, 7.5), 90, 'ParkWalkwayEast');
        this.spawn('fence', 0, 15, V3(4.5, 1.5, 4.5), 0, 'ParkFence');
        break;
      case 'SUPERMARKET':
        lights();
        this.spawn('commercialBuildingA', -8.8, -12, V3(2.5, 2.5, 2.5), 90, 'SupermarketBuilding');
        this.spawn('commercialBuildingD', 8.8, -12, V3(2.5, 2.5, 2.5), -90, 'SupermarketAnnex');
        this.spawn('deliveryVan', -3.2, -7.6, V3(1.15, 1.15, 1.15), 90, 'SupermarketDeliveryVan');
        this.spawn('sedan', 3.2, -7.6, V3(1.2, 1.2, 1.2), -90, 'SupermarketCustomerSedan');
        this.spawn('recyclingBox', -8, 8, V3(1.1, 1.1, 1.1), 0, 'SupermarketBoxStack');
        break;
      case 'WAREHOUSE':
        this.spawn('shippingContainer', -9, -10, V3(1.3, 1.3, 1.3), 90, 'WarehouseContainerWest');
        this.spawn('shippingContainer', 9, -10, V3(1.3, 1.3, 1.3), -90, 'WarehouseContainerEast');
        this.spawn('shelf', -8, 8, V3(1.15, 1.15, 1.15), 0, 'WarehouseShelf');
        this.spawn('crate', 8, 8, V3(1.15, 1.15, 1.15), 0, 'WarehouseCrateStack');
        this.spawn('deliveryVan', -3.3, -4.5, V3(1.15, 1.15, 1.15), 90, 'WarehouseDeliveryVan');
        this.spawn('garbageTruck', 3.3, -4.5, V3(1.15, 1.15, 1.15), -90, 'WarehouseGarbageTruck');
        this.spawn('fence', 0, 15, V3(4.5, 1.5, 4.5), 0, 'WarehouseFence');
        break;
      case 'PARKING':
        lights();
        this.spawn('sedan', -8, -9, V3(1.2, 1.2, 1.2), 90, 'ParkingSedanWest');
        this.spawn('sedan', 8, -9, V3(1.2, 1.2, 1.2), -90, 'ParkingSedanEast');
        this.spawn('deliveryVan', -8, 8, V3(1.15, 1.15, 1.15), 90, 'ParkingDeliveryVan');
        this.spawn('garbageTruck', 8, 8, V3(1.15, 1.15, 1.15), -90, 'ParkingGarbageTruck');
        this.spawn('commercialBuildingD', 0, -17, V3(2.2, 2.2, 2.2), 0, 'ParkingServiceBuilding');
        break;
      case 'CONSTRUCTION':
        this.spawn('bulldozer', -7, -8, V3(1.2, 1.2, 1.2), 90, 'ConstructionBulldozer');
        this.spawn('shippingContainer', 8, -10, V3(1.3, 1.3, 1.3), -90, 'ConstructionContainer');
        this.spawn('crate', -8, 8, V3(1.2, 1.2, 1.2), 0, 'ConstructionCrateStack');
        this.spawn('garbageTruck', 7, 8, V3(1.15, 1.15, 1.15), -90, 'ConstructionHauler');
        this.spawn('fence', -3, 13, V3(3.8, 1.5, 3.8), 90, 'ConstructionFence');
        for (const [x, z] of [[3, 12], [6, 12], [3, -4], [6, -4]]) this.spawn('constructionCone', x, z, V3(4.5, 4.5, 4.5), 0, 'ConstructionCone');
        break;
      case 'DOWNTOWN':
        lights();
        this.spawn('commercialBuildingA', -9, -12, V3(2.65, 2.65, 2.65), 90, 'DowntownShopWest');
        this.spawn('commercialBuildingD', 9, -12, V3(2.65, 2.65, 2.65), -90, 'DowntownShopEast');
        this.spawn('commercialBuildingD', -9, 10, V3(2.45, 2.45, 2.45), 90, 'DowntownTowerWest');
        this.spawn('commercialBuildingA', 9, 10, V3(2.45, 2.45, 2.45), -90, 'DowntownTowerEast');
        this.spawn('sedan', -3.5, -5, V3(1.2, 1.2, 1.2), 90, 'DowntownSedan');
        this.spawn('deliveryVan', 3.5, -5, V3(1.15, 1.15, 1.15), -90, 'DowntownDeliveryVan');
        break;
    }
  }
}

@ccclass('InfiniteWorldManager')
export class InfiniteWorldManager extends Component {
  public static readonly CELL_SIZE = 64;
  public static readonly ACTIVE_RADIUS = 1;
  public static readonly ACTIVE_CELL_COUNT = 9;
  public static readonly MAX_ACTIVE_COLLECTIBLES = 240;
  public static readonly COLLECTIBLE_RESPAWN_DELAY_SECONDS = 4;
  public static readonly MAX_ACTIVE_VEHICLES = 24;
  public static readonly TRAFFIC_RESPAWN_DELAY_SECONDS = 4;
  public static readonly REBASE_THRESHOLD = 192;

  @property(Prefab)
  public goldenCityCellPrefab: Prefab | null = null;

  public currentCellSource: 'AUTHORED_GOLDEN_CITY' | 'PROCEDURAL_FALLBACK' = 'PROCEDURAL_FALLBACK';

  public currentTheme: IRegionThemeConfig = REGION_THEMES[0];
  public currentRegionIndex: number = 0;
  public readonly activeCells: Map<string, InfiniteWorldCell> = new Map();
  public readonly logicalOrigin: Vec3 = new Vec3();
  public readonly currentCell: Vec3 = new Vec3();
  public rebaseCount: number = 0;

  private objectPool: ObjectPool<CompressibleObject> | null = null;
  private objectRoot: Node | null = null;
  private artLibrary: WorldArtLibrary | null = null;
  private initialized: boolean = false;
  /** The only remote-derived art added by this manager, imported by Creator. */
  private constructionSitePrefab: Prefab | null = null;
  private constructionSiteLoadState: 'IDLE' | 'LOADING' | 'READY' | 'FAILED' = 'IDLE';
  private worldCellFactory: WorldCellFactory | null = null;
  private serializedGoldenCityCell: Node | null = null;
  private readonly streamer = new WorldStreamer({
    cellSize: InfiniteWorldManager.CELL_SIZE,
    activeRadius: InfiniteWorldManager.ACTIVE_RADIUS,
    rebaseThreshold: InfiniteWorldManager.REBASE_THRESHOLD,
  });

  public init(objectFactory: () => CompressibleObject): void {
    if (this.initialized) return;
    this.artLibrary = director.getScene()?.getComponentInChildren(WorldArtLibrary) || null;
    if (!this.artLibrary) throw new Error('[InfiniteWorldManager] Missing editor-saved WorldArtLibrary.');
    this.artLibrary.validateTemplates();
    this.disableSerializedGoldenCityCell();

    this.objectRoot = new Node('InfiniteWorldObjectPool');
    this.node.addChild(this.objectRoot);
    this.objectPool = new ObjectPool<CompressibleObject>(
      () => {
        const object = objectFactory();
        if (this.objectRoot && object.node.parent !== this.objectRoot) this.objectRoot.addChild(object.node);
        return object;
      },
      (object) => object.recycle(),
      48,
      288,
    );
    this.worldCellFactory = new WorldCellFactory({
      cellSize: InfiniteWorldManager.CELL_SIZE,
      parent: this.node,
    });
    this.initialized = true;
    this.updateCells(Vec3.ZERO);
    this.loadConstructionLandmark();
  }

  /**
   * GoldenCityCell.prefab is the one authored source for the Opening cell.
   * Earlier authoring left a live scene copy beside InfiniteWorldRoot, which
   * rendered its unresolved imported materials underneath the streamed prefab.
   * Keep that source data in the scene but disable the duplicate at runtime.
   */
  private disableSerializedGoldenCityCell(): void {
    if (this.serializedGoldenCityCell?.isValid) return;
    const scene = director.getScene();
    const root = scene?.getChildByName('GameRoot');
    const serialized = root?.getChildByName('GoldenCityCell') || null;
    if (serialized?.active) serialized.active = false;
    this.serializedGoldenCityCell = serialized;
  }

  /**
   * Begin an independent playable session without carrying absorbed objects,
   * arena mass fragments, traffic positions or origin rebases into the next
   * mode. This is deliberately a world lifecycle operation, not a test-only
   * respawn: both Endless and Arena call it from their visible Start action.
   */
  public resetSession(renderPlayerPosition: Readonly<Vec3> = Vec3.ZERO): void {
    if (!this.initialized || !this.objectPool) return;
    for (const cell of this.activeCells.values()) cell.recycle(this.objectPool);
    this.activeCells.clear();
    this.logicalOrigin.set(0, 0, 0);
    this.currentCell.set(0, 0, 0);
    this.rebaseCount = 0;
    this.streamer.logicalOrigin.set(0, 0, 0);
    this.streamer.currentCell.set(0, 0, 0);
    this.streamer.rebaseCount = 0;
    this.updateCells(renderPlayerPosition);
    this.installConstructionLandmarkInOpeningCell();
  }

  /**
   * A network arena renders only the recyclable nodes replicated by its
   * Colyseus room. The local endless/arena pool remains allocated so returning
   * to an offline session is immediate, but its gameplay entities cannot be
   * mistaken for server-authoritative pickups while this flag is false.
   */
  public setGameplayObjectsVisible(visible: boolean): void {
    if (this.objectRoot) this.objectRoot.active = visible;
  }

  /** Streams the 3×3 active grid for both X and Z; returns a rebase when needed. */
  public updateCells(renderPlayerPosition: Readonly<Vec3>): WorldRebase | null {
    if (!this.initialized || !this.objectPool || !this.artLibrary) return null;
    this.streamer.stream(
      renderPlayerPosition,
      new Set(this.activeCells.keys()),
      (coord) => this.createCell(coord),
      (key) => {
        const cell = this.activeCells.get(key);
        if (!cell) return;
        cell.recycle(this.objectPool!);
        this.activeCells.delete(key);
      },
    );
    this.logicalOrigin.set(this.streamer.logicalOrigin);
    this.currentCell.set(this.streamer.currentCell);
    const currentCell = this.activeCells.get(cellKey({ x: this.currentCell.x, z: this.currentCell.z }));
    this.currentCellSource = currentCell?.isAuthored
      ? 'AUTHORED_GOLDEN_CITY'
      : 'PROCEDURAL_FALLBACK';
    this.updateCurrentTheme({ x: this.currentCell.x, z: this.currentCell.z });
    return this.streamer.rebaseIfNeeded(renderPlayerPosition, (rebase) => {
      this.logicalOrigin.set(this.streamer.logicalOrigin);
      this.rebaseCount = this.streamer.rebaseCount;
      for (const cell of this.activeCells.values()) {
        cell.node.setPosition(
          cell.coord.x * InfiniteWorldManager.CELL_SIZE - this.logicalOrigin.x,
          0,
          cell.coord.z * InfiniteWorldManager.CELL_SIZE - this.logicalOrigin.z,
        );
        cell.applyWorldRebase(rebase.shift);
      }
    });
  }

  public updateObjects(
    dt: number,
    machinePos: Readonly<Vec3>,
    suctionRadius: number,
    machineMaxTier: ObjectTier,
    isMagnetStorm: boolean,
    suctionPullMultiplier: number,
    onAbsorb: (object: CompressibleObject) => void,
  ): void {
    const objectPool = this.objectPool;
    if (!objectPool) return;
    this.updateDynamicTraffic(dt);
    let activeCollectibleCount = this.getAllObjects()
      .filter((object) => isCollectibleObject(object) && object.getState() !== 'ABSORBED' && object.getState() !== 'RECYCLED').length;
    for (const cell of this.activeCells.values()) {
      for (const object of [...cell.objects]) {
        const state = object.getState();
        if (state !== 'ABSORBED' && state !== 'RECYCLED'
          && object.updateMotion(
            dt,
            machinePos,
            suctionRadius,
            machineMaxTier,
            isMagnetStorm,
            'endless-player',
            suctionPullMultiplier,
          )) {
          onAbsorb(object);
          if (isCollectibleObject(object)) {
            activeCollectibleCount = Math.max(0, activeCollectibleCount - 1);
            cell.removeAbsorbedCollectible(object, objectPool, InfiniteWorldManager.COLLECTIBLE_RESPAWN_DELAY_SECONDS);
          } else if (isVehicleObject(object)) {
            cell.removeAbsorbedVehicle(object, objectPool, InfiniteWorldManager.TRAFFIC_RESPAWN_DELAY_SECONDS);
          }
        }
      }
    }
    for (const cell of this.activeCells.values()) {
      cell.advanceRespawnClock(dt);
      activeCollectibleCount += cell.updateCollectibleRespawn(
        objectPool,
        this.logicalOrigin,
        activeCollectibleCount,
        InfiniteWorldManager.MAX_ACTIVE_COLLECTIBLES,
      );
    }
    let activeVehicleCount = Array.from(this.activeCells.values())
      .reduce((count, cell) => count + cell.dynamicVehicles.length, 0);
    for (const cell of this.activeCells.values()) {
      activeVehicleCount += cell.replenishTraffic(
        objectPool,
        InfiniteWorldManager.MAX_ACTIVE_VEHICLES,
        activeVehicleCount,
      );
    }
  }

  /** Arena owns resource selection, while streamed traffic remains shared. */
  public updateDynamicTraffic(dt: number): void {
    for (const cell of this.activeCells.values()) cell.updateDynamicTraffic(dt);
  }

  /**
   * Drop real, absorbable recyclable bundles after an arena defeat. They are
   * allocated from the same Creator-backed object pool and use the same
   * CompressibleObject FSM as every ordinary world pickup.
   */
  public spawnArenaMassFragments(position: Readonly<Vec3>, totalMass: number, sourceId: string): number {
    if (!this.objectPool) return 0;
    const cell = this.activeCells.get(cellKey({ x: this.currentCell.x, z: this.currentCell.z }));
    if (!cell) return 0;
    const count = Math.max(2, Math.min(6, Math.round(totalMass / 250)));
    const fragmentMass = Math.max(25, Math.round(totalMass / count));
    const base = OBJECT_TEMPLATES[0];
    const fragmentTemplate: IObjectTemplate = {
      ...base,
      type: 'arena_mass_fragment',
      name: 'Compressed Mass Fragment',
      tier: ObjectTier.T1,
      mass: fragmentMass,
      value: Math.max(1, Math.round(fragmentMass / 10)),
      radius: 0.34,
    };
    for (let index = 0; index < count; index++) {
      const angle = (Math.PI * 2 * index) / count;
      const object = this.objectPool.get();
      object.spawn(
        fragmentTemplate,
        position.x + Math.cos(angle) * (1.1 + (index % 2) * 0.35),
        position.z + Math.sin(angle) * (1.1 + (index % 2) * 0.35),
        0.35,
        `arena_fragment_${sourceId}_${this.rebaseCount}_${index}`,
      );
      cell.objects.push(object);
    }
    return count;
  }

  public getAllObjects(): CompressibleObject[] {
    const objects: CompressibleObject[] = [];
    for (const cell of this.activeCells.values()) {
      objects.push(...cell.objects.filter((object) => object.node?.isValid));
    }
    return objects;
  }

  public getVisibleObjectCount(): number {
    return this.getAllObjects().filter((object) => {
      const state = object.getState();
      return state !== 'ABSORBED' && state !== 'RECYCLED';
    }).length;
  }

  /**
   * Engine-side read model for a particular streamed cell. This describes no
   * screen space, no visual gate, and no QA policy: those concerns belong to
   * dev/qa/WorldCompositionProbe. The caller must keep this object inside the
   * engine process; browser QA receives only the Probe's serialized output.
   */
  public getCellRuntimeContent(coord: WorldCellCoord): WorldCellRuntimeContent | null {
    const cell = this.activeCells.get(cellKey(coord)) || null;
    return cell ? {
      coord: { x: cell.coord.x, z: cell.coord.z },
      node: cell.node,
      objects: cell.objects,
      dynamicVehicles: cell.dynamicVehicles,
    } : null;
  }

  public getRegionIndex(): number {
    return this.currentRegionIndex;
  }

  /** The visible district label is separate from the progression theme. */
  public getCurrentDistrictName(): string {
    return this.activeCells.get(cellKey({ x: this.currentCell.x, z: this.currentCell.z }))?.district.label
      || this.currentTheme.name;
  }

  /** The player-facing progression region, for example “废弃仓库区”. */
  public getCurrentRegionName(): string {
    return this.currentTheme.name;
  }

  public getSnapshot(): Record<string, unknown> {
    const currentCell = this.activeCells.get(cellKey({ x: this.currentCell.x, z: this.currentCell.z }));
    return {
      mode: '2D_GRID',
      cellSize: InfiniteWorldManager.CELL_SIZE,
      activeCellCount: this.activeCells.size,
      expectedActiveCellCount: InfiniteWorldManager.ACTIVE_CELL_COUNT,
      currentCell: { x: this.currentCell.x, z: this.currentCell.z },
      currentRegion: this.currentTheme.id,
      currentRegionName: this.getCurrentRegionName(),
      currentDistrict: this.getCurrentDistrictName(),
      currentDistrictKind: currentCell?.district.kind || null,
      currentCellSource: this.currentCellSource,
      logicalOrigin: { x: this.logicalOrigin.x, z: this.logicalOrigin.z },
      rebaseCount: this.rebaseCount,
      // Do not spread Map.values(): Cocos' ES5 build transform emits a single
      // iterator element for that form. Array.from preserves all real cells in
      // the Web Mobile runtime and keeps QA strictly read-only.
      activeCells: Array.from(this.activeCells.values(), (cell) => ({
        x: cell.coord.x,
        z: cell.coord.z,
        district: cell.district.kind,
      })),
      dynamicVehicles: Array.from(this.activeCells.values(), (cell) => cell.dynamicVehicles.map((vehicle) => vehicle.getSnapshot())).flat(),
      constructionLandmark: {
        loadState: this.constructionSiteLoadState,
        visible: this.activeCells.get(cellKey({ x: 0, z: 0 }))?.hasConstructionLandmark() || false,
      },
     authoredDynamicCounts: (() => {
       const openingCell = this.activeCells.get(cellKey({ x: 0, z: 0 }));
       const clusterSet = new Set<string>();
       openingCell?.objects.forEach((obj) => {
         const match = /^cluster_(.+)_\d+$/.exec(obj.runtimeId);
         if (match) clusterSet.add(match[1]);
       });
       return {
         collectibles: openingCell?.objects.filter((object) => !object.runtimeId.startsWith('traffic_')).length || 0,
         clusters: clusterSet.size,
         vehicles: openingCell?.dynamicVehicles.length || 0,
       };
     })(),
      authoredClusterAnchors: (() => {
        const openingCell = this.activeCells.get(cellKey({ x: 0, z: 0 }));
        if (!openingCell || !openingCell.isAuthored) return [];
        const findNodeByName = (root: Node, targetName: string): Node | null => {
          if (root.name === targetName) return root;
          for (const child of root.children) {
            const found = findNodeByName(child, targetName);
            if (found) return found;
          }
          return null;
        };
        const anchorsRoot = findNodeByName(openingCell.node, 'ClusterAnchors');
        if (!anchorsRoot) return [];
        const spawnPointsRoot = findNodeByName(openingCell.node, 'CollectibleSpawnPoints');
        const clusterCenters = (spawnPointsRoot?.children || [])
          .map((cluster) => {
            const points = cluster.children.filter((child) => child.name.startsWith('SpawnPoint_'));
            if (points.length === 0) return null;
            const center = points.reduce((sum, point) => {
              const position = point.worldPosition;
              sum.x += position.x;
              sum.y += position.y;
              sum.z += position.z;
              return sum;
            }, new Vec3());
            center.multiplyScalar(1 / points.length);
            return { name: cluster.name, center };
          })
          .filter((cluster): cluster is { name: string; center: Vec3 } => Boolean(cluster));
        return anchorsRoot.children.map((anchor) => {
          const pos = anchor.worldPosition;
          const semanticClusterName = anchor.name.includes('RecyclingSquare')
            ? 'Cluster_CitySquare'
            : anchor.name.includes('CentralPark')
              ? 'Cluster_Park'
              : null;
          const semanticCluster = semanticClusterName
            ? clusterCenters.find((cluster) => cluster.name === semanticClusterName) || null
            : null;
          const associated = semanticCluster || clusterCenters.reduce<{ name: string; center: Vec3 } | null>((nearest, cluster) => {
            if (!nearest) return cluster;
            const nearestDistance = Vec3.squaredDistance(pos, nearest.center);
            const candidateDistance = Vec3.squaredDistance(pos, cluster.center);
            return candidateDistance < nearestDistance ? cluster : nearest;
          }, null);
          const associatedCluster = associated?.name || null;
          const objectCount = associatedCluster
            ? openingCell.objects.filter((obj) => obj.runtimeId.startsWith(`cluster_${associatedCluster}_`)).length
            : 0;
          return {
            name: anchor.name,
            associatedCluster,
            worldPosition: { x: pos.x, y: pos.y, z: pos.z },
            objectCount,
          };
        });
      })(),
    };
  }

  private createCell(coord: WorldCellCoord): void {
    if (!this.artLibrary || !this.objectPool) return;
    const theme = this.themeFor(coord);
    const district = getDistrictTemplateForRegion(theme.id, coord.x, coord.z);

    let cellNode: Node | null = null;
    let isAuthored = false;

    if (coord.x === 0 && coord.z === 0) {
      if (this.goldenCityCellPrefab && this.worldCellFactory) {
        cellNode = this.worldCellFactory.instantiateAuthoredCell(coord, district.kind, this.goldenCityCellPrefab);
      }
      if (cellNode) {
        isAuthored = true;
        this.currentCellSource = 'AUTHORED_GOLDEN_CITY';
      } else {
        this.currentCellSource = 'PROCEDURAL_FALLBACK';
      }
    }

    if (!cellNode) {
      const logicalCenterX = coord.x * InfiniteWorldManager.CELL_SIZE;
    const logicalCenterZ = coord.z * InfiniteWorldManager.CELL_SIZE;
    cellNode = new Node(`WorldCell_${coord.x}_${coord.z}`);
    this.node.addChild(cellNode);
    cellNode.setPosition(
      logicalCenterX - this.logicalOrigin.x,
      0,
      logicalCenterZ - this.logicalOrigin.z,
    );
    }

    const cell = new InfiniteWorldCell(coord, cellNode, theme, district, this.artLibrary, InfiniteWorldManager.CELL_SIZE, isAuthored);
    // Authored Opening Cells own their environment and spawn-point authoring.
    // Do not append the legacy procedural Opening objects/traffic on top of them.
    // Cells without an authored prefab retain the strangler fallback path.
    if (!isAuthored) {
      const stableIndex = positiveMod(coord.x * 73856093 ^ coord.z * 19349663, 2147483647);
      cell.populate(
        CellItemGenerator.generateCellItems(theme, coord.x, coord.z, stableIndex, InfiniteWorldManager.CELL_SIZE, district),
        this.objectPool,
        this.logicalOrigin,
      );
    } else {
      cell.populateAuthoredContent(this.objectPool, this.logicalOrigin);
      cell.populateAuthoredTraffic(this.objectPool, this.logicalOrigin);
    }
    this.activeCells.set(cellKey(coord), cell);
    if (coord.x === 0 && coord.z === 0) this.installConstructionLandmarkInOpeningCell();
  }

  /**
   * `majadroid-construction-site.fbx` is imported by Creator into the
   * resources bundle. Loading its generated Prefab keeps the model's mesh and
   * material declarations entirely engine-owned; no prefab UUID or model
   * serialization is authored by code.
   */
  private loadConstructionLandmark(): void {
    if (this.constructionSiteLoadState !== 'IDLE') return;
    this.constructionSiteLoadState = 'LOADING';
    // Creator exposes the FBX's generated prefab as a subasset. The resource
    // key is read from the Creator-produced resources bundle, rather than
    // inferred from the source FBX filename.
    resources.load('art/construction/majadroid-construction-site/majadroid-construction-site', Prefab, (error, prefab) => {
      if (error || !prefab) {
        this.constructionSiteLoadState = 'FAILED';
        console.warn('[InfiniteWorldManager] CC0 construction landmark could not load.', error || 'missing Prefab');
        return;
      }
      this.constructionSitePrefab = prefab;
      this.constructionSiteLoadState = 'READY';
      this.installConstructionLandmarkInOpeningCell();
    });
  }

  private installConstructionLandmarkInOpeningCell(): void {
    if (!this.constructionSitePrefab) return;
    this.activeCells.get(cellKey({ x: 0, z: 0 }))?.addConstructionLandmark(this.constructionSitePrefab);
  }

  private updateCurrentTheme(coord: WorldCellCoord): void {
    const theme = this.activeCells.get(cellKey(coord))?.theme || this.themeFor(coord);
    if (this.currentTheme.id === theme.id) return;
    this.currentTheme = theme;
    this.currentRegionIndex = REGION_THEMES.findIndex((candidate) => candidate.id === theme.id);
    eventBus.emit('UI_REGION_CHANGED', { region: theme.name, regionId: theme.id });
  }

  private themeFor(coord: WorldCellCoord): IRegionThemeConfig {
    const ring = Math.max(Math.abs(coord.x), Math.abs(coord.z));
    return REGION_THEMES[Math.min(REGION_THEMES.length - 1, Math.floor(ring / 3))] || REGION_THEMES[0];
  }
}
