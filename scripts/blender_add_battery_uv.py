"""Give `battery.glb` a UV layer.

It has three primitives and none of them carries `TEXCOORD_0`, so no texture could
vary across it. The bin tool can rewrite an existing UV channel but cannot ADD one
-- that means extending the binary chunk and re-pointing accessors, which is a
re-export job, not a patch job.

V13.1's tool split puts mesh edits in Blender, so this does the projection there:
a cube projection per object, which is the least surprising mapping for a small
boxy prop and gives every face a non-degenerate area.

Run: blender --background --python scripts/blender_add_battery_uv.py
"""
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
TARGET = os.path.join(ROOT, 'cocos', 'assets', 'art', 'recyclables', 'props', 'battery.glb')
EXPORT = os.path.join(ROOT, 'artifacts', 'qa', 'v13', 'battery-uv.glb')


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=TARGET)
    meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    if not meshes:
        raise SystemExit('no mesh imported from %s' % TARGET)
    print('[battery] imported %d mesh object(s): %s'
          % (len(meshes), [obj.name for obj in meshes]))

    for obj in meshes:
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name='UVMap')
        # Cube projection gives every face a usable area; a plain planar X/Z
        # projection would collapse the side faces to lines.
        bpy.context.view_layer.objects.active = obj
        for other in bpy.context.selected_objects:
            other.select_set(False)
        obj.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.cube_project(cube_size=1.0)
        bpy.ops.object.mode_set(mode='OBJECT')
        layer = obj.data.uv_layers.active
        distinct = {tuple(round(c, 5) for c in layer.data[i].uv)
                    for i in range(len(layer.data))}
        print('[battery] %s: %d vertices, %d distinct uv values'
              % (obj.name, len(obj.data.vertices), len(distinct)))

    os.makedirs(os.path.dirname(EXPORT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=EXPORT,
        export_format='GLB',
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
    )
    print('[battery] exported -> %s' % EXPORT)
    return 0


if __name__ == '__main__':
    sys.exit(main())
