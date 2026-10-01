/**
 * V7 PHASE 3: generate the shared MaterialLibrary as real assets.
 *
 * Before V7 the repository contained zero .material assets. Every material in
 * the game was constructed in TypeScript at one of four sites, so the look of
 * the world could not be inspected, diffed or tuned without recompiling, and
 * there was nothing for an artist to edit.
 *
 * This script writes the seven category materials the brief names. Creator then
 * imports them through its asset database, which is the only thing that may
 * assign a uuid, so the .meta files are produced by the editor rather than
 * hand-written.
 *
 * Deliberately NOT a collapse of the per-kind tints: the world has 69 art kinds
 * that share five colour atlases and are told apart by a per-kind tint. The
 * assets own the *material definition* (effect, technique, blend state, base
 * colour, atlas) and the runtime keeps supplying the per-kind tint on top, so
 * this migration removes scattered material construction without flattening
 * the world into seven colours.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repo, 'cocos', 'assets', 'game_art', 'materials');

/** Builtin effect uuids, read from the editor's own effect metadata. */
const EFFECT_UNLIT = 'a3cd009f-0ab0-420d-9278-b9fdab939bbc';

/** The seven categories, with the base colour each one carries. */
const MATERIALS = [
  { name: 'MAT_GRASS', colour: '#a6e894', texture: true, note: 'ground and grass tiles' },
  { name: 'MAT_ROAD', colour: '#e8edf5', texture: true, note: 'road, crossroad, kerb, street furniture' },
  { name: 'MAT_BUILDING', colour: '#f7b267', texture: true, note: 'residential and commercial architecture' },
  { name: 'MAT_VEGETATION', colour: '#69bf71', texture: true, note: 'trees, hedges, bushes, flowerbeds' },
  { name: 'MAT_VEHICLE', colour: '#ef476f', texture: true, note: 'traffic vehicles and the player chassis' },
  { name: 'MAT_PROP', colour: '#c68b59', texture: true, note: 'street props and recyclable collectibles' },
  { name: 'MAT_METAL', colour: '#90a4ae', texture: false, note: 'untextured metal parts' },
  { name: 'MAT_BLACKHOLE', colour: '#281660', texture: false, note: 'singularity core parts' },
];

function srgbToLinearChannel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toLinearColour(hex) {
  const v = hex.replace('#', '');
  return [0, 2, 4].map((offset) => srgbToLinearChannel(parseInt(v.slice(offset, offset + 2), 16)));
}

/**
 * A cc.Material asset. Shape matches what Creator's own glTF importer writes,
 * which is the authoritative sample in this repository.
 */
function materialAsset(name, colour, hasTexture) {
  const [r, g, b] = toLinearColour(colour);
  const defines = {
    USE_TEXTURE: hasTexture,
    USE_VERTEX_COLOR: false,
  };
  return {
    __type__: 'cc.Material',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    _effectAsset: { __uuid__: EFFECT_UNLIT, __expectedType__: 'cc.EffectAsset' },
    _techIdx: 0,
    _defines: [defines],
    _states: [{
      rasterizerState: { cullMode: 0 },
      blendState: { targets: [{}] },
      depthStencilState: {},
    }],
    _props: [{
      mainColor: { __type__: 'cc.Color', r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a: 255 },
      tilingOffset: { __type__: 'cc.Vec4', x: 1, y: 1, z: 0, w: 0 },
    }],
  };
}

mkdirSync(outDir, { recursive: true });
for (const material of MATERIALS) {
  const file = path.join(outDir, material.name + '.material');
  writeFileSync(file, JSON.stringify(materialAsset(material.name, material.colour, material.texture), null, 2) + '\n', 'utf8');
  console.log('wrote ' + material.name + '.material  ' + material.colour + '  (' + material.note + ')');
}
console.log('\n' + MATERIALS.length + ' category materials written to ' + path.relative(repo, outDir));
console.log('Creator will assign their uuids on import.');

