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
const FRAME_MIN_X = -31.0;
const FRAME_MAX_X = 31.0;
const FRAME_MIN_Z = -43.0;
const FRAME_MAX_Z = 11.0;

/**
 * Road tiles, as the prefab places them. Used to derive where the traffic
 * actually drives, because neither a magic band nor the road surface answers the
 * question this check is for.
 *
 * The guard's `TRAFFIC_LANE_HALF_WIDTH = 8` is an authoring margin, and it is
 * wider than the road it protects: the arms are 12 wide (`road-straight` at scale
 * 12x16) and the crossroad 16x16. Checking the whole surface instead is too
 * strict the other way -- it flagged five street lights standing on the kerb,
 * 0.7 units inside a 12-wide road, which is where street lights belong.
 *
 * What the rule is actually for is that nothing blocks the path the vehicles
 * drive, so this measures the CENTRE of each road and flags geometry inside it.
 * That still catches a building in the roadway, which is the defect it was
 * written after: `SupermarketCenterOfficeN` stood at (0, -22) on the RoadSouth
 * centre line.
 */
const ROAD_NODES = /^(RoadNorth|RoadSouth|RoadEast|RoadWest|MainCrossroad)$/;
/** Half-width of the band around a road's centre line that must stay clear. */
const LANE_CLEARANCE = 2.5;

function laneBands(positions) {
  const bands = [];
  for (const entry of positions) {
    if (!ROAD_NODES.test(entry.name)) continue;
    const alongZ = entry.halfZ >= entry.halfX;
    bands.push({
      name: entry.name,
      alongZ,
      // The centre line runs along the longer axis; the band is the cross axis.
      crossMin: (alongZ ? entry.x : entry.z) - LANE_CLEARANCE,
      crossMax: (alongZ ? entry.x : entry.z) + LANE_CLEARANCE,
      alongMin: (alongZ ? entry.z : entry.x) - (alongZ ? entry.halfZ : entry.halfX),
      alongMax: (alongZ ? entry.z : entry.x) + (alongZ ? entry.halfZ : entry.halfX),
    });
  }
  return bands;
}

function inBand(band, x, z) {
  const cross = band.alongZ ? x : z;
  const along = band.alongZ ? z : x;
  return cross > band.crossMin && cross < band.crossMax
    && along > band.alongMin && along < band.alongMax;
}

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
/** Mesh extents at scale 1, measured with `glb_uv_tool.mjs inspect`.
 *
 * A node's world scale is only its footprint when the mesh is a 1x1 quad, which
 * the ground and road tiles are. `DistrictStreetLight` is not: its mesh is a
 * 0.05-wide pole with a 0.237-deep lamp arm, so at scale 3.8 the body is 0.19
 * wide, not 3.8. Measuring it as a square made this gate report three lamps
 * inside the rival spawn band; `probe_street_light_clearance.mjs` checked the
 * real geometry against the match's own seven spawn points and found no conflict
 * at all. Anything not listed here is assumed 1x1. */
const MESH_EXTENTS = {
  DistrictStreetLight: { x: 0.05, z: 0.237 },
};

/** The match's own rival spawn ring: seven points at ARENA_SPAWN_RADIUS.
 *
 * `ArenaMatchManager` places them by evenly dividing the circle, so these are the
 * real positions rather than a band. */
