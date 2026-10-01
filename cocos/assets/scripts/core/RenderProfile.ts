/**
 * V6_RENDER_PROFILE - the single source of truth for this game's render look.
 *
 * Before this module existed the render configuration was spread across five
 * places with no shared constants: the serialized Game.scene, the portrait
 * camera controller, the world art palette, the machine visual palette, and the
 * runtime core-mesh palette. The world palette and the machine palette shared
 * nothing, and Game.scene disagreed with Bootstrap.scene on ambient, shadowPcf,
 * csmLevel, shadowDistance and fogColor.
 *
 * This module does NOT rebuild the engine pipeline. It records the profile that
 * the project actually uses and makes the four consumers read from it, so a
 * palette or framing change has exactly one edit site.
 *
 * Lighting is deliberately unlit. The profile records that as a decision, not
 * as an accident: switching the world materials to 'builtin-standard' was
 * measured on this build and the entire 3D world disappears, with the engine
 * raising Error 3804 plus roughly one thousand localSetLayout failures. See
 * docs/design-reference/ui-v6-production/render-profile.md. Because lighting
 * contributes nothing under an unlit effect, the serialized DirectionalLight,
 * Ambient and Skybox values are recorded here for reference only and are not a
 * source of image content.
 */
import { Vec3 } from 'cc';
import type { WorldArtKind } from '../world/WorldArtLibrary';

/** Bumped whenever the look changes, so evidence can name the profile it used. */
export const RENDER_PROFILE_VERSION = 'v6.0.0';

/**
 * The one material effect the game renders through. 'builtin-standard' is
 * excluded by measurement, not by preference.
 */
export const RENDER_EFFECT = 'builtin-unlit';

/** The two macro switches every runtime material declares explicitly. */
export const RENDER_DEFINES = {
  /** Set per material: true only when a colour atlas is bound. */
  USE_TEXTURE: false,
  /** Imported vertex tint is never the art contract. */
  USE_VERTEX_COLOR: false,
} as const;

/**
 * Cheap contact shadows. The project is unlit (see LIGHTING_PROFILE), so no
 * shadow is cast by the pipeline and every object would read as floating.
 * Instead one shared transparent quad material is drawn flat on the ground
 * under the few objects that need grounding: the player, dynamic vehicles and
 * large targets. Small T1/T2 props deliberately get none.
 */
export const BLOB_SHADOW_PROFILE = {
  /** Name of the child node a shadow is attached under. */
  nodeName: 'BlobShadow',
  /** Cache key; one material for the whole scene. */
  materialKey: 'v6-blob-shadow',
  /**
   * The shared soft-edge map, under `assets/resources` so it ships in the
   * resources bundle and can be loaded once at runtime. It is a real imported
   * texture because every runtime-generated alternative failed: a flat quad is
   * a hard rectangle, the world pass ignores vertex colour, and an ImageAsset
   * built in code did not bind.
   */
  texturePath: 'v6/blob-shadow',
  /**
   * A PNG is imported as an ImageAsset with a Texture2D sub-asset, and the
   * bundle registers them at different paths: the ImageAsset at the bare path
   * and the Texture2D at `<path>/texture`. Loading the bare path as a Texture2D
   * fails with "Bundle resources doesn't contain v6/blob-shadow", so the
   * Texture2D sub-path is tried first.
   */
  textureSubPath: 'v6/blob-shadow/texture',
  color: '#0b1220',
  /**
   * Alpha is applied twice: once by this colour, and again by the texture's own
   * radial falloff. Measured on the opening frame, 110 with a hard quad read as
   * a dark panel (dark-surface ratio 0.177 against a 0.06 budget). With the
   * soft-edge map the mark is concentrated in the centre, so a lower alpha
   * still reads while staying well inside the budget.
   */
  // Measured on the opening frame: at 70 the mark sat on top of the road's own
  // dark asphalt and read as nothing. The road surface renders around
  // rgb(62,74,112), so the shadow needs real weight to separate from it.
  alpha: 120,
  /**
  * Technique index into `builtin-unlit`. The effect declares opaque(0) /
  * transparent(1) / add(2) / alpha-blend(3); the default is 0, which ignores
  * the texture alpha and draws a hard rectangle.
  */
  technique: 1,
  /** Triangles in the soft-edged disc. 24 is smooth at phone scale. */
  segments: 24,
  /**
   * Metres above the object's own origin. The terrain tile centre sits at
   * y 0.02 and the road surface at y 0.06, so a shadow placed at the ground
   * height is buried under the road and never draws. Measured: at 0.02 the
   * shadow was coplanar with the tile and invisible; it has to clear the road
   * surface (0.06 plus its own half-thickness) to read.
   */
  groundOffset: 0.10,
  /** Depth-to-width ratio of the ellipse, so the shadow reads as a footprint. */
  ellipse: 0.8,
  /** Footprint in metres per shadow, by the kind of host it grounds. */
  diameter: {
    // Measured against the player's own silhouette: the level-1 singularity
    // disc spans about 2.9 m (AbyssBase radius 1.10 x coreNode scale 1.32), so a
    // 3.0 m shadow sat entirely underneath the black hole and never showed. The
    // footprint has to be clearly wider than the object it grounds.
    player: 4.4,
    vehicle: 5.0,
    tier4: 3.8,
    tier5: 4.8,
  },
} as const;

