/**
 * V7 PHASE 4 prefabs: the authored rim-energy ring and the authored suction
 * particle emitter.
 *
 * Both are real `cc.Prefab` assets inside the `game-art` bundle, referenced by
 * `ArtRegistry` art id and loaded non-blocking by `ArtLoader`. Nothing here
 * generates geometry at runtime.
 *
 * ## RimEnergy.prefab
 *
 * Two `cc.MeshRenderer` nodes over the authored `RimEnergyRing.glb` mesh
 * sub-assets, each bound to the authored additive `MAT_BLACKHOLE_RIM`. Shape and
 * PrefabInfo mirror what Creator's own glTF importer writes for
 * `SingularityVortex.glb` (the runtime-proven sample in this repository), so
 * this prefab deserialises exactly like the asset the game already loads.
 *
 * ## SuctionParticles.prefab
 *
 * A `cc.ParticleSystem` (CPU renderer) over the authored
 * `MAT_BLACKHOLE_PARTICLE`. The object graph is the engine's own
 * `default_prefab/effects/Particle System.prefab` shape, which is the
 * authoritative serialisation for this component, with the values changed:
 *
 *   - `_materials[0]`  = authored particle material (not Creator's internal one)
 *   - `_mainTexture`   = Default-Particle texture
 *   - `rateOverTime`   = 0. `BlackHoleMachine` drives it from the world's real
 *                        `suctionLoad`, so an idle singularity emits nothing at
 *                        all. This is the brief's "silent when nothing is being
 *                        sucked", and it is the asset's own default rather than
 *                        a runtime guess.
 *   - `startSpeed`     = -0.95. `ShapeModule`'s circle emitter writes an
 *                        *outward* radial unit vector and
 *                        `particle-system.ts` multiplies it by `startSpeed`
 *                        without clamping, so a negative value reverses it into
 *                        a genuine inward pull. Cocos 3.8.3 has no built-in
 *                        radial-inward module; this is the mechanism.
 *   - shape            = Circle, `radiusThickness` 0, so particles are born on
 *                        the rim circle and travel inward.
 *   - the emitter child is tilted 90 deg about X so the circle emitter's XY
 *                        plane becomes the game's XZ ground plane.
 *
 * The runtime wrapper is `SingularityEffects` (see the script under
 * `cocos/assets/scripts/machine/`), which rotates the root, tints the material
 * instance per level and gates the node on material validity.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cocos = path.join(repo, 'cocos');
const assets = path.join(cocos, 'assets');
const outDir = path.join(assets, 'game_art', 'prefabs', 'blackhole');
const materialsDir = path.join(assets, 'game_art', 'materials');

/** Default-Particle texture sub-asset, from the editor's own asset metadata. */
const DEFAULT_PARTICLE_TEXTURE = 'b5b27ab1-e740-4398-b407-848fc2b2c897@6c48a';

const FILE_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Deterministic 22-char fileId, unique per seed within one prefab. */
function fileId(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let out = '';
  for (let index = 0; index < 22; index += 1) {
    hash ^= hash << 13; hash ^= hash >>> 17; hash ^= hash << 5;
    hash = Math.imul(hash, 2654435761);
    out += FILE_ID_ALPHABET[Math.abs(hash) % 64];
  }
  return out;
}

const vec3 = (x, y, z) => ({ __type__: 'cc.Vec3', x, y, z });
const quat = () => ({ __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 });
const color = (r, g, b, a) => ({ __type__: 'cc.Color', r, g, b, a });

const prefabRoot = (name) => ({
  __type__: 'cc.Prefab',
  _name: name,
  _objFlags: 0,
  __editorExtras__: {},
  _native: '',
  data: { __id__: 1 },
  optimizationPolicy: 0,
  persistent: false,
});

/** Matches Creator's own glTF-imported node shape (the runtime-proven sample). */
function nodeObject({ name, parent, children, components, prefabId, position, euler }) {
  return {
    __type__: 'cc.Node',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: parent,
    _children: children,
    _active: true,
    _components: components,
    _prefab: { __id__: prefabId },
    _lpos: position || vec3(0, 0, 0),
    _lrot: quat(),
    _lscale: vec3(1, 1, 1),
    _mobility: 0,
    _layer: 1073741824,
    _euler: euler || vec3(0, 0, 0),
    _id: '',
  };
}

