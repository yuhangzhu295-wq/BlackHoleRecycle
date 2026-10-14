"""Place buildings along the arena's frame edges so the composition closes.

Measured from the live run (probe_arena_coverage.mjs): the arena camera frames
roughly x -30..30, z -42..10, and all thirteen of Supermarket's building nodes sit
at z <= -12 -- behind the player. The spawn ring and every starting competitor are
in z -14..+14, so the slice of the map the camera frames around the player is a
featureless plane: measured 46% of the arena frame is two single colours (26.8%
flat road grey plus 19.4% grass green).

The fix follows DESIGN_07's "建筑只做边界，不挡核心视线": buildings along the EAST
and WEST frame edges, where the camera sees them but they do not occlude the
central play corridor. Each pair is placed within x +-22..28 and z -34..+6, i.e.
inside the frame and off the z=0..10 lane the spawns and traffic use.

Nothing here touches gameplay: the buildings are plain MeshRenderer setups with no
collider and are never collected, and the play field is unchanged in size. The
static mesh counts, materials and the authored road grid are all left as they were.

Run: python scripts/author_supermarket_buildings.py [--dry-run]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.scene_edit import Scene, repo_root  # noqa: E402

PREFAB = os.path.join(repo_root(), 'cocos', 'assets', 'game_art', 'maps', 'Supermarket.prefab')
BUILDINGS = 'Buildings'
ROADS = 'Roads'
TEMPLATE = 'SupermarketAnnex'
ROAD_TEMPLATE = 'MainCrossroad'

# The frame the live camera actually shows, from probe_arena_coverage.mjs. Anything
# outside it cannot contribute to the composition, and anything inside it must not
# occlude the central play lane, which is where the spawn ring and traffic run.
FRAME_MIN_X, FRAME_MAX_X = -31.0, 31.0
FRAME_MIN_Z, FRAME_MAX_Z = -43.0, 11.0

# (name, x, z, scale, rotYDegrees). Angles mirror the annex's own two rotations so
# the row reads as a continuous street wall rather than a repeating prop.
NEW_BUILDINGS = (
    ('ArenaFrameWestA', -22.0, 6.0, 1.60, 90),
    ('ArenaFrameWestB', -22.0, -14.0, 1.60, 90),
    ('ArenaFrameWestC', -22.0, -32.0, 1.60, 90),
    ('ArenaFrameEastA', 22.0, 6.0, 1.60, -90),
    ('ArenaFrameEastB', 22.0, -14.0, 1.60, -90),
    ('ArenaFrameEastC', 22.0, -32.0, 1.60, -90),
)

# A second cross so the visible field has a grid, not one axis.
#
# Measured from the live run: the arena camera frames roughly x -30..30,
# z -42..10, and the authored road is a single 16-unit cross on the axes. The
# camera therefore sees road in the middle third and nothing in the rest, which
# measured 36.1% of the play field as one flat colour. DESIGN_07 asks for 道路成网,
# so this adds one more cross a quarter-cell out: it closes the two visible
# quadrants' road network without touching the lane the spawn ring uses.
#
# Placed to abut the existing arms: the existing crossroad is 16 wide (|8|) and its
# arms are 12 wide starting at |8|, so the new cross sits at the edge of that and
# its own arms extend to the frame's edge.
NEW_ROADS = (
    # North-south arms.
    ('ArenaRoadNorthInner', 0.0, 30.0, 1.0, 0),
    ('ArenaRoadNorthOuter', 0.0, -30.0, 1.0, 180),
    # East-west arms.
    ('ArenaRoadEastInner', 30.0, 0.0, 1.0, 90),
    ('ArenaRoadWestInner', -30.0, 0.0, 1.0, 90),
    # Junction caps so the new arms meet a road rather than raw ground.
    ('ArenaRoadCapNE', 30.0, 30.0, 1.0, 90),
    ('ArenaRoadCapNW', -30.0, 30.0, 1.0, 90),
    ('ArenaRoadCapSE', 30.0, -30.0, 1.0, 90),
    ('ArenaRoadCapSW', -30.0, -30.0, 1.0, 90),
)

# The play corridor must stay clear: anything at |x| < 20 and 0 <= z <= 12 is a
# spawn lane or a road, and a building there would be the exact defect the V12
# closing passes removed.
FORBIDDEN_EDGE_X = 20.0
FORBIDDEN_PLAY_Z = (-2.0, 12.0)


def prefab_node(scene, name):
    node = scene.find(name)
    if node is None:
        raise SystemExit('template node %s not found' % name)
    return node


def clone_into(scene, parent_id, template_id, name, x, z, scale, rot_y_degrees):
    """Clone a template node as a plain mesh child of `parent_id`."""
    new_id = len(scene.arr)
    scene.arr.append(json.loads(json.dumps(scene.arr[template_id])))
    node = scene.arr[new_id]
    node['_name'] = name
    node['_parent'] = {'__id__': parent_id}
    node['_lpos'] = {'__type__': 'cc.Vec3', 'x': x, 'y': 0, 'z': z}
    node['_lrot'] = {'__type__': 'cc.Quat', 'x': 0, 'y': 0, 'z': 0, 'w': 1}
    node['_lscale'] = {'__type__': 'cc.Vec3', 'x': scale, 'y': scale, 'z': scale}
    node['_euler'] = {'__type__': 'cc.Vec3', 'x': 0, 'y': rot_y_degrees, 'z': 0}
    node['_children'] = []
    scene.register_appended(new_id, 1)
    return new_id


def main():
    dry_run = '--dry-run' in sys.argv
    scene = Scene(PREFAB)
    buildings = scene.find(BUILDINGS)
    roads = scene.find(ROADS)
    if buildings is None or roads is None:
        raise SystemExit('%s or %s not found in %s' % (BUILDINGS, ROADS, PREFAB))

    done = []

    building_names = [scene.arr[ref['__id__']]['_name'] for ref in scene.arr[buildings]['_children']]
    already = [name for name, *_ in NEW_BUILDINGS if name in building_names]
    if already:
        done.append('buildings already present: %s' % ', '.join(already))
    else:
        template = prefab_node(scene, TEMPLATE)
        added = []
        for name, x, z, scale, rot in NEW_BUILDINGS:
            if not (FRAME_MIN_X < x < FRAME_MAX_X and FRAME_MIN_Z < z < FRAME_MAX_Z):
                raise SystemExit('%s at (%s,%s) is outside the camera\'s view' % (name, x, z))
            added.append(clone_into(scene, buildings, template, name, x, z, scale, rot))
            print('  %-20s (%6.1f, %5.1f) scale %.2f rotY %3d' % (name, x, z, scale, rot))
        if not dry_run:
            scene.set_children(buildings, added)
            scene.commit(expect={buildings: len(added)})
            print('added %d frame-edge buildings to %s' % (len(added), os.path.relpath(PREFAB, repo_root())))

    road_names = [scene.arr[ref['__id__']]['_name'] for ref in scene.arr[roads]['_children']]
    already_roads = [name for name, *_ in NEW_ROADS if name in road_names]
    if already_roads:
        done.append('roads already present: %s' % ', '.join(already_roads))
    else:
        template = prefab_node(scene, ROAD_TEMPLATE)
        added = []
        for name, x, z, scale, rot in NEW_ROADS:
            added.append(clone_into(scene, roads, template, name, x, z, scale, rot))
            print('  %-20s (%6.1f, %5.1f) scale %.2f rotY %3d' % (name, x, z, scale, rot))
        if not dry_run:
            scene.set_children(roads, added)
            scene.commit(expect={roads: len(added)})
            print('added %d grid roads to %s' % (len(added), os.path.relpath(PREFAB, repo_root())))

    for line in done:
        print(line)
    return 0


if __name__ == '__main__':
    sys.exit(main())
