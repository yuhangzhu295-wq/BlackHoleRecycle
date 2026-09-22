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
import {
  InfiniteWorldManager,
  WorldCellAuthoredCollectibleSlot,
  WorldCellRuntimeContent,
} from '../../world/InfiniteWorldManager';

type GoldenCityCategory = 'BUILDING' | 'TREE' | 'ROAD' | 'POI' | 'VEHICLE' | 'COMPETITOR' | 'COLLECTIBLE' | 'RESOURCE_CLUSTER' | 'GROUND';

/**
 * Real-geometry openness predicate. Samples are taken on the xz plane over the
 * union of the actual streamed GROUND tile footprints (no hardcoded cell size),
 * and each sample is classified from the live world bounds of the objects that
 * the runtime actually spawned.
 */
const PLAYABLE_SAMPLE_SPACING_METERS = 1;
const PLAYABLE_OPEN_AREA_PREDICATE = [
  'sample grid on xz plane over the union of real GROUND tile worldBounds (spacing 1m, no hardcoded cell size)',
  'groundHit = sample inside a GROUND entry footprint (tile-low / DistrictGround / GroundTile)',
  'roadHit = sample inside a ROAD entry footprint; roads and walkways count as walkable, never as blocking',
  'blocked = sample inside a solid occupant footprint: BUILDING, TREE, POI (bench/trashcan/fountain/fence/streetlight/...) or a *static* vehicle environment node; route-driven DynamicVehicles are excluded because they move',
  'objectCovered = sample inside a COLLECTIBLE or RESOURCE_CLUSTER footprint, reported separately and never treated as blocking (absorbable)',
  'openSamples = groundSamples where no solid occupant covers the sample',
  'playableOpenAreaRatio = openSamples / groundSamples',
].join('; ');
const PLAYABLE_OPEN_AREA_CAVEAT =
  'The gameplay runtime ships no Collider/RigidBody, so this ratio measures visual composition openness of the ground footprint, not a movement constraint.';

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

export interface PlayableOpenAreaDiagnostics {
  /**
   * Real-geometry predicate used for every sample. Kept in the payload so an
   * auditor can re-derive the ratio instead of trusting a bare number.
   */
  readonly predicate: string;
  /**
   * Honest limitation: the gameplay runtime ships no Collider/RigidBody, so
   * this ratio describes visual composition openness, not a movement
   * constraint.
   */
  readonly caveat: string;
  readonly sampleSpacingMeters: number;
  readonly extent: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }> | null;
  readonly grid: Readonly<{ columns: number; rows: number }>;
  readonly totalSamples: number;
  readonly groundSamples: number;
  readonly roadSamples: number;
  readonly blockedSamples: number;
  readonly blockedByCategory: Readonly<Partial<Record<GoldenCityCategory, number>>>;
  readonly objectCoveredSamples: number;
  readonly openSamples: number;
  readonly playableOpenAreaRatio: number | null;
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
  /**
   * Composition of the cell's *authored* collectible placements, measured
   * independently of live suction state. `counts.COLLECTIBLE` is a live census
   * of objects in IDLE/ATTRACTED/SUCKING, so it falls as the player absorbs the
   * opening rings and is not a property of the cell. This block is: the
   * authored slot population is fixed, and visibility is derived by projecting
   * each authored slot position through the same gameplay camera. Contract
   * checks that describe what the cell presents must read this, not the live
   * census.
   */
  readonly authoredCollectibleSlots: Readonly<{
    method: 'authored slot positions projected through the gameplay camera';
    nominalHalfExtentMeters: number;
    total: number;
    visible: number;
    /** Live countable objects at the same instant, for drift diagnostics only. */
    liveCountable: number;
  }>;
  /**
   * The authored resource clusters, for the same reason as
   * `authoredCollectibleSlots`: the live `RESOURCE_CLUSTER` entries are grouped
   * from objects still in IDLE/ATTRACTED/SUCKING, so a cluster disappears from
   * the census as soon as the player has absorbed every one of its members.
   * A cluster is visible when at least one of its authored slots is visible.
   */
  readonly authoredResourceClusters: Readonly<{
    method: 'authored cluster slots grouped by authored cluster id';
    total: number;
    visible: number;
    clusters: readonly Readonly<{
      id: string;
      slots: number;
      visibleSlots: number;
      visible: boolean;
    }>[];
  }>;
  readonly player: Readonly<{
    /**
     * The player's *phase-invariant* silhouette: every drawn renderer except
     * the frame-animated decorative layers (see `animatedDecorationNames`).
     * This is what `widthRatio` is measured from.
     */
    worldBounds: GoldenCityWorldBounds | null;
    screenBounds: GoldenCityScreenBounds | null;
    visible: boolean;
    /**
     * The gated camera-framing metric: `worldBounds` projected through the
     * gameplay camera, as a fraction of the viewport width.
     */
    widthRatio: number | null;
    screenYRatio: number | null;
    /**
     * The same projection over *every* drawn renderer, decorative layers
     * included. Kept as a diagnostic only, never gated: `model.worldBounds` is
     * the AABB of a node's local AABB box, so a node spinning about Y reports
     * the box's rotated extent (up to sqrt(2) too wide) and this number
     * therefore tracks the animation clock rather than the framing.
     */
    rawWidthRatio: number | null;
    rawScreenBounds: GoldenCityScreenBounds | null;
    /** Node names excluded from `worldBounds` because they animate every frame. */
    animatedDecorationNames: readonly string[];
    /**
     * Which renderers actually fed `worldBounds`, and which were skipped
     * because they are not drawn or because they are frame-animated
     * decorations. The machine's subtree carries decorative rings and swirls
     * whose scale is driven by gameplay (the suction-radius indicator) and
     * whose rotation is driven by time, so a merged bounds without this list
     * cannot be told apart from a real change in the player's silhouette.
     */
    contributors: readonly Readonly<{
      name: string;
      drawn: boolean;
      excludedAsAnimatedDecoration: boolean;
      halfExtents: Readonly<{ x: number; y: number; z: number }>;
    }>[];
    /**
     * The machine state the silhouette was measured against. The decorative
     * layers are excluded from `widthRatio`, but the structural body still
     * scales with the machine's level `scale`, so a level-driven pass or
     * failure must remain distinguishable from a change in camera framing.
     */
    machineLevel: number | null;
    machineSuctionRadius: number | null;
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
  readonly playableOpenArea: PlayableOpenAreaDiagnostics;
}