/** Creator's own PrefabInfo shape, as written by the glTF importer. */
const prefabInfoObject = (fileIdValue) => ({
  __type__: 'cc.PrefabInfo',
  root: { __id__: 1 },
  asset: { __id__: 0 },
  fileId: fileIdValue,
  instance: null,
  targetOverrides: null,
  nestedPrefabInstanceRoots: null,
});

function meshRendererObject({ nodeId, compPrefabInfoId, bakeSettingsId, meshUuid, materialUuid }) {
  return {
    __type__: 'cc.MeshRenderer',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: { __id__: compPrefabInfoId },
    _materials: [{ __uuid__: materialUuid, __expectedType__: 'cc.Material' }],
    _visFlags: 0,
    bakeSettings: { __id__: bakeSettingsId },
    _mesh: { __uuid__: meshUuid, __expectedType__: 'cc.Mesh' },
    _shadowCastingMode: 0,
    _shadowReceivingMode: 1,
    _shadowBias: 0,
    _shadowNormalBias: 0,
    _reflectionProbeId: -1,
    _reflectionProbeBlendId: -1,
    _reflectionProbeBlendWeight: 0,
    _enabledGlobalStandardSkinObject: false,
    _enableMorph: true,
    _id: '',
  };
}

function bakeSettingsObject() {
  return {
    __type__: 'cc.ModelBakeSettings',
    texture: null,
    uvParam: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0 },
    _bakeable: false,
    _castShadow: false,
    _receiveShadow: false,
    _recieveShadow: false,
    _lightmapSize: 64,
    _useLightProbe: false,
    _bakeToLightProbe: true,
    _reflectionProbeType: 0,
    _bakeToReflectionProbe: true,
  };
}

/** Root + one MeshRenderer node per part, exactly the glTF-importer layout. */
function buildMeshPrefab(name, parts) {
  const perPart = 5;
  const rootPrefabInfoId = 2 + parts.length * perPart;
  const objects = [prefabRoot(name)];
  objects.push(nodeObject({
    name,
    parent: null,
    children: parts.map((_, index) => ({ __id__: 2 + index * perPart })),
    components: [],
    prefabId: rootPrefabInfoId,
  }));

  parts.forEach((part, index) => {
    const base = 2 + index * perPart;
    const nodeId = base;
    const rendererId = base + 1;
    const compPrefabInfoId = base + 2;
    const bakeSettingsId = base + 3;
    const prefabInfoId = base + 4;
    const seed = `${name}:${part.node}`;

    objects.push(nodeObject({
      name: part.node,
      parent: { __id__: 1 },
      children: [],
      components: [{ __id__: rendererId }],
      prefabId: prefabInfoId,
      position: part.position,
      euler: part.euler,
    }));
    objects.push(meshRendererObject({
      nodeId,
      compPrefabInfoId,
      bakeSettingsId,
      meshUuid: part.meshUuid,
      materialUuid: part.materialUuid,
    }));
    objects.push({ __type__: 'cc.CompPrefabInfo', fileId: fileId(seed + ':comp') });
    objects.push(bakeSettingsObject());
    objects.push(prefabInfoObject(fileId(seed + ':node')));
  });

  objects.push(prefabInfoObject(fileId(name + ':rootInfo')));
  return objects;
}

// ---------------------------------------------------------------------------
// SuctionParticles.prefab
// ---------------------------------------------------------------------------

/** `cc.CurveRange` in constant mode, the only mode this emitter needs. */
const curve = (constant) => ({ __type__: 'cc.CurveRange', mode: 0, constant, multiplier: 1 });

/** `cc.GradientRange` in single-colour mode. */
const gradientRange = (r, g, b, a) => ({ __type__: 'cc.GradientRange', _mode: 0, color: color(r, g, b, a) });

/**
 * The full `cc.ParticleSystem` graph.
 *
 * Every module the component serialises is present, matching the engine's own
 * default prefab. Omitting a module would leave it `undefined` after
 * deserialisation and the CPU renderer dereferences several of them
 * unconditionally, so they are all written even where disabled.
 */
