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
    // 4.0m x 1.5m hedge authored at (0, 0, 10.0) directly on the north road
    // arm in the player's near foreground. Hedge is not a required semantic;
    // suppressing it clears the road surface and camera sightline.
    'ParkHedgeNorth',
  ],
  /**
  * Nodes moved inside the cell.
   *
   * The streetlight is the case that forced this list to exist. It is authored
   * at the centre of the south arm, i.e. standing in the middle of a road, and
   * 0.2 m across, so at the gameplay camera it projected to a 12 px stripe that
   * delivered no 'streetlight' semantic at all. The first attempt at fixing it
   * scaled the node 3.4x in place, which produced the opposite failure: an 8.2 m
   * tall white slab taller than the 2.3 m buildings, still standing on the road.
   * A 1.6x scale on the kerb beside the junction gives a readable post at a
   * believable height without competing with the architecture.
   *
   * POI_ParkFountain was authored at (0, 0, 7) directly between the player
   * (0, 0) and the camera (z = 18.5). At 4m across and distance 22.4m, it
   * projected as a massive four-petal shape dominating the lower frame and
   * overlapping the joystick zone. Relocating it to (0, -11) moves it to the
   * north park area in front of the player, keeping the required fountain
   * semantic without obstructing the camera sightline.
   */
  relocate: [
    { name: 'POI_CentralSquare', x: -9, z: -9, scale: 1.6 },
    { name: 'POI_ParkFountain', x: 0, z: -11, scale: 0.8 },
  ],
} as const;

/**
 * Opening edible spread: where the first absorbable targets go.
 *
 * The authored opening rings are centred on the player's spawn, so the
 * singularity begins attracting them on frame one and the measured opening
 * frame showed only 1-2 visible edible targets against an owner target of
 * 8-12. This spread places targets on the diagonals, which is the one bearing
 * family that satisfies every constraint at once:
 *
 *   - clear of the roads. The cross occupies |x| <= 6 and |z| <= 6, and the
 *     four arms run out along the axes, so a diagonal at 9-15 m lands on grass
 *     in a corner quadrant rather than on the junction or an arm.
 *   - outside the authored tutorial ring (radius <= 6 m), so the adjudicated
 *     INTENTIONAL_TUTORIAL_EXCEPTION spacing stays untouched.
 *   - inside the portrait frame at the gameplay camera, which sees roughly
 *     z +20 .. -30 and |x| <= 12 at the player's depth.
 *   - beyond the level-1 suction radius (2.4 m), so they are visible rather
 *     than consumed on spawn.
 *
 * Positions are declared, not random, so the composition is reviewable and
 * reproducible, and every entry is one reversible line.
 */
export const OPENING_EDIBLE_SPREAD = [
  // Positions were chosen by an offline projection search (not by trial and
  // error against the gate): the gameplay camera's projection is derived from a
  // recorded composition, then every candidate on a 0.5 m grid is tested for
  // grass, distance from the tutorial ring, frame bounds and occlusion by any
  // visible BUILDING/TREE/POI. That leaves 483 safe positions; these are the
  // nearest ones per bearing, which keeps the opening readable and the spread
  // legible without crowding the spawn.
  //
  // Tier 1, inner ring: what a level-1 singularity can actually swallow.
  { tier: 1, x: -6.5, z: -8.5 },   // r=10.7 screen=(74,345)
  { tier: 1, x: 9.0, z: -6.5 },    // r=11.1 screen=(366,375)
  { tier: 1, x: -9.0, z: -6.5 },   // r=11.1 screen=(24,375)
  { tier: 1, x: -6.5, z: 11.0 },   // r=12.8 screen=(43,698)
  { tier: 1, x: 7.5, z: 11.0 },    // r=13.3 screen=(370,698)
  { tier: 1, x: -6.5, z: -11.5 },  // r=13.2 screen=(77,303)
  // Tier 2, middle ring: locked at level 1, so they read as the next step up
  // without competing with the edible targets.
  { tier: 2, x: 6.5, z: -10.5 },   // r=12.3 screen=(314,317)
  { tier: 2, x: -7.0, z: 14.0 },   // r=15.7 screen=(25,769)
  { tier: 2, x: 7.0, z: 14.0 },    // r=15.7 screen=(365,769)
  { tier: 2, x: 8.5, z: -13.0 },   // r=15.5 screen=(347,283)
  // Tier 3, outer ring: the mid-game goal, visible from the opening.
  { tier: 3, x: 6.5, z: -15.5 },   // r=16.8 screen=(308,250)
  { tier: 3, x: -7.0, z: -14.5 },  // r=16.1 screen=(72,263)
  { tier: 3, x: -10.0, z: -14.5 }, // r=17.6 screen=(19,263)
  { tier: 3, x: 10.0, z: -16.0 },  // r=18.9 screen=(368,244)
] as const;

