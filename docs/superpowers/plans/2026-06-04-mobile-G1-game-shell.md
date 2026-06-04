# Mobile G1 — Game Shell (HUD + raised-center Dock + Stage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Replace the labeled tab bar and cream-card framing with a game shell: a persistent top **`GameHud`** (avatar/Lv/EXP/energy/streak), a **`GameDock`** bottom nav with a raised-center 冰险 hub, and a tinted full-bleed **`Stage`** background on all 5 tabs — so the app instantly reads as a game. Underlying content/data unchanged.

**Architecture:** `GameDock` is the Tabs `tabBar`; `GameHud` is an absolute top overlay rendered once in `(tabs)/_layout.tsx` over the Tabs (reads a shared `useDashboard()` query). Each screen swaps its cream root `View` for `<Stage tint>` and bumps content `paddingTop` by `GAME_HUD_HEIGHT` so content clears the opaque HUD. No backend change; no new deps.

**Tech Stack:** Expo Router 4 (Tabs custom tabBar), reanimated 3.16 (tab lift), lucide icons, TanStack Query 5. Verification: `pnpm typecheck` + on-device acceptance (RN can't render in sandbox).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `mobile/theme/game.ts` | `GAME_HUD_HEIGHT` + `SCREEN_TINT` | Create |
| `mobile/src/lib/use-dashboard.ts` | shared `useDashboard()` hook | Create |
| `mobile/components/game/GameHud.tsx` | persistent top HUD | Create |
| `mobile/components/game/GameDock.tsx` | raised-center bottom nav | Create |
| `mobile/components/Stage.tsx` | tinted full-bleed bg wrapper | Create |
| `mobile/app/(tabs)/_layout.tsx` | mount GameDock as tabBar + GameHud overlay | Rewrite |
| `mobile/app/(tabs)/index.tsx` | Stage + padding; drop CollapsibleHeader (HUD replaces it) | Modify |
| `mobile/app/(tabs)/pets.tsx` `inventory.tsx` `adventures.tsx` `character.tsx` | Stage + padding | Modify |

---

## Task 1: Game theme constants + useDashboard hook

**Files:** Create `mobile/theme/game.ts`, `mobile/src/lib/use-dashboard.ts`

- [ ] **Step 1: Create `mobile/theme/game.ts`**

```ts
import { COLORS } from './tokens'

/** Height (below the safe-area top inset) reserved by the persistent GameHud. */
export const GAME_HUD_HEIGHT = 56

/** Per-tab full-bleed "world" tint — light washes over paper (not loud candy). */
export const SCREEN_TINT = {
  home: COLORS.cream,
  pets: '#e9fff4',
  inventory: '#fffdf0',
  adventures: '#eef7ff',
  character: '#f6f0ff',
} as const
```

- [ ] **Step 2: Create `mobile/src/lib/use-dashboard.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './api-client'
import type { Dashboard } from './types'

/** Shared dashboard query — HUD, Home and Character all read it (React Query dedupes by key). */
export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => apiFetch<Dashboard>('/api/dashboard') })
}
```

- [ ] **Step 3:** `cd mobile && pnpm typecheck` → commit
```bash
git add mobile/theme/game.ts mobile/src/lib/use-dashboard.ts
git commit -m "feat(mobile): game theme constants + shared useDashboard hook"
```

---

## Task 2: Stage wrapper

**Files:** Create `mobile/components/Stage.tsx`

- [ ] **Step 1: Create it**

```tsx
import { View, type ViewProps } from 'react-native'

/** Full-bleed tinted "world" surface — replaces the flat cream root View on each screen. */
export function Stage({ tint, children, style, ...rest }: ViewProps & { tint: string }) {
  return (
    <View style={[{ flex: 1, backgroundColor: tint }, style]} {...rest}>
      {children}
    </View>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/Stage.tsx && git commit -m "feat(mobile): Stage tinted background wrapper"`

---

## Task 3: GameHud

**Files:** Create `mobile/components/game/GameHud.tsx`

- [ ] **Step 1: Create it**

```tsx
import { View, Text, Pressable, Image } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Flame, Zap } from 'lucide-react-native'
import { useDashboard } from '@/src/lib/use-dashboard'
import { recoveryBucket, expPct } from '@/src/lib/dashboard-derive'
import { COLORS, RECOVERY } from '@/theme/tokens'
import { GAME_HUD_HEIGHT } from '@/theme/game'

export function GameHud() {
  const insets = useSafeAreaInsets()
  const { data } = useDashboard()
  const c = data?.character
  const zone = RECOVERY[recoveryBucket(data?.today_snapshot.recovery_score ?? null).key]
  const exp = c ? expPct(c.exp, c.next_level_exp) : 0
  const whoopExpired = data?.connections.whoop.expired === true

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }}>
      <View style={{ paddingTop: insets.top + 6, height: insets.top + GAME_HUD_HEIGHT, paddingHorizontal: 12, paddingBottom: 6, backgroundColor: COLORS.paper, borderBottomWidth: 2, borderColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {/* avatar + Lv → Character tab */}
        <Pressable onPress={() => router.navigate('/character')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 32, height: 32, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.periwinkle, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {data?.user.avatar_url
              ? <Image source={{ uri: data.user.avatar_url }} style={{ width: '100%', height: '100%' }} />
              : <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 14, color: COLORS.paper }}>{(c?.name ?? 'H').slice(0, 1)}</Text>}
          </View>
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.sunshine }}>
            <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 12, color: COLORS.ink }}>Lv{c?.level ?? 1}</Text>
          </View>
        </Pressable>

        {/* EXP bar */}
        <View style={{ flex: 1, height: 10, borderWidth: 2, borderColor: COLORS.ink, borderRadius: 9999, backgroundColor: COLORS.cream, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${exp}%`, backgroundColor: COLORS.sunshine }} />
        </View>

        {/* energy crystal (today stamina, recovery-tinted) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: zone.face }}>
          <Zap size={13} strokeWidth={3} color={COLORS.ink} />
          <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>{data?.today_stamina?.stamina ?? 0}</Text>
          {whoopExpired ? <View style={{ width: 7, height: 7, borderRadius: 9999, backgroundColor: COLORS.coral, borderWidth: 1, borderColor: COLORS.ink }} /> : null}
        </View>

        {/* streak */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Flame size={15} strokeWidth={2.5} color={COLORS.coral} />
          <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>{data?.today_snapshot.streak ?? 0}</Text>
        </View>
      </View>
    </View>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/game/GameHud.tsx && git commit -m "feat(mobile): persistent GameHud (avatar/Lv/EXP/energy/streak)"`

---

## Task 4: GameDock (raised-center nav)

**Files:** Create `mobile/components/game/GameDock.tsx`

- [ ] **Step 1: Create it**

The raised center 冰险 button is a **true sibling** of the dock row (absolutely positioned, lifted above the dock top) — not a clipped child — to survive Android's `overflow` clipping (same approach proven for the Brutal shadow plates).

```tsx
import { useEffect } from 'react'
import { View, Pressable, Text } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Home, PawPrint, Compass, Package, User, type LucideProps } from 'lucide-react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import type { ComponentType } from 'react'
import { COLORS } from '@/theme/tokens'
import { tapMedium } from '@/src/lib/haptics'

