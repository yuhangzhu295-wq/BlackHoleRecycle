"""Author the four near-spawn collectible groups the arena prefab is missing.

This is the missing half of an earlier PHASE B change. That change added four
clusters to `DistrictTemplates.SUPERMARKET` at +-7 so that "出生点附近必有可吞目标"
(DESIGN_07 point 2) would hold. It did not, and nothing could have noticed:

  * `DistrictTemplates` owns WHAT a cluster contains (`preferredTypes`).
  * The PREFAB owns WHERE, as `CollectibleSpawnPoints/<clusterId>/SpawnPoint_*`.
  * `populateAuthoredDistrictContent` iterates the prefab's groups and looks each
    one UP in `DistrictTemplates`. It never iterates the other way.

`Supermarket.prefab` declared only the four CORNER groups -- `delivery-boxes`,
`cart-return-litter`, `produce-discard`, `parking-recycling` -- and every one of
their spawn points sits at radius 16..21 from the cell centre. So the four +-7
clusters had no spawn points and placed nothing, and the arena opening cell had
no collectible inside radius 16 at all. Measured before this fix, at the arena
spawn: 14 objects within 32 units of which 6 were T1, versus 178 objects beyond
32 -- and a 44-unit straight drive (about 211 square units swept) caught nothing.

Each new group gets three `SpawnPoint_*` children arranged around its cluster
centre in the same triangle the corner groups use, so the authored style is
consistent. A decorative `ClusterProp_*` is NOT added: those are mesh-bearing
children the runtime never reads, and inventing one without a mesh would be
decoration that draws nothing.

Node and `cc.PrefabInfo` elements are added together, each with a fresh unique
`fileId`; a node whose `_prefab` points at another node's PrefabInfo is a
malformed prefab.

Run: python scripts/author_supermarket_spawn_points.py
"""
import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.scene_edit import Scene, repo_root  # noqa: E402

PREFAB = os.path.join(repo_root(), 'cocos', 'assets', 'game_art', 'maps', 'Supermarket.prefab')
PARENT = 'CollectibleSpawnPoints'
TEMPLATE_GROUP = 'delivery-boxes'

# (cluster id, centre x, centre z) -- the same centres DistrictTemplates declares.
NEW_GROUPS = (
    ('trolley-litter', -7, -7),
    ('basket-spill', 7, -7),
    ('checkout-discard', -7, 7),
    ('entrance-litter', 7, 7),
)

# Radii from the CELL CENTRE, and angles WITHIN the quadrant measured from the
# cluster's own outward axis.
#
# The first version packed all three points in a tight triangle around the
# cluster centre, which put every one of them 8..12 units out on a diagonal. The
# player spawns at the centre and drives along an axis, so a lateral offset of
# 5..9 units against a 2.4 suction radius meant a straight drive passed nothing:
# measured, all four cardinal drives gained 0kg. Spreading the points across the
# quadrant -- including close to the axis -- is what makes the spawn reachable.
# The innermost point takes `preferredTypes[0]`, so it is a T1 for every group
# whose list leads with one.
RADII = (4.5, 6.5, 8.5)
QUADRANT_ANGLES_DEG = (20.0, 45.0, 70.0)
SPAWN_Y = 0.2


def fresh_file_id():
    """Cocos file ids are 22-char URL-safe base64. Uniqueness is what matters."""
    raw = base64.urlsafe_b64encode(os.urandom(18)).decode('ascii')
    return raw[:22].replace('=', '')


def point_offsets(centre_x, centre_z):
    """Three positions for one quadrant, as (x, z) in cell space."""
    import math
    # Outward axis of the quadrant, and the tangent 90 degrees from it.
    length = math.hypot(centre_x, centre_z)
    out_x, out_z = centre_x / length, centre_z / length
    tan_x, tan_z = -out_z, out_x
    positions = []
    for radius, angle in zip(RADII, QUADRANT_ANGLES_DEG):
        radians = math.radians(angle)
        positions.append((
            round(radius * (math.cos(radians) * out_x + math.sin(radians) * tan_x), 2),
            round(radius * (math.cos(radians) * out_z + math.sin(radians) * tan_z), 2),
        ))
    return positions


def main():
    scene = Scene(PREFAB)
    parent = scene.find(PARENT)
    if parent is None:
        raise SystemExit('%s not found in %s' % (PARENT, PREFAB))

    existing = [scene.arr[ref['__id__']]['_name'] for ref in scene.arr[parent]['_children']]
    already = [name for name, _, _ in NEW_GROUPS if name in existing]
    if already:
        print('already present, nothing to do: %s' % ', '.join(already))
        return 0

    template_group = scene.find_child(PARENT, TEMPLATE_GROUP)
    if template_group is None:
        raise SystemExit('template group %s not found' % TEMPLATE_GROUP)
    template_point = scene.arr[scene.arr[template_group]['_children'][0]['__id__']]

    def prefab_info():
        info = json.loads(json.dumps(scene.arr[template_point['_prefab']['__id__']]))
        info['fileId'] = fresh_file_id()
        return info

    group_ids = []
    for name, centre_x, centre_z in NEW_GROUPS:
        point_ids = []
        for index, (x, z) in enumerate(point_offsets(centre_x, centre_z)):
            point = json.loads(json.dumps(template_point))
            point['_name'] = 'SpawnPoint_%d' % (index + 1)
            point['_lpos'] = {'x': x, 'y': SPAWN_Y, 'z': z}
            point['_children'] = []
            point['_components'] = []
            info_id = len(scene.arr)
            scene.append_elements([point, prefab_info()])
            point['_prefab'] = {'__id__': info_id + 1}
            point_ids.append(info_id)

        group = json.loads(json.dumps(scene.arr[template_group]))
        group['_name'] = name
        group['_lpos'] = {'x': 0, 'y': 0, 'z': 0}
        group['_children'] = [{'__id__': pid} for pid in point_ids]
        group['_components'] = []
        info_id = len(scene.arr)
        scene.append_elements([group, prefab_info()])
        group['_prefab'] = {'__id__': info_id + 1}
        for pid in point_ids:
            scene.arr[pid]['_parent'] = {'__id__': info_id}
        group_ids.append(info_id)

    scene.set_children(parent, group_ids)
    scene.commit(expect={parent: len(group_ids)})

    # Re-read and report what the prefab now declares, from the file itself.
    with open(PREFAB, encoding='utf-8') as handle:
        written = json.loads(handle.read())
    root = next(i for i, e in enumerate(written)
                if isinstance(e, dict) and e.get('__type__') == 'cc.Node' and e.get('_name') == PARENT)
    print('CollectibleSpawnPoints now declares %d groups:' % len(written[root]['_children']))
    for ref in written[root]['_children']:
        group = written[ref['__id__']]
        points = [written[c['__id__']] for c in group['_children']]
        radii = [round((p['_lpos']['x'] ** 2 + p['_lpos']['z'] ** 2) ** 0.5) for p in points]
        print('  %-22s %d points, radius %d-%d' % (group['_name'], len(points), min(radii), max(radii)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
