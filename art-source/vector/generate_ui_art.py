"""Generate the V9.5 UI art: fields, plates, capsules, pills, frames and glyphs.

Sources of truth
----------------
Colours are **sampled from the adopted reference renders** (see `palette.py`), not
chosen by eye. `cocos/docs/design-reference/UI_ART_DIRECTION_CANONICAL.md` names
the references.

Editable source, not opaque binaries
-----------------------------------
Every asset is a few lines of shape and colour here, so changing one is a code
change that shows up in a diff rather than a binary swap. The PNGs are build
output; this file is the source. **Nothing here is text**: labels, values and
button states stay in Creator so they remain editable and localisable.

Lighting is gradient-through-mask (`shading.py`). The first pass used hard-edged
rounded bars for the capsule highlight and shade, which read on review as extra
UI elements stacked on the capsule rather than as light and shade.

Run: python art-source/vector/generate_ui_art.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

from palette import (
    BADGE_BLUE, BADGE_BLUE_EDGE, BADGE_GOLD, BADGE_GOLD_EDGE, BADGE_PURPLE,
    BOARD_CYAN, BOARD_PANEL, BROWN_LABEL, GOLD, GOLD_LIGHT, NAVY_DEEP, NAVY_LIFT,
    NAVY_PLATE, PLANET, PLANET_LIGHT, PURPLE, PURPLE_DEEP, PURPLE_HI,
    PURPLE_RIBBON, REWARD_EDGE, REWARD_GOLD, ROW_LOCAL, SS, SKY_BOTTOM, SKY_MID,
    SKY_TOP, WHITE, YELLOW, YELLOW_EDGE, YELLOW_HI, rgb, rgba,
)
from shading import light_shape

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(REPO, 'cocos', 'assets', 'game_art', 'ui', 'v95')


def canvas(width, height):
    return Image.new('RGBA', (width * SS, height * SS), (0, 0, 0, 0))


def save(image, name, width, height):
    path = os.path.join(OUT, name)
    image.resize((width, height), Image.LANCZOS).save(path)
    print(f'{name:26} {width}x{height}  {os.path.getsize(path) // 1024} KB')


def rounded(draw, box, radius, fill=None, outline=None, width=0):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def capsule_box(width, height, inset=0):
    return (inset * SS, inset * SS, (width - inset) * SS, (height - inset) * SS)


def capsule_radius(width, height, inset=0):
    return min(width - 2 * inset, height - 2 * inset) * SS // 2


# --- field -------------------------------------------------------------------
def build_field_home():
    """Sky field with large flat geometric shapes at low contrast.

    The reference field is light and quiet so framed objects read against it, but
    its shapes are clearly *visible* flat geometry -- the first pass drew them at
    4% white and they vanished. These sit at roughly 8-11%, which reads as
    structure without competing with a card.
    """
    width, height = 720, 1280
    image = Image.new('RGBA', (width * SS, height * SS))
    draw = ImageDraw.Draw(image)
    stops = [(0.00, SKY_TOP), (0.26, SKY_MID), (0.60, SKY_MID), (1.00, SKY_BOTTOM)]
    for y in range(height * SS):
        t = y / (height * SS - 1)
        lower, upper = stops[0], stops[-1]
        for index in range(len(stops) - 1):
            if stops[index][0] <= t <= stops[index + 1][0]:
                lower, upper = stops[index], stops[index + 1]
                break
        span = max(1e-6, upper[0] - lower[0])
        local = min(1.0, max(0.0, (t - lower[0]) / span))
        a, b = rgb(lower[1]), rgb(upper[1])
        draw.line([(0, y), (width * SS, y)],
                  fill=tuple(round(a[i] + (b[i] - a[i]) * local) for i in range(3)) + (255,))

    overlay = Image.new('RGBA', image.size, (0, 0, 0, 0))
    pen = ImageDraw.Draw(overlay)
    for alpha in (26, 20):
        pen.rectangle([0, 0, width * SS, height * SS], outline=None)
        break

    # Chevrons: two thick diagonal bands, echoing the reference's arrow shapes.
    for base_y, scale, alpha in ((170, 1.0, 30), (1010, 1.3, 24)):
        for direction in (-1, 1):
            for offset in (0, 210):
                x = width * SS * 0.5 + direction * (70 + offset) * SS * scale
                pen.line([(x, base_y * SS), (x + direction * 40 * SS * scale, (base_y + 300 * scale) * SS)],
                         fill=rgba(WHITE, alpha), width=int(52 * SS * scale))

    # Soft diamonds.
    for (cx, cy, size, alpha) in ((112, 340, 140, 26), (626, 246, 104, 22),
                                  (556, 742, 158, 24), (146, 1112, 118, 22)):
        pen.polygon([(cx * SS, (cy - size) * SS), ((cx + size) * SS, cy * SS),
                     (cx * SS, (cy + size) * SS), ((cx - size) * SS, cy * SS)],
                    fill=rgba(WHITE, alpha))

    # A few crisp dots for scale.
    for (cx, cy, radius, alpha) in ((648, 1108, 20, 70), (76, 706, 15, 60), (356, 118, 13, 60)):
        pen.ellipse([(cx - radius) * SS, (cy - radius) * SS,
                     (cx + radius) * SS, (cy + radius) * SS], fill=rgba(WHITE, alpha))

    save(Image.alpha_composite(image, overlay), 'field_home.png', width, height)


# --- plates, capsules, pills, frames ----------------------------------------
def build_plate_brand():
    """Deep navy plate behind the brand line, lifted at the top and rimmed in gold.

    The brand *text* is not in this image: it is a Creator Label so it stays
    editable and localisable. This is only the plate it sits on.
    """
    width, height = 520, 104
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)
    # Radius 26, not the half-height: at 38 this read as a capsule, and the
    # reference's brand plate is a plate.
    rounded(draw, capsule_box(width, height, 4), 30 * SS, fill=rgba(GOLD, 255))
    rounded(draw, capsule_box(width, height, 9), 26 * SS, fill=rgba(NAVY_PLATE, 255))
    image = light_shape(image, capsule_box(width, height, 13), 23 * SS, [
        (0.00, NAVY_LIFT, 150), (0.34, NAVY_LIFT, 40), (0.40, NAVY_PLATE, 0), (1.00, NAVY_PLATE, 0),
    ])
    save(image, 'plate_brand.png', width, height)


def build_capsule(name, fill, edge, highlight, outline):
    """The product's primary/secondary action shape.

    White outline, a highlight along the top edge and a shade along the bottom,
    both as gradients clipped to the inner capsule. Drawn as a capsule so the
    ends stay fully round at any width, and sliced horizontally: the left/right
    border is half the height, which keeps the ends circular while the middle
    stretches.
    """
    width, height = 240, 104
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)
    rounded(draw, capsule_box(width, height, 5), capsule_radius(width, height, 5), fill=rgba(WHITE, 255))
    rounded(draw, capsule_box(width, height, 9), capsule_radius(width, height, 9), fill=rgba(edge, 255))
    rounded(draw, capsule_box(width, height, 13), capsule_radius(width, height, 13), fill=rgba(fill, 255))

    inner = capsule_box(width, height, 15)
    inner_radius = capsule_radius(width, height, 15)
    image = light_shape(image, inner, inner_radius, [
        (0.00, highlight, 205), (0.16, highlight, 150), (0.34, highlight, 0),
        (0.62, outline, 0), (0.90, outline, 52), (1.00, outline, 78),
    ])
    save(image, name, width, height)


def build_pill_dark():
    """Dark translucent pill for a framed status value."""
    width, height = 260, 72
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)
    rounded(draw, capsule_box(width, height, 4), capsule_radius(width, height, 4),
            fill=rgba(NAVY_PLATE, 198))
    rounded(draw, capsule_box(width, height, 4), capsule_radius(width, height, 4),
            outline=rgba(WHITE, 158), width=3 * SS)
    image = light_shape(image, capsule_box(width, height, 6), capsule_radius(width, height, 6), [
        (0.00, WHITE, 40), (0.30, WHITE, 10), (0.42, NAVY_PLATE, 0), (1.00, NAVY_PLATE, 0),
    ])
    save(image, 'pill_dark.png', width, height)


def build_frame_card():
    """Thick white outer frame for an illustrated card interior.

    Sliced on all four sides so the frame keeps its corner radius and thickness
    while the opening stretches to whatever the card needs. The opening is left
    fully transparent so the illustrated interior shows through it.
    """
    width, height = 200, 200
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)
    rounded(draw, capsule_box(width, height, 4), 34 * SS, fill=rgba(WHITE, 255))
    rounded(draw, capsule_box(width, height, 17), 22 * SS, fill=(0, 0, 0, 0))
    save(image, 'frame_card.png', width, height)


# --- settlement surfaces -----------------------------------------------------
def build_board_settlement():
    """The settlement board body: cyan shell with a near-white inner panel.

    `ui-v5-final/design-lock.md` calls this board "cream"; the adopted render
    shows light blue with a white inner panel, and the image wins.
    """
    width, height = 660, 1120
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)
    rounded(draw, capsule_box(width, height, 6), 46 * SS, fill=rgba(BOARD_CYAN, 255))
    rounded(draw, capsule_box(width, height, 16), 38 * SS, fill=rgba(BOARD_PANEL, 255))
    image = light_shape(image, capsule_box(width, height, 6), 46 * SS, [
        (0.00, WHITE, 60), (0.10, WHITE, 0), (0.88, NAVY_DEEP, 0), (1.00, NAVY_DEEP, 34),
    ])
    save(image, 'board_settlement.png', width, height)


def build_ribbon_settlement():
    """Purple banner that overlaps the board's top edge, gold-rimmed.

    Built as a rounded body plus two folded tails rather than one notched
    polygon: the polygon version rendered as a rectangle with a triangle hanging
    off its bottom, because the point order produced a tab instead of the
    swallowtails the reference shows.

    The title text is not baked: it is a Creator Label on top of this.
    """
    width, height = 560, 168
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)

    body = (16 * SS, 8 * SS, (width - 16) * SS, (height - 58) * SS)
    tail_left = [(24 * SS, (height - 58) * SS), (104 * SS, (height - 58) * SS),
                 (24 * SS, (height - 6) * SS)]
    tail_right = [((width - 24) * SS, (height - 58) * SS), ((width - 104) * SS, (height - 58) * SS),
                  ((width - 24) * SS, (height - 6) * SS)]
    for tail in (tail_left, tail_right):
        draw.polygon([(x, y) for x, y in tail], fill=rgba(PURPLE_DEEP, 255))

    rounded(draw, (10 * SS, 2 * SS, (width - 10) * SS, (height - 52) * SS), 30 * SS,
            fill=rgba(GOLD, 255))
    rounded(draw, (16 * SS, 8 * SS, (width - 16) * SS, (height - 58) * SS), 25 * SS,
            fill=rgba(PURPLE_RIBBON, 255))
    image = light_shape(image, (20 * SS, 12 * SS, (width - 20) * SS, (height - 60) * SS), 22 * SS, [
        (0.00, '#c07bea', 180), (0.26, '#c07bea', 40), (0.40, PURPLE_RIBBON, 0), (1.00, PURPLE_DEEP, 80),
    ])
    save(image, 'ribbon_settlement.png', width, height)


def build_panel_white():
    """Near-white inner panel used for stat cards and leaderboard rows."""
    width, height = 200, 120
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)
    rounded(draw, capsule_box(width, height, 3), 22 * SS, fill=rgba(WHITE, 255))
    rounded(draw, capsule_box(width, height, 3), 22 * SS, outline=rgba(BOARD_CYAN, 190), width=3 * SS)
    save(image, 'panel_white.png', width, height)


def build_panel_local_row():
    """The highlighted row for the local player."""
    width, height = 200, 120
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)
    rounded(draw, capsule_box(width, height, 3), 22 * SS, fill=rgba(ROW_LOCAL, 255))
    rounded(draw, capsule_box(width, height, 3), 22 * SS, outline=rgba('#4fbe63', 210), width=4 * SS)
    save(image, 'panel_local_row.png', width, height)


def build_reward_bar():
    """Gold bar carrying the coin reward."""
    width, height = 520, 110
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)
    rounded(draw, capsule_box(width, height, 4), 32 * SS, fill=rgba(REWARD_EDGE, 255))
    rounded(draw, capsule_box(width, height, 9), 27 * SS, fill=rgba(REWARD_GOLD, 255))
    image = light_shape(image, capsule_box(width, height, 12), 24 * SS, [
        (0.00, WHITE, 120), (0.30, WHITE, 20), (0.45, REWARD_GOLD, 0), (1.00, REWARD_EDGE, 60),
    ])
    save(image, 'reward_bar.png', width, height)


def build_badge(name, fill, edge):
    """A rank badge: a rounded square in the rank's own colour."""
    size = 96
    image = canvas(size, size)
    draw = ImageDraw.Draw(image)
    rounded(draw, capsule_box(size, size, 5), 24 * SS, fill=rgba(edge, 255))
    rounded(draw, capsule_box(size, size, 10), 19 * SS, fill=rgba(fill, 255))
    image = light_shape(image, capsule_box(size, size, 12), 17 * SS, [
        (0.00, WHITE, 110), (0.34, WHITE, 0), (1.00, edge, 46),
    ])
    save(image, name, size, size)


