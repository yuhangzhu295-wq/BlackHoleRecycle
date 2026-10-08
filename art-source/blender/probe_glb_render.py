"""Feasibility probe: import the game's GLB kit and render a framed vignette.

The first version of this wrote a PNG that was entirely blank -- the import
worked, so a check that only looked for the file would have passed while proving
nothing. This version measures the imported geometry's world bounding box and
frames the camera on it, and prints the box so a blank render can be diagnosed
rather than guessed at.

Run: blender -b -P art-source/blender/probe_glb_render.py
"""
import math
import os

import bpy
from mathutils import Vector

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSETS = os.path.join(REPO, 'cocos', 'assets', 'art')
OUT_DIR = os.path.join(REPO, 'art-source', 'probe')

PROBES = [
    'world/roads/road-straight.glb',
    'world/environment/tree-small.glb',
    'vehicles/sedan.glb',
    'world/city/commercial-building-a.glb',
]


def report(label, value):
    print(f'[probe] {label}: {value}', flush=True)


def world_bounds(objects):
    """Combined world-space bounding box of the mesh objects, or None."""
    low = Vector((math.inf,) * 3)
    high = Vector((-math.inf,) * 3)
    found = False
    for obj in objects:
        if obj.type != 'MESH':
            continue
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            low = Vector((min(low.x, point.x), min(low.y, point.y), min(low.z, point.z)))
            high = Vector((max(high.x, point.x), max(high.y, point.y), max(high.z, point.z)))
            found = True
    return (low, high) if found else None


bpy.ops.wm.read_factory_settings(use_empty=True)

imported = []
for index, relative in enumerate(PROBES):
    path = os.path.join(ASSETS, relative)
    if not os.path.exists(path):
        report('MISSING', relative)
        continue
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    added = [obj for obj in bpy.data.objects if obj not in before]
    bounds = world_bounds(added)
    report('imported', f'{relative} -> {len(added)} objects, bounds={bounds}')
    imported.append((relative, added, bounds))

# Lay the four families out in a row, moving the whole imported hierarchy of each
# so a multi-part asset like the sedan cannot be torn apart.
for index, (_relative, added, _bounds) in enumerate(imported):
    roots = [obj for obj in added if obj.parent is None]
    for root in roots:
        root.location.x += index * 8.0
# `matrix_world` is only recomputed when the dependency graph updates, so
# measuring bounds right after setting `location` reads the stale matrices and
# silently reports every asset at the origin.
bpy.context.view_layer.update()

all_objects = [obj for _r, added, _b in imported for obj in added]
bounds = world_bounds(all_objects)
report('combined_bounds', bounds)
if bounds is None:
    raise SystemExit('no geometry imported; nothing to render')

low, high = bounds
centre = (low + high) * 0.5
extent = high - low
report('centre', tuple(round(v, 2) for v in centre))
report('extent', tuple(round(v, 2) for v in extent))

# Isometric framing: 45 degrees of azimuth, about 35 of elevation, orthographic,
# scaled to the diagonal of the box so nothing is cropped.
radius = max(extent.length * 0.5, 1.0)
azimuth = math.radians(45.0)
elevation = math.radians(35.0)
distance = radius * 6.0

camera_data = bpy.data.cameras.new('probe-camera')
camera_data.type = 'ORTHO'
camera_data.ortho_scale = radius * 2.6
camera = bpy.data.objects.new('probe-camera', camera_data)
bpy.context.scene.collection.objects.link(camera)
camera.location = (
    centre.x + distance * math.cos(elevation) * math.sin(azimuth),
    centre.y - distance * math.cos(elevation) * math.cos(azimuth),
    centre.z + distance * math.sin(elevation),
)
# Aim at the centre: a camera pointing along -Z with a known up vector.
direction = centre - Vector(camera.location)
camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
report('camera', f'loc={tuple(round(v, 2) for v in camera.location)}'
                 f' ortho={camera_data.ortho_scale:.2f}')

sun_data = bpy.data.lights.new('probe-sun', type='SUN')
sun_data.energy = 3.5
sun = bpy.data.objects.new('probe-sun', sun_data)
bpy.context.scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(140))

world = bpy.data.worlds.new('probe-world')
world.use_nodes = True
background = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
background.inputs[0].default_value = (0.62, 0.80, 1.0, 1.0)
background.inputs[1].default_value = 1.2
bpy.context.scene.world = world

scene = bpy.context.scene
scene.camera = camera
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 640
scene.render.resolution_y = 480
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

os.makedirs(OUT_DIR, exist_ok=True)
scene.render.filepath = os.path.join(OUT_DIR, 'probe.png')
bpy.ops.render.render(write_still=True)
report('rendered', scene.render.filepath)
