"""Give every Settlement leaderboard row the four columns DESIGN_06 specifies.

The reference's rows are: rank badge, coloured hole avatar, name with a 称号
underneath, and mass on the right. Ours are three -- badge, ONE text line
carrying both name and title, and a mass-plus-kills string -- so the avatar is
missing entirely and the name/title hierarchy is flattened into a single run.

What this adds, per row:

  * `ArenaRankAvatar_N` -- a 48px hole disc, tinted at runtime by
    `SettlementPageController` with that competitor's own colour, the same
    one-asset-many-tints technique the settlement ribbons already use.
  * `ArenaRankTitle_N` -- the 称号 on its own line under the name, in the muted
    tone the reference uses, so the name reads as the heading and the title as
    its qualifier.

and re-lays the two existing labels as columns: the name column left-aligned and
the mass right-aligned, which is what makes five rows scan as a table. Both are
switched from `overflow NONE` to `CLAMP` because a NONE label resizes itself
around its text, which makes horizontal alignment a no-op -- the columns would
look aligned only while every name happened to be the same length.

Both clones come from nodes the editor already saved (a childless Sprite and a
Label), because a Label built at runtime is not reliable in the Web Mobile build.

Edits are text splices, not a JSON round-trip: this file is 1 MB of pretty-printed
array and rewriting it wholesale would collapse that formatting.

Run: python scripts/add_settlement_avatars.py
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SCENE = os.path.join(ROOT, 'cocos', 'assets', 'scenes', 'Game.scene')
V95 = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'ui', 'v95')

AVATAR_FILE = 'avatar_blackhole.png'

SPRITE_TEMPLATE = 'ArenaStatMassPanel'
LABEL_TEMPLATE = 'ArenaRankScore_1'

AVATAR_SIZE = (48, 48)
AVATAR_X = -156

# The name column's left edge, and the mass column's right edge. Both are 24
# design px inside the 522-wide row, so the two outer columns are balanced.
NAME_LEFT = -118
NAME_WIDTH = 190
NAME_HEIGHT = 30
NAME_Y = 14
NAME_FONT = 22
NAME_LINE = 30
TITLE_Y = -15
TITLE_WIDTH = 190
TITLE_HEIGHT = 24
TITLE_FONT = 15
TITLE_LINE = 22

SCORE_RIGHT = 237
SCORE_WIDTH = 132
SCORE_HEIGHT = 34
SCORE_FONT = 20
SCORE_LINE = 28

# The muted tone the reference gives the 称号. Read off the existing mass column
# rather than invented, so the title sits in the same secondary tier as the
# numbers beside it.
TITLE_COLOUR = (101, 82, 125, 255)
PLAYER_TITLE_COLOUR = (42, 122, 53, 255)

ROWS = tuple(
    (f'ArenaRankRow_{i}', f'ArenaRankName_{i}', f'ArenaRankScore_{i}',
     f'ArenaRankAvatar_{i}', f'ArenaRankTitle_{i}', TITLE_COLOUR)
    for i in range(1, 6)
) + (('ArenaPlayerRow', 'ArenaPlayerName', 'ArenaPlayerScore',
      'ArenaPlayerAvatar', 'ArenaPlayerTitle', PLAYER_TITLE_COLOUR),)

INDENT = '  '
NL = chr(10)
QUOTE = '"'


def sprite_frame_uuid(name):
    meta_path = os.path.join(V95, name + '.meta')
    if not os.path.exists(meta_path):
        raise SystemExit('missing meta for %s -- run scripts/ensure_avatar_meta.py' % name)
    with open(meta_path, encoding='utf-8') as handle:
        meta = json.load(handle)
    for sub in (meta.get('subMetas') or {}).values():
        if sub.get('name') == 'spriteFrame':
            return sub['uuid']
    raise SystemExit('no spriteFrame sub-asset in ' + meta_path)


def find_node(arr, name):
    for index, obj in enumerate(arr):
        if isinstance(obj, dict) and obj.get('__type__') == 'cc.Node' and obj.get('_name') == name:
            return index
    return None


def component_id(arr, node_id, type_name):
    for ref in arr[node_id]['_components']:
        if arr[ref['__id__']].get('__type__') == type_name:
            return ref['__id__']
    return None


def element_spans(text):
    """Exact byte range of every top-level array element, in `__id__` order.

    Counting occurrences of a `newline + two spaces + {` prefix -- which is how
    the earlier scene-edit script located elements -- is only correct while EVERY
    element is pretty-printed on its own line. This scene has 1376 elements and
    only 1355 such prefixes: 21 of them are written inline, so the count drifts
    and every element after the first inline one is located at the wrong offset.
    That does not fail loudly; it splices a valid-looking edit into the wrong
    element and corrupts the file.

    Scanning brace depth once is exact regardless of formatting, and the result
    is checked against the parsed array length before anything is written.
    """
    spans = []
    depth = 0
    in_string = False
    escaped = False
    start = None
    for index, char in enumerate(text):
        if in_string:
            if escaped:
                escaped = False
            elif char == chr(92):
                escaped = True
            elif char == QUOTE:
                in_string = False
            continue
        if char == QUOTE:
            in_string = True
        elif char == '[':
            depth += 1
        elif char == ']':
            depth -= 1
        elif char == '{':
            if depth == 1 and start is None:
                start = index
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 1 and start is not None:
                spans.append((start, index + 1))
                start = None
    return spans


SPANS = []


def set_number(text, element_id, key, value):
    """Replace one numeric value, returning a span over the VALUE only.

    Returning the whole element instead makes every edit on the same component
    share one span, and two edits with the same span cannot both apply: the
    second is built from the unedited block and silently reverts the first. That
    is how the first run wrote a new `height` and left `width` at its old value.
    """
    start, end = SPANS[element_id]
    block = text[start:end]
    at = block.index(QUOTE + key + QUOTE + ':')
    vs = at + len(key) + 3
    while block[vs] == ' ':
        vs += 1
    ve = vs
    while ve < len(block) and block[ve] in ' -0123456789.eE':
        ve += 1
    return start + vs, start + ve, '%g' % value


def set_literal(text, element_id, key, value):
    """Replace a non-numeric, non-string value (a boolean), value span only."""
    start, end = SPANS[element_id]
    block = text[start:end]
    at = block.index(QUOTE + key + QUOTE + ':')
    vs = at + len(key) + 3
    while block[vs] == ' ':
        vs += 1
    ve = vs
    while ve < len(block) and block[ve] not in ',}' + NL:
        ve += 1
    return start + vs, start + ve, value


def set_lpos(text, node_id, x, y):
    """Rewrite a node's `_lpos` x/y. Two value-only edits, never the node span."""
    start, end = SPANS[node_id]
    block = text[start:end]
    at = block.index(QUOTE + '_lpos' + QUOTE + ': {')
    edits = []
    for key, value in (('x', x), ('y', y)):
        # Searched from the `_lpos` marker, so this cannot land on `_lrot`'s or
        # `_lscale`'s own x/y, which come later in the node.
        k = block.index(QUOTE + key + QUOTE + ':', at)
        vs = k + len(key) + 3
        while block[vs] == ' ':
            vs += 1
        ve = vs
        while ve < len(block) and block[ve] in ' -0123456789.eE':
            ve += 1
        edits.append((start + vs, start + ve, '%g' % value))
    return edits


