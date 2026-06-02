# Mobile Slice A — Premium Home + Feel Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the mobile Home/Today screen from its ~25% stripped-down state up to the locked premium spec (`docs/superpowers/specs/2026-06-01-mobile-app-design.md` §屏幕 "Home / Today"), and extract the shared "feel" primitives (press physics, deltas, empty state) that later slices reuse — all from the **already-rich live `/api/dashboard`** payload, with **zero backend change**.

**Architecture:** Pure client-side React Native. A single `Animated.ScrollView` drives a scroll-collapse mini-header via reanimated `useScrollViewOffset`. All numeric/bucketing logic lives in a pure, unit-tested `dashboard-derive.ts` module (no RN imports) so it can be TDD'd without a renderer; UI components consume it and are gated on `tsc` typecheck + an on-device acceptance checklist (RN cannot be rendered/screenshotted in this sandbox). Press physics ("砸进纸面") are extracted from the existing `Button` into a reusable `usePressPhysics` hook.

**Tech Stack:** Expo SDK 52, Expo Router 4, React Native 0.76, react-native-reanimated 3.16, NativeWind 4, lucide-react-native, TanStack Query 5, `react-native-confetti-cannon` (new), `jest-expo` (new, dev). The existing `<Brutal>` double-plate shadow primitive (Android-verified) is the base of every surface.

**Deferred out of this slice (flagged, not forgotten):**
- Adventure log snap carousel → **Slice E** (owns adventure data + `expo-image` + retry).
- Achievement wall → later polish pass (secondary; needs `Badge`/`RarityBadge` which Slice C/E introduce).
- victory-native charts → **Slice F** (Character tab).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `mobile/package.json` | deps + `test` script | Modify |
| `mobile/jest.config.js` | jest-expo preset, pure-module test match | Create |
| `mobile/src/lib/types.ts` | full `Dashboard` payload type | Modify |
| `mobile/src/lib/dashboard-derive.ts` | pure derivation (bucket/delta/pct/quest summary) | Create |
| `mobile/src/lib/dashboard-derive.test.ts` | unit tests for the above | Create |
| `mobile/theme/tokens.ts` | recovery buckets + scene-tier tint | Modify |
| `mobile/components/usePressPhysics.ts` | reusable 砸进纸面 spring hook | Create |
| `mobile/components/Button.tsx` | refactor onto the hook (DRY) | Modify |
| `mobile/components/Delta.tsx` | up/down/flat arrow + signed value | Create |
| `mobile/components/EmptyState.tsx` | shared empty (Home sections + placeholder tabs) | Create |
| `mobile/app/(tabs)/adventures.tsx` `pets.tsx` `inventory.tsx` `character.tsx` | use `EmptyState` | Modify |
| `mobile/components/home/RecoveryHero.tsx` | recovery-bucketed hero character card | Create |
| `mobile/components/home/StaminaBand.tsx` | today stamina + scene tier + rarity chip | Create |
| `mobile/components/home/VitalsGrid.tsx` | 2×2 vitals with yesterday deltas | Create |
| `mobile/components/home/QuestSummary.tsx` | quest summary head + read-only checklist | Create |
| `mobile/components/home/CollapsibleHeader.tsx` | scroll-driven mini-header | Create |
| `mobile/components/home/LevelUpCelebration.tsx` | confetti + Success haptic on level-up | Create |
| `mobile/app/(tabs)/index.tsx` | compose the premium Home | Rewrite |
| `mobile/src/lib/haptics.ts` | add `selection` + `tapHeavy` (used by sections) | Modify |

All new shared primitives (`usePressPhysics`, `Delta`, `EmptyState`) are designed for reuse by Slices C–F.

---

## Task 0: Dependencies + pure-module test runner

**Files:**
- Modify: `mobile/package.json`
- Create: `mobile/jest.config.js`

- [ ] **Step 1: Install runtime + dev deps**

Run from inside `mobile/`:

```bash
cd mobile
npx expo install react-native-confetti-cannon
pnpm add -D jest-expo jest @types/jest
```

Expected: `react-native-confetti-cannon` appears under `dependencies`; `jest-expo`, `jest`, `@types/jest` under `devDependencies`. If the proxy is flaky (known hazard), retry; do not switch registries unless it persists.

- [ ] **Step 2: Add the `test` script**

In `mobile/package.json`, add to `"scripts"`:

```json
    "test": "jest"
```

- [ ] **Step 3: Create the jest config (pure modules only — no RN render)**

Create `mobile/jest.config.js`:

```js
// Pure-logic tests only (src/lib/*.test.ts). We intentionally do NOT render
// React Native components here — reanimated/gesture-handler under jsdom is
// flaky and UI is verified on a real device instead. Keep tested modules free
// of RN imports.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/src/lib/**/*.test.ts'],
}
```

- [ ] **Step 4: Verify the runner boots (no tests yet is OK)**

Run: `cd mobile && pnpm test --passWithNoTests`
Expected: exits 0, "No tests found" / "passWithNoTests".

- [ ] **Step 5: Commit**

```bash
git add mobile/package.json mobile/jest.config.js mobile/pnpm-lock.yaml
git commit -m "chore(mobile): add confetti dep + jest-expo for pure-logic tests"
```

---

## Task 1: Expand the `Dashboard` type to the full payload

