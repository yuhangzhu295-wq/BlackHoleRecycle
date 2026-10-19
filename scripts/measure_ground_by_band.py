"""Where is the arena's ground area, by screen band and by cause?

The deep review put ground share at 69.1% against the reference's 47.9% and called
it a composition problem rather than an asset shortfall. That is actionable only if
the ground is broken down by band: ground in the far field is the district beyond
the frame edge, ground in the mid field is the block interior, and ground in the
near field is what the camera is looking down on. Each has a different fix.

Run: python scripts/measure_ground_by_band.py [frame.png]
"""
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DEFAULT = os.path.join(ROOT, 'artifacts', 'qa', 'v13', 'arena', 'arena-390x844.png')

ASPHALT = (109, 119, 151)


def is_sky(r, g, b):
    if abs(r - ASPHALT[0]) <= 22 and abs(g - ASPHALT[1]) <= 22 and abs(b - ASPHALT[2]) <= 22:
        return False
    if 128 <= r <= 190 and 132 <= g <= 196 and 148 <= b <= 210 and abs(r - g) <= 14:
        return False
    return b > r + 24 and b > g + 6 and b > 150


def is_ground(r, g, b):
    if abs(r - ASPHALT[0]) <= 26 and abs(g - ASPHALT[1]) <= 26 and abs(b - ASPHALT[2]) <= 26:
        return True
    if r >= 190 and g >= 190 and b >= 190:
        return True
    if 60 <= r <= 130 and 60 <= g <= 140 and 80 <= b <= 170 and abs(r - g) <= 24:
        return True
    if g > r + 14 and g > b + 10:
        return True
    return False


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    image = Image.open(path).convert('RGB')
    width, height = image.size
    print('%s  %dx%d' % (os.path.relpath(path, ROOT), width, height))
    print('  %-22s %8s %8s %8s' % ('band (vertical)', 'city', 'ground', 'sky'))
    bands = [
        ('far (y 0-25%)', 0.00, 0.25),
        ('upper (25-50%)', 0.25, 0.50),
        ('mid (50-75%)', 0.50, 0.75),
        ('near (75-100%)', 0.75, 1.00),
    ]
    for name, top, bottom in bands:
        region = image.crop((0, int(top * height), width, int(bottom * height)))
        pixels = list(region.getdata())
        city = ground = sky = 0
        for r, g, b in pixels:
            if is_sky(r, g, b):
                sky += 1
            elif is_ground(r, g, b):
                ground += 1
            else:
                city += 1
        total = len(pixels)
        print('  %-22s %7.1f%% %7.1f%% %7.1f%%'
              % (name, 100.0 * city / total, 100.0 * ground / total, 100.0 * sky / total))
    return 0


if __name__ == '__main__':
    sys.exit(main())