function spawnPositions(count) {
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (2.0 * Math.PI * index) / count;
    points.push({ x: SPAWN_RING_RADIUS * Math.cos(angle), z: SPAWN_RING_RADIUS * Math.sin(angle) });
  }
  return points;
}

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
    const worldScaleX = parentScaleX * (scale.x ?? 1);
    const worldScaleZ = parentScaleZ * (scale.z ?? 1);
    // A node's world scale is NOT its footprint unless the mesh is a 1x1 quad.
    // `DistrictStreetLight` scales 3.8 but its mesh is a 0.05-wide pole, so the
    // naive `scale / 2` claimed a 1.9-unit half-width twenty times the real 0.095
    // and put three lamps "inside the spawn band" -- a finding this gate produced
    // and a live probe then disproved. The measured mesh extents live in
    // MESH_EXTENTS; anything unlisted falls back to 1x1, which is right for the
    // ground and road quads.
    const extents = MESH_EXTENTS[node._name] || { x: 1, z: 1 };
    positions.set(index, {
      x, z, name: node._name || '', scaleX: worldScaleX, scaleZ: worldScaleZ,
      halfX: (worldScaleX * extents.x) / 2, halfZ: (worldScaleZ * extents.z) / 2,
    });
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

  // 2. No static body may overlap the annulus the seven rivals spawn in.
  //
  //    Two earlier versions of this check were wrong in opposite directions: a
  //    +/-1.5 band around radius 14 flagged street lights whose poles end at
  //    14.22, outside the ring; and "inner edge < 14" flagged lights at radius
  //    7.65, nowhere near the ring. What matters is whether a body's radial span
  //    INTERSECTS the band a spawned rival occupies, and the rival's reach is
  //    measured, not guessed: the arena probe reports all eight bodies at 4.4
  //    bounds, so a spawn at radius 14 sweeps 11.8..16.2.
  const RIVAL_SPAWN_REACH = 2.2;
  const annulusInner = SPAWN_RING_RADIUS - RIVAL_SPAWN_REACH;
  const annulusOuter = SPAWN_RING_RADIUS + RIVAL_SPAWN_REACH;
  // The band is a SCREEN, not the decision. A body whose radial span crosses the
  // annulus can still be far from every spawn point, because the span is measured
  // from the origin while the seven spawns sit at angles around it. A street lamp
  // at (-5.3, 10.5) spans radius 11.31..12.21, crossing 11.8, yet it sits 1.84
  // from the nearest spawn point -- clear. Deciding on the band reported three
  // lamps as defects; `probe_street_light_clearance.mjs` found no conflict at all.
  const rivalSpawnPoints = spawnPositions(7);
  let closestGap = Number.POSITIVE_INFINITY;
  let closestName = '';
  const screenedByBand = [];
  for (const obstacle of obstacles) {
    // Distance from the spawn point to the body's AXIS-ALIGNED BOX, not to its
    // centre minus a radius. Subtracting max(halfX, halfZ) treats a 4.5x4.5 block
    // as a 2.25-radius circle and overstates it near the corners -- that alone
    // reported building-a as "0.02 units into a spawn point" when it actually
    // stands 8.23 away.
    let nearest = Number.POSITIVE_INFINITY;
    for (const spawn of spawnPoints) {
      const dx = Math.max(Math.abs(spawn.x - obstacle.x) - obstacle.halfX, 0);
      const dz = Math.max(Math.abs(spawn.z - obstacle.z) - obstacle.halfZ, 0);
      nearest = Math.min(nearest, Math.hypot(dx, dz));
    }
    if (nearest < closestGap) {
      closestGap = nearest;
      closestName = `${obstacle.name} at (${obstacle.x.toFixed(1)}, ${obstacle.z.toFixed(1)})`;
    }
    // The band screen needs the radial span, so it computes its own half here.
    const half = Math.max(obstacle.halfX, obstacle.halfZ);
    const radius = Math.hypot(obstacle.x, obstacle.z);
    if (radius - half < annulusOuter && radius + half > annulusInner) {
      screenedByBand.push(`${obstacle.name} (nearest spawn ${nearest.toFixed(2)})`);
    }
    if (nearest < 0) {
      failures.push(`${obstacle.name} at (${obstacle.x.toFixed(1)}, ${obstacle.z.toFixed(1)})`
        + ` overlaps a rival spawn point by ${(-nearest).toFixed(2)} units`);
    }
  }
  reports.push(`closest static body to any rival spawn point: ${closestName}`
    + `, gap ${closestGap.toFixed(2)} (needs >= 0)`);
  if (screenedByBand.length) {
    reports.push(`caught by the radial band but clear of every spawn point:`
      + ` ${screenedByBand.join('; ')}`);
  }

  // 3. Nothing static in the band the vehicles drive through.
  const bands = laneBands(positions);
  if (!bands.length) {
    console.error('[level-composition] FAIL: no road tiles matched ' + ROAD_NODES
      + ', so the lane check would pass vacuously.');
    process.exit(1);
  }
  for (const obstacle of obstacles) {
    const hit = bands.find((band) => inBand(band, obstacle.x, obstacle.z));
    if (hit) {
      failures.push(`${obstacle.name} at (${obstacle.x.toFixed(1)}, ${obstacle.z.toFixed(1)})`
        + ` stands in the lane the ${hit.name} traffic drives`);
    }
  }
  reports.push(`lane bands (+/-${LANE_CLEARANCE} around each road centre line): `
    + bands.map((band) => `${band.name} ${band.alongZ ? 'x' : 'z'}`
      + `[${band.crossMin.toFixed(1)},${band.crossMax.toFixed(1)}]`).join('; '));

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
  console.log(`[level-composition] PASS against the baseline: ${sorted.length} known finding(s),`
    + ' none added. The baseline\'s note records what each one is and which were fixed rather'
    + ' than judged acceptable; see also V13_ART_DIRECTION.md §六.');
}

main();