The live route already returns far more than the current type declares. Declare it so Home can consume it type-safely.

**Files:**
- Modify: `mobile/src/lib/types.ts`

- [ ] **Step 1: Replace the file with the full payload shape**

Source of truth: `app/api/dashboard/route.ts` `GET` return value. Write `mobile/src/lib/types.ts`:

```ts
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type SceneTier = 'nearby' | 'coast' | 'ruin' | 'astral'

export type DashCharacter = {
  name: string
  title: string | null
  title_code: string
  motto: string | null
  level: number
  exp: number
  total_exp: number
  next_level_exp: number
  exp_to_next: number
}

export type DashTodaySnapshot = {
  date: string
  recovery_score: number | null
  sleep_minutes: number | null
  sleep_performance: number | null
  strain: number | null
  streak: number
  yesterday: {
    recovery_score: number | null
    sleep_minutes: number | null
    strain: number | null
  }
}

export type DashStamina = {
  stamina: number
  scene_tier: SceneTier
  rarity_tier: Rarity
  stats_date: string | null
  stamina_pct: number
  tier_label: string
}

export type DashAttributes = {
  physique: { label: string; value: number; color: string; source: string }
  endurance: { label: string; value: number; color: string; source: string }
  focus: { label: string; value: number; color: string; source: string }
  hp_max: number
  hp_current: number
  last7: Array<{
    date: string
    recovery: number | null
    sleep_min: number | null
    sleep_perf: number | null
    strain: number | null
    hrv: number | null
  }>
}

export type DashQuest = {
  id: string
  slug: string
  title: string
  description: string | null
  reward_exp: number
  reward: unknown
  progress: {
    status: string // 'pending' | 'in_progress' | 'completed'
    current_value: number
    target_value: number
    completed_at?: string | null
  }
}

export type DashAdventure = {
  id: string
  started_at: string
  completed_at: string | null
  scene_type: string | null
  scene_tier: SceneTier | null
  rarity_tier: Rarity | null
  stamina_used: number | null
  duration_min: number | null
  chapters: number | null
  triggered_by: string | null
  story_md: string | null
  scene_image_url: string | null
  pets_dispatched: unknown
  rewards: unknown
  pet_encounter: unknown
  status: string
}

export type DashAchievement = {
  id: string
  [k: string]: unknown
  progress: {
    status: string // 'locked' | 'in_progress' | 'unlocked'
    progress_current: number
    progress_target: number
    unlocked_at?: string | null
  }
}

export type DashConnections = {
  whoop: { connected: boolean; last_sync: string | null; expired: boolean | null }
  github: { connected: boolean }
  telegram: { connected: boolean; chat_id: string | null }
}

export type Dashboard = {
  user: { id: string; email?: string; display_name?: string; avatar_url?: string; timezone: string }
  character: DashCharacter | null
  today_snapshot: DashTodaySnapshot
  attributes: DashAttributes | null
  today_stamina: DashStamina | null
  quests: DashQuest[]
  adventure_log: DashAdventure[]
  achievements: DashAchievement[]
  exp_trend: Array<{ date: string; exp: number | null; level: number | null }>
  connections: DashConnections
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && pnpm typecheck`
Expected: PASS. (The existing `index.tsx` reads `character.exp`, `today_snapshot.recovery_score`, etc. — all still present, so it still compiles. It will be rewritten in Task 13.)

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/types.ts
git commit -m "feat(mobile): full Dashboard payload type (quests/adventures/achievements/deltas)"
```

---

## Task 2: Pure derivation module (TDD)

All the bug-prone math in one renderer-free module so it can be unit-tested.

**Files:**
- Create: `mobile/src/lib/dashboard-derive.ts`
- Test: `mobile/src/lib/dashboard-derive.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mobile/src/lib/dashboard-derive.test.ts`:

```ts
import { recoveryBucket, delta, expPct, sleepHours, questSummary } from './dashboard-derive'

describe('recoveryBucket', () => {
  it('buckets high/med/low by WHOOP thresholds', () => {
    expect(recoveryBucket(80).key).toBe('high')
    expect(recoveryBucket(67).key).toBe('high')
    expect(recoveryBucket(50).key).toBe('med')
    expect(recoveryBucket(34).key).toBe('med')
    expect(recoveryBucket(10).key).toBe('low')
  })
  it('returns unknown for null', () => {
    expect(recoveryBucket(null).key).toBe('unknown')
  })
})

describe('delta', () => {
  it('signs the direction', () => {
    expect(delta(70, 60)).toEqual({ dir: 'up', diff: 10 })
    expect(delta(60, 70)).toEqual({ dir: 'down', diff: -10 })
    expect(delta(60, 60)).toEqual({ dir: 'flat', diff: 0 })
  })
  it('is none when either side is null', () => {
    expect(delta(70, null).dir).toBe('none')
    expect(delta(null, 70).dir).toBe('none')
  })
})

describe('expPct', () => {
  it('clamps to 0..100', () => {
    expect(expPct(500, 1000)).toBe(50)
    expect(expPct(2000, 1000)).toBe(100)
    expect(expPct(50, 0)).toBe(100) // guard divide-by-zero -> full
    expect(expPct(0, 1000)).toBe(0)
  })
})

