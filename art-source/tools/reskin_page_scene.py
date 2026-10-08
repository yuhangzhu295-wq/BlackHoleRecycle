"""Re-skin a page in Game.scene onto the V9.5 art, surgically.

`cocos/assets/prefabs/ui/*.prefab` are **not** what runs: the scene's page nodes
are plain nodes with `_prefab: null`, so those prefabs are dead weight and editing
them changes nothing on screen. The running pages are authored in `Game.scene`,
which is what this edits.

Two things this is careful about:

- **Scope is a page subtree, not node names.** `BtnStart` exists on Home,
  EndlessReady and ArenaReady; `CoinPanel` on Home and the skin page; `StatRow_*`
  and `ArenaRankRow_*` are shared between the endless and arena settlement
  layouts. A name-based match silently re-skins other pages.
- **The file is edited as text.** Reloading and re-dumping a 52k-line scene is
  lossless but reorders every line, which makes the change unreviewable.

Only sprite frame references and, where the new art is a 9-slice, the sprite type
are touched. No node is added, moved, renamed or removed, so every controller
binding keeps working.

Run: python art-source/tools/reskin_page_scene.py --page=home [--apply]
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
# SIMPLE where the art's aspect already matches the authored node; SLICED where
# the source is a 9-slice frame, or its rounded ends or corners would stretch.
RESKIN = {
    'home': ('HomePage', {
        'Background': ('field_home', False),
        # The brand plate carries no text; the name is a Creator Label added under
        # Logo by art-source/tools/add_logo_label.py.
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
    }),

    'pause': ('PausePage', {
        # Pause and Revive share the dialog language: the board, a ribbon and the
        # two capsule actions.
        'PauseCard': ('board_settlement', True),
        'PauseRibbon': ('ribbon_settlement', False),
        'BtnResume': ('capsule_yellow', True),
        'BtnSettle': ('capsule_purple', True),
        'BtnHome': ('capsule_purple', True),
    }),
    'revive': ('RevivePage', {
        'ReviveCard': ('board_settlement', True),
        'ReviveRibbon': ('ribbon_settlement', False),
        'ReviveBlackHoleHero': ('home_hero_blackhole', False),
        'ReviveAccentPurple': ('panel_white', True),
        'ReviveAccentOrange': ('panel_white', True),
        'ReviveAccentBlue': ('panel_white', True),
        'CountdownPanel': ('panel_white', True),
        'BtnRevive': ('capsule_yellow', True),
        'BtnGiveUp': ('capsule_purple', True),
    }),
    'machine': ('MachineInfoPage', {
        'MachineCard': ('board_settlement', True),
        'MachineRibbon': ('ribbon_settlement', False),
        'CurrentPanel': ('panel_white', True),
        'LevelRow1': ('panel_white', True),
        'LevelRow2': ('panel_white', True),
        'LevelRow3': ('panel_white', True),
        'LevelRow4': ('panel_white', True),
        'LevelRow5': ('panel_white', True),
        'BtnBack': ('capsule_purple', True),
    }),
    'skin': ('SkinSelectionPage', {
        'SkinPageCard': ('board_settlement', True),
        'SkinRibbon': ('ribbon_settlement', False),
        'CoinPanel': ('pill_dark', True),
        'PreviewPanel': ('panel_white', True),
        'PreviewBlackHole': ('home_hero_blackhole', False),
        'SkinCard_1': ('panel_white', True),
        'SkinCard_2': ('panel_white', True),
        'SkinCard_3': ('panel_white', True),
        'SkinCard_4': ('panel_white', True),
        'SkinCard_5': ('panel_white', True),
        # The accents are tinted per skin by the controller, so they take a
        # neutral rounded square rather than a coloured source.
        'SkinAccent_1': ('panel_white', True),
        'SkinAccent_2': ('panel_white', True),
        'SkinAccent_3': ('panel_white', True),
        'SkinAccent_4': ('panel_white', True),
        'SkinAccent_5': ('panel_white', True),
        'BtnSkin_1': ('capsule_purple', True),
        'BtnSkin_2': ('capsule_purple', True),
        'BtnSkin_3': ('capsule_purple', True),
        'BtnSkin_4': ('capsule_purple', True),
        'BtnSkin_5': ('capsule_purple', True),
    }),
    'ready': ('EndlessReadyPage', {
        'Background': ('field_mode', False),
        'MapPreview': ('panel_white', True),
        'BtnStart': ('capsule_yellow', True),
    }),
    'mode': ('ModeSelectPage', {
        'Background': ('field_mode', False),
        # The reference gives its cards a thick white outer frame; the shipped
        # cards were flat illustrated rectangles with no border.
        'BtnArena': ('mode_card_arena_framed', False),
        'BtnEndless': ('mode_card_endless_framed', False),
    }),
    'settlement': ('SettlementPage', {
        'SettlementCard': ('board_settlement', True),
        'SettlementRibbon': ('ribbon_settlement', False),
        'StatRow_223': ('panel_white', True),
        'StatRow_143': ('panel_white', True),
        'StatRow_63': ('panel_white', True),
        'StatRow_-17': ('panel_white', True),
        'StatRow_-97': ('panel_white', True),
        'ArenaLeaderboardPanel': ('panel_white', True),
        'ArenaRankRow_1': ('panel_white', True),
        'ArenaRankRow_2': ('panel_white', True),
        'ArenaRankRow_3': ('panel_white', True),
        'ArenaRankRow_4': ('panel_white', True),
        'ArenaRankRow_5': ('panel_white', True),
        # Rank badges take the reference's own colour ramp: gold, then blue, then
        # purple for the rest.
        'ArenaRankBadgePanel_1': ('badge_gold', True),
        'ArenaRankBadgePanel_2': ('badge_blue', True),
        'ArenaRankBadgePanel_3': ('badge_purple', True),
        'ArenaRankBadgePanel_4': ('badge_purple', True),
        'ArenaRankBadgePanel_5': ('badge_purple', True),
        'ArenaPlayerRow': ('panel_local_row', True),
        'ArenaPlayerBadgePanel': ('badge_blue', True),
        'ArenaStatMassPanel': ('panel_white', True),
        'ArenaStatKillsPanel': ('panel_white', True),
        'ArenaStatTimePanel': ('panel_white', True),
        'ArenaRewardPanel': ('reward_bar', True),
        'BtnRestart': ('capsule_yellow', True),
        'BtnHome': ('capsule_purple', True),
    }),
}

SPRITE_RE = re.compile(r'\{\s*"__type__": "cc\.Sprite",.*?\n  \}', re.S)
OWNER_RE = re.compile(r'"node": \{\s*"__id__": (\d+)\s*\}')


def frame_uuid(asset):
    meta = json.loads((V95 / f'{asset}.png.meta').read_text(encoding='utf-8'))
    assert 'f9941' in meta['subMetas'], f'{asset} has no spriteFrame sub-asset'
    return f"{meta['uuid']}@f9941"


def subtree_ids(data, root_name):
    nodes = {i: o for i, o in enumerate(data)
             if isinstance(o, dict) and o.get('__type__') == 'cc.Node'}
    root = next((i for i, o in nodes.items() if o.get('_name') == root_name), None)
    if root is None:
        raise SystemExit(f'Game.scene has no {root_name} node')

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
    parser.add_argument('--page', required=True, choices=sorted(RESKIN))
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    root_name, mapping = RESKIN[args.page]
    text = SCENE.read_text(encoding='utf-8')
    data = json.loads(text)
    if not isinstance(data, list):
        data = data.get('data', data)

    subtree, nodes = subtree_ids(data, root_name)
    print(f'{root_name} subtree: {len(subtree)} nodes')
    by_name = {}
    for index in subtree:
        by_name.setdefault(nodes[index].get('_name'), []).append(index)

    sprite_blocks = []
    for match in SPRITE_RE.finditer(text):
        owner = OWNER_RE.search(match.group(0))
        if owner:
            sprite_blocks.append((int(owner.group(1)), match.start(), match.end(), match.group(0)))

    edits = []
    for node_name, (asset, sliced) in mapping.items():
        targets = set(by_name.get(node_name, []))
        if not targets:
            print(f'  SKIP {node_name}: not in the {root_name} subtree')
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
        print(f'  {node_name:26} -> {asset}{" (sliced)" if sliced else ""}   [{hit}]')

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