function buildParticlePrefab(name, materialUuid) {
  const objects = [];
  const push = (object) => { objects.push(object); return objects.length - 1; };

  push(prefabRoot(name));                                             // 0
  push(nodeObject({                                                   // 1 root
    name,
    parent: null,
    children: [{ __id__: 2 }],
    components: [],
    prefabId: 55,
  }));
  push(nodeObject({                                                   // 2 emitter
    name: 'Emitter',
    parent: { __id__: 1 },
    children: [],
    components: [{ __id__: 3 }],
    prefabId: 54,
    // 90 deg about X turns the circle emitter's XY plane into the XZ ground
    // plane, so the particles orbit the singularity instead of standing on end.
    euler: vec3(90, 0, 0),
  }));

  const particleSystemId = push({                                     // 3 (filled below)
    __type__: 'cc.ParticleSystem',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: 2 },
    _enabled: true,
    _materials: [{ __uuid__: materialUuid, __expectedType__: 'cc.Material' }],
    _visFlags: 0,
  });

  const startColorId = push(gradientRange(224, 213, 255, 255));       // 4
  const startSizeXId = push(curve(0.30));                             // 5
  const startSizeYId = push(curve(0.30));                             // 6
  const startSizeZId = push(curve(0.30));                             // 7
  // Negative: reverses the circle emitter's outward radial vector into an
  // inward pull. See the file header.
  const startSpeedId = push(curve(-0.95));                            // 8
  const startRotationXId = push(curve(0));                            // 9
  const startRotationYId = push(curve(0));                            // 10
  const startRotationZId = push(curve(0));                            // 11
  const startDelayId = push(curve(0));                                // 12
  const startLifetimeId = push(curve(1.15));                          // 13
  const gravityModifierId = push(curve(0));                           // 14
  // Zero at rest. BlackHoleMachine drives this from the world's real suction
  // load, so nothing is emitted while nothing is being sucked.
  const rateOverTimeId = push(curve(0));                              // 15
  const rateOverDistanceId = push(curve(0));                          // 16

  const colorOverLifetimeId = push({                                  // 17
    __type__: 'cc.ColorOvertimeModule',
    _enable: false,
    color: { __id__: 18 },
  });
  push(gradientRange(255, 255, 255, 255));                            // 18

  const shapeModuleId = push({                                        // 19
    __type__: 'cc.ShapeModule',
    _enable: true,
    // 1 = Circle: particles are born on a ring and (with the negative
    // startSpeed) travel inward.
    _shapeType: 1,
    shapeType: 1,
    emitFrom: 0,
    alignToDirection: false,
    randomDirectionAmount: 0,
    sphericalDirectionAmount: 0,
    randomPositionAmount: 0,
    radius: 0.92,
    // 0 = emit only from the circumference, so every particle starts on the rim.
    radiusThickness: 0,
    arcMode: 0,
    arcSpread: 0,
    arcSpeed: { __id__: 20 },
    length: 5,
    boxThickness: vec3(0, 0, 0),
    _position: vec3(0, 0, 0),
    _rotation: vec3(0, 0, 0),
    _scale: vec3(1, 1, 1),
    _arc: Math.PI * 2,
    _angle: 0,
  });
  push(curve(1));                                                     // 20

  const sizeOverTimeId = push({                                       // 21
    __type__: 'cc.SizeOvertimeModule',
    _enable: false,
    separateAxes: false,
    size: { __id__: 22 },
    x: { __id__: 23 },
    y: { __id__: 24 },
    z: { __id__: 25 },
  });
  push(curve(0));                                                     // 22
  push(curve(0));                                                     // 23
  push(curve(0));                                                     // 24
  push(curve(0));                                                     // 25

  const velocityOverTimeId = push({                                   // 26
    __type__: 'cc.VelocityOvertimeModule',
    _enable: false,
    x: { __id__: 27 },
    y: { __id__: 28 },
    z: { __id__: 29 },
    speedModifier: { __id__: 30 },
    space: 1,
  });
  push(curve(0));                                                     // 27
  push(curve(0));                                                     // 28
  push(curve(0));                                                     // 29
  push(curve(1));                                                     // 30

  const forceOverTimeId = push({                                      // 31
    __type__: 'cc.ForceOvertimeModule',
    _enable: false,
    x: { __id__: 32 },
    y: { __id__: 33 },
    z: { __id__: 34 },
    space: 1,
  });
  push(curve(0));                                                     // 32
  push(curve(0));                                                     // 33
  push(curve(0));                                                     // 34

  const limitVelocityId = push({                                      // 35
    __type__: 'cc.LimitVelocityOvertimeModule',
    _enable: false,
    limitX: { __id__: 36 },
    limitY: { __id__: 37 },
    limitZ: { __id__: 38 },
    limit: { __id__: 39 },
    dampen: 3,
    separateAxes: false,
    space: 1,
  });
  push(curve(0));                                                     // 36
  push(curve(0));                                                     // 37
  push(curve(0));                                                     // 38
  push(curve(0));                                                     // 39

  const rotationOverTimeId = push({                                   // 40
    __type__: 'cc.RotationOvertimeModule',
    _enable: false,
    _separateAxes: false,
    x: { __id__: 41 },
    y: { __id__: 42 },
    z: { __id__: 43 },
  });
  push(curve(0));                                                     // 41
  push(curve(0));                                                     // 42
  push(curve(0));                                                     // 43

  const textureAnimationId = push({                                   // 44
    __type__: 'cc.TextureAnimationModule',
    _enable: false,
    _numTilesX: 0,
    numTilesX: 0,
    _numTilesY: 0,
    numTilesY: 0,
    _mode: 0,
    animation: 0,
    frameOverTime: { __id__: 45 },
    startFrame: { __id__: 46 },
    cycleCount: 0,
    _flipU: 0,
    _flipV: 0,
    _uvChannelMask: -1,
    randomRow: false,
    rowIndex: 0,
  });
  push({ __type__: 'cc.CurveRange', mode: 1, constant: 0, multiplier: 1 }); // 45
  push(curve(0));                                                     // 46

  const trailModuleId = push({                                        // 47
    __type__: 'cc.TrailModule',
    _enable: false,
    mode: 0,
    lifeTime: { __id__: 48 },
    _minParticleDistance: 0.1,
    existWithParticles: true,
    textureMode: 0,
    widthFromParticle: true,
    widthRatio: { __id__: 49 },
    colorFromParticle: false,
    colorOverTrail: { __id__: 50 },
    colorOvertime: { __id__: 51 },
    _space: 0,
    _particleSystem: { __id__: particleSystemId },
  });
  push(curve(1));                                                     // 48
  push(curve(0));                                                     // 49
  push(gradientRange(255, 255, 255, 255));                            // 50
  push(gradientRange(255, 255, 255, 255));                            // 51

  const rendererId = push({                                           // 52
    __type__: 'cc.ParticleSystemRenderer',
    _renderMode: 0,
    _velocityScale: 1,
    _lengthScale: 1,
    _mesh: null,
    _mainTexture: { __uuid__: DEFAULT_PARTICLE_TEXTURE, __expectedType__: 'cc.Texture2D' },
    _useGPU: false,
  });

  push({ __type__: 'cc.CompPrefabInfo', fileId: fileId(name + ':ps') }); // 53
  push(prefabInfoObject(fileId(name + ':emitter')));                  // 54
  push(prefabInfoObject(fileId(name + ':root')));                     // 55

  Object.assign(objects[particleSystemId], {
    startColor: { __id__: startColorId },
    scaleSpace: 1,
    startSize3D: false,
    startSizeX: { __id__: startSizeXId },
    startSize: { __id__: startSizeXId },
    startSizeY: { __id__: startSizeYId },
    startSizeZ: { __id__: startSizeZId },
    startSpeed: { __id__: startSpeedId },
    startRotation3D: false,
    startRotationX: { __id__: startRotationXId },
    startRotationY: { __id__: startRotationYId },
    startRotationZ: { __id__: startRotationZId },
    startRotation: { __id__: startRotationZId },
    startDelay: { __id__: startDelayId },
    startLifetime: { __id__: startLifetimeId },
    duration: 5,
    loop: true,
    simulationSpeed: 1,
    playOnAwake: true,
    gravityModifier: { __id__: gravityModifierId },
    rateOverTime: { __id__: rateOverTimeId },
    rateOverDistance: { __id__: rateOverDistanceId },
    bursts: [],
    _colorOverLifetimeModule: { __id__: colorOverLifetimeId },
    _shapeModule: { __id__: shapeModuleId },
    _sizeOvertimeModule: { __id__: sizeOverTimeId },
    _velocityOvertimeModule: { __id__: velocityOverTimeId },
    _forceOvertimeModule: { __id__: forceOverTimeId },
    _limitVelocityOvertimeModule: { __id__: limitVelocityId },
    _rotationOvertimeModule: { __id__: rotationOverTimeId },
    _textureAnimationModule: { __id__: textureAnimationId },
    _trailModule: { __id__: trailModuleId },
    renderer: { __id__: rendererId },
    enableCulling: false,
    _prewarm: false,
    _capacity: 64,
    // 1 = Space.Local, so the particles travel with the machine.
    _simulationSpace: 1,
    _id: '',
    __prefab: { __id__: 53 },
  });

  return objects;
}

