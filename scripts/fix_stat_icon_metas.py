"""Give the new stat icons a proper SpriteFrame sub-asset.

A PNG that appears outside the editor is imported by the headless build as
`texture` only -- no `f9941` spriteFrame sub-asset -- so a scene cannot reference
it as a Sprite's frame. The fix is to write the meta by hand with
`imported: false` on every level, so Creator re-imports it on the next build and
produces the spriteFrame sub-asset under the uuid we chose.

The shape is copied from an existing working v95 sprite meta rather than invented:
hand-writing the sprite-frame `userData` risks a malformed import, and a known-good
shape with a new uuid cannot be wrong in a way the importer does not fix.

Run: python scripts/fix_stat_icon_metas.py
"""
import json
import os
import sys
import uuid as uuidlib

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
V95 = os.path.join(ROOT, 'cocos', 'assets', 'game_art', 'ui', 'v95')
TEMPLATE = os.path.join(V95, 'badge_gold.png.meta')
ICONS = ('icon_stat_mass.png', 'icon_stat_items.png', 'icon_stat_level.png',
         'icon_stat_best.png', 'icon_stat_machine.png')
SIZE = 72


def main():
    with open(TEMPLATE, encoding='utf-8') as handle:
        template = json.load(handle)

    for icon in ICONS:
        meta_path = os.path.join(V95, icon + '.meta')
        if not os.path.exists(meta_path):
            print('skip (no meta):', icon)
            continue
        # Never re-key an icon that already imports correctly. Assigning a fresh
        # uuid to a meta a scene already references leaves that reference
        # dangling: an earlier run of this script rewrote the three Settlement
        # icons and silently broke their SpriteFrames in Game.scene. Only a meta
        # that is genuinely missing its spriteFrame sub-asset gets a new uuid.
        existing = json.load(open(meta_path, encoding='utf-8'))
        importers = {sub.get('importer') for sub in (existing.get('subMetas') or {}).values()}
        if 'sprite-frame' in importers:
            print('skip (already imports):', icon)
            continue
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
        print('wrote meta for %s (uuid %s)' % (icon, fresh))
    return 0


if __name__ == '__main__':
    sys.exit(main())
