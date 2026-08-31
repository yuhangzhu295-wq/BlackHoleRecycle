# Final Acceptance Matrix

| ID | Feature | Method | Expected | Actual | Evidence | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| AC-001 | Cocos启动 | Playwright Boot | Canvas与QA挂钩就绪 | 引擎正常启动且Canvas有效 | 01-home.png | PASS |
| AC-002 | Home首页 | UI Screen State | uiScreen == Home | uiScreen: Home | 01-home.png | PASS |
| AC-003 | Start按钮 | CDP Touch Btn_Start | 切换至 ModeSelect | uiScreen: ModeSelect | 02-mode-select.png | PASS |
| AC-004 | ModeSelect模式 | CDP Touch Btn_Endless | uiScreen == Gameplay & 物体数>=15 | Objects: 108 | 03-gameplay.png | PASS |
| AC-005 | Gameplay画面 | Render check | 3D 场景与机器渲染正常 | State: PLAYING | 03-gameplay.png | PASS |
| AC-006 | Touch移动 | CDP Touch Drag | Player 发生 3D 位移 | ΔZ: -14.46m | - | PASS |
| AC-007 | T1吸附 | Move near T1 | Object absorbed & Mass/Buffer increases | Absorbed: 4 | 04-suction.png | PASS |
| AC-008 | Tier Lock | LV1 vs T2 check | MaxTier 锁定且未被瞬吸 | MaxTier: 1 | 05-tier-lock.png | PASS |
| AC-009 | 真实升级 | Mass accumulation | Machine level >= 2 | LV: 2 | 06-lv2.png | PASS |
| AC-010 | LV2 T2吸附能力 | MaxTier check | MaxTier increases to T2 | MaxTier: 2 | 06-lv2.png | PASS |
| AC-011 | 压缩缓冲 | Compression State History | State sequence contains BUFFERING & COMPRESSING | History: COMPRESSING->EJECTING->COLLECTING->IDLE->BUFFERING->READY->COMPRESSING->EJECTING->COLLECTING->IDLE->BUFFERING->READY->COMPRESSING->EJECTING->COLLECTING->IDLE | 07-compression.png | PASS |
| AC-012 | 资源方块 | Spawn ResourceBlock | 3D ResourceBlock generated & stored | Blocks: 5 | 07-compression.png | PASS |
| AC-013 | 同一T2吸收 | LV2 Re-visit T2 | Target T2 absorbed by LV2 machine | Absorbed Count: 19 | - | PASS |
| AC-015 | 卧室区域 | Spawn Theme | Theme bedroom active | bedroom | 08-warehouse.png | PASS |
| AC-016 | 仓库区域 | Region transition | Theme warehouse generated | warehouse | 08-warehouse.png | PASS |
| AC-017 | 超市区域 | Region transition | Theme supermarket generated | supermarket | 09-supermarket.png | PASS |
| AC-018 | 区域切换 | Continuous travel | Active regions sequence >= 3 | 3 regions visited | 09-supermarket.png | PASS |
| AC-019 | Pause暂停 | CDP Touch Btn_Pause | gameState == PAUSED & uiScreen == Pause | State: PAUSED | 10-pause.png | PASS |
| AC-019-FREEZE | 暂停完全静止 | Freeze Check (2s) | Position Z unchanged | Z: -215.68m | 10-pause.png | PASS |
| AC-020 | Resume恢复 | CDP Touch Btn_Resume | gameState == PLAYING & 重新接收操作 | State: PLAYING | 10-pause.png | PASS |
| AC-021 | 结算展示 | CDP Touch Btn_PauseSettle | uiScreen == Settlement & Session统计真实 | Absorbed: 25, Coins: 107 | 11-settlement.png | PASS |
| AC-022 | 数据存档 | saveService.save() | 金币数据与升级状态持久化 | Coins: 2497 | - | PASS |
| AC-023 | 刷新保留 | page.reload() | 刷新后存档数据完全保留 | Coins: 2497 | - | PASS |
| AC-030 | 390分辨率 | Viewport 390x844 | UI与3D画面正常适配 | Normal | viewport-390.png | PASS |
| AC-031 | 430分辨率 | Viewport 430x932 | UI与3D画面正常适配 | Normal | viewport-430.png | PASS |
| AC-029 | 375分辨率 | Viewport 375x667 | UI与3D画面正常适配 | Normal | 01-home.png | PASS |
| AC-027 | 控制台错误 | Error Listener | Console Error == 0 | Errors: 0 | - | PASS |
| AC-028 | 只读QA | Bridge Code Check | Mutation == 0 | STRICT READ-ONLY | - | PASS |