/** Gameplay camera framing. Owned by PortraitGameplayCameraController. */
export const CAMERA_PROFILE = {
  designWidth: 720,
  designHeight: 1280,
  fov: 44,
  /** CameraFOVAxis.VERTICAL is value 0 in Cocos Creator 3.8.3. */
  fovAxis: 0,
  /**
   * Isometric-feel portrait framing: the player sits in the lower half.
   *
   * LV1 establishes the baseline playerWidthRatio of ~0.2255 within [0.22, 0.30].
   * As the machine progresses through LV2..LV5, upgrade assemblies (turbines,
   * compression chamber, gravity wings, singularity frame) attach and scale up
   * from 2.9m to ~14.0m across in world coordinates.
   *
   * Scaling the camera offset proportionally pulls the camera back along the
   * constant -42 degree sightline so the player's screen fraction stays readable
   * across all levels (~0.22 - 0.29), keeping playerScreenYRatio invariant while
   * keeping the black hole core and surrounding district clearly legible.
   */
  endless: {
    offset: new Vec3(0, 20.0, 18.5),
    pitchDegrees: -42,
    levelOffsets: [
      new Vec3(0, 20.0, 18.5),   // LV1: distance 27.24m (1.00x) -> playerWidthRatio ~0.285 - 0.300
      new Vec3(0, 28.0, 25.9),   // LV2: distance 38.14m (1.40x) -> playerWidthRatio ~0.272
      new Vec3(0, 36.0, 33.3),   // LV3: distance 49.04m (1.80x) -> playerWidthRatio ~0.269
      new Vec3(0, 68.0, 62.9),   // LV4: distance 92.63m (3.40x) -> playerWidthRatio ~0.269
      new Vec3(0, 98.0, 90.65),  // LV5: distance 133.50m (4.90x) -> playerWidthRatio ~0.268
    ],
  },
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

/**
 * HUD semantic roles. These were previously written as inline `new Color(...)`
 * literals, and the tier-upgrade pair was duplicated verbatim in both HUD
 * controllers. Named here so the two HUDs cannot drift apart, and so a role
 * change happens in one place.
 */
export const HUD_SEMANTIC = {
  /** An opponent that can currently eat the player. */
  danger: '#ff5c5c',
  /** An opponent the player can currently eat. */
  killable: '#c6ec78',
  /** The local player's own nameplate. */
  localPlayer: '#68ee68',
  /** Kill feedback: a win, so it reads gold rather than white. */
  killFeedback: '#ffd65c',
  /** Upgrade feedback for tier 2. */
  upgradeTier2: '#ffe15f',
  /** Upgrade feedback for tier 3 and above. */
  upgradeTier3: '#ffbe41',
  /** Neutral HUD text on a dark panel. */
  neutralText: '#ffffff',
  /** Outline behind HUD text, so it survives a busy world behind it. */
  textOutline: '#0a101c',
  /**
   * Two more dark-navy outlines that were already in the tree, kept at their
   * existing values so this commit changes no pixels. They are the same role as
   * `textOutline` and differ only slightly (0f1426 vs 0a101c vs 0d1e34); which
   * of the three should win is a visual decision, not a silent edit.
   */
  textOutlineLegacy: '#0f1426',
  textOutlineLegacyAlt: '#0d1e34',
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
