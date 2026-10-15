"""Author the five stat-card icons as editable SVG, then rasterise them.

PHASE F of V13: UI art moves off PIL and onto vector sources. The stat icons are
the first set because they are small, self-contained and high-visibility -- they
lead every Settlement stat card -- and because the shapes are pure geometry
(outline sticker, inset fill), which is what a vector file is good at.

Colours are sampled from the shipped PNGs rather than chosen, so this is a change
of TOOL, not a change of look. That matters: the previous art is accepted, and a
"redesign" hidden inside a pipeline migration is exactly what the brief forbids.

The emitted SVG is the editable source; `scripts/rasterize_svg.mjs` turns it into
the PNG Creator imports. Run:

    python scripts/author_stat_icon_vectors.py
"""
import os
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SVG_DIR = os.path.join(ROOT, 'art-source', 'vector', 'ui')
PNG_DIR = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'ui', 'v95')
SIZE = 72

# Sampled from the shipped PNGs (see the docstring: tool change, not redesign).
OUTLINE = '#19213c'
MASS_FILL = '#8a2cf7'
MASS_HANDLE = '#cedcf0'
MASS_HIGHLIGHT = '#b8b8b8'
ITEMS_FILL = '#39bafa'
ITEMS_TOP = '#bae8ff'
GOLD = '#fec303'
GOLD_LIGHT = '#fff5b8'
VOID = '#0a081a'
VOID_RING = '#5834e8'
VOID_ARC = '#e8e0ff'

STROKE = 5.0


def svg(body):
    return '\n'.join([
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}"'
        f' viewBox="0 0 {SIZE} {SIZE}">',
        body,
        '</svg>',
        '',
    ])


def star(cx, cy, outer, inner, fill, stroke=None):
    import math
    points = []
    for index in range(10):
        radius = outer if index % 2 == 0 else inner
        angle = -math.pi / 2 + index * math.pi / 5
        points.append(f'{cx + radius * math.cos(angle):.2f},{cy + radius * math.sin(angle):.2f}')
    stroke_attr = f' stroke="{stroke}" stroke-width="{STROKE}" stroke-linejoin="round"' if stroke else ''
    return f'<polygon points="{" ".join(points)}" fill="{fill}"{stroke_attr}/>'


def star_sticker(cx, cy, outer, inner, fill, shrink=0.78):
    """Outline by SHRINKING a filled copy, not by stroking the outline.

    A constant-width stroke is wrong for a star: its arms are narrow, so a 5px
    stroke covered 60% of the shape where the shipped icon's outline covers 35%,
    and the star rendered mostly dark. The original PIL generator used this same
    shrink technique -- a filled polygon in the outline colour, then a scaled copy
    in the fill -- which gives a rim whose thickness follows the shape.
    """
    return star(cx, cy, outer, inner, OUTLINE) + '\n  ' + star(
        cx, cy, outer * shrink, inner * shrink, fill)


def polygon_sticker(points, fill, shrink=0.82):
    """Outline a convex polygon by shrinking a copy of the same points."""
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    outline = ' '.join(f'{x:.2f},{y:.2f}' for x, y in points)
    inner = ' '.join(f'{cx + (x - cx) * shrink:.2f},{cy + (y - cy) * shrink:.2f}' for x, y in points)
    return (f'<polygon points="{outline}" fill="{OUTLINE}" stroke-linejoin="round"/>'
            f'\n  <polygon points="{inner}" fill="{fill}"/>')


