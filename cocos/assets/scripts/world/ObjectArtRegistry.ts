/**
 * Semantic, audited visual bindings for every gameplay object type.
 *
 * Gameplay still owns tiers, mass and suction state; this registry only names
 * the Creator-saved glTF visual to instantiate. There are deliberately no
 * geometry/primitive fallbacks and no cross-category substitutions.
 */
import { Vec3 } from 'cc';
import { WorldArtKind } from './WorldArtLibrary';

export interface ObjectArtBinding {
  readonly kind: WorldArtKind;
  readonly scale: Readonly<Vec3>;
  readonly yOffset: number;
  readonly yaw: number;
}

const unitScale = (): Vec3 => new Vec3(1, 1, 1);

const OBJECT_ART_BINDINGS: Readonly<Record<string, ObjectArtBinding>> = {
  soda_can: { kind: 'sodaCan', scale: unitScale(), yOffset: 0, yaw: 0 },
  water_bottle: { kind: 'waterBottle', scale: unitScale(), yOffset: 0, yaw: 0 },
  battery: { kind: 'battery', scale: unitScale(), yOffset: 0, yaw: 0 },
  toy: { kind: 'toyDuck', scale: unitScale(), yOffset: 0, yaw: 0 },
  apple: { kind: 'apple', scale: unitScale(), yOffset: 0, yaw: 0 },
  paper_ball: { kind: 'paperScrap', scale: unitScale(), yOffset: 0, yaw: 20 },

  book_stack: { kind: 'bookStack', scale: unitScale(), yOffset: 0, yaw: 0 },
  cardboard_box: { kind: 'cardboardBox', scale: unitScale(), yOffset: 0, yaw: 0 },
  cone: { kind: 'constructionCone', scale: unitScale(), yOffset: 0, yaw: 0 },
  trash_bag: { kind: 'trashBag', scale: unitScale(), yOffset: 0, yaw: 0 },
  paint_bucket: { kind: 'paintBucket', scale: unitScale(), yOffset: 0, yaw: 0 },

  chair: { kind: 'chair', scale: unitScale(), yOffset: 0, yaw: 0 },
  small_table: { kind: 'coffeeTable', scale: unitScale(), yOffset: 0, yaw: 0 },
  monitor: { kind: 'monitor', scale: unitScale(), yOffset: 0, yaw: 0 },
  tire: { kind: 'tire', scale: unitScale(), yOffset: 0, yaw: 0 },

  shelf: { kind: 'shelf', scale: unitScale(), yOffset: 0, yaw: 0 },
  crate: { kind: 'crate', scale: unitScale(), yOffset: 0, yaw: 0 },
  sofa: { kind: 'sofa', scale: unitScale(), yOffset: 0, yaw: 0 },

  car: { kind: 'sedan', scale: unitScale(), yOffset: 0, yaw: 0 },
  delivery_van: { kind: 'deliveryVan', scale: unitScale(), yOffset: 0, yaw: 0 },
  garbage_truck: { kind: 'garbageTruck', scale: unitScale(), yOffset: 0, yaw: 0 },
  container: { kind: 'shippingContainer', scale: unitScale(), yOffset: 0, yaw: 0 },
};

export function getObjectArtBinding(type: string): ObjectArtBinding {
  const binding = OBJECT_ART_BINDINGS[type];
  if (!binding) throw new Error(`[ObjectArtRegistry] No audited semantic art binding for ${type}.`);
  return binding;
}

export function getObjectArtBindingTypes(): readonly string[] {
  return Object.keys(OBJECT_ART_BINDINGS);
}
