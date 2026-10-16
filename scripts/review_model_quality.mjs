/**
 * MODEL_QUALITY_REVIEW -- audit every authored GLB for defects that make a model
 * render as something other than what was drawn.
 *
 * Written after three of these were found by hand in one pass: `tile-low.glb`
 * mapped every vertex to one texel (so the district ground could only ever be a
 * flat colour), `paper-scrap.glb` and `trash-bag.glb` did the same, and
 * `battery.glb` has no UV layer at all. Each is invisible in a screenshot -- the
 * model is present, correctly sized and correctly placed -- and each is invisible
 * to a build, which passes. Only reading the geometry finds them.
 *
 * Findings are compared against a recorded baseline, and BOTH the membership and
 * the count must match. Comparing membership alone lets a defect that was fixed
 * and then reintroduced pass silently, and comparing counts alone lets one
 * defect replace another.
 *
 * Usage:
 *   node scripts/review_model_quality.mjs                 # audit, compare to baseline
 *   node scripts/review_model_quality.mjs --update-baseline
 *   node scripts/review_model_quality.mjs --selftest      # prove the detectors fire
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, readAccessor } from './glb_uv_tool.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART_ROOT = path.join(repoRoot, 'cocos', 'assets', 'art');
const BASELINE = path.join(repoRoot, 'cocos', 'docs', 'evidence', 'v13', 'model-quality-baseline.json');

/** A model this far off the ground, or this far off centre, is a real defect. */
const GROUND_EPSILON = 0.02;
const PIVOT_TOLERANCE = 0.05;

/**
 * Models that are MOUNTED PARTS rather than ground-resting objects, so resting at
 * y=0 is the wrong test for them.
 *
 * This is an explicit, reasoned list rather than an inferred rule, because the
 * check cannot know intent: `turbine-wheel` spans -0.3..0.3, symmetric about its
 * origin, which is what a wheel spinning on an axle needs and is the opposite of
 * a defect. The same shape on a collectible would be one.
 */
const MOUNTED_PARTS = new Map([
  ['cocos/assets/art/props/turbine-wheel.glb',
    'spans -0.3..0.3, symmetric about its origin so it can spin on an axle'],
  ['cocos/assets/art/machine-modules/magnetic-turbine.glb',
    'a module mounted on the machine, not placed on the ground'],
]);

function findGlbs(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findGlbs(full, out);
    else if (entry.name.endsWith('.glb')) out.push(full);
  }
  return out.sort();
}

/**
 * The audit for one file. Pure over the parsed GLB, so `--selftest` can hand it
 * a synthetic container and check the detectors fire.
 */
