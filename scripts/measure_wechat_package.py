"""Measure the WeChat build against WeChat's own package rules.

The 4 MB limit applies to the **first package**: everything that is not inside a
declared subpackage. That includes the engine plugin's local copy.

Cocos's own FAQ is explicit -- "After the engine plugin is enabled, will the
engine code still be counted into the first package? A: According to WeChat's
rules, it will still be counted." So `separateEngine` buys faster startup (a
shared plugin already cached on the device) and does not buy package budget. An
earlier version of this script excluded `cocos-js/` and therefore under-reported
the first package; the numbers below do not.

Read-only; prints the size table for the first package and its largest files.

Usage: python scripts/measure_wechat_package.py
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cocos', 'build', 'wechatgame')
FIRST_PACKAGE_LIMIT = 4 * 1024 * 1024
DEFAULT_SUBPACKAGE_ROOTS = ('subpackages',)


def size(path):
    if os.path.isfile(path):
        return os.path.getsize(path)
    total = 0
    for base, _, files in os.walk(path):
        for name in files:
            total += os.path.getsize(os.path.join(base, name))
    return total


def mb(value):
    return value / 1024 / 1024


def declared_subpackage_roots():
    """Roots from game.json, so the split follows the declaration, not a guess."""
    game_json = os.path.join(ROOT, 'game.json')
    if not os.path.exists(game_json):
        return DEFAULT_SUBPACKAGE_ROOTS
    with open(game_json, encoding='utf-8') as handle:
        game = json.load(handle)
    roots = []
    for entry in game.get('subpackages', []) or []:
        root = (entry.get('root') or '').strip('/')
        if root:
            roots.append(root.split('/')[0])
    return tuple(dict.fromkeys(roots)) or DEFAULT_SUBPACKAGE_ROOTS


def main():
    if not os.path.isdir(ROOT):
        print('no wechatgame build at', ROOT)
        return 1

    subpackage_roots = declared_subpackage_roots()
    total = size(ROOT)
    subpackages = sum(
        size(os.path.join(ROOT, root)) for root in subpackage_roots if os.path.isdir(os.path.join(ROOT, root)))
    first_package = total - subpackages

    print(f'total build output   {mb(total):7.2f} MB')
    for root in subpackage_roots:
        path = os.path.join(ROOT, root)
        if os.path.isdir(path):
            print(f'  subpackage {root:<12}{mb(size(path)):7.2f} MB  (separate download)')
    print(f'FIRST PACKAGE        {mb(first_package):7.2f} MB   limit {mb(FIRST_PACKAGE_LIMIT):.2f} MB')
    if first_package <= FIRST_PACKAGE_LIMIT:
        print('                     PASS')
    else:
        print('                     OVER by %.2f MB' % mb(first_package - FIRST_PACKAGE_LIMIT))
    print()

    rows = []
    for base, dirs, files in os.walk(ROOT):
        rel = os.path.relpath(base, ROOT)
        if rel.split(os.sep)[0] in subpackage_roots:
            dirs[:] = []
            continue
        for name in files:
            full = os.path.join(base, name)
            rows.append((os.path.getsize(full), os.path.join(rel, name)))

    print('--- 20 largest files in the first package ---')
    for value, name in sorted(rows, reverse=True)[:20]:
        print(f'  {value / 1024:9.1f} KB  {name}')

    print()
    print('--- first package by top-level directory ---')
    agg = {}
    for value, name in rows:
        key = name.split(os.sep)[0]
        agg[key] = agg.get(key, 0) + value
    for key, value in sorted(agg.items(), key=lambda item: -item[1]):
        print(f'  {mb(value):7.2f} MB  {key}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
