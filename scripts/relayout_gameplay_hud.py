"""Move three gameplay-HUD nodes onto the positions DESIGN_03/04 draw them.

1. `RegionPanel` (Endless) drops from y=346 to 316, because the progress bar
   moved down to 372 and the region pill would otherwise be the thing the bar
   now overlaps instead. The two are moved together on purpose: fixing only the
   bar just passes the collision down the stack.

2. The Arena rank/mass block (`StatusPanel`, `RankValue`, `MassValue`,
   `KillCaption`, `KillValue`) moves from the LEFT side to the right, which is
   where DESIGN_04 puts it. It currently sits stacked above the leaderboard, so
   the whole top-left is two panels deep while the right side carries only the
   pause button.

Every node is looked up as a CHILD OF ITS PAGE. Bare names are not unique --
`MassValue` appears three times across the Endless HUD, the Arena HUD and the
settlement board, and `RankValue` twice -- so the first version of this script
moved the settlement's mass label and left the Arena HUD untouched. It parsed,
it wrote, and nothing complained.

The block moves as a unit. A panel and its labels are siblings, not parent and
children, so moving the panel alone leaves its text behind -- a mistake this
project has already made once on the settlement page.

Run: python scripts/relayout_gameplay_hud.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.scene_edit import Scene, repo_root  # noqa: E402

SCENE = os.path.join(repo_root(), 'cocos', 'assets', 'scenes', 'Game.scene')

# (page, node, expected x, expected y, new x, new y)
MOVES = (
    ('EndlessHUD', 'RegionPanel', 0, 346, 0, 316),
    # ...and its label, which is a SIBLING of the panel, not a child. Moving the
    # panel alone leaves the text where it was, floating above an empty pill --
    # the trap this script's docstring warns about, which it then walked into.
    ('EndlessHUD', 'RegionValue', 0, 346, 0, 316),
    # DESIGN_04 puts rank+mass on the right, under the pause button (which spans
    # y 463..521), so the block lands at y 373..427 without touching it.
    #
    # Every x moves by the same +452, which mirrors the block about the centre
    # while PRESERVING its internal order (rank left of mass). Negating each x
    # instead would flip that order, so the block would read "mass  rank".
    ('ArenaHUD', 'StatusPanel', -226, 472, 226, 400),
    ('ArenaHUD', 'RankValue', -266, 484, 186, 412),
    ('ArenaHUD', 'MassValue', -176, 484, 276, 412),
    ('ArenaHUD', 'KillCaption', -282, 460, 170, 388),
    ('ArenaHUD', 'KillValue', -242, 460, 210, 388),
    # The joystick's authored x was 232, which nothing used: `JoystickVisual`
    # overrode it to 148 (now -148) at runtime, so the scene, the contract and
    # the rendered control all described different positions. Moving the authored
    # value too makes the three agree, so the contract is not recording a
    # position the game never renders.
    ('EndlessHUD', 'Joystick', 232, -470, -148, -470),
    ('ArenaHUD', 'Joystick', 232, -470, -148, -470),
)


def main():
    scene = Scene(SCENE)
    for page, name, from_x, from_y, to_x, to_y in MOVES:
        node = scene.find_child(page, name)
        if node is None:
            raise SystemExit('%s has no child %s' % (page, name))
        x = scene.arr[node]['_lpos']['x']
        y = scene.arr[node]['_lpos']['y']
        if (x, y) != (from_x, from_y):
            raise SystemExit('%s/%s is at (%s,%s), expected (%s,%s) -- refusing to move a '
                             'node that has changed since this script was written'
                             % (page, name, x, y, from_x, from_y))
        scene.set_lpos(node, to_x, to_y)
        print('  %-10s %-12s (%4d,%4d) -> (%4d,%4d)' % (page, name, x, y, to_x, to_y))
    scene.commit()
    print('moved %d gameplay HUD nodes' % len(MOVES))
    return 0


if __name__ == '__main__':
    sys.exit(main())
