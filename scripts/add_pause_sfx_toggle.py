"""Add a sound-effect toggle to the Pause page.

The pause page is the low-risk home for this: it is reachable in every mode, it
has no pinned layout contract (Home's does), and `SaveService.setSfxEnabled`
already persists `settings.sfx` while `AudioDirector.isMuted/toggleMuted` already
honour it. Only the control was missing.

The node is cloned from `BtnSettle` rather than authored from scratch, so it
carries exactly the component set the engine expects (UITransform + Sprite +
Button on the container, UITransform + Label on the text child). The template is
`BtnSettle` and not `BtnResume` on purpose: the first attempt cloned the resume
button and the toggle came out in the primary yellow capsule, which made a
settings switch compete with the page's real primary action. The purple secondary
capsule is the correct hierarchy. `PauseCard` grows to make room,
which is lossless because it is a sliced panel.

The edit is spliced into the scene text rather than reserialising the document: a
full dump would reformat every line of a 967 KB scene and bury the three real
edits.

Run: python scripts/_add_pause_sfx_toggle.py
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SCENE = os.path.join(ROOT, 'cocos', 'assets', 'scenes', 'Game.scene')

TEMPLATE_BUTTON = 'BtnSettle'
NEW_BUTTON = 'BtnSfxToggle'
NEW_LABEL = 'BtnSfxToggleLabel'
NEW_TEXT = '\u97f3\u6548\uff1a\u5f00'
TOGGLE_Y = -320
TOGGLE_SIZE = (340, 84)
CARD_HEIGHT = 800

INDENT = '  '
# The scene is CRLF; a spliced edit must match it or the diff shows every line.
NL = chr(10)


def find_node(arr, name, parent_id=None):
    for index, obj in enumerate(arr):
        if not isinstance(obj, dict) or obj.get('__type__') != 'cc.Node':
            continue
        if obj.get('_name') != name:
            continue
        if parent_id is not None and (obj.get('_parent') or {}).get('__id__') != parent_id:
            continue
        return index
    return None


def clone_subtree(arr, root_id):
    """Deep-copy a node subtree, returning (new_root_id, {old_id: new_id})."""
    mapping = {}

    def clone(old_id):
        if old_id in mapping:
            return mapping[old_id]
        new_id = len(arr)
        mapping[old_id] = new_id
        source = arr[old_id]
        arr.append(json.loads(json.dumps(source)))
        for child in source.get('_children') or []:
            clone(child['__id__'])
        for component in source.get('_components') or []:
            clone(component['__id__'])
        return new_id

    clone(root_id)

    for old_id, new_id in mapping.items():
        original = arr[old_id]
        node = arr[new_id]
        if node.get('_children') is not None:
            node['_children'] = [{'__id__': mapping[c['__id__']]} for c in original['_children']]
        if node.get('_components') is not None:
            node['_components'] = [{'__id__': mapping[c['__id__']]} for c in original['_components']]
        if node.get('__type__') == 'cc.Node':
            parent = (original.get('_parent') or {}).get('__id__')
            node['_parent'] = {'__id__': mapping.get(parent, parent)}
            node['_id'] = str(node['_id']) + '-sfx'
        if node.get('__type__') in ('cc.UITransform', 'cc.Label', 'cc.Sprite', 'cc.Button'):
            node['node'] = {'__id__': mapping[original['node']['__id__']]}
    return mapping[root_id], mapping


def indent(block, prefix):
    return NL.join(prefix + line if line.strip() else line for line in block.split(NL))


def node_anchor(text, node_id):
    """Text span of the array element at this index (elements are in order).

    The end is found by matching braces, not by searching for the next line that
    closes at two-space indent: a nested object such as `_prefab` or
    `__editorExtras__` also closes there, which truncated the block before
    `_components` and made the card's `_contentSize` unfindable.
    """
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
    raise SystemExit('unbalanced object for element %d' % node_id)


def splice_children(text, page_id, child_id):
    """Return (start, end, replacement) for the page's _children array."""
    start, end = node_anchor(text, page_id)
    block = text[start:end]
    marker = '"_children": ['
    at = block.index(marker)
    close = block.index(']', at)
    existing = block[at + len(marker):close].strip()
    addition = '{%s        "__id__": %d%s      }' % (NL, child_id, NL)
    joined = existing + ',' + NL + '      ' + addition if existing else addition
    block = block[:at + len(marker)] + joined + block[close:]
    return start, end, block


