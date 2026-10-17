"""PHASE A: give the revive hero its new, wide geometry.

The contract pins `ReviveCard` (620x900) and the functional nodes; it does not pin
`ReviveBlackHoleHero`. That node is 246x246 and sat on flat cream, which is the
"small picture on a big single-colour panel" the brief says to stop doing.

New geometry: 560x190 at y=150. Measured against the card's own layout -- the
ribbon's lower edge is at y 296 and `LossValue` sits at y 36, so 190 tall centred at
150 spans 55..245 and clears both.

Run: python scripts/retune_revive_hero.py [--write]
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
from scene_edit import Scene  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SCENE = os.path.join(ROOT, 'cocos', 'assets', 'scenes', 'Game.scene')

WIDTH, HEIGHT, Y = 560, 200, 172


def main():
    write = '--write' in sys.argv
    scene = Scene(SCENE)
    node = scene.find('ReviveBlackHoleHero')
    if node is None:
        raise SystemExit('ReviveBlackHoleHero not found')
    transform = scene.component(node, 'cc.UITransform')
    if transform is None:
        raise SystemExit('ReviveBlackHoleHero has no cc.UITransform')

    current = scene.arr[transform].get('_contentSize') or {}
    position = scene.arr[node].get('_lpos') or {}
    print('before: size %sx%s at y=%s'
          % (current.get('width'), current.get('height'), position.get('y')))
    if (current.get('width') == WIDTH and current.get('height') == HEIGHT
            and position.get('y') == Y):
        print('already at the target geometry; nothing to do')
        return 0

    scene.set_number(transform, 'width', WIDTH)
    scene.set_number(transform, 'height', HEIGHT)
    scene.set_lpos(node, position.get('x', 0), Y)
    print('after:  size %dx%d at y=%d' % (WIDTH, HEIGHT, Y))
    if not write:
        print('(dry run; pass --write to save)')
        return 0
    scene.commit()
    print('wrote %s' % os.path.relpath(SCENE, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
