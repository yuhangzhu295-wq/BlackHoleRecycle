"""Generate the authored UI prefab textures (V7 PHASE 6/7).

Original, deterministic raster art for the three surfaces that used to be drawn
with `cc.Graphics` at runtime, plus the 9-slice panel/bar/button/popup frames the
reusable prefab library is built from:

  textures/map_preview_city.png    560x260  Mode Ready "Endless" map thumbnail
  textures/map_preview_arena.png   560x260  Mode Ready "Arena" map thumbnail
  textures/joystick_base.png       196x196  virtual-joystick base plate
  textures/joystick_knob.png        76x76   virtual-joystick knob
  textures/ui_panel_9slice.png     128x128  9-slice rounded panel   (border 34)
  textures/ui_card_9slice.png      160x160  9-slice card frame      (border 44)
  textures/ui_button_9slice.png    192x128  9-slice gold CTA        (border 48)
  textures/ui_popup_9slice.png     128x128  9-slice banner panel    (border 36)
  textures/ui_hud_bar_9slice.png   128x64   9-slice stat/hud bar    (border 30)

Output: cocos/assets/game_art/ui/textures/

Everything is drawn at SS x supersample and downscaled with LANCZOS so the
strokes are anti-aliased; Cocos imports each PNG as an ImageAsset with a
Texture2D and a SpriteFrame sub-asset. Creator assigns the uuids on import;
`scripts/v7_phase6_ui_prefabs.mjs` reads them back.

The two map previews intentionally mirror the locked design references
(design-reference/ui-v4-expanded/06-endless-ready.png and 07-arena-ready.png):
a framed low-poly city block for Endless, and a dashed-ring arena with four
rival cores for Arena.
"""
from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "cocos" / "assets" / "game_art" / "ui" / "textures"
SS = 4  # supersample factor

INK = (16, 24, 39, 255)


def canvas(width, height, color=(0, 0, 0, 0)):
    return Image.new("RGBA", (width * SS, height * SS), color)


def save(name, image, width, height):
    OUT.mkdir(parents=True, exist_ok=True)
    image.resize((width, height), Image.Resampling.LANCZOS).save(OUT / name, "PNG", optimize=True)
    print("wrote", (OUT / name).relative_to(ROOT).as_posix())


def px(values):
    return tuple(int(round(v * SS)) for v in values)


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(px(box), int(radius * SS), fill=fill, outline=outline, width=max(1, int(width * SS)))


def ellipse(draw, box, fill=None, outline=None, width=1):
    draw.ellipse(px(box), fill=fill, outline=outline, width=max(1, int(width * SS)))


def line(draw, points, fill, width=1):
    draw.line([(x * SS, y * SS) for x, y in points], fill=fill, width=max(1, int(width * SS)), joint="curve")


def dashed_circle(draw, cx, cy, radius, color, width, dash_degrees=13, gap_degrees=9):
    angle = 0.0
    while angle < 360:
        end = min(360.0, angle + dash_degrees)
        points = []
        steps = max(2, int((end - angle) / 2))
        for index in range(steps + 1):
            theta = math.radians(angle + (end - angle) * index / steps)
            points.append((cx + math.cos(theta) * radius, cy + math.sin(theta) * radius))
        draw.line([(x * SS, y * SS) for x, y in points], fill=color, width=max(1, int(width * SS)))
        angle += dash_degrees + gap_degrees


# ---------------------------------------------------------------------------
# Mode Ready map previews
# ---------------------------------------------------------------------------

