"""Compare the rendered gameplay palette against the adopted V9.5 art.

The UI pages were rebuilt from `art-source/vector/palette.py`, but the gameplay
world and the player singularity take their colour from runtime roles
(`RenderProfile.WORLD_PALETTE`, `UI_PALETTE`, and `GameConfig`'s level/skin
colours). Those were never reconciled with the adopted art, so the two surfaces
can drift apart without any gate noticing: no contract pins a hex value, only the
relationship between a config entry and what consumes it.

This samples both sides and prints the deltas. Read-only.

Usage: python scripts/audit_gameplay_palette.py
"""
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
V95 = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'ui', 'v95')
GAMEPLAY = os.path.join(ROOT, 'artifacts', 'qa', 'v95', 'gameplay', 'endless-hud.png')


def dominant(image, box, min_share=0.02, quantise=16):
    """Most common quantised colours inside `box`, as (hex, share)."""
    region = image.crop(box).convert('RGB')
    counts = {}
    for pixel in region.getdata():
        key = tuple(channel // quantise * quantise + quantise // 2 for channel in pixel)
        counts[key] = counts.get(key, 0) + 1
    total = sum(counts.values()) or 1
    ranked = sorted(counts.items(), key=lambda item: -item[1])
    return [(f'#{r:02x}{g:02x}{b:02x}', n / total) for (r, g, b), n in ranked if n / total >= min_share]


def hex_to_rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def distance(a, b):
    return sum((x - y) ** 2 for x, y in zip(hex_to_rgb(a), hex_to_rgb(b))) ** 0.5


def main():
    print('=== adopted V9.5 hero art (home_hero_blackhole.png) ===')
    hero_path = os.path.join(V95, 'home_hero_blackhole.png')
    hero = Image.open(hero_path).convert('RGB')
    print(f'  size {hero.size}')
    width, height = hero.size
    # Centre band: the singularity body, then a ring just outside it.
    for label, box in (
        ('core', (int(width * 0.42), int(height * 0.42), int(width * 0.58), int(height * 0.58))),
        ('mid', (int(width * 0.30), int(height * 0.30), int(width * 0.40), int(height * 0.40))),
        ('outer', (int(width * 0.16), int(height * 0.16), int(width * 0.24), int(height * 0.24))),
    ):
        print(f'  {label:6s} ' + ', '.join(f'{hex_} {share:.0%}' for hex_, share in dominant(hero, box)[:4]))

    print()
    print('=== rendered gameplay (artifacts/qa/v95/gameplay/endless-hud.png) ===')
    if not os.path.exists(GAMEPLAY):
        print('  no gameplay capture at', GAMEPLAY)
        return 0
    frame = Image.open(GAMEPLAY).convert('RGB')
    print(f'  size {frame.size}')
    width, height = frame.size
    # The hero sits at the screen centre (the visuals gate reports screenX/Y ~0.47-0.53).
    regions = (
        ('hero core', (int(width * 0.44), int(height * 0.40), int(width * 0.56), int(height * 0.50))),
        ('hero ring', (int(width * 0.36), int(height * 0.36), int(width * 0.44), int(height * 0.44))),
        ('road', (int(width * 0.05), int(height * 0.60), int(width * 0.30), int(height * 0.72))),
        ('grass', (int(width * 0.02), int(height * 0.02), int(width * 0.30), int(height * 0.14))),
    )
    for label, box in regions:
        print(f'  {label:10s} ' + ', '.join(f'{hex_} {share:.0%}' for hex_, share in dominant(frame, box)[:4]))

    print()
    print('=== runtime colour roles that feed the above (RenderProfile / GameConfig) ===')
    roles = {
        'UI_PALETTE.primary': '#ffbd1f',
        'UI_PALETTE.secondary': '#8b62f4',
        'UI_PALETTE.hudPanel': '#0a1a33',
        'UI_PALETTE.skyLight': '#7fc9f2',
        'UI_PALETTE.playerBody': '#281660',
        'UI_PALETTE.playerRim': '#e0d5ff',
        'skin_classic.color': '#281660',
        'skin_classic.rimColor': '#e0d5ff',
        'level1.baseColor': '#2b7fff',
        'level1.rimColor': '#00e5ff',
    }
    adopted = {
        'YELLOW (V9.5 primary)': '#fec303',
        'PURPLE (V9.5 secondary)': '#8a2cf7',
        'NAVY_PLATE': '#031d4d',
        'SKY_MID': '#52d0fe',
        'PURPLE_RIBBON': '#8f48cd',
        'BOARD_PANEL': '#e8f6fb',
    }
    print('  adopted V9.5 palette (art-source/vector/palette.py):')
    for name, hex_ in adopted.items():
        print(f'    {name:28s} {hex_}')
    print('  closest adopted colour for each runtime role:')
    for role, hex_ in roles.items():
        best = min(adopted.items(), key=lambda item: distance(hex_, item[1]))
        print(f'    {role:24s} {hex_}  -> {best[0]:24s} {best[1]}  d={distance(hex_, best[1]):5.1f}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
