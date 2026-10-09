"""Author the mode-card plinth that the adopted reference shows under each card.

`textures/home/mode_card_shelf.png` was a blank white capsule with a soft shadow
and no 9-slice borders. `ModeSelectPageController` hides both shelf nodes because
that placeholder read as two floating white bars, which the V6 brief forbids by
name ("empty sprite bar", "placeholder rectangle"). The reference
(`v2-02-mode-select.png`) puts a real 3D plinth under every card, and it is the
most distinctive structural element of that layout.

So the placeholder is replaced with real art at the same path: the scene's
spriteFrame reference keeps resolving, and the shelves can be shown again.

The shape is a light top face, a distinctly darker front face for the slab's
thickness, and a contact shadow under it. Drawn at 600x52 -- the authored node
size -- with 9-slice borders so a stretched card keeps square ends.

Run: python art-source/vector/generate_card_plinth.py
"""
import os

from PIL import Image, ImageDraw

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TARGET = os.path.join(REPO, 'cocos', 'assets', 'textures', 'home', 'mode_card_shelf.png')

W, H = 600, 52
SS = 4  # supersample, then downscale

TOP_FACE_HI = (238, 244, 252)
TOP_FACE_LO = (200, 213, 233)
FRONT_FACE_HI = (150, 168, 196)
FRONT_FACE_LO = (118, 138, 170)
OUTLINE = (74, 90, 120)
SHADOW = (38, 50, 76, 96)

END_RADIUS = 14
TOP_FACE_BOTTOM = 30
FRONT_FACE_BOTTOM = 48


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def main():
    w, h = W * SS, H * SS
    image = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    inset = 2 * SS
    # Contact shadow, offset down so the slab reads as sitting on the field.
    rounded(draw, (inset, 6 * SS, w - inset, h - 1 * SS), END_RADIUS * SS, SHADOW)

    # The slab itself: top face, then the darker front face below it.
    rounded(draw, (inset, 1 * SS, w - inset, TOP_FACE_BOTTOM * SS), END_RADIUS * SS, TOP_FACE_LO)
    rounded(draw, (inset, 1 * SS, w - inset, FRONT_FACE_BOTTOM * SS), END_RADIUS * SS, FRONT_FACE_LO)

    # Vertical ramps, clipped to each face by drawing into a mask.
    for box, top, bottom in (
        ((inset, 1 * SS, w - inset, TOP_FACE_BOTTOM * SS), TOP_FACE_HI, TOP_FACE_LO),
        ((inset, TOP_FACE_BOTTOM * SS, w - inset, FRONT_FACE_BOTTOM * SS), FRONT_FACE_HI, FRONT_FACE_LO),
    ):
        x0, y0, x1, y1 = box
        height = max(1, y1 - y0)
        band = Image.new('RGBA', (x1 - x0, height))
        band_draw = ImageDraw.Draw(band)
        for y in range(height):
            t = y / max(1, height - 1)
            colour = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
            band_draw.line([(0, y), (x1 - x0, y)], fill=colour)
        mask = Image.new('L', (x1 - x0, height), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, x1 - x0 - 1, height - 1),
            radius=END_RADIUS * SS if y1 == TOP_FACE_BOTTOM * SS else 0,
            fill=255)
        image.paste(band, (x0, y0), mask)

    # Re-clip the front face to the slab's rounded outline so it cannot square the ends.
    slab = Image.new('L', (w, h), 0)
    ImageDraw.Draw(slab).rounded_rectangle(
        (inset, 1 * SS, w - inset, FRONT_FACE_BOTTOM * SS), radius=END_RADIUS * SS, fill=255)
    image.putalpha(Image.composite(image.getchannel('A'), Image.new('L', (w, h), 0), slab))

    # Outline last, so it sits over both faces.
    draw.rounded_rectangle(
        (inset, 1 * SS, w - inset, FRONT_FACE_BOTTOM * SS),
        radius=END_RADIUS * SS, outline=OUTLINE, width=2 * SS)

    image = image.resize((W, H), Image.LANCZOS)
    image.save(TARGET)
    print(f'wrote {os.path.relpath(TARGET, REPO)} ({W}x{H})')


if __name__ == '__main__':
    main()
