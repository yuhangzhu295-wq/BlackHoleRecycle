# UI V3 Design Lock Specification

## Overview and Reference Lineage

This specification establishes the V3 UI design lock for the project.

### Reference Status and Origins
1. Timestamped requested originals are unavailable:
   The requested timestamped design artifacts were unavailable when checked.
2. Four exact replacement origins:
   Four active replacement screenshots have been identified, sourced directly from local authoring captures, and preserved:
   - C:\Users\zyu33\Pictures\Screenshots\模式选择页面.png
   - C:\Users\zyu33\Pictures\Screenshots\玩法主界面 HUD.png
   - C:\Users\zyu33\Pictures\Screenshots\复活页面.png
   - C:\Users\zyu33\Pictures\Screenshots\结算页面.png
3. Copied local references locked as V3:
   The four screenshots are copied (not moved) into cocos/docs/design-reference/ui-v3/:
   - mode-select-reference.png (from 模式选择页面.png, 816,534 bytes)
   - arena-hud-reference.png (from 玩法主界面 HUD.png, 903,856 bytes)
   - revive-reference.png (from 复活页面.png, 730,226 bytes)
   - settlement-reference.png (from 结算页面.png, 745,370 bytes)
4. Fallback for Home and Endless:
   Because new replacement screenshots were provided specifically for Mode Select, Arena HUD, Revive, and Settlement, the Home Page and Endless HUD maintain design reference continuity via the V2 manifest:
   - cocos/docs/design-reference/design-reference-manifest.json
   - v2-01-home.png (Home Page fallback reference)
   - Endless HUD follows the proven V2 HUD design contract specifications.
5. Six-page coverage:
   The locked V3 design contract covers exactly six core user interface screens:
   - Page 1: Home Page (Main Lobby)
   - Page 2: Mode Select Page
   - Page 3: Endless Mode HUD
   - Page 4: Arena Mode HUD
   - Page 5: Revive Modal Page
   - Page 6: Settlement Result Page
6. Exact two playable modes:
   The game features exactly two playable game modes:
   - Mode 1: 无尽探索 (Endless Exploration)
   - Mode 2: 竞技乱斗 (Arena Brawl)
   Strict nonnegotiable rule: No locked cards, no "coming soon" cards, no video unlock requirements, and no legacy fake room cards.
7. Commercialization integrity:
   No fictional systems, no simulated ad units, and no fake ad completion. A rewarded-ad entry stays hidden until runtime SDK capability, an Ad Unit, and a device completed callback are available.

---

## Global Design Principles and Layout System

### Target Viewport and 9:16 Safe Area
- Target design canvas: 720 x 1280 (portrait 9:16 aspect ratio).
- Physical safe area margins:
  - Top margin: 48px to 64px buffer for mobile notch and status indicators.
  - Bottom margin: 36px to 48px buffer for mobile navigation gestures / home indicator bars.
  - Lateral padding: minimum 24px left and right borders for interactable elements.
- Scaling behavior: Center-aligned vertical layout with flexible letterboxing / pillarboxing for extra-tall or wider displays.

