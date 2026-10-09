"""Compose the Home brand plate at the Logo node's authored size.

`Logo` is authored 600x180 by the layout contract, which may not be changed, so
the brand art has to be composed at that aspect rather than the node resized.

The plate carries **no text**. The brand name is a Creator `Label` added beside
it, because baking text into an image makes it uneditable and unlocalisable.

The old `home_logo.png` was doing two jobs at once: the wordmark, and a decorative
ringed planet at its right edge. That planet is what looked like an unexplained
dark oval on the page -- the node's rect covers x -0.007..1.007, y 0.141..0.281,
which is where the oval appeared. It was never a separate node.

Run: python art-source/vector/compose_brand_logo.py
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_source import art_path  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(REPO, 'cocos', 'assets', 'game_art', 'ui', 'v95')

# Authored size of the Logo node. Aspect 3.33.
WIDTH, HEIGHT = 600, 180


def art(name):
    return Image.open(art_path(name)).convert('RGBA')


def scaled(image, width):
    ratio = width / image.width
    return image.resize((width, max(1, round(image.height * ratio))), Image.LANCZOS)


def main():
    canvas = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))

    plate = scaled(art('plate_brand.png'), 560)
    canvas.alpha_composite(plate, ((WIDTH - plate.width) // 2, (HEIGHT - plate.height) // 2))

    planet = scaled(art('glyph_planet.png'), 92)
    canvas.alpha_composite(planet, (WIDTH - planet.width - 34, (HEIGHT - planet.height) // 2))

    for size, x, y in ((38, 30, 24), (26, 44, 132), (22, 540, 26)):
        sparkle = scaled(art('sparkle.png'), size)
        canvas.alpha_composite(sparkle, (x, y))

    out = os.path.join(ART, 'logo_brand_home.png')
    canvas.save(out)
    print(f'logo_brand_home.png  {WIDTH}x{HEIGHT}  {os.path.getsize(out) // 1024} KB'
          '  (centre left clear for the Label)')


if __name__ == '__main__':
    main()
