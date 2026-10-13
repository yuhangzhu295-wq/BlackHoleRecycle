"""Give every Settlement leaderboard row the four columns DESIGN_06 specifies.

The reference's rows are: rank badge, coloured hole avatar, name with a 称号
underneath, and mass on the right. Ours were three -- badge, ONE text line
carrying both name and title, and a mass-plus-kills string -- so the avatar was
missing entirely and the name/title hierarchy was flattened into a single run.

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

The new nodes are parented to the PAGE, like the badge, name and mass columns
already are, and positioned in page space. Parenting them to their row instead
renders them a whole row too high, because the row node carries its own y.

Run: python scripts/add_settlement_avatars.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.scene_edit import Scene, clone_node, repo_root  # noqa: E402

ROOT = repo_root()
SCENE = os.path.join(ROOT, 'cocos', 'assets', 'scenes', 'Game.scene')
V95 = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'ui', 'v95')

AVATAR_FILE = 'avatar_blackhole.png'

SPRITE_TEMPLATE = 'ArenaStatMassPanel'
LABEL_TEMPLATE = 'ArenaRankScore_1'

AVATAR_SIZE = (48, 48)
AVATAR_X = -156

# The name column's left edge and the mass column's right edge. Both are 24
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

# The muted tone the reference gives the 称号, read off the existing mass column
# rather than invented so the title sits in the same secondary tier as the
# numbers beside it.
TITLE_COLOUR = (101, 82, 125, 255)
PLAYER_TITLE_COLOUR = (42, 122, 53, 255)

ROWS = tuple(
    (f'ArenaRankRow_{i}', f'ArenaRankName_{i}', f'ArenaRankScore_{i}',
     f'ArenaRankAvatar_{i}', f'ArenaRankTitle_{i}', TITLE_COLOUR)
    for i in range(1, 6)
) + (('ArenaPlayerRow', 'ArenaPlayerName', 'ArenaPlayerScore',
      'ArenaPlayerAvatar', 'ArenaPlayerTitle', PLAYER_TITLE_COLOUR),)


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


def main():
    scene = Scene(SCENE)
    if scene.find('ArenaRankAvatar_1') is not None:
        print('settlement avatars already present; nothing to do')
        return 0

    uuid = sprite_frame_uuid(AVATAR_FILE)
    sprite_template = scene.find(SPRITE_TEMPLATE)
    label_template = scene.find(LABEL_TEMPLATE)
    if sprite_template is None or label_template is None:
        raise SystemExit('templates missing: %s=%s %s=%s'
                         % (SPRITE_TEMPLATE, sprite_template, LABEL_TEMPLATE, label_template))
    page = scene.find('SettlementPage')
    if page is None:
        raise SystemExit('SettlementPage not found')

    new_children = []
    for row_name, name_node, score_node, avatar_name, title_name, title_colour in ROWS:
        row = scene.find(row_name)
        if row is None:
            raise SystemExit('row %s not found' % row_name)
        row_y = scene.arr[row]['_lpos']['y']

        # --- avatar -------------------------------------------------------
        avatar_id = clone_node(scene, sprite_template, 'avatar')
        scene.arr[avatar_id]['_name'] = avatar_name
        scene.arr[avatar_id]['_parent'] = {'__id__': page}
        scene.arr[avatar_id]['_lpos'] = {'__type__': 'cc.Vec3', 'x': AVATAR_X, 'y': row_y, 'z': 0}
        transform = scene.component(avatar_id, 'cc.UITransform')
        sprite = scene.component(avatar_id, 'cc.Sprite')
        scene.arr[transform]['_contentSize'] = {'__type__': 'cc.Size',
                                                'width': AVATAR_SIZE[0], 'height': AVATAR_SIZE[1]}
        scene.arr[sprite]['_spriteFrame'] = {'__uuid__': uuid, '__expectedType__': 'cc.SpriteFrame'}
        # SIMPLE, not the template's SLICED: this frame carries no border data,
        # and the runtime tint is the node's own colour.
        scene.arr[sprite]['_type'] = 0
        scene.arr[sprite]['_color'] = {'__type__': 'cc.Color', 'r': 255, 'g': 255, 'b': 255, 'a': 255}
        new_children.append(avatar_id)

        # --- title --------------------------------------------------------
        title_id = clone_node(scene, label_template, 'title')
        scene.arr[title_id]['_name'] = title_name
        scene.arr[title_id]['_parent'] = {'__id__': page}
        scene.arr[title_id]['_lpos'] = {'__type__': 'cc.Vec3',
                                        'x': NAME_LEFT + TITLE_WIDTH / 2.0, 'y': row_y + TITLE_Y, 'z': 0}
        transform = scene.component(title_id, 'cc.UITransform')
        label = scene.component(title_id, 'cc.Label')
        scene.arr[transform]['_contentSize'] = {'__type__': 'cc.Size',
                                                'width': TITLE_WIDTH, 'height': TITLE_HEIGHT}
        scene.arr[label]['_string'] = ''
        scene.arr[label]['_fontSize'] = TITLE_FONT
        scene.arr[label]['_lineHeight'] = TITLE_LINE
        scene.arr[label]['_horizontalAlign'] = 0
        scene.arr[label]['_overflow'] = 1
        scene.arr[label]['_enableWrapText'] = False
        scene.arr[label]['_color'] = {'__type__': 'cc.Color', 'r': title_colour[0], 'g': title_colour[1],
                                      'b': title_colour[2], 'a': title_colour[3]}
        new_children.append(title_id)

        # --- re-lay the two existing labels as columns ---------------------
        for node_name, x, y, width, height, font, line, align in (
            (name_node, NAME_LEFT + NAME_WIDTH / 2.0, row_y + NAME_Y, NAME_WIDTH, NAME_HEIGHT,
             NAME_FONT, NAME_LINE, 0),
            (score_node, SCORE_RIGHT - SCORE_WIDTH / 2.0, row_y, SCORE_WIDTH, SCORE_HEIGHT,
             SCORE_FONT, SCORE_LINE, 2),
        ):
            target = scene.find(node_name)
            if target is None:
                raise SystemExit('label %s not found' % node_name)
            # `_lpos` has to be spliced, not assigned into the parsed array: only
            # the NEW elements are serialized from it, so a dict write on an
            # existing node changes nothing in the output.
            scene.set_lpos(target, x, y)
            transform = scene.component(target, 'cc.UITransform')
            label = scene.component(target, 'cc.Label')
            scene.set_number(transform, 'width', width)
            scene.set_number(transform, 'height', height)
            scene.set_number(label, '_fontSize', font)
            scene.set_number(label, '_lineHeight', line)
            scene.set_number(label, '_horizontalAlign', align)
            scene.set_number(label, '_overflow', 1)
            scene.set_literal(label, '_enableWrapText', 'false')

    scene.set_children(page, new_children)
    scene.commit(expect={page: len(new_children)})
    print('added %d avatars + %d titles across %d rows'
          % (len(ROWS), len(ROWS), len(ROWS)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
