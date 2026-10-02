/**
 * V7 PHASE 8 district-map ground contract (authored-asset level, non-renderer).
 *
 * Guards the defect PHASE 8 found and fixed: the authored district cell prefabs
 * scaled their FLAT ground tiles by a single scalar, which `scaleVec` expands to
 * (32, 32, 32). The `tile-low` mesh is only ~0.02 m tall, so a 32x Y scale turned
 * the ground into a 0.64 m slab that swallowed the player body (y 0.13-0.19), the
 * contact shadows (y 0.10), every collectible and every low prop. The same scalar
 * bug scaled the crossroad (16 -> (16,16,16)).
 *
 * The authored opening cell (`GoldenCityCell.prefab`) always used (32, 1, 32);
 * the district maps must match it. This test asserts the authored prefab output,
 * so a future re-run of the generator with a scalar scale fails here instead of
 * silently shipping an invisible player again.
 *
 * It does NOT claim on-screen evidence. That requires `acceptance:v2`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cocos = path.join(rootDirectory, 'cocos');
const mapsDirectory = path.join(cocos, 'assets', 'game_art', 'maps');
const openingCellPath = path.join(cocos, 'assets', 'prefabs', 'world', 'GoldenCityCell.prefab');

let checks = 0;
const record = (name, pass, detail) => {
  checks += 1;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  if (!pass) throw new Error(name);
};

const readNodes = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
  .filter((object) => object && object.__type__ === 'cc.Node');
const scaleOf = (node) => node?._lscale || null;
const isFlatTile = (node) => /^GroundTile_\d+$/.test(node._name || '') || node._name === 'MainCrossroad';
const describe = (node) => `${node._name}=(${scaleOf(node)?.x},${scaleOf(node)?.y},${scaleOf(node)?.z})`;

// --- 1. The opening cell is the reference: its flat tiles keep Y at 1. --------
const openingFlat = readNodes(openingCellPath).filter(isFlatTile);
// The opening cell is 64x64 m over two 32 m ground tiles plus the crossroad.
record('OPENING_CELL_FLAT_TILES_PRESENT', openingFlat.length >= 3,
  `${openingFlat.length} flat tiles in GoldenCityCell.prefab`);
record('OPENING_CELL_FLAT_TILES_KEEP_Y_AT_ONE', openingFlat.every((node) => scaleOf(node)?.y === 1),
  openingFlat.map(describe).join(' '));

const openingGround = openingFlat.find((node) => node._name === 'GroundTile_1');
const openingCrossroad = openingFlat.find((node) => node._name === 'MainCrossroad');
const referenceGround = { x: scaleOf(openingGround)?.x, y: 1, z: scaleOf(openingGround)?.z };
const referenceCrossroad = { x: scaleOf(openingCrossroad)?.x, y: 1, z: scaleOf(openingCrossroad)?.z };

// --- 2. Every authored district map must match the reference. ----------------
const mapFiles = fs.readdirSync(mapsDirectory).filter((name) => name.endsWith('.prefab')).sort();
record('DISTRICT_MAPS_PRESENT', mapFiles.length === 7, `${mapFiles.length} district map prefabs`);

for (const file of mapFiles) {
  const flat = readNodes(path.join(mapsDirectory, file)).filter(isFlatTile);
  record(`DISTRICT_MAP_${file.replace('.prefab', '').toUpperCase()}_FLAT_TILES_PRESENT`, flat.length >= 5,
    `${flat.length} flat tiles`);
  // The defect signature: Y scale equal to the footprint scale (32 or 16).
  const slabTiles = flat.filter((node) => scaleOf(node)?.y !== 1);
  record(`DISTRICT_MAP_${file.replace('.prefab', '').toUpperCase()}_NO_GROUND_SLAB`, slabTiles.length === 0,
    slabTiles.length === 0 ? 'all flat tiles keep Y=1' : `slab tiles: ${slabTiles.map(describe).join(' ')}`);

  const ground = flat.filter((node) => node._name === 'GroundTile_1')[0];
  const crossroad = flat.filter((node) => node._name === 'MainCrossroad')[0];
  const groundMatches = ground
    && scaleOf(ground).x === referenceGround.x && scaleOf(ground).z === referenceGround.z;
  const crossroadMatches = crossroad
    && scaleOf(crossroad).x === referenceCrossroad.x && scaleOf(crossroad).z === referenceCrossroad.z;
  record(`DISTRICT_MAP_${file.replace('.prefab', '').toUpperCase()}_MATCHES_OPENING_FOOTPRINT`,
    Boolean(groundMatches && crossroadMatches),
    `ground ${ground ? describe(ground) : 'missing'} vs reference (${referenceGround.x},1,${referenceGround.z}); `
    + `crossroad ${crossroad ? describe(crossroad) : 'missing'} vs reference (${referenceCrossroad.x},1,${referenceCrossroad.z})`);
}

// --- 3. The generator recipe must not reintroduce a scalar flat-tile scale. ---
const generator = fs.readFileSync(path.join(rootDirectory, 'scripts', 'v7_phase3_maps.mjs'), 'utf8');
record('GENERATOR_GROUND_USES_EXPLICIT_Y_ONE', generator.includes("'GroundTile_1', -16, -16, [32, 1, 32], 0, 0.01)"),
  'GroundTile_1 is placed with an explicit [32, 1, 32]');
record('GENERATOR_CROSSROAD_USES_EXPLICIT_Y_ONE', generator.includes("'MainCrossroad', 0, 0, [16, 1, 16], 0, 0.05)"),
  'MainCrossroad is placed with an explicit [16, 1, 16]');

console.log(`\n[PASS] District map ground contract holds (${checks} checks).`);