/**
 * Opening-cell composition, as a declared list rather than ad-hoc hiding.
 *
 * The V6 world audit classified the 50 visible environment objects of the
 * authored opening cell and found 4 that are pure noise inside the player's
 * 3 m corridor, 2 that are illegible at the gameplay camera distance, and 1
 * that renders as a 0.2 m stripe instead of the streetlight the composition
 * contract requires.
 *
 * These are applied at runtime by node name against the instantiated cell, not
 * by editing the prefab: the project's authoring rule forbids hand-editing
 * prefab or meta JSON, and the authored prefab stays the single source of the
 * cell's geometry. Every entry is reversible by deleting one line.
 *
 * Contract constraints that shaped this list:
 *   - treesMin is 10 and the cell authors 12, so at most two trees may go.
 *     The first attempt removed three and the gate caught it exactly:
 *     "visible trees is 9, needs >= 10". ParkTreeSmall_3 was restored for that
 *     reason; at 2.5 m from the player it is the least harmful of the three
 *     crowded trees.
 *   - requiredSemantics includes streetlights, so the streetlight is rescaled
 *     to read at phone scale rather than removed.
 *   - requiredSemantics includes trees and flowerbeds, so one flowerbed stays.
 */
export const OPENING_CELL_COMPOSITION = {
  /** Nodes deactivated in the instantiated cell. */
  suppress: [
    // 22x31 px, 1.7 m from the player, overlapping the cluster ring's top edge.
    'ParkTreeSmall_1',
    // Sits between the player and the fountain and its foliage reaches the
    // player's north edge; the single worst readability offender in the audit.
    'ParkTreeLarge_3',
    // 24x45 px about 2 m from the player, and its z overlaps ParkTreeLarge_2.
    'FlowerbedWest',
    // About 3x12 px at this camera distance: not a readable path.
    'ParkPathStonesWest',
    'ParkPathStonesEast',
  ],
  /**
   * Nodes rescaled so they deliver their named semantic at phone scale. The
   * streetlight is authored 0.2 m across, which projects to a 12 px vertical
   * stripe indistinguishable from a kerb edge.
   */
  rescale: [
    { name: 'POI_CentralSquare', scale: 3.4 },
  ],
} as const;

/** Gameplay camera framing. Owned by PortraitGameplayCameraController. */
export const CAMERA_PROFILE = {
  designWidth: 720,
  designHeight: 1280,
  fov: 44,
  /** CameraFOVAxis.VERTICAL is value 0 in Cocos Creator 3.8.3. */
  fovAxis: 0,
  /** Isometric-feel portrait framing: the player sits in the lower half. */
  endless: { offset: new Vec3(0, 20.0, 18.5), pitchDegrees: -42 },
  arena: { offset: new Vec3(0, 44.0, 27.0), pitchDegrees: -55 },
} as const;

/**
 * Serialized scene lighting, recorded for reference. Under RENDER_EFFECT these
 * values produce no image content; they are kept so the scene and this profile
 * can be reconciled deliberately rather than drifting apart unnoticed.
 */
export const LIGHTING_PROFILE = {
  directionalLight: { color: '#fffaf0', illuminance: 65000, castsShadow: false },
  ambient: { skyColor: '#3380cc', skyIlluminance: 20000, groundAlbedo: '#333333' },
  shadows: { enabled: false, size: 1024, pcf: 0 },
  skybox: { enabled: true, drawn: false },
  cameraClearFlags: 14,
  cameraClearColor: '#333333',
  toneMapping: 0,
} as const;

