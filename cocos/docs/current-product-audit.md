# Current Product Audit — 2026-09-05

## Verified implemented paths

- `GameManager`, `BlackHoleMachine`, `CompressionSystem`, `CompressibleObject`, `SaveService`, `EventBus`, and `ObjectPool` are production runtime code using Cocos Creator 3.8.3 engine types. The Web QA bridge is read-only; the acceptance suite does not use a mass grant, teleport, or target-position setter.
- Portrait rendering uses Cocos `FIXED_WIDTH`, so the game owns the entire physical portrait canvas rather than putting a 9:16 WebGL surface inside tall-phone browser letterbox. The verified 375×667, 390×844, and 430×932 frames all have a full-size game canvas. The lower-right joystick is kept inside a 92px westward drag-safe margin on a 390px phone; this is a real input-layout correction, not an acceptance exception.
- Player movement is continuous, camera-relative velocity from a fixed portrait joystick. It locks the first touch ID, ignores secondary touches, stops on release, and has been exercised in all eight directions through real CDP touch.
- Endless play uses `InfiniteWorldManager`'s 2D X/Z cell grid with origin rebasing. The full runtime acceptance drives north, south, east, and west long-distance travel and checks active streamed cells rather than legacy Z-only chunks.
- The six progression regions now share one authoritative mapping with the streamed environment and semantic resource clusters: `bedroom → RESIDENTIAL`, `warehouse → WAREHOUSE`, `supermarket → SUPERMARKET`, `parking → PARKING`, `construction → CONSTRUCTION`, and `city → DOWNTOWN`. The HUD reads the live progression-region name, not an unrelated coordinate-hashed district.
- Region consistency does not remove road life from the opening map: the residential bedroom area streams real route-driven sedans. Full runtime acceptance observed their movement and two completed turns before exercising the remaining progression flow.
- The complete five-level machine path is live rather than configuration-only. A separate touch-only Web Mobile run reached LV2 in Bedroom, LV3 in Warehouse (compression chamber visible), LV4 in Supermarket (gravity wing visible), LV5 in Parking (singularity frame visible), then absorbed a Creator-rendered T5 city sedan. The run recorded a final mass of 591215 kg and T1–T5 absorption counts from the ordinary compression system.
- Gameplay objects retain their actual `CompressibleObject` suction state machine. Their semantic visuals are resolved through `ObjectArtRegistry` to audited Creator-imported art; there is no chair-to-tire or sofa-to-van fallback.
- The vertical slice is real at runtime: LV1 starts at T1/2.4m, visibly locks T2, absorbs T1 to evolve, reaches LV2/3.4m, then absorbs T2. Current full acceptance evidence recorded LV2, mass 1540, 30 T1 and 1 T2 absorbed.
- `Game.scene` contains Creator-saved portrait Home, Mode Select, gameplay HUD, Arena HUD, Revive, Pause, Settlement, and Machine Info page nodes. Their actions drive live state and real save data rather than placeholder buttons.
- Arena currently has one local player and seven active Cocos bots. Every row of its leaderboard, respawn, object claim, combat result, and settlement reward is derived from the local match state. The UI labels this truthfully as local 1v7. Separately, the Colyseus room now keeps an eight-competitor authoritative roster by filling vacant slots with server-owned bots; joining humans replace a bot in a stable slot and leaving humans are replaced by one.

## Runtime and build evidence

- `npm run typecheck:cocos`: 0 TypeScript errors.
- `npm run test:cocos`: 6/6 logic regressions pass. This is source-level regression evidence only, not an engine-runtime pass.
- `npm run acceptance:v2 -- --scope=full`: official Cocos Creator 3.8.3 Web Mobile build plus real Playwright/CDP touch. The latest full run passed with browser console errors `[]` and no acceptance failures: full-height portrait canvas at three phone sizes, eight-direction joystick input, 500m north/south/west/east travel with origin rebasing, dynamic-road turns, T1 lock → LV2 → T2 intake, and local-arena revive/settlement.
- `npm run acceptance:v2 -- --scope=regions`: a separate official Cocos Web Mobile build and one continuous 942m CDP-touch traversal. It visited Bedroom, Warehouse, Supermarket, Parking, Construction, and City, verified each live theme id plus the matching streamed district and Creator-imported landmark, captured six independent 390×844 screenshots, and completed with browser console errors `[]`.
- `npm run acceptance:v2 -- --scope=progression`: an official Cocos Web Mobile build and real joystick-only LV1→LV5 progression. It records all high-level regional consumption, verifies active Creator-saved assembly parts at LV3–LV5, and requires a real T5 city object to transition through the shared absorption FSM.
- `npm run build:all`: Web Mobile, WeChat Game, and ByteDance Mini Game packages built successfully with Creator 3.8.3. The ByteDance package still uses `testappId`, so it is buildable but not release-ready.
- `arena-server/` has a separate Colyseus integration test that connects two actual SDK clients to one server-authoritative room and observes replicated movement, pickup suction, LV2/T2 progression, defeat, dropped recyclable mass, and respawn. The Cocos Web client can make a real browser WebSocket connection to that room and forwards its actual visible joystick at 20Hz. The network acceptance route proves a real player session, server input-sequence advancement, and a server-replicated position change with browser console errors `[]`; it uses no state setter or mock room.

## Deliberate boundaries / remaining work

1. **Online arena is not product-complete.** The server owns multiplayer joining, bot fill, input sequencing, stale-input timeout, position integration, pickup suction, LV1-to-LV2 progression, combat, dropped fragments, and respawn. A Cocos browser transport/probe and actual joystick forwarding are verified, but the shipped local-arena renderer is not yet driven from server snapshots; server-finalized reward persistence, match-end authority, a public `wss://` endpoint, and client snapshot rendering remain required before the game may advertise human matchmaking.
2. **Visual direction is structurally aligned, not pixel-identical.** The five current V2 pages use the required portrait hierarchy, real data, city/park context, card/ribbon/panel vocabulary, and real navigation. The reference art has substantially richer bespoke illustration, character art, and UI texture work than the audited open assets currently in the repository.
3. **Release ownership is required.** A real ByteDance Mini Game AppID and a public TLS WebSocket deployment are account-owned configuration. They must be supplied by the project owner; the repository deliberately does not guess credentials or IDs.
4. **Device evidence is still pending.** Browser Web Mobile runtime evidence is real, but it is not a substitute for a WeChat or ByteDance developer-tool/device session.

## Status

- `VERTICAL_SLICE_GATE`: PASS
- `PORTRAIT_RUNTIME_GATE`: PASS
- `LOCAL_ARENA_GATE`: PASS
- `CROSS_PLATFORM_BUILD_GATE`: PASS (release IDs excluded)
- `SIX_REGION_TRAVERSAL_GATE`: PASS
- `FULL_MACHINE_PROGRESSION_GATE`: PASS
- `ONLINE_HUMAN_ARENA_GATE`: IN PROGRESS
- `VISUAL_DESIGN_MATCH`: PARTIAL — same product structure and interaction language, not bespoke-reference equivalence
- `RELEASE_GATE`: BLOCKED BY OWNER-PROVIDED APPID / DEPLOYMENT
