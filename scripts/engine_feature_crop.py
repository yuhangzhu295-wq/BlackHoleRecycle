"""Build the `modules.includeModules` list for Cocos feature cropping.

The editor stores this as an array of feature keys under
`engine -> modules.includeModules` (see builtin/engine's
`getPreviewShippedFeatures`). Leaving it unset ships every feature.

This derives the list from the engine's own `cc.config.json` instead of typing
one out: start from every feature, drop the ones this game provably does not
use, then re-add anything a kept feature declares in `dependentModules` so the
list stays closed.

Usage: python scripts/_engine_feature_crop.py [--write]
"""
import json
import os
import sys

ENGINE = os.path.join(
    'C:/ProgramData/cocos/editors/Creator/3.8.3/resources/resources/3d/engine', 'cc.config.json')
PROJECT_ENGINE_SETTINGS = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'cocos', 'settings', 'v2', 'packages', 'engine.json')

# Features whose components never appear in any scene or prefab.
#
# Evidence (see the scene/prefab `__type__` inventory): no cc.Spine, no
# cc.DragonBones*, no cc.TiledMap, no cc.VideoPlayer, no cc.WebView, no XR
# component, no Collider/RigidBody, no cc.LightProbeGroup, no
# ParticleSystem2D, no SkinnedMeshRenderer. The only `Terrain` string in the
# project is a leftover material name, so `terrain` is deliberately KEPT --
# dropping a feature whose effect a serialized material names risks a
# missing-effect error for a few tens of KB.
UNUSED = [
    'dragon-bones',
    'spine',
    'tiled-map',
    'video',
    'webview',
    'xr',
    'light-probe',
    'particle-2d',
    'physics-ammo',
    'physics-cannon',
    'physics-physx',
    'physics-builtin',
    'physics-framework',
    'physics-2d-box2d',
    'physics-2d-box2d-wasm',
    'physics-2d-builtin',
    'physics-2d-framework',
    'marionette',
    'procedural-animation',
    'meshopt',
    'occlusion-query',
    'debug-renderer',
    'geometry-renderer',
    # No SkinnedMeshRenderer anywhere. Safe to drop even though this feature also
    # provides the `animation` module: the `animation` feature provides it too.
    'skeletal-animation',
]


def load_features():
    with open(ENGINE, encoding='utf-8') as handle:
        return json.load(handle)['features']


def close(features, keep):
    """Re-add any feature a kept feature depends on, transitively."""
    added = True
    while added:
        added = False
        for name in list(keep):
            for dependency in features.get(name, {}).get('dependentModules', []):
                if dependency in features and dependency not in keep:
                    keep.add(dependency)
                    added = True
    return keep


def main():
    features = load_features()
    every = set(features)
    missing = [name for name in UNUSED if name not in features]
    if missing:
        raise SystemExit('unknown feature name(s): ' + ', '.join(missing))

    keep = close(features, every - set(UNUSED))
    dropped = sorted(every - keep)
    # A feature that something kept still depends on must not be dropped.
    for name in keep:
        for dependency in features[name].get('dependentModules', []):
            if dependency in dropped:
                raise SystemExit(f'{name} depends on dropped {dependency}')

    print(f'features total : {len(every)}')
    print(f'kept           : {len(keep)}')
    print(f'dropped ({len(dropped)}): ' + ', '.join(dropped))
    print()
    print('includeModules = ' + json.dumps(sorted(keep), ensure_ascii=False))

    if '--write' in sys.argv:
        with open(PROJECT_ENGINE_SETTINGS, encoding='utf-8') as handle:
            settings = json.load(handle)
        settings['modules'] = {'includeModules': sorted(keep)}
        with open(PROJECT_ENGINE_SETTINGS, 'w', encoding='utf-8', newline='') as handle:
            handle.write(json.dumps(settings, ensure_ascii=False, indent=2) + '\n')
        print()
        print('wrote', os.path.normpath(PROJECT_ENGINE_SETTINGS))
    return 0


if __name__ == '__main__':
    sys.exit(main())
