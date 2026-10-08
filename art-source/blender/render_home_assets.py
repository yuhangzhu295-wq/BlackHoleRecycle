"""Render the two Home stage assets: the city band and the black-hole hero.

Only these two are produced here, per STEP 2. They are **stage** assets for a
page composition, not model showcase shots: the camera frames the ground patch
the scene is staged on, not the union of everything in it. Framing on the union
was why the black hole looked oversized -- an outlier in the bounds changed the
zoom of the whole shot.

Scale baseline is taken from the game, not chosen by eye:

- `ObjectArtRegistry` binds every asset at `unitScale()`, so nothing is scaled
  relative to anything else.
- A ground tile prefab is authored as a 32-unit block, and the tile GLB is 1x1
  units, so the prefab scales it 32x.
- `sedan.glb` is 1.5 x 2.55 units, i.e. about a twelfth of a block.

A card vignette therefore frames a patch a few blocks wide, not one block, so the
vehicles and the hole read at the size the player sees them in play.

Run: blender -b -P art-source/blender/render_home_assets.py
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy

from render_v95_assets import (  # noqa: E402 - path is set above
    CONE, CROSS, FENCE, LIGHT, OUT, ROAD, SEDAN, SHOP, SKYSCRAPER, TREE_L,
    TREE_S, TRUCK, VAN, add_black_hole, clear_scene, frame_camera, import_glb,
    light_scene, place, render, report, world_bounds,
)

# The stage the camera frames, in world units. Wide enough that a 2.55-unit car
# reads at roughly a quarter of the width, as it does in the reference cards.
STAGE_HALF = 7.0


def frame_stage(half, width, height, margin=1.12):
    """Frame the staged ground patch rather than everything placed on it."""
    from mathutils import Vector
    low = Vector((-half, -half, 0.0))
    high = Vector((half, half, 0.0))
    # Include a little headroom for tall props without letting one outlier
    # dictate the zoom: cap the vertical extent the frame considers.
    frame_camera((low, high), width, height, margin)


def build_city_band():
    """Home's world band: a street block with buildings, traffic and the hole."""
    clear_scene()
    everything = []
    for relative, x, y, rotation, scale in [
        (CROSS, 0.0, 0.0, 0.0, 8.0),
        (ROAD, 8.0, 0.0, 0.0, 8.0),
        (ROAD, -8.0, 0.0, 0.0, 8.0),
        (ROAD, 0.0, 8.0, math.pi / 2, 8.0),
        (ROAD, 0.0, -8.0, math.pi / 2, 8.0),
    ]:
        added = import_glb(relative)
        place(added, x, y, 0.0, rotation, scale)
        everything += added
    for relative, x, y, rotation, scale in [
        (SKYSCRAPER, -7.5, 6.0, 0.0, 1.0),
        (SHOP, 7.5, 5.6, math.pi, 1.0),
        (TREE_L, -7.0, -6.0, 0.0, 1.0),
        (TREE_S, -4.4, -7.2, 0.0, 1.0),
        (TREE_S, 4.8, 7.4, 0.0, 1.0),
        (LIGHT, -3.0, 3.6, 0.0, 1.0),
        (LIGHT, 3.4, -3.6, 0.0, 1.0),
        (FENCE, -7.2, 7.6, 0.0, 1.0),
        (SEDAN, 3.0, 2.2, math.pi / 2, 1.0),
        (VAN, -3.6, -2.2, -math.pi / 2, 1.0),
        (TRUCK, 2.0, -5.2, math.pi / 2, 1.0),
        (CONE, -2.2, 4.4, 0.0, 1.0),
    ]:
        added = import_glb(relative)
        place(added, x, y, 0.0, rotation, scale)
        everything += added
    # No hole in the band: the hero *is* the hole, and a second one on the street
    # read as a duplicated object rather than as the world behind the player.
    bpy.context.view_layer.update()
    report('city bounds', world_bounds(everything))
    frame_stage(STAGE_HALF, 720, 640, margin=1.05)
    light_scene((0.62, 0.82, 1.0))
    render('home_city_band.png', 720, 640)


def build_hero():
    """The hero black hole, alone, on a clear frame."""
    clear_scene()
    everything = add_black_hole(0.0, 0.0, 1.35, (0.36, 0.18, 0.98))
    bpy.context.view_layer.update()
    report('hero bounds', world_bounds(everything))
    frame_camera(world_bounds(everything), 560, 560, margin=1.9)
    light_scene((0.55, 0.78, 1.0))
    render('home_hero_blackhole.png', 560, 560)


def main():
    build_city_band()
    build_hero()
    print(f'\nwrote to {os.path.relpath(OUT, os.path.dirname(OUT))}')


if __name__ == '__main__':
    main()
    sys.stdout.flush()
