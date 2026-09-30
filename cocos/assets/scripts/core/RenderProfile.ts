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
  roadStraight: '#9ca8bc',
  roadCrossroad: '#9ca8bc',
  terrainTile: '#92db7f',
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

