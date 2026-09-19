/**
 * Development-only world composition measurement.
 *
 * This module observes genuine Cocos render bounds and serializes plain JSON
 * for acceptance tooling. It is deliberately outside the production world
 * streamer: it neither creates gameplay objects nor changes world state.
 */
import { Camera, Color, MeshRenderer, Node, Vec3, view } from 'cc';
import type { CompositionCompetitor } from '../../gameplay/ArenaMatchManager';
import { CompressibleObject } from '../../gameplay/CompressibleObject';
import { InfiniteWorldManager, WorldCellRuntimeContent } from '../../world/InfiniteWorldManager';

type GoldenCityCategory = 'BUILDING' | 'TREE' | 'ROAD' | 'POI' | 'VEHICLE' | 'COMPETITOR' | 'COLLECTIBLE' | 'RESOURCE_CLUSTER' | 'GROUND';

interface GoldenCityWorldBounds {
  readonly min: Readonly<{ x: number; y: number; z: number }>;
  readonly max: Readonly<{ x: number; y: number; z: number }>;
}

interface GoldenCityScreenBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

interface GoldenCityLiveBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

interface GoldenCityProjection {
  readonly screenBounds: GoldenCityScreenBounds;
  readonly visible: boolean;
  readonly clipped: boolean;
  readonly behindCamera: boolean;
}

interface GoldenCityEntry {
  readonly name: string;
  readonly category: GoldenCityCategory;
  readonly classificationRule: string;
  readonly worldBounds: GoldenCityWorldBounds | null;
  readonly screenBounds: GoldenCityScreenBounds | null;
  readonly visible: boolean;
  readonly clipped: boolean;
  readonly behindCamera: boolean;
  readonly logicalUnits: number;
  readonly countReason: string;
}

export interface GoldenCityCompositionDiagnostics {
  readonly status: 'MEASURED' | 'UNAVAILABLE';
  readonly targetCell: Readonly<{ key: string; nodeName: string }>;
  readonly viewport: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly camera: Readonly<{
    preset: 'PortraitGameplayCameraPreset';
    position: Readonly<{ x: number; y: number; z: number }>;
    forward: Readonly<{ x: number; y: number; z: number }>;
    fov: number;
    fovAxis: number;
  }>;
  readonly entries: readonly GoldenCityEntry[];
  readonly counts: Readonly<Record<GoldenCityCategory, number>>;
  readonly player: Readonly<{
    worldBounds: GoldenCityWorldBounds | null;
    screenBounds: GoldenCityScreenBounds | null;
    visible: boolean;
    widthRatio: number | null;
    screenYRatio: number | null;
  }>;
  readonly emptyGround: Readonly<{
    method: 'screen-space grid estimate';
    hudExclusion: Readonly<{ topRatio: number; bottomRatio: number }>;
    grid: Readonly<{ columns: number; rows: number }>;
    totalSamples: number;
    groundSamples: number;
    occupiedSamples: number;
    emptyGroundSamples: number;
    coverageByCategory: Readonly<Partial<Record<GoldenCityCategory, number>>>;
    largeEmptyGroundRatio: number | null;
  }>;
}

/**
 * The only code allowed to turn a live WorldCellRuntimeContent into visual
 * acceptance data. All methods are pure observers; no Node is returned to
 * browser-facing callers.
 */
