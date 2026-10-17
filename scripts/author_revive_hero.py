"""PHASE A: the revive page's hero becomes a scene, not a sticker.

The page's contract pins `ReviveCard` at 620x900 and the functional nodes; it does
not pin `ReviveBlackHoleHero`. That node is 246x246, so the card's whole upper half
is a small square illustration floating on flat cream -- the "big single-colour
panel with a small black-hole picture" the brief names as the thing to stop doing.

This authors a 560x190 street scene in the same isometric language as the mode
cards: a city block, the attacker's hole large, the player's hole small and being
pulled toward it. The numbers stay in the Labels (real attacker name and both
masses); the picture carries the situation.

It writes the SAME path as the shipped asset, so the spriteFrame uuid and every
scene reference are untouched -- the only scene change needed is the node's size.

Run: python scripts/author_revive_hero.py [output-dir]
"""
import os
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, os.path.join(ROOT, 'scripts'))

from author_mode_card_art import iso_box, shade, tree  # noqa: E402

SVG_DIR = os.path.join(ROOT, 'art-source', 'vector', 'ui')
W, H = 560, 200

# The same daylight palette the arena card uses, so the three UI surfaces that
# show a city (both mode cards and this hero) are one family.
T = {
    'sky': '#bfe9ff',
    'ground': '#7cc47f', 'ground_alt': '#6cb573', 'paving': '#b9c0cf',
    'road': '#8e97ad', 'road_edge': '#e8edf5', 'road_line': '#f2f5fa',
    'outline': '#1f2a44',
    'buildings': ('#f7b267', '#ffd18d', '#9ed6ff', '#e99085', '#f3b76d', '#72b9e6'),
    'tree': '#54a962', 'tree_light': '#69bf71',
    'void': '#0a0618', 'ring': '#9b5cff', 'danger': '#f07171',
}


def svg():
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"'
        f' viewBox="0 0 {W} {H}">',
        '  <defs>',
        '    <clipPath id="hero"><rect width="560" height="200" rx="24"/></clipPath>',
        '  </defs>',
        '  <g clip-path="url(#hero)">',
        f'    <rect width="560" height="200" fill="{T["sky"]}"/>',
        f'    <rect y="52" width="560" height="148" fill="{T["paving"]}"/>',
        f'    <rect y="52" width="560" height="20" fill="{T["ground_alt"]}" opacity="0.8"/>',
        # The street runs across the frame, slightly diagonal like the cards.
        f'    <polygon points="0,120 560,96 560,152 0,176" fill="{T["road"]}"/>',
        f'    <polygon points="0,120 560,96 560,100 0,124" fill="{T["road_edge"]}" opacity="0.6"/>',
        f'    <polygon points="0,172 560,148 560,152 0,176" fill="{T["road_edge"]}" opacity="0.6"/>',
    ]
    for index in range(6):
        x = 18 + index * 96
        parts.append(f'    <polygon points="{x},{140} {x + 40},{137} {x + 40},{140} {x},{143}"'
                     f' fill="{T["road_line"]}" opacity="0.8"/>')

    behind = [(46, 104, 54, 34, 46), (124, 98, 44, 30, 62), (196, 94, 56, 36, 40),
              (352, 92, 52, 34, 58), (430, 88, 46, 32, 44), (506, 86, 54, 34, 54)]
    for index, (cx, base, w, d, h) in enumerate(behind):
        colour = T['buildings'][index % len(T['buildings'])]
        parts.append(iso_box(cx, base, w, d, h, colour, shade(colour, 0.72), T['outline']))
    front = [(92, 214, 58, 40, 54), (240, 226, 62, 42, 46), (398, 232, 56, 38, 50)]
    for index, (cx, base, w, d, h) in enumerate(front):
        colour = T['buildings'][(index + 3) % len(T['buildings'])]
        parts.append(iso_box(cx, base, w, d, h, colour, shade(colour, 0.72), T['outline']))

    parts.append(tree(30, 132, 24, T['tree'], T['tree_light'], T['outline']))
    parts.append(tree(300, 122, 20, T['tree'], T['tree_light'], T['outline']))
    parts.append(tree(474, 112, 22, T['tree'], T['tree_light'], T['outline']))

    # The situation: the attacker's hole large on the street, the player's small and
    # being drawn toward it, with a short trail. Sizes read the mass gap without
    # needing to parse the numbers, which stay in the Labels.
    parts += [
        '    <ellipse cx="330" cy="142" rx="76" ry="34" fill="#000000" opacity="0.20"/>',
        f'    <ellipse cx="330" cy="134" rx="58" ry="26" fill="{T["danger"]}"'
        f' stroke="{T["outline"]}" stroke-width="3.5"/>',
        f'    <ellipse cx="330" cy="134" rx="38" ry="16" fill="{T["void"]}"/>',
        # The pull trail from the player toward the attacker.
        f'    <path d="M196 150 Q236 142 268 138" fill="none" stroke="{T["ring"]}"'
        ' stroke-width="5" stroke-linecap="round" opacity="0.75"/>',
        '    <ellipse cx="182" cy="152" rx="30" ry="14" fill="#000000" opacity="0.16"/>',
        f'    <ellipse cx="182" cy="148" rx="24" ry="11" fill="{T["ring"]}"'
        f' stroke="{T["outline"]}" stroke-width="3"/>',
        f'    <ellipse cx="182" cy="148" rx="14" ry="6.5" fill="{T["void"]}"/>',
    ]
    parts += [
        '  </g>',
        '  <rect x="1.5" y="1.5" width="557" height="197" rx="23" fill="none"'
        ' stroke="#ffffff" stroke-width="3" opacity="0.9"/>',
        '</svg>',
        '',
    ]
    return '\n'.join(parts)


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        ROOT, 'cocos', 'assets', 'game_art', 'ui', 'v95')
    os.makedirs(SVG_DIR, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    svg_path = os.path.join(SVG_DIR, 'revive-hero.svg')
    with open(svg_path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(svg())
    png_path = os.path.join(out_dir, 'revive_hero_absorbing.png')
    result = subprocess.run(
        ['node', os.path.join(ROOT, 'scripts', 'rasterize_svg.mjs'),
         svg_path, png_path, f'{W}x{H}'],
        cwd=ROOT, capture_output=True, text=True, shell=(os.name == 'nt'))
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        return result.returncode
    print(result.stdout.strip())
    return 0


if __name__ == '__main__':
    sys.exit(main())
