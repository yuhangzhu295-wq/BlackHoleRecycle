/**
 * Locks the deliberate divergence between the two open-ground instruments.
 *
 * Two independent implementations classify the same screen-space samples:
 *
 *   - `WorldCompositionProbe.estimateEmptyGround` (TypeScript, ships in the
 *     game) produces `largeEmptyGroundRatio` = emptyGroundSamples / groundSamples.
 *     It treats ROAD as an occupant, so road counts as *covered*: the ratio is a
 *     crowding ceiling.
 *   - `computeScreenSpaceBudget` (capture_v4_design_evidence.mjs, QA-only)
 *     produces `openShare`. It treats ROAD as *open walkable ground*, because a
 *     road is somewhere the machine can drive.
 *
 * Both statements are true of different questions, so the two must NOT agree on
 * road. Unifying them is not a cleanup: the counterfactual recorded in
 * `final-acceptance-matrix.md` shows that making `estimateEmptyGround` call a
 * road open moves the gate to 0.858 and fails it. This contract fails if either
 * side is "simplified" into the other, or if the shared sampling frame drifts
 * while only one side is updated.
 *
 * Both implementations are executed for real, on identical synthetic entries.
 * The probe's file imports `cc`, so the method is lifted out of its class by
 * brace matching and type-stripped with esbuild rather than imported — the same
 * source-execution approach `test_cell_lifecycle_contract.mjs` uses.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const probePath = path.join(root, 'cocos/assets/scripts/dev/qa/WorldCompositionProbe.ts');
const budgetPath = path.join(root, 'scripts/capture_v4_design_evidence.mjs');

const assert = (condition, message) => {
  console.log('[' + (condition ? 'PASS' : 'FAIL') + '] ' + message);
  if (!condition) throw new Error(message);
};

/** If a literal or comment starts at `index`, returns the index just past it. */
function skipLiteralOrComment(source, index) {
  const char = source[index];
  const next = source[index + 1];
  if (char === '/' && next === '/') {
    const end = source.indexOf('\n', index);
    return end === -1 ? source.length : end + 1;
  }
  if (char === '/' && next === '*') {
    const end = source.indexOf('*/', index + 2);
    return end === -1 ? source.length : end + 2;
  }
  if (char === '"' || char === "'" || char === '`') {
    let cursor = index + 1;
    while (cursor < source.length && source[cursor] !== char) {
      if (source[cursor] === '\\') cursor += 1;
      cursor += 1;
    }
    return cursor + 1;
  }
  return -1;
}

