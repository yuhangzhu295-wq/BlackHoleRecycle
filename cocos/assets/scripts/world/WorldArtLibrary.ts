/**
 * 由 Cocos Creator 保存的 glTF 世界资产库。
 *
 * 每个模板节点都来自已审计的 Kenney glTF 子预制体，并由编辑器扩展写入
 * Game.scene。运行时只实例化这些真实模板，绝不为正式世界回退到基础几何体。
 */
import { _decorator, Color, Component, instantiate, Material, MeshRenderer, Node, Texture2D, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

export type WorldArtKind =
  | 'roadStraight'
  | 'roadCrossroad'
  | 'terrainTile'
  | 'buildingB'
  | 'buildingC'
  | 'treeSmall'
  | 'treeLarge'
  | 'pathStones'
  | 'fence'
  | 'commercialBuildingA'
  | 'commercialBuildingD'
  | 'streetLight'
  | 'constructionCone'
  | 'garbageTruck'
  | 'sedan'
  | 'deliveryVan'
  | 'recyclingBox'
  | 'tire'
  | 'recyclingBolt'
  | 'turbineWheel'
  | 'sodaCan'
  | 'waterBottle'
  | 'battery'
  | 'toyDuck'
  | 'apple'
  | 'paperScrap'
  | 'bookStack'
  | 'cardboardBox'
  | 'trashBag'
  | 'paintBucket'
  | 'chair'
  | 'coffeeTable'
  | 'monitor'
  | 'shelf'
  | 'crate'
  | 'sofa'
  | 'shippingContainer';

const WORLD_ART_COLORS: Record<WorldArtKind, string> = {
  roadStraight: '#9ca8bc',
  roadCrossroad: '#9ca8bc',
  terrainTile: '#92db7f',
  buildingB: '#ffd18d',
  buildingC: '#9ed6ff',
  treeSmall: '#69bf71',
  treeLarge: '#54a962',
  pathStones: '#f1d5a4',
  fence: '#f2ae4d',
  commercialBuildingA: '#f7b267',
  commercialBuildingD: '#ff8f70',
  streetLight: '#fef3c7',
  constructionCone: '#ff7a00',
  garbageTruck: '#2b7fff',
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

@ccclass('WorldArtLibrary')
export class WorldArtLibrary extends Component {
  private readonly materialCache: Map<WorldArtKind, Material> = new Map();
  @property(Node)
  public roadStraightTemplate: Node | null = null;

  @property(Node)
  public roadCrossroadTemplate: Node | null = null;

  @property(Node)
  public terrainTileTemplate: Node | null = null;

  @property(Node)
  public buildingBTemplate: Node | null = null;

  @property(Node)
  public buildingCTemplate: Node | null = null;

  @property(Node)
  public treeSmallTemplate: Node | null = null;

  @property(Node)
  public treeLargeTemplate: Node | null = null;

  @property(Node)
  public pathStonesTemplate: Node | null = null;

  @property(Node)
  public fenceTemplate: Node | null = null;

  @property(Node)
  public commercialBuildingATemplate: Node | null = null;

  @property(Node)
  public commercialBuildingDTemplate: Node | null = null;

  @property(Node)
  public streetLightTemplate: Node | null = null;

  @property(Node)
  public constructionConeTemplate: Node | null = null;

  @property(Node)
  public garbageTruckTemplate: Node | null = null;

  @property(Node)
  public sedanTemplate: Node | null = null;

  @property(Node)
  public deliveryVanTemplate: Node | null = null;

  @property(Node)
  public recyclingBoxTemplate: Node | null = null;

  @property(Node)
  public tireTemplate: Node | null = null;

  @property(Node)
  public recyclingBoltTemplate: Node | null = null;

  @property(Node)
  public turbineWheelTemplate: Node | null = null;

  /** Normalized, editor-saved object templates. They are real audited meshes,
   * not generated primitives or semantic stand-ins. */
  @property(Node) public sodaCanTemplate: Node | null = null;
  @property(Node) public waterBottleTemplate: Node | null = null;
  @property(Node) public batteryTemplate: Node | null = null;
  @property(Node) public toyDuckTemplate: Node | null = null;
  @property(Node) public appleTemplate: Node | null = null;
  @property(Node) public paperScrapTemplate: Node | null = null;
  @property(Node) public bookStackTemplate: Node | null = null;
  @property(Node) public cardboardBoxTemplate: Node | null = null;
  @property(Node) public trashBagTemplate: Node | null = null;
  @property(Node) public paintBucketTemplate: Node | null = null;
  @property(Node) public chairTemplate: Node | null = null;
  @property(Node) public coffeeTableTemplate: Node | null = null;
  @property(Node) public monitorTemplate: Node | null = null;
  @property(Node) public shelfTemplate: Node | null = null;
  @property(Node) public crateTemplate: Node | null = null;
  @property(Node) public sofaTemplate: Node | null = null;
  @property(Node) public shippingContainerTemplate: Node | null = null;

  /**
   * Creator-imported external color maps. These are intentionally ordinary PNG
   * assets instead of the glTF embedded-image subassets: the latter cannot be
   * safely serialized into the editable world library by Creator 3.8.3.
   */
  @property(Texture2D)
  public roadColorTexture: Texture2D | null = null;

  @property(Texture2D)
  public suburbanColorTexture: Texture2D | null = null;

  @property(Texture2D)
  public commercialColorTexture: Texture2D | null = null;

  @property(Texture2D)
  public vehicleColorTexture: Texture2D | null = null;

  public getTemplate(kind: WorldArtKind): Node {
    const template = this.getTemplateOrNull(kind);
    if (!template || !template.isValid) {
      throw new Error(`[WorldArtLibrary] Missing editor-saved ${kind} template.`);
    }
    return template;
  }

  public getTemplateOrNull(kind: WorldArtKind): Node | null {
    switch (kind) {
      case 'roadStraight': return this.roadStraightTemplate;
      case 'roadCrossroad': return this.roadCrossroadTemplate;
      case 'terrainTile': return this.terrainTileTemplate;
      case 'buildingB': return this.buildingBTemplate;
      case 'buildingC': return this.buildingCTemplate;
      case 'treeSmall': return this.treeSmallTemplate;
      case 'treeLarge': return this.treeLargeTemplate;
      case 'pathStones': return this.pathStonesTemplate;
      case 'fence': return this.fenceTemplate;
      case 'commercialBuildingA': return this.commercialBuildingATemplate;
      case 'commercialBuildingD': return this.commercialBuildingDTemplate;
      case 'streetLight': return this.streetLightTemplate;
      case 'constructionCone': return this.constructionConeTemplate;
      case 'garbageTruck': return this.garbageTruckTemplate;
      case 'sedan': return this.sedanTemplate;
      case 'deliveryVan': return this.deliveryVanTemplate;
      case 'recyclingBox': return this.recyclingBoxTemplate;
      case 'tire': return this.tireTemplate;
      case 'recyclingBolt': return this.recyclingBoltTemplate;
      case 'turbineWheel': return this.turbineWheelTemplate;
      case 'sodaCan': return this.sodaCanTemplate;
      case 'waterBottle': return this.waterBottleTemplate;
      case 'battery': return this.batteryTemplate;
      case 'toyDuck': return this.toyDuckTemplate;
      case 'apple': return this.appleTemplate;
      case 'paperScrap': return this.paperScrapTemplate;
      case 'bookStack': return this.bookStackTemplate;
      case 'cardboardBox': return this.cardboardBoxTemplate;
      case 'trashBag': return this.trashBagTemplate;
      case 'paintBucket': return this.paintBucketTemplate;
      case 'chair': return this.chairTemplate;
      case 'coffeeTable': return this.coffeeTableTemplate;
      case 'monitor': return this.monitorTemplate;
      case 'shelf': return this.shelfTemplate;
      case 'crate': return this.crateTemplate;
      case 'sofa': return this.sofaTemplate;
      case 'shippingContainer': return this.shippingContainerTemplate;
    }
  }

  public spawn(
    kind: WorldArtKind,
    parent: Node,
    position: Readonly<Vec3>,
    scale: Readonly<Vec3>,
    yawDegrees: number = 0,
    name: string = kind
  ): Node {
    const visual = instantiate(this.getTemplate(kind));
    visual.name = name;
    parent.addChild(visual);
    visual.active = true;
    visual.setPosition(position);
    visual.setScale(scale);
    visual.setRotationFromEuler(0, yawDegrees, 0);
    this.applyRuntimeMaterial(kind, visual);
    return visual;
  }

  /**
   * glTF mesh references are saved by Creator in the library prefab. Cocos
   * 3.8.3 does not persist a generated built-in Material safely in a nested
   * prefab, so it is created with the native runtime API just before display.
   */
  private applyRuntimeMaterial(kind: WorldArtKind, visual: Node): void {
    const material = this.getRuntimeMaterial(kind);
    const applyToNode = (node: Node): void => {
      const renderer = node.getComponent(MeshRenderer);
      if (renderer) renderer.setMaterial(material, 0);
      node.children.forEach(applyToNode);
    };
    applyToNode(visual);
  }

  private getRuntimeMaterial(kind: WorldArtKind): Material {
    const cached = this.materialCache.get(kind);
    if (cached) return cached;

    const material = new Material();
    const texture = this.getColorTexture(kind);
    // `builtin-unlit` defaults USE_TEXTURE to false even if a texture property
    // is later assigned. Initialize the native effect with the macro enabled
    // so the imported UVs sample the Creator-owned external colour map.
    material.initialize({
      effectName: 'builtin-unlit',
      defines: texture ? { USE_TEXTURE: true } : undefined
    });
    if (texture) {
      // Preserve the authored Kenney UV colour map and use the audited art
      // palette as a mobile-readable tint. This prevents large white areas in
      // the atlas from flattening grass, buildings and vehicle silhouettes.
      material.setProperty('mainTexture', texture);
      const color = new Color();
      Color.fromHEX(color, WORLD_ART_COLORS[kind]);
      material.setProperty('mainColor', color);
    } else {
      // A deterministic colour is retained solely as a development-time
      // safeguard while assets are importing; production validation requires
      // all four external colour maps to be available.
      const color = new Color();
      Color.fromHEX(color, WORLD_ART_COLORS[kind]);
      material.setProperty('mainColor', color);
    }
    this.materialCache.set(kind, material);
    return material;
  }

  private getColorTexture(kind: WorldArtKind): Texture2D | null {
    switch (kind) {
      case 'roadStraight':
      case 'roadCrossroad':
      case 'terrainTile':
      case 'streetLight':
      case 'constructionCone':
        return this.roadColorTexture;
      case 'buildingB':
      case 'buildingC':
      case 'treeSmall':
      case 'treeLarge':
      case 'pathStones':
      case 'fence':
        return this.suburbanColorTexture;
      case 'commercialBuildingA':
      case 'commercialBuildingD':
        return this.commercialColorTexture;
      case 'garbageTruck':
      case 'sedan':
      case 'deliveryVan':
      case 'recyclingBox':
      case 'tire':
      case 'recyclingBolt':
      case 'turbineWheel':
        return this.vehicleColorTexture;
      default:
        // New audited prop models retain a consistent readable tint without
        // sampling an unrelated city/vehicle atlas.
        return null;
    }
  }

  public validateTemplates(): void {
    const required: WorldArtKind[] = [
      'roadStraight', 'roadCrossroad', 'terrainTile', 'buildingB', 'buildingC',
      'treeSmall', 'treeLarge', 'pathStones', 'fence', 'commercialBuildingA',
      'commercialBuildingD', 'streetLight', 'constructionCone', 'garbageTruck',
      'sedan', 'deliveryVan', 'recyclingBox', 'tire', 'recyclingBolt', 'turbineWheel',
      'sodaCan', 'waterBottle', 'battery', 'toyDuck', 'apple', 'paperScrap',
      'bookStack', 'cardboardBox', 'trashBag', 'paintBucket', 'chair', 'coffeeTable',
      'monitor', 'shelf', 'crate', 'sofa', 'shippingContainer',
    ];
    required.forEach((kind) => this.getTemplate(kind));
    if (!this.roadColorTexture || !this.suburbanColorTexture || !this.commercialColorTexture || !this.vehicleColorTexture) {
      throw new Error('[WorldArtLibrary] Missing one or more Creator-imported external colour maps.');
    }
  }
}