// ---------------------------------------------------------------------------
// Read the uuids Creator assigned on import.
// ---------------------------------------------------------------------------

function materialUuid(name) {
  const metaPath = path.join(materialsDir, name + '.mtl.meta');
  if (!fs.existsSync(metaPath)) {
    throw new Error(`[phase4] Missing ${name}.mtl.meta; run v7_phase4_assets.mjs then let Creator import.`);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!meta.imported || !meta.uuid) {
    throw new Error(`[phase4] ${name}.mtl was never imported by Creator.`);
  }
  return meta.uuid;
}

function meshUuid(metaPath, meshName) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const sub = Object.values(meta.subMetas || {}).find(
    (entry) => entry.importer === 'gltf-mesh' && entry.name === meshName,
  );
  if (!sub) throw new Error(`[phase4] ${path.basename(metaPath)} has no mesh named ${meshName}`);
  return sub.uuid;
}

const rimMaterial = materialUuid('MAT_BLACKHOLE_RIM');
const particleMaterial = materialUuid('MAT_BLACKHOLE_PARTICLE');

const rimGlbMeta = path.join(assets, 'game_art', 'blackhole', 'RimEnergyRing.glb.meta');
if (!fs.existsSync(rimGlbMeta)) {
  throw new Error('[phase4] Missing RimEnergyRing.glb.meta; run v7_phase4_assets.mjs then let Creator import.');
}

