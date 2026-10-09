# AUDIO PROVENANCE

Every sound effect that ships is listed here with its origin and licence, so the
release checklist item "licensed audio" is a verifiable statement rather than a
note. Two sources are in use, and both permit commercial use and modification.

---

## 1. Original synthesis (6 cues)

`sfx_absorb`, `sfx_swallow`, `sfx_upgrade`, `sfx_kill`, `sfx_death`, `sfx_button`

- Author: this project (`scripts/generate_audio_assets.mjs`)
- Licence: original work, owned by the project
- Attribution: none required
- Commercial use / modification: unrestricted (it is ours)

These are **provisional synthesis**, not licensed library recordings. They are
real, audible, non-silent PCM WAVs and `test_audio_asset_contract.mjs` checks the
declared pitch shape of each one (absorb and upgrade rise; kill, swallow, death and
button fall). The contract states plainly that this is synthesis and that licensed
production audio remains a release-checklist item — which is what section 2 begins
to address.

## 2. Kenney CC0 library (1 cue)

`sfx_reward` — the settlement reward cue.

| Field | Value |
| --- | --- |
| File used | `Audio/confirmation_002.ogg` |
| Source pack | Kenney **Interface Sounds** (1.0, 2020-02-11) |
| Pack page | <https://kenney.nl/assets/interface-sounds> |
| Pack ZIP | `https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip` |
| Pack ZIP sha256 (first 16) | `f2193d072726d675` |
| Author | Kenney (<https://www.kenney.nl>) |
| Licence | **Creative Commons Zero (CC0)** — <http://creativecommons.org/publicdomain/zero/1.0/> |
| Licence text, verbatim | "This content is free to use in personal, educational and commercial projects. Support us by crediting Kenney or www.kenney.nl (this is not mandatory)" |
| Attribution required | **No** (credited anyway, above) |
| Commercial use | Permitted |
| Modification | Permitted |
| Modification performed | Converted OGG → mono 44.1 kHz 16-bit PCM WAV; peak normalised from 29353 to 13762 to match the six existing cues so it does not jump out of the mix |

A second pack was downloaded and licence-checked but **not used**: Kenney
**Impact Sounds** (1.0, 2019-12-19), CC0, same terms,
`https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip`
(sha256 prefix `029d734af1582474`). It is recorded here so a future pass does not
re-download and re-verify it.

## 3. Why only one library cue was adopted

Replacing the six synthesized cues with library recordings was **not** done, and
the reason is worth stating rather than leaving as an omission: the mapping would
have been chosen by filename and by measured duration / peak / spectral centroid,
because this environment cannot play audio back to a listener. Swapping six working,
contract-verified, purpose-shaped cues for six blind picks is as likely to make the
game sound worse as better, and it would be reported as an upgrade either way.

The gap that *was* real and unambiguous is that the game had **no settlement reward
cue at all**. That is now filled from a licence-verified CC0 source, normalised to
match. A full replacement pass should be done with someone listening; the two packs
above are the vetted, licence-clean source for it.

## 4. What is still open

- The six synthesized cues are still synthesis. A production audio pass (auditioned)
  remains a release-checklist item.
- No music track ships.
- `AudioDirector` honours `settings.sfx` (the Pause page toggle); there is no
  per-channel volume control, and the audio layer exposes no master gain, so no
  volume slider is offered rather than shipping one that does nothing.