export class WorldCompositionProbe {
  public static getGoldenCityCompositionDiagnostics(
    world: InfiniteWorldManager | null,
    camera: Camera | null,
    playerNode: Node | null,
    competitors: readonly CompositionCompetitor[],
  ): GoldenCityCompositionDiagnostics | null {
    if (!world) return null;
    const viewport = view.getViewportRect();
    // Measure the cell the player is actually standing in, not a hardcoded
    // authored coordinate. The golden-city gate still runs at the opening
    // authored cell (currentCell 0:0), so its numbers are unchanged; this also
    // lets the probe report composition for any streamed cell (e.g. 0:-1).
    const targetCellCoords = {
      x: Math.round(world.currentCell.x),
      z: Math.round(world.currentCell.z),
    };
    const targetCell = world.getCellRuntimeContent(targetCellCoords);
    const emptyCounts = this.emptyCounts();
    const unavailable = (): GoldenCityCompositionDiagnostics => ({
      status: 'UNAVAILABLE',
      targetCell: {
        key: `${targetCellCoords.x}:${targetCellCoords.z}`,
        nodeName: targetCell?.node.name || `WorldCell_${targetCellCoords.x}_${targetCellCoords.z}_UNAVAILABLE`,
      },
      viewport: { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height },
      camera: this.serializeCamera(camera),
      entries: [],
      counts: emptyCounts,
      player: {
        worldBounds: null,
        screenBounds: null,
        visible: false,
        widthRatio: null,
        screenYRatio: null,
      },
      emptyGround: this.emptyGround(),
    });

    if (!targetCell || !camera || !camera.node?.isValid || viewport.width <= 0 || viewport.height <= 0) {
      return unavailable();
    }

    const entries: GoldenCityEntry[] = [];
    this.collectEnvironmentEntries(targetCell, camera, viewport, entries);
    this.collectVehicleEntries(targetCell, camera, viewport, entries);
    const collectibles = this.collectCollectibleEntries(targetCell, camera, viewport, entries);
    this.collectClusterEntries(collectibles, camera, viewport, entries);
    this.collectCompetitorEntries(competitors, camera, viewport, entries);

    const counts = this.emptyCounts();
    for (const entry of entries) {
      if (entry.visible) counts[entry.category] += entry.logicalUnits;
    }

    const playerBounds = playerNode?.isValid && playerNode.activeInHierarchy
      ? this.collectMergedWorldBounds([playerNode])
      : null;
    const playerProjection = playerBounds ? this.projectBounds(camera, viewport, playerBounds) : null;
    const player = {
      worldBounds: this.serializeWorldBounds(playerBounds),
      screenBounds: playerProjection?.screenBounds || null,
      visible: playerProjection?.visible || false,
      widthRatio: playerProjection?.screenBounds ? playerProjection.screenBounds.width / viewport.width : null,
      screenYRatio: playerProjection?.screenBounds
        ? ((playerProjection.screenBounds.top + playerProjection.screenBounds.bottom) * 0.5 - viewport.y) / viewport.height
        : null,
    };

    return {
      status: 'MEASURED',
      targetCell: { key: '0:0', nodeName: targetCell.node.name },
      viewport: { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height },
      camera: this.serializeCamera(camera),
      entries,
      counts,
      player,
      emptyGround: this.estimateEmptyGround(entries, viewport),
    };
  }

  /** Mirrors the former current-cell visual diagnostics without keeping it in World. */
  public static getCurrentCellVisualDiagnostics(world: InfiniteWorldManager | null): ReadonlyArray<Record<string, unknown>> {
    if (!world) return [];
    const cell = world.getCellRuntimeContent({
      x: Math.round(world.currentCell.x),
      z: Math.round(world.currentCell.z),
    });
    if (!cell) return [];

    return cell.node.children.map((child) => {
      const renderers: Array<Record<string, unknown>> = [];
      const visit = (node: Node): void => {
        const renderer = node.getComponent(MeshRenderer);
        if (renderer) {
          const primitiveCount = renderer.mesh?.struct.primitives.length || 0;
          const slotCount = Math.max(1, renderer.sharedMaterials.length, primitiveCount);
          const bounds = renderer.model?.worldBounds || null;
          const materials = Array.from({ length: slotCount }, (_, index) => {
            const material = renderer.getRenderMaterial(index);
            const rawColor = material?.getProperty('mainColor');
            const color = rawColor instanceof Color
              ? { r: rawColor.r, g: rawColor.g, b: rawColor.b, a: rawColor.a }
              : null;
            return {
              effect: material?.effectName || null,
              valid: material?.validate() || false,
              color,
            };
          });
          renderers.push({
            name: node.name,
            primitiveCount,
            materialCount: materials.length,
            bounds: bounds ? {
              center: { x: bounds.center.x, y: bounds.center.y, z: bounds.center.z },
              halfExtents: { x: bounds.halfExtents.x, y: bounds.halfExtents.y, z: bounds.halfExtents.z },
            } : null,
            materials,
          });
        }
        node.children.forEach(visit);
      };
      visit(child);
      return {
        name: child.name,
        active: child.activeInHierarchy,
        meshRendererCount: renderers.length,
        worldPosition: { x: child.worldPosition.x, y: child.worldPosition.y, z: child.worldPosition.z },
        renderers,
      };
    });
  }