def splice_card_height(text, card_id, height):
    """Return (start, end, replacement) for the card's UITransform size."""
    start, end = node_anchor(text, card_id)
    block = text[start:end]
    at = block.index('"_contentSize": {')
    # Consume only the digits. Searching for the next comma instead swallowed the
    # closing brace of `_contentSize`, because the comma comes after it.
    hstart = block.index('"height":', at) + len('"height":')
    hend = hstart
    while hend < len(block) and (block[hend].isdigit() or block[hend] == ' '):
        hend += 1
    block = block[:hstart] + ' %d' % height + block[hend:]
    return start, end, block


def main():
    global NL
    with open(SCENE, encoding='utf-8', newline='') as handle:
        text = handle.read()
    NL = chr(13) + chr(10) if chr(13) + chr(10) in text else chr(10)
    doc = json.loads(text)
    arr = doc if isinstance(doc, list) else doc['data']

    if find_node(arr, NEW_BUTTON) is not None:
        print(NEW_BUTTON + ' already present; nothing to do')
        return 0

    pause_page = find_node(arr, 'PausePage')
    card = find_node(arr, 'PauseCard')
    template = find_node(arr, TEMPLATE_BUTTON, parent_id=pause_page)
    if pause_page is None or card is None or template is None:
        raise SystemExit('PausePage / PauseCard / %s not all found' % TEMPLATE_BUTTON)

    # The card's size lives in its UITransform component, which is its own
    # array element; the node object only references it by id.
    card_transform = next(
        (c['__id__'] for c in arr[card].get('_components') or []
         if arr[c['__id__']].get('__type__') == 'cc.UITransform'), None)
    if card_transform is None:
        raise SystemExit('PauseCard has no UITransform')

    first_new_id = len(arr)
    new_root, mapping = clone_subtree(arr, template)

    arr[new_root]['_name'] = NEW_BUTTON
    arr[new_root]['_lpos'] = {'__type__': 'cc.Vec3', 'x': 0, 'y': TOGGLE_Y, 'z': 0}
    label_node = arr[new_root]['_children'][0]['__id__']
    arr[label_node]['_name'] = NEW_LABEL
    for component in arr[new_root]['_components']:
        comp = arr[component['__id__']]
        if comp.get('__type__') == 'cc.UITransform':
            comp['_contentSize'] = {'__type__': 'cc.Size', 'width': TOGGLE_SIZE[0], 'height': TOGGLE_SIZE[1]}
    for component in arr[label_node]['_components']:
        comp = arr[component['__id__']]
        if comp.get('__type__') == 'cc.UITransform':
            comp['_contentSize'] = {'__type__': 'cc.Size', 'width': TOGGLE_SIZE[0], 'height': TOGGLE_SIZE[1]}
        if comp.get('__type__') == 'cc.Label':
            comp['_string'] = NEW_TEXT

    # json.dumps emits LF; the scene is CRLF, so normalise before splicing or the
    # file ends up with mixed line endings.
    added = (',' + NL).join(
        indent(json.dumps(arr[i], ensure_ascii=False, indent=2).replace(chr(10), NL), INDENT)
        for i in range(first_new_id, len(arr)))
    body = text.rstrip()
    if not body.endswith(']'):
        raise SystemExit('unexpected scene tail')
    body = body[:-1].rstrip()
    if not body.endswith(','):
        body = body + ','
    out = body + NL + indent(added, INDENT) + NL + ']'

    # Both spans are computed against the same text and applied back to front, so
    # the earlier edit cannot shift the later one's offsets.
    edits = [splice_children(out, pause_page, new_root), splice_card_height(out, card_transform, CARD_HEIGHT)]
    for start, end, replacement in sorted(edits, key=lambda item: item[0], reverse=True):
        out = out[:start] + replacement + out[end:]
    json.loads(out)

    with open(SCENE, 'w', encoding='utf-8', newline='') as handle:
        handle.write(out)
    print('added %s (id %d) to PausePage; PauseCard height -> %d' % (NEW_BUTTON, new_root, CARD_HEIGHT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
