/**
 * 由 Cocos Creator 保存的 glTF 世界资产库。
 *
 * 每个模板节点都来自已审计的 Kenney glTF 子预制体，并由编辑器扩展写入
 * Game.scene。运行时只实例化这些真实模板，绝不为正式世界回退到基础几何体。
 */
import { _decorator, Color, Component, instantiate, Material, MeshRenderer, Node, Vec3 } from 'cc';

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
  | 'fence';

const WORLD_ART_COLORS: Record<WorldArtKind, string> = {
  roadStraight: '#374151',
  roadCrossroad: '#374151',
  terrainTile: '#477141',
  buildingB: '#e6b670',
  buildingC: '#77b2d8',
  treeSmall: '#39834f',
  treeLarge: '#2a693e',
  pathStones: '#beab84',
  fence: '#e09839'
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
    material.initialize({ effectName: 'builtin-unlit' });
    const color = new Color();
    Color.fromHEX(color, WORLD_ART_COLORS[kind]);
    material.setProperty('mainColor', color);
    this.materialCache.set(kind, material);
    return material;
  }

  public validateTemplates(): void {
    const required: WorldArtKind[] = [
      'roadStraight', 'roadCrossroad', 'terrainTile', 'buildingB', 'buildingC',
      'treeSmall', 'treeLarge', 'pathStones', 'fence'
    ];
    required.forEach((kind) => this.getTemplate(kind));
  }
}
