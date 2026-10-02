/**
 * V7 PHASE 5 assets: the authored absorb-burst material.
 *
 * Follows the established PHASE 1 / PHASE 4 generator pattern: a `.mtl` + the
 * `material` importer (not `.material`, which Creator never imports). The uuid
 * is NOT written here; Creator assigns it on import and
 * `scripts/v7_phase5_prefabs.mjs` reads it back from the `.mtl.meta`.
 *
 * ## Why a dedicated material
 *
 * `MAT_BLACKHOLE_PARTICLE` is correct for the PHASE 4 *suction stream*: it is
 * depth-tested, so the stream reads as orbiting the singularity. The absorb
 * burst has the opposite requirement. It is emitted at the absorption point,
 * which is exactly where the object being absorbed still is, and a measured
 * frame showed a T3 cardboard box occluding the whole burst. A vanish flash must
 * not be hidden by the thing that is vanishing.
 *
 * So this material keeps the same `particles/builtin-particle` effect and the
 * additive technique, but overrides the pass depth state to `depthTest: false,
 * depthWrite: false`: the burst always draws on top of the 3D world for its
 * short life. The particle effect itself is unchanged; only the pass state
 * differs, which is what a material asset is for.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cocos = path.join(repo, 'cocos');
const assets = path.join(cocos, 'assets');
const materialsDir = path.join(assets, 'game_art', 'materials');

/** Builtin effect uuids, read from the editor's own effect metadata. */
const EFFECT_PARTICLE = 'd1346436-ac96-4271-b863-1f4fdead95b0';
/** `Default-Particle.png` -> its Texture2D sub-asset. */
const DEFAULT_PARTICLE_TEXTURE = 'b5b27ab1-e740-4398-b407-848fc2b2c897@6c48a';
/** Technique index 0 of `builtin-particle` is `add`. */
const PARTICLE_ADD = 0;

function srgbToLinearChannel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const colorProp = (hex, alpha = 255) => {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) => srgbToLinearChannel(parseInt(v.slice(offset, offset + 2), 16)));
  return {
    __type__: 'cc.Color',
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
    a: alpha,
  };
};

const materialAsset = (name, props) => ({
  __type__: 'cc.Material',
  _name: name,
  _objFlags: 0,
  __editorExtras__: {},
  _native: '',
  _effectAsset: { __uuid__: EFFECT_PARTICLE, __expectedType__: 'cc.EffectAsset' },
  _techIdx: PARTICLE_ADD,
  _defines: [{}],
  _states: [{
    rasterizerState: { cullMode: 0 },
    blendState: { targets: [{}] },
    // The authored override that makes the burst a flash instead of a hidden
    // puff. See the file header.
    depthStencilState: { depthTest: false, depthWrite: false },
  }],
  _props: [props],
});

const materials = [
  {
    name: 'MAT_BLACKHOLE_BURST',
    asset: materialAsset('MAT_BLACKHOLE_BURST', {
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

console.log('\nCreator must import this now; that is what assigns its uuid.');
console.log('Then run scripts/v7_phase5_prefabs.mjs, which reads that uuid back.');
