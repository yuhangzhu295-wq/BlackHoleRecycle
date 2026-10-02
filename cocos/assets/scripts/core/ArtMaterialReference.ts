/**
 * V7 PHASE 1: the editor-facing holder for the authored category materials.
 *
 * `ArtBootstrap.prefab` carries one node per category and this component on
 * each, so every material is referenced by uuid from an asset inside the
 * `game-art` bundle. That reference is what makes the materials ship: in Cocos
 * an asset is only packed into a bundle when something in that bundle depends
 * on it, which is exactly why the previous attempt produced eight .material
 * files that appeared in no bundle at all.
 *
 * This component is a reference holder only. It never renders and is never
 * added to the gameplay scene; MaterialLibrary reads it.
 */
import { _decorator, Component, Material } from 'cc';

const { ccclass, property } = _decorator;

/** The material categories the library owns. */
export type MaterialCategory =
  | 'grass'
  | 'road'
  | 'building'
  | 'vegetation'
  | 'vehicle'
  | 'prop'
  | 'metal'
  | 'blackhole';

@ccclass('ArtMaterialReference')
export class ArtMaterialReference extends Component {
  @property(Material) public grass: Material | null = null;
  @property(Material) public road: Material | null = null;
  @property(Material) public building: Material | null = null;
  @property(Material) public vegetation: Material | null = null;
  @property(Material) public vehicle: Material | null = null;
  @property(Material) public prop: Material | null = null;
  @property(Material) public metal: Material | null = null;
  @property(Material) public blackhole: Material | null = null;

  /** Look one up by category. Null means the slot was never wired in Creator. */
  public get(category: MaterialCategory): Material | null {
    switch (category) {
      case 'grass': return this.grass;
      case 'road': return this.road;
      case 'building': return this.building;
      case 'vegetation': return this.vegetation;
      case 'vehicle': return this.vehicle;
      case 'prop': return this.prop;
      case 'metal': return this.metal;
      case 'blackhole': return this.blackhole;
      default: return null;
    }
  }

  /** Every category that is actually bound, for diagnostics and reports. */
  public boundCategories(): readonly MaterialCategory[] {
    const categories: MaterialCategory[] = [
      'grass', 'road', 'building', 'vegetation', 'vehicle', 'prop', 'metal', 'blackhole',
    ];
    return categories.filter((category) => !!this.get(category));
  }

  /**
   * Fold the bound slots of other holders into this one.
   *
   * ArtBootstrap gives each category its own child node with exactly one slot
   * bound. MaterialLibrary wants a single lookup table, so it merges them. A
   * slot is only overwritten when the other holder actually has a value, so a
   * partially wired prefab degrades instead of blanking already-bound slots.
   */
  public mergeOthers(others: readonly ArtMaterialReference[]): void {
    const categories: MaterialCategory[] = [
      'grass', 'road', 'building', 'vegetation', 'vehicle', 'prop', 'metal', 'blackhole',
    ];
    for (const other of others) {
      if (!other || other === this) continue;
      for (const category of categories) {
        const value = other.get(category);
        if (value) this[category] = value;
      }
    }
  }
}