export function auditGlb(filePath, label) {
  const glb = readGlb(filePath);
  const findings = [];
  const meshes = glb.json.meshes || [];
  if (!meshes.length) {
    findings.push({ code: 'NO_MESH', detail: 'the GLB declares no mesh' });
    return { label, findings, meshes: 0, vertices: 0 };
  }

  let vertices = 0;
  let uvMeshCount = 0;
  let groundedCount = 0;
  let centredCount = 0;
  const mountedParts = [];
  // Grounding and pivot are properties of the MODEL, not of each part: a wheel
  // primitive sits at y=-0.3 because it is authored around its axle, and its
  // pivot is its own centre, which is correct. Judging parts reported every
  // wheel in the project as a defect. The union of the file's positions is what
  // a player sees standing on the ground.
  const allX = [];
  const allY = [];
  const allZ = [];

  for (const [meshIndex, mesh] of meshes.entries()) {
    for (const [primIndex, primitive] of mesh.primitives.entries()) {
      const where = `mesh[${meshIndex}] prim[${primIndex}]`;
      const position = readAccessor(glb, primitive.attributes.POSITION);
      vertices += position.accessor.count;
      for (const row of position.values) {
        allX.push(row[0]);
        allY.push(row[1]);
        allZ.push(row[2]);
      }

      const uvIndex = primitive.attributes.TEXCOORD_0;
      if (uvIndex === undefined) {
        findings.push({
          code: 'NO_UV',
          detail: `${where} has no TEXCOORD_0, so no texture can vary across it`,
        });
        continue;
      }
      const uv = readAccessor(glb, uvIndex);
      const distinct = new Set(uv.values.map((row) => `${row[0].toFixed(5)},${row[1].toFixed(5)}`));
      if (distinct.size <= 1) {
        // One texel for the whole mesh: the surface is a flat colour by
        // construction, and binding a texture changes nothing.
        findings.push({
          code: 'DEGENERATE_UV',
          detail: `${where} maps all ${uv.values.length} vertices to one texel`
            + ` (${[...distinct][0]}), so it cannot show any texture detail`,
        });
      } else {
        uvMeshCount += 1;
      }
    }
  }

  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const mountedPart = MOUNTED_PARTS.get(label);
  if (mountedPart) {
    mountedParts.push(`${label}: ${mountedPart}`);
  } else if (Math.abs(minY) <= GROUND_EPSILON) {
    groundedCount += 1;
  } else {
    findings.push({
      code: 'NOT_GROUNDED',
      detail: `the model rests at y=${minY.toFixed(3)} (top ${maxY.toFixed(3)}), not 0`,
    });
  }

  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minZ = Math.min(...allZ);
  const maxZ = Math.max(...allZ);
  const centreX = (minX + maxX) / 2;
  const centreZ = (minZ + maxZ) / 2;
  const sizeX = maxX - minX;
  const sizeZ = maxZ - minZ;
  const offset = Math.hypot(centreX, centreZ);
  // Half a footprint of slack: a model whose pivot sits on an edge or a corner
  // rotates around something the player can see, which is the defect worth
  // reporting. Anything inside that is a deliberate origin choice.
  if (offset <= Math.max(PIVOT_TOLERANCE, Math.max(sizeX, sizeZ) * 0.5)) centredCount += 1;
  else findings.push({
    code: 'OFF_CENTRE_PIVOT',
    detail: `the pivot is ${offset.toFixed(3)} from the footprint centre`
      + ` (footprint ${sizeX.toFixed(2)} x ${sizeZ.toFixed(2)})`,
  });

  return {
    label,
    findings,
    meshes: meshes.length,
    vertices,
    uvMeshes: uvMeshCount,
    grounded: groundedCount,
    centred: centredCount,
    mountedParts,
  };
}

function runAudit() {
  const files = findGlbs(ART_ROOT);
  const results = files.map((file) => auditGlb(file, path.relative(repoRoot, file).replace(/\\/g, '/')));
  const findings = [];
  for (const result of results) {
    for (const finding of result.findings) findings.push(`${result.label}: ${finding.code} -- ${finding.detail}`);
  }
  return { files: files.length, results, findings: findings.sort() };
}

