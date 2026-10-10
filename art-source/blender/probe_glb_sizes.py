"""Measure the world-space size of each GLB the map previews place.

The previews need props at the reference's density, and "too small" is not a
number. Importing each candidate and printing its bounding box turns the scale
constants in `render_map_previews.py` into measurements instead of guesses --
the same reason the harness checks textures by importing rather than by reading
the directory.

Run: blender -b -P art-source/blender/probe_glb_sizes.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import render_v95_assets as kit  # noqa: E402

CANDIDATES = [
    'world/roads/road-straight.glb',
    'world/roads/road-crossroad-path.glb',
    'world/city/commercial-building-a.glb',
    'world/city/commercial-skyscraper-a.glb',
    'world/residential/building-type-b.glb',
    'world/environment/tree-small.glb',
    'world/environment/tree-large.glb',
    'world/environment/tile-low.glb',
    'world/environment/fence.glb',
    'world/roads/construction-cone.glb',
    'world/roads/street-light.glb',
    'vehicles/sedan.glb',
    'vehicles/delivery-van.glb',
    'vehicles/garbage-truck.glb',
    'recyclables/furniture/cardboard-box.glb',
    'recyclables/furniture/book-stack.glb',
    'recyclables/furniture/monitor.glb',
]


def main():
    for relative in CANDIDATES:
        kit.clear_scene()
        added = kit.import_glb(relative)
        if not added:
            print(f'[size] {"SKIP":28s} {relative}', flush=True)
            continue
        kit.place(added, 0.0, 0.0, 0.0, 0.0, 1.0)
        import bpy
        bpy.context.view_layer.update()
        bounds = kit.world_bounds(added)
        if bounds is None:
            print(f'[size] {"NO-MESH":28s} {relative}', flush=True)
            continue
        low, high = bounds
        size = high - low
        print(f'[size] {os.path.basename(relative):28s} '
              f'x={size.x:6.2f} y={size.y:6.2f} z={size.z:6.2f}  '
              f'z0={low.z:6.2f}', flush=True)


if __name__ == '__main__':
    main()
    sys.stdout.flush()