const SLOTS: { name: string; label: string; Icon: ComponentType<LucideProps>; center?: boolean }[] = [
  { name: 'index', label: '主城', Icon: Home },
  { name: 'pets', label: '伙伴', Icon: PawPrint },
  { name: 'adventures', label: '冰险', Icon: Compass, center: true },
  { name: 'inventory', label: '行囊', Icon: Package },
  { name: 'character', label: '英雄', Icon: User },
]

function SideTab({ focused, label, Icon, onPress }: { focused: boolean; label: string; Icon: ComponentType<LucideProps>; onPress: () => void }) {
  const t = useSharedValue(focused ? 1 : 0)
  useEffect(() => { t.value = withSpring(focused ? 1 : 0, { damping: 14, stiffness: 200 }) }, [focused])
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * t.value }] }))
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center' }}>
      <Animated.View style={[{ alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9999, borderWidth: focused ? 2 : 0, borderColor: COLORS.ink, backgroundColor: focused ? COLORS.periwinkle : 'transparent' }, s]}>
        <Icon size={22} strokeWidth={2.5} color={focused ? COLORS.paper : COLORS.ink} />
        <Text style={{ fontFamily: 'Fredoka_600SemiBold', fontSize: 10, marginTop: 2, color: focused ? COLORS.paper : COLORS.ink }}>{label}</Text>
      </Animated.View>
    </Pressable>
  )
}