def build_board_endless():
    """A second board variant: the endless settlement is not an arena match.

    §7 of the art direction requires per-surface variants rather than forcing
    every page onto one plate; the endless board drops the arena cyan for the
    field's own blue so it does not imply a ranking it does not have.
    """
    width, height = 660, 1120
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)
    rounded(draw, capsule_box(width, height, 6), 46 * SS, fill=rgba('#2f9fe0', 255))
    rounded(draw, capsule_box(width, height, 16), 38 * SS, fill=rgba('#eaf7ff', 255))
    image = light_shape(image, capsule_box(width, height, 6), 46 * SS, [
        (0.00, WHITE, 60), (0.10, WHITE, 0), (0.88, NAVY_DEEP, 0), (1.00, NAVY_DEEP, 34),
    ])
    save(image, 'board_endless.png', width, height)


# --- glyphs ------------------------------------------------------------------
def build_glyph_planet():
    """The ringed planet that marks the brand block."""
    size = 160
    image = canvas(size, size)
    draw = ImageDraw.Draw(image)
    cx = cy = size * SS / 2
    ring = [cx - 68 * SS, cy - 22 * SS, cx + 68 * SS, cy + 22 * SS]
    draw.ellipse(ring, outline=rgba(GOLD, 255), width=10 * SS)
    draw.ellipse([cx - 35 * SS, cy - 35 * SS, cx + 35 * SS, cy + 35 * SS],
                 fill=rgba(PLANET, 255), outline=rgba(NAVY_DEEP, 255), width=5 * SS)
    draw.ellipse([cx - 25 * SS, cy - 27 * SS, cx + 5 * SS, cy + 1 * SS], fill=rgba(PLANET_LIGHT, 225))
    draw.arc(ring, start=8, end=172, fill=rgba(GOLD_LIGHT, 255), width=10 * SS)
    save(image, 'glyph_planet.png', size, size)


