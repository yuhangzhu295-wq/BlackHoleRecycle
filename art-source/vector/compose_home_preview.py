"""Compose the 390x844 Home page preview from the new art.

This is a **design preview**, not the game page. The shipped page is built in
Creator from these same assets with real Labels and real data bindings; this
image exists so the composition can be judged against the adopted reference
before anything is wired, and so a later runtime screenshot has something to be
compared with.

Text here is drawn with a real font for preview purposes only. Nothing in any
delivered asset bakes text, a coin count, a level or a button state.

Run: python art-source/vector/compose_home_preview.py
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from palette import GOLD_LIGHT, NAVY_DEEP, WHITE, rgb  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(REPO, 'cocos', 'assets', 'game_art', 'ui', 'v95')
OUT = os.path.join(REPO, 'art-source', 'preview')

# 390x844 is the acceptance viewport; the design space is 720x1280, so every
# design coordinate is scaled by 390/720.
PAGE_W, PAGE_H = 390, 844
SCALE = PAGE_W / 720.0

FONT_CANDIDATES = [
    'C:/Windows/Fonts/msyhbd.ttc',
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/simhei.ttf',
]


def font(size):
    for candidate in FONT_CANDIDATES:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    raise SystemExit('no CJK font found; cannot render a preview with real type')


def art(name):
    return Image.open(os.path.join(ART, name)).convert('RGBA')


def place_at(page, image, design_x, design_y, design_w=None, anchor='center'):
    """Place an asset given in design coordinates, scaled to the page."""
    if design_w is not None:
        target_w = max(1, round(design_w * SCALE))
        ratio = target_w / image.width
        image = image.resize((target_w, max(1, round(image.height * ratio))), Image.LANCZOS)
    x = round(PAGE_W / 2 + design_x * SCALE)
    y = round(PAGE_H / 2 + design_y * SCALE)
    if anchor == 'center':
        x -= image.width // 2
        y -= image.height // 2
    page.alpha_composite(image, (x, y))


def label(page, text, design_x, design_y, size, fill, outline=None, outline_w=0, anchor='mm'):
    draw = ImageDraw.Draw(page)
    font_obj = font(max(8, round(size * SCALE * 1.35)))
    at = (round(PAGE_W / 2 + design_x * SCALE), round(PAGE_H / 2 + design_y * SCALE))
    draw.text(at, text, font=font_obj, fill=rgb(fill) + (255,), anchor=anchor,
              stroke_width=max(1, round(outline_w * SCALE)) if outline_w else 0,
              stroke_fill=rgb(outline) + (255,) if outline else None)


def capsule_width_for(text, design_size):
    """A capsule has to be wider than its label; measure rather than guess."""
    font_obj = font(max(8, round(design_size * SCALE * 1.35)))
    return max(240, font_obj.getlength(text) / SCALE + 150)


def main():
    """Compose the page in design coordinates: 720x1280 centred on (0, 0)."""
    os.makedirs(OUT, exist_ok=True)
    page = art('field_home.png').resize((PAGE_W, PAGE_H), Image.LANCZOS)

    # World band and hero.
    place_at(page, art('home_city_band.png'), 0, 150, design_w=980)
    place_at(page, art('home_hero_blackhole.png'), 0, -20, design_w=430)

    # Top bar: framed values, per the art direction's "every value is framed".
    place_at(page, art('pill_dark.png'), -206, -520, design_w=210)
    place_at(page, art('pill_dark.png'), 206, -520, design_w=210)
    label(page, '金币', -270, -520, 26, WHITE, NAVY_DEEP, 2)
    label(page, '0', -140, -520, 30, WHITE, NAVY_DEEP, 2)
    label(page, '等级', 148, -520, 26, WHITE, NAVY_DEEP, 2)
    label(page, 'LV.1', 268, -520, 30, WHITE, NAVY_DEEP, 2)

    # Brand block: plate, planet glyph, sparkles, title as real type.
    place_at(page, art('plate_brand.png'), 0, -370, design_w=470)
    place_at(page, art('glyph_planet.png'), 196, -372, design_w=88)
    for dx, dy, dw in ((-206, -428, 46), (238, -316, 34), (-150, -330, 28)):
        place_at(page, art('sparkle.png'), dx, dy, design_w=dw)
    label(page, '黑洞回收站', -20, -370, 60, GOLD_LIGHT, NAVY_DEEP, 5)

    # Primary action: the yellow capsule, sized to its label.
    caption = '开始吞噬'
    width = capsule_width_for(caption, 44)
    place_at(page, art('capsule_yellow.png'), 0, 300, design_w=width)
    place_at(page, art('chevron_disc.png'), width / 2 - 82, 300, design_w=60)
    label(page, caption, -30, 300, 44, '#ffffff', '#58351a', 3)

    # Three entry cards: white frame + illustrated interior + caption.
    for index, (name, vignette) in enumerate([
            ('模式', 'card_vignette_mode.png'), ('机器', 'card_vignette_machine.png'),
            ('皮肤', 'card_vignette_skin.png')]):
        cx = (index - 1) * 208
        place_at(page, art(vignette), cx, 470, design_w=188)
        place_at(page, art('frame_card.png'), cx, 470, design_w=200)
        label(page, name, cx, 552, 30, WHITE, NAVY_DEEP, 3)

    out = os.path.join(OUT, 'home-preview-390x844.png')
    page.convert('RGB').save(out)
    print(f'wrote {os.path.relpath(out, REPO)}')


if __name__ == '__main__':
    main()
