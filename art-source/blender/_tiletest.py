import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
import bpy
from render_v95_assets import import_glb, place, world_bounds, frame_camera, light_scene, render, clear_scene

CANDIDATES = [
    'world/roads/road-straight.glb',
    'world/roads/road-crossroad-path.glb',
    'world/environment/tile-low.glb',
    'world/environment/path-stones-long.glb',
]
clear_scene()
everything = []
for i, rel in enumerate(CANDIDATES):
    added = import_glb(rel)
    place(added, i * 3.0, 0.0, 0.0, 0.0, 1.0)
    everything += added
bpy.context.view_layer.update()
b = world_bounds(everything)
frame_camera(b, 800, 200, margin=1.15)
light_scene()
render('_tiletest.png', 800, 200)
print('[tile] order:', CANDIDATES, flush=True)
