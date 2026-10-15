/**
 * ART_DIRECTION_REVIEW -- check that the art-direction spec's measured claims are
 * still true.
 *
 * A spec that records measurements rots the moment the thing it measured moves,
 * and it rots silently: nobody re-reads §八 after changing a texture, and the
 * document keeps asserting a number that no longer describes the build. This
 * project has been bitten by exactly that once already -- the asset guide claimed
 * a 1024x1024 canvas for a long time after the real canvas became 512x512.
 *
 * So the gate reads the spec, extracts the numbers it claims, and compares them
 * against the source of truth each claim points at:
 *
 *   §二  runtime baseline colours  ->  WORLD_PALETTE in RenderProfile.ts
 *   §八  road UV table             ->  the road GLBs' TEXCOORD_0 ranges
 *   §九  hard boundaries           ->  the guard constants in the authoring script
 *
 * Usage: node scripts/review_art_direction.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, readAccessor } from './glb_uv_tool.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(repoRoot, 'cocos', 'docs', 'V13_ART_DIRECTION.md');
const PALETTE_SOURCE = path.join(repoRoot, 'cocos', 'assets', 'scripts', 'core', 'RenderProfile.ts');
const GUARD_SOURCE = path.join(repoRoot, 'scripts', 'author_supermarket_content.py');
const ROADS = path.join(repoRoot, 'cocos', 'assets', 'art', 'world', 'roads');

const failures = [];
const checked = [];

function hexOf(text, label, pattern) {
  const match = text.match(pattern);
  if (!match) {
    failures.push(`${label}: the spec no longer states this claim, so it cannot be checked`);
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function checkColour(label, claimed, actualHex) {
  if (!claimed) return;
  const actual = [
    parseInt(actualHex.slice(1, 3), 16),
    parseInt(actualHex.slice(3, 5), 16),
    parseInt(actualHex.slice(5, 7), 16),
  ];
  const same = claimed.every((value, index) => value === actual[index]);
  checked.push(`${label}: spec rgb(${claimed.join(',')}) vs code ${actualHex}`);
  if (!same) {
    failures.push(`${label}: the spec says rgb(${claimed.join(',')}) but the palette says ${actualHex}`);
  }
}

function main() {
  const spec = readFileSync(SPEC, 'utf8');
  const palette = readFileSync(PALETTE_SOURCE, 'utf8');
  const guards = readFileSync(GUARD_SOURCE, 'utf8');

  // §二 -- the runtime baseline colours the spec calls "health values, to be used
  // as a regression baseline".
  const paletteValue = (key) => {
    const match = palette.match(new RegExp(`${key}:\\s*'(#[0-9a-fA-F]{6})'`));
    if (!match) throw new Error(`WORLD_PALETTE has no ${key}`);
    return match[1];
  };
  checkColour('§二 地面', hexOf(spec, '§二 地面', /地面 `rgba\((\d+),(\d+),(\d+)\)`/), paletteValue('terrainTile'));
  checkColour('§二 道路', hexOf(spec, '§二 道路', /道路 `rgba\((\d+),(\d+),(\d+)\)`/), paletteValue('roadStraight'));
  checkColour('§二 树', hexOf(spec, '§二 树', /树 `rgba\((\d+),(\d+),(\d+)\)`/), paletteValue('treeLarge'));
  checkColour('§二 建筑A', hexOf(spec, '§二 建筑A', /`(\d+),(\d+),(\d+)` \//), paletteValue('commercialBuildingA'));

  // §八 -- the corrected road UV table.
  for (const name of ['road-straight', 'road-crossroad-path']) {
    const row = spec.match(new RegExp(`\\| ${name} \\| ([\\d.]+) – ([\\d.]+) \\| ([\\d.]+) – ([\\d.]+) \\|`));
    if (!row) {
      failures.push(`§八 ${name}: the spec no longer records a UV row for it`);
      continue;
    }
    const glb = readGlb(path.join(ROADS, `${name}.glb`));
    const uv = readAccessor(glb, glb.json.meshes[0].primitives[0].attributes.TEXCOORD_0);
    const u = [Math.min(...uv.values.map((v) => v[0])), Math.max(...uv.values.map((v) => v[0]))];
    const v = [Math.min(...uv.values.map((v) => v[1])), Math.max(...uv.values.map((v) => v[1]))];
    const near = (a, b) => Math.abs(a - b) <= 0.002;
    checked.push(`§八 ${name}: spec u ${row[1]}–${row[2]} v ${row[3]}–${row[4]}`
      + ` vs GLB u ${u[0].toFixed(3)}–${u[1].toFixed(3)} v ${v[0].toFixed(3)}–${v[1].toFixed(3)}`);
    if (!near(Number(row[1]), u[0]) || !near(Number(row[2]), u[1])
      || !near(Number(row[3]), v[0]) || !near(Number(row[4]), v[1])) {
      failures.push(`§八 ${name}: the spec's UV table no longer matches the GLB`);
    }
  }

  // §九 -- the hard boundaries, against the guard that enforces them.
  const guardNumber = (name) => {
    const match = guards.match(new RegExp(`${name}\\s*=\\s*(-?[\\d.]+)`));
    if (!match) throw new Error(`the authoring guard has no ${name}`);
    return Number(match[1]);
  };
  // The frame bounds are declared as one tuple assignment, so the single-name
  // pattern above cannot see them.
  const guardPair = (nameA, nameB) => {
    const match = guards.match(new RegExp(`${nameA},\\s*${nameB}\\s*=\\s*(-?[\\d.]+),\\s*(-?[\\d.]+)`));
    if (!match) throw new Error(`the authoring guard has no ${nameA}, ${nameB} tuple`);
    return [Number(match[1]), Number(match[2])];
  };
  const ring = spec.match(/出生环半径 \*\*(\d+)\*\*/);
  if (!ring) failures.push('§九: the spec no longer states the spawn-ring clearance');
  else {
    const actual = guardNumber('SPAWN_RING_CLEARANCE');
    checked.push(`§九 spawn ring: spec ${ring[1]} vs guard ${actual}`);
    if (Number(ring[1]) !== actual) failures.push(`§九: spec says ring ${ring[1]}, guard uses ${actual}`);
  }
  const lane = spec.match(/各宽 \*\*(\d+)\*\*/);
  if (!lane) failures.push('§九: the spec no longer states the traffic lane half-width');
  else {
    const actual = guardNumber('TRAFFIC_LANE_HALF_WIDTH');
    checked.push(`§九 lane half-width: spec ${lane[1]} vs guard ${actual}`);
    if (Number(lane[1]) !== actual) failures.push(`§九: spec says lane ${lane[1]}, guard uses ${actual}`);
  }
  // The spec writes a Unicode minus; normalise it so the check is about the
  // number and its sign, not about which dash the author typed. The sign is
  // compared exactly -- an earlier version compared magnitudes and would have
  // passed a spec that had the frame mirrored.
  const frame = spec.match(/画面边界实测 \*\*x ([−-]?\d+)\.\.([−-]?\d+)、z ([−-]?\d+)\.\.([−-]?\d+)\*\*/);
  if (!frame) failures.push('§九: the spec no longer states the camera frame bounds');
  else {
    const signed = (text) => Number(text.replace('−', '-'));
    const claimed = [signed(frame[1]), signed(frame[2]), signed(frame[3]), signed(frame[4])];
    const actual = [...guardPair('FRAME_MIN_X', 'FRAME_MAX_X'), ...guardPair('FRAME_MIN_Z', 'FRAME_MAX_Z')];
    checked.push(`§九 frame: spec x ${claimed[0]}..${claimed[1]} z ${claimed[2]}..${claimed[3]}`
      + ` vs guard x ${actual[0]}..${actual[1]} z ${actual[2]}..${actual[3]}`);
    if (claimed.some((value, index) => value !== actual[index])) {
      failures.push('§九: the spec\'s camera frame bounds no longer match the guard');
    }
  }

  for (const line of checked) console.log(`  ${line}`);
  if (failures.length) {
    console.error(`[art-direction] FAIL (${failures.length}):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`[art-direction] PASS: ${checked.length} claim(s) in the spec still match the code and assets.`);
}

main();