/**
 * Authored slots carry only x/z. Projecting a bare point makes visibility
 * knife-edge at the frame border, so give each slot a small nominal box. This is
 * a visibility tolerance, not a claim about the art's true size.
 */
const AUTHORED_SLOT_HALF_EXTENT = 0.25;
const AUTHORED_SLOT_CENTER_Y = 0.35;

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
    playerMachine: Readonly<{ level: number; suctionRadius: number }> | null = null,
    animatedDecorationRoots: readonly Node[] = [],
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
        rawWidthRatio: null,
        rawScreenBounds: null,
        animatedDecorationNames: [],
        contributors: [],
        machineLevel: null,
        machineSuctionRadius: null,
      },
      emptyGround: this.emptyGround(),
      playableOpenArea: this.emptyPlayableOpenArea(),
      authoredCollectibleSlots: this.emptyAuthoredCollectibleSlots(),
      authoredResourceClusters: this.emptyAuthoredResourceClusters(),
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

    // The player's silhouette is the geometry that is actually drawn, minus the
    // layers that animate every frame. `MeshRenderer.model.worldBounds` is the
    // AABB of the node's local AABB box transformed into world space, so a node
    // spinning about Y reports the *box's* rotated extent: it inflates by up to
    // sqrt(2) and oscillates with the animation phase. HoleRing spins at
    // 18 deg/s, so merging it made `playerWidthRatio` a reading of
    // `visualElapsed` — it swung between 0.221 and 0.304 against the declared
    // 0.22-0.30 band. The decorative layers are therefore excluded from the
    // gated silhouette and reported separately through `rawWidthRatio`, so the
    // removal stays auditable instead of hidden.
    const animatedDecorationSet = new Set<Node>(animatedDecorationRoots.filter((node) => !!node && node.isValid));
    const playerContributors = playerNode?.isValid && playerNode.activeInHierarchy
      ? this.collectRenderableContributors([playerNode], animatedDecorationSet)
      : [];
    const playerBounds = playerNode?.isValid && playerNode.activeInHierarchy
      ? this.collectMergedWorldBounds([playerNode], { drawnOnly: true, exclude: animatedDecorationSet })
      : null;
    const rawPlayerBounds = playerNode?.isValid && playerNode.activeInHierarchy
      ? this.collectMergedWorldBounds([playerNode], { drawnOnly: true })
      : null;
    const playerProjection = playerBounds ? this.projectBounds(camera, viewport, playerBounds) : null;
    const rawPlayerProjection = rawPlayerBounds ? this.projectBounds(camera, viewport, rawPlayerBounds) : null;
    const player = {
      worldBounds: this.serializeWorldBounds(playerBounds),
      screenBounds: playerProjection?.screenBounds || null,
      visible: playerProjection?.visible || false,
      widthRatio: playerProjection?.screenBounds ? playerProjection.screenBounds.width / viewport.width : null,
      screenYRatio: playerProjection?.screenBounds
        ? ((playerProjection.screenBounds.top + playerProjection.screenBounds.bottom) * 0.5 - viewport.y) / viewport.height
        : null,
      rawWidthRatio: rawPlayerProjection?.screenBounds ? rawPlayerProjection.screenBounds.width / viewport.width : null,
      rawScreenBounds: rawPlayerProjection?.screenBounds || null,
      animatedDecorationNames: animatedDecorationRoots
        .filter((node) => !!node && node.isValid)
        .map((node) => node.name),
      contributors: playerContributors,
      machineLevel: playerMachine?.level ?? null,
      machineSuctionRadius: playerMachine?.suctionRadius ?? null,
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
      playableOpenArea: this.estimatePlayableOpenArea(entries),
      authoredCollectibleSlots: this.collectAuthoredCollectibleSlots(targetCell, camera, viewport, collectibles.length),
      authoredResourceClusters: this.collectAuthoredResourceClusters(targetCell, camera, viewport),
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
      // Every node name in this subtree, not only the ones carrying a renderer.
      // A group node such as `Buildings` has no MeshRenderer of its own, so a
      // landmark one level down (`Buildings/ResidentialHouseWest`) appears in
      // neither `renderers` nor a top-level name list. The authored Golden City
      // cell is grouped while the procedural region cells are flat, so anything
      // asking "is landmark X present" has to search the subtree to answer for
      // both shapes.
      const descendantNames: string[] = [];
      const visit = (node: Node): void => {
        descendantNames.push(node.name);
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
        descendantNames,
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

  /**
   * Measure the authored collectible population rather than the live one.
   *
   * The player spawns at the centre of the two authored opening rings (5 m and
   * 6 m) and begins attracting them immediately, and one absorption takes
   * several seconds, so `collectCollectibleEntries` returns a different number
   * depending on how long the arena has been running. A composition contract
   * describes what the cell presents, so project the authored slot positions
   * instead. Slots carry only x/z, so give each a small nominal box; the value
   * is a visibility tolerance, not a claim about the art's true size.
   */
  private static collectAuthoredCollectibleSlots(
    cell: WorldCellRuntimeContent,
    camera: Camera,
    viewport: Readonly<{ x: number; y: number; width: number; height: number }>,
    liveCountable: number,
  ): GoldenCityCompositionDiagnostics['authoredCollectibleSlots'] {
    let visible = 0;
    for (const slot of cell.collectibleSlots) {
      if (this.projectAuthoredSlot(camera, viewport, slot).visible) visible++;
    }
    return {
      method: 'authored slot positions projected through the gameplay camera',
      nominalHalfExtentMeters: AUTHORED_SLOT_HALF_EXTENT,
      total: cell.collectibleSlots.length,
      visible,
      liveCountable,
    };
  }

  /** Authored clusters grouped by the same id rule the live census uses. */
  private static collectAuthoredResourceClusters(
    cell: WorldCellRuntimeContent,
    camera: Camera,
    viewport: Readonly<{ x: number; y: number; width: number; height: number }>,
  ): GoldenCityCompositionDiagnostics['authoredResourceClusters'] {
    const groups = new Map<string, { slots: number; visibleSlots: number }>();
    for (const slot of cell.collectibleSlots) {
      const clusterId = this.getClusterId(slot.customId);
      if (!clusterId) continue;
      const group = groups.get(clusterId) || { slots: 0, visibleSlots: 0 };
      group.slots++;
      if (this.projectAuthoredSlot(camera, viewport, slot).visible) group.visibleSlots++;
      groups.set(clusterId, group);
    }
    // Do not spread this Map. Cocos Creator's Web Mobile Babel output rewrites
    // `[...map]` as `[].concat(map)`, which produces a one-element array holding
    // the Map itself rather than its entries (see GameSessionCoordinator for the
    // same trap on a Set). Map.forEach is native in every supported runtime and
    // preserves the grouping contract.
    const clusters: Array<{ id: string; slots: number; visibleSlots: number; visible: boolean }> = [];
    groups.forEach((group, id) => {
      clusters.push({
        id,
        slots: group.slots,
        visibleSlots: group.visibleSlots,
        visible: group.visibleSlots > 0,
      });
    });
    return {
      method: 'authored cluster slots grouped by authored cluster id',
      total: clusters.length,
      visible: clusters.filter((cluster) => cluster.visible).length,
      clusters,
    };
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

  private static emptyAuthoredCollectibleSlots(): GoldenCityCompositionDiagnostics['authoredCollectibleSlots'] {
    return {
      method: 'authored slot positions projected through the gameplay camera',
      nominalHalfExtentMeters: AUTHORED_SLOT_HALF_EXTENT,
      total: 0,
      visible: 0,
      liveCountable: 0,
    };
  }

  private static emptyAuthoredResourceClusters(): GoldenCityCompositionDiagnostics['authoredResourceClusters'] {
    return {
      method: 'authored cluster slots grouped by authored cluster id',
      total: 0,
      visible: 0,
      clusters: [],
    };
  }

  private static projectAuthoredSlot(
    camera: Camera,
    viewport: Readonly<{ x: number; y: number; width: number; height: number }>,
    slot: WorldCellAuthoredCollectibleSlot,
  ): GoldenCityProjection {
    return this.projectBounds(camera, viewport, {
      min: new Vec3(
        slot.x - AUTHORED_SLOT_HALF_EXTENT,
        AUTHORED_SLOT_CENTER_Y - AUTHORED_SLOT_HALF_EXTENT,
        slot.z - AUTHORED_SLOT_HALF_EXTENT,
      ),
      max: new Vec3(
        slot.x + AUTHORED_SLOT_HALF_EXTENT,
        AUTHORED_SLOT_CENTER_Y + AUTHORED_SLOT_HALF_EXTENT,
        slot.z + AUTHORED_SLOT_HALF_EXTENT,
      ),
    });
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

  /**
   * Merges the world bounds of every MeshRenderer in the given subtrees.
   *
   * `drawnOnly` restricts the merge to renderers that are actually drawn. It
   * defaults to false so the environment entries keep their existing numbers;
   * the player measurement opts in, because a hidden renderer is not part of
   * the player's on-screen silhouette.
   */
  private static collectMergedWorldBounds(
    roots: readonly Node[],
    options: Readonly<{ drawnOnly?: boolean; exclude?: ReadonlySet<Node> }> = {},
  ): GoldenCityLiveBounds | null {
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
      // An excluded subtree contributes nothing: the decorative layers are
      // leaves, and skipping the subtree keeps the rule correct if one ever
      // gains children.
      if (options.exclude?.has(node)) return;
      const renderer = node.getComponent(MeshRenderer);
      // A disabled renderer still owns a model with world bounds, so it must be
      // filtered here rather than relied on to be absent. Its children are
      // still visited: disabling one layer does not hide the subtree.
      const bounds = renderer && (!options.drawnOnly || renderer.enabled)
        ? renderer.model?.worldBounds || null
        : null;
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

  /**
   * Lists every renderer under the roots with its size, whether it is drawn,
   * and whether it was excluded from the silhouette as a frame-animated
   * decoration. Excluded renderers stay in the list on purpose: the report has
   * to show what the gate removed, not just what it kept.
   */
  private static collectRenderableContributors(
    roots: readonly Node[],
    exclude: ReadonlySet<Node> = new Set<Node>(),
  ): Array<Readonly<{
    name: string;
    drawn: boolean;
    excludedAsAnimatedDecoration: boolean;
    halfExtents: Readonly<{ x: number; y: number; z: number }>;
  }>> {
    const contributors: Array<Readonly<{
      name: string;
      drawn: boolean;
      excludedAsAnimatedDecoration: boolean;
      halfExtents: Readonly<{ x: number; y: number; z: number }>;
    }>> = [];
    const visit = (node: Node): void => {
      if (!node.activeInHierarchy) return;
      const renderer = node.getComponent(MeshRenderer);
      const halfExtents = renderer?.model?.worldBounds?.halfExtents || null;
      if (renderer && halfExtents) {
        contributors.push({
          name: node.name,
          drawn: renderer.enabled,
          excludedAsAnimatedDecoration: exclude.has(node),
          halfExtents: { x: halfExtents.x, y: halfExtents.y, z: halfExtents.z },
        });
      }
      node.children.forEach(visit);
    };
    roots.forEach(visit);
    return contributors;
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

  private static emptyPlayableOpenArea(): PlayableOpenAreaDiagnostics {
    return {
      predicate: PLAYABLE_OPEN_AREA_PREDICATE,
      caveat: PLAYABLE_OPEN_AREA_CAVEAT,
      sampleSpacingMeters: PLAYABLE_SAMPLE_SPACING_METERS,
      extent: null,
      grid: { columns: 0, rows: 0 },
      totalSamples: 0,
      groundSamples: 0,
      roadSamples: 0,
      blockedSamples: 0,
      blockedByCategory: {},
      objectCoveredSamples: 0,
      openSamples: 0,
      playableOpenAreaRatio: null,
    };
  }

  /**
   * World-space companion to `estimateEmptyGround`. The screen-space estimate
   * cannot answer "how open is the walkable ground": the flat ground plane only
   * covers the lower half of a portrait viewport, and object coverage is judged
   * from projected bounding quads which over-count large landmarks. This method
   * samples the actual ground-tile footprint union and classifies every sample
   * from live world bounds. It is a pure observer.
   */
  private static estimatePlayableOpenArea(entries: readonly GoldenCityEntry[]): PlayableOpenAreaDiagnostics {
    const insideAny = (candidates: readonly GoldenCityEntry[], x: number, z: number): GoldenCityWorldBounds[] => {
      const hits: GoldenCityWorldBounds[] = [];
      for (const candidate of candidates) {
        const bounds = candidate.worldBounds;
        if (!bounds) continue;
        if (x >= bounds.min.x && x <= bounds.max.x && z >= bounds.min.z && z <= bounds.max.z) hits.push(bounds);
      }
      return hits;
    };

    const groundEntries = entries.filter((entry) => entry.category === 'GROUND' && entry.worldBounds);
    if (groundEntries.length === 0) return this.emptyPlayableOpenArea();
    const extent = groundEntries.reduce((acc, entry) => {
      const bounds = entry.worldBounds as GoldenCityWorldBounds;
      return {
        minX: Math.min(acc.minX, bounds.min.x),
        maxX: Math.max(acc.maxX, bounds.max.x),
        minZ: Math.min(acc.minZ, bounds.min.z),
        maxZ: Math.max(acc.maxZ, bounds.max.z),
      };
    }, { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minZ: Number.POSITIVE_INFINITY, maxZ: Number.NEGATIVE_INFINITY });

    const roadEntries = entries.filter((entry) => entry.category === 'ROAD' && entry.worldBounds);
    const solidEntries = entries.filter((entry) => entry.worldBounds
      && (entry.category === 'BUILDING' || entry.category === 'TREE' || entry.category === 'POI'
        || (entry.category === 'VEHICLE' && !entry.classificationRule.includes('DynamicVehicle'))));
    const objectEntries = entries.filter((entry) => entry.worldBounds
      && (entry.category === 'COLLECTIBLE' || entry.category === 'RESOURCE_CLUSTER'));

    const columns = Math.max(1, Math.ceil((extent.maxX - extent.minX) / PLAYABLE_SAMPLE_SPACING_METERS));
    const rows = Math.max(1, Math.ceil((extent.maxZ - extent.minZ) / PLAYABLE_SAMPLE_SPACING_METERS));
    let totalSamples = 0;
    let groundSamples = 0;
    let roadSamples = 0;
    let blockedSamples = 0;
    let objectCoveredSamples = 0;
    let openSamples = 0;
    const blockedByCategory: Partial<Record<GoldenCityCategory, number>> = {};

    for (let row = 0; row < rows; row++) {
      const z = extent.minZ + (row + 0.5) * PLAYABLE_SAMPLE_SPACING_METERS;
      for (let column = 0; column < columns; column++) {
        const x = extent.minX + (column + 0.5) * PLAYABLE_SAMPLE_SPACING_METERS;
        totalSamples++;
        if (insideAny(groundEntries, x, z).length === 0) continue;
        groundSamples++;
        if (insideAny(roadEntries, x, z).length > 0) roadSamples++;
        if (insideAny(objectEntries, x, z).length > 0) objectCoveredSamples++;
        const blockers = solidEntries.filter((entry) => insideAny([entry], x, z).length > 0);
        if (blockers.length === 0) {
          openSamples++;
          continue;
        }
        blockedSamples++;
        new Set(blockers.map((entry) => entry.category)).forEach((category) => {
          blockedByCategory[category] = (blockedByCategory[category] || 0) + 1;
        });
      }
    }

    return {
      predicate: PLAYABLE_OPEN_AREA_PREDICATE,
      caveat: PLAYABLE_OPEN_AREA_CAVEAT,
      sampleSpacingMeters: PLAYABLE_SAMPLE_SPACING_METERS,
      extent,
      grid: { columns, rows },
      totalSamples,
      groundSamples,
      roadSamples,
      blockedSamples,
      blockedByCategory,
      objectCoveredSamples,
      openSamples,
      playableOpenAreaRatio: groundSamples > 0 ? openSamples / groundSamples : null,
    };
  }
}
