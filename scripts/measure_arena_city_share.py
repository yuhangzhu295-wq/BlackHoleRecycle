"""Measure how much of the arena frame is CITY, not what colour buckets exist.

The first version of this classified pixels by RGB relations -- "building warm =
r>b and r-b>30" -- and reported the arena at 0.5% building. That was wrong, and a
pixel sample at y=340 shows why: the row reads #a52f60, #d91115, #46ab2b, all
clearly building and vehicle colour, while the same script counted the road's
#6d7797 as "sky blue" because it has b > r.

A second attempt that avoids colour naming altogether: the city is everything that
is NOT one of the three surfaces the arena is known to have -- asphalt road, light
paving, and grass -- and is not the sky and not a UI panel. Buildings, vehicles,
trees, pickups and the hole itself all fall out of that subtraction.

Run: python scripts/measure_arena_city_share.py [frame.png]
"""
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DEFAULT = os.path.join(ROOT, 'artifacts', 'qa', 'v13', 'arena', 'arena-390x844.png')

# The three ground surfaces, as measured in the frame: asphalt rgb(109,119,151),
# the paving's light band, and grass. Saturation beyond these counts as object.
ASPHALT = (109, 119, 151)


def is_sky(r, g, b):
    # Road tint is #6d7797 and paints a huge share of the mid and near bands.
    # Any "sky" test that does not exclude it reports half the frame as sky, which
    # is what the first version did -- it classified the road as sky because
    # b > r there, and the arena's mid band read 48.6% sky on a frame whose sky is
    # a thin strip above the tree line. Test the exact road tint FIRST.
    if abs(r - ASPHALT[0]) <= 22 and abs(g - ASPHALT[1]) <= 22 and abs(b - ASPHALT[2]) <= 22:
        return False
    # The lighter warm-grey variant the same material takes in shade.
    if 128 <= r <= 190 and 132 <= g <= 196 and 148 <= b <= 210 and abs(r - g) <= 14:
        return False
    return b > r + 24 and b > g + 6 and b > 150


def is_ground(r, g, b):
    # Asphalt and its shading: near #6d7797 within a wide band.
    if abs(r - ASPHALT[0]) <= 26 and abs(g - ASPHALT[1]) <= 26 and abs(b - ASPHALT[2]) <= 26:
        return True
    # Light paving / kerb stone / road lines.
    if r >= 190 and g >= 190 and b >= 190:
        return True
    # The darker asphalt variant.
    if 60 <= r <= 130 and 60 <= g <= 140 and 80 <= b <= 170 and abs(r - g) <= 24:
        return True
    # Grass.
    if g > r + 14 and g > b + 10:
        return True
    return False


def city_share(image, top, bottom):
    width, height = image.size
    region = image.crop((0, int(top * height), width, int(bottom * height))).convert('RGB')
    pixels = list(region.getdata())
    city = 0
    sky = 0
    ground = 0
    for r, g, b in pixels:
        if is_sky(r, g, b):
            sky += 1
        elif is_ground(r, g, b):
            ground += 1
        else:
            city += 1
    total = len(pixels)
    return 100.0 * city / total, 100.0 * sky / total, 100.0 * ground / total


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    if not os.path.exists(path):
        print('missing frame %s' % path)
        return 1
    image = Image.open(path).convert('RGB')
    print('%s  (%dx%d)' % (os.path.relpath(path, ROOT), image.width, image.height))
    print('  %-20s %8s %8s %8s' % ('band', 'city', 'sky', 'ground'))
    for name, top, bottom in (
        ('far    (y 0-20%)', 0.00, 0.20),
        ('upper  (y 20-40%)', 0.20, 0.40),
        ('mid    (y 40-60%)', 0.40, 0.60),
        ('lower  (y 60-80%)', 0.60, 0.80),
        ('near   (y 80-100%)', 0.80, 1.00),
    ):
        city, sky, ground = city_share(image, top, bottom)
        print('  %-20s %7.1f%% %7.1f%% %7.1f%%' % (name, city, sky, ground))
    city, sky, ground = city_share(image, 0.0, 1.0)
    print('  %-20s %7.1f%% %7.1f%% %7.1f%%  (whole frame)' % ('all bands', city, sky, ground))
    print('\n"city" is every pixel that is not asphalt, paving, grass, or sky: buildings,')
    print('vehicles, trees, pickups, the hole and the HUD. A high city share at the top')
    print('and mid bands is what makes a frame read as a built-up district.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
