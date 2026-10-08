"""Render the V9.5 illustrated assets from the game's own GLB kit.

Why the game's own assets: a card interior that shows the real city kit cannot
drift from the world the player then plays in, and the brief asks for the Home
hero to reuse the in-game black hole rather than redraw a character that would
disagree with gameplay. 65 GLBs are available -- city and residential buildings,
skyscrapers, trees, fences, road tiles, street lights, cones, three vehicles,
sixteen recyclables, props and the machine's upgrade modules.

Each asset is a *recipe*: a ground grid plus a list of placements. Adding a prop
is a line here, not a manual scene edit, so the whole set is reproducible.

Two traps this pipeline hit, both recorded so they are not repeated:

- A render that writes a PNG proves nothing. The first probe produced an entirely
  blank image while reporting success, because the camera was framed from a
  bounding box measured before the dependency graph updated.
- `matrix_world` is stale until `bpy.context.view_layer.update()`, so bounds read
  straight after setting `location` silently report every asset at the origin.

Run: blender -b -P art-source/blender/render_v95_assets.py
"""
import math
import os
import sys

import bpy
from mathutils import Vector

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSETS = os.path.join(REPO, 'cocos', 'assets', 'art')
OUT = os.path.join(REPO, 'cocos', 'assets', 'game_art', 'ui', 'v95')

# Render at twice the delivery size and reduce, which is what keeps the
# isometric edges clean once the sprite is scaled into a card.
SUPERSAMPLE = 2

AZIMUTH = math.radians(45.0)
ELEVATION = math.radians(35.0)


def report(label, value):
    print(f'[render] {label}: {value}', flush=True)


def principled_of(material):
    """The material's Principled BSDF node, found by type.

    Looking it up by name raises a KeyError: the default node's name is not
    stable across Blender versions or UI languages, which is the same trap the
    world Background node set earlier.
    """
    return next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# GLBs whose referenced texture was never embedded: `crate.glb` declares a
# `colormap` image that imports as size (0, 0) and renders magenta. Checked at
# import rather than remembered, so the list cannot rot.
#
# The test is `image.size == (0, 0)`, not `has_data`: `has_data` is False for any
# image Blender has not needed to decode yet, so a first attempt at this guard
# excluded perfectly good assets -- the sedan, the crossroad tile, the trees.
# Size is zero only when there is genuinely no pixel data behind the reference.
TEXTURELESS = set()


def import_glb(relative):
    path = os.path.join(ASSETS, relative)
    if not os.path.exists(path):
        report('MISSING', relative)
        return []
    before = set(bpy.data.objects)
    before_images = set(bpy.data.images)
    bpy.ops.import_scene.gltf(filepath=path)
    added = [obj for obj in bpy.data.objects if obj not in before]
    for image in bpy.data.images:
        if image not in before_images and image.size[0] == 0:
            TEXTURELESS.add(relative)
            report('TEXTURELESS', f'{relative} ({image.name}) -- excluded, would render magenta')
            for obj in added:
                bpy.data.objects.remove(obj, do_unlink=True)
            return []
    return added


def place(added, x, y, z=0.0, z_rotation=0.0, scale=1.0):
    """Move an imported hierarchy as a unit and rotate it about its own origin."""
    for obj in added:
        if obj.parent is None:
            obj.location = (x, y, z)
            obj.rotation_euler = (0.0, 0.0, z_rotation)
            obj.scale = (scale, scale, scale)


def add_black_hole(x, y, radius=0.9, ring_colour=(0.42, 0.24, 1.0), name='hole'):
    """A black hole: a near-black sphere inside an emissive ring.

    Built from primitives rather than imported, because the game's own hole is
    shader-driven and its Blender import would not carry the look. The ring
    colour is the identity channel the art direction requires.
    """
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=(x, y, radius * 0.16),
                                         segments=48, ring_count=24)
    sphere = bpy.context.active_object
    sphere.name = f'{name}-core'
    core = bpy.data.materials.new(f'{name}-core-mat')
    core.use_nodes = True
    principled = principled_of(core)
    principled.inputs['Base Color'].default_value = (0.02, 0.01, 0.05, 1.0)
    principled.inputs['Roughness'].default_value = 0.25
    sphere.data.materials.append(core)
    # Squash it so it reads as a disc seen from above, like the reference.
    sphere.scale = (1.0, 1.0, 0.42)

    bpy.ops.mesh.primitive_torus_add(location=(x, y, radius * 0.16),
                                     major_radius=radius * 1.12, minor_radius=radius * 0.10,
                                     major_segments=64, minor_segments=16)
    ring = bpy.context.active_object
    ring.name = f'{name}-ring'
    emission = bpy.data.materials.new(f'{name}-ring-mat')
    emission.use_nodes = True
    ring_shader = principled_of(emission)
    ring_shader.inputs['Base Color'].default_value = (*ring_colour, 1.0)
    ring_shader.inputs['Emission Color'].default_value = (*ring_colour, 1.0)
    # Low enough that the ring keeps its colour: at 3.5 under the Standard
    # view transform every channel clipped and the ring rendered white.
    ring_shader.inputs['Emission Strength'].default_value = 0.55
    ring.data.materials.append(emission)
    return [sphere, ring]


