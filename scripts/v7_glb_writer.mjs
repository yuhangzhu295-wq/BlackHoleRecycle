/**
 * Minimal glTF 2.0 / GLB writer.
 *
 * The V7 migration needs the black hole to be a real asset instead of seven
 * runtime primitives. There is no DCC tool on this machine, but GLB is a
 * documented container: a 12-byte header, a JSON chunk and a binary chunk. This
 * module writes that container directly, so the generator script produces a real
 * .glb file that Cocos imports as an asset with its own uuid.
 *
 * Deliberately narrow: positions, normals, uvs and indices, one material per
 * primitive, no animation, no skinning, no textures. That is everything the
 * black hole needs.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const COMPONENT_FLOAT = 5126;
const COMPONENT_UNSIGNED_INT = 5125;
const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;

/** Pad to the 4-byte alignment glTF requires inside chunks. */
function pad(buffer, fill) {
  const remainder = buffer.length % 4;
  if (remainder === 0) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(4 - remainder, fill)]);
}

/**
 * Build a GLB from a list of named primitives.
 *
 * @param primitives array of { name, positions, normals, uvs, indices, material }
 *   where material is { name, baseColorFactor: [r,g,b,a] } in linear 0..1
 * @param translation per-primitive local offset, applied on the node
 */
export function buildGlb(primitives, options = {}) {
  const json = {
    asset: { version: '2.0', generator: options.generator || 'BlackHoleRecycle V7 asset generator' },
    scene: 0,
    scenes: [{ nodes: primitives.map((_, index) => index) }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };

  const chunks = [];
  let byteOffset = 0;

  const addBufferView = (buffer, target) => {
    const aligned = pad(buffer, 0);
    const view = { buffer: 0, byteOffset, byteLength: buffer.length };
    if (target !== undefined) view.target = target;
    json.bufferViews.push(view);
    chunks.push(aligned);
    byteOffset += aligned.length;
    return json.bufferViews.length - 1;
  };

  const addAccessor = (viewIndex, componentType, count, type, min, max) => {
    const accessor = { bufferView: viewIndex, componentType, count, type };
    if (min) accessor.min = min;
    if (max) accessor.max = max;
    json.accessors.push(accessor);
    return json.accessors.length - 1;
  };

  for (const primitive of primitives) {
    const positionView = addBufferView(Buffer.from(new Float32Array(primitive.positions).buffer), TARGET_ARRAY_BUFFER);
    const normalView = addBufferView(Buffer.from(new Float32Array(primitive.normals).buffer), TARGET_ARRAY_BUFFER);
    const uvView = addBufferView(Buffer.from(new Float32Array(primitive.uvs).buffer), TARGET_ARRAY_BUFFER);
    const indexView = addBufferView(Buffer.from(new Uint32Array(primitive.indices).buffer), TARGET_ELEMENT_ARRAY_BUFFER);

    const vertexCount = primitive.positions.length / 3;
    // POSITION min/max are required by the spec and used by Cocos to size the
    // mesh bounds, so they are computed from the real vertices rather than
    // estimated.
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < primitive.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = primitive.positions[i + axis];
        if (value < min[axis]) min[axis] = value;
        if (value > max[axis]) max[axis] = value;
      }
    }

    const positionAccessor = addAccessor(positionView, COMPONENT_FLOAT, vertexCount, 'VEC3', min, max);
    const normalAccessor = addAccessor(normalView, COMPONENT_FLOAT, vertexCount, 'VEC3');
    const uvAccessor = addAccessor(uvView, COMPONENT_FLOAT, vertexCount, 'VEC2');
    const indexAccessor = addAccessor(indexView, COMPONENT_UNSIGNED_INT, primitive.indices.length, 'SCALAR');

    const materialIndex = json.materials.length;
    const colour = primitive.material.baseColorFactor;
    json.materials.push({
      name: primitive.material.name,
      pbrMetallicRoughness: {
        baseColorFactor: colour,
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      // The project renders unlit, so double-sided avoids the winding question
      // entirely for ring geometry viewed from below.
      doubleSided: true,
    });

    json.meshes.push({
      name: primitive.name,
      primitives: [{
        attributes: { POSITION: positionAccessor, NORMAL: normalAccessor, TEXCOORD_0: uvAccessor },
        indices: indexAccessor,
        material: materialIndex,
      }],
    });

    const node = { name: primitive.name, mesh: json.meshes.length - 1 };
    if (primitive.translation) node.translation = primitive.translation;
    if (primitive.scale) node.scale = primitive.scale;
    json.nodes.push(node);
  }

  const binary = Buffer.concat(chunks);
  json.buffers.push({ byteLength: binary.length });

  const jsonChunk = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const binChunk = pad(binary, 0);

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

/**
 * A closed cylinder around Y, centred on its own origin, capped at both ends.
 * Matches Cocos `primitives.cylinder(radiusTop, radiusBottom, height)`.
 */
export function cylinder(radius, height, segments = 48) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const half = height / 2;

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    // Side wall, two vertices per step so the seam is closed.
    positions.push(x * radius, -half, z * radius);
    normals.push(x, 0, z);
    uvs.push(i / segments, 0);
    positions.push(x * radius, half, z * radius);
    normals.push(x, 0, z);
    uvs.push(i / segments, 1);
  }
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  // Caps: a fan around a centre vertex on each face.
  for (const [y, ny] of [[half, 1], [-half, -1]]) {
    const centre = positions.length / 3;
    positions.push(0, y, 0);
    normals.push(0, ny, 0);
    uvs.push(0.5, 0.5);
    const ringStart = positions.length / 3;
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      positions.push(x * radius, y, z * radius);
      normals.push(0, ny, 0);
      uvs.push(0.5 + x * 0.5, 0.5 + z * 0.5);
    }
    for (let i = 0; i < segments; i += 1) {
      if (ny > 0) indices.push(centre, ringStart + i + 1, ringStart + i);
      else indices.push(centre, ringStart + i, ringStart + i + 1);
    }
  }

  return { positions, normals, uvs, indices };
}

/**
 * A torus in the XZ plane around Y, centred on its own origin.
 * Matches Cocos `primitives.torus(radius, tube)` orientation so the existing
 * per-frame Euler rotations keep producing the same visual.
 */
export function torus(radius, tube, radialSegments = 48, tubularSegments = 16) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= radialSegments; i += 1) {
    const u = (i / radialSegments) * Math.PI * 2;
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);
    for (let j = 0; j <= tubularSegments; j += 1) {
      const v = (j / tubularSegments) * Math.PI * 2;
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      const x = (radius + tube * cosV) * cosU;
      const z = (radius + tube * cosV) * sinU;
      const y = tube * sinV;
      positions.push(x, y, z);
      normals.push(cosV * cosU, sinV, cosV * sinU);
      uvs.push(i / radialSegments, j / tubularSegments);
    }
  }
  for (let i = 0; i < radialSegments; i += 1) {
    for (let j = 0; j < tubularSegments; j += 1) {
      const a = i * (tubularSegments + 1) + j;
      const b = a + tubularSegments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  return { positions, normals, uvs, indices };
}

/** Write a GLB to disk, creating parent directories as needed. */
export function writeGlb(filePath, primitives, options) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const buffer = buildGlb(primitives, options);
  writeFileSync(filePath, buffer);
  return buffer.length;
}

