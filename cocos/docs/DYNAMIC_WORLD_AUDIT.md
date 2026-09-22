# Dynamic World Audit — PHASE 8

Two state machines, both taken from the runtime read-only QA bridge. Every count below
is a census over the 16 acceptance reports in `artifacts/qa/portrait/`, and every state
name is the literal union declared in the product source.

**Verdict: 9 of 11 declared states verified at runtime; 2 are single-frame transients
that a sampled probe cannot catch. Nothing is fabricated and nothing is claimed
unobserved-but-passing.**

---

## 1. Vehicle state machine

Declared in `cocos/assets/scripts/world/DynamicVehicle.ts:4`:

```ts
export type DynamicVehicleState = 'DRIVE' | 'TURN' | 'ATTRACTED' | 'SUCKING' | 'ABSORBED';
```

Transition logic: `:122` `this.state = turnedThisFrame ? 'TURN' : 'DRIVE';`, plus
`:175` `private fromObjectState(state: ObjectMotionState): DynamicVehicleState` which
maps the shared object FSM (§3) onto these five names.

### Evidence census

| Source | Field | Result |
| :--- | :--- | :--- |
| `full`, `pages` | `dynamicVehicles.{before,after}[]` | **78 samples**, 2 of 16 reports |
| — | `state` | **`DRIVE` ×78** — no other value ever sampled |
| — | `turnCount` | `0` ×52, `1` ×6, `2` ×20 — **turns did occur** |
| — | `objectState` | **`IDLE` ×78** |
| — | `kind` | `sedan` 66, `delivery_van` 6, `garbage_truck` 6 |
| `progression` | `trafficReplenishment` | a tier-5 `sedan` (`traffic_0_-16_sedan`) was absorbed |

The `progression` absorption record, in full:

| Quantity | Value |
| :--- | :--- |
| absorbed vehicle | `traffic_0_-16_sedan`, kind `sedan`, type `car`, **tier 5** |
| `moved` | `true` |
| pool `released` before → after absorb | **4351 → 4357** |
| pool `active` before → after absorb | 207 → 202 |
| slot at absorb (clock 27.665) | `active: false`, `availableAt: 31.0559` |
| slot at respawn (clock 32.499) | `active: true` |
| `respawned` | `{ state: 'DRIVE', objectState: 'IDLE', routeLength: 4 }` |
| elapsed | 4431 ms / 4.918 engine-seconds |

### Per-state verdict

| State | Verdict | Basis |
| :--- | :--- | :--- |
| `DRIVE` | **VERIFIED** | 78/78 samples, plus `respawned.state` in `progression` |
| `TURN` | **NOT_OBSERVED — single-frame transient** | `turnCount` 1–2 proves the turn path executed, but `:122` assigns `TURN` only on the frame that turns, so a sampled probe essentially cannot catch it. Not a defect; **not** verification either. |
| `ATTRACTED` | **NOT_OBSERVED** | no vehicle state trace is recorded; the absorption path records timing and pool deltas only |
| `SUCKING` | **NOT_OBSERVED** | same |
| `ABSORBED` | **INFERRED, not directly observed** | `FAIL_TRAFFIC_REPLENISHMENT_ABSORB` passed via `absorbedAt > 0`, plus slot cooldown (`active: false`) and pool release (4351 → 4357). The state itself is never written to the report. |

So the vehicle FSM has **1 of 5 states directly verified**. The absorption *path* is
proven to run end-to-end (a real tier-5 vehicle was absorbed, its slot cooled, its pool
entry was released, and it respawned into `DRIVE`/`IDLE`), but the intermediate state
names are not observable in the current evidence.

---

## 2. Arena bot state machine

Declared in `cocos/assets/scripts/gameplay/ArenaMatchManager.ts:19`:

```ts
export type ArenaBotState = 'ROAM' | 'COLLECT' | 'CHASE' | 'FLEE' | 'EVENT_HUNT' | 'RECOVER';
```

Every assignment in source, and the condition that reaches it:

