"""Repoint the comments that still describe the old lock-prompt wording.

`CompressibleObject` now prints `LV.N 可吞噬` (DESIGN_03's wording) where it used
to print `需要 LV.N`. The three contract assertions were updated with the change;
these five are comments and a doc comment that would otherwise keep describing a
string the code no longer produces -- the "docs are claims that rot" failure this
project has already hit once with the asset guide's canvas size.

Run: python scripts/retire_lock_prompt_wording.py
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD = '需要 LV.X'
NEW = 'LV.X 可吞噬'

FILES = (
    'cocos/assets/scripts/gameplay/CompressibleObject.ts',
    'cocos/assets/scripts/ui/EndlessHUDController.ts',
    'cocos/assets/scripts/ui/ArenaHUDController.ts',
    'cocos/assets/scripts/ui/TierLockPresenter.ts',
    'scripts/vertical_slice_endless_run.mjs',
)


def main():
    changed = 0
    for relative in FILES:
        path = os.path.join(ROOT, relative)
        with io.open(path, encoding='utf-8', newline='') as handle:
            text = handle.read()
        if OLD not in text:
            print('  (already current) %s' % relative)
            continue
        with io.open(path, 'w', encoding='utf-8', newline='') as handle:
            handle.write(text.replace(OLD, NEW))
        print('  updated %s (%d occurrence(s))' % (relative, text.count(OLD)))
        changed += 1

    # The production strings must not come back, so check the whole tree.
    remaining = []
    for folder, _, files in os.walk(os.path.join(ROOT, 'cocos', 'assets', 'scripts')):
        for name in files:
            if not name.endswith('.ts'):
                continue
            full = os.path.join(folder, name)
            with io.open(full, encoding='utf-8') as handle:
                if OLD in handle.read():
                    remaining.append(full)
    if remaining:
        raise SystemExit('still stale: %s' % ', '.join(remaining))
    print('no stale "%s" left under cocos/assets/scripts' % OLD)
    return 0


if __name__ == '__main__':
    sys.exit(main())