function selftest() {
  // A synthetic container with the one property that matters: every vertex on
  // one texel. Built here rather than taken from disk so the detector is proven
  // against a case that is known to be defective.
  const positions = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]];
  const flatUvs = positions.map(() => [0.5, 0.5]);
  const spreadUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const make = (uvs, name) => {
    const bin = Buffer.alloc(positions.length * 3 * 4 + uvs.length * 2 * 4);
    positions.forEach((p, i) => p.forEach((v, c) => bin.writeFloatLE(v, (i * 3 + c) * 4)));
    const uvBase = positions.length * 3 * 4;
    uvs.forEach((u, i) => u.forEach((v, c) => bin.writeFloatLE(v, uvBase + (i * 2 + c) * 4)));
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bin.length }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.length * 3 * 4 },
        { buffer: 0, byteOffset: uvBase, byteLength: uvs.length * 2 * 4 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: positions.length, type: 'VEC3' },
        { bufferView: 1, componentType: 5126, count: uvs.length, type: 'VEC2' },
      ],
      meshes: [{ name, primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 } }] }],
    };
    const jsonChunk = Buffer.from(JSON.stringify(json), 'utf8');
    const jsonPadded = Buffer.alloc(Math.ceil(jsonChunk.length / 4) * 4, 0x20);
    jsonChunk.copy(jsonPadded);
    const binPadded = Buffer.alloc(Math.ceil(bin.length / 4) * 4);
    bin.copy(binPadded);
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8);
    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonPadded.length, 0);
    jsonHeader.writeUInt32LE(0x4e4f534a, 4);
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binPadded.length, 0);
    binHeader.writeUInt32LE(0x004e4942, 4);
    return Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binPadded]);
  };

  const tmpDir = path.join(repoRoot, 'artifacts', 'qa', 'v13');
  mkdirSync(tmpDir, { recursive: true });
  const flatPath = path.join(tmpDir, 'selftest-degenerate.glb');
  const spreadPath = path.join(tmpDir, 'selftest-spread.glb');
  writeFileSync(flatPath, make(flatUvs, 'degenerate'));
  writeFileSync(spreadPath, make(spreadUvs, 'spread'));

  const cases = [
    ['a mesh with one texel for every vertex', flatPath, 'DEGENERATE_UV', true],
    ['a mesh whose UVs span the tile', spreadPath, 'DEGENERATE_UV', false],
  ];
  let bad = 0;
  for (const [name, file, code, expect] of cases) {
    const result = auditGlb(file, name);
    const hit = result.findings.some((finding) => finding.code === code);
    const ok = hit === expect;
    if (!ok) bad += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${code} ${expect ? 'reported' : 'not reported'}`
      + ` (findings: ${result.findings.map((f) => f.code).join(',') || 'none'})`);
  }
  console.log(`[selftest] ${cases.length - bad} of ${cases.length} cases behaved as intended`);
  process.exit(bad === 0 ? 0 : 1);
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const audit = runAudit();
  console.log(`[model-quality] ${audit.files} GLB(s) audited`);
  for (const result of audit.results) {
    if (!result.findings.length) continue;
    console.log(`  ${result.label}: ${result.findings.map((f) => f.code).join(', ')}`);
  }
  for (const finding of audit.findings) console.log(`    ${finding}`);
  console.log(`[model-quality] ${audit.findings.length} finding(s) across ${audit.files} files`);

  if (process.argv.includes('--update-baseline')) {
    mkdirSync(path.dirname(BASELINE), { recursive: true });
    writeFileSync(BASELINE, `${JSON.stringify({
      note: 'Known model-quality findings. The gate fails when a finding appears '
        + 'that is not here, and also when the total changes -- a fixed-then-'
        + 'reintroduced defect is invisible to a membership test alone.',
      count: audit.findings.length,
      findings: audit.findings,
    }, null, 2)}\n`);
    console.log(`[model-quality] baseline written -> ${path.relative(repoRoot, BASELINE)}`);
    return;
  }

  if (!existsSync(BASELINE)) {
    console.error(`[model-quality] FAIL: no baseline at ${path.relative(repoRoot, BASELINE)}.`);
    console.error('  Run with --update-baseline once the current findings have been reviewed.');
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const known = new Set(baseline.findings);
  const current = new Set(audit.findings);
  const added = audit.findings.filter((finding) => !known.has(finding));
  const removed = baseline.findings.filter((finding) => !current.has(finding));

  if (added.length) {
    console.error(`[model-quality] FAIL: ${added.length} finding(s) that are not in the baseline:`);
    for (const finding of added) console.error(`  + ${finding}`);
  }
  if (baseline.count !== audit.findings.length) {
    console.error(`[model-quality] FAIL: baseline records ${baseline.count} finding(s), audit found`
      + ` ${audit.findings.length} -- a count mismatch means the set moved, not that it improved.`);
    for (const finding of removed) console.error(`  - ${finding}`);
  }
  if (added.length || baseline.count !== audit.findings.length) process.exit(1);
  console.log(`[model-quality] PASS: ${audit.findings.length} finding(s), all recorded in the baseline.`);
}

if (process.argv[1] && process.argv[1].endsWith('review_model_quality.mjs')) main();
