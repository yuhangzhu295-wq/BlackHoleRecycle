"""Move six arena spawn points into the camera frame, keeping their cluster shape.

`LEVEL_COMPOSITION_REVIEW` records 24 spawn points, 6 of them outside the camera
frame (z 11.4..15.6 against a frame limit of z=11) -- a quarter of the authored
collectibles that can never be seen in the arena. They are the three points of
`produce-discard` and the three of `parking-recycling`, two clusters sitting
beyond the north-east frame corner.

Each point keeps its offset from its own cluster centre and only the centre
moves, so each cluster lands as the same 3-point ring it was authored as. The two
new centres are the diagonals the far clusters do not already use, at a radius
comparable to the ones that do live there.

Edited by directed text replacement, not by a JSON round trip: this prefab is 620
elements and rewriting it through `json.dumps` reformats every line, which buries a
six-number change under hundreds of lines of noise and is the failure mode this
project already recorded in its scene-editing rules. Every edit is computed and
validated before anything is written, so a rejected plan cannot half-apply.

Run: python scripts/relocate_arena_spawn_clusters.py [--write]
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

    failures = []
    for edit in edits:
        new_x, new_z = edit['new']
        if not (FRAME_MIN_X < new_x < FRAME_MAX_X and FRAME_MIN_Z < new_z < FRAME_MAX_Z):
            failures.append('%s -> (%.1f, %.1f) is outside the camera frame'
                            % (edit['name'], new_x, new_z))
        if abs(new_x) <= TRAFFIC_LANE_HALF_WIDTH or abs(new_z) <= TRAFFIC_LANE_HALF_WIDTH:
            failures.append('%s -> (%.1f, %.1f) is in a traffic lane'
                            % (edit['name'], new_x, new_z))
        for ax, az in anchor_positions:
            if math.hypot(new_x - ax, new_z - az) < MIN_GAP:
                failures.append('%s -> (%.1f, %.1f) is within %.1f of an existing point'
                                ' at (%.1f, %.1f)' % (edit['name'], new_x, new_z, MIN_GAP, ax, az))
        for other in edits:
            if other is edit:
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
            region = pattern.sub('"%s": %s' % (key, value), region, count=1)
            replaced += 1
        if replaced != 2:
            raise SystemExit('expected to replace 2 numbers, replaced %d' % replaced)
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