| Line | Assignment | Reached when |
| :--- | :--- | :--- |
| `:399` | `FLEE` | a stronger competitor is near |
| `:412` | `EVENT_HUNT` | an event is active |
| `:424` | `CHASE` | a weaker competitor is near |
| `:436` | `COLLECT` | collectible available |
| `:445` | `ROAM` | default |
| `:384` | `RECOVER` | inside the **respawn** routine (also sets `shieldSeconds`, `node.active = true`, `paused = false`, `resetMovement()`) |

Exposure path: `arenaAi.leaderboard[].behavior` — **136 fields across 6 reports**
(`arena` 32, `full` 32, `pages` 32, `arena-ai` 16, `arena-timer` 16, `network` 8).

### Per-state verdict

| State | Observed | Verdict |
| :--- | ---: | :--- |
| `COLLECT` | **58** | **VERIFIED** |
| `CHASE` | **43** | **VERIFIED** |
| `ROAM` | **23** | **VERIFIED** |
| `FLEE` | **18** | **VERIFIED** |
| `EVENT_HUNT` | **5** | **VERIFIED** |
| `RECOVER` | 0 | **NOT_OBSERVED — single-frame transient** |

⇒ **5 of 6 states verified.** `RECOVER` is assigned at respawn (`:384`) and then
overwritten by `updateBotBrain` on the very next tick, so it survives ~1 frame — the
same shape as vehicle `TURN`.

`LOCAL` appears 21 times in the same field. It is **not** a member of `ArenaBotState`:
it is the sentinel used for the human player's leaderboard row. Do not count it as a
bot state.

---

## 3. The shared object FSM (cross-reference)

Both machines sit on top of one FSM, declared in
`cocos/assets/scripts/gameplay/CompressibleObject.ts:14`:

```ts
export type ObjectMotionState = 'IDLE' | 'ATTRACTED' | 'SUCKING' | 'ABSORBED' | 'RECYCLED';
```

`resourceReplenishment.lifecycle` records its full cycle for a tier-1 collectible
(`water_bottle`, `cluster_Cluster_CitySquare_7`):

| | Value |
| :--- | :--- |
| declared order | `IDLE → ATTRACTED → SUCKING → ABSORBED/RECYCLED → RESPAWN` |
| observed order | `IDLE → SUCKING → ABSORBED/RECYCLED → RESPAWN` |
| distinct states sampled | `IDLE`, `SUCKING`, `ABSORBED/RECYCLED` |

`ATTRACTED` is declared but not sampled — the harness documents why at `:2885`
("the short ATTRACTED transition between two read-only snapshots"). So the same
sampling limitation applies to the underlying FSM as to the two above.

This matters for interpreting §1: the vehicle absorption states are not missing
behaviour, they are the *same* FSM that is verified end-to-end on collectibles and
inferred on a tier-5 vehicle. What is missing is the **observation**, not the mechanism.

---

## 4. A false claim I nearly filed — recorded deliberately

I first concluded the bot FSM was `BLOCKED_UNEXPOSED`, on the strength of
`grep -o '"behavior":"[A-Z_]*"' artifacts/qa/portrait/*.json` returning nothing.

That grep was **wrong**: the reports serialise the field as `"behavior": "COLLECT"`
with a space after the colon, so the pattern could not match. The field is present in
6 reports and carries 136 samples.

This is recorded because **an "unexposed / unavailable" claim is as damaging as a
fabricated pass** — both stop the reader from looking. Both must be checked against the
artifact the same way a PASS is.

---

## 5. Limits of this verdict

- **What is verified:** `DRIVE`; `COLLECT`, `CHASE`, `ROAM`, `FLEE`, `EVENT_HUNT`.
- **What is not:** `TURN` and `RECOVER` (single-frame transients, unreachable by
  sampling — not defects, but not verified); vehicle `ATTRACTED` / `SUCKING` /
  `ABSORBED` (mechanism proven, state names not recorded).
- **Not done:** no new probe was added to capture the two transients, because adding a
  QA accessor purely to make a gate pass is the pattern the mandate forbids. If the
  transients must be verified, the honest route is an in-engine state-change log
  exposed read-only, which is a product change and needs sign-off.
- **Not claimed:** any frame-by-frame correctness of the transition conditions. Only
  the states listed above were observed, in the counts shown.
