"""Compare the arena's composition with the reference on equal terms.

The review recorded the arena's near band at 8.2% "city" against the reference's
25.7% and treated it as the remaining visual gap. Measuring the reference's near
band says most of it is white (#ffffff and near-white are its leading colours),
which is the sheet's UI layer, not city. So the two numbers were never measuring
the same thing: one frame has a gameplay HUD where the other has a page mock.

This compares the bands with the UI excluded on both sides. The arena's HUD panels
are known nodes, and the reference sheet's UI is the bright region at the bottom
and the text column on the right; both are cut before the shares are computed.

Run: python scripts/measure_arena_equal_terms.py
"""
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
REF = os.path.join(ROOT, 'artifacts', 'qa', 'v14', 'review', 'REF07_phone.png')
CUR = os.path.join(ROOT, 'artifacts', 'qa', 'v13', 'arena', 'arena-390x844.png')

ASPHALT = (109, 119, 151)


def is_sky(r, g, b):
    if abs(r - ASPHALT[0]) <= 22 and abs(g - ASPHALT[1]) <= 22 and abs(b - ASPHALT[2]) <= 22:
        return False
    if 128 <= r <= 190 and 132 <= g <= 196 and 148 <= b <= 210 and abs(r - g) <= 14:
        return False
    return b > r + 24 and b > g + 6 and b > 150


def is_ground(r, g, b):
    if abs(r - ASPHALT[0]) <= 26 and abs(g - ASPHALT[1]) <= 26 and abs(b - ASPHALT[2]) <= 26:
        return True
    if r >= 190 and g >= 190 and b >= 190:
        return True
    if 60 <= r <= 130 and 60 <= g <= 140 and 80 <= b <= 170 and abs(r - g) <= 24:
        return True
    if g > r + 14 and g > b + 10:
        return True
    return False


def shares(image, box):
    region = image.crop(box).convert('RGB')
    pixels = list(region.getdata())
    city = sky = ground = 0
    for r, g, b in pixels:
        if is_sky(r, g, b):
            sky += 1
        elif is_ground(r, g, b):
            ground += 1
        else:
            city += 1
    total = len(pixels)
    return {name: 100.0 * value / total for name, value in
            (('city', city), ('sky', sky), ('ground', ground))}


def main():
    if not os.path.exists(REF) or not os.path.exists(CUR):
        print('missing frame: %s or %s' % (REF, CUR))
        return 1

    ref = Image.open(REF).convert('RGB')
    cur = Image.open(CUR).convert('RGB')
    rw, rh = ref.size
    cw, ch = cur.size

    # The reference sheet: cut the annotation column on the right (40%) and the
    # white UI plate at the bottom (last 8%).
    ref_box = (0, 0, int(rw * 0.62), int(rh * 0.92))
    # The arena: the gameplay HUD occupies the bottom 22% and the top 12%.
    cur_box = (0, int(ch * 0.12), cw, int(ch * 0.78))

    print('含 UI 的口径（旧） vs 排除 UI 的口径（新）:')
    for name, image, raw_box, cut_box in (
        ('REF07_phone', ref, (0, 0, rw, rh), ref_box),
        ('arena-390x844', cur, (0, 0, cw, ch), cur_box),
    ):
        raw = shares(image, raw_box)
        cut = shares(image, cut_box)
        print('  %-14s raw   city %5.1f%%  sky %5.1f%%  ground %5.1f%%'
              % (name, raw['city'], raw['sky'], raw['ground']))
        print('  %-14s cut   city %5.1f%%  sky %5.1f%%  ground %5.1f%%'
              % ('', cut['city'], cut['sky'], cut['ground']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