def map_preview_city():
    width, height = 560, 260
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)

    horizon = 104
    # Sky band, then the cream ground the city block sits on.
    for y in range(horizon):
        t = y / max(1, horizon - 1)
        color = (198 + int((226 - 198) * t), 235 + int((244 - 235) * t), 250, 255)
        draw.line((0, y * SS, width * SS, y * SS), fill=color, width=SS)
    draw.rectangle(px((0, horizon, width, height)), fill=(233, 226, 208, 255))

    # Crossroads: a horizontal avenue and a vertical side street.
    draw.rectangle(px((0, 148, width, 190)), fill=(87, 92, 102, 255))
    draw.rectangle(px((0, 151, width, 187)), fill=(110, 116, 128, 255))
    draw.rectangle(px((252, horizon, 306, height)), fill=(87, 92, 102, 255))
    draw.rectangle(px((255, horizon, 303, height)), fill=(110, 116, 128, 255))
    for x in range(16, width - 20, 52):
        if 244 < x < 312:
            continue
        draw.rectangle(px((x, 166, x + 30, 173)), fill=(242, 233, 200, 255))

    # Buildings sit on the far kerb, bottoms flush with the avenue.
    buildings = [
        (26, 96, 118, (127, 180, 232, 255)),
        (134, 128, 240, (154, 214, 160, 255)),
        (318, 60, 424, (240, 178, 122, 255)),
        (438, 100, 534, (199, 168, 232, 255)),
    ]
    for left, building_height, right, color in buildings:
        top = 148 - building_height
        rounded(draw, (left, top, right, 152), 7, fill=color, outline=INK, width=3)
        for row in range(top + 14, 140, 26):
            rounded(draw, (left + 12, row, left + 30, row + 12), 2, fill=(201, 242, 255, 255))
            rounded(draw, (right - 30, row, right - 12, row + 12), 2, fill=(201, 242, 255, 255))

    # Trees on the near kerb.
    for cx, cy, radius in ((104, 214, 15), (188, 236, 12), (392, 208, 14), (498, 238, 13), (350, 244, 10)):
        ellipse(draw, (cx - radius, cy - radius, cx + radius, cy + radius), fill=(70, 179, 74, 255), outline=INK, width=2)
        ellipse(draw, (cx - radius * 0.45, cy - radius * 0.55, cx + radius * 0.1, cy - radius * 0.05), fill=(126, 214, 118, 255))

    # The singularity, at the crossroads.
    cx, cy, radius = 279, 172, 40
    glow = canvas(width, height)
    ellipse(ImageDraw.Draw(glow), (cx - radius - 8, cy - radius - 8, cx + radius + 8, cy + radius + 8),
            outline=(95, 233, 255, 210), width=9)
    image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(6 * SS)))
    ellipse(draw, (cx - radius, cy - radius, cx + radius, cy + radius), fill=(5, 7, 14, 255),
            outline=(95, 233, 255, 255), width=4)
    ellipse(draw, (cx - radius - 5, cy - radius - 5, cx + radius + 5, cy + radius + 5), outline=INK, width=3)
    # A couple of lit streaks keep the core from reading as a flat disc.
    line(draw, [(cx - 24, cy + 14), (cx - 4, cy + 4), (cx + 18, cy - 10)], (86, 116, 200, 220), 3)
    line(draw, [(cx - 14, cy + 22), (cx + 6, cy + 10), (cx + 26, cy - 4)], (150, 190, 255, 200), 2)

    # Rounded corners so the art drops cleanly inside the authored card frame.
    mask = Image.new("L", (width * SS, height * SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width * SS - 1, height * SS - 1), int(22 * SS), fill=255)
    image.putalpha(Image.composite(image.getchannel("A"), Image.new("L", image.size, 0), mask))
    save("map_preview_city.png", image, width, height)


def map_preview_arena():
    width, height = 560, 260
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)

    # Radial purple field, darker at the rim. Built at 1x and upscaled to the
    # supersampled canvas: the gradient is smooth, so bilinear upscaling is
    # exact enough and avoids a 2.3M-pixel per-pixel loop.
    cx, cy = width / 2, height / 2
    field = Image.new("RGBA", (width, height))
    pixels = field.load()
    for y in range(height):
        for x in range(width):
            t = min(1.0, math.hypot(x - cx, y - cy) / (width * 0.5))
            pixels[x, y] = (
                int(74 + (42 - 74) * t),
                int(52 + (31 - 52) * t),
                int(126 + (78 - 126) * t),
                255,
            )
    image.paste(field.resize((width * SS, height * SS), Image.Resampling.BILINEAR), (0, 0))
    draw = ImageDraw.Draw(image)

    dashed_circle(draw, cx, cy, 108, (255, 255, 255, 105), 3, dash_degrees=11, gap_degrees=8)
    dashed_circle(draw, cx, cy, 74, (255, 190, 80, 200), 3, dash_degrees=9, gap_degrees=7)

    # Four rival cores on the rings.
    rivals = [
        (cx - 104, cy - 40, (139, 92, 246, 255)),
        (cx + 112, cy - 48, (244, 63, 94, 255)),
        (cx - 96, cy + 68, (16, 185, 129, 255)),
        (cx + 106, cy + 58, (255, 160, 0, 255)),
    ]
    for x, y, color in rivals:
        ellipse(draw, (x - 20, y - 20, x + 20, y + 20), fill=color, outline=INK, width=3)
        ellipse(draw, (x - 12, y - 12, x + 12, y + 12), fill=(15, 18, 38, 235))
        ellipse(draw, (x - 5, y - 8, x + 5, y + 2), fill=(255, 255, 255, 190))

    # Local singularity, centred, with a cool rim.
    glow = canvas(width, height)
    ellipse(ImageDraw.Draw(glow), (cx - 52, cy - 52, cx + 52, cy + 52), outline=(95, 233, 255, 220), width=14)
    image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9 * SS)))
    draw = ImageDraw.Draw(image)
    ellipse(draw, (cx - 42, cy - 42, cx + 42, cy + 42), fill=(8, 10, 30, 255), outline=(95, 233, 255, 255), width=5)
    ellipse(draw, (cx - 30, cy - 30, cx + 30, cy + 30), fill=(2, 3, 10, 255))
    ellipse(draw, (cx - 14, cy - 16, cx - 2, cy - 6), fill=(230, 240, 255, 235))

    mask = Image.new("L", (width * SS, height * SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width * SS - 1, height * SS - 1), int(22 * SS), fill=255)
    image.putalpha(Image.composite(image.getchannel("A"), Image.new("L", image.size, 0), mask))
    save("map_preview_arena.png", image, width, height)


