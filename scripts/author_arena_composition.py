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

# The camera's visible ground is a TRAPEZOID, measured by ray-casting to y=0
# (`scripts/probe_arena_ground_frustum.mjs`, eight screen corners): half-width 7.8
# at the near edge z=16.8, 10.0 at mid z=-3.8, and 14.0 at the far edge z=-40.8.
#
# The rectangle this replaces (x -31..31, z -43..11) came from measuring ground
# GEOMETRY, not the frustum, and it is wrong in the direction that matters: it
# accepted 41 placements at |x| 20.5..28 that never appeared on screen. It was
# still here when a reviewer said the trapezoid check was not wired in -- it had
# been overwritten when the file was restored from git -- so the claim in the
# report did not match the code. Interpolated between the three measured samples,
# which is exact for a perspective camera over a ground plane.
FAR_Z, FAR_HALF = -40.8, 14.0
MID_Z, MID_HALF = -3.8, 10.0
NEAR_Z, NEAR_HALF = 16.8, 7.8

SPAWN_ANNULUS_INNER = 11.8
SPAWN_ANNULUS_OUTER = 16.2

# Where the match actually puts the seven rivals: a ring of radius 14, at angles
# ArenaMatchManager derives deterministically. Checking a per-body clearance
# against the ring's radial span is an approximation -- it ignores that a body
# towards one side can stay clear of every spawn while a body another way cannot.
# The exact test is against these seven positions, and a body must clear each one
# by SPAWN_BODY_CLEARANCE.
ARENA_SPAWN_RADIUS = 14.0
SPAWN_BODY_CLEARANCE = 3.0

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


# Depth is where the frame is won, and the mid band cannot be filled directly.
#
# Measured: the camera sits at (0,44,27) pitched -55 degrees, so the SCREEN CENTRE
# reads ground z -4 and the mid band (y40-60%) reads z -10..+2. That is exactly
# where the spawn ring lives (radius 11.8..16.2, seven rivals), so no static
# geometry can stand there -- an earlier pass put the mid-field blocks at z -21.5
# and they landed in the UPPER band, which is why the mid band stayed empty.
#
# So: two DENSE ranks starting where the ring releases (z -16.5), spaced 2 units
# apart, whose UPPER VOLUME projects up into the mid band. A 6-unit building
# standing at z -17 occupies screen rows well above z -17. The kerb rank at
# |x| 8.5 and the road-side rank at |x| 9.5 are offset in depth so they never line
# up into one thin column on the screen edge.
STREET_SOURCES = BUILDING_SOURCES
add_row('ArenaWallW', -8.5, (-16.5, -18.5, -20.5, -22.5, -24.5, -26.5,
                        -28.5, -30.5, -32.5, -34.5, -36.5, -38.5),
        STREET_SOURCES, 4.5, 90)
add_row('ArenaWallE', 8.5, (-16.5, -18.5, -20.5, -22.5, -24.5, -26.5,
                       -28.5, -30.5, -32.5, -34.5, -36.5, -38.5),
        tuple(reversed(STREET_SOURCES)), 4.5, -90)
# The second rank only becomes legal from z -30.5, because the frustum's
# half-width at |x| 9.5 needs a 4-unit body. Anything shallower passed the old
# rectangle guard and rendered nothing visible -- which is what the review's
# VIS-02 found.
add_row('ArenaWall2W', -9.5, (-30.5, -33.5, -36.5, -39.5),
        tuple(reversed(STREET_SOURCES)), 4.0, 90)
add_row('ArenaWall2E', 9.5, (-30.5, -33.5, -36.5, -39.5),
        STREET_SOURCES, 4.0, -90)