def icons():
    return {
        # A weight: a light handle over a purple body with a highlight bar.
        'mass': svg('\n'.join([
            f'  <rect x="25" y="9" width="22" height="16" rx="5" fill="{MASS_HANDLE}"'
            f' stroke="{OUTLINE}" stroke-width="{STROKE}"/>',
            f'  <rect x="12" y="23" width="48" height="40" rx="12" fill="{MASS_FILL}"'
            f' stroke="{OUTLINE}" stroke-width="{STROKE}"/>',
            f'  <rect x="21" y="33" width="30" height="9" rx="4.5" fill="{MASS_HIGHLIGHT}"/>',
        ])),

        # An isometric cube: a hexagon with a lit top face. Sized from the
        # shipped icon's ink box (52 x 57 at 72) rather than by eye -- the first
        # render filled the frame and the second was a few pixels shy. Outlined by
        # the shrink technique, like the star: a stroke on a hexagon covered 26%
        # of the shape where the shipped icon's outline covers 34%.
        'items': svg('\n'.join([
            '  ' + polygon_sticker(
                [(36, 8), (61, 22.5), (61, 49.5), (36, 64), (11, 49.5), (11, 22.5)],
                ITEMS_FILL, 0.74),
            f'  <polygon points="36,9 59.5,22.9 36,36.8 12.5,22.9" fill="{ITEMS_TOP}"/>',
        ])),

        'level': svg('  ' + star_sticker(36, 36, 30.5, 13.1, GOLD)),

        # A trophy: a wide cup with a star, two C-shaped handles, a stem and a
        # base. The shipped icon's ink box is 64 wide, so the handles reach to
        # x=5..67; a narrower cup reads as a different object at card size.
        #
        # The handle control points are solved, not eyeballed. A cubic bezier does
        # NOT pass through its control points, and at t=0.5 with both controls at
        # c it sits at 0.125*(e0+e1) + 0.75*c. (Getting that endpoint coefficient
        # wrong as 0.25 put the left handle's bulge at x=2.5 -- a crescent off the
        # canvas edge -- and left the right handle barely past the cup.)
        'best': svg('\n'.join([
            f'  <path d="M22 16 C3.3 16 3.3 34 22 34" fill="none" stroke="{GOLD}"'
            f' stroke-width="6" stroke-linecap="round"/>',
            f'  <path d="M50 16 C68.7 16 68.7 34 50 34" fill="none" stroke="{GOLD}"'
            f' stroke-width="6" stroke-linecap="round"/>',
            f'  <path d="M20 11 h32 v13 a16 16 0 0 1 -32 0 z" fill="{GOLD}"'
            f' stroke="{OUTLINE}" stroke-width="{STROKE}" stroke-linejoin="round"/>',
            '  ' + star(36, 22, 10, 4.2, GOLD_LIGHT),
            f'  <rect x="33" y="39" width="6" height="13" fill="{GOLD}"/>',
            f'  <rect x="23" y="52" width="26" height="9" rx="3.5" fill="{GOLD}"'
            f' stroke="{OUTLINE}" stroke-width="{STROKE}"/>',
        ])),

        # The black hole disc: a purple ring around a near-black void with a swirl.
        'machine': svg('\n'.join([
            f'  <circle cx="36" cy="36" r="28" fill="{VOID_RING}"'
            f' stroke="{OUTLINE}" stroke-width="{STROKE}"/>',
            f'  <circle cx="36" cy="36" r="20" fill="{VOID}"/>',
            f'  <path d="M23 32 a14 14 0 0 1 26 0" fill="none" stroke="{VOID_ARC}"'
            f' stroke-width="4" stroke-linecap="round"/>',
        ])),
    }


def main():
    # An output directory argument exists so a new render can be compared against
    # the shipped PNGs before it replaces them. Overwriting accepted art and then
    # looking at the result is how a migration quietly becomes a redesign.
    png_dir = sys.argv[1] if len(sys.argv) > 1 else PNG_DIR
    os.makedirs(SVG_DIR, exist_ok=True)
    os.makedirs(png_dir, exist_ok=True)
    for name, markup in icons().items():
        svg_path = os.path.join(SVG_DIR, f'icon-stat-{name}.svg')
        with open(svg_path, 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(markup)
        png_path = os.path.join(png_dir, f'icon_stat_{name}.png')
        result = subprocess.run(
            ['node', os.path.join(ROOT, 'scripts', 'rasterize_svg.mjs'),
             svg_path, png_path, f'{SIZE}x{SIZE}'],
            cwd=ROOT, capture_output=True, text=True, shell=(os.name == 'nt'))
        if result.returncode != 0:
            print(result.stdout)
            print(result.stderr)
            return result.returncode
        print(result.stdout.strip())
    return 0


if __name__ == '__main__':
    sys.exit(main())
