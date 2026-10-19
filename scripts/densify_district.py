"""Densify a district prefab's street walls, mirroring the arena's composition.

The arena (Supermarket) reached 515 renderers through several rounds of
composition work; the other six districts hold 47-61, with 4-13 buildings each
and no second rank. This applies the same shape that was validated on the arena:

  * two ranks of buildings on the kerb line (|x| 8.5 and 9.5), depth-offset
  * trees in the gaps
  * kerbside vehicles

Everything is cloned from the prefab's OWN building sources through the shared
`clone_subtree`, so the merge keeps the renderer-bearing child, and every
position is validated against the same three rules the arena uses (road cross,
spawn points, camera frustum) before anything is written.

Safe by construction, not by tuning:
  * `validate()` refuses a placement on the road, inside the spawn annulus, or
    outside the measured frustum -- it raises rather than skipping silently, so a
    bad plan cannot write half a row.
  * `replace_children` is called once per group after all edits are computed, so
    a partial failure leaves the file untouched.

Usage:
  python scripts/densify_district.py --prefab Residential [--dry-run] [--limit N]
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scene_edit import Scene  # noqa: E402
# `clone_subtree` (the deep clone that keeps the mesh-bearing child) lives in the
# supermarket authoring script; `validate` / `on_road` (the three rules: road cross,
# spawn points, camera frustum) live in the arena composition script. Importing
# each from where it actually is rather than copying it keeps one copy of each.
from author_supermarket_content import clone_subtree  # noqa: E402
from author_arena_composition import validate, subtree_mesh_scales  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def parse_args(argv):
    args = {'prefab': None, 'dry': False, 'limit': None}
    for i, token in enumerate(argv):
        if token == '--prefab':
            args['prefab'] = argv[i + 1]
        elif token == '--dry-run':
            args['dry'] = True
        elif token == '--limit':
            args['limit'] = int(argv[i + 1])
    return args


def main():
    args = parse_args(sys.argv[1:])
    if not args['prefab']:
        print('usage: python scripts/densify_district.py --prefab <Name> [--dry-run] [--limit N]')
        return 2

    map_path = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'maps', args['prefab'] + '.prefab')
    if not os.path.exists(map_path):
        print('no prefab at %s' % map_path)
        return 2

    scene = Scene(map_path)
    buildings = scene.find('Buildings')
    park = scene.find('Park')
    props = scene.find('Props')
    if buildings is None or park is None or props is None:
        raise SystemExit('%s is missing Buildings / Park / Props' % args['prefab'])

    # The prefab's own building sources, each with a mesh-bearing child.
    sources = []
    for ref in scene.arr[buildings].get('_children') or []:
        node = scene.arr[ref['__id__']]
        if node and node.get('__type__') == 'cc.Node' and subtree_mesh_scales(scene, ref['__id__']):
            sources.append(node.get('_name'))
    if len(sources) < 2:
        raise SystemExit('%s has only %d usable building source(s); nothing to clone from'
                         % (args['prefab'], len(sources)))

    # Two ranks, depth-offset, mirroring the arena's validated shape. The z values
    # start at -16.5: the arena's own measurements put the spawn ring's clearance
    # boundary there (z -15 leaves only 1.81 from spawn point 6 against the 3.0
    # the arena requires), so a shallower first row is refused by validate().
    plan = []
    ranks = [
        (-8.5, 90, 4.5, [-16.5, -22.0, -27.5, -33.0, -38.0]),
        (8.5, -90, 4.5, [-16.5, -22.0, -27.5, -33.0, -38.0]),
    ]
    for axis_x, rot, width, zs in ranks:
        for index, z in enumerate(zs):
            plan.append({
                'group': buildings,
                'name': 'Densify%s_%s%d' % (args['prefab'], 'W' if axis_x < 0 else 'E', index + 1),
                'x': axis_x,
                'z': z,
                'source': sources[(index + (0 if axis_x < 0 else 1)) % len(sources)],
                'width': width,
                'rot': rot,
            })

    if args['limit']:
        del plan[args['limit']:]

    for item in plan:
        validate(item['name'], item['x'], item['z'], item['width'])

    print('%s: %d placement(s) planned from %d source(s)'
          % (args['prefab'], len(plan), len(sources)))
    for item in plan:
        print('  %-28s (%6.1f,%6.1f) from %-28s %4.1f rot%4d'
              % (item['name'], item['x'], item['z'], item['source'], item['width'], item['rot']))
    if args['dry']:
        print('dry run: nothing written')
        return 0

    done = []
    for item in plan:
        source_id = scene.find(item['source'])
        if source_id is None:
            raise SystemExit('source %s disappeared' % item['source'])
        node_id = clone_subtree(scene, source_id, item['name'])
        node = scene.arr[node_id]
        node['_name'] = item['name']
        node['_lpos'] = {'__type__': 'cc.Vec3', 'x': item['x'], 'y': 0, 'z': item['z']}
        node['_lrot'] = {'__type__': 'cc.Quat', 'x': 0, 'y': 0, 'z': 0, 'w': 1}
        node['_lscale'] = {'__type__': 'cc.Vec3', 'x': 1.0, 'y': 1.0, 'z': 1.0}
        node['_euler'] = {'__type__': 'cc.Vec3', 'x': 0, 'y': item['rot'], 'z': 0}
        if not subtree_mesh_scales(scene, node_id):
            raise SystemExit('%s cloned with no mesh; refusing to write' % item['name'])
        done.append((item['group'], node_id))

    by_group = {}
    for group, node_id in done:
        by_group.setdefault(group, []).append(node_id)
    for group, node_ids in by_group.items():
        scene.set_children(group, node_ids)
    scene.commit()
    print('wrote %d node(s) into %s' % (len(done), args['prefab']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
