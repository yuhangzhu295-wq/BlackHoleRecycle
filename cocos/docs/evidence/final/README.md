# V4 RC — final acceptance evidence

Curated 2026-09-21 from `artifacts/qa/portrait/`, which is gitignored. This
directory is the committed home for product-level evidence.

**Every report below was produced on the same source.** The last change to
`cocos/assets/**` was `2026-09-21 19:10:47` (local), and the sixteen runs span
`19:12`–`20:15`, so the reports and the source describe one build.

## Gate chain — 16/16 PASS

| scope | status | failures | consoleErrors | provenance | digest | files | run (local) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `save-resume` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `b162ac03` | 187 | 19:12 |
| `full` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `c42a45eb` | 187 | 19:20 |
| `pages` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `65c0d14b` | 187 | 19:22 |
| `arena` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `41f49e80` | 187 | 19:23 |
| `arena-ai` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `0baecc71` | 187 | 19:28 |
| `revive` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `978a7d1b` | 187 | 19:29 |
| `settlement` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `4b68a184` | 187 | 19:31 |
| `ui-full-flow` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `6e066e00` | 187 | 19:32 |
| `skins` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `950aa440` | 187 | 19:33 |
| `skin-unlock` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `41daa2b5` | 187 | 19:45 |
| `arena-timer` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `fe24f269` | 187 | 19:50 |
| `network` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `310970c2` | 187 | 19:51 |
| `regions` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `c9aa5158` | 187 | 19:55 |
| `progression` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `45bbea19` | 187 | 20:07 |
| `cell-lifecycle` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `911fcb0f` | 187 | 20:13 |
| `golden-city` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `551d1f84` | 187 | 20:15 |

A verdict is only credible when `status === "PASS"`, `failures` and
`consoleErrors` are empty, and `bundleProvenance.status` is `BUNDLE_STABLE` with
identical start and end digests. **Exit codes are not evidence**, and a stale
PASS is indistinguishable from a current one in this directory — always check
the digest and the run time together.

## Platform builds

`npm run build:all` — status **PASS**:

| platform | files | AppID |
| :--- | :--- | :--- |
| `web-mobile` | 187 | not-applicable |
| `wechatgame` | 191 | configured |
| `bytedance-mini-game` | 190 | placeholder |

`npm run preflight:release` — status **FAIL**:

- `wechatgame`: **PASS** — real AppID configured.
- `bytedance-mini-game`: **FAIL** — `bytedance-mini-game requires a real AppID for release preflight; found testappId.`

That failure is an **owner-owned blocker, not a code defect**: the Douyin build
still carries the Creator placeholder. Supply a real AppID and re-run
`npm run preflight:release`.

## Also in this directory

- `golden-city-composition-before.json` — the one-shot baseline. **Write-once: never re-capture it over the top.** The brief's `0.34` exists only as prose.
- `golden-city-gate.json` — the Golden City gate verdict and its deficits.
- `p0b-runtime-evidence.json` — the P0-B runtime probe.
- `*.png` — the runtime screenshots each scope names in its own report.

## How to re-verify

```bash
# one scope at a time: cocos/build/web-mobile is a single serial resource
npm run acceptance:v2 -- --scope=<scope>
```

Reports land in `artifacts/qa/portrait/` (gitignored); copy the ones you want to
keep here with `cp -p` so the run times survive. The browser launch passes
`--no-proxy-server`, so the chain no longer depends on the shell environment.
