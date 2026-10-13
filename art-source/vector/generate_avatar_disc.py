"""Author the black-hole disc avatar DESIGN_06 puts in every leaderboard row.

The reference's rows are four columns -- rank badge, hole avatar, name + 称号,
mass -- and this product's rows are three: badge, one text line, mass. The avatar
is the column that is missing, and it is what makes a row read as a competitor
rather than as a table entry.

Tint-neutral on purpose. The reference shows the same disc in seven different
colours (one per opponent), so the asset ships ONE greyscale-ish disc and each row
multiplies it by that competitor's own tint -- the same technique the five
settlement ribbons already use, where one `ribbon_settlement` asset renders green
or purple purely from the node's own Sprite colour.

That only works if the parts multiply the way the reference needs:

  * the RING and GLOW are white, so `white * tint` is exactly the tint;
  * the VOID is near-black `#0a0618`, so `void * tint` stays near-black
    (yellow `#e7a545` gives rgb(9,4,6)) -- the hole stays a hole under every tint.

Drawing it any other way round (dark ring, coloured disc) would need seven assets
and would make the row's colour a property of the file instead of the competitor.

Run: python art-source/vector/generate_avatar_disc.py
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(REPO, 'cocos', 'assets', 'game_art', 'ui', 'v95', 'avatar_blackhole.png')

# Displayed at 48 design px in the row; authored at 2x so it stays crisp.
SIZE = 96
SS = 4
S = SIZE * SS
C = S / 2.0

RING_OUTER = 38.0 / 96.0 * S
RING_INNER = 30.0 / 96.0 * S
VOID = 30.0 / 96.0 * S
GLOW = 45.0 / 96.0 * S

VOID_COLOUR = (10, 6, 24, 255)


def disc(radius):
    return (C - radius, C - radius, C + radius, C + radius)


def main():
    image = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    # Outer energy glow, blurred so the tint produces a soft halo rather than a
    # second hard ring.
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(disc(GLOW), fill=(255, 255, 255, 105))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=S * 0.045))
    image = Image.alpha_composite(image, glow)

    # The ring: a full disc, then the middle punched out. Drawing the annulus as
    # two passes rather than a stroked arc keeps the thickness even all the way
    # round, which a stroked ellipse does not guarantee at this size.
    ring = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ring)
    draw.ellipse(disc(RING_OUTER), fill=(255, 255, 255, 255))
    draw.ellipse(disc(RING_INNER), fill=(0, 0, 0, 0))
    image = Image.alpha_composite(image, ring)

    # The void, inset a hair inside the ring's inner edge so the ring keeps a
    # clean outer edge and the boundary reads as the event horizon.
    void = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(void).ellipse(disc(VOID - S * 0.005), fill=VOID_COLOUR)
    image = Image.alpha_composite(image, void)

    # Inner rim light on the void's upper-left wall. Multiplied by the row tint
    # this becomes the faint coloured sheen the reference avatars all carry, and
    # it is what stops the void reading as a flat black dot.
    sheen = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sheen).ellipse(
        (C - VOID * 0.72, C - VOID * 0.88, C + VOID * 0.18, C - VOID * 0.08),
        fill=(255, 255, 255, 70))
    sheen = sheen.filter(ImageFilter.GaussianBlur(radius=S * 0.03))
    # Clip the sheen to the void so it cannot brighten the ring.
    clip = Image.new('L', (S, S), 0)
    ImageDraw.Draw(clip).ellipse(disc(VOID), fill=255)
    sheen.putalpha(Image.composite(sheen.getchannel('A'), Image.new('L', (S, S), 0), clip))
    image = Image.alpha_composite(image, sheen)

    image = image.resize((SIZE, SIZE), Image.LANCZOS)
    image.save(OUT)

    # Report the multiplication the row tint will perform, so a future change to
    # the void colour can be checked against the yellow worst case instead of
    # rediscovering that a light void tints into a bright dot.
    pixel = image.load()
    centre = pixel[SIZE // 2, SIZE // 2]
    ring_pixel = pixel[SIZE // 2, int(SIZE / 2 - (RING_OUTER + RING_INNER) / 2 / SS)]
    print('wrote %s (%dx%d)' % (OUT, SIZE, SIZE))
    print('  void centre rgba=%s  ring rgba=%s' % (centre, ring_pixel))
    worst = tuple(round(channel * 0xA5 / 255) for channel in centre[:3])
    print('  void under the yellow tint #e7a545 -> rgb%s (must stay dark)' % (worst,))
    return 0


if __name__ == '__main__':
    sys.exit(main())
