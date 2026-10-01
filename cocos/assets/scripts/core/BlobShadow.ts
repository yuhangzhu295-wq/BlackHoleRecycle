/**
 * Cheap contact shadows for the V6 "unlit plus" look.
 *
 * The project renders entirely through 'builtin-unlit' because switching the
 * world to 'builtin-standard' makes the whole 3D world disappear on this build
 * (Error 3804 plus about a thousand localSetLayout failures). Lighting therefore
 * contributes no image content, and without a lit pipeline every object reads as
 * floating above the ground.
 *
 * A blob shadow is the mobile-safe answer: one shared material, one shared mesh
 * and one shared texture, drawn flat on the ground under the few objects that
 * need grounding. No shadow map, no dynamic light, no post-processing, no
 * per-object material instance.
 *
 * The soft edge is a real 64x64 asset (resources/v6/blob-shadow.png): white in
 * the middle, alpha fading to zero at the rim. Three runtime-generated
 * alternatives were tried first and each failed for a different, recorded reason:
 *   1. `primitives.plane` is an XY quad facing +Z, so an unrotated shadow drew as
 *      a vertical card in front of the camera.
 *   2. A flat XZ quad with a flat colour drew as a hard-edged rectangle, because
 *      `builtin-unlit` selects blending by *technique*; the default technique 0
 *      is opaque and a USE_TRANSPARENCY define is not a thing.
 *   3. Baking the falloff into vertex colours did not work either: the pass used
 *      for the world ignores `a_color`, so the disc rendered flat white whatever
 *      colour the vertices carried, and a runtime ImageAsset texture did not bind.
 * A real imported texture on the transparent technique is the one path that
 * behaves, and it keeps the whole feature to one small asset.
 *
 * Deliberately NOT applied to small T1/T2 objects: the brief forbids a shadow per
 * small target, and hundreds of transparent quads would cost more than they add.
 */
import { Color, Material, Mesh, MeshRenderer, Node, resources, SpriteFrame, Texture2D, utils } from 'cc';
import { BLOB_SHADOW_PROFILE, RENDER_DEFINES, RENDER_EFFECT } from './RenderProfile';

export class BlobShadow {
  /** One quad mesh for every shadow in the scene. */
  private static quadMesh: Mesh | null = null;
  /** One material for every shadow in the scene. */
  private static material: Material | null = null;
  /** The shared soft-edge map, once loaded. */
  private static texture: Texture2D | null = null;
  /** Guards against kicking off more than one load. */
  private static loading = false;
  /** Hosts that asked for a shadow before the map finished loading. */
  private static pending: Array<{ host: Node; diameter: number }> = [];
  /** Last load outcome, for the render gate to read. */
  private static loadState = 'IDLE';

  /** Start loading the shared map. Idempotent; safe to call every frame. */
  public static warmup(): void {
    if (BlobShadow.texture || BlobShadow.loading) return;
    BlobShadow.loading = true;
    BlobShadow.loadState = 'LOADING';
    // A PNG is imported as an ImageAsset with a Texture2D sub-asset, and the
    // bundle registers them at different paths: the ImageAsset at the bare path
    // and the Texture2D at `<path>/texture`. Measured failure: loading the bare
    // path as a Texture2D reports "Bundle resources doesn't contain
    // v6/blob-shadow". Try the Texture2D sub-path first, then the bare path, then
    // the SpriteFrame, so an importer change cannot silently disable shadows.
    const attempts: Array<readonly [string, typeof Texture2D | typeof SpriteFrame]> = [
      [BLOB_SHADOW_PROFILE.textureSubPath, Texture2D],
      [BLOB_SHADOW_PROFILE.texturePath, Texture2D],
      [BLOB_SHADOW_PROFILE.texturePath, SpriteFrame],
    ];
    const tryNext = (index: number, lastError: unknown): void => {
      if (index >= attempts.length) {
        BlobShadow.loading = false;
        BlobShadow.loadState = 'FAILED:' + String((lastError as Error)?.message || lastError || 'no asset');
        console.warn('[BlobShadow] Contact-shadow map could not load; shadows stay off.', lastError);
        BlobShadow.pending = [];
        return;
      }
      const [assetPath, assetType] = attempts[index];
      resources.load(assetPath, assetType as never, (error: Error | null, asset: unknown) => {
        if (!error && asset) {
          if (asset instanceof Texture2D) { BlobShadow.finishLoad(asset); return; }
          const frame = asset as SpriteFrame;
          if (frame.texture instanceof Texture2D) { BlobShadow.finishLoad(frame.texture); return; }
        }
        tryNext(index + 1, error);
      });
    };
    tryNext(0, null);
  }

  /** Shared once-per-session completion path for either load route. */
  private static finishLoad(texture: Texture2D): void {
    BlobShadow.loading = false;
    BlobShadow.loadState = 'READY';
    BlobShadow.texture = texture;
    // The material is shared, so one assignment updates every shadow at once.
    BlobShadow.getMaterial().setProperty('mainTexture', texture);
    const queued = BlobShadow.pending;
    BlobShadow.pending = [];
    for (const request of queued) BlobShadow.attach(request.host, request.diameter);
  }

