"""Move authored arena content that `LEVEL_COMPOSITION_REVIEW` flags.

Two jobs, both from that gate's findings:

1. Six spawn points outside the camera frame (z 11.4..15.6 against a frame limit
   of z=11) -- a quarter of the authored collectibles that could never be seen in
   the arena. They are the three points of `produce-discard` and the three of
   `parking-recycling`, two clusters beyond the north-east frame corner. Each
   point keeps its offset from its own cluster centre and only the centre moves,
   so each cluster lands as the same 3-point ring it was authored as.

2. `SupermarketCenterOfficeN`, which stands at (0, -22) -- the centre of the south
   road surface (`RoadSouth` covers x -6..6, z -24..-8). A building in the roadway
   is what the district's own lane rule exists to prevent, and the frame shows it
   plainly: the road splits around it. It moves south to (0, -30), clear of the
   road, in the same column and between two existing south buildings.

Edited by directed text replacement, not by a JSON round trip: this prefab is 620
elements and rewriting it through `json.dumps` reformats every line, which buries a
handful of number changes under hundreds of lines of noise and is the failure mode
this project already recorded in its scene-editing rules. Every edit is computed
and validated before anything is written, so a rejected plan cannot half-apply.

Run: python scripts/relocate_arena_content.py [--write]
"""
import json
import math
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PREFAB = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'maps', 'Supermarket.prefab')

FRAME_MIN_X, FRAME_MAX_X = -31.0, 31.0
FRAME_MIN_Z, FRAME_MAX_Z = -43.0, 11.0
TRAFFIC_LANE_HALF_WIDTH = 8.0
MIN_GAP = 3.0

# cluster group node -> its centre's new x/z.
TARGETS = {
    'produce-discard': (17.0, -17.5),
    'parking-recycling': (-17.0, -17.5),
}

# Whole nodes that move, by name -> (x, z). Only the top of each subtree moves;
# its children keep their offsets.
NODE_MOVES = {
    'SupermarketCenterOfficeN': (0.0, -30.0),
}

# Nodes standing in the spawn ring, pushed radially outward until their body
# clears it. Named with the position they currently occupy, because several
# buildings share a name and only these two are on the ring -- and the two are
# mirrored copies under DIFFERENT names (`SupermarketBuilding` on the west,
# `SupermarketAnnex` on the east), so a name alone would not find them.
RING_PUSH = (
    ('SupermarketBuilding', -8.8, -12.0, 4.0),
    ('SupermarketAnnex', 8.8, -12.0, 4.0),
)

# Road surfaces, as the prefab places them, so a move can be checked against the
# road rather than against the guard's 8-unit authoring margin (the road is 12
# wide, so that margin is wider than the road it protects).
ROAD_RECTS = (
    (-7.5, 7.5, -7.5, 7.5),      # MainCrossroad, 16x16 with a 0.5 inset
    (-5.5, 5.5, 8.5, 23.5),      # RoadNorth
    (-5.5, 5.5, -23.5, -8.5),    # RoadSouth
    (-21.5, -10.5, -7.5, 7.5),   # RoadWest
    (10.5, 21.5, -7.5, 7.5),     # RoadEast
)


def element_spans(text):
    """Every top-level array element's span, by brace depth (never by newline)."""
    spans = []
    depth = 0
    start = None
    in_string = False
    escaped = False
    for index, char in enumerate(text):
        if in_string:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == '{':
            if depth == 0:
                start = index
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0 and start is not None:
                spans.append((start, index + 1))
                start = None
    return spans


