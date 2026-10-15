"""What colour is the flat part of the arena's near field, really?

The art-direction spec recorded the arena's flatness as the road mesh sampling a
five-pixel sliver of a shared atlas, and named a dedicated road texture as the
fix. Measuring the atlas says otherwise: the road samples a 480x102 region with
67 distinct colours and no pure black at all. So the flatness has another cause,
and the first thing to establish is what the flat region's colour actually is --
a value near MAT_ROAD's own `mainColor` (206,216,233) would point at the material
rather than at the texture.

Run: python scripts/measure_arena_road_colour.py [image.png]
"""
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DEFAULT = os.path.join(ROOT, 'artifacts', 'qa', 'v13', 'arena', 'arena-390x844.png')
# MAT_ROAD._props.mainColor
MAT_ROAD_COLOR = (206, 216, 233)
# The play band and the near field, as the V13 spec's own region split defines
# them for a 390x844 capture.
PLAY_BAND = (0.30, 0.95)
NEAR_FIELD = (0.66, 0.85)


def band(image, fractions):
    width, height = image.size
    return image.crop((0, int(fractions[0] * height), width, int(fractions[1] * height))).convert('RGB')


def top_colours(image, count=8):
    pixels = list(image.getdata())
    counts = {}
    for p in pixels:
        counts[p] = counts.get(p, 0) + 1
    total = len(pixels)
    return total, sorted(counts.items(), key=lambda kv: -kv[1])[:count]


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    image = Image.open(path)
    print('capture %s  %dx%d' % (os.path.relpath(path, ROOT), image.size[0], image.size[1]))

    for name, fractions in (('play band', PLAY_BAND), ('near field', NEAR_FIELD)):
        region = band(image, fractions)
        total, top = top_colours(region)
        colours = len(set(region.getdata()))
        print('')
        print('%s y=%.2f..%.2f  %d distinct colours' % (name, fractions[0], fractions[1], colours))
        for colour, count in top:
            share = 100.0 * count / total
            mark = ''
            if sum(abs(a - b) for a, b in zip(colour, MAT_ROAD_COLOR)) <= 12:
                mark = '  <-- MAT_ROAD.mainColor'
            print('  #%02x%02x%02x  %5.1f%%%s' % (colour[0], colour[1], colour[2], share, mark))
    return 0


if __name__ == '__main__':
    sys.exit(main())