def build_sparkle():
    """A four-point sparkle, used as a low-cost accent around display type."""
    size = 96
    image = canvas(size, size)
    draw = ImageDraw.Draw(image)
    cx = cy = size * SS / 2
    points = []
    for index in range(8):
        angle = math.pi / 4 * index - math.pi / 2
        radius = (44 if index % 2 == 0 else 9) * SS
        points.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    draw.polygon(points, fill=rgba(GOLD_LIGHT, 255))
    draw.polygon([(p[0] * 0.55 + cx * 0.45, p[1] * 0.55 + cy * 0.45) for p in points],
                 fill=rgba(WHITE, 255))
    save(image, 'sparkle.png', size, size)


def build_chevron_disc():
    """The trailing glyph on a primary capsule: a disc with a play chevron."""
    size = 88
    image = canvas(size, size)
    draw = ImageDraw.Draw(image)
    cx = cy = size * SS / 2
    draw.ellipse([cx - 38 * SS, cy - 38 * SS, cx + 38 * SS, cy + 38 * SS],
                 fill=rgba(WHITE, 255), outline=rgba(NAVY_DEEP, 120), width=3 * SS)
    draw.polygon([(cx - 12 * SS, cy - 19 * SS), (cx + 19 * SS, cy), (cx - 12 * SS, cy + 19 * SS)],
                 fill=rgba(NAVY_DEEP, 255))
    save(image, 'chevron_disc.png', size, size)


