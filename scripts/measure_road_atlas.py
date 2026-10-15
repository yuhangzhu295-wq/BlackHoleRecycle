"""Measure what the road meshes actually sample out of the shared atlas.

Written to check a claim already recorded in the art-direction spec: that both
road meshes sample a 384x5 sliver. The GLB says u spans 0.031..0.969 and v spans
0.775..0.975, which is a 480x102 region, not 384x5 -- so one of the two is wrong
and the atlas decides which.

Run: python scripts/measure_road_atlas.py
"""
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ATLAS = os.path.join(ROOT, 'cocos', 'assets', 'art', 'world', 'roads', 'Textures', 'colormap.png')

# (name, u_range, v_range) exactly as scripts/glb_uv_tool.mjs reports them.
SAMPLES = (
    ('road-straight', (0.03125, 0.96875), (0.775, 0.975)),
    ('road-crossroad-path', None, None),
)


def region_stats(image, u_range, v_range):
    width, height = image.size
    # glTF UV origin is the top-left with v increasing downward.
    left = int(round(u_range[0] * width))
    right = int(round(u_range[1] * width))
    top = int(round(v_range[0] * height))
    bottom = int(round(v_range[1] * height))
    box = (left, top, max(right, left + 1), max(bottom, top + 1))
    crop = image.crop(box).convert('RGB')
    pixels = list(crop.getdata())
    total = len(pixels)
    black = sum(1 for p in pixels if p == (0, 0, 0))
    counts = {}
    for p in pixels:
        counts[p] = counts.get(p, 0) + 1
    top_colours = sorted(counts.items(), key=lambda kv: -kv[1])[:5]
    luma = sum(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in pixels) / total
    return {
        'box': box,
        'size': crop.size,
        'colours': len(counts),
        'black_fraction': black / total,
        'mean_luma': luma,
        'top': [(c, n / total) for c, n in top_colours],
    }


def main():
    image = Image.open(ATLAS).convert('RGB')
    print('atlas %s  %dx%d' % (os.path.relpath(ATLAS, ROOT), image.size[0], image.size[1]))

    whole = list(image.getdata())
    whole_black = sum(1 for p in whole if p == (0, 0, 0))
    print('atlas whole: %d colours, %.1f%% pure black'
          % (len(set(whole)), 100.0 * whole_black / len(whole)))

    for name, u_range, v_range in SAMPLES:
        if u_range is None:
            continue
        stats = region_stats(image, u_range, v_range)
        print('')
        print('%s samples box %s -> %dx%d' % (name, stats['box'], stats['size'][0], stats['size'][1]))
        print('  distinct colours: %d' % stats['colours'])
        print('  pure black: %.1f%%' % (100.0 * stats['black_fraction']))
        print('  mean luma: %.1f' % stats['mean_luma'])
        for colour, share in stats['top']:
            print('  top: #%02x%02x%02x %.1f%%' % (colour[0], colour[1], colour[2], 100.0 * share))
    return 0


if __name__ == '__main__':
    sys.exit(main())