function CenterHub({ focused, onPress }: { focused: boolean; onPress: () => void }) {
  const pulse = useSharedValue(1)
  useEffect(() => { pulse.value = withSpring(focused ? 1.06 : 1, { damping: 10, stiffness: 160 }) }, [focused])
  const s = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))
  return (
    <Pressable onPress={onPress} style={{ position: 'absolute', left: 0, right: 0, top: -22, alignItems: 'center' }}>
      <View style={{ position: 'relative', alignItems: 'center' }}>
        {/* shadow plate */}
        <View pointerEvents="none" style={{ position: 'absolute', width: 60, height: 60, borderRadius: 9999, backgroundColor: COLORS.ink, top: 4, left: 4 }} />
        <Animated.View style={[{ width: 60, height: 60, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.periwinkle, alignItems: 'center', justifyContent: 'center' }, s]}>
          <Compass size={28} strokeWidth={2.5} color={COLORS.paper} />
        </Animated.View>
      </View>
      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 10, color: COLORS.ink, marginTop: 2 }}>冰险</Text>
    </Pressable>
  )
}

export function GameDock({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const activeName = state.routes[state.index]?.name
  const go = (name: string) => {
    if (activeName !== name) { tapMedium(); navigation.navigate(name) }
  }
  return (
    <View style={{ borderTopWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper, paddingBottom: insets.bottom, paddingTop: 10, flexDirection: 'row', alignItems: 'flex-start' }}>
      {SLOTS.map((slot) =>
        slot.center
          ? <View key={slot.name} style={{ flex: 1 }} />
          : <SideTab key={slot.name} focused={activeName === slot.name} label={slot.label} Icon={slot.Icon} onPress={() => go(slot.name)} />
      )}
      <CenterHub focused={activeName === 'adventures'} onPress={() => go('adventures')} />
    </View>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/game/GameDock.tsx && git commit -m "feat(mobile): GameDock — raised-center Adventure hub nav"`

> If `@react-navigation/bottom-tabs` types aren't resolvable, import `BottomTabBarProps` from `expo-router` is not exported — it IS available via `@react-navigation/bottom-tabs` (a transitive dep of expo-router's Tabs). If typecheck can't find it, type the prop as `{ state: any; navigation: any }` and report it.

---

## Task 5: Wire the layout (GameDock tabBar + GameHud overlay)

**Files:** Rewrite `mobile/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { GameDock } from '@/components/game/GameDock'
import { GameHud } from '@/components/game/GameHud'

const SCREENS = ['index', 'adventures', 'pets', 'inventory', 'character']

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <GameDock {...props} />}>
        {SCREENS.map((n) => <Tabs.Screen key={n} name={n} />)}
      </Tabs>
      <GameHud />
    </View>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/app/\(tabs\)/_layout.tsx && git commit -m "feat(mobile): mount GameDock tabBar + GameHud overlay"`

---

## Task 6: Apply Stage + HUD padding to all 5 screens

Each screen: swap every `<View style={{ flex: 1, backgroundColor: COLORS.cream }}>` for `<Stage tint={...}>` (import `Stage` + `SCREEN_TINT` + `GAME_HUD_HEIGHT`), and change content `paddingTop: insets.top + 8` → `paddingTop: insets.top + GAME_HUD_HEIGHT + 8`.

- [ ] **Step 1: `app/(tabs)/index.tsx`** — Home. Also **remove** the `CollapsibleHeader` (the persistent HUD replaces it): delete its import and its `<CollapsibleHeader .../>` usage.
  - Add imports: `import { Stage } from '@/components/Stage'`, `import { SCREEN_TINT, GAME_HUD_HEIGHT } from '@/theme/game'`.
  - Remove: `import { CollapsibleHeader } from '@/components/home/CollapsibleHeader'` and the `<CollapsibleHeader scrollY={scrollY} character={data.character} connections={data.connections} />` line.
  - Replace the 2 guard returns `<View style={{ flex: 1, backgroundColor: COLORS.cream }}>…</View>` → `<Stage tint={SCREEN_TINT.home}>…</Stage>`.
  - Replace the main `<View style={{ flex: 1, backgroundColor: COLORS.cream }}>` (the one wrapping the ScrollView + LevelUpCelebration) → `<Stage tint={SCREEN_TINT.home}>` … `</Stage>`.
  - In the `Animated.ScrollView` `contentContainerStyle`, change `paddingTop: insets.top + 8` → `paddingTop: insets.top + GAME_HUD_HEIGHT + 8`.
  - `scrollY`/`useScrollViewOffset`/`useAnimatedRef` may now be unused after removing CollapsibleHeader — if so, remove `const ref = useAnimatedRef…`, `const scrollY = useScrollViewOffset(ref)`, the `ref={ref}` prop, and the now-unused imports (`useAnimatedRef`, `useScrollViewOffset`). Keep `Animated`, `FadeInDown`. Run typecheck; remove exactly what it flags as unused only if it errors (tsconfig has no `noUnusedLocals`, so this is optional — but eslint may complain; prefer removing the dead `ref`/`scrollY`).

- [ ] **Step 2: `app/(tabs)/pets.tsx`** — `import { Stage } from '@/components/Stage'` + `import { SCREEN_TINT, GAME_HUD_HEIGHT } from '@/theme/game'`. Replace the loading-guard `<View … cream>` and the main `<View … cream>` with `<Stage tint={SCREEN_TINT.pets}>…</Stage>`. Change `paddingTop: insets.top + 8` → `paddingTop: insets.top + GAME_HUD_HEIGHT + 8`.

- [ ] **Step 3: `app/(tabs)/inventory.tsx`** — same, `SCREEN_TINT.inventory`.

- [ ] **Step 4: `app/(tabs)/adventures.tsx`** — same, `SCREEN_TINT.adventures`.

- [ ] **Step 5: `app/(tabs)/character.tsx`** — same, `SCREEN_TINT.character`. Here the loading guard + empty guard + the main `<ScrollView style={{ flex: 1, backgroundColor: COLORS.cream }}>` all use cream: change the two guard `<View … cream>` to `<Stage tint={SCREEN_TINT.character}>`, and the main `<ScrollView>` `backgroundColor: COLORS.cream` → `SCREEN_TINT.character`, and its `paddingTop: insets.top + 8` → `paddingTop: insets.top + GAME_HUD_HEIGHT + 8`.

- [ ] **Step 6:** `cd mobile && pnpm typecheck` (clean) → commit
```bash
git add mobile/app/\(tabs\)/index.tsx mobile/app/\(tabs\)/pets.tsx mobile/app/\(tabs\)/inventory.tsx mobile/app/\(tabs\)/adventures.tsx mobile/app/\(tabs\)/character.tsx
git commit -m "feat(mobile): apply Stage tint + HUD padding across all 5 tabs"
```

---

## Task 7: Final gate + acceptance

- [ ] **Step 1:** `cd mobile && pnpm test && pnpm typecheck` → tests green (28, unchanged), typecheck clean.

- [ ] **Step 2: On-device acceptance** (`npx expo start`):
1. A **persistent top HUD** shows on every tab: avatar + Lv, EXP bar, ⚡energy (recovery-tinted) + 🔥streak. Tapping the avatar jumps to 英雄.
2. The bottom nav is a **dock** with a **raised, glowing 冰险 circle** in the center (sits above the bar); tapping it opens Adventures. Side tabs **lift** when active + Medium haptic.
3. Each tab has a **distinct light tint** background (not cream): Home cream, 伙伴 mint, 行囊 sunshine, 冰险 sky, 英雄 lilac.
4. Content on every tab starts **below the HUD** (nothing hidden under it).
5. **Android:** confirm the raised center circle is **not clipped** by the dock's top edge.

- [ ] **Step 3:** Final cleanup commit if needed.

---

## Self-Review

**Spec coverage** (spec §Components G1 scope): `GameHud` persistent overlay ✔ (Task 3,5); raised-center `GameDock` replacing tab bar ✔ (Task 4,5); `Stage` tinted bg on all tabs ✔ (Tasks 2,6); `useDashboard()` shared hook ✔ (Task 1); HUD shows avatar/Lv/EXP/energy/streak + WHOOP-expired dot ✔ (Task 3). **Deferred to later G-slices (not gaps):** bundled character art + `HeroStage` → G2; per-tab game-panel reskin (party bar/satchel/board/hero-sheet) → G3/G4; recovery-tinted Home backdrop → G2.

**Placeholder scan:** none — full code given. Task 6 edits are surgical string swaps against the patterns captured from the current files.

**Type consistency:** `GAME_HUD_HEIGHT`/`SCREEN_TINT` (Task 1) consumed by GameHud (Task 3) + screens (Task 6). `useDashboard()` returns the `Dashboard` query used by GameHud. `recoveryBucket`/`expPct`/`RECOVERY` reused from existing tested modules. `GameDock` matches the Tabs `tabBar` prop shape (`BottomTabBarProps`); `GameHud`/`GameDock` mounted in `_layout` (Task 5). `SLOTS` route names (`index/pets/adventures/inventory/character`) match the registered `Tabs.Screen` names.
