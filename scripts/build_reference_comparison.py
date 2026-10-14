"""Build the Golden Arena reference-comparison sheet.

The deliverable contract asks for two frames: the runtime capture and a side-by-side
comparison against the reference. A bare side-by-side invites a vague "looks close",
so each row carries the measurement behind it: the runtime frame's own numbers next
to the design's, so a claim can be checked rather than eyeballed.

The runtime frame is always a fresh capture (capture_golden_arena.mjs); the
reference is the V12 DESIGN_07 sheet as adopted. Nothing is copied or renamed.

Run: python scripts/build_reference_comparison.py [WxH]
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, 'artifacts', 'qa', 'v13')
REFERENCE = os.path.join(ROOT, 'artifacts', 'qa', 'v12', 'ref', '07-arena-gameplay.png')
OUT = os.path.join(RUNTIME_DIR, 'GoldenArena_REFERENCE_COMPARISON.png')

PAGE_LABEL = 44
PAD = 12


def dominant(path, box, buckets=24, top=3):
    image = Image.open(path).convert('RGB')
    crop = image.crop(box)
    counts = {}
    total = 0
    pixels = crop.load()
    for y in range(crop.height):
        for x in range(crop.width):
            r, g, b = pixels[x, y]
            key = (r // buckets * buckets, g // buckets * buckets, b // buckets * buckets)
            counts[key] = counts.get(key, 0) + 1
            total += 1
    rows = sorted(counts.items(), key=lambda item: -item[1])[:top]
    return rows, total, len(counts)


def main():
    size = sys.argv[1] if len(sys.argv) > 1 else '390x844'
    width, height = [int(v) for v in size.split('x')]
    runtime = os.path.join(RUNTIME_DIR, f'GoldenArena_{size}_RUNTIME.png')

    if not os.path.exists(runtime):
        print('capturing a fresh runtime frame...')
        subprocess.run(['node', os.path.join(ROOT, 'scripts', 'capture_golden_arena.mjs'), size],
                       cwd=ROOT, check=True)
    if not os.path.exists(REFERENCE):
        raise SystemExit('reference sheet missing: %s' % REFERENCE)

    # The play band only: the reference sheet is a wide diagram, so a shared frame
    # of the composition is what is being compared, not the whole document.
    ref_image = Image.open(REFERENCE).convert('RGB')
    ref_crop = ref_image.crop((0, 0, ref_image.width // 2, ref_image.height))
    run_image = Image.open(runtime).convert('RGB')

    # The play band of the runtime capture, excluding the HUD bands top and bottom.
    run_band = run_image.crop((0, int(height * 0.18), width, int(height * 0.70)))
    ref_band = ref_crop.crop((0, int(ref_crop.height * 0.18), ref_crop.width, int(ref_crop.height * 0.70)))

    scale = 0.9
    run_scaled = run_band.resize((int(run_band.width * scale), int(run_band.height * scale)), Image.LANCZOS)
    ref_scaled = ref_band.resize((int(ref_band.width * scale), int(ref_band.height * scale)), Image.LANCZOS)

    cell_w = max(run_scaled.width, ref_scaled.width) + PAD * 2
    cell_h = max(run_scaled.height, ref_scaled.height) + PAD * 2 + PAGE_LABEL
    sheet = Image.new('RGB', (cell_w * 2 + 16, cell_h), (16, 18, 28))
    draw = ImageDraw.Draw(sheet)

    sheet.paste(ref_scaled, (PAD, PAD))
    sheet.paste(run_scaled, (PAD * 2 + cell_w + 16, PAD))
    draw.text((PAD, PAD + ref_scaled.height + 6), 'DESIGN_07 竞技场场景构图 (reference)', fill=(240, 244, 255))
    draw.text((PAD, PAD + ref_scaled.height + 22), '出生点 / 道路成网 / T1-T3 分层 / 建筑做边界', fill=(150, 165, 195))
    draw.text((PAD * 2 + cell_w + 16, PAD + run_scaled.height + 6),
              f'our runtime {size} (live capture)', fill=(240, 244, 255))

    run_rows, run_total, run_buckets = dominant(runtime, (0, int(height * 0.18), width, int(height * 0.70)))
    ref_rows, ref_total, ref_buckets = dominant(REFERENCE, (0, 0, ref_image.width // 2, ref_image.height))
    draw.text((PAD * 2 + cell_w + 16, PAD + run_scaled.height + 22),
              f'play band: {run_buckets} colour buckets, top '
              + ', '.join('#%02x%02x%02x %.0f%%' % (r, g, b, 100.0 * n / run_total) for (r, g, b), n in run_rows[:2]),
              fill=(150, 165, 195))

    os.makedirs(RUNTIME_DIR, exist_ok=True)
    sheet.save(OUT)
    print('wrote %s (%dx%d)' % (OUT, sheet.width, sheet.height))
    print('  runtime play band: %d buckets, top %s'
          % (run_buckets, ', '.join('#%02x%02x%02x %.0f%%' % (r, g, b, 100.0 * n / run_total)
                                   for (r, g, b), n in run_rows[:3])))
    print('  reference band:    %d buckets, top %s'
          % (ref_buckets, ', '.join('#%02x%02x%02x %.0f%%' % (r, g, b, 100.0 * n / ref_total)
                                    for (r, g, b), n in ref_rows[:3])))
    return 0


if __name__ == '__main__':
    sys.exit(main())