  private static collectEnvironmentEntries(
    cell: WorldCellRuntimeContent,
    camera: Camera,
    viewport: Readonly<{ x: number; y: number; width: number; height: number }>,
    entries: GoldenCityEntry[],
  ): void {
    for (const root of cell.node.children) {
      this.collectEnvironmentNode(root, root.name, camera, viewport, entries);
    }
  }

  private static collectEnvironmentNode(
    node: Node,
    path: string,
    camera: Camera,
    viewport: Readonly<{ x: number; y: number; width: number; height: number }>,
    entries: GoldenCityEntry[],
  ): void {
    const classification = this.classifyEnvironmentNode(node.name);
    if (classification) {
      entries.push(this.createEntry(
        node.name,
        classification.category,
        `${classification.rule}; path=${path}`,
        [node],
        camera,
        viewport,
        classification.logicalUnits,
        classification.reason,
      ));
      return;
    }
    for (const child of node.children) {
      this.collectEnvironmentNode(child, `${path}/${child.name}`, camera, viewport, entries);
    }
  }

  private static collectVehicleEntries(
    cell: WorldCellRuntimeContent,
    camera: Camera,
    viewport: Readonly<{ x: number; y: number; width: number; height: number }>,
    entries: GoldenCityEntry[],
  ): void {
    for (const vehicle of cell.dynamicVehicles) {
      entries.push(this.createEntry(
        vehicle.id,
        'VEHICLE',
        'target-cell DynamicVehicle.getCompositionNode()',
        [vehicle.getCompositionNode()],
        camera,
        viewport,
        1,
        'One active route-driven traffic vehicle in WorldCell_0_0.',
      ));
    }
  }

  private static collectCollectibleEntries(
    cell: WorldCellRuntimeContent,
    camera: Camera,
    viewport: Readonly<{ x: number; y: number; width: number; height: number }>,
    entries: GoldenCityEntry[],
  ): CompressibleObject[] {
    const collectibleStates = new Set(['IDLE', 'ATTRACTED', 'SUCKING']);
    const validCollectibles = cell.objects.filter((object) => collectibleStates.has(object.getState())
      && !object.runtimeId.startsWith('traffic_')
      && object.node?.isValid
      && object.node.activeInHierarchy);
    for (const object of validCollectibles) {
      entries.push(this.createEntry(
        object.runtimeId,
        'COLLECTIBLE',
        'WorldCell_0_0 CompressibleObject in IDLE, ATTRACTED, or SUCKING state (traffic excluded)',
        [object.node],
        camera,
        viewport,
        1,
        `Live ${object.template.name} (${object.getState()}) from the target cell object pool.`,
      ));
    }
    return validCollectibles;
  }

  private static collectClusterEntries(
    collectibles: readonly CompressibleObject[],
    camera: Camera,
    viewport: Readonly<{ x: number; y: number; width: number; height: number }>,
    entries: GoldenCityEntry[],
  ): void {
    const clusters = new Map<string, CompressibleObject[]>();
    for (const object of collectibles) {
      const clusterId = this.getClusterId(object.runtimeId);
      if (!clusterId) continue;
      const group = clusters.get(clusterId) || [];
      group.push(object);
      clusters.set(clusterId, group);
    }
    for (const [clusterId, group] of clusters) {
      entries.push(this.createEntry(
        clusterId,
        'RESOURCE_CLUSTER',
        'Grouped actual cluster_* or starter_recycling_cluster_* collectible ids',
        group.map((object) => object.node),
        camera,
        viewport,
        1,
        `${group.length} live recyclable object(s) sharing the authoritative cluster id ${clusterId}.`,
      ));
    }
  }

