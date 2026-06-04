# Life RPG Mobile — Game UI Redesign (spec)

Date: 2026-06-04
Status: Approved (directions locked with user) — pending spec review

## Problem

The shipped mobile app (Slices A–F) faithfully executed the original spec, but the result reads like a **brutalist dashboard**: cards stacked on a flat cream background, a labeled 5-tab bar. That's a styled web app, not a **game**. User feedback: "UI 还是没改成手机版 … 导航栏不可能这样 … 要游戏性设计."

## Goal

Keep the brutalist + doodle identity (2px ink outlines, candy colors, hard offset shadow plates, no gradient except legendary) and keep everything working underneath (data hooks, Realtime, evolve/hatch/dispatch, charts) — but **re-skin the shell and screens into a mobile game**: a persistent resource HUD, a raised-center action dock, a full-bleed hero **stage** instead of cards-on-cream, depth and juice throughout.

**Non-goals:** no backend change (all data from existing `/api/dashboard` + existing Bearer hooks); no new game *features* (this is a visual/shell redesign); WHOOP onboarding / push / store (Phases 3–6) unchanged.

## Locked decisions (with user)

1. **Navigation = raised-center Adventure dock** (`GameDock`), replacing the tab bar.
2. **Home = full-screen hero stage** (character art centerpiece, swipe/scroll for data).
3. **Persistent top HUD** across all tabs.
4. **All 5 tabs reskinned** this redesign (structure kept, frame changed).
5. Hero art = bundled `character-art/state-{high|mid|low}.png` (already exist in `public/`), selected by recovery zone — art **and** backdrop swap by recovery.

## Design system shifts

- **`Stage` background (replaces cream `View`):** every screen wraps content in `<Stage tint={...}>` — a full-bleed tinted "world" surface (recovery-tinted on Home; a per-tab identity tint elsewhere — peri/mint/sky/lilac washed over paper, kept light), with safe-area top padding for the HUD and bottom padding for the dock. Brutalist frames become "windows into the world."
- **Depth:** lean on the existing `Brutal` double-plate shadow; add layered offset shapes behind hero/section headers; keep press physics. No gradients (legendary shimmer stays the only exception).
- **Juice:** screen-enter stagger (have it), number count-up (have it), idle character breathing, glow/pulse on the dock center + primary CTAs, confetti on big moments (have it), Medium/Success haptics on nav + rewards. Respect reduced-motion.
- **Constraints unchanged:** no emoji (lucide strokeWidth 2.5), no dark mode, no blur, no gradient (legendary excepted).

## Components (new shared)

### `GameHud` (persistent top bar)
Rendered once in `app/(tabs)/_layout.tsx` as an absolute top overlay (pointerEvents box-none) over the Tabs, so it persists across tabs. Reads a shared `useDashboard()` query.
- **Left:** round avatar (ink ring) + `Lv N` candy badge. Tap → Character tab.
- **Center:** slim EXP bar (or ring) with `exp/next`.
- **Right:** ⚡ energy crystal = today stamina, recovery-tinted, count-up; 🔥 streak count.
- WHOOP-expired → small coral warning dot on the crystal.
- Black-outlined paper bar, safe-area top inset, ~52px tall.

### `GameDock` (raised-center nav — replaces current `tabBar`)
Custom `tabBar` in `(tabs)/_layout.tsx`. Slots: **主城**(index) · **伙伴**(pets) · **⟨冰险⟩**(adventures, center) · **行囊**(inventory) · **英雄**(character).
- Black-outlined paper dock, `border-t-2`, safe-area bottom.
- **Center 冰险:** a larger candy circle (periwinkle) lifted ~16px above the dock, ink ring, `Compass` icon, soft pulse/glow; tap → adventures. Visually the hero of the bar.
- **Side icons:** chunky doodle/lucide icons (Home/PawPrint/Package/User), tiny labels; **active** = filled candy circle that springs up (translateY) + Medium haptic.