/** Index of the bracket matching the one at `openIndex`. */
function matchBalanced(source, openIndex, openChar, closeChar) {
  let depth = 0;
  let index = openIndex;
  while (index < source.length) {
    const skipped = skipLiteralOrComment(source, index);
    if (skipped !== -1) {
      index = skipped;
      continue;
    }
    const char = source[index];
    if (char === openChar) depth += 1;
    else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  throw new Error(`CONTRACT_SOURCE_UNBALANCED: no matching "${closeChar}" after index ${openIndex}`);
}

/**
 * Returns the source slice of a callable declaration, from its name through its
 * closing body brace. The parameter list is matched first, because a parameter's
 * type can itself contain braces (`viewport: Readonly<{ x: number }>`), and a
 * naive search for the first `{` would stop inside the signature.
 */
function sliceCallable(source, declaration) {
  const start = source.indexOf(declaration);
  if (start === -1) {
    throw new Error(`CONTRACT_SOURCE_NOT_FOUND: could not locate "${declaration}"`);
  }
  const openParen = source.indexOf('(', start);
  if (openParen === -1) {
    throw new Error(`CONTRACT_SOURCE_NOT_FOUND: no parameter list after "${declaration}"`);
  }
  const closeParen = matchBalanced(source, openParen, '(', ')');
  const openBrace = source.indexOf('{', closeParen);
  if (openBrace === -1) {
    throw new Error(`CONTRACT_SOURCE_NOT_FOUND: no body after "${declaration}"`);
  }
  const closeBrace = matchBalanced(source, openBrace, '{', '}');
  return source.slice(start, closeBrace + 1);
}

/** Lifts `estimateEmptyGround` out of the probe class and strips its types. */
function loadProbeEmptyGround() {
  const source = fs.readFileSync(probePath, 'utf8');
  const method = sliceCallable(source, 'private static estimateEmptyGround(')
    .replace('private static estimateEmptyGround(', 'function estimateEmptyGround(');
  const compiled = transformSync(`${method}\nglobalThis.__estimateEmptyGround = estimateEmptyGround;`, {
    loader: 'ts',
    target: 'es2022',
    format: 'iife',
  }).code;
  new Function(compiled)();
  const fn = globalThis.__estimateEmptyGround;
  delete globalThis.__estimateEmptyGround;
  return fn;
}

/** Lifts the QA-only budget out of its module and executes it. */
function loadScreenSpaceBudget() {
  const source = fs.readFileSync(budgetPath, 'utf8');
  const fn = sliceCallable(source, 'function computeScreenSpaceBudget(');
  return new Function(`${fn}\nreturn computeScreenSpaceBudget;`)();
}

const estimateEmptyGround = loadProbeEmptyGround();
const computeScreenSpaceBudget = loadScreenSpaceBudget();

// One viewport and one full-bleed ground region. Each scene then adds exactly
// one feature, so a failing identity names the single policy that moved.
const viewport = { x: 0, y: 0, width: 390, height: 844 };
const groundBounds = { left: 0, top: 0, right: 390, bottom: 844 };
const roadBounds = { left: 0, top: 400, right: 390, bottom: 500 };
const clusterBounds = { left: 100, top: 200, right: 140, bottom: 240 };

const measure = (features) => {
  const entries = [
    { category: 'GROUND', visible: true, screenBounds: groundBounds },
    ...features,
  ];
  return {
    probe: estimateEmptyGround(entries, viewport),
    budget: computeScreenSpaceBudget({ status: 'MEASURED', entries }, viewport),
  };
};

// Scene A: ground plus a road. Isolates the road policy, which is the one the
// gate depends on, because both sides see road as an occupant of the sample
// grid and only disagree on what that means.
const road = measure([{ category: 'ROAD', visible: true, screenBounds: roadBounds }]);
const probe = road.probe;
const budget = road.budget;

assert(probe && budget && budget.status === 'MEASURED',
  'BOTH_INSTRUMENTS_EXECUTED: probe and budget both returned a measurement');
assert(probe.groundSamples === budget.groundSamples && probe.groundSamples > 0,
  `SHARED_GROUND_SAMPLES: probe ${probe.groundSamples} === budget ${budget.groundSamples}`);
assert(JSON.stringify(probe.grid) === JSON.stringify(budget.grid)
    && JSON.stringify(probe.hudExclusion) === JSON.stringify(budget.hudExclusion),
`SHARED_SAMPLING_FRAME: grid ${JSON.stringify(probe.grid)} and HUD band ${JSON.stringify(probe.hudExclusion)} must match, `
  + `got grid ${JSON.stringify(budget.grid)} / band ${JSON.stringify(budget.hudExclusion)}`);

const probeRoadOccupied = probe.coverageByCategory.ROAD || 0;
assert(probeRoadOccupied > 0,
  `PROBE_COUNTS_ROAD_AS_OCCUPANT: largeEmptyGroundRatio must keep road covered, saw ${probeRoadOccupied} road samples`);
assert(budget.roadOpenSamples === probeRoadOccupied && budget.roadOpenSamples > 0,
`BUDGET_COUNTS_ROAD_AS_OPEN: road samples must land in the open bucket, probe ${probeRoadOccupied} vs budget ${budget.roadOpenSamples}`);

// The exact identity that makes the divergence auditable rather than incidental.
// Every sample the probe calls "not empty" because of road is one the budget
// calls "open", and with only ground and road in the scene nothing else can move.
assert(budget.openSamples - probe.emptyGroundSamples === probeRoadOccupied,
`ROAD_IS_THE_ONLY_DIVERGENCE: openSamples(${budget.openSamples}) - emptyGroundSamples(${probe.emptyGroundSamples}) `
  + `must equal road samples(${probeRoadOccupied})`);
assert(budget.openSamples > probe.emptyGroundSamples,
  'DIVERGENCE_DIRECTION: the crowding ratio stays strictly more conservative than the openness budget');

const bucketed = budget.openSamples + budget.bucketSamples.environment
  + budget.bucketSamples.static + budget.bucketSamples.dynamic + budget.bucketSamples.unclassified;
assert(bucketed === budget.groundSamples,
  `BUCKETS_SUM_TO_GROUND: ${bucketed} must equal groundSamples ${budget.groundSamples}`);

// Scene B: ground plus a resource cluster. A second, independent asymmetry:
// the probe drops clusters from its occupants entirely, while the budget buckets
// them as static. Both are deliberate, and this scene fails if either side is
// brought into line with the other by accident.
const cluster = measure([{ category: 'RESOURCE_CLUSTER', visible: true, screenBounds: clusterBounds }]);
assert(cluster.probe.coverageByCategory.RESOURCE_CLUSTER === undefined && cluster.probe.occupiedSamples === 0,
`PROBE_EXCLUDES_RESOURCE_CLUSTERS: clusters must not count as ground coverage, saw occupied ${cluster.probe.occupiedSamples} `
  + `and categories ${JSON.stringify(cluster.probe.coverageByCategory)}`);
assert(cluster.budget.bucketSamples.static > 0,
  `BUDGET_COUNTS_RESOURCE_CLUSTERS_AS_STATIC: saw static ${cluster.budget.bucketSamples.static}`);
assert(cluster.probe.emptyGroundSamples - cluster.budget.openSamples === cluster.budget.bucketSamples.static,
`CLUSTER_DIVERGENCE_IDENTITY: emptyGroundSamples(${cluster.probe.emptyGroundSamples}) - openSamples(${cluster.budget.openSamples}) `
  + `must equal the static bucket(${cluster.budget.bucketSamples.static})`);

console.log('[PASS] open-ground instrument divergence contract holds');
