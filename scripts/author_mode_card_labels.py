"""Give the two Mode Select cards real text Labels.

The card titles, subtitles and callouts were baked into `mode_card_*_framed.png`,
which made the mode names untranslatable and meant any new card art would take the
titles with it. `compose_mode_layers.py` recorded this as a deliberate deferral and
named the ordering constraint: the art cannot be stripped of its text before the
Labels exist. This adds the Labels; `generate_home_raster_assets.py` now renders the
shipped cards with `with_text=False`.

Geometry is taken from the card art's own draw calls, which are the only place this
typography is defined:

    title   art (35,  37)  font 44  #ffffff  outline #172032 w5
    sub     art (39, 103)  font 25  #ffffff  outline #172032 w3
    callout art (39, 145)  font 19  #fff264  outline #35280e w2

The labels live in a `CardText` container rather than directly under the card, and
that is the whole point: the card's box is rewritten at runtime from 610x278 to
whatever the safe span allows (519x236 at 390x844), which scales the ART but not
its children. Placing the labels at art coordinates directly under the card put
them at unscaled positions while their size was scaled, so they drifted off the
artwork -- measured 13 screen px high on the title. With one container the
controller applies a single uniform scale and both the positions and the sizes
follow, so the text stays on the illustration by construction.

Run: python scripts/author_mode_card_labels.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.scene_edit import Scene, clone_node, repo_root  # noqa: E402

SCENE = os.path.join(repo_root(), 'cocos', 'assets', 'scenes', 'Game.scene')
TEMPLATE = 'ArenaAvailabilityLabel'

CARD_WIDTH = 610
CARD_HALF_HEIGHT = 139

WHITE = (255, 255, 255, 255)
TITLE_OUTLINE = (23, 32, 50, 255)
CALLOUT = (255, 242, 100, 255)
CALLOUT_OUTLINE = (53, 40, 14, 255)

# (suffix, art x, art y of the text's TOP, font size, line height, colour, outline, outline width)
LINES = (
    ('Title', 35, 37, 44, 52, WHITE, TITLE_OUTLINE, 5),
    ('Subtitle', 39, 103, 25, 30, WHITE, TITLE_OUTLINE, 3),
    ('Callout', 39, 145, 19, 24, CALLOUT, CALLOUT_OUTLINE, 2),
)

CARDS = (('BtnArena', 'Arena'), ('BtnEndless', 'Endless'))


def make_container(scene, parent_id, template_id, name):
    """A bare UITransform node: the clone's Label is deliberately not carried."""
    new_id = len(scene.arr)
    node = json.loads(json.dumps(scene.arr[template_id]))
    node['_name'] = name
    node['_parent'] = {'__id__': parent_id}
    node['_children'] = []
    node['_active'] = True
    node['_lpos'] = {'__type__': 'cc.Vec3', 'x': 0, 'y': 0, 'z': 0}
    node['_lscale'] = {'__type__': 'cc.Vec3', 'x': 1, 'y': 1, 'z': 1}
    node['_prefab'] = None
    transform_source = scene.component(template_id, 'cc.UITransform')
    transform_id = len(scene.arr) + 1
    transform = json.loads(json.dumps(scene.arr[transform_source]))
    transform['node'] = {'__id__': new_id}
    transform['_anchorPoint'] = {'__type__': 'cc.Vec2', 'x': 0.5, 'y': 0.5}
    transform['_contentSize'] = {'__type__': 'cc.Size', 'width': CARD_WIDTH, 'height': CARD_HALF_HEIGHT * 2}
    node['_components'] = [{'__id__': transform_id}]
    scene.append_elements([node, transform])
    return new_id


def main():
    scene = Scene(SCENE)
    if scene.find('ArenaCardText') is not None:
        print('mode card labels already present; nothing to do')
        return 0

    template = scene.find(TEMPLATE)
    if template is None:
        raise SystemExit('template label %s not found' % TEMPLATE)

    added = 0
    for card_name, prefix in CARDS:
        card = scene.find(card_name)
        if card is None:
            raise SystemExit('card %s not found' % card_name)
        container = make_container(scene, card, template, '%sCardText' % prefix)
        labels = []
        for suffix, art_x, art_y, font, line_height, colour, outline, outline_width in LINES:
            node = clone_node(scene, template, suffix.lower())
            scene.arr[node]['_name'] = '%sCard%s' % (prefix, suffix)
            scene.arr[node]['_parent'] = {'__id__': container}
            # Left edge and vertical CENTRE of the art's own text box. PIL drew from
            # a top-left origin, but a Cocos Label lays its glyphs inside a line box
            # with leading above them, so anchoring the top of that box at the art's
            # y put the text low; centring is independent of line height.
            scene.arr[node]['_lpos'] = {
                '__type__': 'cc.Vec3',
                'x': art_x - CARD_WIDTH // 2,
                'y': CARD_HALF_HEIGHT - (art_y + font / 2.0),
                'z': 0,
            }
            transform = scene.component(node, 'cc.UITransform')
            label = scene.component(node, 'cc.Label')
            scene.arr[transform]['_anchorPoint'] = {'__type__': 'cc.Vec2', 'x': 0, 'y': 0.5}
            scene.arr[transform]['_contentSize'] = {'__type__': 'cc.Size', 'width': 420, 'height': line_height}
            scene.arr[label]['_string'] = ''
            scene.arr[label]['_fontSize'] = font
            scene.arr[label]['_lineHeight'] = line_height
            scene.arr[label]['_horizontalAlign'] = 0
            scene.arr[label]['_verticalAlign'] = 1
            scene.arr[label]['_overflow'] = 0
            scene.arr[label]['_enableWrapText'] = False
            scene.arr[label]['_enableOutline'] = True
            scene.arr[label]['_outlineWidth'] = outline_width
            scene.arr[label]['_color'] = {'__type__': 'cc.Color', 'r': colour[0], 'g': colour[1], 'b': colour[2], 'a': colour[3]}
            scene.arr[label]['_outlineColor'] = {'__type__': 'cc.Color', 'r': outline[0], 'g': outline[1], 'b': outline[2], 'a': outline[3]}
            # The template carries a separate `cc.LabelOutline` component as well as
            # the Label's own inline outline fields. Leaving both on draws the stroke
            # twice; the component is switched off and the inline fields -- which is
            # what the art's stroke_width maps to -- are the single source.
            outline_component = scene.component(node, 'cc.LabelOutline')
            if outline_component is not None:
                scene.arr[outline_component]['_enabled'] = False
            labels.append(node)
            added += 1
        # The container is a NEW element, so it has no text span to splice: only
        # elements that already existed in the file can be edited in the text.
        # It is serialized from the parsed array, so its `_children` is set there.
        scene.arr[container]['_children'] = [{'__id__': node} for node in labels]
        scene.set_children(card, [container])

    scene.commit(expect={scene.find(card_name): 1 for card_name, _ in CARDS})
    print('added %d mode card labels in %d containers' % (added, len(CARDS)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
