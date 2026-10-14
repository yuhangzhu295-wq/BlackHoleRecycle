"""Assemble the gameplay-page captures into one labelled sheet.

A set of loose PNGs is not a summary: the pages have to be comparable side by side
at the same size, in the order a player meets them, with the file each panel came
from printed under it so any claim about a panel can be checked against the run
that produced it.

Run: python scripts/build_gameplay_sheet.py
"""
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'artifacts', 'qa', 'v12', 'gameplay', 'gameplay-pages.png')

# (title, path, note) in the order a player meets them.
PAGES = (
    ('无尽玩法 · 开局', 'artifacts/qa/v12/gameplay/endless-hud-390x844.png', 'HUD + 摇杆 + 进度条'),
    ('无尽玩法 · 拖动后', 'artifacts/qa/v12/gameplay/endless-after-drive-390x844.png', '真实触摸驱动 9s'),
    ('竞技玩法 · 局内', 'artifacts/qa/v12/gameplay/arena-hud-390x844.png', '排行榜/计时/排名+质量'),
    ('竞技玩法 · 拖动后', 'artifacts/qa/v12/gameplay/arena-after-drive-390x844.png', '四方向实拖'),
    ('暂停', 'artifacts/qa/settled/pause-settled-390x844.png', '局内浮层'),
    ('复活', 'artifacts/qa/settled/revive-settled-390x844.png', '被吞噬后'),
    ('无尽结算', 'artifacts/qa/settled/settlement-endless-settled-390x844.png', ''),
    ('竞技结算', 'artifacts/qa/settled/settlement-arena-settled-390x844.png', '四列排行榜'),
)

# The defect this pass found, kept separate from the page list: it is evidence,
# not a page.
DEFECTS = (
    ('缺陷：无尽 · 向北开 70 单位后', 'artifacts/qa/v12/gameplay/endless-void-8s-390x844.png',
     '下半屏 73.9% 纯黑 (0,0,0)，静止 8 秒不恢复'),
    ('对照：开回原点后', 'artifacts/qa/v12/gameplay/endless-void-return-390x844.png',
     '同一相机，下半屏 0.9% —— 说明与世界位置相关'),
)

SCALE = 0.62
PAD = 14
LABEL_H = 46


def main():
    panels = []
    for title, relative, note in PAGES + DEFECTS:
        path = os.path.join(ROOT, relative)
        if not os.path.exists(path):
            print('MISSING %s (from %s)' % (title, relative))
            continue
        image = Image.open(path).convert('RGB')
        image = image.resize((int(image.width * SCALE), int(image.height * SCALE)), Image.LANCZOS)
        panels.append((title, note, image))

    if not panels:
        raise SystemExit('no captures found')

    cell_w = max(p[2].width for p in panels) + PAD * 2
    cell_h = max(p[2].height for p in panels) + PAD * 2 + LABEL_H
    columns = 4
    rows = (len(panels) + columns - 1) // columns
    sheet = Image.new('RGB', (cell_w * columns, cell_h * rows), (16, 18, 28))
    draw = ImageDraw.Draw(sheet)

    for index, (title, note, image) in enumerate(panels):
        column = index % columns
        row = index // columns
        x = column * cell_w + PAD
        y = row * cell_h + PAD
        sheet.paste(image, (x, y))
        is_defect = index >= len(PAGES)
        draw.text((x, y + image.height + 6), title,
                  fill=(255, 170, 170) if is_defect else (240, 244, 255))
        if note:
            draw.text((x, y + image.height + 22), note,
                      fill=(220, 140, 140) if is_defect else (150, 165, 195))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print('wrote %s (%dx%d, %d panels: %d pages + %d defect evidence)'
          % (OUT, sheet.width, sheet.height, len(panels), len(PAGES), len(panels) - len(PAGES)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
