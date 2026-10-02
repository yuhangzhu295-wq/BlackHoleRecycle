/**
 * V7 PHASE 4 singularity visual contract (implementation-level, non-renderer).
 *
 * Proves the five PHASE 4 deliverables are real and that the two boundaries the
 * brief calls out are respected. Two kinds of evidence:
 *
 *   1. **Executed code.** `SingularityVisualProfile.ts` is pure (no `cc`
 *      import), so it is compiled and *run* here — the level differentiation,
 *      the silence-at-rest rule, the devour response and the visible-rotation
 *      geometry are asserted on real return values, not on regexes.
 *
 *   2. **Cross-file asset integrity.** The authored prefabs are parsed and their
 *      material/mesh uuid references are checked against the uuids Creator
 *      actually assigned in the `.mtl.meta` / `.glb.meta` files. A stale or
 *      invented uuid fails here instead of silently shipping a magenta effect.
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
// 1. Execute the pure profile module.
// ---------------------------------------------------------------------------
const EXPORTS = [
  'VORTEX_LAYERS', 'ANIMATED_DECORATION_NODE_NAMES', 'DEVOUR_PULSE_SECONDS',
  'getSingularityLevelVisuals', 'normalizeSingularityLevel', 'decayDevourPulse',
  'vortexLayerHeight', 'vortexLayerAngularStep', 'vortexLayerEuler',
  'singularitySuctionEmission', 'singularityDevourScale', 'singularityRimEnergyScale',
];
const profileSource = readScript('cocos/assets/scripts/machine/SingularityVisualProfile.ts');
const compiled = transformSync(
  profileSource + `\nglobalThis.__SVP = { ${EXPORTS.join(', ')} };`,
  { loader: 'ts', target: 'es2022', format: 'iife' },
).code;
new Function(compiled)();
const SVP = globalThis.__SVP;
record('PROFILE_MODULE_IS_PURE_AND_EXECUTES',
  !!SVP && Array.isArray(SVP.VORTEX_LAYERS) && SVP.VORTEX_LAYERS.length === 5,
  `VORTEX_LAYERS=${SVP.VORTEX_LAYERS.length}, exports=${EXPORTS.length}`);

// --- Item 3: the rotation is visible, and the layering reads as a vortex ----
const layers = SVP.VORTEX_LAYERS;
const inner = layers.filter((layer) => layer.name !== 'HoleRing');
record('VORTEX_LAYERS_TILTED_OFF_SYMMETRY_AXIS',
  inner.every((layer) => layer.tiltX !== 0 || layer.tiltZ !== 0),
  `tilts=${inner.map((layer) => `${layer.name}:${layer.tiltX}/${layer.tiltZ}`).join(' ')}`);
record('VORTEX_RIM_IS_STABLE_HORIZON',
  layers.find((layer) => layer.name === 'HoleRing')?.tiltX === 0
  && layers.find((layer) => layer.name === 'HoleRing')?.tiltZ === 0,
  'HoleRing tilt 0/0 so the rim reads as a fixed outline, not a wobbling one');
record('VORTEX_LAYERS_COUNTER_ROTATE',
  layers.some((layer) => layer.direction === 1) && layers.some((layer) => layer.direction === -1),
  `directions=${layers.map((layer) => `${layer.name}:${layer.direction}`).join(' ')}`);
record('VORTEX_LAYERS_ARE_SPREAD_INTO_A_FUNNEL',
  new Set(layers.map((layer) => layer.y)).size === layers.length
  && layers[layers.length - 1].y > layers[0].y,
  `y=${layers.map((layer) => layer.y).join(' < ')}`);
record('VORTEX_LAYERS_DECLARE_THE_EXCLUSION_SET',
  layers.every((layer) => SVP.ANIMATED_DECORATION_NODE_NAMES.includes(layer.name))
  && SVP.ANIMATED_DECORATION_NODE_NAMES.includes('RimEnergy'),
  `excluded=${SVP.ANIMATED_DECORATION_NODE_NAMES.join(', ')}`);
{
  // A tilted ring spun about Y precesses; the Euler must carry both the tilt and
  // the accumulated spin, and the spin must be direction-signed.
  const innerLayer = layers[0];
  const euler = SVP.vortexLayerEuler(innerLayer, 90);
  record('VORTEX_EULER_CARRIES_TILT_AND_SIGNED_SPIN',
    euler.x === innerLayer.tiltX && euler.z === innerLayer.tiltZ
    && euler.y === innerLayer.direction * 90,
    JSON.stringify(euler));
  const reversed = SVP.vortexLayerEuler(layers[1], 90);
  record('VORTEX_NEIGHBOURS_SPIN_OPPOSITE',
    Math.sign(euler.y) !== Math.sign(reversed.y),
    `${layers[0].name}.y=${euler.y} vs ${layers[1].name}.y=${reversed.y}`);
  const slow = SVP.vortexLayerAngularStep(innerLayer, 1, 0, 0.5);
  const fast = SVP.vortexLayerAngularStep(innerLayer, 2, 0, 0.5);
  const loaded = SVP.vortexLayerAngularStep(innerLayer, 1, 1, 0.5);
  record('VORTEX_SPIN_STEP_SCALES_WITH_LEVEL_AND_LOAD',
    Math.abs(fast - slow * 2) < 1e-9 && loaded > slow,
    `slow=${slow} fast=${fast} loaded=${loaded}`);
}

// --- Item 5: LV1..LV5 are visibly different --------------------------------
{
  // The real level palette from MACHINE_EVOLUTION_CONFIG, so this asserts the
  // actual shipped colours rather than a re-typed copy.
  const gameConfig = readScript('cocos/assets/scripts/data/GameConfig.ts');
  const levelBlocks = [...gameConfig.matchAll(/\{\s*level:\s*(\d+),([\s\S]*?)\n  \}/g)].slice(0, 5);
  const levels = levelBlocks.map((match) => ({
    level: Number(match[1]),
    baseColor: (match[2].match(/baseColor:\s*'(#[0-9a-fA-F]{6})'/) || [])[1],
    rimColor: (match[2].match(/rimColor:\s*'(#[0-9a-fA-F]{6})'/) || [])[1],
  }));
  record('LEVEL_PALETTE_SOURCE_PARSED', levels.length === 5 && levels.every((entry) => entry.baseColor && entry.rimColor),
    levels.map((entry) => `LV${entry.level}:${entry.rimColor}`).join(' '));

  const visuals = levels.map((entry) => SVP.getSingularityLevelVisuals(entry));
  const rimColors = new Set(visuals.map((entry) => entry.rimColor));
  const rates = new Set(visuals.map((entry) => entry.particleRate));
  const spins = new Set(visuals.map((entry) => entry.spinMultiplier));
  const spreads = new Set(visuals.map((entry) => entry.funnelSpread));
  record('LEVEL_APPEARANCE_DIFFERS_ACROSS_ALL_FIVE',
    rimColors.size === 5 && rates.size === 5 && spins.size === 5 && spreads.size === 5,
    `rim=${rimColors.size} rate=${rates.size} spin=${spins.size} funnel=${spreads.size}`);
  record('LEVEL_APPEARANCE_IS_MONOTONIC_IN_INTENSITY',
    visuals.every((entry, index) => index === 0
      || (entry.particleRate > visuals[index - 1].particleRate
        && entry.spinMultiplier > visuals[index - 1].spinMultiplier
        && entry.funnelSpread > visuals[index - 1].funnelSpread)),
    visuals.map((entry) => `LV${entry.level}:rate${entry.particleRate}/spin${entry.spinMultiplier}/funnel${entry.funnelSpread}`).join(' '));
  record('LEVEL_APPEARANCE_FOLLOWS_THE_LEVEL_CONFIG',
    visuals.every((entry, index) => entry.rimColor === levels[index].rimColor),
    'every level rim hue is the level config\'s own rimColor');
  record('LEVEL_NORMALISATION_CLAMPS_OUT_OF_RANGE',
    SVP.normalizeSingularityLevel(0) === 1 && SVP.normalizeSingularityLevel(9) === 5
    && SVP.normalizeSingularityLevel(Number.NaN) === 1,
    'out-of-range levels resolve to a real profile');
}

// --- Item 1: silent at rest, emitting under real suction -------------------
{
  const level1 = SVP.getSingularityLevelVisuals({ level: 1, baseColor: '#2b7fff', rimColor: '#00e5ff' });
  record('SUCTION_PARTICLES_SILENT_AT_REST',
    SVP.singularitySuctionEmission(level1, 0, 0) === 0,
    'zero load and zero devour pulse emits exactly 0 particles/second');
  record('SUCTION_PARTICLES_EMIT_UNDER_LOAD',
    SVP.singularitySuctionEmission(level1, 0.5, 0) > 0
    && SVP.singularitySuctionEmission(level1, 1, 0) > SVP.singularitySuctionEmission(level1, 0.5, 0),
    `0.5->${SVP.singularitySuctionEmission(level1, 0.5, 0)}, 1.0->${SVP.singularitySuctionEmission(level1, 1, 0)}`);
  record('SUCTION_PARTICLES_RESPOND_TO_A_DEVOUR_EVENT',
    SVP.singularitySuctionEmission(level1, 0, 1) > 0,
    'a single absorption emits even if the instantaneous load reads zero');
  record('SUCTION_PARTICLES_ARE_LEVEL_SCALED',
    SVP.singularitySuctionEmission(
      SVP.getSingularityLevelVisuals({ level: 5, baseColor: '#ff2d55', rimColor: '#ffffff' }), 1, 0,
    ) > SVP.singularitySuctionEmission(level1, 1, 0),
    'LV5 emits more than LV1 at the same load');
}

// --- Item 4: devour scale is real, and never touches the structural body ----
{
  record('DEVOUR_SCALE_AT_REST_IS_ONE', SVP.singularityDevourScale(0, 0) === 1,
    'no load and no pulse means no scale response');
  record('DEVOUR_SCALE_RESPONDS_TO_LOAD_AND_EVENT',
    SVP.singularityDevourScale(1, 0) > 1 && SVP.singularityDevourScale(0, 1) > 1
    && SVP.singularityDevourScale(1, 1) > SVP.singularityDevourScale(1, 0),
    `load=${SVP.singularityDevourScale(1, 0)} pulse=${SVP.singularityDevourScale(0, 1)} both=${SVP.singularityDevourScale(1, 1)}`);
  const pulseHalf = SVP.decayDevourPulse(1, SVP.DEVOUR_PULSE_SECONDS / 2);
  record('DEVOUR_PULSE_DECAYS_AND_SETTLES',
    Math.abs(pulseHalf - 0.5) < 1e-9 && SVP.decayDevourPulse(1, 9999) === 0 && SVP.decayDevourPulse(0, 0.016) === 0,
    `half=${pulseHalf}`);
}

// --- Item 2: the rim energy has its own pulse ------------------------------
{
  const level3 = SVP.getSingularityLevelVisuals({ level: 3, baseColor: '#ff9500', rimColor: '#ffd600' });
  const rest = SVP.singularityRimEnergyScale(level3, 0, 0, 0);
  record('RIM_ENERGY_PULSES_WITH_LOAD',
    rest === level3.energyScale && SVP.singularityRimEnergyScale(level3, 0, 1, 0) > rest,
    `rest=${rest} loaded=${SVP.singularityRimEnergyScale(level3, 0, 1, 0)}`);
}

// ---------------------------------------------------------------------------
// 2. Source-level guarantees about where the profile is applied.
// ---------------------------------------------------------------------------
const machine = readScript('cocos/assets/scripts/machine/BlackHoleMachine.ts');
const effects = readScript('cocos/assets/scripts/machine/SingularityEffects.ts');
const gameManager = readScript('cocos/assets/scripts/gameplay/GameManager.ts');
const artRegistry = readScript('cocos/assets/scripts/core/ArtRegistry.ts');

record('MACHINE_USES_THE_PROFILE_FOR_THE_VORTEX',
  /VORTEX_LAYERS/.test(machine) && /vortexLayerAngularStep/.test(machine)
  && /vortexLayerEuler/.test(machine) && /vortexLayerHeight/.test(machine),
  'the vortex animation is profile-driven, not a second hardcoded table');
record('MACHINE_HAS_ONE_ANIMATION_PASS',
  /private applySingularityAnimation\(dt: number\): void/.test(machine)
  && !/private updateSuctionFeedback\s*\(/.test(machine)
  // The old duplicated formula that disagreed with the base rotation block.
  && !/this\.visualElapsed \* 90/.test(machine),
  'the two overlapping animation blocks were consolidated into one');
record('MACHINE_STRUCTURAL_BODY_IS_NEVER_SCALED',
  // The devour response must reach decoration only. The structural body nodes
  // are created by name and must never appear in a setScale call.
  !/getChildByName\('(AbyssBase|HoleInner)'\)[\s\S]{0,120}?setScale/.test(machine)
  && /createCorePart\('AbyssBase'/.test(machine) && /createCorePart\('HoleInner'/.test(machine),
  'no setScale call reaches AbyssBase/HoleInner, the gated silhouette body');
record('MACHINE_EXCLUDES_RIM_ENERGY_FROM_THE_SILHOUETTE',
  /getRimEnergyNode\(\)/.test(machine) && /getAnimatedDecorationNodes/.test(machine),
  'the frame-animated authored rim ring is excluded from the gated silhouette');
record('MACHINE_APPLIES_THE_LEVEL_APPEARANCE',
  /getSingularityLevelVisuals\(/.test(machine) && /applyLevelAppearance\(\)/.test(machine)
  && /this\.effects\?\.applyLevel\(this\.levelAppearance\)/.test(machine),
  'the level drives the rim hue, the rim energy and the particles');
record('SKIN_STILL_WINS_OVER_THE_LEVEL',
  /private applyLevelAppearance\(\): void \{[\s\S]*?this\.applyCoreSkinToCore\(\);/.test(machine),
  'applyLevelAppearance re-applies the skin last, so a chosen skin overrides the level palette');
record('DEVOUR_PULSE_IS_DRIVEN_BY_A_REAL_ABSORPTION',
  /public triggerDevourPulse\(\): void/.test(machine)
  && /this\.machine\.triggerDevourPulse\(\);/.test(gameManager),
  'GameManager raises the pulse from its real absorb callback');
record('EFFECTS_DEGRADE_AND_NEVER_DRAW_AN_UNRESOLVED_MATERIAL',
  /material\.validate\(\)/.test(effects) && /builtin-particle/.test(effects)
  && /abandonParticles/.test(effects) && /abandonRimEnergy/.test(effects),
  'adoption is gated on a valid material and a bounded retry, then abandoned');
record('EFFECTS_ARE_REQUESTED_NON_BLOCKING',
  /ArtLoader\.instantiateArt\('blackhole\.suctionParticles'/.test(effects)
  && /ArtLoader\.instantiateArt\('blackhole\.rimEnergy'/.test(effects),
  'both effects are requested by art id through ArtLoader');

// ---------------------------------------------------------------------------
// 3. Authored asset integrity.
// ---------------------------------------------------------------------------
const ARTIFACTS = [
  'assets/game_art/materials/MAT_BLACKHOLE_RIM.mtl',
  'assets/game_art/materials/MAT_BLACKHOLE_PARTICLE.mtl',
  'assets/game_art/blackhole/RimEnergyRing.glb',
  'assets/game_art/prefabs/blackhole/RimEnergy.prefab',
  'assets/game_art/prefabs/blackhole/SuctionParticles.prefab',
];
record('AUTHORED_ASSETS_EXIST', ARTIFACTS.every(existsCocos),
  ARTIFACTS.map((file) => `${path.basename(file)}:${existsCocos(file) ? 'ok' : 'MISSING'}`).join(' '));

record('ART_REGISTRY_DECLARES_THE_EFFECTS',
  /artId: 'blackhole\.rimEnergy'[\s\S]*?game_art\/prefabs\/blackhole\/RimEnergy\.prefab/.test(artRegistry)
  && /artId: 'blackhole\.suctionParticles'[\s\S]*?game_art\/prefabs\/blackhole\/SuctionParticles\.prefab/.test(artRegistry),
  'both effect prefabs are addressable by art id');

const uuidOfMeta = (relative) => JSON.parse(readCocos(relative)).uuid;
const rimMaterialUuid = uuidOfMeta('assets/game_art/materials/MAT_BLACKHOLE_RIM.mtl.meta');
const particleMaterialUuid = uuidOfMeta('assets/game_art/materials/MAT_BLACKHOLE_PARTICLE.mtl.meta');
const rimGlbMeta = JSON.parse(readCocos('assets/game_art/blackhole/RimEnergyRing.glb.meta'));
const meshUuids = Object.values(rimGlbMeta.subMetas || {})
  .filter((sub) => sub.importer === 'gltf-mesh')
  .map((sub) => sub.uuid);

const rimPrefab = JSON.parse(readCocos('assets/game_art/prefabs/blackhole/RimEnergy.prefab'));
const rimReferences = rimPrefab.filter((object) => object && object.__type__ === 'cc.MeshRenderer');
record('RIM_PREFAB_BINDS_THE_AUTHORED_MESH_AND_MATERIAL',
  rimReferences.length === 2
  && rimReferences.every((renderer) => renderer._materials?.[0]?.__uuid__ === rimMaterialUuid
    && meshUuids.includes(renderer._mesh?.__uuid__)),
  `renderers=${rimReferences.length}, material=${rimMaterialUuid}, meshes=${meshUuids.join(',')}`);
record('RIM_MATERIAL_IS_ADDITIVE_UNLIT',
  JSON.parse(readCocos('assets/game_art/materials/MAT_BLACKHOLE_RIM.mtl'))._techIdx === 2
  && JSON.parse(readCocos('assets/game_art/materials/MAT_BLACKHOLE_RIM.mtl'))._effectAsset.__uuid__
    === 'a3cd009f-0ab0-420d-9278-b9fdab939bbc',
  'technique 2 = builtin-unlit `add`');

const particlePrefab = JSON.parse(readCocos('assets/game_art/prefabs/blackhole/SuctionParticles.prefab'));
const particleSystem = particlePrefab.find((object) => object && object.__type__ === 'cc.ParticleSystem');
const particleRenderer = particlePrefab.find((object) => object && object.__type__ === 'cc.ParticleSystemRenderer');
const emitterNode = particlePrefab.find((object) => object && object.__type__ === 'cc.Node' && object._name === 'Emitter');
const rateOverTime = particleSystem && particlePrefab[particleSystem.rateOverTime.__id__];
const startSpeed = particleSystem && particlePrefab[particleSystem.startSpeed.__id__];
const shapeModule = particleSystem && particlePrefab[particleSystem._shapeModule.__id__];
record('PARTICLE_PREFAB_IS_A_REAL_PARTICLE_SYSTEM',
  !!particleSystem && !!particleRenderer && !!emitterNode
  && particleSystem._materials?.[0]?.__uuid__ === particleMaterialUuid,
  `material=${particleMaterialUuid}`);
record('PARTICLE_EMITTER_PLANE_IS_THE_GROUND_PLANE',
  emitterNode?._euler?.x === 90 && particleSystem?._simulationSpace === 1,
  `euler.x=${emitterNode?._euler?.x} simulationSpace=${particleSystem?._simulationSpace} (1 = Local)`);
record('PARTICLE_RATE_DEFAULTS_TO_SILENCE',
  rateOverTime?.mode === 0 && rateOverTime?.constant === 0,
  'the asset itself emits nothing; the runtime drives the rate from real suction');
record('PARTICLE_SHAPE_PULLS_INWARD',
  shapeModule?._shapeType === 1 && shapeModule?.radiusThickness === 0
  && typeof startSpeed?.constant === 'number' && startSpeed.constant < 0,
  `shapeType=${shapeModule?._shapeType} (1 = Circle, edge only) startSpeed=${startSpeed?.constant}`);
{
  // Measured legibility floor. At the gameplay camera 1 m is ~32 screen pixels,
  // and the first capture at 5.5 cm drew ~2 px sparks that could not be seen on
  // a phone. This locks in the fix rather than the original guess.
  const size = particlePrefab[particleSystem.startSizeX.__id__]?.constant;
  record('PARTICLE_SIZE_IS_LEGIBLE_AT_PHONE_SCALE', typeof size === 'number' && size >= 0.2,
    `startSize=${size} (>= 0.2 m world-equivalent)`);
  // The emitter plane must clear the opaque body, or every particle is
  // depth-culled. The body's top face is at y 0.0375; the plane is applied by
  // the runtime, so the constant is asserted in the source that applies it.
  const plane = effects.match(/PARTICLE_PLANE_HEIGHT = ([\d.]+)/);
  record('PARTICLE_PLANE_CLEARS_THE_OPAQUE_BODY',
    !!plane && Number(plane[1]) > 0.1
    && /particles\.root\.setPosition\(0, PARTICLE_PLANE_HEIGHT \* visuals\.funnelSpread, 0\)/.test(effects),
    `PARTICLE_PLANE_HEIGHT=${plane ? plane[1] : 'MISSING'}`);
}
record('PARTICLE_MATERIAL_BINDS_THE_PARTICLE_EFFECT_AND_TEXTURE',
  particleRenderer?._mainTexture?.__uuid__ === 'b5b27ab1-e740-4398-b407-848fc2b2c897@6c48a'
  && JSON.parse(readCocos('assets/game_art/materials/MAT_BLACKHOLE_PARTICLE.mtl'))._props[0].mainTexture.__uuid__
    === 'b5b27ab1-e740-4398-b407-848fc2b2c897@6c48a',
  'the renderer and the material both name the Default-Particle texture');

console.log(`\n[PASS] singularity visual contract: ${checks} checks passed.`);
console.log('[NOTE] On-screen pixel evidence still requires npm run acceptance:v2 -- --scope=full.');
