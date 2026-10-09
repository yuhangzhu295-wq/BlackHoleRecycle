"""Put an icon on each Settlement stat card.

The adopted Settlement reference leads every stat card with an icon (coin, skull,
stopwatch) and our three cards are text-only, which is a large part of why the
Endless settlement reads as sparse beside it. The three icons are the same roles as
this product's cards: mass, absorbed items, level.

Each icon node is cloned from `ArenaStatMassPanel` -- a plain `UITransform + Sprite`
node with no children -- so it carries exactly the component set the engine expects.
The panels grow from 164x104 to 164x140 to hold icon + caption + value stacked, which
is the reference's card shape, and none of these nodes is pinned by
`docs/design-contracts/settlement.json`.

The icon uuids are read from the `.meta` files Creator generated, so nothing here
guesses an asset id.

Run: python scripts/add_settlement_stat_icons.py
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SCENE = os.path.join(ROOT, 'cocos', 'assets', 'scenes', 'Game.scene')
V95 = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'ui', 'v95')

TEMPLATE_NODE = 'ArenaStatMassPanel'
PANEL_SIZE = (164, 140)
ICON_SIZE = (46, 46)
ICON_Y = 40
# (panel, icon file, icon node name)
CARDS = (
    ('ArenaStatMassPanel', 'icon_stat_mass.png', 'StatIconMass'),
    ('ArenaStatKillsPanel', 'icon_stat_items.png', 'StatIconItems'),
    ('ArenaStatTimePanel', 'icon_stat_level.png', 'StatIconLevel'),
)

INDENT = '  '
NL = chr(10)


def sprite_frame_uuid(icon_file):
    meta_path = os.path.join(V95, icon_file + '.meta')
    if not os.path.exists(meta_path):
        raise SystemExit('missing meta for %s -- build once so Creator imports it' % icon_file)
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


def clone_node_with_components(arr, root_id):
    """Clone a childless node and its components; return (new_id, {old: new})."""
    mapping = {}
    new_id = len(arr)
    mapping[root_id] = new_id
    arr.append(json.loads(json.dumps(arr[root_id])))
    for component in arr[root_id]['_components']:
        old = component['__id__']
        mapping[old] = len(arr)
        arr.append(json.loads(json.dumps(arr[old])))

    node = arr[new_id]
    node['_children'] = []
    node['_components'] = [{'__id__': mapping[c['__id__']]} for c in arr[root_id]['_components']]
    node['_parent'] = {'__id__': arr[root_id]['_parent']['__id__']}
    node['_id'] = str(node['_id']) + '-stat-icon'
    for component in node['_components']:
        comp = arr[component['__id__']]
        if comp.get('__type__') in ('cc.UITransform', 'cc.Sprite'):
            comp['node'] = {'__id__': new_id}
    return new_id, mapping


def node_anchor(text, node_id):
    start = text.index(NL + INDENT + '{')
    for _ in range(node_id):
        start = text.index(NL + INDENT + '{', start + 1)
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == chr(92):
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                return start, index + 1
    raise SystemExit('unbalanced element %d' % node_id)


def indent(block, prefix):
    return NL.join(prefix + line if line.strip() else line for line in block.split(NL))


def splice_size(text, node_id, width, height):
    """Replace the element's own `_contentSize`, or its UITransform's if separate."""
    start, end = node_anchor(text, node_id)
    block = text[start:end]
    if '"_contentSize"' not in block:
        raise SystemExit('element %d has no _contentSize' % node_id)
    # Consume only the digits: the last property in `_contentSize` is followed by
    # the closing brace, not a comma, so searching for a comma deletes the brace.
    at = block.index('"_contentSize": {')

    def replace_number(source, key, value):
        start = source.index('"%s":' % key, at) + len('"%s":' % key)
        end = start
        while end < len(source) and (source[end].isdigit() or source[end] == ' '):
            end += 1
        return source[:start] + ' %d' % value + source[end:]

    block = replace_number(block, 'width', width)
    block = replace_number(block, 'height', height)
    return start, end, block


def splice_children(text, parent_id, child_id):
    start, end = node_anchor(text, parent_id)
    block = text[start:end]
    marker = '"_children": ['
    at = block.index(marker)
    close = block.index(']', at)
    existing = block[at + len(marker):close].strip()
    addition = '{%s        "__id__": %d%s      }' % (NL, child_id, NL)
    joined = existing + ',' + NL + '      ' + addition if existing else addition
    block = block[:at + len(marker)] + joined + block[close:]
    return start, end, block


def main():
    global NL
    with open(SCENE, encoding='utf-8', newline='') as handle:
        text = handle.read()
    NL = chr(13) + chr(10) if chr(13) + chr(10) in text else chr(10)
    doc = json.loads(text)
    arr = doc if isinstance(doc, list) else doc['data']

    if find_node(arr, CARDS[0][2]) is not None:
        print('stat icons already present; nothing to do')
        return 0

    template = find_node(arr, TEMPLATE_NODE)
    if template is None:
        raise SystemExit('template node %s not found' % TEMPLATE_NODE)

    first_new = len(arr)
    panel_growth = []
    panel_children = []
    for panel_name, icon_file, icon_name in CARDS:
        panel = find_node(arr, panel_name)
        if panel is None:
            raise SystemExit('panel %s not found' % panel_name)
        uuid = sprite_frame_uuid(icon_file)
        icon_id, _ = clone_node_with_components(arr, template)
        arr[icon_id]['_name'] = icon_name
        # The template panel is authored inactive (the controller activates the
        # panels it wants), so a plain clone is born inactive too and nothing ever
        # activates a child. The icon is part of the card, not a variant of it.
        arr[icon_id]['_active'] = True
        arr[icon_id]['_parent'] = {'__id__': panel}
        arr[icon_id]['_lpos'] = {'__type__': 'cc.Vec3', 'x': 0, 'y': ICON_Y, 'z': 0}
        for component in arr[icon_id]['_components']:
            comp = arr[component['__id__']]
            if comp.get('__type__') == 'cc.UITransform':
                comp['_contentSize'] = {'__type__': 'cc.Size', 'width': ICON_SIZE[0], 'height': ICON_SIZE[1]}
            if comp.get('__type__') == 'cc.Sprite':
                comp['_spriteFrame'] = {'__uuid__': uuid, '__expectedType__': 'cc.SpriteFrame'}
        panel_children.append((panel, icon_id))
        panel_growth.append(panel)

    # Grow the panels: the size lives in each panel's own UITransform component.
    growth_edits = []
    for panel in panel_growth:
        transform = next(c['__id__'] for c in arr[panel]['_components']
                         if arr[c['__id__']].get('__type__') == 'cc.UITransform')
        growth_edits.append(splice_size(text, transform, PANEL_SIZE[0], PANEL_SIZE[1]))
    child_edits = [splice_children(text, panel, icon) for panel, icon in panel_children]

    added = (',' + NL).join(
        indent(json.dumps(arr[i], ensure_ascii=False, indent=2).replace(chr(10), NL), INDENT)
        for i in range(first_new, len(arr)))
    body = text.rstrip()[:-1].rstrip()
    if not body.endswith(','):
        body = body + ','
    out = body + NL + indent(added, INDENT) + NL + ']'

    # Anchors are all computed against the same text, then applied back to front.
    edits = growth_edits + child_edits
    for start, end, replacement in sorted(edits, key=lambda item: item[0], reverse=True):
        out = out[:start] + replacement + out[end:]
    json.loads(out)

    with open(SCENE, 'w', encoding='utf-8', newline='') as handle:
        handle.write(out)
    print('added %d stat icons; panels grown to %dx%d' % (len(CARDS), PANEL_SIZE[0], PANEL_SIZE[1]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
