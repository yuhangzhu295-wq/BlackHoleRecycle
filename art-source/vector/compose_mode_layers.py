"""Compose the ModeSelect page's cards and background onto the V9.5 language.

Two things the reference does that the shipped page does not:

- **Cards carry a thick white outer frame.** The shipped cards are a flat
  illustrated rectangle with no border, so they read as banners rather than as
  cards. The frame is drawn here as a rounded outline at the card's own
  coordinate scale rather than by scaling the 200x200 frame asset, because a
  9-slice border scales with the frame's own size: stretching that asset to 610
  wide would give a ~52 px border instead of the reference's ~14 px.
- **The field is the light sky with flat geometry**, not a bespoke background
  image, so the cards read as objects placed on it.

The cards' text stays in the artwork for now. Moving it to Labels is a separate
change: it needs eight new Label nodes and a controller that binds them, and the
art cannot be stripped of its text before those exist or the cards would lose
their mode names entirely.

Run: python art-source/vector/compose_mode_layers.py
"""
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_source import art_path  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(REPO, 'cocos', 'assets', 'game_art', 'ui', 'v95')
HOME_ART = os.path.join(REPO, 'cocos', 'assets', 'textures', 'home')

# Authored runtime size of the mode cards, from MODE_SELECT_LAYOUT.
CARD_W, CARD_H = 610, 278
FRAME_THICKNESS = 14
FRAME_RADIUS = 30
FRAME_INSET = 7


def open_art(path):
    return Image.open(path).convert('RGBA')


def save(image, name):
    path = os.path.join(ART, name)
    image.save(path)
    print(f'{name:28} {image.size[0]}x{image.size[1]}  {os.path.getsize(path) // 1024} KB')


def framed_card(source):
    """The shipped card art with the reference's white frame around it."""
    card = open_art(os.path.join(HOME_ART, source)).resize((CARD_W, CARD_H), Image.LANCZOS)

    # The frame is drawn on its own layer and scaled down from a supersampled
    # canvas, so the rounded corners and the outline are clean.
    scale = 4
    layer = Image.new('RGBA', (CARD_W * scale, CARD_H * scale), (0, 0, 0, 0))
    pen = ImageDraw.Draw(layer)
    inset = FRAME_INSET * scale
    pen.rounded_rectangle(
        [inset, inset, CARD_W * scale - inset, CARD_H * scale - inset],
        radius=FRAME_RADIUS * scale,
        outline=(255, 255, 255, 255),
        width=FRAME_THICKNESS * scale,
    )
    card.alpha_composite(layer.resize((CARD_W, CARD_H), Image.LANCZOS))
    return card


def main():
    save(framed_card('mode_arena_card.png'), 'mode_card_arena_framed.png')
    save(framed_card('mode_endless_card.png'), 'mode_card_endless_framed.png')

    field = open_art(art_path('field_home.png')).resize((720, 1280), Image.LANCZOS)
    save(field, 'field_mode.png')


if __name__ == '__main__':
    main()
