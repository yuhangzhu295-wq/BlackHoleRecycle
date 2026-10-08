"""Re-skin the Home page in Game.scene onto the V9.5 art, surgically.

`cocos/assets/prefabs/ui/HomePage.prefab` is **not** what runs: the scene's
`HomePage` node is a plain node with `_prefab: null`, so the prefab is dead weight
and editing it would change nothing on screen. The running Home page is authored
directly in `Game.scene`, which is what this edits.

Two things this is careful about:

- **Scope is the HomePage subtree, not node names.** `BtnStart` exists on Home,
  EndlessReady and ArenaReady; `CoinPanel` exists on Home and the skin page. A
  name-based match silently re-skins other pages, which the dry run showed it
  doing (three `BtnStart` hits, three `CoinPanel` hits) before this was scoped.
- **The file is edited as text.** Reloading and re-dumping a 52k-line scene is
  lossless but reorders every line, which makes the change unreviewable.

No node is added, moved, renamed or removed, so every controller binding
(`CoinValue`, `MachineValue`, `MachineName`, `HeroBlackHole`, `BtnStart`,
`BtnMode`, `BtnMachine`, `BtnSkin`) keeps working.

Run: python art-source/tools/reskin_home_scene.py [--apply]
"""
import argparse
import json
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
SCENE = REPO / 'cocos' / 'assets' / 'scenes' / 'Game.scene'
V95 = REPO / 'cocos' / 'assets' / 'game_art' / 'ui' / 'v95'

# node name -> (v95 asset, sliced?)
# The background and the hero keep their authored aspect exactly, so they stay
# SIMPLE. The capsule and the pills are 9-slice sources, so their Sprites must be
# SLICED or the rounded ends stretch.
RESKIN = {
    'Background': ('field_home', False),
    # The brand plate carries no text; the name is a Creator Label added
    # under Logo by art-source/tools/add_logo_label.py.
    'Logo': ('logo_brand_home', False),
    'HeroBlackHole': ('home_hero_blackhole', False),
    'BtnStart': ('capsule_yellow', True),
    # Composed card art: the vignette inside its white frame with clear space
    # below for the caption, at the card's own aspect so nothing is cropped.
    'BtnMode': ('card_home_mode', False),
    'BtnSkin': ('card_home_skin', False),
    'BtnMachine': ('card_home_machine', False),
    'CoinPanel': ('pill_dark', True),
    'MachineStatus': ('pill_dark', True),
}

SPRITE_RE = re.compile(r'\{\s*"__type__": "cc\.Sprite",.*?\n  \}', re.S)
OWNER_RE = re.compile(r'"node": \{\s*"__id__": (\d+)\s*\}')


def frame_uuid(asset):
    meta = json.loads((V95 / f'{asset}.png.meta').read_text(encoding='utf-8'))
    assert 'f9941' in meta['subMetas'], f'{asset} has no spriteFrame sub-asset'
    return f"{meta['uuid']}@f9941"


def home_subtree(data):
    """Ids of every node under HomePage, so the edit cannot reach another page."""
    nodes = {i: o for i, o in enumerate(data)
             if isinstance(o, dict) and o.get('__type__') == 'cc.Node'}
    root = next((i for i, o in nodes.items() if o.get('_name') == 'HomePage'), None)
    if root is None:
        raise SystemExit('Game.scene has no HomePage node')

    def children(index):
        return [c['__id__'] for c in nodes[index].get('_children', []) if isinstance(c, dict)]

    seen = set()
    stack = [root]
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        stack.extend(children(current))
    return seen, nodes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='write the change')
    args = parser.parse_args()

    text = SCENE.read_text(encoding='utf-8')
    data = json.loads(text)
    if not isinstance(data, list):
        data = data.get('data', data)

    subtree, nodes = home_subtree(data)
    print(f'HomePage subtree: {len(subtree)} nodes')

    # Name -> ids, restricted to the Home subtree.
    by_name = {}
    for index in subtree:
        by_name.setdefault(nodes[index].get('_name'), []).append(index)

    sprite_blocks = []
    for match in SPRITE_RE.finditer(text):
        owner = OWNER_RE.search(match.group(0))
        if owner:
            sprite_blocks.append((int(owner.group(1)), match.start(), match.end(), match.group(0)))

    edits = []
    for node_name, (asset, sliced) in RESKIN.items():
        targets = set(by_name.get(node_name, []))
        if not targets:
            print(f'  SKIP {node_name}: not in the Home subtree')
            continue
        uuid = frame_uuid(asset)
        hit = 0
        for owner, block_start, block_end, block in sprite_blocks:
            if owner not in targets:
                continue
            new_block = re.sub(
                r'"__uuid__": "[^"]+",(\s*)\n(\s*)"__expectedType__": "cc\.SpriteFrame"',
                lambda m: f'"__uuid__": "{uuid}",{m.group(1)}\n{m.group(2)}"__expectedType__": "cc.SpriteFrame"',
                block)
            new_block = re.sub(r'"_type": \d+,', f'"_type": {1 if sliced else 0},', new_block, count=1)
            if new_block != block:
                edits.append((block_start, block_end, new_block))
                hit += 1
        print(f'  {node_name:14} -> {asset}{" (sliced)" if sliced else ""}   [{hit} sprite(s)]')

    # Back to front, so an earlier replacement cannot invalidate a later offset.
    for block_start, block_end, new_block in sorted(edits, reverse=True):
        text = text[:block_start] + new_block + text[block_end:]

    print(f'\n{len(edits)} sprite reference(s) re-pointed')
    if args.apply:
        SCENE.write_text(text, encoding='utf-8')
        print(f'wrote {SCENE.relative_to(REPO)}')
    else:
        print('dry run; pass --apply to write')


if __name__ == '__main__':
    sys.exit(main())
