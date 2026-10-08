"""Add a Creator-saved brand Label under the Home page's `Logo` node.

The brand name has to be real text. Baking it into the plate would make it
uneditable and unlocalisable, which the art direction forbids, and the old
`home_logo.png` did exactly that -- its wordmark was part of the image, alongside
a decorative planet that read on the page as an unexplained dark oval.

The Label is **saved into the scene**, not built at runtime. The project has a
recorded contract that a Label constructed in code has no glyph material in the
minified Web Mobile package; the reliable pattern is to author the Label in the
scene and only set its string at runtime. This adds one, cloned structurally from
an existing Home label so the font configuration stays Creator-owned.

The scene is edited as text: reloading and re-dumping a 52k-line scene is lossless
but reorders every line. Line endings are CRLF and are preserved.

Run: python art-source/tools/add_logo_label.py [--apply]
"""
import argparse
import json
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
SCENE = REPO / 'cocos' / 'assets' / 'scenes' / 'Game.scene'

LABEL_NAME = 'LogoTitle'
BRAND_TEXT = '黑洞回收站'
GOLD = {'__type__': 'cc.Color', 'r': 251, 'g': 229, 'b': 114, 'a': 255}
NAVY = {'__type__': 'cc.Color', 'r': 4, 'g': 35, 'b': 92, 'a': 255}
# The plate is 560 wide inside a 600-wide node and the planet sits at its right,
# so the text is nudged left to stay clear of it.
TEXT_OFFSET_X = -34
FONT_SIZE = 62


def build_objects(base_id, parent_id):
    """The node, its UITransform, its Label and its LabelOutline."""
    node_id, transform_id, label_id, outline_id = (base_id + i for i in range(4))
    node = {
        '__type__': 'cc.Node', '_name': LABEL_NAME, '_objFlags': 0,
        '_parent': {'__id__': parent_id}, '_children': [], '_active': True,
        '_components': [{'__id__': transform_id}, {'__id__': label_id}, {'__id__': outline_id}],
        '_prefab': None,
        '_lpos': {'__type__': 'cc.Vec3', 'x': TEXT_OFFSET_X, 'y': 0, 'z': 0},
        '_lrot': {'__type__': 'cc.Quat', 'x': 0, 'y': 0, 'z': 0, 'w': 1},
        '_lscale': {'__type__': 'cc.Vec3', 'x': 1, 'y': 1, 'z': 1},
        '_mobility': 0, '_layer': 33554432,
        '_euler': {'__type__': 'cc.Vec3', 'x': 0, 'y': 0, 'z': 0},
        '_id': '',
    }
    transform = {
        '__type__': 'cc.UITransform', '_name': '', '_objFlags': 0,
        'node': {'__id__': node_id}, '_enabled': True, '__prefab': None,
        '_contentSize': {'__type__': 'cc.Size', 'width': 420, 'height': 84},
        '_anchorPoint': {'__type__': 'cc.Vec2', 'x': 0.5, 'y': 0.5}, '_id': '',
    }
    label = {
        '__type__': 'cc.Label', '_name': '', '_objFlags': 0,
        'node': {'__id__': node_id}, '_enabled': True, '__prefab': None,
        '_customMaterial': None, '_srcBlendFactor': 2, '_dstBlendFactor': 4,
        '_color': GOLD, '_string': BRAND_TEXT,
        '_horizontalAlign': 1, '_verticalAlign': 1,
        '_actualFontSize': FONT_SIZE, '_fontSize': FONT_SIZE,
        '_fontFamily': 'Arial', '_lineHeight': FONT_SIZE + 12,
        '_overflow': 0, '_enableWrapText': True, '_font': None,
        '_isSystemFontUsed': True, '_spacingX': 0,
        '_isItalic': False, '_isBold': True, '_isUnderline': False, '_underlineHeight': 2,
        '_cacheMode': 0, '_enableOutline': True, '_outlineColor': NAVY, '_outlineWidth': 6,
        '_enableShadow': True, '_shadowColor': NAVY,
        '_shadowOffset': {'__type__': 'cc.Vec2', 'x': 0, 'y': -4}, '_shadowBlur': 0,
        '_id': '',
    }
    outline = {
        '__type__': 'cc.LabelOutline', '_name': '', '_objFlags': 0,
        'node': {'__id__': node_id}, '_enabled': True, '__prefab': None,
        '_color': NAVY, '_width': 6, '_id': '',
    }
    return [node, transform, label, outline], node_id


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    with open(SCENE, 'r', encoding='utf-8', newline='') as handle:
        text = handle.read()
    data = json.loads(text.replace('\r\n', '\n'))
    if not isinstance(data, list):
        data = data.get('data', data)

    nodes = {i: o for i, o in enumerate(data)
             if isinstance(o, dict) and o.get('__type__') == 'cc.Node'}
    logo_id = next((i for i, o in nodes.items() if o.get('_name') == 'Logo'), None)
    if logo_id is None:
        raise SystemExit('no Logo node in Game.scene')
    if any(o.get('_name') == LABEL_NAME for o in nodes.values()):
        print(f'{LABEL_NAME} already present; nothing to do')
        return

    objects, new_node_id = build_objects(len(data), logo_id)
    print(f'Logo node {logo_id}; adding {LABEL_NAME} as ids '
          f'{new_node_id}..{new_node_id + len(objects) - 1}')

    if not args.apply:
        print('dry run; pass --apply to write')
        return

    # Append the four objects to the array, which ends with "]" and no newline.
    appended = ',\r\n' + ',\r\n'.join(
        json.dumps(obj, indent=2, ensure_ascii=False).replace('\n', '\r\n') for obj in objects)
    assert text.rstrip('\r\n').endswith(']'), 'scene does not end with the object array'
    text = text.rstrip('\r\n')[:-1] + appended + '\r\n]'

    # Give Logo the new child. Its `_children` is empty, and the window is bounded
    # by the node's own block so another node's empty list cannot be hit.
    logo_block = re.search(
        r'(\{\r\n\s*"__type__": "cc\.Node",\r\n\s*"_name": "Logo",.*?\r\n  \})', text, re.S)
    if not logo_block:
        raise SystemExit('could not locate the Logo node block in the scene text')
    block = logo_block.group(1)
    assert '"_children": []' in block, 'Logo already has children; refusing to guess'
    text = text[:logo_block.start(1)] + block.replace(
        '"_children": []', f'"_children": [\r\n        {{\r\n          "__id__": {new_node_id}\r\n        }}\r\n      ]', 1
    ) + text[logo_block.end(1):]

    with open(SCENE, 'w', encoding='utf-8', newline='') as handle:
        handle.write(text)
    print(f'wrote {SCENE.relative_to(REPO)}')


if __name__ == '__main__':
    sys.exit(main())