  private static collectCompetitorEntries(
    competitors: readonly CompositionCompetitor[],
    camera: Camera,
    viewport: Readonly<{ x: number; y: number; width: number; height: number }>,
    entries: GoldenCityEntry[],
  ): void {
    for (const competitor of competitors) {
      if (competitor.isLocal || !competitor.isBot || !competitor.alive || !competitor.node?.isValid
        || !competitor.node.activeInHierarchy) continue;
      entries.push(this.createEntry(
        competitor.id,
        'COMPETITOR',
        'ArenaMatchManager.getCompositionCompetitors(): alive non-local bot',
        [competitor.node],
        camera,
        viewport,
        1,
        'One alive AI competitor using the real ArenaMatchManager entity node.',
      ));
    }
  }

  private static emptyCounts(): Record<GoldenCityCategory, number> {
    return {
      BUILDING: 0,
      TREE: 0,
      ROAD: 0,
      POI: 0,
      VEHICLE: 0,
      COMPETITOR: 0,
      COLLECTIBLE: 0,
      RESOURCE_CLUSTER: 0,
      GROUND: 0,
    };
  }

  private static emptyGround(): GoldenCityCompositionDiagnostics['emptyGround'] {
    return {
      method: 'screen-space grid estimate',
      hudExclusion: { topRatio: 0.16, bottomRatio: 0.18 },
      grid: { columns: 40, rows: 64 },
      totalSamples: 0,
      groundSamples: 0,
      occupiedSamples: 0,
      emptyGroundSamples: 0,
      coverageByCategory: {},
      largeEmptyGroundRatio: null,
    };
  }

  private static serializeCamera(camera: Camera | null): GoldenCityCompositionDiagnostics['camera'] {
    const position = camera?.node?.worldPosition || Vec3.ZERO;
    const forward = camera?.node?.forward || Vec3.FORWARD;
    return {
      preset: 'PortraitGameplayCameraPreset',
      position: { x: position.x, y: position.y, z: position.z },
      forward: { x: forward.x, y: forward.y, z: forward.z },
      fov: camera?.fov || 0,
      fovAxis: camera?.fovAxis || 0,
    };
  }

  private static classifyEnvironmentNode(name: string): Readonly<{
    category: GoldenCityCategory;
    rule: string;
    logicalUnits: number;
    reason: string;
  }> | null {
    if (name === 'Ground' || name === 'Roads' || name === 'Buildings' || name === 'Park' || name === 'Props'
      || name === 'TrafficRoutes' || name === 'CollectibleSpawnPoints' || name === 'CompetitorSpawnPoints'
      || name === 'ClusterAnchors' || name.startsWith('VehicleAnchor_')) return null;
    if (name === 'DistrictGround' || name === 'GroundTile' || name === 'tile-low') {
      return {
        category: 'GROUND',
        rule: 'Opening-cell actual terrain tile (DistrictGround / GroundTile / tile-low)',
        logicalUnits: 1,
        reason: 'One actual streamed terrain tile, used only for the transparent empty-ground estimate.',
      };
    }
    if (name === 'FourWayRoad') {
      return {
        category: 'ROAD',
        rule: 'Opening-cell FourWayRoad; a visible junction has four road arms',
        logicalUnits: 4,
        reason: 'The single imported crossroad root is a four-arm junction.',
      };
    }
    if (name === 'DistrictRoad' || /^Road(?:North|South|East|West)$/.test(name) || name === 'MainCrossroad') {
      return {
        category: 'ROAD',
        rule: 'Opening-cell imported road root',
        logicalUnits: 1,
        reason: 'One authored road segment root.',
      };
    }
    if (/ResidentialHouse|Neighbourhood|ArenaSkyline|Market|Clinic|Store|Shop|Commercial|Building|Tower|Skyline/.test(name)) {
      return {
        category: 'BUILDING',
        rule: 'Opening-cell named building, shop, clinic, house, or skyline root',
        logicalUnits: 1,
        reason: 'One semantically named imported building landmark.',
      };
    }
    if (name.includes('Tree')) {
      return {
        category: 'TREE',
        rule: 'Opening-cell name contains Tree; grass and ground cover are excluded',
        logicalUnits: 1,
        reason: 'One imported tree root.',
      };
    }
    if (/Sedan|Van|Truck|Bulldozer|Vehicle|Car/.test(name)) {
      return {
        category: 'VEHICLE',
        rule: 'Opening-cell named static vehicle root',
        logicalUnits: 1,
        reason: 'One semantically named imported parked vehicle.',
      };
    }
    if (/Fountain|Bench|Trashcan|Bin|StreetLight|Lantern|Flower|Path|Walkway|Hedge|Bush|Fence|GrassTile|Cobble|RecyclingBox|Tire/.test(name)) {
      return {
        category: 'POI',
        rule: 'Opening-cell named park, street furnishing, planting, path, or readable prop root',
        logicalUnits: 1,
        reason: 'One imported point-of-interest or environmental furnishing.',
      };
    }
    return null;
  }

