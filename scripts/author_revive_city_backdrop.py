"""Add the Hunyuan panorama as the Revive page's city backdrop.

The reviewer's decision (2026-10-20) was to use the 7680x3840 equirectangular
panorama as a static full-bleed backdrop behind the revive card, not as a 3D
skybox: the arena camera's top ray is -33 degrees and hits the ground at 67.7 m,
so a backdrop cylinder is either underground or cutting through the streamed
districts. A UI sprite touches no render contract.

Crop window and output format come from that decision, and both are measured:

  crop  x 3292..4388, y 1700..3648   (1096 x 1948, ratio 0.5626 = 720:1280)
  720x1280 LANCZOS, JPEG q80         (171 KB; the PNG alternative was 1.42 MB
                                      and the main package is already 259% of
                                      its 4 MB ceiling)

The crop sits on the densest skyline columns (x 3120..4320 measured at 0.85-0.93
non-grass) and keeps a ~200 px sky band, so the horizon lands near 13% of the
card height instead of cutting through it.

Run: python scripts/author_revive_city_backdrop.py [--dry-run]
"""
import copy
import json
import os
import sys
import uuid

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
from scene_edit import Scene, repo_root  # noqa: E402

ROOT = repo_root()
SCENE = os.path.join(ROOT, 'cocos', 'assets', 'scenes', 'Game.scene')
PANORAMA = os.path.join(ROOT, 'art-source', 'references', 'hunyuan-output',
                        'hunyuan-world-panorama-7680x3840.png')
MASTER = os.path.join(ROOT, 'art-source', 'references', 'hunyuan-output',
                      'hunyuan-world-panorama-5120.jpg')
ASSET_DIR = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'ui', 'v95')
ASSET_NAME = 'revive_bg_city'
ASSET_JPG = os.path.join(ASSET_DIR, ASSET_NAME + '.jpg')
ASSET_META = ASSET_JPG + '.meta'

# The reviewer's window, in source pixels.
CROP = (3292, 1700, 4388, 3648)
TARGET = (720, 1280)
QUALITY = 80
MAX_BYTES = 180 * 1024

# Stable uuid so a re-run keeps the same asset identity in the scene reference.
ASSET_UUID = str(uuid.uuid5(uuid.NAMESPACE_URL, 'blackholerecycle/revive_bg_city'))

SPRITE_FRAME_SID = 'f9941'
TEXTURE_SID = '6c48a'


def write_image(dry_run):
    if not os.path.exists(PANORAMA):
        raise SystemExit('panorama missing: %s' % PANORAMA)
    source = Image.open(PANORAMA).convert('RGB')
    if CROP[2] > source.width or CROP[3] > source.height:
        raise SystemExit('crop %s outside the %s panorama' % (CROP, source.size))
    cropped = source.crop(CROP)
    ratio = cropped.width / cropped.height
    wanted = TARGET[0] / TARGET[1]
    if abs(ratio - wanted) > 0.002:
        raise SystemExit('crop ratio %.4f does not match %dx%d (%.4f)'
                         % (ratio, TARGET[0], TARGET[1], wanted))
    card = cropped.resize(TARGET, Image.LANCZOS)
    print('crop %s -> %s, ratio %.4f' % (CROP, TARGET, ratio))

    master = source.resize((5120, 2560), Image.LANCZOS)
    if not dry_run:
        master.save(MASTER, 'JPEG', quality=85, optimize=True)
        card.save(ASSET_JPG, 'JPEG', quality=QUALITY, optimize=True)
    master_bytes = None
    card_bytes = None
    if not dry_run:
        master_bytes = os.path.getsize(MASTER)
        card_bytes = os.path.getsize(ASSET_JPG)
        print('master %s: %d bytes' % (os.path.basename(MASTER), master_bytes))
        print('card   %s: %d bytes' % (os.path.basename(ASSET_JPG), card_bytes))
        if card_bytes > MAX_BYTES:
            raise SystemExit('card art is %d bytes, over the %d budget the decision set'
                             % (card_bytes, MAX_BYTES))
    else:
        print('dry run: no image written')
    return card_bytes


