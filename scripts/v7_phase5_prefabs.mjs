/**
 * V7 PHASE 5 prefab: the authored absorb burst.
 *
 * One real `cc.Prefab` asset inside the `game-art` bundle, referenced by the
 * `blackhole.absorbBurst` art id and loaded non-blocking by `ArtLoader`. Nothing
 * in this file generates geometry or a material at runtime.
 *
 * ## AbsorbBurst.prefab
 *
 * A `cc.ParticleSystem` (CPU renderer) over the authored
 * `MAT_BLACKHOLE_BURST` material and the Default-Particle texture. The object
 * graph is the same authoritative `cc.ParticleSystem` serialisation PHASE 4
 * proved in this repository (`SuctionParticles.prefab`), with the values changed
 * from a continuous inward stream into a one-shot outward puff:
 *
 *   - `loop`        = false, `duration` = 0.4, `playOnAwake` = false. The runtime
 *                     host starts it explicitly per absorption and restarts it
 *                     with `stop()` + `play()`, so there is no timer and no
 *                     emission at all while nothing is being absorbed.
 *   - `rateOverTime`= 200. Over the 0.4 s window that is ~80 particles, matching
 *                     the pool slot's 128-particle capacity so a slot never
 *                     overflows before it is reset.
 *   - `startSpeed`  = +2.4 (outward). This is the opposite sign from PHASE 4's
 *                     inward suction stream: a vanish burst must fly out of the
 *                     point and then collapse, not get pulled in.
 *   - `startLifetime` = 0.55, slightly longer than the emission window, so the
 *                     last particles die just as the runtime collapses the root.
 *   - `startSize`   = 0.6. Measured: the first production size (0.42) rendered a
 *                     puff too small to read at the gameplay camera; 0.6 reads
 *                     as a burst without covering the whole singularity.
 *   - `shape`       = Sphere (3), radius 0.12, thickness 1 (volume). A small
 *                     3D volume reads as a puff from the gameplay camera, where a
 *                     flat circle would read as a ring.
 *   - `_simulationSpace` = 1 (Local). The host sets the root's world position,
 *                     then scales the root to zero, so the particles must be in
 *                     the root's space for the collapse to carry them.
 *   - `enableCulling` = false. PHASE 4 measured a depth-cull defect on this
 *                     build; culling is left off for the same reason.
 *
 * The material uuid is NOT written here. Creator assigns it on import and this
 * generator reads it back from `MAT_BLACKHOLE_BURST.mtl.meta`, which is what
 * stops the prefab from inventing a uuid that would dangle.
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

const prefabInfoObject = (fileIdValue) => ({
  __type__: 'cc.PrefabInfo',
  root: { __id__: 1 },
  asset: { __id__: 0 },
  fileId: fileIdValue,
  instance: null,
  targetOverrides: null,
  nestedPrefabInstanceRoots: null,
});

/** `cc.CurveRange` in constant mode. */
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
function buildBurstPrefab(name, materialUuid) {
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

  // V7.4 tuned absorb-burst colour: vivid electric purple/violet (#dc00ff,
  // 220, 0, 255, alpha 190). Zero green ensures additive blending on bright road
  // ground (G ~168) preserves its rich purple hue and CANNOT wash out to white
  // ("一爆就纯白"), while high red and blue deliver a luminous, obvious pop.
  const startColorId = push(gradientRange(220, 0, 255, 190));       // 4
  const startSizeXId = push(curve(0.6));                             // 5
  const startSizeYId = push(curve(0.6));                             // 6
  const startSizeZId = push(curve(0.6));                             // 7
  // Positive: the vanish burst flies *out* of the absorption point. PHASE 4's
  // suction stream uses a negative value for the opposite, inward direction.
  const startSpeedId = push(curve(2.4));                              // 8
  const startRotationXId = push(curve(0));                            // 9
  const startRotationYId = push(curve(0));                            // 10
  const startRotationZId = push(curve(0));                            // 11
  const startDelayId = push(curve(0));                                // 12
  const startLifetimeId = push(curve(0.55));                           // 13
  const gravityModifierId = push(curve(0));                           // 14
  // 140/s over the 0.4 s window is ~56 particles, comfortably within the 128 capacity
  // while preventing center-stack saturation blowout.
  const rateOverTimeId = push(curve(140));                            // 15
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
    // 3 = Sphere: a small 3D volume reads as a puff rather than a flat ring.
    _shapeType: 3,
    shapeType: 3,
    emitFrom: 0,
    alignToDirection: false,
    randomDirectionAmount: 0,
    sphericalDirectionAmount: 0,
    randomPositionAmount: 0,
    radius: 0.12,
    // 1 = emit from the whole volume, not only the surface.
    radiusThickness: 1,
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
    // The collapse curve is applied by the runtime to the root node (see
    // AbsorbFeedbackProfile), so the per-particle size module stays off.
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
    duration: 0.4,
    loop: false,
    simulationSpeed: 1,
    playOnAwake: false,
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
    _capacity: 128,
    // 1 = Space.Local, so scaling the host root collapses the particles with it.
    _simulationSpace: 1,
    _id: '',
    __prefab: { __id__: 53 },
  });

  return objects;
}

// ---------------------------------------------------------------------------
// Read the material uuid Creator assigned on import.
// ---------------------------------------------------------------------------

function materialUuid(name) {
  const metaPath = path.join(materialsDir, name + '.mtl.meta');
  if (!fs.existsSync(metaPath)) {
    throw new Error(`[phase5] Missing ${name}.mtl.meta; run the PHASE 1/4 generators then let Creator import.`);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!meta.imported || !meta.uuid) {
    throw new Error(`[phase5] ${name}.mtl was never imported by Creator.`);
  }
  return meta.uuid;
}

const particleMaterial = materialUuid('MAT_BLACKHOLE_BURST');

fs.mkdirSync(outDir, { recursive: true });

const burstFile = path.join(outDir, 'AbsorbBurst.prefab');
fs.writeFileSync(burstFile, JSON.stringify(buildBurstPrefab('AbsorbBurst', particleMaterial), null, 2) + '\n', 'utf8');
console.log('wrote ' + path.relative(repo, burstFile).split(path.sep).join('/')
  + '  (cc.ParticleSystem, material MAT_BLACKHOLE_BURST, one-shot burst)');

console.log('\nCreator must import this prefab; that is what pulls it into the game-art bundle.');
