/**
 * Read a GLB, and edit one UV channel or the vertical placement of its geometry.
 *
 * V13 needs the road meshes to stop sampling a five-pixel sliver of a shared
 * atlas, and the fix is a UV change on the mesh -- which means editing a binary
 * container this project has no DCC tool for. The container is documented: a
 * 12-byte header, a JSON chunk and a BIN chunk. Only FLOAT values inside the BIN
 * chunk change here, never its length, so the container stays byte-for-byte valid
 * and the JSON chunk (accessors, bufferViews, offsets) needs no repair.
 *
 * Usage:
 *   node scripts/glb_uv_tool.mjs inspect <file.glb>
 *   node scripts/glb_uv_tool.mjs set-uv <file.glb> --axis u|v --values <a,b> [--write]
 *   node scripts/glb_uv_tool.mjs ground <file.glb> [--write]
 *
 * `set-uv` maps each vertex's chosen axis onto the given pair by its rank: the
 * lowest current value becomes `a`, the highest becomes `b`, everything between
 * is interpolated. Roads are quad strips whose UVs only ever take a handful of
 * distinct values, so a rank mapping is exact and needs no assumption about
 * which end of the strip is which.
 *
 * `ground` shifts every vertex's Y so the model's lowest point sits at 0. The
 * vehicle and prop templates are placed at y=0 and the placement code passes only
 * x and z, so a model whose geometry starts below zero sinks into the road.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function readGlb(filePath) {
  const buffer = readFileSync(filePath);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error(`${filePath} is not a GLB`);
  const version = view.getUint32(4, true);
  const total = view.getUint32(8, true);
  if (total !== buffer.byteLength) {
    throw new Error(`${filePath}: header says ${total} bytes, file is ${buffer.byteLength}`);
  }
  let offset = 12;
  let json = null;
  let binStart = 0;
  let binLength = 0;
  while (offset + 8 <= total) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    // Per spec the trailing padding is included in chunkLength, so the next
    // chunk begins immediately after it.
    if (type === CHUNK_JSON) json = JSON.parse(buffer.subarray(start, start + length).toString('utf8'));
    else if (type === CHUNK_BIN) {
      binStart = start;
      binLength = length;
    }
    offset = start + length;
  }
  if (!json) throw new Error(`${filePath} has no JSON chunk`);
  if (!binLength) throw new Error(`${filePath} has no BIN chunk`);
  return { buffer, json, binStart, binLength, version };
}

/** The absolute file offset of a bufferView, honouring a byteStride if present. */
function viewOffset(glb, bufferViewIndex) {
  const bufferView = glb.json.bufferViews[bufferViewIndex];
  if (bufferView.buffer !== 0) throw new Error('only the first buffer is supported');
  return { start: glb.binStart + (bufferView.byteOffset || 0), view: bufferView };
}

export function readAccessor(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  if (accessor.componentType !== 5126) throw new Error(`accessor ${accessorIndex} is not FLOAT`);
  const stride = accessor.type === 'VEC2' ? 2 : accessor.type === 'VEC3' ? 3 : accessor.type === 'VEC4' ? 4 : 1;
  const { start, view } = viewOffset(glb, accessor.bufferView);
  const byteStride = view.byteStride || stride * 4;
  const values = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const at = start + (accessor.byteOffset || 0) + i * byteStride;
    const row = [];
    for (let c = 0; c < stride; c += 1) row.push(glb.buffer.readFloatLE(at + c * 4));
    values.push(row);
  }
  return { accessor, stride, values, start, byteStride };
}

/** Write one component back. Byte length never changes, so offsets stay valid. */
export function writeAccessorComponent(glb, accessorIndex, component, values) {
  const accessor = glb.json.accessors[accessorIndex];
  const stride = accessor.type === 'VEC2' ? 2 : accessor.type === 'VEC3' ? 3 : 4;
  const { start, view } = viewOffset(glb, accessor.bufferView);
  const byteStride = view.byteStride || stride * 4;
  for (let i = 0; i < accessor.count; i += 1) {
    const at = start + (accessor.byteOffset || 0) + i * byteStride + component * 4;
    glb.buffer.writeFloatLE(values[i], at);
  }
}

function bounds(values, component) {
  let min = Infinity;
  let max = -Infinity;
  for (const row of values) {
    min = Math.min(min, row[component]);
    max = Math.max(max, row[component]);
  }
  return [min, max];
}

function distinct(values, component, digits = 6) {
  const set = new Set(values.map((row) => row[component].toFixed(digits)));
  return [...set].map(Number).sort((a, b) => a - b);
}

