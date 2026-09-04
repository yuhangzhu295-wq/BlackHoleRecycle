/**
 * Editor-saved source for the five distinct recycling-machine assemblies.
 *
 * Each `Prefab` is authored by the Cocos Creator scene extension from audited
 * glTF meshes. Runtime code may only instantiate these assemblies; it never
 * substitutes primitive meshes for the structural machine art.
 */
import { _decorator, Color, Component, instantiate, Material, MeshRenderer, Node, Prefab, Texture2D } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('MachineVisualLibrary')
export class MachineVisualLibrary extends Component {
  @property(Prefab) public level1Prefab: Prefab | null = null;
  @property(Prefab) public level2Prefab: Prefab | null = null;
  @property(Prefab) public level3Prefab: Prefab | null = null;
  @property(Prefab) public level4Prefab: Prefab | null = null;
  @property(Prefab) public level5Prefab: Prefab | null = null;

  /** Original CC-BY tracked chassis colour map. */
  @property(Texture2D) public bulldozerColorTexture: Texture2D | null = null;
  /** CC0 Kenney Factory Kit colour map for the upgrade modules. */
  @property(Texture2D) public factoryColorTexture: Texture2D | null = null;

  private readonly materialCache = new Map<string, Material>();

  public instantiateLevel(level: number, parent: Node): Node {
    const prefab = this.getPrefab(level);
    const visual = instantiate(prefab);
    visual.name = `MachineVisual_LV${level}`;
    parent.addChild(visual);
    // The selected assembly receives its renderer-local materials only after
    // BlackHoleMachine activates it. Applying while hidden is overwritten by
    // some imported glTF sub-model initializers on Web Mobile.
    visual.active = false;
    return visual;
  }

  /** Bind the real current assembly after its node becomes active. */
  public applyActiveLevelMaterials(visual: Node, level: number): void {
    if (!visual.activeInHierarchy) {
      throw new Error(`[MachineVisualLibrary] Cannot bind inactive LV${level} assembly.`);
    }
    this.applyAuditedMaterials(visual, level);
  }

  public validate(): void {
    for (let level = 1; level <= 5; level++) {
      const prefab = this.getPrefab(level);
      if (!prefab.data) throw new Error(`[MachineVisualLibrary] LV${level} prefab has no saved scene data.`);
    }
    if (!this.bulldozerColorTexture || !this.factoryColorTexture) {
      throw new Error('[MachineVisualLibrary] Missing Creator-imported machine colour texture.');
    }
  }

  private getPrefab(level: number): Prefab {
    const prefabs: Array<Prefab | null> = [
      this.level1Prefab,
      this.level2Prefab,
      this.level3Prefab,
      this.level4Prefab,
      this.level5Prefab,
    ];
    const prefab = prefabs[level - 1] || null;
    if (!prefab) throw new Error(`[MachineVisualLibrary] Missing editor-saved MachineVisual_LV${level}.prefab.`);
    return prefab;
  }

  private applyAuditedMaterials(root: Node, level: number): void {
    const chassis = root.getChildByName('CrawlerChassis');
    // The source GLB's image is an embedded import subasset and is not
    // emitted independently for Web Mobile. Keep the true chassis geometry,
    // but use the deterministic recycler-green material until an editor-saved
    // standalone chassis texture is introduced.
    if (chassis) this.applyMaterial(chassis, this.getMaterial('chassis', null, '#35A85E'));

    const turbineColor = level >= 5 ? '#E4D7FF' : '#B7E8FF';
    for (const name of ['MagneticTurbineLeft', 'MagneticTurbineRight', 'MagneticPipeLeft', 'MagneticPipeRight']) {
      const part = root.getChildByName(name);
      if (part) this.applyMaterial(part, this.getMaterial(`magnetic-${level}`, this.factoryColorTexture, turbineColor));
    }

    for (const name of ['CompressionChamber', 'CompressionHopper', 'SingularityFrame', 'SingularityHopperLeft', 'SingularityHopperRight']) {
      const part = root.getChildByName(name);
      if (part) this.applyMaterial(part, this.getMaterial(`compression-${level}`, this.factoryColorTexture, '#FFB703'));
    }

    for (const name of ['GravityWingLeft', 'GravityWingRight', 'GravityPipeLeft', 'GravityPipeRight']) {
      const part = root.getChildByName(name);
      if (part) this.applyMaterial(part, this.getMaterial(`gravity-${level}`, this.factoryColorTexture, '#BFA6FF'));
    }
  }

  private applyMaterial(root: Node, material: Material): void {
    const visit = (node: Node): void => {
      const renderer = node.getComponent(MeshRenderer);
      if (renderer) {
        // Imported GLB meshes can expose multiple sub-mesh material slots.
        // Replacing only slot 0 left the remaining source slots unresolved in
        // a Web Mobile build, which is why portions of LV1 rendered magenta.
        // Apply the same audited material to every real sub-mesh; the model
        // geometry itself remains the Creator-saved imported asset.
        // `sharedMaterials` is initially empty for some Creator-imported glTF
        // renderers even when their mesh has several primitives. In that case
        // slot 0 alone leaves every other primitive on Creator's magenta
        // missing-material fallback. The mesh primitive count is the actual
        // material-slot contract, so cover both sources.
        const primitiveCount = renderer.mesh?.struct.primitives.length || 0;
        const slotCount = Math.max(1, renderer.sharedMaterials.length, primitiveCount);
        // `setMaterial` creates the renderer-local runtime binding required by
        // imported glTF sub-models. `setSharedMaterial` only changed the
        // component array here; the already-created Web Mobile sub-model kept
        // rendering its unresolved source material.
        for (let slot = 0; slot < slotCount; slot++) renderer.setMaterial(material, slot);
      }
      node.children.forEach(visit);
    };
    visit(root);
  }

  private getMaterial(key: string, texture: Texture2D | null, hex: string): Material {
    const cached = this.materialCache.get(key);
    if (cached) return cached;

    const material = new Material();
    material.initialize({
      effectName: 'builtin-unlit',
      // Semantic source colour is controlled by the audited texture/palette,
      // not by arbitrary imported vertex tint data.
      defines: { USE_TEXTURE: Boolean(texture), USE_VERTEX_COLOR: false },
    });
    if (texture) material.setProperty('mainTexture', texture);
    const color = new Color();
    Color.fromHEX(color, hex);
    material.setProperty('mainColor', color);
    this.materialCache.set(key, material);
    return material;
  }
}
