"""PHASE B: audit every shipped 3D asset's real world size, pivot and base.

`ObjectArtRegistry.unitScale()` is `(1,1,1)`, so a GLB's own units ARE world units
and nothing rescales them at runtime. That makes an audit meaningful: a car that is
12 units long or a can that is 2 units tall is wrong in the asset, and no camera
change hides it -- the directive says exactly that ("不通过不断增大缩小摄像机来掩盖
模型比例不一致").

Blender is run headless so the numbers come from the real importer rather than from
parsing GLB accessors by hand: the importer applies node transforms, and skipping
those is how a prop's size gets mis-reported.

Run:
  blender --background --python art-source/tools/audit_glb_scale.py -- <assets-dir> <out.json>
"""
import json
import os
import sys

import bpy
from mathutils import Vector


def argv_after_dashes():
    if '--' in sys.argv:
        return sys.argv[sys.argv.index('--') + 1:]
    return []


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_asset(path):
    if path.lower().endswith('.glb') or path.lower().endswith('.gltf'):
        bpy.ops.import_scene.gltf(filepath=path)
        return True
    return False


def measure():
    """World-space bounds of everything imported, plus asset-health facts."""
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        return None
    bpy.context.view_layer.update()

    lo = Vector((float('inf'),) * 3)
    hi = Vector((float('-inf'),) * 3)
    triangles = 0
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            lo = Vector((min(lo[i], world[i]) for i in range(3)))
            hi = Vector((max(hi[i], world[i]) for i in range(3)))
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)

    size = hi - lo
    centre = (hi + lo) / 2.0
    materials = sorted({slot.material.name for obj in meshes for slot in obj.material_slots if slot.material})
    # A GLB with no UV layer cannot show its texture, and renders as a flat colour
    # or magenta depending on the material -- worth flagging rather than discovering
    # in a screenshot.
    has_uv = all(len(obj.data.uv_layers) > 0 for obj in meshes)
    # UP IS Z, not Y. Blender's glTF importer rotates the root so the file's Y-up
    # becomes Z-up, and the file's Z (the model's length) lands on Blender's Y. The
    # first version of this script read Y as height and reported the sedan as
    # "1.50 wide x 2.55 tall x 1.30 long" -- a two-and-a-half-metre-tall car. The
    # axis convention is fixed here once rather than being re-derived per asset.
    return {
        'objects': len(meshes),
        'triangles': triangles,
        'size': [round(size.x, 3), round(size.y, 3), round(size.z, 3)],
        'height': round(size.z, 3),
        'footprint': [round(size.x, 3), round(size.y, 3)],
        # Base height: 0 means the model stands on the ground plane. Non-zero means
        # every placement of it floats or sinks by that much.
        'base_z': round(lo.z, 3),
        'top_z': round(hi.z, 3),
        # Pivot offset: how far the model's centre sits from its own origin in the
        # ground plane. A prop whose pivot is not on its footprint rotates and
        # scales about the wrong point.
        'pivot_offset': [round(centre.x, 3), round(centre.y, 3)],
        'grounded': abs(lo.z) < 0.02,
        'centred_pivot': abs(centre.x) < 0.05 and abs(centre.y) < 0.05,
        'has_uv': has_uv,
        'materials': materials,
    }


def main():
    args = argv_after_dashes()
    if len(args) < 2:
        raise SystemExit('usage: ... -- <assets-dir> <out.json>')
    root, out_path = args[0], args[1]

    assets = []
    for folder, _, files in os.walk(root):
        for name in sorted(files):
            if name.lower().endswith(('.glb', '.gltf')):
                assets.append(os.path.join(folder, name))
    assets.sort()

    report = []
    for path in assets:
        clear_scene()
        relative = os.path.relpath(path, root).replace('\\', '/')
        try:
            if not import_asset(path):
                continue
            facts = measure()
        except Exception as error:  # noqa: BLE001 - report, never abort the sweep
            facts = {'error': str(error)}
        if facts is None:
            facts = {'error': 'no mesh imported'}
        facts['asset'] = relative
        report.append(facts)
        status = facts.get('error') or 'ok'
        print('%-46s %s' % (relative, status))

    with open(out_path, 'w', encoding='utf-8') as handle:
        json.dump(report, handle, ensure_ascii=False, indent=1)
    print('\nwrote %s (%d assets)' % (out_path, len(report)))


if __name__ == '__main__':
    main()
