/**
 * LEVEL_COMPOSITION_REVIEW -- check the SHIPPED arena map against the hard
 * boundaries the authoring guard exists to enforce.
 *
 * `scripts/author_supermarket_content.py` refuses a placement inside the spawn
 * ring, inside a traffic lane, or outside the camera frame. That guard protects
 * the authoring step and says nothing about what is in the prefab now, and this
 * project has already paid for that gap: a cluster declared in `DistrictTemplates`
 * had no matching `SpawnPoint_*` in the prefab, so nothing was placed, and every
 * gate stayed green because the guard was checking intent rather than data.
 *
 * Scope is deliberate and narrow, because two earlier versions of this gate were
 * wrong in opposite directions:
 *
 *   * It first flagged every `SpawnPoint` inside radius 14. The near-spawn
 *     collectible clusters at radius 4.5/6.5/8.5 are INTENTIONAL -- DESIGN_07
 *     requires "出生点附近必有可吞目标", and a collectible is not an obstacle.
 *     The clearance rule is about static geometry, so that is what is checked.
 *   * It first applied the camera-frame bound to every district. The frame is the
 *     arena's; Warehouse's spawn points sit at z=13 because that is Warehouse.
 *     Only the arena's own map is in scope.
 *
 * Usage: node scripts/review_level_composition.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The arena's district. `ARENA_WORLD_ORIGIN` is cell (6,0) = supermarket. */
const ARENA_MAP = path.join(repoRoot, 'cocos', 'assets', 'game_art', 'maps', 'Supermarket.prefab');

// Mirrors `scripts/author_supermarket_content.py`. Literals on purpose: if the
// guard is loosened, this gate must fail rather than follow it.
const SPAWN_RING_RADIUS = 14.0;
const TRAFFIC_LANE_HALF_WIDTH = 8.0;
const FRAME_MIN_X = -31.0;
const FRAME_MAX_X = 31.0;
const FRAME_MIN_Z = -43.0;
const FRAME_MAX_Z = 11.0;

/** Names that are static geometry rather than something a player can eat. */
const STATIC_OBSTACLE = /^(SupermarketBuilding|SupermarketBoundaryFence|SupermarketTree|DistrictStreetLight|building-|tree-)/;

function loadPrefab(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.data;
}

/**
 * World positions of every node, composing the transform chain.
 *
 * Summing `_lpos` is not enough: these prefabs scale their parents (buildings at
 * 2.5, fences at 1.3 and 4.5, street lights up to 3.8), and a parent's scale
 * multiplies a child's local offset. An earlier version of this gate summed raw
 * offsets and reported a building "in a traffic lane" whose real position was
 * somewhere else entirely. Rotation is composed too, so a rotated parent cannot
 * silently invalidate the result.
 */
function localPositions(arr) {
  const positions = new Map();
  const walk = (index, parentX, parentZ, parentScaleX, parentScaleZ, parentAngle) => {
    const node = arr[index];
    if (!node || node.__type__ !== 'cc.Node') return;
    const p = node._lpos || {};
    const localX = (p.x || 0) * parentScaleX;
    const localZ = (p.z || 0) * parentScaleZ;
    const cos = Math.cos(parentAngle);
    const sin = Math.sin(parentAngle);
    const x = parentX + localX * cos - localZ * sin;
    const z = parentZ + localX * sin + localZ * cos;
    const scale = node._lscale || { x: 1, y: 1, z: 1 };
    positions.set(index, { x, z, name: node._name || '' });
    const euler = node._euler || { x: 0, y: 0, z: 0 };
    const angle = parentAngle + ((euler.y || 0) * Math.PI) / 180;
    for (const child of node._children || []) {
      walk(child.__id__, x, z, parentScaleX * (scale.x ?? 1), parentScaleZ * (scale.z ?? 1), angle);
    }
  };
  for (const [index, node] of arr.entries()) {
    if (node && node.__type__ === 'cc.Node' && !node._parent) walk(index, 0, 0, 1, 1, 0);
  }
  return positions;
}