def main():
    write = '--write' in sys.argv
    with open(PREFAB, encoding='utf-8', newline='') as handle:
        text = handle.read()

    doc = json.loads(text)
    arr = doc if isinstance(doc, list) else doc['data']
    spans = element_spans(text)
    if len(spans) != len(arr):
        print('found %d elements but parsed %d -- refusing to edit'
              % (len(spans), len(arr)))
        return 1

    parents = {}
    for index, node in enumerate(arr):
        if not node or node.get('__type__') != 'cc.Node':
            continue
        for child in node.get('_children') or []:
            parents[child['__id__']] = index

    def group_of(index):
        names = []
        current = index
        while current in parents:
            names.append(arr[parents[current]].get('_name') or '')
            current = parents[current]
        return names

    moving = {}
    for index, node in enumerate(arr):
        if not node or node.get('__type__') != 'cc.Node':
            continue
        if not str(node.get('_name') or '').startswith('SpawnPoint'):
            continue
        names = group_of(index)
        group = next((name for name in TARGETS if name in names), None)
        if group:
            moving.setdefault(group, []).append(index)

    for group in TARGETS:
        if len(moving.get(group, [])) != 3:
            print('cluster %s has %d spawn point(s), expected 3'
                  % (group, len(moving.get(group, []))))
            return 1
    if sum(len(v) for v in moving.values()) != 6:
        print('expected 6 moving points in total')
        return 1

    # The frame limits are the arena camera's, and a group node sits at the prefab
    # root with no scale, so a point's local offset is its world position.
    edits = []
    anchor_positions = []
    for index, node in enumerate(arr):
        if not node or node.get('__type__') != 'cc.Node':
            continue
        if not str(node.get('_name') or '').startswith('SpawnPoint'):
            continue
        if index in {i for indices in moving.values() for i in indices}:
            continue
        pos = node.get('_lpos') or {}
        anchor_positions.append((pos.get('x', 0.0), pos.get('z', 0.0)))

    for group, (centre_x, centre_z) in TARGETS.items():
        members = moving[group]
        mean_x = sum((arr[i]['_lpos'].get('x', 0.0) for i in members)) / len(members)
        mean_z = sum((arr[i]['_lpos'].get('z', 0.0) for i in members)) / len(members)
        print('%s: %d point(s), local mean (%+.2f, %+.2f) -> centre (%.1f, %.1f)'
              % (group, len(members), mean_x, mean_z, centre_x, centre_z))
        for index in members:
            node = arr[index]
            pos = node['_lpos']
            new_x = round(pos.get('x', 0.0) - mean_x + centre_x, 3)
            new_z = round(pos.get('z', 0.0) - mean_z + centre_z, 3)
            edits.append({
                'index': index,
                'name': node.get('_name'),
                'old': (pos.get('x', 0.0), pos.get('z', 0.0)),
                'new': (new_x, new_z),
            })

    # Whole-node moves. Idempotent like the cluster move: the target is absolute,
    # so re-running after a successful write is a no-op.
    for name, (target_x, target_z) in NODE_MOVES.items():
        matches = [index for index, node in enumerate(arr)
                   if node and node.get('__type__') == 'cc.Node'
                   and node.get('_name') == name]
        if len(matches) != 1:
            print('expected exactly one node named %s, found %d' % (name, len(matches)))
            return 1
        index = matches[0]
        pos = arr[index].get('_lpos') or {}
        print('%s: (%+.1f, %+.1f) -> (%.1f, %.1f)'
              % (name, pos.get('x', 0.0), pos.get('z', 0.0), target_x, target_z))
        edits.append({
            'index': index,
            'name': name,
            'old': (pos.get('x', 0.0), pos.get('z', 0.0)),
            'new': (round(target_x, 3), round(target_z, 3)),
            'whole_node': True,
        })

    # Radial pushes: keep the direction, move the node out until its body clears
    # the spawn ring. Matching by name AND current position, because the name is
    # not unique.
    for name, near_x, near_z, distance in RING_PUSH:
        matches = [index for index, node in enumerate(arr)
                   if node and node.get('__type__') == 'cc.Node'
                   and node.get('_name') == name
                   and abs((node.get('_lpos') or {}).get('x', 0.0) - near_x) < 0.6
                   and abs((node.get('_lpos') or {}).get('z', 0.0) - near_z) < 0.6]
        if len(matches) != 1:
            print('expected one %s near (%.1f, %.1f), found %d'
                  % (name, near_x, near_z, len(matches)))
            return 1
        index = matches[0]
        pos = arr[index].get('_lpos') or {}
        old_x, old_z = pos.get('x', 0.0), pos.get('z', 0.0)
        radius = math.hypot(old_x, old_z)
        if radius <= 0:
            print('%s is at the origin; a radial push has no direction' % name)
            return 1
        scale = (radius + distance) / radius
        print('%s: (%+.1f, %+.1f) r=%.2f -> pushed %.1f outward'
              % (name, old_x, old_z, radius, distance))
        edits.append({
            'index': index,
            'name': '%s r%.1f' % (name, radius),
            'old': (old_x, old_z),
            'new': (round(old_x * scale, 3), round(old_z * scale, 3)),
            'whole_node': True,
        })

    failures = []
    for edit in edits:
        new_x, new_z = edit['new']
        if not (FRAME_MIN_X < new_x < FRAME_MAX_X and FRAME_MIN_Z < new_z < FRAME_MAX_Z):
            failures.append('%s -> (%.1f, %.1f) is outside the camera frame'
                            % (edit['name'], new_x, new_z))
        # Checked against the road SURFACE, not the guard's 8-unit margin: the road
        # is 12 wide, so a band of 8 is wider than the thing it protects and would
        # reject the kerb the street lights legitimately stand on.
        for left, right, bottom, top in ROAD_RECTS:
            if left < new_x < right and bottom < new_z < top:
                failures.append('%s -> (%.1f, %.1f) stands on a road surface'
                                % (edit['name'], new_x, new_z))
        # Spawn points are collectibles and may sit close together by design, so
        # the spacing rule is only applied to the points being moved as a group.
        if not edit.get('whole_node'):
            for ax, az in anchor_positions:
                if math.hypot(new_x - ax, new_z - az) < MIN_GAP:
                    failures.append('%s -> (%.1f, %.1f) is within %.1f of an existing point'
                                    ' at (%.1f, %.1f)'
                                    % (edit['name'], new_x, new_z, MIN_GAP, ax, az))
            for other in edits:
                if other is edit or other.get('whole_node'):
                    continue
                if math.hypot(new_x - other['new'][0], new_z - other['new'][1]) < MIN_GAP:
                    failures.append('%s -> (%.1f, %.1f) is within %.1f of another moved point'
                                    % (edit['name'], new_x, new_z, MIN_GAP))

    for edit in edits:
        print('  %-14s (%+6.1f, %+6.1f) -> (%+6.1f, %+6.1f)'
              % (edit['name'], edit['old'][0], edit['old'][1], edit['new'][0], edit['new'][1]))

    if failures:
        print('REFUSING to write, %d problem(s):' % len(failures))
        for failure in failures:
            print('  - %s' % failure)
        return 1

    if not write:
        print('\n(dry run; pass --write to save)')
        return 0

    # Replace only the two numbers inside each element's own `_lpos`, applied back
    # to front so earlier offsets stay valid. A value-only span: replacing the
    # whole element here would have let a second edit undo the first.
    #
    # The value is consumed by an explicit pattern for the serialisation this file
    # uses -- `"x": -11.2` on its own line, an optional sign, and either an int or
    # a decimal. An earlier version scanned digits and spaces forward from the
    # colon, which stopped one character short on `-13` (no decimal point) and on
    # a value already preceded by a minus, and left the number untouched.
    NUMBER = r'-?\d+(?:\.\d+)?'
    replacements = []
    for edit in edits:
        span_start, span_end = spans[edit['index']]
        block = text[span_start:span_end]
        # Confine the search to this element's `_lpos` object. The node also has
        # `_lrot` and `_lscale` with `x`/`y`/`z` keys of their own, and a bare
        # `"x":` search finds the wrong one.
        lpos = block.index('"_lpos": {')
        lpos_end = block.index('}', lpos)
        region = block[lpos:lpos_end]
        # Replace `z` before `x`: substituting `x` first changes the byte offsets
        # of everything after it, including the `z` line.
        replaced = 0
        for key, value in (('z', edit['new'][1]), ('x', edit['new'][0])):
            pattern = re.compile(r'"%s": (%s)' % (key, NUMBER))
            matches = pattern.findall(region)
            if len(matches) != 1:
                raise SystemExit('"_lpos" has "%s": %d time(s) in %s'
                                 % (key, len(matches), edit['name']))
            # Skip a component whose value is numerically unchanged: rewriting
            # `0` as `0.0` is a diff line that says nothing and makes the change
            # look bigger than it is.
            if float(matches[0]) != float(value):
                region = pattern.sub('"%s": %s' % (key, value), region, count=1)
                replaced += 1
        if replaced == 0:
            continue
        block = block[:lpos] + region + block[lpos_end:]
        replacements.append((span_start, span_end, block))

    # Back to front, so a replacement never shifts an offset the next one relies on.
    out = text
    for span_start, span_end, block in sorted(replacements, key=lambda item: item[0], reverse=True):
        out = out[:span_start] + block + out[span_end:]

    # The result must still parse and carry the six new positions.
    after = json.loads(out)
    after_arr = after if isinstance(after, list) else after['data']
    for edit in edits:
        pos = after_arr[edit['index']]['_lpos']
        if abs(pos.get('x', 0.0) - edit['new'][0]) > 1e-6 or abs(pos.get('z', 0.0) - edit['new'][1]) > 1e-6:
            print('post-write check failed for %s; not saving' % edit['name'])
            return 1
    if len(element_spans(out)) != len(arr):
        print('post-write element count changed; not saving')
        return 1

    with open(PREFAB, 'w', encoding='utf-8', newline='') as handle:
        handle.write(out)
    print('\nwrote %s (%d numbers changed)' % (os.path.relpath(PREFAB, ROOT), len(edits) * 2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
