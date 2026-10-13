"""Give the new avatar PNG a proper SpriteFrame sub-asset.

A PNG that appears outside the editor is imported by the headless build as
`texture` only -- no `f9941` spriteFrame sub-asset -- so a scene cannot reference
it as a Sprite's frame. This is the same trap the settlement stat icons and the
revive hero both fell into. The fix is a hand-written meta with `imported: false`
on every level, so Creator re-imports on the next build and produces the
spriteFrame sub-asset under the uuid chosen here.

The shape is copied from an existing working v95 sprite meta rather than invented;
a known-good shape with a new uuid cannot be wrong in a way the importer will not
fix, whereas hand-writing the sprite-frame `userData` can produce a malformed
import that fails silently.

Run: python scripts/ensure_avatar_meta.py
"""
import json
import os
import sys
import uuid as uuidlib

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
V95 = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'ui', 'v95')
TEMPLATE = os.path.join(V95, 'badge_gold.png.meta')
TARGET = os.path.join(V95, 'avatar_blackhole.png')
SIZE = 96


def main():
    if not os.path.exists(TARGET):
        raise SystemExit('missing %s -- run art-source/vector/generate_avatar_disc.py first' % TARGET)

    meta_path = TARGET + '.meta'
    if os.path.exists(meta_path):
        existing = json.load(open(meta_path, encoding='utf-8'))
        importers = {sub.get('importer') for sub in (existing.get('subMetas') or {}).values()}
        if 'sprite-frame' in importers:
            print('skip (already imports): avatar_blackhole.png')
            return 0

    with open(TEMPLATE, encoding='utf-8') as handle:
        template = json.load(handle)

    fresh = uuidlib.uuid4().hex
    fresh = '-'.join([fresh[:8], fresh[8:12], fresh[12:16], fresh[16:20], fresh[20:32]])
    meta = json.loads(json.dumps(template))
    meta['uuid'] = fresh
    meta['imported'] = False
    for key, sub in (meta.get('subMetas') or {}).items():
        sub['uuid'] = '%s@%s' % (fresh, key)
        sub['imported'] = False
        data = sub.get('userData') or {}
        data['imageUuidOrDatabaseUri'] = fresh
        if sub.get('name') == 'spriteFrame':
            data.update({
                'width': SIZE, 'height': SIZE,
                'rawWidth': SIZE, 'rawHeight': SIZE,
                'trimX': 0, 'trimY': 0,
                'borderTop': 0, 'borderBottom': 0, 'borderLeft': 0, 'borderRight': 0,
                'packable': False,
            })
        sub['userData'] = data

    with open(meta_path, 'w', encoding='utf-8', newline='') as handle:
        handle.write(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    print('wrote meta for avatar_blackhole.png (uuid %s)' % fresh)
    return 0


if __name__ == '__main__':
    sys.exit(main())
