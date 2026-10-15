"""VISUAL_REFERENCE_REVIEW -- measure the arena frame against DESIGN_07, with a
floor that fails on regression.

The colour-bucket count is the only composition metric this project has that is
cheap, repeatable and sensitive to content changes, and it has two known traps
that this gate states rather than hides:

  * It measures the TAKING of one frame, not the contents of the scene. It moved
    27.2 -> 32.5 when four resource clusters were added, because more objects
    change the AI's paths and therefore where the camera ends up. So it is a
    regression floor, never a target to optimise directly.
  * A bucket count is evidence that we are flatter than the reference, not
    evidence of WHERE the fault is. The arena's leading colour is the asphalt
    road, and asphalt is supposed to be uniform -- chasing that number by
    repainting the road would have been the wrong fix, and was, for one round.

What this gate does NOT measure, stated so nobody reads a PASS as more than it
is: whether the frame reads as the same game, whether objects are recognisable,
whether the composition is pleasant, and whether the reference's own colours were
matched. Those need eyes.

Run:
  python scripts/review_visual_reference.py
  python scripts/review_visual_reference.py --update-baseline
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CAPTURE = os.path.join(ROOT, 'artifacts', 'qa', 'v13', 'arena', 'arena-390x844.png')
REFERENCE = os.path.join(ROOT, 'artifacts', 'qa', 'v12', 'ref', '07-arena-gameplay.png')
BASELINE = os.path.join(ROOT, 'cocos', 'docs', 'evidence', 'v13', 'visual-reference-baseline.json')

BUCKET_STEP = 24
PLAY_BAND = (0.30, 0.95)
NEAR_FIELD = (0.66, 0.85)


def measure(path, band):
    image = Image.open(path).convert('RGB')
    width, height = image.size
    crop = image.crop((0, int(band[0] * height), width, int(band[1] * height)))
    pixels = list(crop.getdata())
    buckets = {}
    for pixel in pixels:
        key = (pixel[0] // BUCKET_STEP, pixel[1] // BUCKET_STEP, pixel[2] // BUCKET_STEP)
        buckets[key] = buckets.get(key, 0) + 1
    top = max(buckets.values())
    luma = sum(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in pixels) / len(pixels)
    return {
        'size': [width, height],
        'buckets': len(buckets),
        'top_share': round(100.0 * top / len(pixels), 2),
        'mean_luma': round(luma, 1),
        'distinct_colours': len(set(pixels)),
    }


def main():
    for path in (CAPTURE, REFERENCE):
        if not os.path.exists(path):
            print('[visual-reference] FAIL: missing %s' % os.path.relpath(path, ROOT))
            return 1

    ours = measure(CAPTURE, PLAY_BAND)
    theirs = measure(REFERENCE, PLAY_BAND)
    ours_near = measure(CAPTURE, NEAR_FIELD)

    print('[visual-reference] play band y=%.2f..%.2f' % PLAY_BAND)
    print('  %-14s %8s %10s %10s %10s' % ('', 'buckets', 'top share', 'mean luma', 'colours'))
    for label, data in (('ours', ours), ('DESIGN_07', theirs)):
        print('  %-14s %8d %9.1f%% %10.1f %10d'
              % (label, data['buckets'], data['top_share'], data['mean_luma'], data['distinct_colours']))
    print('  near field: %d buckets, top share %.1f%%'
          % (ours_near['buckets'], ours_near['top_share']))
    print('  ratio to reference: %.2f of its buckets' % (ours['buckets'] / theirs['buckets']))

    if '--update-baseline' in sys.argv:
        os.makedirs(os.path.dirname(BASELINE), exist_ok=True)
        with open(BASELINE, 'w', encoding='utf-8', newline='\n') as handle:
            json.dump({
                'note': 'Composition floor for the arena frame. `buckets_floor` is the lowest '
                        'play-band bucket count accepted, `top_share_ceiling` the highest share '
                        'one colour may take. Both are set from a measurement of a frame that was '
                        'looked at, not from the reference: the gap to DESIGN_07 is content '
                        'density, and a floor near the reference would fail every run.',
                'capture': os.path.relpath(CAPTURE, ROOT).replace(os.sep, '/'),
                'reference': os.path.relpath(REFERENCE, ROOT).replace(os.sep, '/'),
                'measured': ours,
                'reference_measured': theirs,
                'buckets_floor': int(ours['buckets'] * 0.95),
                'top_share_ceiling': round(ours['top_share'] * 1.05, 2),
            }, handle, indent=2)
            handle.write('\n')
        print('[visual-reference] baseline written -> %s' % os.path.relpath(BASELINE, ROOT))
        return 0

    if not os.path.exists(BASELINE):
        print('[visual-reference] FAIL: no baseline at %s' % os.path.relpath(BASELINE, ROOT))
        print('  Run with --update-baseline once the current frame has been looked at.')
        return 1

    with open(BASELINE, encoding='utf-8') as handle:
        baseline = json.load(handle)
    failures = []
    if ours['buckets'] < baseline['buckets_floor']:
        failures.append('play-band buckets %d fell below the floor %d (baseline measured %d)'
                        % (ours['buckets'], baseline['buckets_floor'], baseline['measured']['buckets']))
    if ours['top_share'] > baseline['top_share_ceiling']:
        failures.append('the leading colour took %.1f%%, above the ceiling %.1f%%'
                        % (ours['top_share'], baseline['top_share_ceiling']))
    if failures:
        print('[visual-reference] FAIL:')
        for failure in failures:
            print('  - %s' % failure)
        return 1
    print('[visual-reference] PASS: %d buckets (floor %d), leading colour %.1f%% (ceiling %.1f%%).'
          % (ours['buckets'], baseline['buckets_floor'], ours['top_share'],
             baseline['top_share_ceiling']))
    print('  NOT MEASURED: whether the frame reads as the same game, whether objects are'
          ' recognisable, and whether the composition is pleasant. Those need eyes.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
