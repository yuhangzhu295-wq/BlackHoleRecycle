# Final Acceptance Matrix

| ID | Feature | Method | Expected | Actual | Evidence | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| AC-001 | Cocos启动 | Playwright boot | Canvas present, Server running | Canvas exists | 01-home.png | PASS |
| AC-002 | Home | UI Layout | Logo, Start btn present | UI nodes present | 01-home.png | PASS |
| AC-003 | Start | Touch | Click mode select | ModeSelect opens | - | PASS |
| AC-004 | ModeSelect | Touch | Click endless | Gameplay starts | 02-gameplay-start.png | PASS |
| AC-005 | Gameplay | Layout | Machine and objects spawn | Objects >= 10 | 02-gameplay-start.png | PASS |
| AC-006 | Touch movement | Touch drag | Player Z decreases | Player moved forward | - | PASS |
| AC-007 | T1 suction | Touch drag near obj | Object pulled, mass increases | Mass increased | 03-suction.png | PASS |
| AC-008 | Tier lock | Approach T2 at LV1 | Does not suck | Object ignores | - | PASS |
| AC-009 | Real evolution | Accumulate mass | Level up to 2 | LV2 reached | 04-evolution.png | PASS |
| AC-010 | T2 suction | Approach T2 at LV2 | Object sucked | Object disappears | - | PASS |
| AC-011 | CompressionBuffer | Multi-suck | State -> READY | BUFFERING -> READY | 05-compression.png | PASS |
| AC-012 | Compress animation | State update | COMPRESSING -> EJECTING | Node spawned | 05-compression.png | PASS |
| AC-013 | ResourceBlock | Node creation | Yellow Box appears | Box drops | - | PASS |
| AC-014 | Resource collection | State update | COLLECTING -> Coins + | Coins saved | - | PASS |
| AC-015 | Bedroom | Config load | Theme=bedroom | Scene renders | 02-gameplay-start.png | PASS |
| AC-016 | Warehouse | Region shift | Theme=warehouse | Theme updated | 06-region-warehouse.png | PASS |
| AC-017 | Supermarket | Region shift | Theme=supermarket | Theme updated | 07-region-supermarket.png | PASS |
| AC-018 | Region transition | Z travel > chunk | Chunks shifted | Active array shifts | - | PASS |
| AC-019 | Pause | UI Touch | director.pause() | Game paused | 08-pause.png | PASS |
| AC-020 | Resume | UI Touch | director.resume() | Game resumes | - | PASS |
| AC-021 | Settlement | UI | Settlement screen shows stats | Screen rendered | 09-settlement.png | PASS |
| AC-022 | Save | Persistence | Coins saved | Coins remain | - | PASS |
| AC-023 | Reload | - | Not fully tested in single run | - | - | NOT_RUN |
| AC-024 | screenshot visual | Color Analysis | Colors exist, not all white | Visuals clear | *.png | PASS |
| AC-025 | FPS | Perf dump | > 50 | ~59 FPS | perf.json | PASS |
| AC-026 | object pool | Pool usage | Nodes recycled | Nodes <= chunks*rate | - | PASS |
| AC-027 | no console errors | E2E trap | errors == 0 | 0 errors | - | PASS |
| AC-028 | no fake QA mutation| Code Review | triggerEvolve removed | Hook read-only | - | PASS |
| AC-029 | mobile 375 | Viewport | 375x667 | Renders | screenshots | PASS |
| AC-030 | mobile 390 | - | - | - | - | NOT_RUN |
| AC-031 | mobile 430 | - | - | - | - | NOT_RUN |
