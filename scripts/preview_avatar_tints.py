"""Render the avatar disc under every row tint it will actually be multiplied by.

The asset is one white-ring disc multiplied per row, so the only way to know the
seven colours read as seven DIFFERENT holes -- and that the void stays dark under
the brightest tint -- is to composite them and look. Checking the file alone says
nothing about what the tint does to it.

Run: python scripts/preview_avatar_tints.py
"""
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'ui', 'v95', 'avatar_blackhole.png')
OUT = os.path.join(ROOT, 'artifacts', 'qa', 'v12', 'settlement', 'avatar_tints.png')

# ArenaMatchManager.BOT_TINTS, in slot order, plus the local player's V12 purple.
TINTS = [
    ('bot-1 蓝莓', '#4e9af1'), ('bot-2 矿石', '#54c985'), ('bot-3 风暴', '#e7a545'),
    ('bot-4 火花', '#b26ae8'), ('bot-5 雪球', '#4bbfd2'), ('bot-6 流光', '#f07171'),
    ('bot-7 哨兵', '#d7bd53'), ('local 我', '#9b5cff'),
]
SCALE = 3
PAD = 12


def hex_rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def main():
    base = Image.open(SRC).convert('RGBA')
    cell = base.width * SCALE
    sheet = Image.new('RGBA', (len(TINTS) * (cell + PAD) + PAD, cell + PAD * 4 + 18), (18, 22, 38, 255))
    draw = ImageDraw.Draw(sheet)

    for index, (label, tint) in enumerate(TINTS):
        rgb = hex_rgb(tint)
        # cc.Sprite tints by multiplying, so the preview has to multiply too --
        # an alpha-blended preview would show the ring far lighter than the game.
        disc = Image.new('RGBA', base.size, (0, 0, 0, 0))
        px, out = base.load(), disc.load()
        for y in range(base.height):
            for x in range(base.width):
                r, g, b, a = px[x, y]
                out[x, y] = (r * rgb[0] // 255, g * rgb[1] // 255, b * rgb[2] // 255, a)
        disc = disc.resize((cell, cell), Image.LANCZOS)
        x0 = PAD + index * (cell + PAD)
        sheet.alpha_composite(disc, (x0, PAD))
        draw.text((x0, PAD + cell + 4), label, fill=(230, 236, 250, 255))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print('wrote', OUT, sheet.size)
    return 0


if __name__ == '__main__':
    sys.exit(main())
