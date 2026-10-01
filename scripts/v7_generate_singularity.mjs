/**
 * V7 PHASE 2 Priority 1: generate the black-hole singularity as a real asset.
 *
 * Before V7 the singularity was seven runtime primitives assembled in
 * BlackHoleMachine.buildVisibleGeometry: two cylinders and five tori, each with
 * its own runtime-constructed material. That is the game's highest-frequency and
 * most gameplay-critical object, and the only major visual with no asset behind
 * it.
 *
 * This script emits `cocos/assets/game_art/blackhole/SingularityVortex.glb`
 * containing the same seven parts, at the same sizes and the same local offsets,
 * so the migration is a pure asset swap: the per-frame Euler rotations, the
 * state feedback and every gameplay contract (suction radius, mass, tier,
 * collision, playerWidthRatio) stay exactly as they are.
 *
 * Sizes are taken from BlackHoleMachine.buildVisibleGeometry so the rendered
 * silhouette cannot change:
 *   AbyssBase     cylinder r=1.10 h=0.055  y=0.01
 *   HoleInner     cylinder r=0.56 h=0.075  y=0.06
 *   InnerSwirl    torus 0.38/0.035         y=0.105
 *   MidSwirl      torus 0.55/0.026         y=0.110
 *   OuterSwirl    torus 0.72/0.045         y=0.115
 *   ShimmerSwirl  torus 0.87/0.018         y=0.120
 *   HoleRing      torus 1.03/0.04          y=0.125
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cylinder, torus, writeGlb } from './v7_glb_writer.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(repo, 'cocos', 'assets', 'game_art', 'blackhole', 'SingularityVortex.glb');

/** Hex from MACHINE_PALETTE, converted to the linear 0..1 the glTF spec wants. */
function srgbToLinear(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  // glTF baseColorFactor is linear; the project's hex values are sRGB.
  return channels.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
}

const PARTS = [
  { name: 'AbyssBase', shape: cylinder(1.10, 0.055, 48), translation: [0, 0.01, 0], colour: '#281660' },
  { name: 'HoleInner', shape: cylinder(0.56, 0.075, 48), translation: [0, 0.06, 0], colour: '#05040e' },
  { name: 'InnerSwirl', shape: torus(0.38, 0.035), translation: [0, 0.105, 0], colour: '#e0d5ff' },
  { name: 'MidSwirl', shape: torus(0.55, 0.026), translation: [0, 0.110, 0], colour: '#bca5ff' },
  { name: 'OuterSwirl', shape: torus(0.72, 0.045), translation: [0, 0.115, 0], colour: '#8b62f4' },
  { name: 'ShimmerSwirl', shape: torus(0.87, 0.018), translation: [0, 0.120, 0], colour: '#f2ebff' },
  { name: 'HoleRing', shape: torus(1.03, 0.04), translation: [0, 0.125, 0], colour: '#c8adff' },
];

const primitives = PARTS.map((part) => ({
  name: part.name,
  positions: part.shape.positions,
  normals: part.shape.normals,
  uvs: part.shape.uvs,
  indices: part.shape.indices,
  translation: part.translation,
  material: { name: 'MAT_BLACKHOLE_' + part.name, baseColorFactor: [...srgbToLinear(part.colour), 1] },
}));

const bytes = writeGlb(outFile, primitives, { generator: 'BlackHoleRecycle V7 singularity generator' });
const vertexTotal = primitives.reduce((sum, p) => sum + p.positions.length / 3, 0);
const triangleTotal = primitives.reduce((sum, p) => sum + p.indices.length / 3, 0);
console.log('wrote ' + path.relative(repo, outFile));
console.log('  parts      : ' + primitives.length);
console.log('  vertices   : ' + vertexTotal);
console.log('  triangles  : ' + triangleTotal);
console.log('  bytes      : ' + bytes);

