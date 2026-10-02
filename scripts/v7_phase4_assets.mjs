/**
 * V7 PHASE 4 assets: the authored rim-energy material, the authored suction
 * particle material, and the authored rim-energy mesh.
 *
 * Follows the established PHASE 1 / PHASE 2 generator pattern:
 *   - a `.mtl` + the `material` importer (not `.material`, which Creator never
 *     imported and which is why the first attempt shipped nothing);
 *   - a real GLB emitted through `scripts/v7_glb_writer.mjs`, so the rim-energy
 *     geometry is an authored mesh and not a runtime `primitives.torus`;
 *   - the material uuids are NOT written here. Creator assigns them on import,
 *     and `v7_phase4_prefabs.mjs` reads them back from the `.mtl.meta` files.
 *     That is what stops this generator from inventing uuids that would dangle.
 *
 * Two authored materials:
 *
 *   MAT_BLACKHOLE_RIM       `builtin-unlit`, technique 2 = `add`.
 *                           Additive is the whole point: the existing rim is an
 *                           opaque unlit torus, so a second ring that only
 *                           changes colour would still read as "another flat
 *                           torus". Additive makes it read as emitted light.
 *
 *   MAT_BLACKHOLE_PARTICLE  `builtin-particle`, technique 0 = `add`, with the
 *                           Default-Particle texture bound. The particle
 *                           material is deliberately a *different* effect from
 *                           `builtin-unlit`: particles are their own pipeline in
 *                           Creator and the builtin particle effect is the only
 *                           one that consumes the particle vertex stream. The
 *                           unlit decision is about the *world and machine*
 *                           materials and is untouched.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { torus, writeGlb } from './v7_glb_writer.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cocos = path.join(repo, 'cocos');
const assets = path.join(cocos, 'assets');
const materialsDir = path.join(assets, 'game_art', 'materials');
const blackholeDir = path.join(assets, 'game_art', 'blackhole');

/** Builtin effect uuids, read from the editor's own effect metadata. */
const EFFECT_UNLIT = 'a3cd009f-0ab0-420d-9278-b9fdab939bbc';
const EFFECT_PARTICLE = 'd1346436-ac96-4271-b863-1f4fdead95b0';
/**
 * `Default-Particle.png` -> its Texture2D sub-asset. The particle renderer reads
 * `mainTexture` off this material (`particle-system-renderer-cpu.ts`
 * `updateMaterialParams`), so the slot has to be bound here rather than left to
 * the engine default.
 */
const DEFAULT_PARTICLE_TEXTURE = 'b5b27ab1-e740-4398-b407-848fc2b2c897@6c48a';

/** Technique index 2 of `builtin-unlit` is `add`. */
const UNLIT_ADD = 2;
/** Technique index 0 of `builtin-particle` is `add`. */
const PARTICLE_ADD = 0;

function srgbToLinearChannel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toLinearColour(hex) {
  const v = hex.replace('#', '');
  return [0, 2, 4].map((offset) => srgbToLinearChannel(parseInt(v.slice(offset, offset + 2), 16)));
}

const colorProp = (hex, alpha = 255) => {
  const [r, g, b] = toLinearColour(hex);
  return {
    __type__: 'cc.Color',
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
    a: alpha,
  };
};

/**
 * A `cc.Material` asset, shape-matched to what Creator's own importer writes.
 *
 * `technique` selects the effect's technique; `props` is the property block.
 * The runtime keeps tinting `mainColor` on the renderer-local instance, exactly
 * as the PHASE 1 library does, so this asset owns the *definition* (effect,
 * technique, blend state) and the level supplies the hue.
 */
function materialAsset(name, effectUuid, technique, props) {
  return {
    __type__: 'cc.Material',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    _effectAsset: { __uuid__: effectUuid, __expectedType__: 'cc.EffectAsset' },
    _techIdx: technique,
    _defines: [{}],
    _states: [{
      rasterizerState: { cullMode: 0 },
      blendState: { targets: [{}] },
      depthStencilState: {},
    }],
    _props: [props],
  };
}

/**
 * The rim-energy material's base colour. It is tinted per level at runtime, so
 * this is only the authored fallback; a bright violet keeps it legible if a
 * level profile ever fails to resolve.
 */
const RIM_BASE_COLOUR = '#b18cff';

const materials = [
  {
    name: 'MAT_BLACKHOLE_RIM',
    asset: materialAsset('MAT_BLACKHOLE_RIM', EFFECT_UNLIT, UNLIT_ADD, {
      mainColor: colorProp(RIM_BASE_COLOUR),
      tilingOffset: { __type__: 'cc.Vec4', x: 1, y: 1, z: 0, w: 0 },
    }),
  },
  {
    name: 'MAT_BLACKHOLE_PARTICLE',
    asset: materialAsset('MAT_BLACKHOLE_PARTICLE', EFFECT_PARTICLE, PARTICLE_ADD, {
      mainTexture: { __uuid__: DEFAULT_PARTICLE_TEXTURE, __expectedType__: 'cc.Texture2D' },
      mainTiling_Offset: { __type__: 'cc.Vec4', x: 1, y: 1, z: 0, w: 0 },
      tintColor: colorProp('#ffffff'),
    }),
  },
];

mkdirSync(materialsDir, { recursive: true });
for (const material of materials) {
  const file = path.join(materialsDir, material.name + '.mtl');
  writeFileSync(file, JSON.stringify(material.asset, null, 2) + '\n', 'utf8');
  console.log('wrote ' + path.relative(repo, file).split(path.sep).join('/'));
}

/**
 * The rim-energy mesh: two thin rings, not the opaque rim tube.
 *
 * `HoleRing` is `torus(1.03, 0.04)` — a 4 cm tube, which is what reads as a
 * solid outline. These are 1.4 cm and 0.8 cm, i.e. blades of light rather than
 * tubes, at radii just inside the structural body's 1.10 m half-extent so they
 * can never enlarge the silhouette even if the exclusion list were wrong.
 */
const RING_PARTS = [
  { name: 'RimEnergyBlade', shape: torus(1.045, 0.014, 64, 10), translation: [0, 0.128, 0] },
  { name: 'RimEnergyHalo', shape: torus(1.075, 0.008, 64, 8), translation: [0, 0.135, 0] },
];

const primitives = RING_PARTS.map((part) => ({
  name: part.name,
  positions: part.shape.positions,
  normals: part.shape.normals,
  uvs: part.shape.uvs,
  indices: part.shape.indices,
  translation: part.translation,
  // The GLB's own embedded material is never used: `ArtLoader` normalises every
  // renderer onto the profile effect, and the prefab references the authored
  // additive `MAT_BLACKHOLE_RIM`. This colour only keeps the source file sane.
  material: { name: 'MAT_BLACKHOLE_RIM_SOURCE_' + part.name, baseColorFactor: [...toLinearColour(RIM_BASE_COLOUR), 1] },
}));

const outGlb = path.join(blackholeDir, 'RimEnergyRing.glb');
const bytes = writeGlb(outGlb, primitives, { generator: 'BlackHoleRecycle V7 rim-energy generator' });
console.log('wrote ' + path.relative(repo, outGlb).split(path.sep).join('/') + '  (' + bytes + ' bytes, '
  + primitives.length + ' parts)');

console.log('\nCreator must import these now; that is what assigns their uuids.');
console.log('Then run scripts/v7_phase4_prefabs.mjs, which reads those uuids back.');
