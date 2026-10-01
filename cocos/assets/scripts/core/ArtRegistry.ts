/**
 * V7 Art Registry: the single mapping from gameplay identity to authored art.
 *
 * This is PHASE 1 of the V7 migration. The rule the brief sets is:
 *
 *   Gameplay knows: objectType, tier, artId
 *   Art knows:      which prefab, mesh, material and texture that artId means
 *
 * Before this file, art identity was spread over three registries
 * (ObjectArtRegistry for collectibles, WorldArtLibrary's WorldArtKind union for
 * world art, MachineVisualLibrary for the machine) plus ad-hoc node-name lookups
 * inside BlackHoleMachine. None of them could express "this gameplay type has a
 * red variant and a blue variant", which is exactly what the commercial
 * production pipeline needs for skins, liveries and region variants.
 *
 * This module does not replace those registries yet. It defines the shape they
 * will converge on, exposes the current resolution as V7 art ids, and is the
 * place a new variant is declared. Migrating a category means moving its
 * existing table in here, one category at a time, with the gate proving the
 * rendered result is unchanged.
 *
 * Deliberately data-only: no imports from Cocos, so it can be unit-tested and
 * read by tooling without a runtime.
 */

/** The categories the brief names for the art tree. */
export type ArtCategory =
  | 'blackhole'
  | 'vehicles'
  | 'buildings'
  | 'environment'
  | 'props'
  | 'collectibles'
  | 'ui';

/**
 * One authored visual, addressed the way the brief asks: a stable dotted id.
 * Example: `vehicle.car.red` -> `Car_Red.prefab`.
 */
export interface ArtEntry {
  /** Stable dotted identity. Never renamed once shipped; add a new id instead. */
  readonly artId: string;
  readonly category: ArtCategory;
  /**
   * The authored asset that renders this entry. Path is relative to
   * `cocos/assets/` so it can be resolved by tooling and by the runtime.
   * A null path means "this entry is still served by the legacy registry",
   * which is the explicit marker for un-migrated art.
   */
  readonly prefab: string | null;
  /** Palette roles this entry may be tinted with, if any. */
  readonly variants?: readonly string[];
  /** Gameplay object types that resolve to this entry. */
  readonly gameplayTypes: readonly string[];
}

/**
 * The art tree, mirroring `cocos/assets/game_art/` exactly. Declaring the
 * categories here keeps the directory layout and the registry from drifting.
 */
export const ART_CATEGORIES: readonly ArtCategory[] = [
  'blackhole',
  'vehicles',
  'buildings',
  'environment',
  'props',
  'collectibles',
  'ui',
];

/**
 * The V7 art ids that are already backed by authored assets today.
 *
 * These are not new art. They record the existing, audited glTF templates that
 * ObjectArtRegistry and WorldArtLibrary already bind, expressed as V7 art ids
 * so gameplay can start asking for art by identity rather than by kind.
 */
