"""Quantify the arena frame against DESIGN_07, region by region.

The review agent cannot see the images in this environment, so it needs numbers
instead of impressions. This measures both frames in the bands that matter for the
P1 complaint -- the near field being road-dominated -- and splits the frame into
the vertical regions a portrait game actually reads as near / mid / far.

Run: python scripts/measure_arena_vs_reference.py
"""
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
# The CROPPED phone mock-up, not the whole sheet: 07 is a document and its right
# half is annotation text, which would otherwise be measured as game content.
REF = os.path.join(ROOT, 'artifacts', 'qa', 'v14', 'review', 'REF07_phone.png')
CUR = os.path.join(ROOT, 'artifacts', 'qa', 'v13', 'arena', 'arena-390x844.png')

# Vertical bands of a 390x844 capture.
BANDS = (
    ('far    (y 0-20%)', 0.00, 0.20),
    ('upper  (y 20-40%)', 0.20, 0.40),
    ('mid    (y 40-60%)', 0.40, 0.60),
    ('lower  (y 60-80%)', 0.60, 0.80),
    ('near   (y 80-100%)', 0.80, 1.00),
)

# Colour families, by rule rather than by exact value: a rendered frame is never
# one flat colour, and matching exact hex would report a paved city as "not paved".
FAMILIES = (
    ('asphalt/road', lambda r, g, b: 40 <= r < 140 and 40 <= g < 140 and 40 <= b < 140
        and abs(r - b) < 30 and r >= g),
    ('paving light', lambda r, g, b: 150 <= r < 235 and 150 <= g < 235 and 150 <= b < 235
        and abs(r - b) < 26),
    ('grass/green', lambda r, g, b: g > r + 16 and g > b + 12 and g > 70),
    ('building warm', lambda r, g, b: r > g > b and r - b > 30 and r > 120),
    ('building cool', lambda r, g, b: b > r + 20 and g > r and b > 110),
    ('sky blue', lambda r, g, b: b > r + 30 and b > g + 10 and b > 120),
    ('very dark', lambda r, g, b: r < 45 and g < 45 and b < 45),
)


def band_report(image, top, bottom):
    width, height = image.size
    region = image.crop((0, int(top * height), width, int(bottom * height))).convert('RGB')
    pixels = list(region.getdata())
    total = len(pixels)
    counts = {name: 0 for name, _test in FAMILIES}
    for r, g, b in pixels:
        for name, test in FAMILIES:
            if test(r, g, b):
                counts[name] += 1
    return total, {name: 100.0 * value / total for name, value in counts.items()}


def summarise(label, image):
    print(f'\n{label}  ({image.width}x{image.height})')
    print('  %-20s %s' % ('band', ' '.join(name[:9].rjust(10) for name, _ in FAMILIES)))
    for name, top, bottom in BANDS:
        total, shares = band_report(image, top, bottom)
        cells = ' '.join(f'{shares[name]:9.1f}' for name, _ in FAMILIES)
        print('  %-20s %s' % (name, cells))


def main():
    if not os.path.exists(REF) or not os.path.exists(CUR):
        print('missing frame: %s or %s' % (REF, CUR))
        return 1
    summarise('DESIGN_07 reference', Image.open(REF).convert('RGB'))
    summarise('current arena frame', Image.open(CUR).convert('RGB'))
    print('\nRead: which families dominate each band. A city should show buildings in')
    print('the upper and mid bands; a road-dominated frame shows asphalt/paving there.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
