"""Resolve art assets across the two places they live.

`cocos/assets/game_art/ui/v95/` holds what the game ships. `art-source/inputs/`
holds the pipeline's own inputs and the superseded intermediates -- the renders
the composites are built from, which are not referenced by any scene or prefab.

Keeping them separate is not tidiness: everything under `cocos/assets/` is packed
into the mini-game bundle, so a 1.2 MB source render left in the asset tree is
1.2 MB of download for every player, for a file nothing loads.
"""
import os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHIPPED = os.path.join(REPO, 'cocos', 'assets', 'game_art', 'ui', 'v95')
INPUTS = os.path.join(REPO, 'art-source', 'inputs')


def art_path(name):
    """The shipped asset if there is one, otherwise the pipeline input."""
    shipped = os.path.join(SHIPPED, name)
    if os.path.exists(shipped):
        return shipped
    fallback = os.path.join(INPUTS, name)
    if os.path.exists(fallback):
        return fallback
    raise FileNotFoundError(f'{name} is neither shipped nor an input')
