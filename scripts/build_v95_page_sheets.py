"""Assemble the STEP 6 three-size comparison sheets.

One sheet per page: 375x667 / 390x844 / 430x932 side by side, scaled to a common
height so the layouts can be compared directly, with a caption strip naming the
page and each viewport.

Input : cocos/docs/evidence/v95/pages/<page>-<size>.png  (capture_v95_page_sheets.mjs)
Output: cocos/docs/evidence/v95/pages/sheet-<page>.png

Usage: python scripts/build_v95_page_sheets.py
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PAGES_DIR = os.path.join(ROOT, 'cocos', 'docs', 'evidence', 'v95', 'pages')

SIZES = ['375x667', '390x844', '430x932']
PAGES = [
    ('home', 'Home', '首页'),
    ('mode', 'Mode Select', '模式选择'),
    ('ready', 'Endless Ready', '模式准备'),
    ('machine', 'Machine Archive', '机器档案'),
    ('skin', 'Skin Selection', '皮肤选择'),
    ('pause', 'Pause', '暂停'),
    ('settlement', 'Settlement', '结算'),
    ('revive', 'Revive', '复活'),
]

PANEL_HEIGHT = 720
GAP = 18
MARGIN = 24
CAPTION_HEIGHT = 54
TITLE_HEIGHT = 64

# A Chinese-capable face, with ASCII-only fallbacks if it is missing.
FONT_CANDIDATES = [
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/simhei.ttf',
    'C:/Windows/Fonts/segoeui.ttf',
]


def load_font(size):
    for candidate in FONT_CANDIDATES:
        if os.path.exists(candidate):
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    return ImageFont.load_default()


def build_sheet(page_key, title_en, title_zh):
    shots = []
    for size in SIZES:
        path = os.path.join(PAGES_DIR, f'{page_key}-{size}.png')
        if not os.path.exists(path):
            print(f'  missing {os.path.basename(path)} -- skipping {page_key}')
            return None
        image = Image.open(path).convert('RGB')
        scale = PANEL_HEIGHT / image.height
        shots.append((size, image.resize((max(1, round(image.width * scale)), PANEL_HEIGHT), Image.LANCZOS)))

    total_width = MARGIN * 2 + sum(image.width for _, image in shots) + GAP * (len(shots) - 1)
    total_height = MARGIN * 2 + TITLE_HEIGHT + PANEL_HEIGHT + CAPTION_HEIGHT
    sheet = Image.new('RGB', (total_width, total_height), (18, 24, 32))
    draw = ImageDraw.Draw(sheet)

    title_font = load_font(30)
    caption_font = load_font(20)
    draw.text((MARGIN, MARGIN - 4), f'{title_en} / {title_zh}', fill=(244, 246, 248), font=title_font)

    x = MARGIN
    y = MARGIN + TITLE_HEIGHT
    for size, image in shots:
        sheet.paste(image, (x, y))
        draw.rectangle([x, y, x + image.width - 1, y + image.height - 1], outline=(70, 84, 100), width=1)
        caption = f'{size}  ({image.width}x{image.height})'
        text_width = draw.textlength(caption, font=caption_font)
        draw.text((x + (image.width - text_width) / 2, y + image.height + 16),
                  caption, fill=(160, 176, 194), font=caption_font)
        x += image.width + GAP

    out_path = os.path.join(PAGES_DIR, f'sheet-{page_key}.png')
    sheet.save(out_path)
    print(f'  {os.path.relpath(out_path, ROOT)}  ({sheet.width}x{sheet.height})')
    return out_path


def main():
    if not os.path.isdir(PAGES_DIR):
        print('no capture directory at', PAGES_DIR)
        return 1
    print('building sheets:')
    built = 0
    for page_key, title_en, title_zh in PAGES:
        if build_sheet(page_key, title_en, title_zh):
            built += 1
    print(f'\n{built}/{len(PAGES)} sheets built')
    return 0 if built == len(PAGES) else 1


if __name__ == '__main__':
    sys.exit(main())
