/**
 * Authored district and resource-cluster semantics for the endless X/Z grid.
 * These are data definitions only: every visual is resolved through the
 * Creator-saved WorldArtLibrary and every collectible remains a normal
 * CompressibleObject created by CellItemGenerator.
 */

export type DistrictKind =
  | 'RESIDENTIAL'
  | 'PARK'
  | 'SUPERMARKET'
  | 'WAREHOUSE'
  | 'PARKING'
  | 'CONSTRUCTION'
  | 'DOWNTOWN';

export interface ResourceClusterDefinition {
  readonly id: string;
  readonly label: string;
  readonly center: readonly [number, number];
  /** Preferred semantic gameplay-object types, in selection order. */
  readonly preferredTypes: readonly string[];
}

export interface DistrictTemplate {
  readonly kind: DistrictKind;
  readonly label: string;
  readonly resourceClusters: readonly ResourceClusterDefinition[];
}

const DISTRICTS: Readonly<Record<DistrictKind, DistrictTemplate>> = {
  RESIDENTIAL: {
    kind: 'RESIDENTIAL',
    label: '住宅街区',
    resourceClusters: [
      { id: 'curbside-recycling', label: '路边回收堆', center: [-12, -11], preferredTypes: ['soda_can', 'water_bottle', 'paper_ball', 'battery'] },
      { id: 'garden-discard', label: '花园杂物堆', center: [13, -13], preferredTypes: ['toy', 'apple', 'paper_ball', 'cardboard_box'] },
      { id: 'mailbox-boxes', label: '快递纸箱堆', center: [-14, 13], preferredTypes: ['cardboard_box', 'book_stack', 'paper_ball'] },
      { id: 'driveway-litter', label: '车道杂物堆', center: [13, 14], preferredTypes: ['water_bottle', 'soda_can', 'trash_bag'] },
    ],
  },
  PARK: {
    kind: 'PARK',
    label: '城市公园',
    resourceClusters: [
      { id: 'path-litter', label: '步道散落物', center: [-13, -10], preferredTypes: ['paper_ball', 'water_bottle', 'soda_can'] },
      { id: 'picnic-discard', label: '野餐遗留物', center: [12, -12], preferredTypes: ['apple', 'water_bottle', 'book_stack', 'trash_bag'] },
      { id: 'tree-side-recycling', label: '树旁回收物', center: [-12, 13], preferredTypes: ['battery', 'soda_can', 'paper_ball'] },
      { id: 'fence-corner', label: '围栏角落杂物', center: [14, 13], preferredTypes: ['trash_bag', 'cardboard_box', 'paint_bucket'] },
    ],
  },
  SUPERMARKET: {
    kind: 'SUPERMARKET',
    label: '生鲜超市',
    resourceClusters: [
      { id: 'delivery-boxes', label: '卸货纸箱堆', center: [-13, -13], preferredTypes: ['cardboard_box', 'cardboard_box', 'paint_bucket'] },
      { id: 'cart-return-litter', label: '入口散落物', center: [13, -12], preferredTypes: ['water_bottle', 'soda_can', 'book_stack', 'chair'] },
      { id: 'produce-discard', label: '生鲜遗留物', center: [-13, 13], preferredTypes: ['apple', 'apple', 'trash_bag', 'monitor'] },
      { id: 'parking-recycling', label: '停车区回收物', center: [14, 14], preferredTypes: ['battery', 'water_bottle', 'cardboard_box', 'small_table'] },
    ],
  },
  WAREHOUSE: {
    kind: 'WAREHOUSE',
    label: '仓储物流区',
    resourceClusters: [
      { id: 'pallet-boxes', label: '货运箱堆', center: [-14, -13], preferredTypes: ['cardboard_box', 'cardboard_box', 'crate'] },
      { id: 'loading-bay', label: '装卸区杂物', center: [13, -12], preferredTypes: ['paint_bucket', 'trash_bag', 'battery'] },
      { id: 'shelf-spill', label: '货架旁散落物', center: [-13, 13], preferredTypes: ['book_stack', 'cardboard_box', 'tire', 'chair', 'small_table', 'monitor'] },
      { id: 'container-yard', label: '集装箱场回收物', center: [14, 14], preferredTypes: ['crate', 'trash_bag', 'paint_bucket'] },
    ],
  },
  PARKING: {
    kind: 'PARKING',
    label: '露天停车场',
    resourceClusters: [
      { id: 'car-side-litter', label: '车侧散落物', center: [-13, -12], preferredTypes: ['water_bottle', 'soda_can', 'tire', 'shelf'] },
      { id: 'charging-bay', label: '充电位杂物', center: [13, -13], preferredTypes: ['battery', 'battery', 'trash_bag', 'sofa'] },
      { id: 'parking-corner', label: '停车场角落', center: [-13, 13], preferredTypes: ['cardboard_box', 'paint_bucket', 'tire', 'crate'] },
      { id: 'exit-recycling', label: '出口回收物', center: [13, 14], preferredTypes: ['soda_can', 'water_bottle', 'trash_bag', 'shelf'] },
    ],
  },
  CONSTRUCTION: {
    kind: 'CONSTRUCTION',
    label: '施工工地',
    resourceClusters: [
      { id: 'material-pile', label: '施工材料堆', center: [-13, -13], preferredTypes: ['crate', 'paint_bucket', 'cardboard_box', 'container'] },
      { id: 'barrier-side', label: '围挡旁杂物', center: [14, -12], preferredTypes: ['cone', 'trash_bag', 'battery'] },
      { id: 'tool-discard', label: '工具遗留物', center: [-13, 13], preferredTypes: ['tire', 'paint_bucket', 'battery'] },
      { id: 'site-exit', label: '工地出口回收物', center: [13, 14], preferredTypes: ['cardboard_box', 'cone', 'trash_bag', 'garbage_truck'] },
    ],
  },
  DOWNTOWN: {
    kind: 'DOWNTOWN',
    label: '商业都市区',
    resourceClusters: [
      { id: 'storefront-recycling', label: '店前回收物', center: [-13, -13], preferredTypes: ['soda_can', 'water_bottle', 'book_stack', 'delivery_van'] },
      { id: 'sidewalk-litter', label: '人行道散落物', center: [13, -12], preferredTypes: ['paper_ball', 'battery', 'trash_bag', 'car'] },
      { id: 'alley-boxes', label: '后巷纸箱堆', center: [-13, 13], preferredTypes: ['cardboard_box', 'crate', 'paint_bucket', 'container'] },
      { id: 'taxi-stand', label: '路边回收物', center: [13, 14], preferredTypes: ['soda_can', 'water_bottle', 'tire', 'car'] },
    ],
  },
};

