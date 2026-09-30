# V6 Render Profile

Profile version: v6.0.0, defined in cocos/assets/scripts/core/RenderProfile.ts.

## Why this file exists

Before V6 the render configuration had no single home. It was spread across five
places with no shared constants:

1. the serialized Game.scene (camera, light, ambient, shadows, skybox, fog)
2. PortraitGameplayCameraController (fov, fov axis, design size, two presets)
3. WorldArtLibrary (a private 56-entry world palette plus the atlas mapping)
4. MachineVisualLibrary (five machine assembly colours)
5. BlackHoleMachine plus MeshFactory (a third, independent core-mesh palette)

The world palette and the machine palettes shared nothing, and Game.scene
disagreed with Bootstrap.scene on ambient, shadowPcf, csmLevel, shadowDistance
and fogColor.

RenderProfile.ts now holds the profile and the four consumers read from it. It is
deliberately a constants module, not an engine pipeline rebuild.

## Effect model

| field | value |
|---|---|
| effect | builtin-unlit |
| USE_TEXTURE | set per material, true only when a colour atlas is bound |
| USE_VERTEX_COLOR | false always |

### builtin-standard is excluded by measurement

WorldArtLibrary used to carry a comment claiming builtin-standard breaks Web
Mobile in Creator 3.8.3. That claim was verified rather than trusted. In a live
session every opening-cell material was swapped to builtin-standard,
DirectionalLight.shadowEnabled and scene.globals.shadows were enabled, and
shadowCastingMode was set on all 975 renderers:

| signal | before | after |
|---|---|---|
| 3D world visible | yes | no, the entire world disappears |
| engine errors | 0 | Error 3804 plus about 975 localSetLayout failures |
| frame | normal city | flat background, only HUD and joystick remain |

So the V6 art-direction goals for lighting and soft shadow are not reachable by
switching the material model on this build. Any shading cue has to be produced
inside the unlit model: per-part tint variation on shared materials, and soft
blob-shadow decals under the player and large props.

## Camera

| field | value |
|---|---|
| design resolution | 720 x 1280, FIXED_WIDTH |
| fov | 44 |
| fov axis | 0, CameraFOVAxis.VERTICAL |
| endless preset | offset (0, 20.0, 18.5), pitch -42 |
| arena preset | offset (0, 44.0, 27.0), pitch -55 |

Measured on the settled opening cell: playerScreenYRatio 0.5734, which sits in
the brief's 55-65 percent band, and playerWidthRatio 0.2258 against a 0.22-0.30
band.

## Palette roles

UI_PALETTE names the roles rather than leaving hex literals scattered:

| role | value |
|---|---|
| primary | #ffbd1f |
| secondary | #8b62f4 |
| hud panel | #0a1a33 |
| light sky | #7fc9f2 |
| surface | #fffdf7 |
| player body | #281660 |
| player rim | #e0d5ff |
| tier 1 to 5 | #7dd3fc / #69bf71 / #fbc02d / #ff8f70 / #ef476f |

WORLD_PALETTE keeps the world colours keyed by WorldArtKind. The Tiny Treats park
set is white on purpose: that pack ships one authored colour atlas and tinting it
would flatten the fountain water, hedge, flower and wood hues.

MACHINE_PALETTE and MACHINE_ASSEMBLY_PALETTE hold the singularity core colours and
the five assembly part colours.

## Scene lighting, recorded for reference

Under builtin-unlit these values produce no image content. They are recorded so
the scene and this profile can be reconciled deliberately instead of drifting:
DirectionalLight #fffaf0 at 65000 illuminance with shadows off, ambient sky
#3380cc at 20000 with ground albedo #333333, shadows disabled at 1024 with pcf 0,
skybox enabled but not drawn (cameraClearFlags 14 has no SKYBOX bit), clear colour
#333333, tone mapping 0.

## Regression evidence

Extracting the profile changed no rendered colour. The opening cell reports the
same distinct-material counts before and after (Buildings 4, Park 2, Props 6,
Ground 1, Roads 1), consoleErrors is empty, and the opening frame's dark-surface
ratio is 0.
