"""Measure the WeChat build against WeChat's own package rules.

The 4 MB limit applies to the **main package**, and the DevTools states what that
excludes. Its own rule table (app.asar, `PACKAGE_SIZE_LIMIT`) reads:

    "desc":"主包尺寸（不包含插件）应小于 %s M"
    "descEn":"Main package size (without plugins) should be less than %s M"

with the plugin size reported separately as `PLUGIN_SIZE_IN_PACKAGE: '（含插件%s KB）'`.
So the engine plugin directory is NOT part of the main package budget, which is
the whole point of Cocos's separateEngine option.

In this build the plugin is `cocos/`: `plugin.json` declares its entry as
`base.js`, and its modules import each other by relative path (`./index-92d00b49.js`).
`cocos-js/` is NOT plugin code -- it holds project-side modules that import the
plugin through the import map (`"../cocos-js/index-92d00b49.js":
"plugin:cocos/index-92d00b49.js"`), including the custom render pipeline.

Two conventions are printed, because Cocos's FAQ contradicts the DevTools on this
point: it answers "will the engine code still be counted into the first package?"
with "According to WeChat's rules, it will still be counted." The DevTools is the
thing that enforces the limit, so its wording is used as the verdict and the
conservative figure is printed beside it.

Read-only; prints the size table for the first package and its largest files.

Usage: python scripts/measure_wechat_package.py
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cocos', 'build', 'wechatgame')
FIRST_PACKAGE_LIMIT = 4 * 1024 * 1024
DEFAULT_SUBPACKAGE_ROOTS = ('subpackages',)
# The engine plugin's local copy; excluded from the main package (see the module
# docstring). Named after the `plugins.<name>` key in game.json.
PLUGIN_ROOTS = ('cocos',)


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
    plugin = sum(
        size(os.path.join(ROOT, root)) for root in PLUGIN_ROOTS if os.path.isdir(os.path.join(ROOT, root)))
    main_package = total - subpackages - plugin
    conservative = total - subpackages

    print(f'total build output   {mb(total):7.2f} MB')
    for root in subpackage_roots:
        path = os.path.join(ROOT, root)
        if os.path.isdir(path):
            print(f'  subpackage {root:<12}{mb(size(path)):7.2f} MB  (separate download)')
    for root in PLUGIN_ROOTS:
        path = os.path.join(ROOT, root)
        if os.path.isdir(path):
            print(f'  plugin     {root:<12}{mb(size(path)):7.2f} MB  (excluded from the main package)')
    print(f'MAIN PACKAGE         {mb(main_package):7.2f} MB   limit {mb(FIRST_PACKAGE_LIMIT):.2f} MB')
    if main_package <= FIRST_PACKAGE_LIMIT:
        print('                     PASS')
    else:
        print('                     OVER by %.2f MB' % mb(main_package - FIRST_PACKAGE_LIMIT))
    print(f'  (conservative, plugin counted: {mb(conservative):.2f} MB'
          f' -- Cocos FAQ reads this way, the DevTools does not)')
    print()

    rows = []
    for base, dirs, files in os.walk(ROOT):
        rel = os.path.relpath(base, ROOT)
        if rel.split(os.sep)[0] in subpackage_roots + PLUGIN_ROOTS:
            dirs[:] = []
            continue
        for name in files:
            full = os.path.join(base, name)
            rows.append((os.path.getsize(full), os.path.join(rel, name)))

    print('--- 20 largest files in the main package ---')
    for value, name in sorted(rows, reverse=True)[:20]:
        print(f'  {value / 1024:9.1f} KB  {name}')

    print()
    print('--- main package by top-level directory ---')
    agg = {}
    for value, name in rows:
        key = name.split(os.sep)[0]
        agg[key] = agg.get(key, 0) + value
    for key, value in sorted(agg.items(), key=lambda item: -item[1]):
        print(f'  {mb(value):7.2f} MB  {key}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