describe('sleepHours', () => {
  it('formats minutes to one decimal', () => {
    expect(sleepHours(450)).toBe('7.5')
    expect(sleepHours(null)).toBe('–')
  })
})

describe('questSummary', () => {
  const q = (status: string, reward_exp: number) =>
    ({ progress: { status }, reward_exp } as any)
  it('counts completed and sums earned vs total exp', () => {
    const s = questSummary([q('completed', 100), q('pending', 50), q('completed', 30)])
    expect(s).toEqual({ done: 2, total: 3, earnedExp: 130, totalExp: 180 })
  })
  it('handles empty', () => {
    expect(questSummary([])).toEqual({ done: 0, total: 0, earnedExp: 0, totalExp: 0 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && pnpm test`
Expected: FAIL — "Cannot find module './dashboard-derive'".

- [ ] **Step 3: Implement the module**

Create `mobile/src/lib/dashboard-derive.ts`:

```ts
import type { DashQuest } from './types'

export type RecoveryKey = 'high' | 'med' | 'low' | 'unknown'

/** WHOOP recovery zones: green ≥67, yellow 34–66, red <34. */
export function recoveryBucket(score: number | null): { key: RecoveryKey } {
  if (score == null) return { key: 'unknown' }
  if (score >= 67) return { key: 'high' }
  if (score >= 34) return { key: 'med' }
  return { key: 'low' }
}

export type DeltaDir = 'up' | 'down' | 'flat' | 'none'
export function delta(curr: number | null, prev: number | null): { dir: DeltaDir; diff: number } {
  if (curr == null || prev == null) return { dir: 'none', diff: 0 }
  const diff = curr - prev
  return { dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat', diff }
}

export function expPct(exp: number, next: number): number {
  if (next <= 0) return 100
  return Math.max(0, Math.min(100, (exp / next) * 100))
}

export function sleepHours(minutes: number | null): string {
  if (minutes == null) return '–'
  return (minutes / 60).toFixed(1)
}

export function questSummary(quests: Pick<DashQuest, 'progress' | 'reward_exp'>[]): {
  done: number
  total: number
  earnedExp: number
  totalExp: number
} {
  return quests.reduce(
    (acc, q) => {
      const completed = q.progress?.status === 'completed'
      return {
        done: acc.done + (completed ? 1 : 0),
        total: acc.total + 1,
        earnedExp: acc.earnedExp + (completed ? q.reward_exp : 0),
        totalExp: acc.totalExp + q.reward_exp,
      }
    },
    { done: 0, total: 0, earnedExp: 0, totalExp: 0 }
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && pnpm test`
Expected: PASS — 5 suites / all green.

- [ ] **Step 5: Typecheck + commit**

```bash
cd mobile && pnpm typecheck
git add mobile/src/lib/dashboard-derive.ts mobile/src/lib/dashboard-derive.test.ts
git commit -m "feat(mobile): pure dashboard-derive helpers with unit tests"
```

---

## Task 3: Recovery buckets + scene-tier tint tokens

**Files:**
- Modify: `mobile/theme/tokens.ts`

- [ ] **Step 1: Append the recovery + scene maps**

Add to the end of `mobile/theme/tokens.ts` (keep existing exports untouched):

```ts
/** Recovery zone → hero card surface (candy face) + accent for HP/EXP overlay. */
export const RECOVERY = {
  high:    { face: COLORS.mint,       accent: COLORS.ink,  label: '状态绝佳' },
  med:     { face: COLORS.sunshine,   accent: COLORS.ink,  label: '尚可' },
  low:     { face: COLORS.coral,      accent: COLORS.paper, label: '需要恢复' },
  unknown: { face: COLORS.cream,      accent: COLORS.ink,  label: '暂无数据' },
} as const

/** Scene tier → a small accent chip color shown on the stamina band. */
export const SCENE_TINT = {
  nearby: COLORS.mint,
  coast:  COLORS.sky,
  ruin:   COLORS.lilac,
  astral: COLORS.periwinkle,
} as const
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd mobile && pnpm typecheck
git add mobile/theme/tokens.ts
git commit -m "feat(mobile): recovery-zone + scene-tier surface tokens"
```

---

## Task 4: Extract press physics into a reusable hook; refactor Button

**Files:**
- Create: `mobile/components/usePressPhysics.ts`
- Modify: `mobile/components/Button.tsx`

- [ ] **Step 1: Create the hook**

Create `mobile/components/usePressPhysics.ts`:

```ts
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { BRUTAL_OFFSET, type BrutalSize } from '@/theme/tokens'
import { tapLight } from '@/src/lib/haptics'

/**
 * The "砸进纸面" press physics shared by every interactive Brutal surface:
 * on press the face springs toward the shadow plate (+offset) and the plate
 * fades out; on release it springs back with overshoot. Returns animated
 * styles for the face and the plate, plus press handlers.
 */
export function usePressPhysics(size: BrutalSize = 'md', opts?: { haptic?: boolean }) {
  const off = BRUTAL_OFFSET[size]
  const t = useSharedValue(0) // 0 = rest, 1 = pressed
  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * off }, { translateY: t.value * off }],
  }))
  const plateStyle = useAnimatedStyle(() => ({ opacity: 1 - t.value }))
  const onPressIn = () => {
    t.value = withSpring(1, { damping: 18, stiffness: 320 })
    if (opts?.haptic !== false) tapLight()
  }
  const onPressOut = () => {
    t.value = withSpring(0, { damping: 12, stiffness: 180 })
  }
  return { off, faceStyle, plateStyle, onPressIn, onPressOut }
}
```

- [ ] **Step 2: Refactor Button onto the hook**

Replace `mobile/components/Button.tsx` with:

```tsx
import { Pressable, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { COLORS } from '@/theme/tokens'
import { usePressPhysics } from './usePressPhysics'

const BG: Record<string, string> = {
  pink: COLORS.pink, mint: COLORS.mint, sunshine: COLORS.sunshine, sky: COLORS.sky,
  peri: COLORS.periwinkle, coral: COLORS.coral, lilac: COLORS.lilac,
}
const PAPER_TEXT = new Set(['peri', 'coral', 'lilac'])

export function Button({
  label, onPress, variant = 'pink', size = 'default', disabled,
}: { label: string; onPress?: () => void; variant?: keyof typeof BG; size?: 'default' | 'sm'; disabled?: boolean }) {
  const { off, faceStyle, plateStyle, onPressIn, onPressOut } = usePressPhysics('md')
  const pad = size === 'sm' ? { paddingVertical: 7, paddingHorizontal: 14 } : { paddingVertical: 12, paddingHorizontal: 24 }
  return (
    <Pressable disabled={disabled} onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress} style={{ opacity: disabled ? 0.5 : 1 }}>
      <View style={{ position: 'relative' }}>
        <Animated.View style={[{ position: 'absolute', left: off, top: off, right: -off, bottom: -off, backgroundColor: COLORS.ink, borderRadius: 9999 }, plateStyle]} />
        <Animated.View style={[{ backgroundColor: BG[variant], borderWidth: 2, borderColor: COLORS.ink, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', ...pad }, faceStyle]}>
          <Text style={{ fontFamily: 'Fredoka_600SemiBold', fontSize: size === 'sm' ? 13 : 16, color: PAPER_TEXT.has(variant) ? COLORS.paper : COLORS.ink }}>{label}</Text>
        </Animated.View>
      </View>
    </Pressable>
  )
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd mobile && pnpm typecheck
git add mobile/components/usePressPhysics.ts mobile/components/Button.tsx
git commit -m "refactor(mobile): extract usePressPhysics hook (DRY across Brutal surfaces)"
```

---

## Task 5: Add `selection` + `tapHeavy` haptics

**Files:**
- Modify: `mobile/src/lib/haptics.ts`

- [ ] **Step 1: Append two helpers**

Add to `mobile/src/lib/haptics.ts`:

```ts
export const selection = () => Haptics.selectionAsync()
export const tapHeavy = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd mobile && pnpm typecheck
git add mobile/src/lib/haptics.ts
git commit -m "feat(mobile): selection + heavy haptics"
```

---

## Task 6: Delta component

**Files:**
- Create: `mobile/components/Delta.tsx`

- [ ] **Step 1: Create it**

Create `mobile/components/Delta.tsx`:

```tsx
import { View, Text } from 'react-native'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react-native'
import { COLORS } from '@/theme/tokens'
import type { DeltaDir } from '@/src/lib/dashboard-derive'

const META: Record<DeltaDir, { color: string; Icon: typeof ArrowUp | null }> = {
  up:   { color: '#2bb673', Icon: ArrowUp },   // green improvement
  down: { color: COLORS.coral, Icon: ArrowDown },
  flat: { color: COLORS.mute, Icon: Minus },
  none: { color: COLORS.mute, Icon: null },
}

export function Delta({ dir, diff, color }: { dir: DeltaDir; diff: number; color?: string }) {
  const m = META[dir]
  if (dir === 'none' || !m.Icon) return null
  const fg = color ?? m.color
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <m.Icon size={12} strokeWidth={3} color={fg} />
      <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>{Math.abs(Math.round(diff))}</Text>
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd mobile && pnpm typecheck
git add mobile/components/Delta.tsx
git commit -m "feat(mobile): Delta arrow component"
```

---

## Task 7: EmptyState + adopt it in the placeholder tabs

**Files:**
- Create: `mobile/components/EmptyState.tsx`
- Modify: `mobile/app/(tabs)/adventures.tsx`, `mobile/app/(tabs)/pets.tsx`, `mobile/app/(tabs)/inventory.tsx`, `mobile/app/(tabs)/character.tsx`

- [ ] **Step 1: Create EmptyState**

Create `mobile/components/EmptyState.tsx`:

```tsx
import { View, Text } from 'react-native'
import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react-native'
import { COLORS } from '@/theme/tokens'

export function EmptyState({
  Icon, title, subtitle,
}: { Icon: ComponentType<LucideProps>; title: string; subtitle?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 320 }}>
      <View style={{ width: 88, height: 88, borderRadius: 24, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={40} strokeWidth={2.5} color={COLORS.ink} />
      </View>
      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 18, color: COLORS.ink, marginTop: 16 }}>{title}</Text>
      {subtitle ? <Text style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 13, color: COLORS.mute, marginTop: 4, textAlign: 'center' }}>{subtitle}</Text> : null}
    </View>
  )
}
```

- [ ] **Step 2: Swap the four placeholder tabs**

Replace `mobile/app/(tabs)/adventures.tsx`:

```tsx
import { View } from 'react-native'
import { Compass } from 'lucide-react-native'
import { EmptyState } from '@/components/EmptyState'
import { COLORS } from '@/theme/tokens'
export default function Screen() {
  return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><EmptyState Icon={Compass} title="冒险" subtitle="即将上线" /></View>
}
```

Replace `mobile/app/(tabs)/pets.tsx`:

```tsx
import { View } from 'react-native'
import { PawPrint } from 'lucide-react-native'
import { EmptyState } from '@/components/EmptyState'
import { COLORS } from '@/theme/tokens'
export default function Screen() {
  return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><EmptyState Icon={PawPrint} title="宠物" subtitle="即将上线" /></View>
}
```

Replace `mobile/app/(tabs)/inventory.tsx`:

```tsx
import { View } from 'react-native'
import { Package } from 'lucide-react-native'
import { EmptyState } from '@/components/EmptyState'
import { COLORS } from '@/theme/tokens'
export default function Screen() {
  return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><EmptyState Icon={Package} title="背包" subtitle="即将上线" /></View>
}
```

Replace `mobile/app/(tabs)/character.tsx`:

```tsx
import { View } from 'react-native'
import { User } from 'lucide-react-native'
import { EmptyState } from '@/components/EmptyState'
import { COLORS } from '@/theme/tokens'
export default function Screen() {
  return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><EmptyState Icon={User} title="角色" subtitle="即将上线" /></View>
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd mobile && pnpm typecheck
git add mobile/components/EmptyState.tsx mobile/app/\(tabs\)/adventures.tsx mobile/app/\(tabs\)/pets.tsx mobile/app/\(tabs\)/inventory.tsx mobile/app/\(tabs\)/character.tsx
git commit -m "feat(mobile): shared EmptyState; adopt in placeholder tabs"
```

---

## Task 8: RecoveryHero — recovery-bucketed hero character card

**Files:**
- Create: `mobile/components/home/RecoveryHero.tsx`

- [ ] **Step 1: Create it**

Create `mobile/components/home/RecoveryHero.tsx`:

```tsx
import { useEffect } from 'react'
import { View, Text } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { Brutal } from '@/components/Brutal'
import { ProgressBar } from '@/components/ProgressBar'
import { COLORS, RECOVERY } from '@/theme/tokens'
import { recoveryBucket, expPct } from '@/src/lib/dashboard-derive'
import type { DashCharacter, DashAttributes } from '@/src/lib/types'

export function RecoveryHero({
  character, attributes, recoveryScore,
}: { character: DashCharacter | null; attributes: DashAttributes | null; recoveryScore: number | null }) {
  const bucket = recoveryBucket(recoveryScore)
  const zone = RECOVERY[bucket.key]
  const fg = bucket.key === 'low' ? COLORS.paper : COLORS.ink
  const exp = character ? expPct(character.exp, character.next_level_exp) : 0
  const hpPct = attributes ? (attributes.hp_current / Math.max(attributes.hp_max, 1)) * 100 : 100

  // idle breathing (1 ↔ 1.02, ~4s)
  const breathe = useSharedValue(1)
  useEffect(() => {
    breathe.value = withRepeat(withTiming(1.02, { duration: 2000, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [])
  const breatheStyle = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }))

  return (
    <Brutal bg={zone.face} radius={24} offset="lg" faceStyle={{ padding: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 28, color: fg }}>{character?.name ?? 'Hermes'}</Text>
          {character?.title ? <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 13, color: fg, opacity: 0.85, marginTop: 2 }}>{character.title}</Text> : null}
        </View>
        <Animated.View style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper }, breatheStyle]}>
          <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 16, color: COLORS.ink }}>Lv.{character?.level ?? 1}</Text>
        </Animated.View>
      </View>

      <View style={{ marginTop: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>HP</Text>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>{attributes?.hp_current ?? 100}/{attributes?.hp_max ?? 100}</Text>
        </View>
        <ProgressBar pct={hpPct} fill={COLORS.coral} height={10} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>EXP</Text>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>{character?.exp ?? 0}/{character?.next_level_exp ?? 1000}</Text>
        </View>
        <ProgressBar pct={exp} fill={COLORS.sunshine} height={10} />
      </View>

      <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg, opacity: 0.8, marginTop: 12 }}>恢复 · {zone.label}</Text>
    </Brutal>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd mobile && pnpm typecheck
git add mobile/components/home/RecoveryHero.tsx
git commit -m "feat(mobile): recovery-bucketed hero character card"
```

---

## Task 9: StaminaBand

**Files:**
- Create: `mobile/components/home/StaminaBand.tsx`

- [ ] **Step 1: Create it**

Create `mobile/components/home/StaminaBand.tsx`:

```tsx
import { View, Text } from 'react-native'
import { Brutal } from '@/components/Brutal'
import { ProgressBar } from '@/components/ProgressBar'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { COLORS, SCENE_TINT } from '@/theme/tokens'
import type { DashStamina } from '@/src/lib/types'

export function StaminaBand({ stamina }: { stamina: DashStamina }) {
  const tint = SCENE_TINT[stamina.scene_tier] ?? COLORS.mint
  return (
    <Brutal bg={COLORS.paper} radius={20} offset="md" faceStyle={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: 'Fredoka_600SemiBold', fontSize: 14, color: COLORS.ink }}>今日体力</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: tint }}>
            <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: COLORS.ink }}>{stamina.tier_label}</Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 6 }}>
        <AnimatedNumber value={stamina.stamina} style={{ fontFamily: 'Fredoka_700Bold', fontSize: 34, color: COLORS.ink }} />
        <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.mute, marginBottom: 6 }}>体力</Text>
      </View>
      <View style={{ marginTop: 6 }}>
        <ProgressBar pct={stamina.stamina_pct} fill={tint} height={12} />
      </View>
    </Brutal>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd mobile && pnpm typecheck