  private static getClusterId(runtimeId: string): string | null {
    if (runtimeId.startsWith('starter_recycling_cluster_')) return 'starter_recycling_cluster';
    const match = /^cluster_(.+)_\d+$/.exec(runtimeId);
    return match ? `cluster_${match[1]}` : null;
  }

  private static createEntry(
    name: string,
    category: GoldenCityCategory,
    classificationRule: string,
    roots: readonly Node[],
    camera: Camera,
    viewport: Readonly<{ x: number; y: number; width: number; height: number }>,
    logicalUnits: number,
    countReason: string,
  ): GoldenCityEntry {
    const bounds = this.collectMergedWorldBounds(roots);
    const projection = bounds ? this.projectBounds(camera, viewport, bounds) : null;
    return {
      name,
      category,
      classificationRule,
      worldBounds: this.serializeWorldBounds(bounds),
      screenBounds: projection?.screenBounds || null,
      visible: projection?.visible || false,
      clipped: projection?.clipped || false,
      behindCamera: projection?.behindCamera || false,
      logicalUnits,
      countReason,
    };
  }

  private static collectMergedWorldBounds(roots: readonly Node[]): GoldenCityLiveBounds | null {
    let min: Vec3 | null = null;
    let max: Vec3 | null = null;
    const append = (candidateMin: Readonly<Vec3>, candidateMax: Readonly<Vec3>): void => {
      if (!min || !max) {
        min = candidateMin.clone();
        max = candidateMax.clone();
        return;
      }
      min.set(Math.min(min.x, candidateMin.x), Math.min(min.y, candidateMin.y), Math.min(min.z, candidateMin.z));
      max.set(Math.max(max.x, candidateMax.x), Math.max(max.y, candidateMax.y), Math.max(max.z, candidateMax.z));
    };
    const visit = (node: Node): void => {
      if (!node.activeInHierarchy) return;
      const bounds = node.getComponent(MeshRenderer)?.model?.worldBounds || null;
      if (bounds) {
        append(
          new Vec3(bounds.center.x - bounds.halfExtents.x, bounds.center.y - bounds.halfExtents.y, bounds.center.z - bounds.halfExtents.z),
          new Vec3(bounds.center.x + bounds.halfExtents.x, bounds.center.y + bounds.halfExtents.y, bounds.center.z + bounds.halfExtents.z),
        );
      }
      node.children.forEach(visit);
    };
    roots.forEach(visit);
    return min && max ? { min, max } : null;
  }

  private static serializeWorldBounds(bounds: GoldenCityLiveBounds | null): GoldenCityWorldBounds | null {
    return bounds ? {
      min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
      max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
    } : null;
  }

