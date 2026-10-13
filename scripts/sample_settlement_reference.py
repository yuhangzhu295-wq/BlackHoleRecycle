"""Sample the adopted reference's settlement board regions.

While adding the leaderboard avatars it became clear the reference's board is a
dark navy panel with light text, and this product's is a light panel with dark
text. That is a large change to act on, so the reference is measured before
anything is re-coloured -- and measured as the MEDIAN of a region rather than a
single pixel, because a point sample on an illustration or a gradient edge gives
a confident wrong answer. The first version of this script did exactly that and
reported the board fill as sky blue.

Every region is printed with its median and its luma, so a box that landed on the
wrong thing shows up as an obviously wrong colour instead of quietly becoming the
new palette.

Run: python scripts/sample_settlement_reference.py
"""
import os
import statistics
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
REF = os.path.join(ROOT, 'art-source', 'references', 'v12', '06-growth-guide.png')

# (label, left, top, right, bottom) in the reference's own 941x1672 pixels.
# Read off the phone mockup: the leaderboard panel sits under the 第 1 名 headline
# and the stat cards sit under it, above the reward panel and the two buttons.
REGIONS = (
    ('leaderboard panel fill', 250, 960, 600, 1000),
    ('row 2 fill', 240, 780, 620, 812),
    ('row 1 fill (player)', 240, 712, 620, 748),
    ('row 2 name text', 350, 782, 420, 800),
    ('row 2 title text', 350, 806, 430, 822),
    ('stat card fill', 240, 1060, 400, 1090),
    ('stat card value text', 300, 1130, 380, 1160),
    ('reward panel fill', 240, 1230, 340, 1260),
    ('reward panel right side', 560, 1250, 640, 1270),
    ('page backdrop beside the board', 150, 960, 185, 1010),
    ('board border', 208, 900, 216, 960),
)


def median_colour(pixels, box):
    left, top, right, bottom = box
    reds, greens, blues = [], [], []
    for y in range(top, bottom):
        for x in range(left, right):
            r, g, b = pixels[x, y]
            reds.append(r)
            greens.append(g)
            blues.append(b)
    return (int(statistics.median(reds)), int(statistics.median(greens)), int(statistics.median(blues)))


def main():
    image = Image.open(REF).convert('RGB')
    print('reference %s %dx%d' % (os.path.basename(REF), image.width, image.height))
    pixels = image.load()
    for label, *box in REGIONS:
        if box[2] > image.width or box[3] > image.height:
            print('  %-32s %s OUT OF BOUNDS' % (label, box))
            continue
        r, g, b = median_colour(pixels, box)
        print('  %-32s box=%s  #%02x%02x%02x  rgb(%3d,%3d,%3d)  luma %5.1f'
              % (label, box, r, g, b, r, g, b, 0.2126 * r + 0.7152 * g + 0.0722 * b))
    return 0


if __name__ == '__main__':
    sys.exit(main())
