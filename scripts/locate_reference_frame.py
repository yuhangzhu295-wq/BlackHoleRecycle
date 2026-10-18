"""Locate the phone mock-up inside a design sheet, by finding its frame.

These reference sheets are documents: a phone mock-up plus annotation columns. A
comparison that uses the WHOLE sheet is wrong twice over -- the annotation text
counts as "content", and the phone is only part of the width.

The mock-up is found by its frame edge: a long straight run of near-constant
colour. This scans for the longest vertical run in each row and takes the rows and
columns where those runs agree, which is the mock-up's border.

Run: python scripts/locate_reference_frame.py [sheet.png]
"""
import os
import sys
from collections import Counter

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def find_frame(image):
    """Return (left, top, right, bottom) of the inner screen, and the debug rows."""
    width, height = image.size
    pixels = image.convert('RGB').load()

    # A phone screen is the largest solid-ish rectangle. Score each column by how
    # uniform it is top-to-bottom: the frame border is uniform; the annotation
    # columns change with text.
    def column_score(x):
        sample = [pixels[x, y] for y in range(0, height, 4)]
        counts = Counter(sample)
        most_common = counts.most_common(1)[0][1]
        return most_common / len(sample)

    scores = [column_score(x) for x in range(width)]
    # A frame border is at least as uniform as 60% of its samples; annotation text
    # breaks a column into many colours and scores far lower.
    threshold = max(0.35, sorted(scores)[-int(width * 0.15)])
    uniform_columns = [x for x, score in enumerate(scores) if score >= threshold]
    if not uniform_columns:
        return None

    # Group consecutive columns into runs; the mock-up is the WIDEST run.
    runs = []
    start = uniform_columns[0]
    for previous, current in zip(uniform_columns, uniform_columns[1:]):
        if current != previous + 1:
            runs.append((start, previous))
            start = current
    runs.append((start, uniform_columns[-1]))
    runs.sort(key=lambda run: run[1] - run[0], reverse=True)
    left, right = runs[0]
    return left, 0, right, height, scores


def main():
    sheets = sys.argv[1:] or [
        '07-arena-gameplay.png',
        '04-arena-art-direction.png',
        '02-city-concept.png',
    ]
    for name in sheets:
        path = os.path.join(ROOT, 'artifacts', 'qa', 'v12', 'ref', name)
        if not os.path.exists(path):
            print('%s: missing' % name)
            continue
        image = Image.open(path).convert('RGB')
        found = find_frame(image)
        if not found:
            print('%s: no frame found' % name)
            continue
        left, _top, right, bottom, scores = found
        print('%s: sheet %dx%d, frame columns %d..%d (%d wide, %.0f%% of sheet)'
              % (name, image.width, image.height, left, right, right - left,
                 100.0 * (right - left) / image.width))
        # Crop the frame and save it, so the comparison uses the mock-up only.
        crop = image.crop((left, 0, right + 1, bottom))
        out = os.path.join(ROOT, 'artifacts', 'qa', 'v14', 'review',
                           'frame-' + name.replace('.png', '.png'))
        crop.save(out)
        print('    inner crop -> %s (%dx%d)' % (os.path.relpath(out, ROOT), crop.width, crop.height))
    return 0


if __name__ == '__main__':
    sys.exit(main())