def world_bounds(objects):
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


def frame_camera(target, width, height, margin=1.28):
    """Place an orthographic isometric camera so `target` fills the frame."""
    low, high = target
    centre = (low + high) * 0.5
    extent = high - low
    radius = max(extent.length * 0.5, 0.5)

    camera_data = bpy.data.cameras.new('cam')
    camera_data.type = 'ORTHO'
    # Fit the wider of the two axes so nothing is cropped at the frame's aspect.
    aspect = width / height
    camera_data.ortho_scale = radius * 2.0 * margin * (1.0 if aspect >= 1.0 else 1.0 / aspect)
    camera = bpy.data.objects.new('cam', camera_data)
    bpy.context.scene.collection.objects.link(camera)
    distance = radius * 8.0
    camera.location = (
        centre.x + distance * math.cos(ELEVATION) * math.sin(AZIMUTH),
        centre.y - distance * math.cos(ELEVATION) * math.cos(AZIMUTH),
        centre.z + distance * math.sin(ELEVATION),
    )
    direction = centre - Vector(camera.location)
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = camera
    return camera


def light_scene(sky_colour=(0.62, 0.82, 1.0)):
    sun_data = bpy.data.lights.new('sun', type='SUN')
    sun_data.energy = 3.2
    sun_data.angle = math.radians(12)
    sun = bpy.data.objects.new('sun', sun_data)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(52), math.radians(6), math.radians(135))

    world = bpy.data.worlds.new('world')
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
    background.inputs[0].default_value = (*sky_colour, 1.0)
    background.inputs[1].default_value = 1.25
    bpy.context.scene.world = world


def render(name, width, height):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = width * SUPERSAMPLE
    scene.render.resolution_y = height * SUPERSAMPLE
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    os.makedirs(OUT, exist_ok=True)
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    report('rendered', name)


def render_recipe(name, width, height, ground_tiles, props, holes=(), sky=(0.62, 0.82, 1.0)):
    """Every entry in a recipe carries the same scale, so the diorama is coherent."""
    """Build one asset: ground tiles, then props, then holes, then frame and render."""
    clear_scene()
    everything = []
    for relative, x, y, rotation, scale in ground_tiles:
        added = import_glb(relative)
        place(added, x, y, 0.0, rotation, scale)
        everything += added
    for relative, x, y, rotation, scale, z in props:
        added = import_glb(relative)
        place(added, x, y, z, rotation, scale)
        everything += added
    for x, y, radius, colour in holes:
        everything += add_black_hole(x, y, radius, colour)

    bpy.context.view_layer.update()
    bounds = world_bounds(everything)
    if bounds is None:
        raise SystemExit(f'{name}: nothing imported, refusing to render a blank asset')
    frame_camera(bounds, width, height)
    light_scene(sky)
    render(name, width, height)
    report('bounds', f'{tuple(round(v, 2) for v in bounds[0])} .. {tuple(round(v, 2) for v in bounds[1])}')


ROAD = 'world/roads/road-straight.glb'
CROSS = 'world/roads/road-crossroad-path.glb'
TREE_S = 'world/environment/tree-small.glb'
TREE_L = 'world/environment/tree-large.glb'
LIGHT = 'world/roads/street-light.glb'
CONE = 'world/roads/construction-cone.glb'
FENCE = 'world/environment/fence.glb'
SHOP = 'world/city/commercial-building-a.glb'
SKYSCRAPER = 'world/city/commercial-skyscraper-a.glb'
HOUSE_B = 'world/residential/building-type-b.glb'
SEDAN = 'vehicles/sedan.glb'
VAN = 'vehicles/delivery-van.glb'
TRUCK = 'vehicles/garbage-truck.glb'
CRATE = 'recyclables/industrial/crate.glb'
BIN = 'world/environment/tile-low.glb'


