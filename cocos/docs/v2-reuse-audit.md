# BlackHoleRecycle V2 Reuse and License Audit

## Supersession

This document supersedes the production-asset rule in
[`reuse-audit-v2.md`](reuse-audit-v2.md).  The prior statement that compound
primitives can replace imported production models is obsolete for V2.  It may
remain as historical context but must not be used as implementation authority.

## Selection order

1. `DIRECT_USE` — an audited, compatible asset/module whose license permits
   commercial use and modification.
2. `FORK_AND_MODIFY` — retained license/notice and documented local changes.
3. `MODULE_REUSE` — use a focused mature module behind an adapter.
4. `REFERENCE_ONLY` — learn from an implementation without importing it.
5. `BUILD_FROM_SCRATCH` — only after recording why the above are unsuitable.

## V2 asset policy

- Production 3D models must be semantically correct: a chair must look like a
  chair, a vehicle must look like a vehicle, and a recycling machine must
  visibly read as a recycling machine.
- Imported models must be normalized in a Creator-saved prefab: one Cocos
  unit is approximately one metre, pivot/forward/ground offset are correct,
  and spawning code must not compensate with arbitrary scale multipliers.
- A simple authored low-poly model is acceptable when no safe reusable model
  exists.  Generic primitive assemblies are not a production substitute for a
  required semantic model.
- Every imported art, texture, font, audio file, or code module needs source,
  author, license, commercial permission, modification permission, and local
  path before it is used in a production page/build.
- UI panels/buttons must use Creator-saved Sprite or 9-slice/prefab assets.
  Native Graphics is limited to dynamic progress, debug, and simple effects.

## Candidate registry

| Need | Candidate source | Reuse level | License state | Decision | Verification required |
|---|---|---|---|---|---|
| Low-poly city props / roads / trees | Existing imported project art | MODULE_REUSE | Must be read from each asset notice/meta before promotion | Audit pending | Semantic mapping, unit normalization, Creator prefab inspection |
| Low-poly recycling machine chassis | Existing Creator-saved chassis prefabs | MODULE_REUSE | Repository provenance must be recorded | Audit pending | LV1 silhouette and runtime screenshot |
| Formal UI surfaces | Existing imported UI sprites and Cocos 9-slice | MODULE_REUSE | Local provenance audit pending | Audit pending | Creator component audit; no primary Graphics panel |
| Editor design overlay | Cocos Creator 3.8.3 official Vue panel template | DIRECT_USE | Editor-distributed template; retain source attribution note | Approved for tooling only | Creator panel loads and never mutates scene |
| Joystick input | Existing `PlayerController` path | MODULE_REUSE | Project code | Source-audited only | Native real-touch test, active touch ID, release stop |
| World streaming / pooling | Existing `InfiniteWorldManager` and Cocos NodePool | MODULE_REUSE | Project/Cocos engine | Source-audited only | 3×3 X/Z cells, directional traversal and five-minute stability |

## Required per-asset record

```text
ASSET_ID:
TYPE:
SOURCE_URL_OR_REPOSITORY:
AUTHOR:
LICENSE:
COMMERCIAL_ALLOWED:
MODIFICATION_ALLOWED:
ATTRIBUTION_REQUIRED:
LOCAL_PATH:
CREATOR_PREFAB_PATH:
SEMANTIC_ROLE:
NORMALIZATION_STATUS:
EVIDENCE:
```

No `PENDING` record may be represented as production-approved.
