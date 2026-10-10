"""Report which candidate GLBs import with real texture data.

The map-preview recipe wants cargo around the hole. `crate.glb` is excluded by
the harness because its `Textures/colormap.png` is not on disk, and guessing at
the others from directory listings is not evidence: `has_data` is False for any
image Blender has not needed to decode yet, so only an actual import can say.
This probe imports each candidate and prints the same verdict the harness uses.

Run: blender -b -P art-source/blender/probe_glb_textures.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import render_v95_assets as kit  # noqa: E402

CANDIDATES = [
    'recyclables/industrial/crate.glb',
    'recyclables/industrial/shipping-container.glb',
    'recyclables/props/recycling-box.glb',
    'recyclables/props/recycling-bolt.glb',
    'recyclables/props/tire.glb',
    'recyclables/props/turbine-wheel.glb',
    'recyclables/food/soda-can.glb',
    'recyclables/food/soda-bottle.glb',
    'recyclables/food/apple.glb',
    'recyclables/furniture/cardboard-box.glb',
    'recyclables/furniture/book-stack.glb',
    'recyclables/furniture/chair.glb',
    'recyclables/furniture/monitor.glb',
    'world/environment/tile-low.glb',
    'world/environment/tree-small.glb',
    'world/roads/construction-cone.glb',
]


def main():
    for relative in CANDIDATES:
        kit.clear_scene()
        kit.TEXTURELESS.clear()
        added = kit.import_glb(relative)
        if not added:
            verdict = 'MISSING' if not os.path.exists(os.path.join(kit.ASSETS, relative)) else 'TEXTURELESS'
        else:
            verdict = 'OK'
        print(f'[probe] {verdict:12s} {relative}', flush=True)


if __name__ == '__main__':
    main()
    sys.stdout.flush()