git add mobile/components/home/StaminaBand.tsx
git commit -m "feat(mobile): stamina band with scene-tier chip"
```

---

## Task 10: VitalsGrid (2×2 with yesterday deltas)

**Files:**
- Create: `mobile/components/home/VitalsGrid.tsx`

- [ ] **Step 1: Create it**

Create `mobile/components/home/VitalsGrid.tsx`:

```tsx
import { View, Text } from 'react-native'
import { Brutal } from '@/components/Brutal'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { Delta } from '@/components/Delta'
import { COLORS } from '@/theme/tokens'
import { delta, sleepHours } from '@/src/lib/dashboard-derive'
import type { DashTodaySnapshot } from '@/src/lib/types'

type Cell = { label: string; sub: string; bg: string; paper?: boolean; value: number; d: ReturnType<typeof delta>; lowerIsBetter?: boolean }

function VitalCell({ cell }: { cell: Cell }) {
  const fg = cell.paper ? COLORS.paper : COLORS.ink
  // For "lower is better" metrics (strain), an up arrow is not an improvement → recolor.
  const deltaColor = cell.d.dir === 'none' ? undefined
    : (cell.lowerIsBetter ? (cell.d.dir === 'up' ? COLORS.coral : '#2bb673')
       : (cell.d.dir === 'up' ? '#2bb673' : COLORS.coral))
  return (
    <View style={{ width: '47%' }}>
      <Brutal bg={cell.bg} radius={16} offset="md" faceStyle={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <AnimatedNumber value={cell.value} style={{ fontSize: 28, color: fg }} />
          <View style={{ marginTop: 4 }}><Delta dir={cell.d.dir} diff={cell.d.diff} color={deltaColor} /></View>
        </View>
        <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: fg, marginTop: 2 }}>{cell.label}</Text>
        <Text style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 11, color: fg, opacity: 0.8 }}>{cell.sub}</Text>
      </Brutal>
    </View>
  )
}