def set_colour(text, element_id, rgba):
    start, end = element_span(text, element_id)
    block = text[start:end]
    at = block.index(QUOTE + '_color' + QUOTE + ':')
    close = block.index('}', at)
    replacement = '{"__type__": "cc.Color", "r": %d, "g": %d, "b": %d, "a": %d}' % rgba
    return start, end, block[:at] + QUOTE + '_color' + QUOTE + ': ' + replacement + block[close + 1:]


def clone_node_with_components(arr, root_id, suffix):
    """Clone a childless node and its components; return the new node id."""
    new_id = len(arr)
    arr.append(json.loads(json.dumps(arr[root_id])))
    mapping = {}
    for component in arr[root_id]['_components']:
        mapping[component['__id__']] = len(arr)
        arr.append(json.loads(json.dumps(arr[component['__id__']])))
    node = arr[new_id]
    node['_children'] = []
    node['_components'] = [{'__id__': mapping[c['__id__']]} for c in arr[root_id]['_components']]
    node['_id'] = str(node['_id']) + '-' + suffix
    # The templates are authored inactive (the controller activates what it
    # wants), so a plain clone is born inactive and nothing would ever turn it
    # on. These are parts of a row, not variants of it.
    node['_active'] = True
    for ref in node['_components']:
        comp = arr[ref['__id__']]
        if comp.get('__type__') in ('cc.UITransform', 'cc.Sprite', 'cc.Label'):
            comp['node'] = {'__id__': new_id}
    return new_id