### Visual and Color Hierarchy
- Dominant canvas: Vivid cartoon arcade tone with high contrast readability.
- Primary accent: Golden Yellow (#FFD000 / #FFA000) for primary affirmative actions and call-to-actions (CTAs).
- Secondary accent: Electric Cyan / Sky Blue (#00C0FF / #2E90FA) for mode panels, informational badges, and auxiliary actions.
- Action / Attention: Vivid Violet / Purple (#8B5CF6 / #7C3AED) for banners, ranking headers, and competitive headers.
- Alert / Critical: Coral Crimson (#EF4444 / #F43F5E) for warnings, defeat state, and timer urgency.
- Surfaces: Deep translucent frosted panels (RGBA 0, 0, 0, 0.55 to 0.70) to ensure high text contrast over 3D camera gameplay.
- Typography: High-legibility sans-serif with distinct dark stroke/shadow outlines for dynamic world rendering legibility.

---

## Page-by-Page Design Specifications

### 1. Home Page (Main Lobby)
- Reference Source:
  V2 fallback via cocos/docs/design-reference/v2-01-home.png and design-reference-manifest.json.
- Purpose:
  Direct player orientation, hero showcase (3D black-hole machine), currency status, and rapid 1-tap entry into gameplay.
- Top Bar:
  - Left: Coin currency counter panel with gold coin icon, pill-shaped dark container, white high-contrast text.
  - Right: Machine level / status pill showing current black-hole capacity tier.
  - Clear top notch clearance (safe area y >= 48px).
- Hero / Center Gameplay Area:
  - Full-screen animated background featuring the cartoon city park.
  - Central 3D black-hole machine focal entity, gently floating with magnetic particle swirl.
  - Prominent game title logo framed in upper-center, crisp cartoon lettering with white fill and black drop shadow.
- CTA Placement:
  - Large primary Start button centered at bottom-third (y ~ 900 in 1280 design space).
  - Thick pill button in radiant gold/yellow with bold action prompt ("SWALLOW" / "START").
- Icon Expectations:
  - Standardized clean sprite icons: gold coin, gear/machine silhouette, paint/skin palette, game mode gamepad.
- Bottom Actions:
  - Horizontal secondary action row positioned directly below the primary Start button:
    - Mode Select button (gamepad icon)
    - Skin Selection button (palette / coat icon)
    - Machine Status button (wrench / machine icon)
- Color Hierarchy:
  - Warm golden primary button, cool blue status pills, rich green park backdrop.
- Information Density:
  - Minimal and uncluttered. No popups, no multi-level nested notifications.
- 9:16 Safe Area:
  - Currency and status kept inside top 120px; bottom action row elevated at least 50px from screen bottom.
- Nonnegotiables:
  - Forbidden: No friend list, no mailbox, no first-recharge banners, no lucky wheels, no VIP icons, no daily check-in popups.
  - The 1-tap start action opens the real Mode Select page; it must not claim to launch an unspecified default mode.

### 2. Mode Select Page
- Reference Source:
  V3 local locked reference: mode-select-reference.png (sourced from 模式选择页面.png).
- Purpose:
  Allow user to choose between the two real gameplay modes without distractions or fake options.
- Top Bar:
  - Left: Back button (circular or rounded square button with left arrow).
  - Center: Clean title banner "MODE SELECT" with soft blue/white outline.
  - No redundant currency or cluttered icons in header.
- Hero / Cards Area:
  - Two prominent stacked horizontal interactive cards:
    - Card 1 (Top): "Arena Brawl" (Jingji Luandou) - Action-focused illustration, dynamic versus badge, description highlighting real-time elimination and time survival.
    - Card 2 (Bottom): "Endless Exploration" (Wuxian Tansuo) - Relaxed exploration illustration, infinity emblem, description highlighting chill puzzle swallowing and machine progression.
  - Both cards active, vibrant, and immediately selectable.
- CTA Placement:
  - Tapping each card directly selects and initiates that mode session. Each card features an internal action pill ("GO" / "START") on its right flank.
- Icon Expectations:
  - Crossed swords or trophy for Arena; infinite loop or open park horizon for Endless; clean back arrow.
- Bottom Actions:
  - None required; entire selection interaction occurs within the two central cards.
- Color Hierarchy:
  - Cyan-blue geometric gradient background, vibrant amber and purple highlights on cards, crisp white card containers with rounded borders (radius <= 16px).
- Information Density:
  - Clean two-card layout. High visual breathing room.
- 9:16 Safe Area:
  - Header sits below 60px; top card centered around y ~ 360; bottom card centered around y ~ 720; bottom 150px reserved as clean buffer.
- Nonnegotiables:
  - Exactly two cards: Endless Exploration and Arena Brawl.
  - Forbidden: No locked cards, no "unlock with ad" cards, no level-locked cards, no VIP modes, no friend battle rooms.

### 3. Endless Mode HUD
- Reference Source:
  V2 HUD design contract & EndlessHUDController architecture.
- Purpose:
  Non-intrusive runtime tracking during calm sandbox swallowing, focusing on machine mass, level progression, and current score.
- Top Bar:
  - Left: Current coin tally accumulated during the active run.
  - Center: Level progress bar showing current Tier and fill percentage toward next level expansion.
  - Right: Pause button (two vertical bars in rounded translucent circle).
- Hero / Gameplay Viewport:
  - Unobstructed 3D city scene. Over 85% of screen remains clear of static UI.
  - Floating 3D/2D particle absorption indicators near the black-hole rim when swallowing objects.
- CTA Placement:
  - No mid-game CTAs; control is continuous touch/drag.
- Icon Expectations:
  - Minimal pause icon, coin icon, tier star icon.
- Bottom Actions:
  - Virtual floating joystick zone in lower half; visual joystick thumbstick appears upon touch and fades on release.
- Color Hierarchy:
  - Translucent graphite pills (RGBA 20, 24, 33, 0.65), neon mint green (#10B981) for level progress bar, gold for coins.
- Information Density:
  - Ultra-low. Zero blocking dialogs during active play.
- 9:16 Safe Area:
  - All status counters confined to top 80px safe boundary; joystick restricted to bottom 40% bounding zone.
- Nonnegotiables:
  - Pause button must pause game simulation immediately (no background physics updating).
  - No intrusive ad banners covering joystick or camera viewport.

### 4. Arena Mode HUD
- Reference Source:
  V3 local locked reference: arena-hud-reference.png (sourced from 玩法主界面 HUD.png).
- Purpose:
  Real-time competitive match situational awareness: leaderboard rank, remaining match time, local elimination count, and opponent guidance.
- Top Bar:
  - Center: Match Countdown Timer in high-contrast pill (MM:SS format), shifting to pulse red when time < 15s.
  - Right: Pause button (subtle rounded square/circle).
  - Top-Left: Mini Top-5 Leaderboard overlay displaying:
    - Ranks 1 to 5 with color-coded ranking badges (Gold #1, Silver #2, Bronze #3).
    - Player names and real-time absorbed mass / score.
    - Dedicated highlighted row (lime green tint) for local player regardless of whether in top 5.
- Hero / Gameplay Viewport:
  - High-intensity 3D arena. Off-screen navigation arrows anchored near screen edges pointing toward nearest AI rivals or large food clusters.
- CTA Placement:
  - Continuous movement control.
- Icon Expectations:
  - Skull / crosshair for kill counter, stopwatch for match clock, directional chevron arrows for off-screen rivals.
- Bottom Actions:
  - Transparent joystick control zone in bottom quadrant.
  - Status pill display in bottom-left or mid-right showing current player kill streak and mass index.
- Color Hierarchy:
  - Frosted charcoal containers, bright white rank numbers, electric lime highlight for self-row, crimson pulse for match expiration.
- Information Density:
  - Moderate-dense competitive HUD, but strictly perimeter-anchored to preserve central 3D visibility.
- 9:16 Safe Area:
  - Leaderboard sits between y=100 and y=320, width <= 220px; timer centered at y=60; safe lateral margins >= 16px.
- Nonnegotiables:
  - Leaderboard must update dynamically from actual Arena match authoritative state.
  - Self player must always be clearly distinguished.
  - No shop or task menus accessible during active arena combat.

### 5. Revive Modal Page
- Reference Source:
  V3 local locked reference: revive-reference.png (sourced from 复活页面.png).
- Purpose:
  Handle defeat state in Arena mode, offering a limited, fair opportunity to re-enter the match before final settlement.
- Top Bar:
  - Dimmed background overlay covering the paused arena battlefield (dark vignette / 60% black wash).
- Hero / Modal Body:
  - Central modal card with playful rounded corners.
  - Hero illustration: Stunned or spinning cartoon black-hole avatar with spiral eyes and dizzy star halo.
  - Defeat headline: "DEFEATED!" in punchy orange/red cartoon display type.
  - Countdown timer ring / dial: Circular visual timer counting down from 5 to 0 seconds.
- CTA Placement:
  - Primary CTA (Middle): "REVIVE NOW" button.
    - Large golden-yellow rounded button with prominent video camera icon or coin cost (if ad available).
    - No rewarded-ad label, video icon, coin fallback, or free-revive promise is shown until a configured SDK/device completed callback exists.
  - Secondary CTA (Bottom): "GIVE UP" text button.
    - Muted slate grey / outlined button directly below the primary button.
- Icon Expectations:
  - Play video ad badge on Revive button (only when ad capability verified), skull/cross icon for defeat, circular countdown ring.
- Bottom Actions:
  - Both actions reside inside the central card. No external bottom navigation.
- Color Hierarchy:
  - Deep dark veil background (#0F172A at 70% opacity), white/cream card body, sunny amber primary button, cool grey secondary button.
- Information Density:
  - Focused decision state. Exactly two buttons and one countdown.
- 9:16 Safe Area:
  - Modal card centered strictly in middle 60% of vertical height (y between 280 and 960).
- Nonnegotiables:
  - No fake ad progress or mock video playback.
  - If countdown hits 0, automatically transition gracefully to Settlement Page without UI freeze.
  - Giving up immediately routes to Settlement with accrued match stats intact.

### 6. Settlement Result Page
- Reference Source:
  V3 local locked reference: settlement-reference.png (sourced from 结算页面.png).
- Purpose:
  Display authoritative match performance, final placement, score breakdown, coin rewards, and return routes.
- Top Bar:
  - Triumphant banner ribbon: "MATCH OVER" / "VICTORY" with celebratory purple ribbon and golden star embellishments.
- Hero / Result Card:
  - Central cream or crisp white rounded podium card:
    - Final placement badge (e.g. "#1" with golden laurel wreath or medal).
    - Key metrics grid (3 distinct stat blocks):
      1. Absorbed Mass / Objects swallowed.
      2. Rival eliminations (Kills).
      3. Survival time (MM:SS).
    - Coin rewards block with animated bounce increment.
- CTA Placement:
  - Two prominent side-by-side or stacked bottom action buttons:
    - Primary CTA: "PLAY AGAIN" (Bright emerald green or sunny yellow button).
    - Secondary CTA: "BACK TO LOBBY" (Calm sky blue button).
- Icon Expectations:
  - Golden trophy, silver/bronze medals, meat/object icon for swallowed mass, skull for kills, coin stack for rewards, home icon, refresh/replay icon.
- Bottom Actions:
  - Bottom action bar anchored firmly within safe zone above bottom screen edge.
- Color Hierarchy:
  - Radiant purple banner ribbon (#7C3AED), cream card face (#FFFDF5), golden reward accents, vibrant green/blue action buttons.
- Information Density:
  - Medium-high structured summary. All data clearly aligned in clean tabular blocks.
- 9:16 Safe Area:
  - Top ribbon below y=100; main card occupies y=180 to y=980; dual action buttons sit between y=1020 and y=1180.
- Nonnegotiables:
  - All presented stats must reflect real gameplay session data. No fake static numbers.
  - Replay button must immediately re-enter matchmaking or restart the selected mode.
  - Home button must return cleanly to Home Page and reload player profile/currency state.