### `Stage` (bg wrapper)
`<Stage tint?>` → `View` flex:1 with the tinted surface + `paddingTop` (HUD + safe top) + `paddingBottom` (dock + safe bottom) defaults; children render the screen.

### `HeroStage` (Home centerpiece)
- Full-bleed recovery-tinted backdrop (RECOVERY zone wash + a layered doodle horizon shape).
- `character-art/state-{high|mid|low}.png` by `recoveryBucket(recovery_score)`, large, centered, idle-breathing scale; ground shadow ellipse; active pet sticker (first active pet's art) beside if present.
- Name + title plate; HP bar + EXP bar as game frames.
- Glowing chunky **「出发冒险」** button → adventures.

### Other
- Bundle `mobile/assets/character/state-{high,mid,low,base}.png` (copied from `public/character-art/`).
- `useDashboard()` hook (`['dashboard']` query) shared by HUD + Home + Character (React Query dedupes).

## Screens

### Home / 主城 (`app/(tabs)/index.tsx` rewrite)
Vertical `Animated.ScrollView` inside `Stage`:
- **Section 0 (≈ one screen height):** `HeroStage` + 「出发冒险」 CTA — the stage you land on.
- Scroll down (the "上滑") reveals game panels: today quests (quest-log styling), vitals HUD chips (recovery/sleep/strain/streak + deltas), 最近冒险 carousel, achievements. Reuses existing `VitalsGrid`/`QuestSummary`/`AdventureCarousel` re-themed onto the Stage.
- Level-up confetti retained.

### 伙伴 / Pets (`app/(tabs)/pets.tsx` reskin)
Stage tint (mint). A prominent **出战队伍 N/3 party bar** over the FlashList grid (full → coral). PetCards gain depth; detail sheet keeps logic, gets a more dramatic rarity frame.

### 行囊 / Inventory (`app/(tabs)/inventory.tsx` reskin)
Stage tint (sunshine). Chunky filter tabs + a stats strip; grid + ItemActionSheet logic unchanged.

### 冰险 / Adventures (`app/(tabs)/adventures.tsx` reskin)
Stage tint (sky). "Quest board" header; SceneCards become more poster-like; detail timeline unchanged.

### 英雄 / Character (`app/(tabs)/character.tsx` reskin)
Stage tint (lilac). Character art (state-by-recovery) on top as a hero portrait; attributes as chunky stat plates; the SVG charts framed as game panels.

## Data flow

No backend change. `useDashboard()` feeds HUD + Home + Character. Pets/Inventory/Adventures keep their existing realtime hooks. Character art is local bundled assets keyed by `recoveryBucket`. The active pet sticker reads `usePets()` (first `is_active`).

## Build order (slices, each device-verifiable)

- **G1 — Game shell:** `GameHud` + raised-center `GameDock` + `Stage`; apply to all 5 screens (wrap existing content in `Stage`, swap the tabBar, mount the HUD) + bundle character art + `useDashboard()`. Instantly reads as a game; content mostly unchanged underneath.
- **G2 — Home hero stage:** `HeroStage` + character art + CTA + the scroll-reveal data panels.
- **G3 — Pets + Inventory** reskin (party bar / satchel, Stage tints, depth).
- **G4 — Adventures + Character** reskin (quest board / hero sheet).

## Risks

- **Persistent HUD overlay + per-screen padding:** the HUD is an absolute overlay; each `Stage` must reserve top padding so content isn't hidden. Verify on device with notches.
- **Dock raised center + Android `overflow`:** the lifted center circle overflows the dock top — same Android clipping risk as the Brutal plates; render it as a sibling above the dock, not a clipped child. Verify on Android.
- **Character art bundle size:** 4 PNGs added to the app bundle (acceptable; they're small state sprites).
- **Can't render RN here:** all visual verification is on the user's device; the ASCII mockups agreed during brainstorming are the target.