/** The V6 visual language, as named roles rather than ad-hoc hex literals. */
export const UI_PALETTE = {
  /** Primary call to action. */
  primary: '#ffbd1f',
  /** Secondary call to action. */
  secondary: '#8b62f4',
  /** Deep-blue HUD panel behind pills and leaderboards. */
  hudPanel: '#0a1a33',
  /** Light sky behind every menu page. */
  skyLight: '#7fc9f2',
  /** Panel body on light pages. */
  surface: '#fffdf7',
  /** Player silhouette: violet-black singularity. */
  playerBody: '#281660',
  playerRim: '#e0d5ff',
  /** Absorbable target tiers, cool to warm as tier rises. */
  tier1: '#7dd3fc',
  tier2: '#69bf71',
  tier3: '#fbc02d',
  tier4: '#ff8f70',
  tier5: '#ef476f',
} as const;

/** The machine's own core-mesh palette, shared by BlackHoleMachine and MeshFactory. */
export const MACHINE_PALETTE = {
  abyssBase: '#281660',
  holeInner: '#05040e',
  innerSwirl: '#e0d5ff',
  midSwirl: '#bca5ff',
  outerSwirl: '#8b62f4',
  shimmerSwirl: '#f2ebff',
  holeRing: '#c8adff',
} as const;

/** The five machine assemblies' audited part colours, shared by MachineVisualLibrary. */
export const MACHINE_ASSEMBLY_PALETTE = {
  chassis: '#35a85e',
  compression: '#ffb703',
  gravity: '#bfa6ff',
  turbineLow: '#b7e8ff',
  turbineHigh: '#e4d7ff',
} as const;

/**
 * World art colours, keyed by WorldArtKind.
 *
 * This is the same table WorldArtLibrary previously held privately; it lives
 * here so the profile is the one place a world colour can change. White is used
 * for the Tiny Treats park set on purpose: that pack ships one authored colour
 * atlas, and tinting it would flatten the fountain water, hedge, flower and wood
 * hues.
 */
export const WORLD_PALETTE: Readonly<Record<WorldArtKind, string>> = {
  // Road and ground were the largest distance from the bright reference: the
  // road rendered around rgb(62,74,112) against a palette of #9ca8bc, i.e. a
  // dark blue-grey that dominated the frame. The road atlas itself is a mid
  // blue-grey that the tint multiplies down, so the tint has to be near-white
  // to land on the intended light blue-grey. Measured on the opening frame:
  // #9ca8bc gives asphalt rgb(62,74,112), #d5dbe6 gives rgb(98,108,141) and
  // #e8edf5 gives rgb(109,119,151). Pure white only reaches rgb(123,130,157),
  // which is the atlas ceiling, so #e8edf5 is the practical maximum.
  roadStraight: '#e8edf5',
  roadCrossroad: '#e8edf5',
  // Grass is lifted alongside the road so the two stay distinguishable instead
  // of both reading as mid-tone grey.
  terrainTile: '#a6e894',
  buildingB: '#ffd18d',
  buildingC: '#9ed6ff',
  treeSmall: '#69bf71',
  treeLarge: '#54a962',
  pathStones: '#f1d5a4',
  fence: '#f2ae4d',
  parkFountain: '#ffffff',
  parkBench: '#ffffff',
  parkBush: '#ffffff',
  parkHedgeLong: '#ffffff',
  parkHedgeCorner: '#ffffff',
  parkLantern: '#ffffff',
  parkTrashcan: '#ffffff',
  parkFlowerA: '#ffffff',
  parkFlowerB: '#ffffff',
  parkGrassTile: '#ffffff',
  parkCobblePath: '#ffffff',
  parkTree: '#ffffff',
  parkTreeLarge: '#ffffff',
  commercialBuildingA: '#f7b267',
  commercialBuildingD: '#ff8f70',
  commercialBuildingF: '#f3b76d',
  commercialBuildingG: '#72b9e6',
  commercialBuildingH: '#e99085',
  commercialSkyscraperA: '#ffb86b',
  commercialSkyscraperB: '#75b8ef',
  streetLight: '#fef3c7',
  constructionCone: '#ff7a00',
  bulldozer: '#35a85e',
  garbageTruck: '#35a85e',
  sedan: '#ef476f',
  deliveryVan: '#ffd166',
  recyclingBox: '#c68b59',
  tire: '#1f2937',
  recyclingBolt: '#7dd3fc',
  turbineWheel: '#38bdf8',
  sodaCan: '#e53935',
  waterBottle: '#29b6f6',
  battery: '#fbc02d',
  toyDuck: '#ffd54f',
  apple: '#e53935',
  paperScrap: '#f5f5f4',
  bookStack: '#3b82f6',
  cardboardBox: '#b7794d',
  trashBag: '#374151',
  paintBucket: '#00acc1',
  chair: '#455a64',
  coffeeTable: '#795548',
  monitor: '#111827',
  shelf: '#90a4ae',
  crate: '#388e3c',
  sofa: '#8d6e63',
  shippingContainer: '#0288d1',
};
