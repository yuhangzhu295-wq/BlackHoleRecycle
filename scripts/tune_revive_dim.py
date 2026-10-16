"""Let the city show behind the revive overlay.

`RevivePage` already floats over the live game world -- what is behind it is the
arena or the endless city, not a background image. But its `DimOverlay` sits at
alpha 208 (82%), which crushes the world to a flat dark green: the page reads as a
panel on a colour, and the reference's revive reads as a panel on the CITY the
player just died in.

This lowers the dim so the world is legible while the cream card and the buttons
still carry the contrast. It is a scene value change, done through the shared
scene editor rather than by text-splicing the scene.

Run: python scripts/tune_revive_dim.py [--write]
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
from scene_edit import Scene  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SCENE = os.path.join(ROOT, 'cocos', 'assets', 'scenes', 'Game.scene')

# 208 was 82% opaque. 140 (55%) keeps the card readable and leaves the city
# visible; the reference shows the world clearly behind the overlay.
TARGET_ALPHA = 140


def main():
    write = '--write' in sys.argv
    scene = Scene(SCENE)
    page = scene.find('RevivePage')
    if page is None:
        raise SystemExit('RevivePage not found')
    overlay = scene.find_child('RevivePage', 'DimOverlay')
    if overlay is None:
        raise SystemExit('RevivePage/DimOverlay not found')
    component = scene.component(overlay, 'cc.Sprite')
    if component is None:
        raise SystemExit('DimOverlay has no cc.Sprite')

    sprite = scene.arr[component]
    colour = sprite.get('_color') or {}
    print('DimOverlay colour before: r=%s g=%s b=%s a=%s'
          % (colour.get('r'), colour.get('g'), colour.get('b'), colour.get('a')))
    if colour.get('a') == TARGET_ALPHA:
        print('already at %d; nothing to do' % TARGET_ALPHA)
        return 0
    scene.set_color(component, (colour.get('r', 5), colour.get('g', 13),
                                colour.get('b', 31), TARGET_ALPHA))
    if not write:
        print('(dry run; pass --write to save)')
        return 0
    scene.commit()
    print('wrote %s' % os.path.relpath(SCENE, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
