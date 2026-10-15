"""Give the ground tile real UVs, in Blender.

`tile-low.glb` maps every vertex to one texel (u 0.90625, v 0.875), so the
district ground can only ever render a single flat colour no matter what texture
is bound to it. This projects the mesh's own X/Z extent onto 0..1 so one texture
repeat covers one 32-unit ground tile.

V13 asks for Blender -> GLB -> Creator import for 3D, so this runs inside Blender
rather than patching the glTF JSON by hand. Run with:

    blender --background --python scripts/blender_project_tile_uv.py
"""
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
TARGET = os.path.join(ROOT, 'cocos', 'assets', 'art', 'world', 'environment', 'tile-low.glb')
EXPORT = os.path.join(ROOT, 'artifacts', 'qa', 'v13', 'tile-low-projected.glb')


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def main():
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=TARGET)

    meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    if not meshes:
        raise SystemExit('no mesh imported from %s' % TARGET)
    print('[tile] imported %d mesh object(s): %s' % (len(meshes), [o.name for o in meshes]))

    for obj in meshes:
        mesh = obj.data
        before = {loop_index: tuple(mesh.uv_layers.active.data[loop_index].uv)
                  for loop_index in range(len(mesh.uv_layers.active.data))}
        # Blender's glTF importer converts the file's Y-up into Z-up, so the
        # tile's THICKNESS is Blender Z (0..0.02) and the ground plane is X/Y.
        # Projecting X/Z -- the axes the glTF file itself uses -- collapses the
        # UV along the thickness and produces four UVs that are all one value.
        xs = [vertex.co.x for vertex in mesh.vertices]
        ys = [vertex.co.y for vertex in mesh.vertices]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        span_x = max_x - min_x
        span_y = max_y - min_y
        if span_x <= 0 or span_y <= 0:
            raise SystemExit('%s has no planar extent to project (%.4f x %.4f)'
                             % (obj.name, span_x, span_y))

        uv_layer = mesh.uv_layers.active
        for loop in mesh.loops:
            vertex = mesh.vertices[loop.vertex_index]
            uv_layer.data[loop.index].uv = (
                (vertex.co.x - min_x) / span_x,
                (vertex.co.y - min_y) / span_y,
            )
        distinct = {tuple(round(c, 5) for c in uv_layer.data[i].uv)
                    for i in range(len(uv_layer.data))}
        print('[tile] %s: x %.3f..%.3f y %.3f..%.3f -> %d distinct uv values'
              % (obj.name, min_x, max_x, min_y, max_y, len(distinct)))
        print('[tile] %s: uv before had %d distinct values'
              % (obj.name, len({tuple(round(c, 5) for c in v) for v in before.values()})))

    os.makedirs(os.path.dirname(EXPORT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=EXPORT,
        export_format='GLB',
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
    )
    print('[tile] exported -> %s' % EXPORT)
    return 0


if __name__ == '__main__':
    sys.exit(main())
