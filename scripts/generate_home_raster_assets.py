"""Generate the original, Cocos-ready raster artwork for the V2 Home page.

This intentionally draws original game UI art rather than copying the design reference
image into the runtime.  All output is deterministic PNG and is imported by Cocos as
Sprite/ImageAsset files.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "cocos" / "assets" / "textures" / "home"
SCALE = 2
FONT_BOLD = Path("C:/Windows/Fonts/msyhbd.ttc")
FONT_REGULAR = Path("C:/Windows/Fonts/msyh.ttc")


def font(size, bold=True):
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size * SCALE)


def image(width, height, color=(0, 0, 0, 0)):
    return Image.new("RGBA", (width * SCALE, height * SCALE), color)


def box(draw, xy, radius, fill, outline=None, width=1):
    xy = tuple(v * SCALE for v in xy)
    draw.rounded_rectangle(xy, radius * SCALE, fill=fill, outline=outline, width=width * SCALE)


def ellipse(draw, xy, fill, outline=None, width=1):
    xy = tuple(v * SCALE for v in xy)
    draw.ellipse(xy, fill=fill, outline=outline, width=width * SCALE)


def polygon(draw, points, fill, outline=None):
    points = [(x * SCALE, y * SCALE) for x, y in points]
    draw.polygon(points, fill=fill)
    if outline:
        draw.line(points + [points[0]], fill=outline, width=3 * SCALE, joint="curve")


def line(draw, points, fill, width=1, joint="curve"):
    draw.line([(x * SCALE, y * SCALE) for x, y in points], fill=fill, width=width * SCALE, joint=joint)


def text_center(draw, y, content, fnt, fill, stroke=0, stroke_fill=(0, 0, 0, 0), width=600):
    left, top, right, bottom = draw.textbbox((0, 0), content, font=fnt, stroke_width=stroke * SCALE)
    x = (width * SCALE - (right - left)) // 2
    draw.text((x, y * SCALE), content, font=fnt, fill=fill, stroke_width=stroke * SCALE, stroke_fill=stroke_fill)


def save(name, asset):
    OUT.mkdir(parents=True, exist_ok=True)
    asset.resize((asset.width // SCALE, asset.height // SCALE), Image.Resampling.LANCZOS).save(OUT / name, "PNG", optimize=True)


def shadowed(base, rectangle, radius=18, shadow=(18, 33, 28, 90), offset=(0, 9)):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    drawer = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = rectangle
    box(drawer, (x0 + offset[0], y0 + offset[1], x1 + offset[0], y1 + offset[1]), radius, shadow)
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(5 * SCALE)))


def draw_tree(draw, x, y, size=44):
    ellipse(draw, (x - 7, y + 22, x + 8, y + 80), "#80523b")
    ellipse(draw, (x - size, y - size * .55, x + size, y + size * .9), "#4aa546")
    ellipse(draw, (x - size * .9, y - size * .35, x + 5, y + size * .65), "#71cf57")
    ellipse(draw, (x - 2, y - size * .45, x + size * 1.02, y + size * .55), "#62bd4f")


def city_park():
    asset = image(720, 1280)
    draw = ImageDraw.Draw(asset)
    for y in range(1280):
        if y < 470:
            t = y / 470
            c = tuple(int(a + (b - a) * t) for a, b in zip((126, 224, 250), (215, 247, 255)))
        else:
            t = (y - 470) / 810
            c = tuple(int(a + (b - a) * t) for a, b in zip((142, 215, 83), (76, 165, 55)))
        draw.line((0, y * SCALE, 720 * SCALE, y * SCALE), fill=c, width=SCALE)
    polygon(draw, [(0, 380), (190, 316), (373, 371), (548, 330), (720, 278), (720, 880), (0, 860)], "#77c948")
    polygon(draw, [(-70, 807), (143, 680), (315, 718), (482, 842), (720, 854), (720, 1100), (528, 1060), (354, 926), (177, 835), (-70, 960)], "#dbc69d", "#b69f76")
    line(draw, [(-10, 852), (145, 770), (303, 802), (470, 911), (720, 937)], "#fff7dc", 12)
    for x, y in [(75, 285), (193, 259), (612, 293), (650, 428), (75, 1044), (633, 1041), (314, 305), (493, 328)]:
        draw_tree(draw, x, y, 42 if y < 500 else 48)
    def building(x, y, roof, front, side, w=104, h=112):
        polygon(draw, [(x, y), (x + w, y - 47), (x + w + 75, y - 10), (x + 70, y + 45)], roof, "#ffffff")
        polygon(draw, [(x, y), (x + 70, y + 45), (x + 70, y + h + 45), (x, y + h)], front, "#985f45")
        polygon(draw, [(x + 70, y + 45), (x + w + 75, y - 10), (x + w + 75, y + h - 11), (x + 70, y + h + 45)], side, "#985f45")
        for off in (18, 47):
            box(draw, (x + 13, y + off + 20, x + 42, y + off + 44), 3, "#c9f2ff")
    building(33, 438, "#f6c64a", "#df8e42", "#f1ad46")
    building(476, 385, "#ffac58", "#df7146", "#ffbd6b", 112, 130)
    building(105, 635, "#ae77eb", "#7d53b9", "#c791ff", 82, 86)
    building(489, 596, "#53b9ee", "#318bc6", "#71ccff", 84, 92)
    for x, y, color in [(219, 785, "#f5c630"), (484, 900, "#ff8d4b")]:
        shadowed(asset, (x - 42, y - 21, x + 42, y + 27), 12)
        box(draw, (x - 38, y - 18, x + 38, y + 24), 10, color)
        box(draw, (x - 13, y - 42, x + 24, y - 10), 6, "#a9e8ff")
        ellipse(draw, (x - 25, y + 17, x - 1, y + 41), "#384652")
        ellipse(draw, (x + 14, y + 17, x + 38, y + 41), "#384652")
    for x, y, r in [(123, 1120, 9), (574, 250, 8), (319, 333, 6), (409, 1060, 7)]:
        ellipse(draw, (x-r, y-r, x+r, y+r), "#f2ffd9")

    # Street, sidewalks and small park props add the depth cues of the V2
    # isometric city-park reference while keeping this an original, text-free
    # background.  Interactive controls and all live values remain separate
    # Cocos nodes layered above this sprite.
    polygon(draw, [(354, 0), (720, 0), (720, 212), (571, 315), (469, 246)], "#3d4b59")
    polygon(draw, [(342, 0), (365, 0), (481, 253), (457, 264)], "#dce4e7")
    polygon(draw, [(720, 211), (720, 238), (562, 331), (550, 309)], "#dce4e7")
    for y in range(32, 220, 52):
        polygon(draw, [(512, y), (579, y), (599, y + 15), (529, y + 15)], "#f4f7f5")
    line(draw, [(401, 12), (590, 272)], "#8c9aa4", 3)
    line(draw, [(442, 4), (628, 254)], "#8c9aa4", 3)

    # Distant rooftops and a lively civic corner frame the title without
    # competing with the hero black hole in the centre.
    building(14, 168, "#f4d35e", "#df8253", "#f1ab5d", 76, 74)
    building(596, 188, "#68bde8", "#468ac0", "#8ad8f4", 74, 76)
    building(22, 1005, "#ee765e", "#c65845", "#ef8e70", 126, 150)
    building(548, 1038, "#6bb7e8", "#438fc4", "#82cff4", 110, 115)

    # Fountain on the left and playground on the right make the lawn read as
    # a real city park rather than a flat field.
    ellipse(draw, (38, 675, 146, 742), "#b9d1d4", "#ffffff", 3)
    ellipse(draw, (48, 683, 136, 732), "#49bfe0", "#e9fbff", 3)
    ellipse(draw, (73, 691, 111, 724), "#f3f7dc", "#7392a2", 2)
    ellipse(draw, (86, 682, 98, 716), "#ecffff")
    line(draw, [(92, 688), (80, 676)], "#e9ffff", 3)
    line(draw, [(92, 688), (104, 674)], "#e9ffff", 3)

    box(draw, (596, 700, 694, 708), 4, "#f3bf4e", "#a7693d", 2)
    line(draw, [(614, 700), (606, 638), (630, 638), (646, 700)], "#e56948", 7)
    line(draw, [(650, 700), (665, 650), (681, 700)], "#47a7df", 7)
    polygon(draw, [(647, 670), (682, 683), (670, 702), (637, 688)], "#6cd2ff", "#2879b7")

    # Traffic furniture and flower clusters create small-scale detail at the
    # page edges, preserving a clean central interaction zone.
    for x, y in [(173, 278), (538, 505), (222, 890), (462, 1112), (664, 932), (52, 521)]:
        ellipse(draw, (x - 20, y - 9, x + 20, y + 9), "#4b9d47")
        ellipse(draw, (x - 12, y - 15, x + 12, y + 8), "#70c85a")
        ellipse(draw, (x - 4, y - 4, x + 4, y + 4), "#fff3ae")
    for x, y in [(676, 388), (658, 920), (164, 572), (68, 816)]:
        line(draw, [(x, y), (x, y - 43)], "#4d6171", 5)
        ellipse(draw, (x - 9, y - 55, x + 9, y - 37), "#f9e179", "#765d43", 2)
    for x, y, color in [(136, 1067, "#8c67d9"), (626, 576, "#f17652"), (94, 349, "#f7c54b")]:
        box(draw, (x - 16, y - 9, x + 16, y + 9), 4, color, "#6f5040", 2)
        ellipse(draw, (x - 12, y + 5, x - 2, y + 15), "#3d4854")
        ellipse(draw, (x + 3, y + 5, x + 13, y + 15), "#3d4854")
    save("home_city_park.png", asset)


def blackhole():
    asset = image(360, 360)
    draw = ImageDraw.Draw(asset)
    for rect, c in [((18, 81, 342, 337), "#4426a4"), ((28, 90, 332, 326), "#7c4ced"), ((49, 108, 311, 309), "#301a8f"), ((91, 139, 269, 280), "#170a46"), ((128, 168, 232, 254), "#02010b")]:
        ellipse(draw, rect, c)
    ellipse(draw, (41, 102, 319, 319), None, "#eee5ff", 8)
    ellipse(draw, (133, 176, 170, 202), "#ffffff")
    polygon(draw, [(117, 105), (142, 54), (180, 83), (218, 54), (243, 105), (220, 132), (140, 132)], "#f8cf48", "#ad7213")
    for x, y, c in [(143, 91, "#ff7e48"), (180, 98, "#fff3a0"), (216, 91, "#65d6ff")]:
        ellipse(draw, (x-8, y-8, x+8, y+8), c)
    save("home_blackhole_hero.png", asset)


def logo():
    asset = image(600, 180)
    draw = ImageDraw.Draw(asset)
    text_center(draw, 6, "黑洞", font(72), "#ffd448", 6, "#ffffff")
    text_center(draw, 82, "大作战", font(66), "#7442d7", 6, "#ffffff")
    ellipse(draw, (465, 38, 500, 73), "#5d35ba")
    ellipse(draw, (475, 48, 490, 63), "#05020c")
    save("home_logo.png", asset)


def hud():
    asset = image(260, 76)
    draw = ImageDraw.Draw(asset)
    shadowed(asset, (3, 6, 257, 72), 27)
    box(draw, (2, 2, 254, 66), 27, "#203a4d", "#d9f4ff", 3)
    line(draw, [(28, 15), (220, 15)], "#84d7ff", 3)
    save("home_hud_panel.png", asset)


def start_button():
    asset = image(430, 112)
    draw = ImageDraw.Draw(asset)
    shadowed(asset, (10, 20, 420, 104), 39, (121, 67, 9, 170), (0, 6))
    box(draw, (10, 20, 420, 104), 39, "#9a560d")
    box(draw, (6, 6, 424, 88), 39, "#ffbd1e", "#fff7bd", 5)
    line(draw, [(42, 42), (388, 42)], "#fff6a0", 4)
    save("home_start_button.png", asset)


def action_button(name, top, bottom, dark, kind):
    asset = image(168, 142)
    draw = ImageDraw.Draw(asset)
    shadowed(asset, (6, 17, 162, 136), 25, (33, 23, 76, 140), (0, 5))
    box(draw, (6, 17, 162, 136), 25, dark)
    box(draw, (5, 5, 163, 121), 25, top, "#e9f8ff", 3)
    if kind == "mode":
        box(draw, (48, 42, 120, 81), 4, "#ffffff")
        line(draw, [(62, 40), (62, 88), (106, 40), (106, 88), (48, 59), (120, 59)], bottom, 6)
    elif kind == "skin":
        ellipse(draw, (53, 34, 116, 102), "#ffffff")
        ellipse(draw, (65, 42, 104, 89), bottom)
        box(draw, (51, 71, 118, 98), 14, "#ffffff")
    else:
        box(draw, (51, 49, 117, 93), 3, "#f4ffe4")
        box(draw, (61, 40, 107, 56), 2, bottom)
        ellipse(draw, (60, 67, 76, 83), bottom)
        box(draw, (86, 61, 107, 84), 2, bottom)
    save(name, asset)


def coin():
    asset = image(64, 64)
    draw = ImageDraw.Draw(asset)
    ellipse(draw, (4, 4, 60, 60), "#f5a91b", "#fff2a3", 4)
    ellipse(draw, (14, 14, 50, 50), "#ffd34b")
    draw.text((22 * SCALE, 12 * SCALE), "¥", font=font(31), fill="#a86409")
    save("home_coin.png", asset)


def settings():
    asset = image(80, 80)
    draw = ImageDraw.Draw(asset)
    ellipse(draw, (8, 10, 72, 74), "#263847", "#d9f1ff", 3)
    for a in range(8):
        x = 40 + int(__import__("math").cos(a * .785) * 20)
        y = 42 + int(__import__("math").sin(a * .785) * 20)
        ellipse(draw, (x-6, y-6, x+6, y+6), "#b9e8ff")
    ellipse(draw, (29, 31, 51, 53), "#3a5570")
    save("home_settings.png", asset)


def mode_back():
    asset = image(104, 104)
    draw = ImageDraw.Draw(asset)
    shadowed(asset, (8, 13, 96, 96), 24, (50, 64, 86, 130), (0, 6))
    box(draw, (7, 7, 97, 88), 23, "#ffd55c", "#fff7bf", 5)
    polygon(draw, [(31, 47), (61, 22), (61, 37), (78, 37), (78, 57), (61, 57), (61, 72)], "#ffffff", "#513a24")
    save("mode_back.png", asset)


def mode_background():
    asset = image(720, 1280)
    draw = ImageDraw.Draw(asset)
    for y in range(1280):
        t = y / 1280
        c = tuple(int(a + (b - a) * t) for a, b in zip((120, 225, 255), (63, 168, 232)))
        draw.line((0, y * SCALE, 720 * SCALE, y * SCALE), fill=c, width=SCALE)
    # An original low-poly cyan field; keeps the reference's geometric depth without copying it.
    cols = [(0, 0, "#85dcf7"), (180, 0, "#9bebff"), (360, 0, "#74d2f2"), (540, 0, "#9ae9ff")]
    for x, y, color in cols:
        polygon(draw, [(x, y), (x + 180, y), (x + 90, y + 160)], color)
        polygon(draw, [(x, y + 160), (x + 180, y), (x + 180, y + 320)], "#72c9ea")
        polygon(draw, [(x, y + 160), (x + 180, y + 320), (x, y + 320)], "#a6eeff")
    for base_y in (320, 640, 960):
        for x in range(-90, 721, 180):
            polygon(draw, [(x, base_y), (x + 90, base_y + 160), (x - 90, base_y + 160)], "#82d8f2")
            polygon(draw, [(x + 90, base_y), (x + 180, base_y + 160), (x + 90, base_y + 160)], "#b2f3ff")
    save("mode_background.png", asset)


def mode_header():
    asset = image(500, 116)
    draw = ImageDraw.Draw(asset)
    text_center(draw, 18, "模式选择", font(52), "#ffffff", 6, "#18283d", width=500)
    save("mode_header.png", asset)


def mode_card_shelf():
    asset = image(600, 52)
    draw = ImageDraw.Draw(asset)
    shadowed(asset, (16, 13, 584, 47), 12, (37, 46, 80, 115), (0, 4))
    box(draw, (12, 7, 588, 38), 11, "#e9f1ff", "#27324a", 3)
    line(draw, [(30, 17), (570, 17)], "#ffffff", 3)
    save("mode_card_shelf.png", asset)


def mode_card(name, endless=False):
    asset = image(610, 278)
    draw = ImageDraw.Draw(asset)
    if endless:
        for y in range(278):
            t = y / 278
            c = tuple(int(a + (b - a) * t) for a, b in zip((49, 30, 117), (13, 10, 59)))
            draw.line((0, y * SCALE, 610 * SCALE, y * SCALE), fill=c, width=SCALE)
        for x, y, r in [(82, 62, 4), (145, 184, 5), (310, 52, 3), (424, 106, 5), (552, 72, 4), (501, 221, 3)]:
            ellipse(draw, (x-r, y-r, x+r, y+r), "#dff8ff")
        ellipse(draw, (493, 57, 553, 116), "#6781d1")
        ellipse(draw, (504, 63, 542, 101), "#3f54a1")
        ellipse(draw, (112, 180, 165, 232), "#6d6c8f")
        title, sub, callout, badge = "无尽吞噬", "生存挑战", "无限地图，挑战更高分数！", "最高分"
        hero_x, hero_y = 456, 145
    else:
        for y in range(278):
            t = y / 278
            c = tuple(int(a + (b - a) * t) for a, b in zip((107, 202, 87), (46, 131, 69)))
            draw.line((0, y * SCALE, 610 * SCALE, y * SCALE), fill=c, width=SCALE)
        polygon(draw, [(0, 48), (160, 0), (338, 0), (610, 164), (610, 226), (498, 278), (250, 246), (0, 144)], "#4e585f")
        line(draw, [(12, 61), (150, 13), (336, 17), (596, 170)], "#e6e4c8", 5)
        for x, y in [(72, 56), (168, 206), (530, 82), (565, 231)]:
            draw_tree(draw, x, y - 23, 19)
        title, sub, callout, badge = "竞技吞噬", "多人竞技", "实时对战，吞噬最强对手！", "竞技功能建设中"
        hero_x, hero_y = 456, 145
    # bright original vortex illustration keeps text and play affordance clear.
    for rect, c in [((hero_x-105, hero_y-82, hero_x+105, hero_y+82), "#3e22a0"), ((hero_x-94, hero_y-73, hero_x+94, hero_y+73), "#8152f3"), ((hero_x-72, hero_y-55, hero_x+72, hero_y+55), "#24136f"), ((hero_x-42, hero_y-31, hero_x+42, hero_y+31), "#02010b")]:
        ellipse(draw, rect, c)
    ellipse(draw, (hero_x-93, hero_y-72, hero_x+93, hero_y+72), None, "#d9f6ff", 4)
    polygon(draw, [(hero_x+126, hero_y), (hero_x+103, hero_y-17), (hero_x+103, hero_y+17)], "#ffffff", "#346dcb")
    draw.text((35 * SCALE, 37 * SCALE), title, font=font(44), fill="#ffffff", stroke_width=5 * SCALE, stroke_fill="#172032")
    draw.text((39 * SCALE, 103 * SCALE), sub, font=font(25), fill="#ffffff", stroke_width=3 * SCALE, stroke_fill="#172032")
    draw.text((39 * SCALE, 145 * SCALE), callout, font=font(19), fill="#fff264", stroke_width=2 * SCALE, stroke_fill="#35280e")
    box(draw, (36, 208, 252, 257), 12, "#277fd6", "#c3ecff", 3)
    draw.text((55 * SCALE, 216 * SCALE), badge, font=font(18), fill="#ffffff", stroke_width=2 * SCALE, stroke_fill="#213455")
    save(name, asset)


if __name__ == "__main__":
    city_park(); blackhole(); logo(); hud(); start_button()
    action_button("home_action_mode.png", "#b687ff", "#7140c6", "#3e217e", "mode")
    action_button("home_action_skin.png", "#91d9ff", "#3985db", "#1d559f", "skin")
    action_button("home_action_machine.png", "#b7ef6d", "#63b742", "#33742b", "machine")
    coin(); settings()
    mode_back(); mode_background(); mode_header(); mode_card_shelf()
    mode_card("mode_arena_card.png", endless=False)
    mode_card("mode_endless_card.png", endless=True)
