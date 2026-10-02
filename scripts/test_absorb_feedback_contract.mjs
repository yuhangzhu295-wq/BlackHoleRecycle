/**
 * V7 PHASE 5 absorb-feedback contract (implementation-level, non-renderer).
 *
 * Proves the four feedback deliverables are real and that the two boundaries the
 * brief calls out are respected. Three kinds of evidence:
 *
 *   1. **Executed code.** `AbsorbFeedbackProfile.ts` and
 *      `CompressionVisualProfile.ts` are pure (no `cc` import), so they are
 *      compiled and *run* here. The collapse curve, the eject arc and the
 *      unchanged eject window are asserted on real return values, not regexes.
 *
 *   2. **Authored asset integrity.** `AbsorbBurst.prefab` is parsed and its
 *      material/texture uuid references are checked against the uuids Creator
 *      actually assigned, so a stale or invented uuid fails here instead of
 *      silently shipping a magenta effect. Its one-shot, bounded shape is
 *      asserted from the asset itself.
 *
 *   3. **Bounded pooling and real-event driving.** Source-level guarantees that
 *      the burst is emitted from `GameManager.onObjectAbsorbed` (never a timer)
 *      and that `AbsorbFeedbackPool.emit` allocates nothing.
 *
 * It does NOT claim on-screen evidence. That still requires `acceptance:v2`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cocos = path.join(rootDirectory, 'cocos');
const readScript = (relative) => fs.readFileSync(path.join(rootDirectory, relative), 'utf8');
const readCocos = (relative) => fs.readFileSync(path.join(cocos, relative), 'utf8');
const existsCocos = (relative) => fs.existsSync(path.join(cocos, relative));

let checks = 0;
const record = (name, pass, detail) => {
  checks += 1;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  if (!pass) throw new Error(name);
};

// ---------------------------------------------------------------------------
// 1. Execute the pure profile modules.
// ---------------------------------------------------------------------------
function loadProfile(relative, exports) {
  const source = readScript(relative);
  const code = transformSync(
    source + `\nglobalThis.__PROFILE = { ${exports.join(', ')} };`,
    { loader: 'ts', target: 'es2022', format: 'iife' },
  ).code;
  new Function(code)();
  const profile = globalThis.__PROFILE;
  globalThis.__PROFILE = null;
  return profile;
}

const absorb = loadProfile(
  'cocos/assets/scripts/gameplay/AbsorbFeedbackProfile.ts',
  ['ABSORB_FEEDBACK', 'clampAbsorbProgress', 'absorbBurstProgress', 'absorbBurstScale'],
);
const drop = loadProfile(
  'cocos/assets/scripts/gameplay/CompressionVisualProfile.ts',
  [
    'RESOURCE_DROP', 'clampDropProgress', 'resourceDropHeight', 'resourceDropForward',
    'resourceDropScale', 'resourceDropYaw',
  ],
);

// --- Item 1/2: the collapse curve is real, monotonic and bounded ------------
{
  const p = absorb.ABSORB_FEEDBACK;
  record('ABSORB_POOL_IS_FIXED_AND_SMALL',
    Number.isInteger(p.poolSize) && p.poolSize >= 2 && p.poolSize <= 12,
    `poolSize=${p.poolSize}`);
  record('ABSORB_BURST_IS_SHORT_LIVED',
    p.burstDurationSeconds > 0 && p.burstDurationSeconds <= 1 && p.particleLifetimeSeconds > 0,
    `burst=${p.burstDurationSeconds}s particleLifetime=${p.particleLifetimeSeconds}s`);
  const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((t) => absorb.absorbBurstScale(t));
  const monotonic = samples.every((value, index) => index === 0 || value <= samples[index - 1]);
  record('ABSORB_COLLAPSE_IS_MONOTONIC_FROM_ONE_TO_ZERO',
    Math.abs(samples[0] - p.startScale) < 1e-9
    && Math.abs(samples[samples.length - 1] - p.endScale) < 1e-9
    && monotonic && p.startScale > p.endScale,
    `scale=${samples.map((value) => value.toFixed(3)).join(' > ')}`);
  record('ABSORB_COLLAPSE_EASES_IN',
    // The curve must hang then snap, not fall linearly: the midpoint is closer
    // to the start than a straight line would put it.
    absorb.absorbBurstScale(0.5) > (p.startScale + p.endScale) / 2,
    `mid=${absorb.absorbBurstScale(0.5).toFixed(3)} > linear ${((p.startScale + p.endScale) / 2).toFixed(3)}`);
  record('ABSORB_PROGRESS_CLAMPS_AND_COMPLETES',
    absorb.absorbBurstProgress(-5) === 0
    && absorb.absorbBurstProgress(1e9) === 1
    && absorb.absorbBurstProgress(p.burstDurationSeconds) === 1,
    'elapsed clamps to a completed burst');
  record('ABSORB_ORIGIN_CLEARS_THE_GROUND_PLANE',
    p.heightAboveGround > 0.1,
    `heightAboveGround=${p.heightAboveGround} (object Y is below ground at absorption)`);
}

// --- Item 3: the eject/drop arc is real and the window is unchanged ---------
{
  const d = drop.RESOURCE_DROP;
  record('RESOURCE_DROP_WINDOW_IS_UNCHANGED',
    // The previous hardcoded EJECTING window was 0.45 s; the acceptance state
    // chain and reward timing depend on it.
    Math.abs(d.durationSeconds - 0.45) < 1e-9,
    `durationSeconds=${d.durationSeconds}`);
  record('RESOURCE_DROP_POPS_UP_AND_RETURNS',
    Math.abs(drop.resourceDropHeight(0)) < 1e-9
    && Math.abs(drop.resourceDropHeight(1)) < 1e-9
    && drop.resourceDropHeight(0.5) > 0,
    `h(0)=${drop.resourceDropHeight(0)} h(0.5)=${drop.resourceDropHeight(0.5).toFixed(3)} h(1)=${drop.resourceDropHeight(1)}`);
  record('RESOURCE_DROP_TRAVELS_FORWARD_MONOTONICALLY',
    drop.resourceDropForward(0) === 0
    && drop.resourceDropForward(1) > drop.resourceDropForward(0.5)
    && drop.resourceDropForward(0.5) > 0,
    `forward(0.5)=${drop.resourceDropForward(0.5).toFixed(3)} forward(1)=${drop.resourceDropForward(1).toFixed(3)}`);
  record('RESOURCE_DROP_SCALE_STARTS_SMALL_AND_OVERSHOOTS',
    Math.abs(drop.resourceDropScale(0) - d.startScale) < 1e-9
    && Math.abs(drop.resourceDropScale(1) - d.endScale) < 1e-9
    && drop.resourceDropScale(0.75) > d.endScale,
    `s(0)=${drop.resourceDropScale(0)} s(0.75)=${drop.resourceDropScale(0.75).toFixed(3)} s(1)=${drop.resourceDropScale(1)}`);
  record('RESOURCE_DROP_SPINS_AND_SCALES_WITH_LEVEL',
    drop.resourceDropYaw(1) === d.spinDegrees
    && drop.resourceDropYaw(0) === 0
    && drop.resourceDropHeight(0.5, 3.6) > drop.resourceDropHeight(0.5, 1.4),
    `yaw(1)=${drop.resourceDropYaw(1)} height@LV5=${drop.resourceDropHeight(0.5, 3.6).toFixed(3)} @LV1=${drop.resourceDropHeight(0.5, 1.4).toFixed(3)}`);
}

// ---------------------------------------------------------------------------
// 2. Authored asset integrity.
// ---------------------------------------------------------------------------
const PREFAB = 'assets/game_art/prefabs/blackhole/AbsorbBurst.prefab';
const MATERIAL = 'assets/game_art/materials/MAT_BLACKHOLE_BURST.mtl';
record('AUTHORED_BURST_ASSET_EXISTS', existsCocos(PREFAB) && existsCocos(MATERIAL),
  `${PREFAB}:${existsCocos(PREFAB) ? 'ok' : 'MISSING'}`);

const materialUuid = JSON.parse(readCocos(MATERIAL + '.meta')).uuid;
const materialAsset = JSON.parse(readCocos(MATERIAL));
const prefab = JSON.parse(readCocos(PREFAB));
const particleSystem = prefab.find((object) => object && object.__type__ === 'cc.ParticleSystem');
const particleRenderer = prefab.find((object) => object && object.__type__ === 'cc.ParticleSystemRenderer');
const emitterNode = prefab.find((object) => object && object.__type__ === 'cc.Node' && object._name === 'Emitter');
const rateOverTime = particleSystem && prefab[particleSystem.rateOverTime.__id__];
const startSpeed = particleSystem && prefab[particleSystem.startSpeed.__id__];

record('BURST_PREFAB_IS_A_REAL_PARTICLE_SYSTEM',
  !!particleSystem && !!particleRenderer && !!emitterNode
  && particleSystem._materials?.[0]?.__uuid__ === materialUuid,
  `material=${materialUuid}`);
record('BURST_BINDS_THE_PARTICLE_EFFECT_AND_TEXTURE',
  particleRenderer?._mainTexture?.__uuid__ === 'b5b27ab1-e740-4398-b407-848fc2b2c897@6c48a'
  && materialAsset._props[0].mainTexture.__uuid__ === 'b5b27ab1-e740-4398-b407-848fc2b2c897@6c48a',
  'the renderer and the material both name the Default-Particle texture');
record('BURST_MATERIAL_IS_ALWAYS_ON_TOP',
  // A measured frame showed the object being absorbed occluding the whole
  // burst, so the authored material overrides the pass to depthTest:false.
  materialAsset._states?.[0]?.depthStencilState?.depthTest === false
  && materialAsset._states?.[0]?.depthStencilState?.depthWrite === false
  && materialAsset._effectAsset.__uuid__ === 'd1346436-ac96-4271-b863-1f4fdead95b0'
  && materialAsset._techIdx === 0,
  'particles/builtin-particle technique 0 (add), depthTest/depthWrite false');
record('BURST_IS_ONE_SHOT_AND_SILENT_UNTIL_TRIGGERED',
  particleSystem?.loop === false && particleSystem?.playOnAwake === false
  && particleSystem?.duration > 0 && particleSystem.duration <= 0.5,
  `loop=${particleSystem?.loop} playOnAwake=${particleSystem?.playOnAwake} duration=${particleSystem?.duration}`);
record('BURST_EMITS_AND_CANNOT_OVERFLOW_ITS_CAPACITY',
  rateOverTime?.constant > 0
  && Number.isInteger(particleSystem?._capacity)
  && particleSystem._capacity >= rateOverTime.constant * particleSystem.duration,
  `rate=${rateOverTime?.constant}/s capacity=${particleSystem?._capacity} window=${particleSystem?.duration}s`);
record('BURST_FLIES_OUTWARD_UNLIKE_THE_INWARD_SUCTION_STREAM',
  typeof startSpeed?.constant === 'number' && startSpeed.constant > 0,
  `startSpeed=${startSpeed?.constant} (PHASE 4 suction uses a negative value)`);
record('BURST_CULLING_IS_OFF',
  particleSystem?.enableCulling === false,
  'enableCulling=false (PHASE 4 measured a depth/cull defect on this build)');
record('BURST_IS_LOCAL_SPACE_FOR_THE_ROOT_COLLAPSE',
  particleSystem?._simulationSpace === 1,
  `_simulationSpace=${particleSystem?._simulationSpace} (1 = Local)`);

const artRegistry = readScript('cocos/assets/scripts/core/ArtRegistry.ts');
record('ART_REGISTRY_DECLARES_THE_BURST',
  /artId: 'blackhole\.absorbBurst'[\s\S]*?game_art\/prefabs\/blackhole\/AbsorbBurst\.prefab/.test(artRegistry),
  'the burst prefab is addressable by art id');

// ---------------------------------------------------------------------------
// 3. Bounded pooling and real-event driving.
// ---------------------------------------------------------------------------
const gameManager = readScript('cocos/assets/scripts/gameplay/GameManager.ts');
const pool = readScript('cocos/assets/scripts/gameplay/AbsorbFeedbackPool.ts');
const compression = readScript('cocos/assets/scripts/gameplay/CompressionSystem.ts');

const absorbHandler = gameManager.slice(
  gameManager.indexOf('public onObjectAbsorbed'),
  gameManager.indexOf('private updateHUD'),
);
record('BURST_IS_DRIVEN_BY_THE_REAL_ABSORB_EVENT',
  /this\.absorbFeedback\?\.emit\(obj\.getPosition\(\)\)/.test(absorbHandler),
  'GameManager.onObjectAbsorbed emits the burst at the object position');
record('BURST_IS_NEVER_ON_A_TIMER',
  !/setInterval|schedule\(|setTimeout/.test(pool) && !/absorbFeedback\?\.emit/.test(gameManager.slice(0, gameManager.indexOf('public onObjectAbsorbed'))),
  'the pool has no timer and no emit site outside the absorb callback');

const emitBody = pool.slice(
  pool.indexOf('public emit('),
  pool.indexOf('public update('),
);
record('EMIT_ALLOCATES_NOTHING',
  !/instantiate\(|new Node\(|\.addChild\(/.test(emitBody),
  'AbsorbFeedbackPool.emit only reuses a pre-built slot');
record('POOL_IS_BUILT_ONCE_AT_ADOPTION',
  /for \(let index = 0; index < ABSORB_FEEDBACK\.poolSize; index \+= 1\)/.test(pool)
  && /index === 0 \? template : instantiate\(template\)/.test(pool),
  'the fixed pool is cloned once when the authored prefab adopts');
record('POOL_DEGRADES_WITHOUT_BREAKING_PLAY',
  /abandon\(/.test(pool) && /console\.warn\('\[AbsorbFeedbackPool\] Authored absorb burst unavailable/.test(pool)
  && /\.includes\('builtin-particle'\)/.test(pool),
  'a missing asset or unresolved material leaves the effect absent after a bounded retry');
record('COMPRESSION_USES_THE_AUTHORED_DROP_PROFILE',
  /RESOURCE_DROP/.test(compression) && /resourceDropHeight\(/.test(compression)
  && /resourceDropScale\(/.test(compression) && /resourceDropYaw\(/.test(compression),
  'the resource block ejects along the authored arc');
record('COMPRESSION_KEEPS_THE_LEVEL_DRIVEN_EJECT_FEEDBACK',
  /compressionEjectSpeed/.test(compression),
  'the live machine level still scales the eject travel');

console.log(`\n[PASS] absorb feedback contract: ${checks} checks passed.`);
console.log('[NOTE] On-screen pixel evidence still requires npm run acceptance:v2 -- --scope=full.');
