"""Render the Hunyuan collider mesh from a few angles so it can be judged by eye.

The download is a binary PLY with per-vertex colours and no UV layer, created by
Open3D. Before any of it is proposed for the game it has to be looked at: a
numeric bounds check cannot tell a city block from a soup of triangles.

Run: blender -b -P scripts/render_hunyuan_mesh.py
"""
import math
import os

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLY = os.path.join(ROOT, 'art-source', 'references', 'hunyuan-output',
                   'hunyuan-world-collider-mesh.ply')
OUT_DIR = os.path.join(ROOT, 'artifacts', 'qa', 'hunyuan')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.ply_import(filepath=PLY)

obj = next(o for o in bpy.context.selected_objects if o.type == 'MESH')
mesh = obj.data

# Bounds in world space. The generated scene is Z-up (Open3D), which is why the
# Z extent is the thin one: that is the height of the city, not its width.
coords = [obj.matrix_world @ v.co for v in mesh.vertices]
mn = Vector((min(c.x for c in coords), min(c.y for c in coords), min(c.z for c in coords)))
mx = Vector((max(c.x for c in coords), max(c.y for c in coords), max(c.z for c in coords)))
centre = (mn + mx) * 0.5
size = max(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z)
print('[hunyuan] bounds min=%s max=%s centre=%s size=%.3f' % (tuple(round(v, 3) for v in mn),
                                                             tuple(round(v, 3) for v in mx),
                                                             tuple(round(v, 3) for v in centre), size))
print('[hunyuan] vertices=%d polygons=%d' % (len(mesh.vertices), len(mesh.polygons)))

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 1100
scene.render.resolution_y = 800
scene.render.film_transparent = False
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'VERTEX'
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.world = bpy.data.worlds.new('w')
scene.world.color = (0.05, 0.06, 0.08)

cam_data = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.lens = 35


def look_at(camera, target):
    direction = target - camera.location
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


# Three views: a three-quarter establishing shot, a top-down plan, and a low
# street-level shot that approximates what a player's camera sees.
views = [
    ('three-quarter', Vector((0.75, -0.75, 0.55)), 1.55),
    ('top-down', Vector((0.0, -0.001, 1.0)), 1.25),
    ('street-level', Vector((0.05, -0.9, 0.18)), 0.75),
]

os.makedirs(OUT_DIR, exist_ok=True)
for name, direction, distance in views:
    cam.location = centre + direction.normalized() * size * distance
    look_at(cam, centre)
    scene.render.filepath = os.path.join(OUT_DIR, 'mesh-%s.png' % name)
    bpy.ops.render.render(write_still=True)
    print('[hunyuan] wrote', scene.render.filepath)
