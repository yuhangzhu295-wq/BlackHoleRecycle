"""PHASE 4: mode-card illustrations -- a city block, not a flat plane.

The shipped cards already carry an illustration and real Labels (the text was
extracted from the bitmap in V12), so this is not a rebuild. What they show is
mostly flat ground with a road and a black hole; the adopted reference's cards
show a CITY BLOCK -- buildings with visible faces, a street between them, trees,
and the hole on the street.

DESIGN_04 also requires the two modes to share one visual language, so both cards
are the same scene drawn from one parameter set: the arena card is daylight, the
endless card is the same block at dusk. Two unrelated styles would be the thing
the brief forbids.

Isometric boxes rather than a rendered 3D view: the UI's established language is
flat vector (icons, avatar disc, brand plate), and a card is 610x278 -- a render
at that size would be soft while these stay crisp at any size.

Run: python scripts/author_mode_card_art.py [output-dir]
"""
import os
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SVG_DIR = os.path.join(ROOT, 'art-source', 'vector', 'ui')
CARD_W, CARD_H = 610, 278

# Daylight and dusk: one scene, two times of day. Both keep the same hue family so
# the two cards read as the same product.
THEMES = {
    'arena': {
        'sky_top': '#bfe9ff', 'sky_bottom': '#8fd4f5',
        'ground': '#7cc47f', 'ground_alt': '#6cb573', 'paving': '#b9c0cf',
        'road': '#8e97ad', 'road_edge': '#e8edf5', 'road_line': '#f2f5fa',
        'outline': '#1f2a44',
        'buildings': ('#f7b267', '#ffd18d', '#9ed6ff', '#e99085', '#f3b76d', '#72b9e6'),
        'tree': '#54a962', 'tree_light': '#69bf71',
        'void': '#0a0618', 'ring': '#9b5cff',
    },
    'endless': {
        'sky_top': '#3a2a63', 'sky_bottom': '#241a44',
        'ground': '#4a7a5c', 'ground_alt': '#3f6b50', 'paving': '#7d8496',
        'road': '#5b6178', 'road_edge': '#b9c3d8', 'road_line': '#cfd7e6',
        'outline': '#141026',
        'buildings': ('#c98a4e', '#d8b070', '#6f9fc4', '#b8706a', '#c99a58', '#5f93bb'),
        'tree': '#3d7d4a', 'tree_light': '#4d9159',
        'void': '#07040f', 'ring': '#b07cff',
    },
}


def iso_box(cx, base_y, width, depth, height, top, side, outline):
    """An isometric block: a top face and two side faces, from one footprint."""
    hw = width / 2.0
    hd = depth / 2.0
    top_face = (f'{cx},{base_y - height - hd} {cx + hw},{base_y - height} '
                f'{cx},{base_y - height + hd} {cx - hw},{base_y - height}')
    left_face = (f'{cx - hw},{base_y - height} {cx},{base_y - height + hd} '
                 f'{cx},{base_y + hd} {cx - hw},{base_y}')
    right_face = (f'{cx + hw},{base_y - height} {cx},{base_y - height + hd} '
                  f'{cx},{base_y + hd} {cx + hw},{base_y}')
    stroke = f' stroke="{outline}" stroke-width="2" stroke-linejoin="round"'
    return '\n'.join([
        f'  <polygon points="{left_face}" fill="{side}"{stroke}/>',
        f'  <polygon points="{right_face}" fill="{side}" opacity="0.82"{stroke}/>',
        f'  <polygon points="{top_face}" fill="{top}"{stroke}/>',
    ])


def shade(hex_color, factor):
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)
    return '#%02x%02x%02x' % (min(255, int(r * factor)), min(255, int(g * factor)),
                              min(255, int(b * factor)))


def tree(cx, base_y, size, dark, light, outline):
    return '\n'.join([
        f'  <rect x="{cx - 2.5}" y="{base_y - size * 0.5}" width="5" height="{size * 0.5}"'
        f' fill="#8a6a45" stroke="{outline}" stroke-width="1.6"/>',
        f'  <circle cx="{cx}" cy="{base_y - size * 0.62}" r="{size * 0.42}" fill="{dark}"'
        f' stroke="{outline}" stroke-width="2"/>',
        f'  <circle cx="{cx - size * 0.13}" cy="{base_y - size * 0.74}" r="{size * 0.24}"'
        f' fill="{light}" opacity="0.85"/>',
    ])


