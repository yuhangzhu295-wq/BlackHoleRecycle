"""Render the Mode-Ready map previews as isometric dioramas.

Why this file exists: `map_preview_city.png` / `map_preview_arena.png` were flat
`cc.Graphics`-style vector drawings (a horizon band, rectangles for buildings,
circles for trees). The adopted reference
(`design-reference/ui-v9.5-adopted/03-endless-ready.png`) shows a *rendered*
isometric block -- the same city kit the player then plays in, seen from above,
with the hole visibly pulling cargo in. A flat elevation view of the same
subject cannot read as the world, so the preview is re-rendered with the game's
own GLBs through the `render_v95_assets` harness.

Three things this file does differently from the shared harness, each because
the preview is a different kind of picture from a UI ornament:

- **Framing.** `frame_camera` sizes the ortho camera from the bounding box
  *diagonal*, which is a safe over-cover for a small prop but leaves a wide flat
  city block floating in ~40% empty frame. `fit_isometric_camera` projects the
  box corners onto the camera's own right/up axes and fits those extents, so the
  block actually fills a 2.15:1 card.
- **Full bleed.** The reference preview has no visible sky: ground reaches every
  edge. A base plane wider than the frame provides that, and it is excluded from
  the framing bounds so it cannot drag the camera out.
- **Opaque sky.** `film_transparent=False`, because this image *is* the card
  interior rather than an ornament composited over an authored panel.

Output is written straight into `cocos/assets/game_art/ui/textures/` at 1x,
because `MapPreviewGraphic` binds these two files by name through
`UIAssetLibrary`. The render is 2x and reduced here, which is what keeps the
isometric edges clean once the sprite is scaled into the 560x260 card.

Run: blender -b -P art-source/blender/render_map_previews.py -- [city|arena|all]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402  (Blender injects this; must follow sys.path setup)
from mathutils import Vector  # noqa: E402

import render_v95_assets as kit  # noqa: E402

TEXTURES = os.path.join(kit.REPO, 'cocos', 'assets', 'game_art', 'ui', 'textures')
# Where the finished 1x PNG lands. Overridable so an A/B candidate can be
# rendered without touching the shipped asset -- an experiment that overwrites
# what ships is not an experiment, it is a deployment.
OUT_DIR = os.environ.get('BHR_PREVIEW_OUT') or TEXTURES

# Matches the existing asset and the node size MODE_READY_LAYOUT pins, so the
# sprite is neither stretched nor re-imported at a different aspect.
WIDTH = 560
HEIGHT = 260

GROUND = 9.0   # one ground tile, matching the delivered Home field band
PROP = 1.0     # unit scale, as ObjectArtRegistry binds everything

# The reference preview is a hero illustration, not a to-scale map. Its
# buildings and trees are far larger against the road than the game's own
# unit-scale props (measured by `probe_glb_sizes.py`: a skyscraper is 2.88 units
# tall and a tree 0.77, against a 9-unit ground tile and a 2.55-unit car). These
# multipliers reproduce the reference's read at the Home band's ground ratio.
# They are presentation scales for this one image and are deliberately not
# claimed to be gameplay proportions.
BUILDING_SCALE = 3.0
TREE_SCALE = 5.0
CARGO_SCALE = 3.0
CONE_SCALE = 4.0

# The reference's hole spans the full road width, which is what tells the player
# how much of the street one bite takes. At GROUND = 9 that is a 4.2 radius.
HOLE_RADIUS = 4.2

# Small breathing room around the fitted extents. The reference is a full-bleed
# illustration, so this stays near 1: any larger and sky reappears at the edges.
FRAME_MARGIN = 1.04

# Lower than the shared harness's 35 degrees, and deliberately so. For an
# orthographic camera at elevation theta the ratio of projected width to height
# is bounded by 1/sin(theta): 1.74 at 35 degrees, which cannot fill this 2.15:1
# card no matter how the block is composed. At 28 degrees the bound is 2.13, so
# the block can fill the card instead of floating in ground. This is a per-asset
# camera choice for a preview illustration, not a change to the game's own view.
PREVIEW_ELEVATION = math.radians(28.0)

# Textured props only. `recyclables/industrial/crate.glb` and every
# `recyclables/props/*` GLB reference texture files that are not on disk, so the
# harness's guard drops them and they would render magenta. `cardboard-box.glb`
# is the crate the reference actually shows, and it imports with real pixels --
# confirmed by `probe_glb_textures.py`, not by reading directory listings.
CARGO_BOX = 'recyclables/furniture/cardboard-box.glb'
CARGO_BOOKS = 'recyclables/furniture/book-stack.glb'
CARGO_MONITOR = 'recyclables/furniture/monitor.glb'


def add_ground_plane(size, colour, name='ground'):
    """A base plane, wider than the frame, so the diorama reaches every edge.

    Without it the road tiles float on the world colour and the preview reads as
    a diagram. The plane is deliberately larger than what the camera fits, so
    its own edge never enters the frame.
    """
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0.0, 0.0, -0.06))
    plane = bpy.context.active_object
    plane.name = name
    material = bpy.data.materials.new(f'{name}-mat')
    material.use_nodes = True
    principled = kit.principled_of(material)
    principled.inputs['Base Color'].default_value = (*colour, 1.0)
    principled.inputs['Roughness'].default_value = 0.9
    plane.data.materials.append(material)
    return [plane]


def fit_isometric_camera(bounds, width, height, margin=FRAME_MARGIN):
    """Orthographic camera fitted to the box's *projected* extents.

    Sizing from the 3D diagonal (what the shared harness does) is correct only
    when the box is roughly cubic. A city block is wide and flat, so the
    diagonal over-covers badly; projecting the eight corners onto the camera's
    right and up axes measures what the frame will actually have to hold.
    """
    low, high = bounds
    centre = (low + high) * 0.5
    corners = [Vector((x, y, z))
               for x in (low.x, high.x) for y in (low.y, high.y) for z in (low.z, high.z)]

    camera_data = bpy.data.cameras.new('cam')
    camera_data.type = 'ORTHO'
    camera = bpy.data.objects.new('cam', camera_data)
    bpy.context.scene.collection.objects.link(camera)

    distance = max((high - low).length, 1.0) * 4.0
    camera.location = (
        centre.x + distance * math.cos(PREVIEW_ELEVATION) * math.sin(kit.AZIMUTH),
        centre.y - distance * math.cos(PREVIEW_ELEVATION) * math.cos(kit.AZIMUTH),
        centre.z + distance * math.sin(PREVIEW_ELEVATION),
    )
    direction = centre - Vector(camera.location)
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = camera
    # `matrix_world` is stale until the view layer updates -- the trap the
    # harness header records. Read the axes only after this.
    bpy.context.view_layer.update()

    rotation = camera.matrix_world.to_quaternion()
    right = rotation @ Vector((1.0, 0.0, 0.0))
    up = rotation @ Vector((0.0, 1.0, 0.0))
    extent_right = 2.0 * max(abs((corner - centre).dot(right)) for corner in corners)
    extent_up = 2.0 * max(abs((corner - centre).dot(up)) for corner in corners)

    aspect = width / height
    camera_data.ortho_scale = max(extent_right, extent_up * aspect) * margin
    kit.report('framed', f'projected {extent_right:.1f} x {extent_up:.1f}, '
                         f'ortho_scale {camera_data.ortho_scale:.1f}')


def render_preview(name, ground_tiles, props, holes, plane_colour, sky):
    """Assemble, frame on the props, then render at 2x and reduce to 1x."""
    kit.clear_scene()

    # The plane is built first but framed out: it exists to fill the frame, not
    # to define it.
    base = add_ground_plane(240.0, plane_colour)

    everything = []
    for relative, x, y, rotation, scale in ground_tiles:
        added = kit.import_glb(relative)
        kit.place(added, x, y, 0.0, rotation, scale)
        everything += added
    for entry in props:
        relative, x, y, rotation, scale, z = entry[:6]
        added = kit.import_glb(relative)
        kit.place(added, x, y, z, rotation, scale)
        if len(entry) > 6 and entry[6] is not None:
            # Flat, not multiplied. The shared building texture is dark, so a
            # multiply tint darkened every colour the recipe asked for; the
            # reference's buildings are flat low-poly, so dropping the texture is
            # both closer to the target and what makes the street readable.
            kit.flatten_base_colour(added, entry[6])
        everything += added
    for x, y, radius, colour in holes:
        everything += kit.add_black_hole(x, y, radius, colour)
        # Each hole carries its own coloured pool of light, so the arena's rival
        # holes stay distinguishable from the local core.
        everything += kit.add_glow_ring(x, y, radius, colour, 1.0)

    bpy.context.view_layer.update()
    bounds = kit.world_bounds(everything)
    if bounds is None:
        raise SystemExit(f'{name}: nothing imported, refusing to render a blank asset')
    fit_isometric_camera(bounds, WIDTH, HEIGHT)
    # Less light than the ornament recipes use. At the shared 1.25/3.2 a flat
    # base colour is washed to pastel and the ground plane comes back brighter
    # than the sky, which is what made the first candidate read as a thin street
    # floating on white.
    kit.light_scene(sky, strength=0.55, sun_energy=2.1)

    os.makedirs(OUT_DIR, exist_ok=True)
    scratch = os.path.join(OUT_DIR, '_supersample')
    os.makedirs(scratch, exist_ok=True)
    kit.OUT = scratch
    kit.render(name, WIDTH, HEIGHT, transparent=False)

    source = os.path.join(scratch, name)
    target = os.path.join(OUT_DIR, name)
    # Blender's bundled Python has no PIL, so the reduce uses Blender's own
    # scaler. `save()` rather than `save_render()`: the render already carries
    # the Standard view transform, and `save_render` would apply it a second
    # time and wash the colours out.
    image = bpy.data.images.load(source)
    image.scale(WIDTH, HEIGHT)
    image.filepath_raw = target
    image.file_format = 'PNG'
    image.save()
    bpy.data.images.remove(image)
    os.remove(source)
    if not os.listdir(scratch):
        os.rmdir(scratch)
    kit.report('delivered', target)


def city():
    """Endless: a street block with the hole actively pulling cargo in.

    Composition follows the reference read: buildings and trees behind the
    street, the road with its crosswalks across the middle, and the hole on the
    intersection ringed by the boxes, cones and bins it is drawing in. Vehicles
    sit on the lanes either side so the hole's scale against a car is legible --
    the one thing a map preview has to communicate.
    """
    render_preview(
        'map_preview_city.png',
        ground_tiles=[
            (kit.CROSS, 0.0, 0.0, 0.0, GROUND),
            (kit.ROAD, GROUND, 0.0, 0.0, GROUND),
            (kit.ROAD, -GROUND, 0.0, 0.0, GROUND),
            (kit.ROAD, GROUND * 2, 0.0, 0.0, GROUND),
            (kit.ROAD, -GROUND * 2, 0.0, 0.0, GROUND),
            # A cross street, so the block is an intersection rather than one
            # diagonal strip on a field. This is what fills the frame: with a
            # single street the content's projected width covered about 68% of the
            # card and the rest was bare ground.
            (kit.ROAD, 0.0, GROUND, math.pi / 2, GROUND),
            (kit.ROAD, 0.0, -GROUND, math.pi / 2, GROUND),
            (kit.ROAD, 0.0, GROUND * 2, math.pi / 2, GROUND),
            (kit.ROAD, 0.0, -GROUND * 2, math.pi / 2, GROUND),
        ],
        props=[
            # Buildings on the far kerbs. Flat-coloured, not tinted: the kit shares
            # one dark grey-blue glass texture, so a multiply tint only darkened
            # every colour asked for. Saturated values, because the reduced
            # lighting that keeps flat colours readable also keeps them muted.
            (kit.SKYSCRAPER, -19.0, 13.4, 0.0, BUILDING_SCALE, 0.0, (0.36, 0.58, 0.92)),
            (kit.SHOP, -12.0, 13.0, math.pi, BUILDING_SCALE, 0.0, (0.30, 0.78, 0.36)),
            (kit.SHOP, -4.2, 13.2, math.pi, BUILDING_SCALE, 0.0, (0.98, 0.62, 0.18)),
            (kit.SHOP, 4.4, 13.0, math.pi, BUILDING_SCALE, 0.0, (0.94, 0.34, 0.32)),
            (kit.SHOP, 12.4, 13.2, math.pi, BUILDING_SCALE, 0.0, (0.62, 0.42, 0.94)),
            (kit.SKYSCRAPER, 19.4, 13.4, 0.0, BUILDING_SCALE, 0.0, (0.24, 0.70, 0.86)),
            # A second row behind, so the skyline is a block rather than one line.
            (kit.SHOP, -15.4, 20.0, math.pi, BUILDING_SCALE, 0.0, (0.90, 0.74, 0.24)),
            (kit.SHOP, 15.6, 20.2, math.pi, BUILDING_SCALE, 0.0, (0.44, 0.62, 0.96)),
            # Corner trees, so the frame's edges are not bare ground.
            (kit.TREE_L, -8.2, -12.6, 0.0, TREE_SCALE, 0.0),
            (kit.TREE_L, 8.6, -12.8, 0.0, TREE_SCALE, 0.0),
            (kit.TREE_S, -15.6, -7.4, 0.0, TREE_SCALE, 0.0),
            (kit.TREE_S, 16.0, -7.2, 0.0, TREE_SCALE, 0.0),
            (kit.TREE_S, -22.4, 6.6, 0.0, TREE_SCALE, 0.0),
            (kit.TREE_S, 22.6, 6.8, 0.0, TREE_SCALE, 0.0),
            (kit.TREE_S, -22.0, -12.4, 0.0, TREE_SCALE, 0.0),
            (kit.TREE_S, 22.2, -12.2, 0.0, TREE_SCALE, 0.0),
            (kit.LIGHT, -2.4, 11.6, 0.0, PROP, 0.0),
            (kit.LIGHT, 2.6, -11.6, 0.0, PROP, 0.0),
            (kit.FENCE, -24.0, -7.8, 0.0, PROP, 0.0),
            # Traffic on the lanes either side of the hole.
            (kit.TRUCK, -13.4, -2.2, math.pi / 2, PROP, 0.0),
            (kit.VAN, 13.6, 2.2, -math.pi / 2, PROP, 0.0),
            (kit.SEDAN, -7.6, 2.2, -math.pi / 2, PROP, 0.0),
            (kit.SEDAN, 7.8, -2.2, math.pi / 2, PROP, 0.0),
            # Cargo mid-absorb: raised and tilted, so the hole reads as active.
            (CARGO_BOX, 5.4, 3.6, 0.55, CARGO_SCALE, 0.70),
            (CARGO_BOX, -5.6, -3.4, -0.45, CARGO_SCALE, 0.55),
            (CARGO_BOX, 1.4, 6.6, 0.20, CARGO_SCALE, 1.15),
            (CARGO_BOX, -8.4, 3.0, 0.30, CARGO_SCALE, 0.45),
            (CARGO_BOOKS, -3.4, 5.8, 0.30, CARGO_SCALE, 0.60),
            (CARGO_MONITOR, 8.0, -4.4, -0.35, CARGO_SCALE, 0.50),
            (kit.CONE, 7.0, 6.4, 0.0, CONE_SCALE, 0.0),
            (kit.CONE, -7.8, -6.2, 0.0, CONE_SCALE, 0.0),
            (kit.CONE, 9.4, -6.6, 0.0, CONE_SCALE, 0.0),
        ],
        holes=[(0.0, 0.0, HOLE_RADIUS, (0.44, 0.20, 1.0))],
        plane_colour=(0.46, 0.52, 0.44),
        sky=(0.36, 0.68, 0.98),
    )


def arena():
    """Arena: the bounded ring, rivals on it, the local core at the centre."""
    render_preview(
        'map_preview_arena.png',
        ground_tiles=[
            (kit.CROSS, 0.0, 0.0, 0.0, GROUND),
            (kit.ROAD, GROUND, 0.0, 0.0, GROUND),
            (kit.ROAD, -GROUND, 0.0, 0.0, GROUND),
            (kit.ROAD, 0.0, GROUND, math.pi / 2, GROUND),
            (kit.ROAD, 0.0, -GROUND, math.pi / 2, GROUND),
        ],
        props=[
            (kit.CONE, 4.6, 4.6, 0.0, PROP, 0.0),
            (kit.CONE, -4.6, 4.6, 0.0, PROP, 0.0),
            (kit.CONE, 4.6, -4.6, 0.0, PROP, 0.0),
            (kit.CONE, -4.6, -4.6, 0.0, PROP, 0.0),
            (kit.TREE_S, -8.0, 5.6, 0.0, PROP, 0.0),
            (kit.TREE_S, 8.0, -5.6, 0.0, PROP, 0.0),
            (CARGO_BOX, 3.2, 1.6, 0.4, PROP, 0.25),
            (CARGO_BOX, -3.4, -1.8, -0.3, PROP, 0.25),
            (kit.SEDAN, -7.0, -4.6, math.pi / 2, PROP, 0.0),
            (kit.VAN, 7.2, 4.6, -math.pi / 2, PROP, 0.0),
        ],
        holes=[
            (0.0, 0.0, 2.0, (0.36, 0.18, 0.98)),
            (-4.4, 3.4, 1.20, (0.94, 0.30, 0.24)),
            (4.4, -3.4, 1.20, (0.16, 0.52, 0.98)),
            (-4.2, -3.6, 1.10, (0.20, 0.78, 0.46)),
            (4.2, 3.6, 1.10, (0.98, 0.66, 0.10)),
        ],
        plane_colour=(0.24, 0.20, 0.40),
        sky=(0.26, 0.20, 0.52),
    )


def main():
    argv = sys.argv
    selection = argv[argv.index('--') + 1] if '--' in argv else 'all'
    if selection in ('city', 'all'):
        city()
    if selection in ('arena', 'all'):
        arena()


if __name__ == '__main__':
    main()
    sys.stdout.flush()
