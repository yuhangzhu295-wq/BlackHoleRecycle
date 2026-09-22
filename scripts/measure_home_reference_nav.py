"""Isolate the three secondary nav cards in 05-home.png (below the gold CTA)."""
import numpy as np
from PIL import Image

a = np.asarray(Image.open("cocos/docs/design-reference/ui-v4-expanded/05-home.png").convert("RGB")).astype(int)
h, w, _ = a.shape
R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]

# The cards are dark navy fills with white outlines. Look only below y=980 to
# clear the gold CTA (band 842-949) and its dark outline.
dark = (R < 100) & (G < 100) & (B < 150)
dark[:980] = False
rows = dark.sum(axis=1)
peak = int(np.argmax(rows))
band = [peak]
y = peak
while y - 1 >= 980 and rows[y - 1] > rows[peak] * 0.5:
    y -= 1; band.append(y)
y = peak
while y + 1 < h and rows[y + 1] > rows[peak] * 0.5:
    y += 1; band.append(y)
top, bot = min(band), max(band)
sel = dark[top:bot + 1]
cols = np.nonzero(sel.any(axis=0))[0]
runs, start = [], cols[0]
for i in range(1, len(cols)):
    if cols[i] != cols[i - 1] + 1:
        runs.append((start, cols[i - 1])); start = cols[i]
runs.append((start, cols[-1]))
runs = [r for r in runs if r[1] - r[0] > 30]
print(f"nav row band y {top}-{bot}  centre {(top+bot)/2:.0f} ({(top+bot)/2/h*100:.1f}%)")
print(f"{len(runs)} card runs, left -> right:")
for i, (l, r) in enumerate(runs, 1):
    print(f"  card {i}: x {l}-{r}  centre {(l+r)/2:.0f}  width {r-l+1}")
print()
print("contract home.json: BtnMode x=152, BtnSkin x=360, BtnMachine x=568, all centreY=1108")
