/**
 * 3D 几何体与材质快速构建工厂(MeshFactory.ts)
 *
 * V7 PHASE 2B: this is now the DEGRADED FALLBACK path only. The production
 * singularity is the authored `game_art/blackhole/SingularityVortex.glb`; the
 * cylinder/torus primitives below are built only when that asset cannot be
 * loaded, so a missing asset degrades instead of leaving the player invisible.
 * Nothing in the normal startup path calls into this factory.
 *
 * The material effect comes from the shared `RENDER_EFFECT` (builtin-unlit), not
 * builtin-standard: the unlit path is the tested mobile-safe one.
 */
import {
  Node,
  MeshRenderer,
  utils,
  primitives,
  Material,
  Mesh,
  Color
} from 'cc';
import { RENDER_DEFINES, RENDER_EFFECT } from './RenderProfile';

export class MeshFactory {
  private static meshCache: Map<string, Mesh> = new Map();
  private static materialCache: Map<string, Material> = new Map();

  /**
   * 获取或创建基础几何体网格
   */
  public static getCylinderMesh(radiusTop: number = 0.5, radiusBottom: number = 0.5, height: number = 1, segments: number = 24): Mesh {
    const key = `cyl_${radiusTop}_${radiusBottom}_${height}_${segments}`;
    if (!this.meshCache.has(key)) {
      const mesh = utils.createMesh(primitives.cylinder(radiusTop, radiusBottom, height, { radialSegments: segments }));
      this.meshCache.set(key, mesh);
    }
    return this.meshCache.get(key)!;
  }

  public static getTorusMesh(radius: number = 1, tube: number = 0.15, radialSegments: number = 64): Mesh {
    const key = `torus_${radius}_${tube}_${radialSegments}`;
    if (!this.meshCache.has(key)) {
      const mesh = utils.createMesh(primitives.torus(radius, tube, { radialSegments, tubularSegments: 16 }));
      this.meshCache.set(key, mesh);
    }
    return this.meshCache.get(key)!;
  }

  /**
   * 创建并缓存一个标准材质，根据传入的颜色、粗糙度、金属度进行设置。
   */
  public static getMaterial(hexColor: string, roughness: number = 0.6, metallic: number = 0.1): Material {
    const key = `${hexColor}_${roughness}_${metallic}`;
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key)!;
    }

    const mat = new Material();
    // Runtime-created core meshes have neither a texture nor vertex colours.
    // Declare both native effect macros explicitly, matching the proven
    // Web-Mobile world material contract. Leaving the imported defaults in
    // place lets some generated core meshes select an unresolved variant and
    // render as the engine's magenta fallback despite a valid `mainColor`.
    mat.initialize({
      effectName: RENDER_EFFECT,
      defines: { ...RENDER_DEFINES },
    });
    
    const color = new Color();
    Color.fromHEX(color, hexColor);
    mat.setProperty('mainColor', color);
    
    this.materialCache.set(key, mat);
    return mat;
  }

  /**
   * 快速为 Node 添加指定几何形状与材质的 MeshRenderer。
   */
  public static attachMesh(
    node: Node,
    mesh: Mesh,
    hexColor: string,
    roughness: number = 0.6,
    metallic: number = 0.1
  ): MeshRenderer {
    let mr = node.getComponent(MeshRenderer);
    if (!mr) {
      mr = node.addComponent(MeshRenderer);
    }
    mr.mesh = mesh;
    mr.setMaterial(this.getMaterial(hexColor, roughness, metallic), 0);
    return mr;
  }
}