def card_svg(theme_name):
    t = THEMES[theme_name]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CARD_W}" height="{CARD_H}"'
        f' viewBox="0 0 {CARD_W} {CARD_H}">',
        '  <defs>',
        '    <linearGradient id="sky" gradientUnits="userSpaceOnUse"'
        f' x1="0" y1="0" x2="0" y2="{CARD_H}">',
        f'      <stop offset="0" stop-color="{t["sky_top"]}"/>',
        f'      <stop offset="1" stop-color="{t["sky_bottom"]}"/>',
        '    </linearGradient>',
        '    <clipPath id="card"><rect x="4" y="4" width="602" height="270" rx="26"/></clipPath>',
        # A scrim on the left, where the Labels sit. Without it the title lands on
        # a building face and the mode line lands on the hole: the first render of
        # this illustration was legible as a picture and unreadable as a card.
        '    <linearGradient id="scrim" gradientUnits="userSpaceOnUse"'
        ' x1="0" y1="0" x2="300" y2="0">',
        '      <stop offset="0" stop-color="#0d1428" stop-opacity="0.44"/>',
        '      <stop offset="0.62" stop-color="#0d1428" stop-opacity="0.20"/>',
        '      <stop offset="1" stop-color="#0d1428" stop-opacity="0"/>',
        '    </linearGradient>',
        '  </defs>',
        '  <g clip-path="url(#card)">',
        '    <rect width="610" height="278" fill="url(#sky)"/>',
        # Mostly paved, with green verges: the reference's block is a built-up
        # area, and a green field with towers on it reads as neither.
        f'    <rect y="86" width="610" height="192" fill="{t["ground_alt"]}"/>',
        f'    <rect y="86" width="610" height="192" fill="{t["paving"]}"/>',
        f'    <rect y="86" width="610" height="26" fill="{t["ground_alt"]}" opacity="0.75"/>',
        f'    <rect y="236" width="610" height="42" fill="{t["ground_alt"]}" opacity="0.75"/>',
        # The street, crossing the card on a slight diagonal, with kerbs.
        f'    <polygon points="0,178 610,138 610,206 0,246" fill="{t["road"]}"/>',
        f'    <polygon points="0,178 610,138 610,143 0,183" fill="{t["road_edge"]}" opacity="0.6"/>',
        f'    <polygon points="0,241 610,201 610,206 0,246" fill="{t["road_edge"]}" opacity="0.6"/>',
    ]
    for index in range(8):
        x = 16 + index * 76
        parts.append(f'    <polygon points="{x},{210} {x + 30},{205} {x + 30},{208} {x},{213}"'
                     f' fill="{t["road_line"]}" opacity="0.85"/>')
    parts.append('  </g>')
    parts.append('  <g clip-path="url(#card)">')

    # Two rows of SMALL blocks. The first pass used 74-96px towers, which read as
    # isolated towers on a lawn; a block is many small buildings, so these are
    # 34-64px and there are more of them.
    behind = [(226, 118, 46, 32, 56), (292, 112, 54, 34, 42), (358, 108, 44, 30, 62),
              (422, 104, 52, 34, 40), (488, 100, 46, 32, 54), (552, 96, 54, 34, 46)]
    for index, (cx, base, w, d, h) in enumerate(behind):
        colour = t['buildings'][index % len(t['buildings'])]
        parts.append(iso_box(cx, base, w, d, h, colour, shade(colour, 0.72), t['outline']))
    front = [(246, 268, 58, 38, 50), (372, 282, 62, 42, 58), (500, 290, 56, 38, 46)]
    for index, (cx, base, w, d, h) in enumerate(front):
        colour = t['buildings'][(index + 4) % len(t['buildings'])]
        parts.append(iso_box(cx, base, w, d, h, colour, shade(colour, 0.72), t['outline']))

    parts.append(tree(206, 172, 24, t['tree'], t['tree_light'], t['outline']))
    parts.append(tree(326, 158, 22, t['tree'], t['tree_light'], t['outline']))
    parts.append(tree(452, 148, 24, t['tree'], t['tree_light'], t['outline']))
    parts.append(tree(566, 140, 22, t['tree'], t['tree_light'], t['outline']))
    parts.append(tree(300, 240, 20, t['tree'], t['tree_light'], t['outline']))
    parts.append(tree(148, 232, 22, t['tree'], t['tree_light'], t['outline']))

    # The hole, big and on the street: a near-black void with a saturated ring,
    # the same two-part identity the gameplay and the avatar disc use. It is drawn
    # LAST so nothing can sit in front of it -- the first rebuild lost it entirely
    # to a bad edit and the card still looked plausible without it, which is
    # exactly why the render gets looked at rather than trusted.
    parts += [
        '    <ellipse cx="406" cy="196" rx="80" ry="37" fill="#000000" opacity="0.22"/>',
        f'    <ellipse cx="406" cy="188" rx="60" ry="28" fill="{t["ring"]}"'
        f' stroke="{t["outline"]}" stroke-width="4"/>',
        f'    <ellipse cx="406" cy="188" rx="39" ry="18" fill="{t["void"]}"/>',
        '    <ellipse cx="391" cy="180" rx="15" ry="6.5" fill="#ffffff" opacity="0.12"/>',
    ]
    parts += [
        '    <rect width="320" height="278" fill="url(#scrim)"/>',
        '  </g>',
        '  <rect x="4" y="4" width="602" height="270" rx="26" fill="none"'
        ' stroke="#ffffff" stroke-width="8"/>',
        '</svg>',
        '',
    ]
    return '\n'.join(parts)


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        ROOT, 'cocos', 'assets', 'game_art', 'ui', 'v95')
    os.makedirs(SVG_DIR, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    for name in THEMES:
        svg_path = os.path.join(SVG_DIR, f'mode-card-{name}.svg')
        with open(svg_path, 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(card_svg(name))
        png_path = os.path.join(out_dir, f'mode_card_{name}_framed.png')
        result = subprocess.run(
            ['node', os.path.join(ROOT, 'scripts', 'rasterize_svg.mjs'),
             svg_path, png_path, f'{CARD_W}x{CARD_H}'],
            cwd=ROOT, capture_output=True, text=True, shell=(os.name == 'nt'))
        if result.returncode != 0:
            print(result.stdout)
            print(result.stderr)
            return result.returncode
        print(result.stdout.strip())
    return 0


if __name__ == '__main__':
    sys.exit(main())
