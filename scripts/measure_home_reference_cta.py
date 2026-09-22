"""Measure the gold CTA and the secondary nav row in the 05-home reference PNG.

The design lock's verification table claims these were measured from the rendered
PNG. This measures the same PNG independently by colour, so the lock's numbers can
be checked against the actual raster rather than taken on trust.
"""
import numpy as np
from PIL import Image

PATH = "cocos/docs/design-reference/ui-v4-expanded/05-home.png"
img = Image.open(PATH).convert("RGB")
a = np.asarray(img).astype(int)
h, w, _ = a.shape
R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
print(f"image {w}x{h}")

# --- gold CTA: saturated warm yellow ---
gold = (R > 200) & (G > 140) & (G < 215) & (B < 110)
ys, xs = np.nonzero(gold)
if len(ys):
    # keep the largest connected vertical band: use the row with max coverage
    row_counts = gold.sum(axis=1)
    peak = int(np.argmax(row_counts))
    band = [peak]
    y = peak
    while y - 1 >= 0 and row_counts[y - 1] > w * 0.15:
        y -= 1; band.append(y)
    y = peak
    while y + 1 < h and row_counts[y + 1] > w * 0.15:
        y += 1; band.append(y)
    top, bot = min(band), max(band)
    sel = gold[top:bot + 1]
    cx = np.nonzero(sel.any(axis=0))[0]
    print(f"gold CTA   band y {top}-{bot}  centre {(top+bot)/2:.0f} "
          f"({(top+bot)/2/h*100:.1f}%)  x {cx.min()}-{cx.max()}  centre {(cx.min()+cx.max())/2:.0f} "
          f"height {bot-top+1}")

# --- secondary nav row: the three dark rounded cards near the bottom ---
dark = (R < 90) & (G < 90) & (B < 130)
row_counts = dark.sum(axis=1)
# search only the lower half
lower = row_counts.copy(); lower[: h // 2] = 0
peak = int(np.argmax(lower))
band = [peak]
y = peak
while y - 1 >= 0 and row_counts[y - 1] > lower[peak] * 0.5:
    y -= 1; band.append(y)
y = peak
while y + 1 < h and row_counts[y + 1] > lower[peak] * 0.5:
    y += 1; band.append(y)
top, bot = min(band), max(band)
sel = dark[top:bot + 1]
cols = np.nonzero(sel.any(axis=0))[0]
# split into contiguous column runs => one run per card
runs, start = [], cols[0]
for i in range(1, len(cols)):
    if cols[i] != cols[i - 1] + 1:
        runs.append((start, cols[i - 1])); start = cols[i]
runs.append((start, cols[-1]))
runs = [r for r in runs if r[1] - r[0] > 40]
print(f"nav row    band y {top}-{bot}  centre {(top+bot)/2:.0f} ({(top+bot)/2/h*100:.1f}%)")
print(f"  {len(runs)} card column runs (left -> right):")
for i, (l, r) in enumerate(runs, 1):
    print(f"    card {i}: x {l}-{r}  centre {(l+r)/2:.0f}  width {r-l+1}")