def write_meta(dry_run):
    template_path = os.path.join(ASSET_DIR, 'revive_hero_absorbing.png.meta')
    with open(template_path, encoding='utf-8') as handle:
        meta = json.load(handle)
    meta = copy.deepcopy(meta)
    meta['uuid'] = ASSET_UUID
    meta['files'] = ['.json', '.jpg']
    meta['userData']['redirect'] = '%s@%s' % (ASSET_UUID, TEXTURE_SID)

    texture = meta['subMetas'][TEXTURE_SID]
    texture['uuid'] = '%s@%s' % (ASSET_UUID, TEXTURE_SID)
    texture['displayName'] = ASSET_NAME
    texture['userData']['imageUuidOrDatabaseUri'] = ASSET_UUID

    frame = meta['subMetas'][SPRITE_FRAME_SID]
    frame['uuid'] = '%s@%s' % (ASSET_UUID, SPRITE_FRAME_SID)
    frame['displayName'] = ASSET_NAME
    width, height = TARGET
    data = frame['userData']
    data['width'] = width
    data['height'] = height
    data['rawWidth'] = width
    data['rawHeight'] = height
    data['vertices']['rawPosition'] = [-width / 2, -height / 2, 0,
                                       width / 2, -height / 2, 0,
                                       -width / 2, height / 2, 0,
                                       width / 2, height / 2, 0]
    data['vertices']['uv'] = [0, height, width, height, 0, 0, width, 0]
    data['vertices']['minPos'] = [-width / 2, -height / 2, 0]
    data['vertices']['maxPos'] = [width / 2, height / 2, 0]
    data['imageUuidOrDatabaseUri'] = '%s@%s' % (ASSET_UUID, TEXTURE_SID)

    if dry_run:
        print('dry run: meta for %s@%s not written' % (ASSET_UUID, SPRITE_FRAME_SID))
        return
    with open(ASSET_META, 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(meta, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    print('wrote %s' % os.path.basename(ASSET_META))


def add_scene_node(dry_run):
    scene = Scene(SCENE)
    if scene.find('CityBackdrop') is not None:
        print('CityBackdrop already present; scene untouched')
        return

    page = scene.find('RevivePage')
    overlay = scene.find('DimOverlay')
    if page is None or overlay is None:
        raise SystemExit('RevivePage/DimOverlay not found in %s' % SCENE)

    node_id = len(scene.arr)
    node = copy.deepcopy(scene.arr[overlay])
    node['_name'] = 'CityBackdrop'
    node['_parent'] = {'__id__': page}
    node['_children'] = []
    node['_active'] = True
    node['_lpos'] = {'__type__': 'cc.Vec3', 'x': 0, 'y': 0, 'z': 0}
    node['_lscale'] = {'__type__': 'cc.Vec3', 'x': 1, 'y': 1, 'z': 1}

    overlay_transform = scene.component(overlay, 'cc.UITransform')
    overlay_sprite = scene.component(overlay, 'cc.Sprite')
    if overlay_transform is None or overlay_sprite is None:
        raise SystemExit('DimOverlay lost its UITransform/Sprite; cannot clone it')

    transform_id = node_id + 1
    transform = copy.deepcopy(scene.arr[overlay_transform])
    transform['node'] = {'__id__': node_id}

    sprite_id = node_id + 2
    sprite = copy.deepcopy(scene.arr[overlay_sprite])
    sprite['node'] = {'__id__': node_id}
    sprite['_color'] = {'__type__': 'cc.Color', 'r': 255, 'g': 255, 'b': 255, 'a': 255}
    sprite['_spriteFrame'] = {
        '__uuid__': '%s@%s' % (ASSET_UUID, SPRITE_FRAME_SID),
        '__expectedType__': 'cc.SpriteFrame',
    }
    node['_components'] = [{'__id__': transform_id}, {'__id__': sprite_id}]

    scene.append_elements([node, transform, sprite])

    # First child, so it draws under DimOverlay and everything else. Appending
    # to _children would put it on top of the card.
    current = [ref['__id__'] for ref in scene.arr[page].get('_children') or []]
    scene.replace_children(page, [node_id] + current)
    print('scene: CityBackdrop id %d inserted first under RevivePage' % node_id)
    if dry_run:
        print('dry run: scene not written')
        return
    scene.commit(expect={page: 1})


def main():
    dry_run = '--dry-run' in sys.argv
    write_image(dry_run)
    write_meta(dry_run)
    add_scene_node(dry_run)
    return 0


if __name__ == '__main__':
    sys.exit(main())
