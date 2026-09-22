# Render Audit — V5 (PHASE 6)

Question this answers: does the build actually render in the intended
**Low Poly / Casual Cartoon / mobile mini-game** style, and where does it not?

Method: read the runtime material state out of a real portrait build, verify the
geometry budget from the source models, measure the rendered frames themselves, and
inspect the shared textures the pipeline samples. Every number below is reproducible
from a named file in this repository.

Evidence sources:

| Source | What it proves |
| --- | --- |
| `artifacts/qa/portrait/acceptance-report-pages.json` → `openingWorldVisuals` | the authored opening cell's real renderer/material state (42 renderers, 43 slots) |
| same report → `machineMaterialDiagnostics` | the player machine's real material state |
| `cocos/assets/scripts/world/WorldArtLibrary.ts` | how materials are built at runtime (`createRuntimeMaterial`, `getColorTexture`) |
| `.scratch/tri-count.py` | triangle budget per model, from the source geometry |
| `.scratch/render-read.py` over `artifacts/qa/portrait/*.png` | colour concentration, flatness and detail density of the real frames |
| `art/world/pretty-park/tiny_treats_texture_1.png`, `art/vehicles/Textures/colormap.png` | what the sampled atlases actually contain |

---

## 1. What the render pipeline actually is

`WorldArtLibrary.createRuntimeMaterial` builds every world material at runtime:

```ts
material.initialize({
  effectName: 'builtin-unlit',
  defines: { USE_TEXTURE: Boolean(texture), USE_VERTEX_COLOR: false }
});
material.setProperty('mainTexture', texture);
material.setProperty('mainColor', colorFromWORLD_ART_COLORS);
```

Three consequences, all confirmed at runtime:

1. **There is no lighting and no shadow.** Every one of the 43 material slots in the
   authored opening cell reports effect `builtin-unlit` — 43 of 43, with **0 invalid**.
   The same holds for the player machine's assemblies (`AbyssBase #4a1d8f`,
   `HoleInner #05040e`, swirls `#ffb8ff`, rim `#c8adff`), so there is no magenta
   fallback anywhere in the frame.
2. **Surface colour comes from a flat tint multiplied by a flat-patch atlas.** The
   atlases are palette grids, not textures in the illustrative sense:
   `tiny_treats_texture_1.png` is 1024×1024 of flat swatches,
   `art/vehicles/Textures/colormap.png` is the same design at 512×512. A model's UV
   lands inside one patch, so the sampled texel is a constant and `mainColor` decides
   the final colour.
3. **`builtin-standard` is deliberately avoided.** The in-code reason is that assigning
   it to copied glTF sub-meshes triggers a Web Mobile local-descriptor-set error in
   Creator 3.8.3. The unlit path is the tested mobile-safe one.

## 2. "Low Poly" — measured, not asserted

`.scratch/tri-count.py` resolves every mesh primitive's index accessor in each
glTF/GLB JSON chunk and sums `count / 3`:

| Metric | Value |
| --- | --- |
| Models parsed | 62 (the 63rd is a binary FBX) |
| Triangles, total | **37,732** |
| Max | 3,124 — `art/vehicles/garbage-truck.glb` |
| Median | **312** |
| Min | 12 — `world/environment/tile-low.glb`, one quad |
| Models above 5,000 triangles | **0** |

A median model of 312 triangles with a hard ceiling of 3,124 is unambiguously Low Poly.
The ground tile is literally two triangles.

## 3. Frame measurements

`.scratch/render-read.py` on the real 390×844 captures. `dominantShare` is the fraction
of the frame taken by its single most common colour; `dominantStdDev` is the per-channel
standard deviation of the *original* pixels inside that bucket, which is what separates
a flat fill from a textured surface that merely quantises into the same bucket.