export function VitalsGrid({ today }: { today: DashTodaySnapshot }) {
  const y = today.yesterday
  const sleepNow = today.sleep_minutes != null ? Number(sleepHours(today.sleep_minutes)) : 0
  const sleepYest = y.sleep_minutes != null ? Number(sleepHours(y.sleep_minutes)) : null
  const cells: Cell[] = [
    { label: '恢复', sub: 'Recovery', bg: COLORS.mint, value: Math.round(today.recovery_score ?? 0), d: delta(today.recovery_score, y.recovery_score) },
    { label: '睡眠', sub: `${sleepHours(today.sleep_minutes)}h`, bg: COLORS.sky, value: sleepNow, d: delta(sleepNow || null, sleepYest) },
    { label: '负荷', sub: 'Strain', bg: COLORS.coral, paper: true, value: Math.round(today.strain ?? 0), d: delta(today.strain, y.strain), lowerIsBetter: true },
    { label: '连击', sub: '天', bg: COLORS.sunshine, value: today.streak, d: { dir: 'none', diff: 0 } },
  ]
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}>
      {cells.map((c) => <VitalCell key={c.label} cell={c} />)}
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd mobile && pnpm typecheck
git add mobile/components/home/VitalsGrid.tsx
git commit -m "feat(mobile): vitals 2x2 grid with yesterday deltas"
```

---

## Task 11: QuestSummary (summary head + read-only checklist)

**Files:**
- Create: `mobile/components/home/QuestSummary.tsx`

- [ ] **Step 1: Create it**

Create `mobile/components/home/QuestSummary.tsx`:

```tsx
import { View, Text } from 'react-native'
import { Check, Circle } from 'lucide-react-native'
import { Brutal } from '@/components/Brutal'
import { ProgressBar } from '@/components/ProgressBar'
import { COLORS } from '@/theme/tokens'
import { questSummary } from '@/src/lib/dashboard-derive'
import type { DashQuest } from '@/src/lib/types'