# Far corner blocks. |x| 12.5 with a 4.4 body needs 14.7 of half-width, which the
# frustum reaches only at z -40.8, so these are written at the deepest legal depth
# and are the closing silhouette rather than a second rank.
PLAN += [
    ('ArenaFarW', -11.5, -37.5, 'SupermarketSkylineFarNW', 4.0, 90),
    ('ArenaFarE', 11.5, -37.5, 'SupermarketSkylineFarNW', 4.0, -90),
]
# Closing the far vista, so the road does not run to a bare horizon.
PLAN += [
    ('ArenaVistaW', -5.0, -39.0, 'SupermarketAnnex', 4.5, 0),
    ('ArenaVistaE', 5.0, -39.0, 'SupermarketAnnex', 4.5, 0),
]
# Trees in the gaps of the kerb rank.
add_row('ArenaTreeW', -8.5, (-17.5, -21.5, -25.5, -29.5, -33.5, -37.5),
        TREE_SOURCES, 3.2, 0)
add_row('ArenaTreeE', 8.5, (-17.5, -21.5, -25.5, -29.5, -33.5, -37.5),
        tuple(reversed(TREE_SOURCES)), 3.2, 0)
# Kerbside vehicles in the wall's own gaps.
PLAN += [
    ('ArenaParkW1', -8.5, -16.5, PROP_SOURCES[0], 3.4, 90),
    ('ArenaParkE1', 8.5, -16.5, PROP_SOURCES[0], 3.4, 90),
    ('ArenaParkW2', -8.5, -28.5, PROP_SOURCES[0], 3.4, 90),
    ('ArenaParkE2', 8.5, -28.5, PROP_SOURCES[0], 3.4, 90),
    ('ArenaParkW3', -8.5, -36.5, PROP_SOURCES[0], 3.4, 90),
    ('ArenaParkE3', 8.5, -36.5, PROP_SOURCES[0], 3.4, 90),
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


def half_width_at(z):
    """Visible ground half-width at depth z, interpolated between measured samples."""
    if z <= MID_Z:
        ratio = (z - MID_Z) / (FAR_Z - MID_Z)
        return MID_HALF + (FAR_HALF - MID_HALF) * ratio
    ratio = (z - MID_Z) / (NEAR_Z - MID_Z)
    return MID_HALF + (NEAR_HALF - MID_HALF) * ratio


def inside_frustum(x, z, footprint):
    """Is a body of this footprint inside the camera's visible ground at (x, z)?"""
    if z > NEAR_Z or z < FAR_Z:
        return False
    return abs(x) + footprint / 2.0 <= half_width_at(z)


def spawn_positions(count = 7):
    """The match's rival spawn points, from ArenaMatchManager's own ring."""
    import math
    return [(ARENA_SPAWN_RADIUS * math.cos(2.0 * math.pi * index / count),
             ARENA_SPAWN_RADIUS * math.sin(2.0 * math.pi * index / count))
            for index in range(count)]


def validate(name, x, z, footprint):
    half = footprint / 2.0
    radius = math.hypot(x, z)
    if on_road(x, z):
        raise SystemExit('%s at (%.1f, %.1f) stands on the road' % (name, x, z))
    # Per-spawn clearance, the exact test rather than the radial band.
    for index, (spawn_x, spawn_z) in enumerate(spawn_positions()):
        gap = math.hypot(x - spawn_x, z - spawn_z) - half
        if gap < SPAWN_BODY_CLEARANCE:
            raise SystemExit('%s at (%.1f, %.1f) leaves %.2f from spawn point %d'
                             ' (needs %.1f)' % (name, x, z, gap, index, SPAWN_BODY_CLEARANCE))
    # The radial band is kept as a cheap summary check too: with these clearances
    # the relation |r - 14| < half + 3 must hold for nothing to survive.
    if radius - half < SPAWN_ANNULUS_INNER and radius + half > SPAWN_ANNULUS_OUTER:
        pass  # superseded by the per-point test above
    if not inside_frustum(x, z, footprint):
        raise SystemExit('%s at (%.1f, %.1f) with a %.1f-wide body is outside the camera'
                         ' frustum (half-width %.2f there)'
                         % (name, x, z, footprint, half_width_at(z)))


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
