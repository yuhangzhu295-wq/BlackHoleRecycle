/**
 * 3D 几何体与材质快速构建工具 (MeshFactory.ts)
 * 基于 Cocos Creator 3.8.x 原生 primitives 与 builtin-standard 材质
 */
import {
  Node,
  MeshRenderer,
  utils,
  primitives,
  Material,
  Mesh,
  director,
  Director,
  resources
} from 'cc';

export class MeshFactory {
  private static meshCache: Map<string, Mesh> = new Map();
  private static runtimeMaterial: Material | null = null;
  private static isMaterialLoadStarted: boolean = false;
  private static pendingMaterialBindings: MeshRenderer[] = [];

  /**
   * 获取或创建基础几何体网格
   */
  public static getBoxMesh(width: number = 1, height: number = 1, length: number = 1): Mesh {
    const key = `box_${width}_${height}_${length}`;
    if (!this.meshCache.has(key)) {
      const mesh = utils.createMesh(primitives.box({ width, height, length }));
      this.meshCache.set(key, mesh);
    }
    return this.meshCache.get(key)!;
  }

  public static getCylinderMesh(radiusTop: number = 0.5, radiusBottom: number = 0.5, height: number = 1, segments: number = 24): Mesh {
    const key = `cyl_${radiusTop}_${radiusBottom}_${height}_${segments}`;
    if (!this.meshCache.has(key)) {
      const mesh = utils.createMesh(primitives.cylinder(radiusTop, radiusBottom, height, { radialSegments: segments }));
      this.meshCache.set(key, mesh);
    }
    return this.meshCache.get(key)!;
  }

  public static getSphereMesh(radius: number = 0.5, segments: number = 20): Mesh {
    const key = `sphere_${radius}_${segments}`;
    if (!this.meshCache.has(key)) {
      const mesh = utils.createMesh(primitives.sphere(radius, { segments }));
      this.meshCache.set(key, mesh);
    }
    return this.meshCache.get(key)!;
  }

  public static getPlaneMesh(width: number = 20, length: number = 40): Mesh {
    const key = `plane_${width}_${length}`;
    if (!this.meshCache.has(key)) {
      const mesh = utils.createMesh(primitives.plane({ width, length, widthSegments: 2, lengthSegments: 2 }));
      this.meshCache.set(key, mesh);
    }
    return this.meshCache.get(key)!;
  }

  public static getTorusMesh(radius: number = 1, tube: number = 0.15): Mesh {
    const key = `torus_${radius}_${tube}`;
    if (!this.meshCache.has(key)) {
      const mesh = utils.createMesh(primitives.torus(radius, tube, { radialSegments: 24, tubularSegments: 16 }));
      this.meshCache.set(key, mesh);
    }
    return this.meshCache.get(key)!;
  }

  public static getConeMesh(radius: number = 0.5, height: number = 1): Mesh {
    const key = `cone_${radius}_${height}`;
    if (!this.meshCache.has(key)) {
      const mesh = utils.createMesh(primitives.cone(radius, height, { radialSegments: 20 }));
      this.meshCache.set(key, mesh);
    }
    return this.meshCache.get(key)!;
  }

  /**
   * 快速为 Node 添加指定几何形状与项目内有效材质的 MeshRenderer。
   * 材质资产由 Cocos Creator 保存于 assets/resources/material.mtl。
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
    this.bindRuntimeMaterial(mr);
    return mr;
  }

  private static bindRuntimeMaterial(renderer: MeshRenderer): void {
    if (this.runtimeMaterial) {
      this.deferMaterialAssignment(renderer, this.runtimeMaterial);
      return;
    }

    this.pendingMaterialBindings.push(renderer);
    if (this.isMaterialLoadStarted) return;

    this.isMaterialLoadStarted = true;
    resources.load('material', Material, (error, material) => {
      if (error || !material) {
        console.error('[MeshFactory] Failed to load resources/material.mtl', error);
        this.pendingMaterialBindings = [];
        return;
      }

      this.runtimeMaterial = material;
      const pending = this.pendingMaterialBindings;
      this.pendingMaterialBindings = [];
      for (const pendingRenderer of pending) {
        this.deferMaterialAssignment(pendingRenderer, material);
      }
    });
  }

  private static deferMaterialAssignment(renderer: MeshRenderer, material: Material): void {
    director.once(Director.EVENT_AFTER_DRAW, () => {
      if (renderer.isValid) {
        renderer.setMaterial(material, 0);
      }
    });
  }
}