const MIGRATED_ENTRIES: readonly ArtEntry[] = [
  // Vehicles: authored GLB, one palette tint each.
  { artId: 'vehicle.car', category: 'vehicles', prefab: 'art/vehicles/sedan.glb', variants: ['red'], gameplayTypes: ['car'] },
  { artId: 'vehicle.van', category: 'vehicles', prefab: 'art/vehicles/delivery-van.glb', variants: ['yellow'], gameplayTypes: ['delivery_van'] },
  { artId: 'vehicle.truck', category: 'vehicles', prefab: 'art/vehicles/garbage-truck.glb', variants: ['green'], gameplayTypes: ['garbage_truck'] },

  // Collectibles: authored GLB per tier role.
  { artId: 'collectible.can', category: 'collectibles', prefab: 'art/recyclables/food/soda-can.glb', gameplayTypes: ['soda_can'] },
  { artId: 'collectible.bottle', category: 'collectibles', prefab: 'art/recyclables/food/soda-bottle.glb', gameplayTypes: ['water_bottle'] },
  { artId: 'collectible.battery', category: 'collectibles', prefab: 'art/recyclables/props/battery.glb', gameplayTypes: ['battery'] },
  { artId: 'collectible.toy', category: 'collectibles', prefab: 'art/recyclables/props/toy-duck.glb', gameplayTypes: ['toy'] },
  { artId: 'collectible.apple', category: 'collectibles', prefab: 'art/recyclables/food/apple.glb', gameplayTypes: ['apple'] },
  { artId: 'collectible.paper', category: 'collectibles', prefab: 'art/recyclables/props/paper-scrap.glb', gameplayTypes: ['paper_ball'] },
  { artId: 'collectible.books', category: 'collectibles', prefab: 'art/recyclables/furniture/book-stack.glb', gameplayTypes: ['book_stack'] },
  { artId: 'collectible.cardboard', category: 'collectibles', prefab: 'art/recyclables/furniture/cardboard-box.glb', gameplayTypes: ['cardboard_box'] },
  { artId: 'collectible.cone', category: 'collectibles', prefab: 'art/world/roads/construction-cone.glb', gameplayTypes: ['cone'] },
  { artId: 'collectible.trashbag', category: 'collectibles', prefab: 'art/recyclables/props/trash-bag.glb', gameplayTypes: ['trash_bag'] },
  { artId: 'collectible.paint', category: 'collectibles', prefab: 'art/recyclables/props/paint-bucket.glb', gameplayTypes: ['paint_bucket'] },
  { artId: 'collectible.chair', category: 'collectibles', prefab: 'art/recyclables/furniture/chair.glb', gameplayTypes: ['chair'] },
  { artId: 'collectible.table', category: 'collectibles', prefab: 'art/recyclables/furniture/coffee-table.glb', gameplayTypes: ['small_table'] },
  { artId: 'collectible.monitor', category: 'collectibles', prefab: 'art/recyclables/furniture/monitor.glb', gameplayTypes: ['monitor'] },
  { artId: 'collectible.tire', category: 'collectibles', prefab: 'art/props/tire.glb', gameplayTypes: ['tire'] },
  { artId: 'collectible.shelf', category: 'collectibles', prefab: 'art/recyclables/furniture/shelf.glb', gameplayTypes: ['shelf'] },
  { artId: 'collectible.crate', category: 'collectibles', prefab: 'art/recyclables/industrial/crate.glb', gameplayTypes: ['crate'] },
  { artId: 'collectible.sofa', category: 'collectibles', prefab: 'art/recyclables/furniture/sofa.glb', gameplayTypes: ['sofa'] },
  { artId: 'collectible.container', category: 'collectibles', prefab: 'art/recyclables/industrial/shipping-container.glb', gameplayTypes: ['container'] },
  { artId: 'collectible.massfragment', category: 'collectibles', prefab: 'art/props/recycling-box.glb', gameplayTypes: ['arena_mass_fragment'] },

  // World: authored GLB/glTF placed by GoldenCityCell.
  { artId: 'environment.road.straight', category: 'environment', prefab: 'art/world/roads/road-straight.glb', gameplayTypes: [] },
  { artId: 'environment.road.crossroad', category: 'environment', prefab: 'art/world/roads/road-crossroad-path.glb', gameplayTypes: [] },
  { artId: 'environment.ground.tile', category: 'environment', prefab: 'art/world/environment/tile-low.glb', gameplayTypes: [] },
  { artId: 'environment.tree.small', category: 'environment', prefab: 'art/world/environment/tree-small.glb', gameplayTypes: [] },
  { artId: 'environment.tree.large', category: 'environment', prefab: 'art/world/environment/tree-large.glb', gameplayTypes: [] },
  { artId: 'environment.path.stones', category: 'environment', prefab: 'art/world/environment/path-stones-long.glb', gameplayTypes: [] },
  { artId: 'environment.fence', category: 'environment', prefab: 'art/world/environment/fence.glb', gameplayTypes: [] },
  { artId: 'environment.lamp', category: 'environment', prefab: 'art/world/roads/street-light.glb', gameplayTypes: [] },
  { artId: 'building.house', category: 'buildings', prefab: 'art/world/residential/building-type-b.glb', gameplayTypes: [] },
  { artId: 'building.house.alt', category: 'buildings', prefab: 'art/world/residential/building-type-c.glb', gameplayTypes: [] },
  { artId: 'building.shop', category: 'buildings', prefab: 'art/world/city/commercial-building-a.glb', gameplayTypes: [] },
  { artId: 'building.market', category: 'buildings', prefab: 'art/world/city/commercial-building-f.glb', gameplayTypes: [] },
  { artId: 'building.clinic', category: 'buildings', prefab: 'art/world/city/commercial-building-d.glb', gameplayTypes: [] },
  { artId: 'building.tower', category: 'buildings', prefab: 'art/world/city/commercial-skyscraper-a.glb', gameplayTypes: [] },
  { artId: 'building.tower.alt', category: 'buildings', prefab: 'art/world/city/commercial-skyscraper-b.glb', gameplayTypes: [] },
  { artId: 'prop.bench', category: 'props', prefab: 'art/world/pretty-park/bench.gltf', gameplayTypes: [] },
  { artId: 'prop.bin', category: 'props', prefab: 'art/world/pretty-park/trashcan.gltf', gameplayTypes: [] },
  { artId: 'prop.flowerbed', category: 'props', prefab: 'art/world/pretty-park/flower_A.gltf', gameplayTypes: [] },
  { artId: 'prop.hedge', category: 'props', prefab: 'art/world/pretty-park/hedge_straight_long.gltf', gameplayTypes: [] },
  { artId: 'prop.fountain', category: 'props', prefab: 'art/world/pretty-park/fountain.gltf', gameplayTypes: [] },
  { artId: 'prop.recyclinghub', category: 'props', prefab: 'art/props/recycling-box.glb', gameplayTypes: [] },
];

