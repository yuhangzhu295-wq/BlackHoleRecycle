"""Recolour the Settlement board to DESIGN_06's dark panels.

The reference draws its leaderboard as a dark navy panel with light text, and its
reward panel the same, while the three stat cards stay light. This product's board
is light throughout with dark text, which is the V9.5 canon's reading of an older
reference -- V12's sheet supersedes it.

Every value below is a MEDIAN sampled from the reference's own pixels by
`scripts/sample_settlement_reference.py`, not chosen by eye:

  leaderboard panel fill   #1a2e58   rgb( 26, 46, 88)
  row fill                 #192c53   rgb( 25, 44, 83)
  reward panel fill        #1d2b51   rgb( 29, 43, 81)
  stat card fill           #edf4fd   rgb(237,244,253)   <- stays light, unchanged

Text colours are not in the sheet, so they are derived from the roles they replace
and checked for contrast against the fill they sit on: the reference's row name
text measured rgb(202,215,244) on the dark row, which is what the name and mass
columns are set to.

Deliberately NOT changed:

  * the three stat cards, which the reference also draws light;
  * the rank badges, which stay gold/silver/bronze/purple/blue with dark numerals;
  * the player's own row, which stays a light green. The reference's highlighted
    row is gold because the sample player won; ours is a pinned "you" row at the
    bottom whatever the placement, so painting it the winner's colour would say
    something the placement does not.

Run: python scripts/retint_settlement_board.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.scene_edit import Scene, repo_root  # noqa: E402

SCENE = os.path.join(repo_root(), 'cocos', 'assets', 'scenes', 'Game.scene')

PANEL = (26, 46, 88, 255)
ROW = (25, 44, 83, 255)
REWARD_PANEL = (29, 43, 81, 255)

ROW_NAME = (234, 240, 255, 255)
ROW_TITLE = (159, 178, 216, 255)
ROW_SCORE = (234, 240, 255, 255)
REWARD_CAPTION = (206, 220, 246, 255)
REWARD_BREAKDOWN = (159, 178, 216, 255)
# The reference's reward figure is a bright gold on the dark panel; the existing
# value was a dark gold that only worked on the pale fill it used to sit on.
REWARD_VALUE = (255, 205, 70, 255)

SPRITES = {
    'ArenaLeaderboardPanel': PANEL,
    **{f'ArenaRankRow_{i}': ROW for i in range(1, 6)},
    'ArenaRewardPanel': REWARD_PANEL,
}

LABELS = {
    **{f'ArenaRankName_{i}': ROW_NAME for i in range(1, 6)},
    **{f'ArenaRankTitle_{i}': ROW_TITLE for i in range(1, 6)},
    **{f'ArenaRankScore_{i}': ROW_SCORE for i in range(1, 6)},
    'ArenaRewardCaption': REWARD_CAPTION,
    'ArenaRewardValue': REWARD_VALUE,
    'ArenaRewardBreakdown': REWARD_BREAKDOWN,
}


def main():
    scene = Scene(SCENE)
    changed = 0
    for name, colour in SPRITES.items():
        node = scene.find(name)
        if node is None:
            raise SystemExit('sprite node %s not found' % name)
        scene.set_color(scene.component(node, 'cc.Sprite'), colour)
        changed += 1
    for name, colour in LABELS.items():
        node = scene.find(name)
        if node is None:
            raise SystemExit('label node %s not found' % name)
        scene.set_color(scene.component(node, 'cc.Label'), colour)
        changed += 1

    scene.commit()
    print('recoloured %d settlement nodes (%d panels, %d labels)'
          % (changed, len(SPRITES), len(LABELS)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
