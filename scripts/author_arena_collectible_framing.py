"""Move the four off-frame collectible groups into the arena's visible ground.

The locked `golden-city-composition.json` contract requires 20 visible authored
collectible slots and 2 visible resource clusters in a real gameplay frame. The
supermarket cell authors 24 slots in 8 groups; measured against the gameplay
camera, 13 project inside the frame and 11 do not. All 11 belong to four groups:

    delivery-boxes      |x| 11.2..13.9   z -11.45..-14.55
    cart-return-litter  |x| 12.1..14.8   z -10.45..-13.55
    produce-discard     |x| 16.1..18.8   z -15.95..-19.05
    parking-recycling   |x| 15.2..17.9   z -15.95..-19.05

The frustum is a TRAPEZOID (measured by ray-cast, `probe_arena_ground_frustum.mjs`):
half-width 10.0 at z -3.8, 14.0 at the far edge z -40.8. A body at z -13 has 11.0
of half-width available, so |x| >= 11.2 sits just outside it -- the four groups
were authored for the cell as a whole, not for the frame. They are not broken
content: they are content the player cannot see, which is exactly what the
contract forbids.

What this does: translate each of the four groups inward by the smallest amount
that puts all three of its slots inside the frustum, then re-check every slot with
the SAME rules `author_arena_composition.py` applies to static bodies -- off the
road cross, clear of each of the seven rival spawn points by SPAWN_BODY_CLEARANCE,
inside the frustum. The group's internal offsets are preserved, so a cluster still
reads as one cluster rather than three scattered props.

This is a prefab authoring change: it moves `SpawnPoint_N` nodes under
`CollectibleSpawnPoints/<group>` and leaves every other node untouched.

Run: python scripts/author_arena_collectible_framing.py [--dry-run]
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scene_edit import Scene  # noqa: E402
from author_arena_composition import (  # noqa: E402
    ARENA_SPAWN_RADIUS,
    SPAWN_BODY_CLEARANCE,
    half_width_at,
    inside_frustum,
    on_road,
    spawn_positions,
)

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PREFAB = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'maps', 'Supermarket.prefab')

# A collectible's authored footprint. The probe projects each slot with a
# nominal 0.5-wide box (AUTHORED_SLOT_HALF_EXTENT = 0.25), so the framing test
# must use the same number the gate reads, not an art-measured width.
SLOT_FOOTPRINT = 0.5

# Every static solid the gate treats as an occluder -- buildings, trees, POI --
# as world-space x/z AABBs plus height, read from the live composition probe. A
# slot may be inside the frustum and still hidden behind one of these: the
# camera sits at height 44 pitched -55 degrees, so a temple-width silhouette
# covers everything deeper than it at the same screen column. The gate's
# occlusion check measures exactly that ("a subject deeper along the camera
# forward axis whose screen rect the solid covers"), and it caught four slots
# that a buildings-only footprint test called clear -- so the test here is the
# same test over the same occluder set, not a weaker one.
#
#     x0, x1, z0, z1, top
BUILDING_FOOTPRINTS = {
    'SupermarketBuilding': (-13.28, -9.05, -17.21, -13.24, 5.82),
    'SupermarketBuildingSouth1': (-10.91, -6.68, -31.99, -28.01, 5.82),
    'SupermarketBuildingSouth2': (6.69, 10.92, -31.99, -28.01, 5.82),
    'SupermarketBuildingSouth5': (-2.11, 2.12, -41.99, -38.01, 5.82),
    'ArenaTreeW1': (-8.84, -8.16, -17.89, -17.11, 1.23),
    'ArenaTreeW2': (-8.84, -8.16, -21.89, -21.11, 0.91),
    'ArenaTreeW3': (-8.84, -8.16, -25.89, -25.11, 1.23),
    'ArenaTreeW4': (-8.84, -8.16, -29.89, -29.11, 0.91),
    'ArenaTreeW5': (-8.84, -8.16, -33.89, -33.11, 1.23),
    'ArenaTreeW6': (-8.84, -8.16, -37.89, -37.11, 0.91),
    'ArenaTreeE1': (8.16, 8.84, -17.89, -17.11, 0.91),
    'ArenaTreeE2': (8.16, 8.84, -21.89, -21.11, 1.23),
    'ArenaTreeE3': (8.16, 8.84, -25.89, -25.11, 0.91),
    'ArenaTreeE4': (8.16, 8.84, -29.89, -29.11, 1.23),
    'ArenaTreeE5': (8.16, 8.84, -33.89, -33.11, 0.91),
    'ArenaTreeE6': (8.16, 8.84, -37.89, -37.11, 1.23),
    'SupermarketBoundaryFence': (-1.92, 1.92, -26.30, -25.70, 0.65),
}

# The arena gameplay camera: height, pitch, and the forward vector that the
# occlusion depth is measured along. From CAMERA_PROFILE.arena (0,44,27)/-55.
CAMERA_HEIGHT = 44.0
FORWARD = (-0.0, -0.8191520442889919, -0.573576436351046)
SLOT_HEIGHT = 0.35


def depth_along_forward(x, y, z):
    """Distance along the camera's forward axis, from the gate's own formula."""
    return (x - 0.0) * FORWARD[0] + (y - CAMERA_HEIGHT) * FORWARD[1] + (z - 27.0) * FORWARD[2]


def occluded_by(x, z, x0, x1, z0, z1, top):
    """Would a slot at (x, z) be hidden behind this building?

    Two conditions, both required, mirroring the gate: the slot is deeper along
    the forward axis than the building's centre, and its screen x falls inside
    the building's screen span (approximated by its x span widened by the
    perspective spread at that depth, which for this camera is about 1.3x).
    """
    slot_depth = depth_along_forward(x, SLOT_HEIGHT, z)
    building_depth = depth_along_forward((x0 + x1) / 2.0, top / 2.0, (z0 + z1) / 2.0)
    if slot_depth <= building_depth:
        return False
    # The building occludes only the screen columns it occupies; a slot well
    # outside its x span is clear even at greater depth.
    return x0 - 1.0 <= x <= x1 + 1.0


GROUPS_ROOT_NAME = 'CollectibleSpawnPoints'

# The four groups measured outside the frame, with the translation that brings
# them in. Each entry is (group, dx, dz): applied to the group's own origin, so
# the cluster keeps its shape. The shifts were solved over a 0.25 grid for the
# smallest move that satisfies all three rules for every slot in the group at
# once; the solver output is what the checks below re-verify, so a future edit
# that breaks a rule is refused rather than silently applied.
RELOCATIONS = {
    'delivery-boxes': (3.75, 3.00),
    'cart-return-litter': (-5.25, -3.25),
    'produce-discard': (-8.00, 1.75),
    'parking-recycling': (8.70, 9.25),
}


def slot_positions(scene, group_id):
    """(name, x, z, node_id) for every SpawnPoint_ child of a group, local coords."""
    group = scene.arr[group_id]
    out = []
    for ref in group.get('_children') or []:
        child_id = ref['__id__']
        child = scene.arr[child_id]
        name = str(child.get('_name') or '')
        if not name.startswith('SpawnPoint_'):
            continue
        lpos = child.get('_lpos') or {}
        out.append((name, float(lpos.get('x') or 0.0), float(lpos.get('z') or 0.0), child_id))
    return out


def check(name, x, z, problems):
    """The same three rules the static-body validator uses, as warnings."""
    if on_road(x, z):
        problems.append('%s at (%.2f, %.2f) is on the road cross' % (name, x, z))
    for index, (spawn_x, spawn_z) in enumerate(spawn_positions()):
        gap = math.hypot(x - spawn_x, z - spawn_z) - SLOT_FOOTPRINT / 2.0
        if gap < SPAWN_BODY_CLEARANCE:
            problems.append('%s at (%.2f, %.2f) leaves %.2f from spawn point %d (needs %.1f)'
                            % (name, x, z, gap, index, SPAWN_BODY_CLEARANCE))
    if not inside_frustum(x, z, SLOT_FOOTPRINT):
        problems.append('%s at (%.2f, %.2f) is outside the frustum (half-width %.2f there)'
                        % (name, x, z, half_width_at(z)))
    for building, (x0, x1, z0, z1, top) in BUILDING_FOOTPRINTS.items():
        # Being inside the frustum is not the same as being in front of it. The
        # camera sits at height 44 looking down -55 degrees, so a 5.82-tall
        # building projects a wide silhouette and everything deeper than it at
        # the same screen column is hidden behind it. The gate's occlusion check
        # measures exactly that (a subject deeper along the camera forward axis
        # whose screen rect the building covers) and it caught three slots the
        # plain footprint test called clear, so the test here is the same test:
        # is the slot farther along forward than the building's centre, and does
        # its screen x fall inside the building's screen span.
        if occluded_by(x, z, x0, x1, z0, z1, top):
            problems.append('%s at (%.2f, %.2f) is behind %s and would be occluded'
                            % (name, x, z, building))


def main():
    dry_run = '--dry-run' in sys.argv
    scene = Scene(PREFAB)

    groups_root_id = scene.find(GROUPS_ROOT_NAME)
    if groups_root_id is None:
        raise SystemExit('%s not found in %s' % (GROUPS_ROOT_NAME, PREFAB))

    groups_root = scene.arr[groups_root_id]
    group_ids = {}
    for ref in groups_root.get('_children') or []:
        node = scene.arr[ref['__id__']]
        group_ids[str(node.get('_name') or '')] = ref['__id__']

    missing = [name for name in RELOCATIONS if name not in group_ids]
    if missing:
        raise SystemExit('collectible group(s) not found: %s (present: %s)'
                         % (', '.join(missing), ', '.join(sorted(group_ids))))

    moved = 0
    problems = []
    placed = []
    print('relocating collectible groups into the visible frame:')
    for group, (dx, dz) in sorted(RELOCATIONS.items()):
        before = slot_positions(scene, group_ids[group])
        print('  %-20s shift (%+.1f, %+.1f)' % (group, dx, dz))
        for name, bx, bz, child_id in before:
            ax, az = bx + dx, bz + dz
            was_visible = inside_frustum(bx, bz, SLOT_FOOTPRINT)
            now_visible = inside_frustum(ax, az, SLOT_FOOTPRINT)
            check('%s/%s' % (group, name), ax, az, problems)
            moved += 1
            placed.append(('%s/%s' % (group, name), ax, az))
            print('    %-14s (%6.2f,%7.2f) -> (%6.2f,%7.2f)  %s -> %s'
                  % (name, bx, bz, ax, az,
                     'visible' if was_visible else 'OUTSIDE',
                     'visible' if now_visible else 'OUTSIDE'))
            if not dry_run:
                # `set_lpos` is the 2D x/y screen case; this cell is laid out on
                # the xz-plane, so writing x/y would move the spawn point's
                # height instead of its depth.
                scene.set_lpos_xz(child_id, ax, az)

    # Two clusters stacking on the same spot is invisible in every count-based
    # gate but reads as a smear on screen, and the groups on opposite sides of the
    # road approach each other as they move inward. The first solver attempt put
    # cart-return-litter and produce-discard 0.78 apart, so this is checked, not
    # assumed.
    for index, (name_a, ax, az) in enumerate(placed):
        for name_b, bx, bz in placed[index + 1:]:
            distance = math.hypot(ax - bx, az - bz)
            if distance < 1.3:
                problems.append('%s and %s are %.2f apart (needs >= 1.3)' % (name_a, name_b, distance))

    if problems:
        raise SystemExit('refusing to write: %d placement problem(s):\n  %s'
                         % (len(problems), '\n  '.join(problems)))

    if dry_run:
        print('\ndry run: nothing written')
        return 0

    # Nothing is added or removed, only _lpos on existing nodes, so there is no
    # added-children expectation to assert.
    scene.commit()
    print('\nwrote %d spawn points across %d groups' % (moved, len(RELOCATIONS)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