/**
 * The rim-energy nodes. The halo is tilted 14 deg about X so it precesses when
 * the runtime spins it, which is what separates it from a static outline.
 */
const RIM_PARTS = [
  { node: 'RimEnergyBlade', mesh: 'RimEnergyBlade.mesh', position: vec3(0, 0.128, 0), euler: vec3(0, 0, 0) },
  { node: 'RimEnergyHalo', mesh: 'RimEnergyHalo.mesh', position: vec3(0, 0.135, 0), euler: vec3(14, 0, 0) },
];

const rimParts = RIM_PARTS.map((part) => ({
  node: part.node,
  meshUuid: meshUuid(rimGlbMeta, part.mesh),
  materialUuid: rimMaterial,
  position: part.position,
  euler: part.euler,
}));

fs.mkdirSync(outDir, { recursive: true });

const rimFile = path.join(outDir, 'RimEnergy.prefab');
fs.writeFileSync(rimFile, JSON.stringify(buildMeshPrefab('RimEnergy', rimParts), null, 2) + '\n', 'utf8');
console.log('wrote ' + path.relative(repo, rimFile).split(path.sep).join('/')
  + '  (' + rimParts.length + ' ring(s), material MAT_BLACKHOLE_RIM)');

const particleFile = path.join(outDir, 'SuctionParticles.prefab');
fs.writeFileSync(particleFile, JSON.stringify(buildParticlePrefab('SuctionParticles', particleMaterial), null, 2) + '\n', 'utf8');
console.log('wrote ' + path.relative(repo, particleFile).split(path.sep).join('/')
  + '  (cc.ParticleSystem, material MAT_BLACKHOLE_PARTICLE, rateOverTime 0)');

console.log('\nCreator must import these prefabs too; that is what pulls the new'
  + ' materials and the rim mesh into the game-art bundle.');
