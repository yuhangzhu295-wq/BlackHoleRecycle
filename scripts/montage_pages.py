"""Tile labelled page captures into one contact sheet.

Reading a page comparison one screenshot at a time is expensive and makes it
easy to miss that two pages render identically (which is itself a defect). This
tiles them with their file names burned in, so one look covers a whole group.

Usage: python scripts/montage_pages.py <out.png> <cols> <img> [<img> ...]
"""
import os
import sys

from PIL import Image, ImageDraw

LABEL_H = 26


def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    out, cols = sys.argv[1], int(sys.argv[2])
    paths = sys.argv[3:]
    tiles = []
    for path in paths:
        image = Image.open(path).convert('RGB')
        tiles.append((os.path.basename(path), image))
    if not tiles:
        raise SystemExit('no images')

    width = max(tile.width for _, tile in tiles)
    height = max(tile.height for _, tile in tiles) + LABEL_H
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (width * min(cols, len(tiles)), height * rows), (24, 26, 32))
    draw = ImageDraw.Draw(sheet)
    for index, (name, tile) in enumerate(tiles):
        col, row = index % cols, index // cols
        x, y = col * width, row * height
        sheet.paste(tile, (x, y + LABEL_H))
        draw.text((x + 6, y + 6), name, fill=(255, 255, 255))
    sheet.save(out)
    print(f'[montage] {len(tiles)} tiles, {cols} cols -> {out} ({sheet.width}x{sheet.height})')


if __name__ == '__main__':
    main()