def build_soft_shadow():
    """A reusable soft ellipse shadow for objects that sit on the field."""
    width, height = 256, 96
    image = Image.new('RGBA', (width * SS, height * SS), (0, 0, 0, 0))
    ImageDraw.Draw(image).ellipse(
        [10 * SS, 10 * SS, (width - 10) * SS, (height - 10) * SS], fill=rgba(NAVY_DEEP, 120))
    save(image.filter(ImageFilter.GaussianBlur(9 * SS)), 'shadow_soft.png', width, height)


def main():
    os.makedirs(OUT, exist_ok=True)
    build_field_home()
    build_plate_brand()
    build_capsule('capsule_yellow.png', YELLOW, YELLOW_EDGE, YELLOW_HI, BROWN_LABEL)
    build_capsule('capsule_purple.png', PURPLE, PURPLE_RIBBON, PURPLE_HI, PURPLE_DEEP)
    build_pill_dark()
    build_frame_card()
    build_board_settlement()
    build_board_endless()
    build_ribbon_settlement()
    build_panel_white()
    build_panel_local_row()
    build_reward_bar()
    build_badge('badge_gold.png', BADGE_GOLD, BADGE_GOLD_EDGE)
    build_badge('badge_blue.png', BADGE_BLUE, BADGE_BLUE_EDGE)
    build_badge('badge_purple.png', BADGE_PURPLE, PURPLE_DEEP)
    build_glyph_planet()
    build_sparkle()
    build_chevron_disc()
    build_soft_shadow()
    print(f'\nwrote to {os.path.relpath(OUT, REPO)}')


if __name__ == '__main__':
    main()