def main():
    """Recipes use the game's own proportions.

    Every binding in `ObjectArtRegistry` uses `unitScale()`, so assets are never
    scaled relative to each other: a ground tile GLB is 1x1 units but the world
    places it as a 32-unit block, which makes one tile a city block and a sedan
    (2.55 units long) about a twelfth of it. The first recipes scaled ground and
    props identically, so the cars towered over the road; these use the game's
    ratio instead -- ground enlarged, props at unit scale, holes sized to a car.
    """
    GROUND = 9.0        # one ground tile, read as a small block
    PROP = 1.0          # unit scale, as ObjectArtRegistry binds everything

    # 1. Home's city band: the world behind the hero, wide and shallow.
    render_recipe(
        'city_band_home.png', 900, 460,
        ground_tiles=[
            (CROSS, 0.0, 0.0, 0.0, GROUND),
            (ROAD, GROUND, 0.0, 0.0, GROUND),
            (ROAD, -GROUND, 0.0, 0.0, GROUND),
            (ROAD, 0.0, GROUND, math.pi / 2, GROUND),
            (ROAD, 0.0, -GROUND, math.pi / 2, GROUND),
        ],
        props=[
            (SKYSCRAPER, -9.0, 6.5, 0.0, PROP, 0.0),
            (SHOP, 9.0, 6.0, math.pi, PROP, 0.0),
            (HOUSE_B, 8.6, -6.4, -math.pi / 2, PROP, 0.0),
            (TREE_L, -8.4, -6.8, 0.0, PROP, 0.0),
            (TREE_S, -5.2, -8.2, 0.0, PROP, 0.0),
            (TREE_S, 5.6, 8.4, 0.0, PROP, 0.0),
            (LIGHT, -3.4, 4.2, 0.0, PROP, 0.0),
            (LIGHT, 3.8, -4.2, 0.0, PROP, 0.0),
            (FENCE, -8.0, 8.6, 0.0, PROP, 0.0),
            (SEDAN, 3.4, 2.6, math.pi / 2, PROP, 0.0),
            (VAN, -4.2, -2.6, -math.pi / 2, PROP, 0.0),
            (TRUCK, 2.4, -6.0, math.pi / 2, PROP, 0.0),
            (CONE, -2.6, 5.0, 0.0, PROP, 0.0),
            (CONE, -1.8, 5.8, 0.0, PROP, 0.0),
        ],
        holes=[(0.0, 0.0, 3.4, (0.34, 0.16, 0.95))],
    )

    # 2. The Home hero: the black hole alone, presented large.
    render_recipe(
        'hero_blackhole.png', 560, 560,
        ground_tiles=[],
        props=[],
        holes=[(0.0, 0.0, 1.6, (0.36, 0.18, 0.98))],
        sky=(0.55, 0.78, 1.0),
    )

    # 3. Entry-card interiors: one small block each, hole centred with a readable
    #    lane around it, props on the edges.
    render_recipe(
        'card_vignette_mode.png', 340, 220,
        ground_tiles=[(CROSS, 0.0, 0.0, 0.0, 5.0)],
        props=[(SEDAN, 2.6, 2.2, math.pi / 2, PROP, 0.0),
               (VAN, -2.6, -2.2, -math.pi / 2, PROP, 0.0),
               (CONE, -2.4, 2.4, 0.0, PROP, 0.0),
               (TREE_S, -3.6, -3.2, 0.0, PROP, 0.0),
               (TREE_S, 3.6, 3.4, 0.0, PROP, 0.0)],
        holes=[(0.0, 0.0, 2.3, (0.34, 0.16, 0.95))],
    )
    render_recipe(
        'card_vignette_machine.png', 340, 220,
        ground_tiles=[(ROAD, 0.0, 0.0, 0.0, 5.0)],
        props=[('machine-modules/magnetic-turbine.glb', -2.8, 2.4, 0.0, PROP, 0.0),
               ('machine-modules/compression-engine.glb', 2.8, 2.4, 0.0, PROP, 0.0),
               ('machine-modules/gravity-wing-frame.glb', 0.0, -3.2, 0.0, PROP, 0.0),
               (CONE, 3.4, -2.6, 0.0, PROP, 0.0)],
        holes=[(0.0, 0.0, 2.3, (0.22, 0.80, 0.42))],
    )
    render_recipe(
        'card_vignette_skin.png', 340, 220,
        ground_tiles=[(ROAD, 0.0, 0.0, 0.0, 5.0)],
        props=[(TREE_S, -3.4, 2.6, 0.0, PROP, 0.0),
               (TREE_S, 3.4, 2.6, 0.0, PROP, 0.0),
               (CONE, 0.0, -3.4, 0.0, PROP, 0.0)],
        holes=[(-2.0, -0.4, 1.7, (0.92, 0.24, 0.18)),
               (2.0, -0.4, 1.7, (0.16, 0.48, 0.95))],
        sky=(0.60, 0.80, 1.0),
    )


if __name__ == '__main__':
    main()
    sys.stdout.flush()