/**
 * Art that is still served by the legacy runtime path.
 *
 * These are the entries PHASE 2 has to migrate. Listing them here, rather than
 * leaving them implicit, is what makes "how much of the game is asset-driven"
 * an answerable question at any moment.
 */
const UNMIGRATED_ENTRIES: readonly ArtEntry[] = [
  {
    artId: 'blackhole.core',
    category: 'blackhole',
    prefab: null,
    variants: ['classic', 'violet', 'orange', 'emerald', 'crimson'],
    gameplayTypes: [],
  },
];

const ALL_ENTRIES: readonly ArtEntry[] = [...MIGRATED_ENTRIES, ...UNMIGRATED_ENTRIES];

/** Every declared art entry, migrated and not. */
export function getArtEntries(): readonly ArtEntry[] {
  return ALL_ENTRIES;
}

/** Look one up by its dotted id. */
export function getArtEntry(artId: string): ArtEntry | null {
  return ALL_ENTRIES.find((entry) => entry.artId === artId) || null;
}

/**
 * Resolve a gameplay object type to its art. This is the call site the brief
 * describes: gameplay asks by type, art answers with a prefab.
 */
export function resolveArtForGameplayType(type: string): ArtEntry | null {
  return ALL_ENTRIES.find((entry) => entry.gameplayTypes.includes(type)) || null;
}

/**
 * The V7 migration progress, as a number a report can quote.
 * `unmigrated` entries are the ones still rendered by runtime code.
 */
export function getMigrationStatus(): Readonly<{
  total: number;
  migrated: number;
  unmigrated: number;
  unmigratedIds: readonly string[];
}> {
  return {
    total: ALL_ENTRIES.length,
    migrated: MIGRATED_ENTRIES.length,
    unmigrated: UNMIGRATED_ENTRIES.length,
    unmigratedIds: UNMIGRATED_ENTRIES.map((entry) => entry.artId),
  };
}

