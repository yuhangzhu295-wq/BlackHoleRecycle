"""PHASE 1: rebuild the arena's city composition so it reads as a city.

What was wrong, all measured rather than assumed:

* The six `ArenaFrame*` buildings added in V13 have **no MeshRenderer and no
  children at all**. They are empty nodes: the previous pass reported them as a
  composition improvement and the frame barely moved, because nothing was drawn.
  `clone_subtree` copies `_children`, so the source it was given had none.
* The `Props` group holds **10 duplicated subtrees**, each pair at the identical
  position -- the authoring script names clones after their source, so its
  "already present" check never matched and a second run doubled them. Duplicates
  at the same position are wasted draw calls and z-fighting.
* Buildings are 2.06-4.5 units wide in a 62-unit frame, i.e. 3-7% of the width.
  DESIGN_04's buildings are roughly a sixth of the frame. Screen presence, not
  count, is what is missing.

What this does:

* Drops the empty nodes and the duplicates by replacing the groups' child lists.
* Places a street-wall composition: two rows flanking the main road over the whole
  visible depth, a farther row for far-field silhouette, corner blocks at the near
  end, and a short far row closing the vista.
* Sizes each clone by MEASURING its subtree's widest mesh at root scale 1 and
  solving for the root scale that lands the target footprint -- so the number in
  the table is the size on screen, not a multiplier whose meaning depends on which
  child carries the mesh.
* Asserts every clone has at least one MeshRenderer before writing. That check is
  the whole point: the failure it catches is invisible in every other gate.

Safety rules kept from the guard: nothing inside the spawn annulus (a static body
may not overlap radius 11.8..16.2, where the seven rivals are placed), nothing on
the road cross, nothing outside the camera frame.

Run: python scripts/author_arena_composition.py [--dry-run]
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scene_edit import Scene  # noqa: E402
# The deep-clone helper already exists and is the one that preserves the
# mesh-bearing child; a second copy here would be a second thing to keep correct.
from author_supermarket_content import clone_subtree  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PREFAB = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'maps', 'Supermarket.prefab')

FRAME_MIN_X, FRAME_MAX_X = -31.0, 31.0
FRAME_MIN_Z, FRAME_MAX_Z = -43.0, 11.0
SPAWN_ANNULUS_INNER = 11.8
SPAWN_ANNULUS_OUTER = 16.2

# Clone sources, each with a mesh-bearing descendant. Measured from the prefab.
BUILDING_SOURCES = (
    'SupermarketBuilding',        # building-a, the wide block
    'SupermarketAnnex',           # building-d
    'SupermarketRetailWingNW',    # building-f
    'SupermarketCenterOfficeN',   # building-h
    'SupermarketSkylineFarNW',    # building-skyscraper-a, the tall one
    'SupermarketSouthDepot',
)
TREE_SOURCES = ('SupermarketTreeFarNW', 'SupermarketTreeWestEdge')
PROP_SOURCES = ('SupermarketKerbsideSedanE', 'SupermarketBoxStack')

# (name, x, z, source, target footprint, rotation). Footprint is in world units,
# which is what the eye reads; the root scale is solved from it.
#
# x = +/-20 is the street wall: far enough that a 8-unit building's inner edge
# clears the spawn annulus (20 - 4 = 16 > 16.2 is not enough, so the wall sits at
# 20.5 with a 7-unit footprint, whose inner edge is 17.0).
PLAN = []

# The camera's visible ground is a TRAPEZOID, measured by ray-casting to y=0
# (scripts/probe_arena_ground_frustum.mjs): half-width 7.8 at the near edge,
# 10.0 at mid-height, 14.0 at the far edge, over z -40.8..16.8. The
# art-direction spec's "x -31..31" was wrong by 3x -- it measured ground
# geometry, not the frustum -- and the first composition pass placed 41
# buildings at |x| 20.5..28, every one of them outside the view.
#
# So everything below lives inside |x| <= 13.5, and the size is 4.0-4.5 units:
# the reference's buildings are about 0.8x the black hole, and the hole is 4.4.
VISIBLE_HALF_WIDTH_AT_MID = 10.0


def add_row(prefix, x, zs, source, footprint, rot=0):
    """One row of nodes. `source` may be a tuple, cycled along the row.

    Cycling the source is what gives the street colour variety: a clone keeps the
    material of the node it came from, so a row built from one source is one
    colour. The reference street is cream, orange, blue and red blocks side by
    side, and that is a property of which building was cloned, not of any tint
    applied later.
    """
    sources = source if isinstance(source, (tuple, list)) else (source,)
    for index, z in enumerate(zs):
        PLAN.append(('%s%d' % (prefix, index + 1), x, z,
                     sources[index % len(sources)], footprint, rot))


# Street walls tight against the road, over the depth where the frustum is wide
# enough to hold them. The road is 12 wide (|x| <= 6), so a 4.5-unit building at
# |x| = 8.5 leaves 0.75 units of kerb -- the tight street the reference shows.
STREET_SOURCES = ('SupermarketBuilding', 'SupermarketAnnex', 'SupermarketRetailWingNW',
                  'SupermarketCenterOfficeN', 'SupermarketSouthDepot')
add_row('ArenaWallW', -8.5, (-17.0, -22.0, -27.0, -32.0, -37.0, -42.0),
        STREET_SOURCES, 4.5, 90)
add_row('ArenaWallE', 8.5, (-17.0, -22.0, -27.0, -32.0, -37.0, -42.0),
        tuple(reversed(STREET_SOURCES)), 4.5, -90)
# A second row behind, where the frustum is wider (half-width 11.6 at z=-20
# rising to 13.2 at z=-36), giving the mid-ground depth instead of one flat wall.
add_row('ArenaBackW', -11.0, (-20.0, -28.0, -36.0), 'SupermarketRetailWingNW', 4.2, 90)
add_row('ArenaBackE', 11.0, (-20.0, -28.0, -36.0), 'SupermarketRetailWingNW', 4.2, -90)
# Far corners, where the frustum reaches 14.
PLAN += [
    ('ArenaFarW', -13.0, -34.0, 'SupermarketSkylineFarNW', 4.4, 90),
    ('ArenaFarE', 13.0, -34.0, 'SupermarketSkylineFarNW', 4.4, -90),
    ('ArenaFarW2', -13.0, -41.0, 'SupermarketCenterOfficeN', 4.4, 90),
    ('ArenaFarE2', 13.0, -41.0, 'SupermarketCenterOfficeN', 4.4, -90),
]
# Closing the far vista, so the road does not run to a bare horizon.
PLAN += [
    ('ArenaVistaW', -5.0, -42.5, 'SupermarketAnnex', 4.5, 0),
    ('ArenaVistaE', 5.0, -42.5, 'SupermarketAnnex', 4.5, 0),
]
# Street trees along the kerb, in the gaps between buildings.
add_row('ArenaTreeW', -8.5, (-19.5, -24.5, -29.5, -34.5, -39.5), 'SupermarketTreeWestEdge', 3.6, 0)
add_row('ArenaTreeE', 8.5, (-19.5, -24.5, -29.5, -34.5, -39.5), 'SupermarketTreeWestEdge', 3.6, 0)
# Kerbside vehicles, just off the lane.
PLAN += [
    ('ArenaParkW1', -8.5, -19.5, 'SupermarketKerbsideSedanE', 3.6, 90),
    ('ArenaParkE1', 8.5, -19.5, 'SupermarketKerbsideSedanE', 3.6, 90),
    ('ArenaParkW2', -8.5, -39.5, 'SupermarketKerbsideSedanE', 3.6, 90),
    ('ArenaParkE2', 8.5, -39.5, 'SupermarketKerbsideSedanE', 3.6, 90),
]


def on_road(x, z):
    """The authored road cross: a 16x16 centre and four 12-wide arms."""
    if abs(x) <= 8.0 and abs(z) <= 8.0:
        return True
    if abs(x) <= 6.0 and 8.0 < abs(z) <= 24.0:
        return True
    if abs(z) <= 6.0 and 8.0 < abs(x) <= 24.0:
        return True
    return False


def validate(name, x, z, footprint):
    half = footprint / 2.0
    radius = math.hypot(x, z)
    if on_road(x, z):
        raise SystemExit('%s at (%.1f, %.1f) stands on the road' % (name, x, z))
    if radius - half < SPAWN_ANNULUS_OUTER and radius + half > SPAWN_ANNULUS_INNER:
        raise SystemExit('%s at (%.1f, %.1f) overlaps the spawn annulus'
                         ' (radius %.2f, body %.2f..%.2f)'
                         % (name, x, z, radius, radius - half, radius + half))
    if not (FRAME_MIN_X < x < FRAME_MAX_X and FRAME_MIN_Z < z < FRAME_MAX_Z):
        raise SystemExit('%s at (%.1f, %.1f) is outside the camera frame' % (name, x, z))


def subtree_mesh_scales(scene, root_id, parent_scale=1.0):
    """World scale of every MeshRenderer in a subtree, with the node names."""
    found = []
    node = scene.arr[root_id]
    scale = parent_scale * ((node.get('_lscale') or {}).get('x') or 1.0)
    for ref in node.get('_components') or []:
        if scene.arr[ref['__id__']].get('__type__') == 'cc.MeshRenderer':
            found.append((node.get('_name'), scale))
    for ref in node.get('_children') or []:
        found.extend(subtree_mesh_scales(scene, ref['__id__'], scale))
    return found


def main():
    dry_run = '--dry-run' in sys.argv
    scene = Scene(PREFAB)
    groups = {name: scene.find(name) for name in ('Buildings', 'Park', 'Props')}
    for name, node in groups.items():
        if node is None:
            raise SystemExit('group %s not found' % name)

    for name, x, z, _source, footprint, _rot in PLAN:
        validate(name, x, z, footprint)

    # -- solve the root scale from the source's own mesh scale --------------
    # The size on screen is rootScale x the mesh child's own scale, and which
    # child carries the mesh differs per source. Solving for the root scale from a
    # measured target means the table above reads in world units, not in a
    # multiplier whose meaning changes with the source.
    source_scale = {}
    for _name, _x, _z, source, _footprint, _rot in PLAN:
        if source in source_scale:
            continue
        source_id = scene.find(source)
        if source_id is None:
            raise SystemExit('clone source %s not found' % source)
        meshes = subtree_mesh_scales(scene, source_id)
        if not meshes:
            raise SystemExit('clone source %s has no MeshRenderer in its subtree;'
                             ' cloning it would add an invisible node' % source)
        # Per unit of root scale. The source's own root scale is folded out here,
        # because the clone's root scale REPLACES it: measuring the source at its
        # own scale and then dividing the target by that number lands every clone
        # at 1/sourceScale of the intended size (2.8 units instead of 7.0 for the
        # first attempt).
        source_root = (scene.arr[source_id].get('_lscale') or {}).get('x') or 1.0
        source_scale[source] = max(scale for _node, scale in meshes) / source_root

    print('clone sources, measured (widest mesh per unit of root scale):')
    for source, per_unit in sorted(source_scale.items()):
        print('  %-26s %.2f units' % (source, per_unit))

    # -- report the plan -------------------------------------------------
    print('\nplan: %d nodes' % len(PLAN))
    for name, x, z, source, footprint, rot in PLAN:
        radius = math.hypot(x, z)
        print('  %-16s (%6.1f,%6.1f) r=%5.1f  body %5.1f..%5.1f  %-26s %4.1f units'
              ' (rootScale %.3f) rot%4d'
              % (name, x, z, radius, radius - footprint / 2, radius + footprint / 2,
                 source, footprint, footprint / source_scale[source], rot))

    if dry_run:
        print('\ndry run: nothing written')
        return 0

    # -- drop what earlier runs left behind --------------------------------
    def group_children(group_name):
        return [ref['__id__'] for ref in scene.arr[groups[group_name]].get('_children') or []]

    keep_buildings = []
    removed_empty = []
    for child in group_children('Buildings'):
        name = str(scene.arr[child].get('_name'))
        # Re-runnable: a previous run's composition is dropped and rebuilt from
        # the table above, so editing the table edits the scene instead of
        # accumulating beside it.
        if name.startswith('Arena') or not subtree_mesh_scales(scene, child):
            removed_empty.append(name)
            continue
        keep_buildings.append(child)

    seen = set()
    keep_props = []
    removed_dupes = []
    removed_empty_props = []
    for child in group_children('Props'):
        node = scene.arr[child]
        name = node.get('_name')
        if str(name).startswith('Arena'):
            removed_empty_props.append(name)
            continue
        if not subtree_mesh_scales(scene, child):
            removed_empty_props.append(name)
            continue
        pos = node.get('_lpos') or {}
        key = '%s@%.2f,%.2f' % (name, pos.get('x') or 0.0, pos.get('z') or 0.0)
        if key in seen:
            removed_dupes.append(key)
            continue
        seen.add(key)
        keep_props.append(child)

    print('\ncleanup: dropped %d building node(s) that draw nothing: %s'
          % (len(removed_empty), ', '.join(str(n) for n in removed_empty)))
    print('cleanup: dropped %d prop node(s) that draw nothing: %s'
          % (len(removed_empty_props), ', '.join(sorted(set(str(n) for n in removed_empty_props)))))
    print('cleanup: dropped %d duplicated prop subtree(s): %s'
          % (len(removed_dupes), ', '.join(removed_dupes)))

    # -- add the composition ----------------------------------------------
    added = []
    for name, x, z, source, footprint, rot in PLAN:
        node_id = clone_subtree(scene, scene.find(source), name)
        scale = footprint / source_scale[source]
        node = scene.arr[node_id]
        node['_name'] = name
        node['_lpos'] = {'__type__': 'cc.Vec3', 'x': x, 'y': 0, 'z': z}
        node['_lrot'] = {'__type__': 'cc.Quat', 'x': 0, 'y': 0, 'z': 0, 'w': 1}
        node['_lscale'] = {'__type__': 'cc.Vec3', 'x': scale, 'y': scale, 'z': scale}
        node['_euler'] = {'__type__': 'cc.Vec3', 'x': 0, 'y': rot, 'z': 0}
        meshes = subtree_mesh_scales(scene, node_id)
        if not meshes:
            raise SystemExit('%s cloned with no MeshRenderer; refusing to write' % name)
        added.append((name, node_id, max(s for _n, s in meshes)))

    print('\ncloned %d node(s), every one carrying a mesh' % len(added))
    for name, _node_id, widest in added[:6]:
        print('    %-16s widest mesh %.1f units' % (name, widest))

    by_group = {'Buildings': [], 'Park': [], 'Props': []}
    for name, node_id, _widest in added:
        if name.startswith(('ArenaWall', 'ArenaBack', 'ArenaCorner', 'ArenaVista')):
            by_group['Buildings'].append(node_id)
        elif name.startswith('ArenaTree'):
            by_group['Park'].append(node_id)
        else:
            by_group['Props'].append(node_id)

    # ONE edit per group. `set_children` appends by rewriting the same `_children`
    # span that `replace_children` already rewrote, and both compute their spans
    # against the original text -- queuing both produced overlapping edits and a
    # malformed file (the commit refused it and left a .failed copy). The kept
    # children and the new ones are written together instead.
    final_children = {
        'Buildings': keep_buildings + by_group['Buildings'],
        'Park': [c for c in group_children('Park')
                 if not str(scene.arr[c].get('_name')).startswith('Arena')] + by_group['Park'],
        'Props': keep_props + by_group['Props'],
    }
    for group_name, children in final_children.items():
        scene.replace_children(groups[group_name], children)
    for group_name, children in final_children.items():
        print('  %-10s %d children' % (group_name, len(children)))
    scene.commit()
    print('wrote %s' % os.path.relpath(PREFAB, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
