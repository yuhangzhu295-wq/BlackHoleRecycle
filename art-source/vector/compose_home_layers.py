"""Compose the Home background and the entry-card art from the rendered pieces.

Both are **background/decoration art**, which the art direction explicitly allows
to be baked, so this composites them into single sprites instead of adding nodes
to a 52k-line scene. No node is added, moved or renamed, so no controller binding
is at risk.

- `field_home.png` is regenerated to carry the city band, so the hero sits on a
  world instead of floating on a gradient. The asset path and uuid do not change,
  so the scene needs no edit at all.
- The entry cards get `card_home_<entry>.png`: the vignette inside its white
  frame in the upper part, with clear space below it for the caption. The shipped
  cards were 160x112 boxes holding 340x220 landscape vignettes, so the art was
  cropped and the captions landed on top of it.

Run: python art-source/vector/compose_home_layers.py
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(REPO, 'cocos', 'assets', 'game_art', 'ui', 'v95')


def art(name):
    return Image.open(os.path.join(ART, name)).convert('RGBA')


def save(image, name):
    path = os.path.join(ART, name)
    image.save(path)
    print(f'{name:26} {image.size[0]}x{image.size[1]}  {os.path.getsize(path) // 1024} KB')


def compose_field():
    """Sky, then the city band across the lower middle.

    The band is placed so the hero's ground line falls inside it: the hero is
    drawn at design y ~-20 with a 430-unit width, so its base sits near y +100.
    """
    width, height = 720, 1280
    field = art('field_home.png').resize((width, height), Image.LANCZOS)
    band = art('home_city_band.png')

    # Scale the band to a little wider than the page so its edges leave frame,
    # which is what stops it reading as a pasted-on rectangle.
    target_w = 980
    ratio = target_w / band.width
    band = band.resize((target_w, max(1, round(band.height * ratio))), Image.LANCZOS)

    # Feather the band's top and bottom so it dissolves into the field instead of
    # ending on a hard line.
    mask = Image.new('L', band.size, 0)
    pen = ImageDraw.Draw(mask)
    feather = max(1, band.height // 6)
    for y in range(band.height):
        if y < feather:
            value = round(255 * y / feather)
        elif y > band.height - feather:
            value = round(255 * (band.height - y) / feather)
        else:
            value = 255
        pen.line([(0, y), (band.width, y)], fill=value)
    # Multiply, not composite: the band's own alpha has to be preserved.
    band.putalpha(ImageChops.multiply(band.getchannel('A'), mask))

    field.alpha_composite(band, ((width - target_w) // 2, 470))
    save(field, 'field_home.png')


def compose_cards():
    """Each entry card: the vignette inside its frame, caption space below.

    320x224 keeps the shipped card's 10:7 aspect, so the sprite is not stretched
    by the node's content size.
    """
    width, height = 320, 224
    art_h = 176                      # framed vignette occupies the top
    frame = art('frame_card.png')

    for entry in ('mode', 'machine', 'skin'):
        card = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        vignette = art(f'card_vignette_{entry}.png')
        ratio = art_h / vignette.height
        vignette = vignette.resize((max(1, round(vignette.width * ratio)), art_h), Image.LANCZOS)

        # Centre the vignette horizontally, then clip it to the frame's opening
        # so a wide vignette cannot spill past the border.
        inner_w = width - 34
        if vignette.width > inner_w:
            left = (vignette.width - inner_w) // 2
            vignette = vignette.crop((left, 0, left + inner_w, art_h))
        card.alpha_composite(vignette, ((width - vignette.width) // 2, 6))

        framed = frame.resize((width, art_h), Image.LANCZOS)
        card.alpha_composite(framed, (0, 0))
        save(card, f'card_home_{entry}.png')


def main():
    compose_field()
    compose_cards()


if __name__ == '__main__':
    main()