| Screen | distinctColours | dominantShare | dominantStdDev | edgeDensity |
| --- | --- | --- | --- | --- |
| `home` | 3962 | 0.044 | r=2.31 | 16.42 |
| `lv5-city` (endless gameplay) | 1839 | **0.525** | r=**0.08** | **11.00** |
| `arena` | 3106 | 0.250 | r=0.01 | 17.93 |
| `arena-ai-start` | 3110 | 0.251 | r=0.01 | 18.06 |
| `settlement` | 1999 | 0.045 | r=0.75 | 19.77 |
| `skin-selection` | 1725 | 0.096 | r=1.06 | 19.13 |

Reading:

- **Endless gameplay is the least detailed screen in the build**: one flat colour
  covers **52.5 %** of the frame with a standard deviation of **0.08 / 255**, and edge
  density is 11.00 against 16–20 everywhere else. The dominant colour is a light green
  — the ground plane.
- **This is the atlas working as designed, not a missing texture.** A stddev of 0.08
  means the pixels are effectively identical, which is exactly what sampling one flat
  patch of a palette atlas produces. This was verified by opening the atlas rather than
  inferred — the first draft of this audit read the flatness as a broken texture and was
  wrong.
- The arena's 25 % flat fill (`rgb(56,72,112)`, stddev 0.01) is the same phenomenon on
  the arena floor.
- UI-heavy screens (settlement, skin selection, home) carry 4–10× more colour variety
  and 1.5–1.8× the edge density of gameplay.

## 4. "Casual Cartoon" and "mobile mini-game"

Supported:

- Portrait 390×844 with a safe-area HUD, a circular touch joystick, and rounded
  high-contrast UI pills — the expected mobile mini-game furniture.
- Colour-led readability: objects are identified by saturated flat colour against a
  light ground, which survives a small screen and a cheap unlit shader.
- The HUD text carries hard outlines and drop shadows, so it stays legible over any
  background.

**The gap is style coherence between the key-art and the world.** The home screen is a
detailed dithered isometric illustration (3962 distinct colours, dominant share 4.4 %,
edge density 16.42). The gameplay world is flat palette patches under no lighting
(1839 colours, dominant share 52.5 %, edge density 11.00). The home screen advertises a
level of surface detail the game does not render. This is the single largest visual
inconsistency in the build and it is a decision for the owner, not a bug: either the
key-art should be simplified toward the in-game look, or the world should gain
per-surface variation.

## 5. The one structural weakness in the render

Cross-referenced to `GAMEPLAY_ASSET_AUDIT.md` §1.2:
`WorldArtLibrary.hydrateAuthoredOpeningMaterials` assigns **one `WorldArtKind` per
authored group node**, so the authored `Props` group's 17 renderers (fountain, water,
leaves, benches, trashcans, flowers, hedges, cobbles, fences) all receive the tint
`#c68b59`. Because the atlas is a flat-patch palette, the tint *is* the surface colour —
so 17 distinct props render as one repeated brown block, and `tree-large` renders with
`treeSmall`'s green. Spawned copies of the same assets are bound per-kind and look
different from the authored ones in the same scene.

## 6. Limits of this audit

- **No independent visual reviewer is available in this environment**, so
  `VISUAL_REVIEW` is `NOT_AVAILABLE`. The frame measurements in §3 were taken by the
  same agent that wrote this document; they are quantitative and reproducible, but they
  are not a substitute for a separate human or agent judging whether the result looks
  good.
- **Only the authored Golden City cell is covered by the runtime material report.**
  `WorldCompositionProbe.getCurrentCellVisualDiagnostics` walks `cell.node.children`,
  while spawned props hang under `InfiniteWorldRoot`. The authored-vs-spawned comparison
  in §5 is therefore derived from code paths, not from a runtime reading of the spawned
  copies.
- **The report exposes materials, not textures.** `openingWorldVisuals` emits
  `{ effect, valid, color }` per slot. Texture binding is asserted from
  `createRuntimeMaterial` plus direct inspection of the atlas files, not from the
  diagnostic.