export function describeGlb(glb, label) {
  const lines = [`${label}`];
  const images = glb.json.images || [];
  const textures = glb.json.textures || [];
  const materials = glb.json.materials || [];
  lines.push(`  images: ${images.map((i) => i.uri || i.name || 'embedded').join(', ') || '(none)'}`);
  lines.push(`  textures: ${textures.map((t) => `tex${t.source}->img${t.source}`).join(', ') || '(none)'}`);
  for (const [index, material] of materials.entries()) {
    const base = material.pbrMetallicRoughness?.baseColorTexture;
    lines.push(`  material[${index}] ${material.name || ''}`
      + ` baseColorTexture=${base ? `tex${base.index}` : 'none'}`
      + ` baseColorFactor=${JSON.stringify(material.pbrMetallicRoughness?.baseColorFactor || null)}`);
  }
  for (const [meshIndex, mesh] of (glb.json.meshes || []).entries()) {
    lines.push(`  mesh[${meshIndex}] ${mesh.name || ''}`);
    for (const [primIndex, primitive] of mesh.primitives.entries()) {
      const position = readAccessor(glb, primitive.attributes.POSITION);
      const uvIndex = primitive.attributes.TEXCOORD_0;
      const parts = [`    prim[${primIndex}] verts=${position.accessor.count}`
        + ` material=${primitive.material ?? 'none'}`];
      lines.push(parts.join(''));
      lines.push(`      POSITION min=${position.accessor.min || bounds(position.values, 0).map((n) => n.toFixed(3))}`
        + ` max=${position.accessor.max || bounds(position.values, 0).map((n) => n.toFixed(3))}`);
      lines.push(`      POSITION x=[${bounds(position.values, 0).map((n) => n.toFixed(3))}]`
        + ` y=[${bounds(position.values, 1).map((n) => n.toFixed(3))}]`
        + ` z=[${bounds(position.values, 2).map((n) => n.toFixed(3))}]`);
      if (uvIndex === undefined) {
        lines.push('      TEXCOORD_0: absent');
        continue;
      }
      const uv = readAccessor(glb, uvIndex);
      lines.push(`      TEXCOORD_0 u=[${bounds(uv.values, 0).map((n) => n.toFixed(4))}]`
        + ` v=[${bounds(uv.values, 1).map((n) => n.toFixed(4))}]`);
      lines.push(`      TEXCOORD_0 distinct u=${JSON.stringify(distinct(uv.values, 0))}`);
      lines.push(`      TEXCOORD_0 distinct v=${JSON.stringify(distinct(uv.values, 1))}`);
    }
  }
  return lines.join('\n');
}

function main() {
  const [command, filePath] = process.argv.slice(2);
  if (!command || !filePath) {
    console.error('usage: node scripts/glb_uv_tool.mjs inspect <file.glb>');
    console.error('       node scripts/glb_uv_tool.mjs set-uv <file.glb> --axis u|v --values a,b [--write]');
    process.exit(2);
  }
  const glb = readGlb(filePath);

  if (command === 'inspect') {
    console.log(describeGlb(glb, filePath));
    return;
  }

  if (command === 'set-uv') {
    const axisFlag = process.argv.indexOf('--axis');
    const valuesFlag = process.argv.indexOf('--values');
    const axis = axisFlag > 0 ? process.argv[axisFlag + 1] : null;
    const pair = valuesFlag > 0 ? process.argv[valuesFlag + 1].split(',').map(Number) : null;
    const write = process.argv.includes('--write');
    if ((axis !== 'u' && axis !== 'v') || !pair || pair.length !== 2 || pair.some(Number.isNaN)) {
      console.error('need --axis u|v and --values a,b');
      process.exit(2);
    }
    const component = axis === 'u' ? 0 : 1;
    const [low, high] = pair;
    let touched = 0;
    for (const mesh of glb.json.meshes || []) {
      for (const primitive of mesh.primitives) {
        const uvIndex = primitive.attributes.TEXCOORD_0;
        if (uvIndex === undefined) continue;
        const uv = readAccessor(glb, uvIndex);
        const [min, max] = bounds(uv.values, component);
        if (max - min <= 0) throw new Error('the chosen axis has no range to map from');
        const mapped = uv.values.map((row) => low + ((row[component] - min) / (max - min)) * (high - low));
        writeAccessorComponent(glb, uvIndex, component, mapped);
        touched += uv.values.length;
      }
    }
    console.log(`${axis} -> [${low}, ${high}] over ${touched} vertices (from [${bounds(readAccessor(glb,
      glb.json.meshes[0].primitives[0].attributes.TEXCOORD_0).values, component).map((n) => n.toFixed(4))}])`);
    if (write) {
      writeFileSync(filePath, glb.buffer);
      console.log(`wrote ${filePath}`);
    } else {
      console.log('(dry run; pass --write to save)');
    }
    return;
  }

  if (command === 'ground') {
    const write = process.argv.includes('--write');
    // The lowest point across every mesh, then one uniform shift so the whole
    // model moves together -- lifting meshes independently would break the
    // relationship between a body and its wheels.
    let lowest = Infinity;
    for (const mesh of glb.json.meshes || []) {
      for (const primitive of mesh.primitives) {
        const position = readAccessor(glb, primitive.attributes.POSITION);
        for (const row of position.values) lowest = Math.min(lowest, row[1]);
      }
    }
    if (!Number.isFinite(lowest)) throw new Error('no POSITION accessor found');
    if (Math.abs(lowest) <= 1e-4) {
      console.log(`${filePath}: already grounded (lowest y=${lowest.toFixed(4)})`);
      return;
    }
    const shift = -lowest;
    for (const mesh of glb.json.meshes || []) {
      for (const primitive of mesh.primitives) {
        const position = readAccessor(glb, primitive.attributes.POSITION);
        writeAccessorComponent(glb, primitive.attributes.POSITION, 1,
          position.values.map((row) => row[1] + shift));
        // The accessor's declared min/max must move with the data, or the engine
        // culls and bounds the model using the old extent.
        if (position.accessor.min) position.accessor.min[1] += shift;
        if (position.accessor.max) position.accessor.max[1] += shift;
      }
    }
    console.log(`${filePath}: lowest y ${lowest.toFixed(4)} -> 0 (shift ${shift.toFixed(4)})`);
    if (write) {
      writeFileSync(filePath, glb.buffer);
      console.log(`wrote ${filePath}`);
    } else {
      console.log('(dry run; pass --write to save)');
    }
    return;
  }

  console.error(`unknown command ${command}`);
  process.exit(2);
}

if (process.argv[1] && process.argv[1].endsWith('glb_uv_tool.mjs')) main();