  private static getQuadMesh(): Mesh {
    if (BlobShadow.quadMesh) return BlobShadow.quadMesh;
    // A unit quad in the XZ plane facing +Y. `primitives.plane` would give an XY
    // quad facing +Z, which is why the first attempt drew a vertical card.
    const half = 0.5;
    BlobShadow.quadMesh = utils.createMesh({
      positions: [
        -half, 0, -half,
        half, 0, -half,
        half, 0, half,
        -half, 0, half,
      ],
      normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      uvs: [0, 1, 1, 1, 1, 0, 0, 0],
      // Wound so the face points up at the camera and is not culled.
      indices: [0, 2, 1, 0, 3, 2],
      minPos: { x: -half, y: 0, z: -half },
      maxPos: { x: half, y: 0, z: half },
    });
    return BlobShadow.quadMesh;
  }

  private static getMaterial(): Material {
    if (BlobShadow.material) return BlobShadow.material;
    const material = new Material();
    // `builtin-unlit` selects blending by *technique*: it declares
    // opaque(0) / transparent(1) / add(2) / alpha-blend(3), and the default is 0,
    // which ignores alpha entirely. Technique 1 is the transparent pass.
    // USE_TEXTURE samples the soft-edge map; USE_VERTEX_COLOR stays off because
    // this pass does not honour vertex colour.
    material.initialize({
      effectName: RENDER_EFFECT,
      technique: BLOB_SHADOW_PROFILE.technique,
      defines: { ...RENDER_DEFINES, USE_TEXTURE: true, USE_VERTEX_COLOR: false },
    });
    const colour = new Color();
    Color.fromHEX(colour, BLOB_SHADOW_PROFILE.color);
    colour.a = BLOB_SHADOW_PROFILE.alpha;
    material.setProperty('mainColor', colour);
    if (BlobShadow.texture) material.setProperty('mainTexture', BlobShadow.texture);
    BlobShadow.material = material;
    return material;
  }

  /**
   * Attach (or resize) a shadow under a node. Safe to call repeatedly: the child
   * is reused, so nothing accumulates across a pooling cycle. Returns null while
   * the shared map is still loading, and the request is replayed once it arrives.
   *
   * @param host      the object the shadow follows
   * @param diameter  footprint in metres; the shadow is an ellipse of this width
   */
  public static attach(host: Node, diameter: number): Node | null {
    if (!BlobShadow.texture) {
      BlobShadow.warmup();
      if (!BlobShadow.pending.some((request) => request.host === host)) {
        BlobShadow.pending.push({ host, diameter });
      }
      return null;
    }
    const existing = host.getChildByName(BLOB_SHADOW_PROFILE.nodeName);
    const shadow = existing || new Node(BLOB_SHADOW_PROFILE.nodeName);
    if (!existing) {
      const renderer = shadow.addComponent(MeshRenderer);
      renderer.mesh = BlobShadow.getQuadMesh();
      renderer.setMaterial(BlobShadow.getMaterial(), 0);
      shadow.setPosition(0, BLOB_SHADOW_PROFILE.groundOffset, 0);
      // The mesh is already flat in XZ, so no rotation is needed or wanted.
      shadow.setRotationFromEuler(0, 0, 0);
      host.addChild(shadow);
    }
    const scale = Math.max(0.1, diameter);
    // X is the footprint width and Z its depth; the ellipse ratio makes it read
    // as a contact patch rather than a flat disc.
    shadow.setScale(scale, 1, scale * BLOB_SHADOW_PROFILE.ellipse);
    return shadow;
  }

  /** Remove a shadow when its host is recycled into a pool. */
  public static detach(host: Node): void {
    BlobShadow.pending = BlobShadow.pending.filter((request) => request.host !== host);
    const shadow = host.getChildByName(BLOB_SHADOW_PROFILE.nodeName);
    if (shadow?.isValid) shadow.destroy();
  }

  /** Read-only evidence for the render gate. */
  public static describe(host: Node): Record<string, unknown> | null {
    const shadow = host.getChildByName(BLOB_SHADOW_PROFILE.nodeName);
    if (!shadow) return null;
    const renderer = shadow.getComponent(MeshRenderer);
    const material = renderer?.getRenderMaterial(0);
    const raw = material?.getProperty('mainColor');
    const colour = raw instanceof Color ? raw : null;
    return {
      node: shadow.name,
      active: shadow.activeInHierarchy,
      scale: { x: shadow.scale.x, y: shadow.scale.y, z: shadow.scale.z },
      materialValid: material?.validate() || false,
      effect: material?.effectName || null,
      textureBound: Boolean(material?.getProperty('mainTexture')),
      color: colour ? { r: colour.r, g: colour.g, b: colour.b, a: colour.a } : null,
    };
  }

  /** Test hook: drop the shared cache so a fresh scene builds new resources. */
  public static reset(): void {
    BlobShadow.quadMesh = null;
    BlobShadow.material = null;
    BlobShadow.texture = null;
    BlobShadow.loading = false;
    BlobShadow.pending = [];
  }

  /** Read-only load outcome, so the acceptance report can prove the map bound. */
  public static getLoadState(): Record<string, unknown> {
    return {
      state: BlobShadow.loadState,
      textureBound: Boolean(BlobShadow.texture),
      pendingHosts: BlobShadow.pending.length,
    };
  }
}