def main():
    global NL, SPANS
    with open(SCENE, encoding='utf-8', newline='') as handle:
        text = handle.read()
    NL = chr(13) + chr(10) if chr(13) + chr(10) in text else chr(10)
    arr = json.loads(text)
    SPANS = element_spans(text)
    if len(SPANS) != len(arr):
        raise SystemExit('span scan found %d elements, parser found %d -- refusing to edit'
                         % (len(SPANS), len(arr)))

    if find_node(arr, 'ArenaRankAvatar_1') is not None:
        print('settlement avatars already present; nothing to do')
        return 0

    uuid = sprite_frame_uuid(AVATAR_FILE)
    sprite_template = find_node(arr, SPRITE_TEMPLATE)
    label_template = find_node(arr, LABEL_TEMPLATE)
    if sprite_template is None or label_template is None:
        raise SystemExit('templates missing: %s=%s %s=%s'
                         % (SPRITE_TEMPLATE, sprite_template, LABEL_TEMPLATE, label_template))
    page = find_node(arr, 'SettlementPage')
    if page is None:
        raise SystemExit('SettlementPage not found')

    first_new = len(arr)
    page_children = []  # every new node, appended to the page in ONE splice
    prop_edits = []     # (start, end, replacement)
    for row_name, name_node, score_node, avatar_name, title_name, title_colour in ROWS:
        row = find_node(arr, row_name)
        if row is None:
            raise SystemExit('row %s not found' % row_name)
        row_y = arr[row]['_lpos']['y']

        # --- avatar -------------------------------------------------------
        # Parented to the PAGE, like the badge, name and mass columns already
        # are -- not to the row. The row node sits at its own y, so a row child
        # positioned with the row's page-space y renders a whole row too high.
        avatar_id = clone_node_with_components(arr, sprite_template, 'avatar')
        arr[avatar_id]['_name'] = avatar_name
        arr[avatar_id]['_parent'] = {'__id__': page}
        arr[avatar_id]['_lpos'] = {'__type__': 'cc.Vec3', 'x': AVATAR_X, 'y': row_y, 'z': 0}
        transform = component_id(arr, avatar_id, 'cc.UITransform')
        sprite = component_id(arr, avatar_id, 'cc.Sprite')
        arr[transform]['_contentSize'] = {'__type__': 'cc.Size',
                                          'width': AVATAR_SIZE[0], 'height': AVATAR_SIZE[1]}
        arr[sprite]['_spriteFrame'] = {'__uuid__': uuid, '__expectedType__': 'cc.SpriteFrame'}
        # SIMPLE, not the template's SLICED: this frame carries no border data,
        # and the runtime tint below is applied to the node's own colour.
        arr[sprite]['_type'] = 0
        arr[sprite]['_color'] = {'__type__': 'cc.Color', 'r': 255, 'g': 255, 'b': 255, 'a': 255}
        page_children.append(avatar_id)

        # --- title --------------------------------------------------------
        title_id = clone_node_with_components(arr, label_template, 'title')
        arr[title_id]['_name'] = title_name
        arr[title_id]['_parent'] = {'__id__': page}
        arr[title_id]['_lpos'] = {'__type__': 'cc.Vec3',
                                  'x': NAME_LEFT + TITLE_WIDTH / 2.0, 'y': row_y + TITLE_Y, 'z': 0}
        transform = component_id(arr, title_id, 'cc.UITransform')
        label = component_id(arr, title_id, 'cc.Label')
        arr[transform]['_contentSize'] = {'__type__': 'cc.Size',
                                          'width': TITLE_WIDTH, 'height': TITLE_HEIGHT}
        arr[label]['_string'] = ''
        arr[label]['_fontSize'] = TITLE_FONT
        arr[label]['_lineHeight'] = TITLE_LINE
        arr[label]['_horizontalAlign'] = 0
        arr[label]['_overflow'] = 1
        arr[label]['_enableWrapText'] = False
        arr[label]['_color'] = {'__type__': 'cc.Color', 'r': title_colour[0], 'g': title_colour[1],
                                'b': title_colour[2], 'a': title_colour[3]}
        page_children.append(title_id)

        # --- re-lay the two existing labels as columns ---------------------
        for node_name, x, y, width, height, font, line, align in (
            (name_node, NAME_LEFT + NAME_WIDTH / 2.0, row_y + NAME_Y, NAME_WIDTH, NAME_HEIGHT,
             NAME_FONT, NAME_LINE, 0),
            (score_node, SCORE_RIGHT - SCORE_WIDTH / 2.0, row_y, SCORE_WIDTH, SCORE_HEIGHT,
             SCORE_FONT, SCORE_LINE, 2),
        ):
            target = find_node(arr, node_name)
            if target is None:
                raise SystemExit('label %s not found' % node_name)
            # `_lpos` has to be spliced, not assigned into `arr`: only the NEW
            # elements are serialized from `arr`, so a dict write on an existing
            # node changes nothing in the output. The first run of this script
            # set the positions that way and moved no node at all.
            prop_edits.extend(set_lpos(text, target, x, y))
            transform = component_id(arr, target, 'cc.UITransform')
            label = component_id(arr, target, 'cc.Label')
            prop_edits.append(set_number(text, transform, 'width', width))
            prop_edits.append(set_number(text, transform, 'height', height))
            prop_edits.append(set_number(text, label, '_fontSize', font))
            prop_edits.append(set_number(text, label, '_lineHeight', line))
            prop_edits.append(set_number(text, label, '_horizontalAlign', align))
            prop_edits.append(set_number(text, label, '_overflow', 1))
            prop_edits.append(set_literal(text, label, '_enableWrapText', 'false'))

    # One splice for the page, not one per row: six splices on the same parent
    # would all cover the same `_children` list and only the last would survive.
    child_edits = [splice_children(text, page, page_children)]

    added = (',' + NL).join(
        indent(json.dumps(arr[i], ensure_ascii=False, indent=2).replace(chr(10), NL), INDENT)
        for i in range(first_new, len(arr)))
    body = text.rstrip()[:-1].rstrip()
    if not body.endswith(','):
        body = body + ','
    out = body + NL + indent(added, INDENT) + NL + ']'

    # Apply back to front, tracking how much text each already-applied edit
    # changed INSIDE the current span.
    #
    # This is not bookkeeping pedantry: adding a child to a row splices the whole
    # row element, which CONTAINS the two label edits made inside it. With naive
    # offsets the row's recorded `end` is stale by exactly the length those label
    # edits added, so `out[start:end]` cuts mid-element and the file stops parsing.
    # Every edit here is computed against the same original text, so a span's end
    # only moves by the deltas of edits that fall strictly inside it.
    applied = []
    for start, end, replacement in sorted(prop_edits + child_edits, key=lambda item: item[0], reverse=True):
        inside = sum(delta for position, delta in applied if position < end)
        out = out[:start] + replacement + out[end + inside:]
        applied.append((start, len(replacement) - (end - start)))
    try:
        parsed = json.loads(out)
    except ValueError as error:
        # Verify BEFORE writing, and leave the failed text behind: the scene is
        # untouched, and the malformed region is what says which splice went
        # wrong. Without this the only evidence is a character offset.
        dump = os.path.join(ROOT, 'artifacts', 'qa', 'v12', 'settlement', 'scene_edit_failed.json')
        os.makedirs(os.path.dirname(dump), exist_ok=True)
        with open(dump, 'w', encoding='utf-8', newline='') as handle:
            handle.write(out)
        raise SystemExit('refusing to write: %s\n  malformed output left at %s' % (error, dump))

    # The page must end up with exactly the children it started with plus the new
    # ones. A splice that replaces instead of appends parses perfectly and loses
    # the entire board, so the count is asserted rather than assumed.
    before = len(arr[page]['_children'])
    after = len(parsed[page]['_children'])
    if after != before + len(page_children):
        raise SystemExit('page children went %d -> %d, expected %d: the splice dropped nodes'
                         % (before, after, before + len(page_children)))

    with open(SCENE, 'w', encoding='utf-8', newline='') as handle:
        handle.write(out)
    print('added %d avatars + %d titles across %d rows' % (len(ROWS), len(ROWS), len(ROWS)))
    return 0


