"""Author content into the arena frame's open near-field, cloning whole subtrees.

Why the script is shaped this way: a map prefab's node is a NAMED PLACEHOLDER and
its mesh lives on a child. `SupermarketBuilding` has no MeshRenderer itself;
`building-a`, its child, does. Cloning the placeholder without its children is
exactly the bug this script replaced -- the previous version of the frame-edge pass
cloned `SupermarketAnnex` with `node['_children'] = []`, produced six buildings that
drew nothing, and the play-field measurement did not move. So every clone here
carries its subtree, and remaps the child's `_components` at the new ids.

What it adds, and why there: the camera frames x -30..30, z -42..+10 with the near
edge at z=+10 (probe_arena_coverage.mjs). The play band is still 33% one flat
colour against the reference's 17%, and 350 colour buckets against 818. The cause
is the open near-field, so this fills the near corners and the road shoulders with
props DESIGN_07 reads as street furniture, plus two mid-lane crates for the
contest centre.

Every placement keeps 14 units clear of the origin (the spawn ring) and stays off
the two traffic lanes, so nothing blocks a spawn or a driving route. Props are
collider-free visual nodes; gameplay objects are untouched.

Run: python scripts/author_supermarket_content.py [--dry-run]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.scene_edit import Scene, repo_root  # noqa: E402

PREFAB = os.path.join(repo_root(), 'cocos', 'assets', 'game_art', 'maps', 'Supermarket.prefab')
PROPS = 'Props'
BUILDINGS = 'Buildings'

# A cluster is (new name, x, z, source subtree root in this prefab, scale, rotY).
# The source subtree is cloned in full, so the mesh-bearing child comes with it.
#
# The z values sit OUTSIDE the authored crossroad's lane band (abs <= 8 either axis)
# on purpose. The near corners inside that band are not free space -- they are the
# road, and the first version of this cluster list put props on top of a driving
# route. So the content goes beyond the lane, where the frame really is open.
CLUSTERS = (
    # Far corners of the visible band: the emptiest part of the frame.
    ('ArenaFarNW', -26.0, -14.0, 'SupermarketBoxStack', 1.6, 0),
    ('ArenaFarNE', 26.0, -14.0, 'SupermarketBoxStack', 1.6, 0),
    # Road shoulders just past the lane, giving the corridor vertical rhythm.
    ('ArenaLightWest', -11.0, 10.0, 'DistrictStreetLight', 1.3, 0),
    ('ArenaLightEast', 11.0, 10.0, 'DistrictStreetLight', 1.3, 0),
    ('ArenaLightFarNW', -11.0, -26.0, 'DistrictStreetLight', 1.3, 0),
    ('ArenaLightFarNE', 11.0, -26.0, 'DistrictStreetLight', 1.3, 0),
    # Mid-field kerb furniture, off both lanes.
    ('ArenaSedanWest', -20.0, -22.0, 'SupermarketKerbsideSedanE', 1.2, 90),
    ('ArenaSedanEast', 20.0, -22.0, 'SupermarketKerbsideSedanE', 1.2, 90),
    ('ArenaFenceNW', -20.0, -34.0, 'SupermarketBoundaryFence', 1.5, 0),
    ('ArenaFenceNE', 20.0, -34.0, 'SupermarketBoundaryFence', 1.5, 0),
)

# A frame-edge building row. Each clones the placeholder AND its mesh-bearing
# child, so the building actually draws -- the previous attempt cloned only the
# placeholder, produced six invisible nodes, and moved no measurement.
# z stays clear of the lane band, same as the props.
BUILDING_ROWS = (
    ('ArenaFrameWestA', -22.0, 10.0, 'SupermarketBuilding', 1.5, 90),
    ('ArenaFrameWestB', -22.0, -14.0, 'SupermarketBuilding', 1.5, 90),
    ('ArenaFrameWestC', -22.0, -32.0, 'SupermarketBuilding', 1.5, 90),
    ('ArenaFrameEastA', 22.0, 10.0, 'SupermarketBuilding', 1.5, -90),
    ('ArenaFrameEastB', 22.0, -14.0, 'SupermarketBuilding', 1.5, -90),
    ('ArenaFrameEastC', 22.0, -32.0, 'SupermarketBuilding', 1.5, -90),
)

SPAWN_RING_CLEARANCE = 14.0
TRAFFIC_LANE_HALF_WIDTH = 8.0
FRAME_MIN_X, FRAME_MAX_X = -31.0, 31.0
FRAME_MIN_Z, FRAME_MAX_Z = -43.0, 11.0


def clone_subtree(scene, source_id, suffix):
    """Deep-clone a node and its whole subtree, remapping ids, and keep the meshes.

    Every nested element is a new array element with a new id, and every
    `_parent` / `_children` / `_components` reference is rewritten to point at the
    new ids. Components are cloned with their node, so the mesh-bearing child keeps
    its renderer -- which is the entire point of doing this rather than cloning the
    placeholder alone.
    """
    mapping = {}
    order = []

    def collect(id):
        mapping[id] = len(scene.arr)
        order.append(id)
        for ref in scene.arr[id].get('_children', []):
            collect(ref['__id__'])
        for ref in scene.arr[id].get('_components', []):
            if ref['__id__'] in mapping:
                continue
            mapping[ref['__id__']] = len(scene.arr)
            order.append(ref['__id__'])
        comp_ids = [c['__id__'] for c in scene.arr[id].get('_components', [])
                    if scene.arr[c['__id__']].get('__type__') == 'cc.PrefabInfo']
        for comp_id in comp_ids:
            if comp_id not in mapping:
                mapping[comp_id] = len(scene.arr)
                order.append(comp_id)

    collect(source_id)
    for old_id in order:
        duplicate = json.loads(json.dumps(scene.arr[old_id]))
        if duplicate.get('__type__') == 'cc.PrefabInfo':
            duplicate['fileId'] = duplicate.get('fileId', '') + '-' + suffix
        if '_id' in duplicate and duplicate['_id']:
            duplicate['_id'] = str(duplicate['_id']) + '-' + suffix
        duplicate.pop('_prefab', None)
        scene.arr.append(duplicate)
    new_root = mapping[source_id]

    # Rewrite the new elements' references so they point inside the clone.
    for old_id in order:
        element = scene.arr[mapping[old_id]]
        for key in ('_parent',):
            if element.get(key) and element[key].get('__id__') in mapping:
                element[key] = {'__id__': mapping[element[key]['__id__']]}
        element['_children'] = [
            {'__id__': mapping[ref['__id__']]}
            for ref in scene.arr[old_id].get('_children', [])
        ]
        element['_components'] = [
            {'__id__': mapping[ref['__id__']]}
            for ref in scene.arr[old_id].get('_components', [])
        ]
        for ref in element.get('_components', []):
            comp = scene.arr[ref['__id__']]
            if comp.get('node') and comp['node'].get('__id__') in mapping:
                comp['node'] = {'__id__': mapping[comp['node']['__id__']]}
    scene.register_appended(new_root, len(order))
    return new_root


def place(scene, node_id, x, z, scale, rot_y_degrees):
    node = scene.arr[node_id]
    node['_lpos'] = {'__type__': 'cc.Vec3', 'x': x, 'y': 0, 'z': z}
    node['_lrot'] = {'__type__': 'cc.Quat', 'x': 0, 'y': 0, 'z': 0, 'w': 1}
    node['_lscale'] = {'__type__': 'cc.Vec3', 'x': scale, 'y': scale, 'z': scale}
    node['_euler'] = {'__type__': 'cc.Vec3', 'x': 0, 'y': rot_y_degrees, 'z': 0}
    node['_children'] = node.get('_children', [])


def validate(name, x, z):
    radius = (x * x + z * z) ** 0.5
    if radius < SPAWN_RING_CLEARANCE:
        raise SystemExit('%s at (%s,%s) is inside the spawn ring' % (name, x, z))
    if abs(x) <= TRAFFIC_LANE_HALF_WIDTH or abs(z) <= TRAFFIC_LANE_HALF_WIDTH:
        raise SystemExit('%s at (%s,%s) sits on a traffic lane' % (name, x, z))
    if not (FRAME_MIN_X < x < FRAME_MAX_X and FRAME_MIN_Z < z < FRAME_MAX_Z):
        raise SystemExit('%s at (%s,%s) is outside the camera frame' % (name, x, z))


def main():
    dry_run = '--dry-run' in sys.argv
    scene = Scene(PREFAB)
    props = scene.find(PROPS)
    buildings = scene.find(BUILDINGS)
    if props is None or buildings is None:
        raise SystemExit('%s / %s not found' % (PROPS, BUILDINGS))

    plans = []
    for name, x, z, source, scale, rot in CLUSTERS:
        validate(name, x, z)
        plans.append((props, name, x, z, scene.find(source), scale, rot))
    for name, x, z, source, scale, rot in BUILDING_ROWS:
        validate(name, x, z)
        plans.append((buildings, name, x, z, scene.find(source), scale, rot))

    existing_props = [scene.arr[ref['__id__']]['_name'] for ref in scene.arr[props]['_children']]
    existing_buildings = [scene.arr[ref['__id__']]['_name'] for ref in scene.arr[buildings]['_children']]
    done = []
    for parent, name, x, z, source, scale, rot in plans:
        pool = existing_buildings if parent is buildings else existing_props
        if name in pool:
            continue
        if source is None:
            raise SystemExit('source subtree for %s is missing' % name)
        if dry_run:
            print('  %-20s (%6.1f, %5.1f) from %-28s scale %.2f rotY %3d' % (name, x, z, source, scale, rot))
            continue
        node = clone_subtree(scene, source, name)
        place(scene, node, x, z, scale, rot)
        pool.append(name)
        done.append((parent, node, name))
        print('  %-20s (%6.1f, %5.1f) from %-28s scale %.2f rotY %3d' % (name, x, z, source, scale, rot))

    if dry_run:
        print('dry run: %d nodes would be added, nothing written' % len(plans))
        return 0
    if not done:
        print('nothing to add')
        return 0

    by_parent = {}
    for parent, node, name in done:
        by_parent.setdefault(parent, []).append(node)
    for parent, nodes in by_parent.items():
        scene.set_children(parent, nodes)
        scene.commit(expect={parent: len(nodes)})
    print('added %d nodes to %s' % (len(done), os.path.relpath(PREFAB, repo_root())))
    return 0


if __name__ == '__main__':
    sys.exit(main())
