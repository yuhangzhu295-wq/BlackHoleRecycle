"""Author the ground detail texture as an editable SVG, then rasterise it.

Why this exists
---------------
`WorldArtLibrary.getColorTexture('terrainTile')` falls through to `default:
return null`, so the district ground is a flat tinted colour with no texture at
all -- the largest single flat area in the arena frame. The comment there says
new audited models keep a plain tint rather than sampling an unrelated atlas,
which is the right call; what was missing is a texture authored *for* the ground.

Two things have to be true for a new one to help:

  * It is drawn near-white, because the runtime multiplies it by
    `WORLD_PALETTE.terrainTile` (the audited green). The texture supplies detail
    and the palette supplies the colour, which is how every other kind works.
  * It tiles seamlessly, because the ground mesh is a single 32-unit tile that
    repeats across the district. Every shape is therefore emitted nine times at
    +/- one canvas and clipped, so opposite edges match by construction rather
    than by hoping.

V13 asks for editable vector sources instead of PIL drawings, so this writes an
SVG and `scripts/rasterize_svg.mjs` turns it into the PNG Creator imports.

Run: python scripts/author_ground_texture.py
"""
import os
import random
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SVG_OUT = os.path.join(ROOT, 'art-source', 'vector', 'ground-detail.svg')
SIZE = 512
SEED = 20261015


def wrapped(shape, size=SIZE):
    """Emit one shape nine times so the tile has no seam."""
    parts = []
    for dx in (-size, 0, size):
        for dy in (-size, 0, size):
            parts.append('    <g transform="translate(%d %d)">%s</g>' % (dx, dy, shape))
    return '\n'.join(parts)


def main():
    rng = random.Random(SEED)
    body = []

    # Large tonal patches: the slow variation that keeps a big field from
    # reading as one flat rectangle.
    patches = []
    for _ in range(26):
        cx = rng.uniform(0, SIZE)
        cy = rng.uniform(0, SIZE)
        r = rng.uniform(58, 112)
        tone = rng.choice(['#ffffff', '#d3dac4', '#e2e7d8'])
        opacity = rng.uniform(0.42, 0.68)
        patches.append(
            '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s" opacity="%.2f"/>'
            % (cx, cy, r, r * rng.uniform(0.75, 1.0), tone, opacity))
    body.append('  <!-- large tonal patches: slow variation across a 32-unit tile -->')
    body.append(wrapped('\n'.join(patches)))

    # Mid mottling: the scale a player actually reads as "this surface has
    # texture" rather than "this surface is a colour".
    mottle = []
    for _ in range(70):
        cx = rng.uniform(0, SIZE)
        cy = rng.uniform(0, SIZE)
        r = rng.uniform(16, 38)
        tone = rng.choice(['#c9d1bd', '#ffffff', '#dde3d1'])
        opacity = rng.uniform(0.34, 0.58)
        mottle.append(
            '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s" opacity="%.2f"/>'
            % (cx, cy, r, r * rng.uniform(0.6, 1.0), tone, opacity))
    body.append('  <!-- mid mottling -->')
    body.append(wrapped('\n'.join(mottle)))

    # Tufts: short strokes, the highest frequency that still survives the
    # camera. Kept low contrast so the field does not turn into noise.
    tufts = []
    for _ in range(150):
        x = rng.uniform(0, SIZE)
        y = rng.uniform(0, SIZE)
        length = rng.uniform(9, 22)
        angle = rng.uniform(-1.25, 1.25)
        tone = rng.choice(['#bfc9b0', '#ffffff'])
        opacity = rng.uniform(0.40, 0.72)
        tufts.append(
            '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f"'
            ' stroke-linecap="round" opacity="%.2f"/>'
            % (x, y, x + length * 0.5, y + length * angle * 0.5, tone,
               rng.uniform(2.0, 3.6), opacity))
    body.append('  <!-- tufts: the frequency that reads as surface, not as noise -->')
    body.append(wrapped('\n'.join(tufts)))

    svg = '\n'.join([
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">'
        % (SIZE, SIZE, SIZE, SIZE),
        '  <!--',
        '    Ground detail tile. Editable source; rasterise with',
        '    `node scripts/rasterize_svg.mjs art-source/vector/ground-detail.svg <out.png> 512x512`.',
        '',
        '    Drawn near-white on purpose: the runtime multiplies it by',
        '    WORLD_PALETTE.terrainTile, so this file carries structure and the palette',
        '    carries colour. Every shape appears nine times at +/- one canvas so the',
        '    tile has no seam where the 32-unit ground mesh repeats.',
        '',
        '    Colour values are greys, not greens, so the same file can serve any',
        '    ground tint the palette picks later.',
        '  -->',
        '  <rect width="%d" height="%d" fill="#f5f6f1"/>' % (SIZE, SIZE),
        '\n'.join(body),
        '</svg>',
        '',
    ])

    os.makedirs(os.path.dirname(SVG_OUT), exist_ok=True)
    with open(SVG_OUT, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(svg)
    print('wrote %s (%d bytes)' % (os.path.relpath(SVG_OUT, ROOT), len(svg)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