function main() {
  const arr = loadPrefab(ARENA_MAP);
  const positions = [...localPositions(arr).values()];
  const spawnPoints = positions.filter((entry) => /^SpawnPoint/.test(entry.name));
  const obstacles = positions.filter((entry) => STATIC_OBSTACLE.test(entry.name));

  const failures = [];
  const reports = [];

  // A gate that checks nothing is not a passing gate.
  if (!spawnPoints.length || !obstacles.length) {
    console.error(`[level-composition] FAIL: found ${spawnPoints.length} spawn point(s) and`
      + ` ${obstacles.length} static obstacle(s). One of those being zero means this gate is`
      + ' looking at node names the prefab no longer uses, and it would pass vacuously.');
    process.exit(1);
  }

  // 1. Collectibles must be inside the camera frame, or "there is something to
  //    eat near the spawn" is true only on paper.
  for (const point of spawnPoints) {
    if (!(point.x > FRAME_MIN_X && point.x < FRAME_MAX_X
      && point.z > FRAME_MIN_Z && point.z < FRAME_MAX_Z)) {
      failures.push(`${point.name} at (${point.x.toFixed(1)}, ${point.z.toFixed(1)}) is outside the`
        + ` camera frame (x ${FRAME_MIN_X}..${FRAME_MAX_X}, z ${FRAME_MIN_Z}..${FRAME_MAX_Z})`);
    }
  }

  // 2. Nothing static ON the spawn ring: seven rivals are placed on radius 14.
  const RING_BAND = 1.5;
  for (const obstacle of obstacles) {
    const radius = Math.hypot(obstacle.x, obstacle.z);
    if (Math.abs(radius - SPAWN_RING_RADIUS) <= RING_BAND) {
      failures.push(`${obstacle.name} at radius ${radius.toFixed(2)} sits on the spawn ring`
        + ` (${SPAWN_RING_RADIUS} +/- ${RING_BAND}), where rivals are placed`);
    }
  }

  // 3. Static geometry in the traffic lanes: the lanes carry moving vehicles.
  for (const obstacle of obstacles) {
    if (Math.abs(obstacle.x) <= TRAFFIC_LANE_HALF_WIDTH || Math.abs(obstacle.z) <= TRAFFIC_LANE_HALF_WIDTH) {
      failures.push(`${obstacle.name} at (${obstacle.x.toFixed(1)}, ${obstacle.z.toFixed(1)})`
        + ` sits in a traffic lane (half-width ${TRAFFIC_LANE_HALF_WIDTH})`);
    }
  }

  // 4. Reported, not failed: static geometry inside radius 14 but off the ring.
  //    District street furniture legitimately sits there, and the authoring
  //    guard's radius rule was written for authored clusters. Recorded so the
  //    number is visible rather than silently absent.
  const insideRing = obstacles.filter((entry) => Math.hypot(entry.x, entry.z) < SPAWN_RING_RADIUS);
  reports.push(`${insideRing.length} static node(s) inside radius ${SPAWN_RING_RADIUS} but off the`
    + ` ring: ${[...new Set(insideRing.map((entry) => entry.name.replace(/[_-]?\d+$/, '')))].join(', ') || 'none'}`);

  console.log(`[level-composition] ${spawnPoints.length} spawn point(s), ${obstacles.length} static`
    + ` obstacle(s) in the arena map`);
  for (const line of reports) console.log(`  ${line}`);

  const BASELINE = path.join(repoRoot, 'cocos', 'docs', 'evidence', 'v13', 'level-composition-baseline.json');
  const sorted = failures.slice().sort();
  if (process.argv.includes('--update-baseline')) {
    mkdirSync(path.dirname(BASELINE), { recursive: true });
    writeFileSync(BASELINE, `${JSON.stringify({
      note: 'Known arena-composition violations. Recorded rather than fixed: each one is a '
        + 'placement inside the shipped map prefab, and moving authored content is a separate '
        + 'piece of work. The gate fails when a violation appears that is not here, and when the '
        + 'count changes -- a fixed-then-reintroduced one is invisible to a membership test.',
      count: sorted.length,
      findings: sorted,
    }, null, 2)}\n`);
    console.log(`[level-composition] baseline written -> ${path.relative(repoRoot, BASELINE)}`);
    return;
  }

  if (!existsSync(BASELINE)) {
    console.error(`[level-composition] FAIL: no baseline at ${path.relative(repoRoot, BASELINE)}.`);
    console.error('  Run with --update-baseline once the current findings have been reviewed.');
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const known = new Set(baseline.findings);
  const added = sorted.filter((finding) => !known.has(finding));

  if (added.length) {
    console.error(`[level-composition] FAIL: ${added.length} violation(s) not in the baseline:`);
    for (const finding of added) console.error(`  + ${finding}`);
    process.exit(1);
  }
  if (baseline.count !== sorted.length) {
    console.error(`[level-composition] FAIL: the baseline records ${baseline.count} violation(s),`
      + ` the map has ${sorted.length} -- the count moved, which a membership test cannot see.`);
    for (const finding of baseline.findings.filter((f) => !sorted.includes(f))) {
      console.error(`  - ${finding}`);
    }
    process.exit(1);
  }
  console.log(`[level-composition] PASS against the baseline: ${sorted.length} known violation(s),`
    + ' none added. These are recorded defects, not accepted ones -- see'
    + ' V13_ART_DIRECTION.md §六.');
}

main();