export function QuestSummary({ quests }: { quests: DashQuest[] }) {
  const s = questSummary(quests)
  const pct = s.total > 0 ? (s.done / s.total) * 100 : 0
  return (
    <Brutal bg={COLORS.sunshine} radius={20} offset="md" faceStyle={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 16, color: COLORS.ink }}>今日任务</Text>
        <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 13, color: COLORS.ink }}>{s.done}/{s.total} · {s.earnedExp}/{s.totalExp} EXP</Text>
      </View>
      <View style={{ marginTop: 8 }}><ProgressBar pct={pct} fill={COLORS.mint} height={10} /></View>

      <View style={{ marginTop: 12, gap: 8 }}>
        {quests.map((q) => {
          const done = q.progress?.status === 'completed'
          return (
            <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: done ? 0.6 : 1 }}>
              {done
                ? <Check size={18} strokeWidth={3} color={COLORS.ink} />
                : <Circle size={18} strokeWidth={2.5} color={COLORS.ink} />}
              <Text style={{ flex: 1, fontFamily: 'Nunito_700Bold', fontSize: 13, color: COLORS.ink, textDecorationLine: done ? 'line-through' : 'none' }} numberOfLines={1}>{q.title}</Text>
              <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.ink }}>+{q.reward_exp}</Text>
            </View>
          )
        })}
        {quests.length === 0 ? <Text style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 12, color: COLORS.ink, opacity: 0.7 }}>今日暂无任务</Text> : null}
      </View>
    </Brutal>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd mobile && pnpm typecheck
