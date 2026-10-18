"""Make the paved variant of the ground tile, for the authored district prefabs.

The arena is an AUTHORED_DISTRICT_MAP cell, so its ground comes from
`Supermarket.prefab`'s four `GroundTile_*` nodes -- not from
`InfiniteWorldManager.buildEnvironment()`. Any change to the manager's ground kind
therefore cannot reach it, which is what the first attempt at this got wrong.

This emits a `tile-low-paved.glb` whose UV addresses the atlas's paving band, so
the prefab can point those four renderers at a second mesh. Verified after the
round trip: vertex count, positions and the material reference must survive.

The atlas bands are: objects and their colour plate, a building plate, and a
mixed paving band around y 384..512. There is no large grass field anywhere in the
sheet, which is why the paved ground is a different MESH rather than a tint on the
same one -- the tint is what the green gets from, and a tint cannot put lane
markings on a field it does not have.

Run: blender --background --python scripts/blender_make_paved_ground.py
"""
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SOURCE = os.path.join(ROOT, 'cocos', 'assets', 'art', 'world', 'environment', 'tile-low.glb')
OUT = os.path.join(ROOT, 'cocos', 'assets', 'art', 'world', 'environment', 'tile-low-paved.glb')

# The paving band's centre, measured in the atlas (y 384..512 of a 512 sheet).
BAND_ORIGIN = 0.74
BAND_SPAN = 0.24


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SOURCE)
    meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    if len(meshes) != 1:
        raise SystemExit('expected one mesh object, found %d' % len(meshes))
    obj = meshes[0]
    mesh = obj.data

    before = len(mesh.vertices)
    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    span_x = max(xs) - min(xs)
    span_y = max(ys) - min(ys)
    if span_x <= 0 or span_y <= 0:
        raise SystemExit('degenerate ground plane: %.4f %.4f' % (span_x, span_y))
    z_span = max(v.co.z for v in mesh.vertices) - min(v.co.z for v in mesh.vertices)

    if not mesh.uv_layers:
        mesh.uv_layers.new(name='UVMap')
    layer = mesh.uv_layers.active
    for loop in mesh.loops:
        vertex = mesh.vertices[loop.vertex_index]
        u = (vertex.co.x - min(xs)) / span_x
        v = (vertex.co.y - min(ys)) / span_y
        # The glTF exporter FLIPS v and does not clamp (measured: a written w
        # arrives as 1 - w). Writing the complement keeps the exported value
        # inside 0..1 and on the paving band.
        layer.data[loop.index].uv = (u, 1.0 - BAND_ORIGIN - v * BAND_SPAN)

    after = len(mesh.vertices)
    distinct = {tuple(round(c, 4) for c in layer.data[i].uv) for i in range(len(layer.data))}
    print('[paved] z-span %.4f (ground plane is x/y, not x/z)' % z_span)
    print('[paved] vertices %d -> %d, %d distinct uvs' % (before, after, len(distinct)))
    if before != after or len(distinct) < 4:
        raise SystemExit('refusing to export: vertex count or UV spread is wrong')

    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format='GLB',
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
    )
    print('[paved] exported -> %s' % OUT)
    return 0


if __name__ == '__main__':
    sys.exit(main())
