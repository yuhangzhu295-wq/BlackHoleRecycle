"""Crop and magnify a region of a page capture, for reading small UI text.

Small defects (illegible text on a same-hue bar, an overlapping pill) are not
visible at contact-sheet scale, and the whole page at 3x is too large to read.
This crops the one region that matters and scales it up.

Usage: python scripts/crop_zoom.py <src.png> <out.png> <x0> <y0> <x1> <y1> [scale]
"""
import sys

from PIL import Image


def main():
    if len(sys.argv) < 7:
        raise SystemExit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    x0, y0, x1, y1 = (int(value) for value in sys.argv[3:7])
    scale = float(sys.argv[7]) if len(sys.argv) > 7 else 3.0
    image = Image.open(src).convert('RGB')
    box = image.crop((x0, y0, x1, y1))
    box = box.resize((int(box.width * scale), int(box.height * scale)), Image.LANCZOS)
    box.save(out)
    print(f'[crop] {src} [{x0},{y0},{x1},{y1}] x{scale} -> {out} ({box.width}x{box.height})')


if __name__ == '__main__':
    main()