git add mobile/components/home/QuestSummary.tsx
git commit -m "feat(mobile): quest summary head + read-only checklist"
```

---

## Task 12: CollapsibleHeader (scroll-driven mini-header)

**Files:**
- Create: `mobile/components/home/CollapsibleHeader.tsx`

- [ ] **Step 1: Create it**

The header receives the live scroll offset (a reanimated shared value) from the Home `Animated.ScrollView` and fades/slides in once the hero scrolls past ~120px.

Create `mobile/components/home/CollapsibleHeader.tsx`:

```tsx
import { View, Text } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, Extrapolation, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TriangleAlert } from 'lucide-react-native'
import { COLORS } from '@/theme/tokens'
import { expPct } from '@/src/lib/dashboard-derive'
import type { DashCharacter, DashConnections } from '@/src/lib/types'

export function CollapsibleHeader({
  scrollY, character, connections,
}: { scrollY: SharedValue<number>; character: DashCharacter | null; connections: DashConnections }) {
  const insets = useSafeAreaInsets()
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [80, 140], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [80, 140], [-12, 0], Extrapolation.CLAMP) }],
  }))
  const exp = character ? expPct(character.exp, character.next_level_exp) : 0
  const whoopExpired = connections.whoop.expired === true
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 16, backgroundColor: COLORS.cream, borderBottomWidth: 2, borderColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', gap: 10 },
        style,
      ]}
    >
      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 16, color: COLORS.ink }}>{character?.name ?? 'Hermes'}</Text>
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.periwinkle }}>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 11, color: COLORS.paper }}>Lv.{character?.level ?? 1}</Text>
      </View>
      <View style={{ flex: 1, height: 8, borderWidth: 2, borderColor: COLORS.ink, borderRadius: 9999, backgroundColor: COLORS.paper, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${exp}%`, backgroundColor: COLORS.sunshine }} />
      </View>
      {whoopExpired ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.coral }}>
          <TriangleAlert size={12} strokeWidth={3} color={COLORS.paper} />
          <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 10, color: COLORS.paper }}>WHOOP</Text>
        </View>
      ) : null}
    </Animated.View>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd mobile && pnpm typecheck
git add mobile/components/home/CollapsibleHeader.tsx
git commit -m "feat(mobile): scroll-collapse mini-header with WHOOP-expired chip"
```

---

## Task 13: LevelUpCelebration (confetti + Success haptic)

**Files:**
- Create: `mobile/components/home/LevelUpCelebration.tsx`

- [ ] **Step 1: Create it**

Fires confetti + a Success haptic whenever the observed level increases between fetches. The parent passes the current level; this component tracks the previous value.

Create `mobile/components/home/LevelUpCelebration.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { View, Dimensions } from 'react-native'
import ConfettiCannon from 'react-native-confetti-cannon'
import { COLORS } from '@/theme/tokens'
import { success } from '@/src/lib/haptics'

const CANDY = [COLORS.mint, COLORS.pink, COLORS.periwinkle, COLORS.sunshine, COLORS.coral, COLORS.sky, COLORS.lilac]

export function LevelUpCelebration({ level }: { level: number | null }) {
  const prev = useRef<number | null>(null)
  const [burst, setBurst] = useState(0)
  useEffect(() => {
    if (level == null) return
    if (prev.current != null && level > prev.current) {
      success()
      setBurst((n) => n + 1)
    }
    prev.current = level
  }, [level])
  if (burst === 0) return null
  const { width } = Dimensions.get('window')
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
      <ConfettiCannon
        key={burst}
        count={90}
        origin={{ x: width / 2, y: 0 }}
        autoStart
        fadeOut
        explosionSpeed={350}
        fallSpeed={2600}
        colors={CANDY}
      />
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd mobile && pnpm typecheck
git add mobile/components/home/LevelUpCelebration.tsx
git commit -m "feat(mobile): level-up confetti + success haptic"
```

---

## Task 14: Compose the premium Home

**Files:**
- Rewrite: `mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Rewrite the screen**

Uses an `Animated.ScrollView` with `useAnimatedRef` + `useScrollViewOffset` to feed `scrollY` into the collapse header, reanimated `FadeInDown` entrance stagger per section, pull-to-refresh, and the level-up overlay. Empty/loading states preserved.

Replace `mobile/app/(tabs)/index.tsx`:

```tsx
import { RefreshControl, View, Text } from 'react-native'
import Animated, { FadeInDown, useAnimatedRef, useScrollViewOffset } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react-native'
import { apiFetch } from '@/src/lib/api-client'
import type { Dashboard } from '@/src/lib/types'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { RecoveryHero } from '@/components/home/RecoveryHero'
import { StaminaBand } from '@/components/home/StaminaBand'
import { VitalsGrid } from '@/components/home/VitalsGrid'
import { QuestSummary } from '@/components/home/QuestSummary'
import { CollapsibleHeader } from '@/components/home/CollapsibleHeader'
import { LevelUpCelebration } from '@/components/home/LevelUpCelebration'
import { COLORS } from '@/theme/tokens'

const Section = ({ index, children }: { index: number; children: React.ReactNode }) => (
  <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(16)}>{children}</Animated.View>
)

export default function Home() {
  const insets = useSafeAreaInsets()
  const ref = useAnimatedRef<Animated.ScrollView>()
  const scrollY = useScrollViewOffset(ref)
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'], queryFn: () => apiFetch<Dashboard>('/api/dashboard'),
  })

  if (isLoading) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><LoadingState label="加载首页…" /></View>
  if (!data) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><EmptyState Icon={Sparkles} title="暂无数据" subtitle="下拉刷新试试" /></View>

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <CollapsibleHeader scrollY={scrollY} character={data.character} connections={data.connections} />
      <Animated.ScrollView
        ref={ref}
        scrollEventThrottle={16}
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 24, gap: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.periwinkle} />}
      >
        <Section index={0}><RecoveryHero character={data.character} attributes={data.attributes} recoveryScore={data.today_snapshot.recovery_score} /></Section>
        {data.today_stamina ? <Section index={1}><StaminaBand stamina={data.today_stamina} /></Section> : null}
        <Section index={2}><VitalsGrid today={data.today_snapshot} /></Section>
        <Section index={3}><QuestSummary quests={data.quests} /></Section>
      </Animated.ScrollView>
      <LevelUpCelebration level={data.character?.level ?? null} />
    </View>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(tabs\)/index.tsx