def splice_children(text, parent_id, child_ids):
    """Append child refs to a node's own `_children`, preserving what is there.

    APPEND, not replace. The first version of this returned the new refs as the
    whole list, which silently dropped every existing child of the parent: the
    rows had no children so it looked harmless, but the page has thirty, and
    losing them took the card, the dim overlay and every label with it -- leaving
    the 3D arena showing through and twelve orphaned avatars on screen.

    Deliberately narrow, too. Splicing the whole parent element would make this
    span CONTAIN the parent's own child-label edits, and a span that overlaps
    another edit cannot be applied back to front from a single set of offsets.
    """
    start, end = SPANS[parent_id]
    block = text[start:end]
    marker = QUOTE + '_children' + QUOTE + ': ['
    at = block.index(marker)
    # Child refs are `{"__id__": n}` -- no brackets of their own -- so the first
    # `]` after the marker closes the list.
    close = block.index(']', at)
    existing = block[at + len(marker):close].strip()
    refs = (',' + NL + '      ').join(
        '{%s        "__id__": %d%s      }' % (NL, child_id, NL) for child_id in child_ids)
    if existing:
        refs = existing + ',' + NL + '      ' + refs
    return start + at + len(marker), start + close, refs


def indent(block, prefix):
    return NL.join(prefix + line if line.strip() else line for line in block.split(NL))


if __name__ == '__main__':
    sys.exit(main())
