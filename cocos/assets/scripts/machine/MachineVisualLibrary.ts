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
    visual.active = false;
    this.applyAuditedMaterials(visual, level);
    return visual;
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
    if (chassis) this.applyMaterial(chassis, this.getMaterial('chassis', this.bulldozerColorTexture, '#FFFFFF'));

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
      if (renderer) renderer.setMaterial(material, 0);
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
      defines: texture ? { USE_TEXTURE: true } : undefined,
    });
    if (texture) material.setProperty('mainTexture', texture);
    const color = new Color();
    Color.fromHEX(color, hex);
    material.setProperty('mainColor', color);
    this.materialCache.set(key, material);
    return material;
  }
}
