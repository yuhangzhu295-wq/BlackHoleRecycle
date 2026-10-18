"""Widen the settlement reward breakdown so its five parts fit on one line.

`ArenaRewardBreakdown` is 480x24 at fontSize 14 with wrap enabled. The arena
reward names five parts (mass, collected, elimination, survival, placement), which
at 14px does not fit 480 design units, so wrap splits it and the second line
overflows the 24-unit box -- the frame shows the breakdown cut off.

The layout contract does not pin this node (`required: false`), and the card is
620 wide, so the label can use the full card.

Run: python scripts/widen_reward_breakdown.py [--write]
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
from scene_edit import Scene  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SCENE = os.path.join(ROOT, 'cocos', 'assets', 'scenes', 'Game.scene')

WIDTH = 580
HEIGHT = 30
FONT_SIZE = 15


def main():
    write = '--write' in sys.argv
    scene = Scene(SCENE)
    node = scene.find('ArenaRewardBreakdown')
    if node is None:
        raise SystemExit('ArenaRewardBreakdown not found')
    transform = scene.component(node, 'cc.UITransform')
    label = scene.component(node, 'cc.Label')
    if transform is None or label is None:
        raise SystemExit('ArenaRewardBreakdown needs both a UITransform and a Label')

    current = scene.arr[transform].get('_contentSize') or {}
    label_data = scene.arr[label]
    print('before: size %sx%s fontSize=%s wrap=%s'
          % (current.get('width'), current.get('height'), label_data.get('_fontSize'),
             label_data.get('_enableWrapText')))
    if (current.get('width') == WIDTH and current.get('height') == HEIGHT
            and label_data.get('_fontSize') == FONT_SIZE
            and label_data.get('_enableWrapText') is False):
        print('already at the target; nothing to do')
        return 0

    scene.set_number(transform, 'width', WIDTH)
    scene.set_number(transform, 'height', HEIGHT)
    scene.set_number(label, '_fontSize', FONT_SIZE)
    # A single line is the intent: the five parts are a summary, and wrapping one
    # of them into a second line is what pushed it past the box.
    scene.set_literal(label, '_enableWrapText', 'false')
    if not write:
        print('(dry run; pass --write to save)')
        return 0
    scene.commit()
    print('wrote %s' % os.path.relpath(SCENE, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