# ---------------------------------------------------------------------------
# Virtual joystick
# ---------------------------------------------------------------------------

def joystick_base():
    size = 196
    image = canvas(size, size)
    draw = ImageDraw.Draw(image)
    centre = size / 2
    ellipse(draw, (centre - 83, centre - 83, centre + 83, centre + 83), fill=(21, 36, 55, 112),
            outline=(238, 247, 255, 205), width=7)
    ellipse(draw, (centre - 57, centre - 57, centre + 57, centre + 57), outline=(147, 224, 255, 180), width=2)
    # A soft top-left sheen reads as a recessed plate instead of a flat ring.
    sheen = canvas(size, size)
    ImageDraw.Draw(sheen).ellipse((centre - 70, centre - 76, centre + 18, centre + 10),
                                  fill=(255, 255, 255, 34))
    image.alpha_composite(sheen.filter(ImageFilter.GaussianBlur(10 * SS)))
    save("joystick_base.png", image, size, size)


def joystick_knob():
    # 76x76 to match the serialized JoystickKnob UITransform exactly, so the
    # authored sprite is drawn 1:1 instead of being scaled by the Sprite.
    size = 76
    image = canvas(size, size)
    draw = ImageDraw.Draw(image)
    centre = size / 2
    ellipse(draw, (centre - 34, centre - 34, centre + 34, centre + 34), fill=(239, 251, 255, 190),
            outline=(94, 195, 243, 240), width=5)
    ellipse(draw, (centre - 23, centre - 25, centre + 3, centre - 3), fill=(255, 255, 255, 170))
    save("joystick_knob.png", image, size, size)


# ---------------------------------------------------------------------------
# 9-slice frames
# ---------------------------------------------------------------------------

def panel_9slice():
    size = 128
    image = canvas(size, size)
    draw = ImageDraw.Draw(image)
    rounded(draw, (2, 2, size - 2, size - 2), 24, fill=(22, 64, 79, 235), outline=(140, 215, 240, 170), width=3)
    line(draw, [(26, 12), (size - 26, 12)], (190, 240, 255, 90), 2)
    save("ui_panel_9slice.png", image, size, size)


def card_9slice():
    size = 160
    image = canvas(size, size)
    draw = ImageDraw.Draw(image)
    rounded(draw, (6, 6, size - 6, size - 6), 30, fill=(230, 238, 245, 255), outline=(15, 26, 46, 255), width=12)
    save("ui_card_9slice.png", image, size, size)


def button_9slice():
    width, height = 192, 128
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)
    rounded(draw, (6, 20, width - 6, height - 6), 40, fill=(154, 86, 13, 255))
    rounded(draw, (4, 4, width - 4, height - 20), 40, fill=(255, 189, 30, 255), outline=(255, 247, 189, 255), width=5)
    line(draw, [(30, 32), (width - 30, 32)], (255, 246, 160, 235), 4)
    save("ui_button_9slice.png", image, width, height)


def popup_9slice():
    size = 128
    image = canvas(size, size)
    draw = ImageDraw.Draw(image)
    rounded(draw, (4, 4, size - 4, size - 4), 24, fill=(91, 33, 182, 236), outline=(15, 20, 38, 255), width=6)
    line(draw, [(28, 16), (size - 28, 16)], (200, 170, 255, 120), 2)
    save("ui_popup_9slice.png", image, size, size)


def hud_bar_9slice():
    width, height = 128, 64
    image = canvas(width, height)
    draw = ImageDraw.Draw(image)
    rounded(draw, (2, 2, width - 2, height - 2), 20, fill=(18, 42, 58, 215), outline=(140, 215, 240, 150), width=3)
    line(draw, [(22, 11), (width - 22, 11)], (190, 240, 255, 70), 2)
    save("ui_hud_bar_9slice.png", image, width, height)


if __name__ == "__main__":
    map_preview_city()
    map_preview_arena()
    joystick_base()
    joystick_knob()
    panel_9slice()
    card_9slice()
    button_9slice()
    popup_9slice()
    hud_bar_9slice()
    print("\nCreator must import these now; scripts/v7_phase6_ui_prefabs.mjs reads the uuids back.")