git commit -m "feat(mobile): compose premium Home (collapse header, hero, stamina, vitals deltas, quests, level-up)"
```

---

## Task 15: Full typecheck + on-device acceptance

RN cannot be rendered in this sandbox; the user verifies on a real device/simulator.

- [ ] **Step 1: Full gate**

Run: `cd mobile && pnpm test && pnpm typecheck`
Expected: tests green, typecheck clean.

- [ ] **Step 2: On-device acceptance checklist (user runs `npx expo start`)**

Confirm on a real device/simulator with env vars set (`mobile/README.md` §Environment):
1. Home loads live data — hero card tinted by **recovery zone** (green/yellow/coral), name + Lv pill + title.
2. HP and EXP bars animate to their values; Lv pill **breathes** subtly.
3. **Stamina band** shows the number counting up + the scene-tier chip (近郊/海岸/遗迹/异界) + filled bar.
4. **Vitals 2×2** shows recovery/sleep/strain/streak with **delta arrows** vs yesterday (strain up = coral, recovery up = green).
5. **Quest summary** shows done/total + earned/total EXP + the read-only checklist (completed rows struck through).
6. Sections **stagger in** (fade + slide up) on load.
7. Scrolling down past the hero reveals the **collapse mini-header** (name + Lv + EXP + WHOOP chip if expired).
8. **Pull-to-refresh** re-fetches.
9. Cards show the **black offset plate down-right** (Android: confirm not clipped).

- [ ] **Step 3: Final integration commit (if any cleanups)**

```bash
git add -A && git commit -m "chore(mobile): slice A home premium — final cleanups" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage** (spec §屏幕 "Home / Today"): scroll-collapse mini-header ✔ (Task 12) · hero recovery-bucket card + HP/EXP overlay ✔ (Task 8) · today stamina/scene band ✔ (Task 9) · 2×2 VitalsGrid with delta arrows ✔ (Task 10) · daily quest summary ✔ (Task 11) · single GET `/api/dashboard` feeds the screen ✔ (Task 14) · level-up confetti + EXP + Success haptic ✔ (Task 13) · list-entrance stagger ✔ (Task 14) · pull-to-refresh ✔ (Task 14). **Deferred & flagged:** adventure log carousel → Slice E; achievement wall → later polish; victory-native is Slice F (Character tab). Recovery-tier scene-art *background image* is approximated with a recovery-zone color tint (no art assets exist yet) — acceptable for this slice; real art is a later asset task.

**Placeholder scan:** No TBD/TODO; every code step is complete and runnable.

**Type consistency:** `Dashboard` (Task 1) field names (`today_snapshot.yesterday`, `today_stamina.scene_tier/tier_label/stamina_pct`, `attributes.hp_current/hp_max`, `character.next_level_exp/exp/level/title`, `connections.whoop.expired`, `quests[].progress.status/reward_exp`) are exactly what Tasks 8–14 consume. `recoveryBucket`/`delta`/`expPct`/`sleepHours`/`questSummary` signatures (Task 2) match their call sites. `usePressPhysics` returns `{off, faceStyle, plateStyle, onPressIn, onPressOut}` consumed by Button (Task 4). `DeltaDir` shared between `dashboard-derive` and `Delta`.

**Note on press physics reuse:** `usePressPhysics` is built and proven on Button this slice; the hero/tile press-to-navigate interactions land when their destinations exist (Slices C–F), so they are intentionally not wired to dead routes here.
