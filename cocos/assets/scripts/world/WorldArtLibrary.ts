/**
 * 由 Cocos Creator 保存的 glTF 世界资产库。
 *
 * 每个模板节点都来自已审计的 Kenney glTF 子预制体，并由编辑器扩展写入
 * Game.scene。运行时只实例化这些真实模板，绝不为正式世界回退到基础几何体。
 */
import { _decorator, Color, Component, instantiate, Material, MeshRenderer, Node, Texture2D, Vec3 } from 'cc';
import { RENDER_DEFINES, RENDER_EFFECT, WORLD_PALETTE } from '../core/RenderProfile';

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
  | 'parkFountain'
  | 'parkBench'
  | 'parkBush'
  | 'parkHedgeLong'
  | 'parkHedgeCorner'
  | 'parkLantern'
  | 'parkTrashcan'
  | 'parkFlowerA'
  | 'parkFlowerB'
  | 'parkGrassTile'
  | 'parkCobblePath'
  | 'parkTree'
  | 'parkTreeLarge'
  | 'commercialBuildingA'
  | 'commercialBuildingD'
  | 'commercialBuildingF'
  | 'commercialBuildingG'
  | 'commercialBuildingH'
  | 'commercialSkyscraperA'
  | 'commercialSkyscraperB'
  | 'streetLight'
  | 'constructionCone'
  | 'bulldozer'
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

  /** CC0 Tiny Treats park-set templates; Creator saves their imported meshes. */
  @property(Node) public parkFountainTemplate: Node | null = null;
  @property(Node) public parkBenchTemplate: Node | null = null;
  @property(Node) public parkBushTemplate: Node | null = null;
  @property(Node) public parkHedgeLongTemplate: Node | null = null;
  @property(Node) public parkHedgeCornerTemplate: Node | null = null;
  @property(Node) public parkLanternTemplate: Node | null = null;
  @property(Node) public parkTrashcanTemplate: Node | null = null;
  @property(Node) public parkFlowerATemplate: Node | null = null;
  @property(Node) public parkFlowerBTemplate: Node | null = null;
  @property(Node) public parkGrassTileTemplate: Node | null = null;
  @property(Node) public parkCobblePathTemplate: Node | null = null;
  @property(Node) public parkTreeTemplate: Node | null = null;
  @property(Node) public parkTreeLargeTemplate: Node | null = null;

  @property(Node)
  public commercialBuildingATemplate: Node | null = null;

  @property(Node)
  public commercialBuildingDTemplate: Node | null = null;

  @property(Node)
  public commercialBuildingFTemplate: Node | null = null;

  @property(Node)
  public commercialBuildingGTemplate: Node | null = null;

  @property(Node)
  public commercialBuildingHTemplate: Node | null = null;

  @property(Node)
  public commercialSkyscraperATemplate: Node | null = null;

  @property(Node)
  public commercialSkyscraperBTemplate: Node | null = null;

  @property(Node)
  public streetLightTemplate: Node | null = null;

  @property(Node)
  public constructionConeTemplate: Node | null = null;

  /** CC-BY source with attribution recorded in docs/third-party-attributions.md. */
  @property(Node)
  public bulldozerTemplate: Node | null = null;

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

  /** Authored CC0 Tiny Treats colour atlas for the detailed public-park set. */
  @property(Texture2D)
  public prettyParkColorTexture: Texture2D | null = null;

  /** Authored colour map from the audited tracked player chassis. */
  @property(Texture2D)
  public bulldozerColorTexture: Texture2D | null = null;

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
      case 'parkFountain': return this.parkFountainTemplate;
      case 'parkBench': return this.parkBenchTemplate;
      case 'parkBush': return this.parkBushTemplate;
      case 'parkHedgeLong': return this.parkHedgeLongTemplate;
      case 'parkHedgeCorner': return this.parkHedgeCornerTemplate;
      case 'parkLantern': return this.parkLanternTemplate;
      case 'parkTrashcan': return this.parkTrashcanTemplate;
      case 'parkFlowerA': return this.parkFlowerATemplate;
      case 'parkFlowerB': return this.parkFlowerBTemplate;
      case 'parkGrassTile': return this.parkGrassTileTemplate;
      case 'parkCobblePath': return this.parkCobblePathTemplate;
      case 'parkTree': return this.parkTreeTemplate;
      case 'parkTreeLarge': return this.parkTreeLargeTemplate;
      case 'commercialBuildingA': return this.commercialBuildingATemplate;
      case 'commercialBuildingD': return this.commercialBuildingDTemplate;
      case 'commercialBuildingF': return this.commercialBuildingFTemplate;
      case 'commercialBuildingG': return this.commercialBuildingGTemplate;
      case 'commercialBuildingH': return this.commercialBuildingHTemplate;
      case 'commercialSkyscraperA': return this.commercialSkyscraperATemplate;
      case 'commercialSkyscraperB': return this.commercialSkyscraperBTemplate;
      case 'streetLight': return this.streetLightTemplate;
      case 'constructionCone': return this.constructionConeTemplate;
      case 'bulldozer': return this.bulldozerTemplate;
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
    this.applyMaterial(kind, visual, this.getRuntimeMaterial(kind));
  }

  /**
   * An arena competitor needs an isolated material so its livery cannot alter
   * the shared cached material used by city props or another bot. Geometry and
   * imported texture remain exactly the same Creator-owned source asset.
   */
  public applyTintedMaterial(kind: WorldArtKind, visual: Node, tintHex: string): void {
    const tint = new Color();
    Color.fromHEX(tint, tintHex);
    this.applyMaterial(kind, visual, this.createRuntimeMaterial(kind, tint));
  }

  /**
   * GoldenCityCell owns its static placement in Creator, but its imported
   * template renderers have no serializable material slots. Hydrate only the
   * instantiated cell's authored visual groups before it becomes visible.
   */
  public hydrateAuthoredOpeningMaterials(cell: Node): void {
    // One material per *group node* was the previous contract, and it painted
    // every descendant with that single group kind. Because applyMaterial
    // recurses the whole subtree, the opening park fountain received the
    // vehicle colour atlas as its mainTexture; its UVs sample a near-black
    // region of that atlas, so the fountain rendered as a large black mass at
    // the bottom centre of the frame. Measured: hiding
    // Props/POI_ParkFountain removed 8812 of 8812 near-black pixels from the
    // lower-centre band, and recolouring its mainColor left the black region
    // byte-identical, which proves the black is sampled from the texture.
    //
    // Bind by *renderer name* instead. Names are the stable, audited identity
    // of each imported mesh (the same names ObjectArtRegistry already binds
    // by), so a mixed subtree such as Props resolves each prop to its own
    // authored atlas and palette entry. Unknown renderers fall back to their
    // nearest group kind so a future authored mesh is never left unbound.
    const groupFallbacks: ReadonlyArray<readonly [string, WorldArtKind]> = [
      ['Ground', 'terrainTile'],
      ['Roads', 'roadStraight'],
      ['Buildings', 'commercialBuildingA'],
      ['Park', 'treeSmall'],
      ['Props', 'recyclingBox'],
      ['TrafficRoutes', 'sedan'],
    ];
    for (const [name, kind] of groupFallbacks) {
      const group = cell.getChildByName(name);
      if (group) this.applyRuntimeMaterialByRendererName(group, kind);
    }
  }

  /**
   * The construction landmark is loaded as a separate Creator resource after
   * the opening cell exists, so it does not participate in the cell's initial
   * hydration. Its imported specular-glossiness materials render magenta in
   * Web Mobile unless each renderer receives a runtime-safe material instance.
   */
  public hydrateConstructionLandmarkMaterials(landmark: Node): void {
    // Same renderer-name rule as the opening cell. The landmark's own groups
    // keep their explicit kinds.
    const road = landmark.getChildByName('Roads');
    if (road) this.applyRuntimeMaterialByRendererName(road, 'roadStraight');
    const site = landmark.getChildByName('HouseConstructionSite');
    if (site) this.applyRuntimeMaterialByRendererName(site, 'commercialBuildingA');
  }

  /**
   * Imported mesh names are the audited identity of an authored prop. This
   * table maps a renderer node name to the WorldArtKind whose palette entry and
   * colour atlas that mesh was authored against, so a mixed group such as
   * Props no longer receives one shared material.
   *
   * Only names that are unambiguous across the whole authored kit are listed.
   * Anything else keeps its group fallback, so adding a new authored mesh can
   * never leave a renderer unbound.
   */
  private static readonly RENDERER_NAME_KINDS: Readonly<Record<string, WorldArtKind>> = {
    'tile-low': 'terrainTile',
    'road-straight': 'roadStraight',
    'road-crossroad-path': 'roadCrossroad',
    'building-type-b': 'buildingB',
    'building-type-c': 'buildingC',
    'building-a': 'commercialBuildingA',
    'building-d': 'commercialBuildingD',
    'building-f': 'commercialBuildingF',
    'building-g': 'commercialBuildingG',
    'building-h': 'commercialBuildingH',
    'building-skyscraper-a': 'commercialSkyscraperA',
    'building-skyscraper-b': 'commercialSkyscraperB',
    'tree-small': 'treeSmall',
    'tree-large': 'treeLarge',
    'tree': 'parkTree',
    'tree_large': 'parkTreeLarge',
    'bush_large': 'parkBush',
    'flower_A': 'parkFlowerA',
    'flower_B': 'parkFlowerB',
    'hedge_straight_long': 'parkHedgeLong',
    'hedge_corner': 'parkHedgeCorner',
    'floor_grass_sliced_base': 'parkGrassTile',
    'cobble_stones_large': 'parkCobblePath',
    'fountain': 'parkFountain',
    'bench': 'parkBench',
    'trashcan': 'parkTrashcan',
    'street_lantern': 'parkLantern',
    'light-square': 'streetLight',
    'construction-cone': 'constructionCone',
    'path-stones-long': 'pathStones',
    'fence': 'fence',
    'box': 'recyclingBox',
    'arm': 'garbageTruck',
    'body': 'sedan',
    'door': 'deliveryVan',
  };

  /**
   * Assign a runtime-safe material to every renderer in a subtree, choosing the
   * kind from the renderer's own node name and falling back to the group kind.
   * The material cache is reused, so renderers that share a kind still share a
   * single material instance.
   */
  private applyRuntimeMaterialByRendererName(root: Node, fallbackKind: WorldArtKind): void {
    const visit = (node: Node): void => {
      const renderer = node.getComponent(MeshRenderer);
      if (renderer) {
        const kind = WorldArtLibrary.RENDERER_NAME_KINDS[node.name] || fallbackKind;
        this.applyMaterialToRenderer(renderer, this.getRuntimeMaterial(kind));
      }
      node.children.forEach(visit);
    };
    visit(root);
  }

  /**
   * Bind one material across every real sub-mesh slot. Imported GLB meshes can
   * expose several primitives while their shared material array is still empty,
   * and the primitive count is the actual material-slot contract.
   */
  private applyMaterialToRenderer(renderer: MeshRenderer, material: Material): void {
    const primitiveCount = renderer.mesh?.struct.primitives.length || 0;
    const slotCount = Math.max(1, renderer.sharedMaterials.length, primitiveCount);
    for (let slot = 0; slot < slotCount; slot++) renderer.setMaterial(material, slot);
  }

  private applyMaterial(kind: WorldArtKind, visual: Node, material: Material): void {
    const applyToNode = (node: Node): void => {
      const renderer = node.getComponent(MeshRenderer);
      if (renderer) {
        // Multi-material GLB meshes must receive the runtime-safe material in
        // each sub-mesh slot. Leaving any original slot intact can surface as
        // the platform's missing-material magenta after Web Mobile packing.
        const primitiveCount = renderer.mesh?.struct.primitives.length || 0;
        const slotCount = Math.max(1, renderer.sharedMaterials.length, primitiveCount);
        // Runtime-created materials must be assigned as per-renderer instances.
        // Keeping them only in the shared slot leaves Web Mobile with a stale
        // native descriptor after instantiation, which renders as magenta.
        for (let slot = 0; slot < slotCount; slot++) renderer.setMaterial(material, slot);
      }
      node.children.forEach(applyToNode);
    };
    applyToNode(visual);
  }

  private getRuntimeMaterial(kind: WorldArtKind): Material {
    const cached = this.materialCache.get(kind);
    if (cached) return cached;

    const material = this.createRuntimeMaterial(kind);
    this.materialCache.set(kind, material);
    return material;
  }

  private createRuntimeMaterial(kind: WorldArtKind, tintOverride: Color | null = null): Material {
    const material = new Material();
    const texture = this.getColorTexture(kind);
    // `builtin-unlit` defaults USE_TEXTURE to false even if a texture property
    // is later assigned. Initialize the native effect with the macro enabled
    // so the imported UVs sample the Creator-owned external colour map.
    //
    // The effect and the two macros come from the shared V6 render profile.
    // `builtin-standard` is excluded by measurement: swapping the world
    // materials to it makes the entire 3D world disappear on this build, with
    // the engine raising Error 3804 and roughly a thousand localSetLayout
    // failures. The unlit path is the tested mobile-safe one.
    material.initialize({
      effectName: RENDER_EFFECT,
      defines: { ...RENDER_DEFINES, USE_TEXTURE: Boolean(texture) },
    });
    if (texture) {
      // Preserve the authored Kenney UV colour map and use the audited art
      // palette as a mobile-readable tint. This prevents large white areas in
      // the atlas from flattening grass, buildings and vehicle silhouettes.
      material.setProperty('mainTexture', texture);
      const color = tintOverride || new Color();
      if (!tintOverride) Color.fromHEX(color, WORLD_PALETTE[kind]);
      material.setProperty('mainColor', color);
    } else {
      // A deterministic colour is retained solely as a development-time
      // safeguard while assets are importing; production validation requires
      // all four external colour maps to be available.
      const color = tintOverride || new Color();
      if (!tintOverride) Color.fromHEX(color, WORLD_PALETTE[kind]);
      material.setProperty('mainColor', color);
    }
    return material;
  }

  private getColorTexture(kind: WorldArtKind): Texture2D | null {
    switch (kind) {
      case 'roadStraight':
      case 'roadCrossroad':
      case 'streetLight':
      case 'constructionCone':
        return this.roadColorTexture;
      case 'bulldozer':
        return this.bulldozerColorTexture;
      case 'buildingB':
      case 'buildingC':
      case 'treeSmall':
      case 'treeLarge':
      case 'pathStones':
      case 'fence':
        return this.suburbanColorTexture;
      case 'parkFountain':
      case 'parkBench':
      case 'parkBush':
      case 'parkHedgeLong':
      case 'parkHedgeCorner':
      case 'parkLantern':
      case 'parkTrashcan':
      case 'parkFlowerA':
      case 'parkFlowerB':
      case 'parkGrassTile':
      case 'parkCobblePath':
      case 'parkTree':
      case 'parkTreeLarge':
        return this.prettyParkColorTexture;
      case 'commercialBuildingA':
      case 'commercialBuildingD':
      case 'commercialBuildingF':
      case 'commercialBuildingG':
      case 'commercialBuildingH':
      case 'commercialSkyscraperA':
      case 'commercialSkyscraperB':
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
      'parkFountain', 'parkBench', 'parkBush', 'parkHedgeLong', 'parkHedgeCorner',
      'parkLantern', 'parkTrashcan', 'parkFlowerA', 'parkFlowerB', 'parkGrassTile', 'parkCobblePath',
      'parkTree', 'parkTreeLarge',
      'commercialBuildingD', 'commercialBuildingF', 'commercialBuildingG', 'commercialBuildingH',
      'commercialSkyscraperA', 'commercialSkyscraperB',
      'streetLight', 'constructionCone', 'bulldozer', 'garbageTruck',
      'sedan', 'deliveryVan', 'recyclingBox', 'tire', 'recyclingBolt', 'turbineWheel',
      'sodaCan', 'waterBottle', 'battery', 'toyDuck', 'apple', 'paperScrap',
      'bookStack', 'cardboardBox', 'trashBag', 'paintBucket', 'chair', 'coffeeTable',
      'monitor', 'shelf', 'crate', 'sofa', 'shippingContainer',
    ];
    required.forEach((kind) => this.getTemplate(kind));
    if (!this.roadColorTexture || !this.suburbanColorTexture || !this.commercialColorTexture || !this.vehicleColorTexture || !this.prettyParkColorTexture) {
      throw new Error('[WorldArtLibrary] Missing one or more Creator-imported external colour maps.');
    }
  }
}
