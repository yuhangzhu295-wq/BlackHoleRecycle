"""Author the three stat-card icons the adopted Settlement reference leads with.

The reference gives every stat card an icon (coin, skull, stopwatch) and our cards
are text-only, which is much of why the Endless settlement reads as sparse beside
it. These are the same three roles as this product's cards: mass, absorbed items,
level.

Technique: every icon is drawn as an OUTLINE shape at full size with a FILL shape
inset inside it. The first two attempts used one shape with `fill`, then a second
pass with `outline` and a large `width` -- which PIL strokes inward and which
swallowed the fill, so the icons came out as dark silhouettes.

Run: python art-source/vector/generate_stat_icons.py
"""
import math
import os

from PIL import Image, ImageDraw

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(REPO, 'cocos', 'assets', 'game_art', 'ui', 'v95')

SIZE = 72
SS = 4
EDGE = 4 * SS  # outline thickness, in supersampled px

OUTLINE = (24, 32, 58, 255)
HIGHLIGHT = (255, 255, 255, 120)


def canvas():
    image = Image.new('RGBA', (SIZE * SS, SIZE * SS), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)


def inset(box, amount=EDGE):
    return (box[0] + amount, box[1] + amount, box[2] - amount, box[3] - amount)


def sticker(draw, box, radius, fill):
    """Outline at full size, fill inset inside it."""
    draw.rounded_rectangle(box, radius=radius, fill=OUTLINE)
    draw.rounded_rectangle(inset(box), radius=max(1, radius - EDGE), fill=fill + (255,))


def polygon_sticker(draw, points, fill, shrink=0.82):
    """Same idea for a polygon: a scaled-down copy of the same points for the fill."""
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    draw.polygon(points, fill=OUTLINE)
    draw.polygon([(cx + (x - cx) * shrink, cy + (y - cy) * shrink) for x, y in points],
                 fill=fill + (255,))


def mass_icon():
    """A weight: a block with a bar through the top."""
    s = SS
    image, draw = canvas()
    sticker(draw, (24 * s, 8 * s, 48 * s, 24 * s), 6 * s, (206, 220, 240))
    sticker(draw, (10 * s, 24 * s, 62 * s, 64 * s), 12 * s, (138, 44, 247))
    draw.rounded_rectangle((20 * s, 32 * s, 52 * s, 41 * s), radius=4 * s, fill=HIGHLIGHT)
    return image


def items_icon():
    """A package: a cube seen slightly from above."""
    s = SS
    image, draw = canvas()
    points = [(36 * s, 8 * s), (62 * s, 23 * s), (62 * s, 50 * s), (36 * s, 65 * s),
              (10 * s, 50 * s), (10 * s, 23 * s)]
    polygon_sticker(draw, points, (57, 186, 250), shrink=0.80)
    # A lighter top face, so the cube reads as a box rather than a hexagon.
    draw.polygon([(36 * s, 15 * s), (55 * s, 25 * s), (36 * s, 35 * s), (17 * s, 25 * s)],
                 fill=(186, 232, 255, 255))
    return image


def level_icon():
    """A medal star."""
    s = SS
    image, draw = canvas()
    points = []
    for i in range(10):
        radius = 31 * s if i % 2 == 0 else 14 * s
        angle = -math.pi / 2 + i * math.pi / 5
        points.append((36 * s + radius * math.cos(angle), 36 * s + radius * math.sin(angle)))
    polygon_sticker(draw, points, (254, 195, 3), shrink=0.78)
    return image


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, factory in (
        ('icon_stat_mass.png', mass_icon),
        ('icon_stat_items.png', items_icon),
        ('icon_stat_level.png', level_icon),
    ):
        path = os.path.join(OUT_DIR, name)
        factory().resize((SIZE, SIZE), Image.LANCZOS).save(path)
        print('wrote', os.path.relpath(path, REPO))


if __name__ == '__main__':
    main()