  private static projectBounds(
    camera: Camera,
    viewport: Readonly<{ x: number; y: number; width: number; height: number }>,
    bounds: GoldenCityLiveBounds,
  ): GoldenCityProjection {
    const center = new Vec3(
      (bounds.min.x + bounds.max.x) * 0.5,
      (bounds.min.y + bounds.max.y) * 0.5,
      (bounds.min.z + bounds.max.z) * 0.5,
    );
    const behindCamera = camera.node.forward.dot(Vec3.subtract(new Vec3(), center, camera.node.worldPosition)) <= 0;
    const corners: Vec3[] = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) corners.push(new Vec3(x, y, z));
      }
    }
    corners.push(center);
    const projected = corners.map((point) => camera.worldToScreen(point, new Vec3()));
    const left = Math.min(...projected.map((point) => point.x));
    const right = Math.max(...projected.map((point) => point.x));
    const rawBottom = Math.min(...projected.map((point) => point.y));
    const rawTop = Math.max(...projected.map((point) => point.y));
    const top = viewport.y + viewport.height - rawTop;
    const bottom = viewport.y + viewport.height - rawBottom;
    const screenBounds = { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    const intersects = right >= viewport.x && left <= viewport.x + viewport.width
      && bottom >= viewport.y && top <= viewport.y + viewport.height;
    const visible = !behindCamera && intersects;
    const clipped = visible && (left < viewport.x || right > viewport.x + viewport.width
      || top < viewport.y || bottom > viewport.y + viewport.height);
    return { screenBounds, visible, clipped, behindCamera };
  }

  private static estimateEmptyGround(
    entries: readonly GoldenCityEntry[],
    viewport: Readonly<{ x: number; y: number; width: number; height: number }>,
  ): GoldenCityCompositionDiagnostics['emptyGround'] {
    const hudExclusion = { topRatio: 0.16, bottomRatio: 0.18 };
    const grid = { columns: 40, rows: 64 };
    const ground = entries.filter((entry) => entry.category === 'GROUND' && entry.visible && entry.screenBounds);
    const occupants = entries.filter((entry) => entry.category !== 'GROUND'
      && entry.category !== 'RESOURCE_CLUSTER'
      && entry.visible
      && entry.screenBounds);
    const coverageByCategory: Partial<Record<GoldenCityCategory, number>> = {};
    let totalSamples = 0;
    let groundSamples = 0;
    let occupiedSamples = 0;
    let emptyGroundSamples = 0;
    const contentTop = viewport.y + viewport.height * hudExclusion.topRatio;
    const contentBottom = viewport.y + viewport.height * (1 - hudExclusion.bottomRatio);
    const contains = (bounds: GoldenCityScreenBounds, x: number, y: number): boolean => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    for (let row = 0; row < grid.rows; row++) {
      const y = contentTop + ((row + 0.5) / grid.rows) * (contentBottom - contentTop);
      for (let column = 0; column < grid.columns; column++) {
        const x = viewport.x + ((column + 0.5) / grid.columns) * viewport.width;
        totalSamples++;
        if (!ground.some((entry) => contains(entry.screenBounds!, x, y))) continue;
        groundSamples++;
        const covering = occupants.filter((entry) => contains(entry.screenBounds!, x, y));
        if (covering.length === 0) {
          emptyGroundSamples++;
          continue;
        }
        occupiedSamples++;
        const categories = new Set(covering.map((entry) => entry.category));
        categories.forEach((category) => { coverageByCategory[category] = (coverageByCategory[category] || 0) + 1; });
      }
    }
    return {
      method: 'screen-space grid estimate',
      hudExclusion,
      grid,
      totalSamples,
      groundSamples,
      occupiedSamples,
      emptyGroundSamples,
      coverageByCategory,
      largeEmptyGroundRatio: groundSamples > 0 ? emptyGroundSamples / groundSamples : null,
    };
  }
}