const DISTRICT_ORDER: readonly DistrictKind[] = [
  'RESIDENTIAL', 'PARK', 'SUPERMARKET', 'WAREHOUSE', 'PARKING', 'CONSTRUCTION', 'DOWNTOWN',
];

/**
 * Endless progression is organised around the six named GameConfig regions.
 * The art district, its semantic resource clusters, and the HUD therefore
 * have to agree on the same region rather than each choosing a deterministic
 * but unrelated cell pattern.  `PARK` remains available for authored home /
 * arena dressing; it is deliberately not a progression-region substitute.
 */
const PROGRESSION_DISTRICT_BY_REGION: Readonly<Record<string, DistrictKind>> = {
  bedroom: 'RESIDENTIAL',
  warehouse: 'WAREHOUSE',
  supermarket: 'SUPERMARKET',
  parking: 'PARKING',
  construction: 'CONSTRUCTION',
  city: 'DOWNTOWN',
};

function positiveMod(value: number, divisor: number): number {
  const result = value % divisor;
  return result < 0 ? result + divisor : result;
}

/** Deterministic across sessions so a streamed cell never changes identity. */
export function getDistrictTemplateForCell(cellX: number, cellZ: number): DistrictTemplate {
  const index = positiveMod(cellX * 31 + cellZ * 17, DISTRICT_ORDER.length);
  return DISTRICTS[DISTRICT_ORDER[index]];
}

/**
 * Returns the single visual/resource district promised by a progression
 * region.  Unknown ids retain the old deterministic city fallback so a
 * malformed or future region cannot make a streamed cell empty.
 */
export function getDistrictTemplateForRegion(regionId: string, cellX: number, cellZ: number): DistrictTemplate {
  const kind = PROGRESSION_DISTRICT_BY_REGION[regionId];
  return kind ? DISTRICTS[kind] : getDistrictTemplateForCell(cellX, cellZ);
}
