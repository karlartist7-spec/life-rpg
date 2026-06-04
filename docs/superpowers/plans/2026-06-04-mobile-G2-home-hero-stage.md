# Mobile G2 — Home Hero Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Rebuild Home from a card list into a **hero stage**: a recovery-tinted "sky" section (~one screen tall) with Hermes in a brutalist **portrait window** (art + sky swap by recovery zone — `state-high|mid|low`), name/title, HP/EXP game bars, recovery + scene chips, and a glowing **出发冒险** CTA → Adventures. Scrolling down reveals the data panels (quests, vitals, recent-adventures) on a cream surface below a horizon line.

**Architecture:** `HeroStage` paints its own recovery-zone background (the "sky") and the framed portrait; the Home `Stage` stays cream so the data panels below read cleanly, separated by a 2px ink horizon. Character art is bundled (`assets/character/state-*.png`) and chosen by `recoveryBucket`. No backend change; reuses `useDashboard`, `VitalsGrid`, `QuestSummary`, `AdventureCarousel`, `LevelUpCelebration`. Replaces the old `RecoveryHero` + `StaminaBand` cards (their info moves into the HeroStage + the HUD energy).

**Tech Stack:** reanimated (idle breathing + CTA glow), expo Image (bundled PNG via `require`), expo-router. Verification: `pnpm typecheck` + on-device (or a pasted screenshot).

**Art (verified by viewing the files):** 1024² doodle busts with a **cream background baked in** (not transparent) → they must sit in a bordered portrait window, not float on the sky. `state-high` = energetic fists-up; `state-low` = sleepy/ZZ; `state-mid` between; `base` = neutral fallback.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `mobile/assets/character/*.png` | bundled hero art (already copied) | Add (commit) |
| `mobile/theme/character-art.ts` | `HERO_ART` recovery→require map | Create |
| `mobile/components/home/HeroStage.tsx` | the hero stage section | Create |
| `mobile/app/(tabs)/index.tsx` | Home = HeroStage + data panels | Rewrite |

---

## Task 1: Bundle art + HERO_ART map

**Files:** commit `mobile/assets/character/{state-high,state-mid,state-low,base}.png` (already copied into the tree); Create `mobile/theme/character-art.ts`

- [ ] **Step 1: Create `mobile/theme/character-art.ts`** (relative requires — Metro resolves static asset paths; avoid the `@/` alias in `require`)

```ts
import type { RecoveryKey } from '@/src/lib/dashboard-derive'

/** Hero portrait art by recovery zone. Metro turns each require into an asset id (number). */
export const HERO_ART: Record<RecoveryKey, number> = {
  high: require('../assets/character/state-high.png'),
  mid: require('../assets/character/state-mid.png'),
  low: require('../assets/character/state-low.png'),
  unknown: require('../assets/character/base.png'),
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit
```bash
git add mobile/assets/character mobile/theme/character-art.ts
git commit -m "feat(mobile): bundle hero character art + recovery→art map"
```

---

## Task 2: HeroStage component

**Files:** Create `mobile/components/home/HeroStage.tsx`

- [ ] **Step 1: Create it**

```tsx
import { useEffect } from 'react'
import { View, Text, Image, Pressable } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { router } from 'expo-router'
import { Compass } from 'lucide-react-native'
import { Brutal } from '@/components/Brutal'
import { ProgressBar } from '@/components/ProgressBar'
import { COLORS, RECOVERY } from '@/theme/tokens'
import { recoveryBucket, expPct } from '@/src/lib/dashboard-derive'
import { HERO_ART } from '@/theme/character-art'
import type { DashCharacter, DashAttributes, DashStamina } from '@/src/lib/types'

export function HeroStage({
  character, attributes, recoveryScore, stamina, minHeight, topPad,
}: {
  character: DashCharacter | null
  attributes: DashAttributes | null
  recoveryScore: number | null
  stamina: DashStamina | null
  minHeight: number
  topPad: number
}) {
  const bucket = recoveryBucket(recoveryScore)
  const zone = RECOVERY[bucket.key]
  const fg = bucket.key === 'low' ? COLORS.paper : COLORS.ink
  const exp = character ? expPct(character.exp, character.next_level_exp) : 0
  const hpPct = attributes ? (attributes.hp_current / Math.max(attributes.hp_max, 1)) * 100 : 100

  const breathe = useSharedValue(1)
  useEffect(() => { breathe.value = withRepeat(withTiming(1.025, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1, true) }, [])
  const breatheStyle = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }))

  const glow = useSharedValue(1)
  useEffect(() => { glow.value = withRepeat(withTiming(1.04, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true) }, [])
  const glowStyle = useAnimatedStyle(() => ({ transform: [{ scale: glow.value }] }))

  return (
    <View style={{ minHeight, paddingTop: topPad + 8, paddingBottom: 20, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: zone.face, borderBottomWidth: 2, borderColor: COLORS.ink }}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 30, color: fg }}>{character?.name ?? 'Hermes'}</Text>
        {character?.title ? (
          <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper }}>
            <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: COLORS.ink }}>{character.title}</Text>
          </View>
        ) : null}
      </View>

      {/* hero portrait window (art has a cream bg baked in → frame it) */}
      <Animated.View style={breatheStyle}>
        <Brutal bg={COLORS.paper} radius={28} offset="lg" faceStyle={{ padding: 0, overflow: 'hidden' }}>
          <Image source={HERO_ART[bucket.key]} style={{ width: 224, height: 224 }} resizeMode="cover" />
        </Brutal>
      </Animated.View>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper }}>
          <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>恢复 · {zone.label}</Text>
        </View>
        {stamina ? (
          <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper }}>
            <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>{stamina.tier_label} · 体力 {stamina.stamina}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ width: '100%', maxWidth: 300, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>HP</Text>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>{attributes?.hp_current ?? 100}/{attributes?.hp_max ?? 100}</Text>
        </View>
        <ProgressBar pct={hpPct} fill={COLORS.coral} height={12} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>EXP</Text>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>{character?.exp ?? 0}/{character?.next_level_exp ?? 1000}</Text>
        </View>
        <ProgressBar pct={exp} fill={COLORS.sunshine} height={12} />
      </View>

      <Animated.View style={glowStyle}>
        <Pressable onPress={() => router.navigate('/adventures')}>
          <Brutal bg={COLORS.periwinkle} radius={9999} offset="md" faceStyle={{ paddingVertical: 14, paddingHorizontal: 36, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Compass size={20} strokeWidth={2.5} color={COLORS.paper} />
            <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 18, color: COLORS.paper }}>出发冒险</Text>
          </Brutal>
        </Pressable>
      </Animated.View>

      <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg, opacity: 0.75 }}>↓ 上滑查看任务与数据</Text>
    </View>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/home/HeroStage.tsx && git commit -m "feat(mobile): HeroStage — recovery-tinted sky + framed hero portrait + CTA"`

---

## Task 3: Home = hero stage + data panels

**Files:** Rewrite `mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
import { RefreshControl, View, useWindowDimensions } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sparkles } from 'lucide-react-native'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { Stage } from '@/components/Stage'
import { HeroStage } from '@/components/home/HeroStage'
import { VitalsGrid } from '@/components/home/VitalsGrid'
import { QuestSummary } from '@/components/home/QuestSummary'
import { AdventureCarousel } from '@/components/home/AdventureCarousel'
import { LevelUpCelebration } from '@/components/home/LevelUpCelebration'
import { useDashboard } from '@/src/lib/use-dashboard'
import { COLORS } from '@/theme/tokens'
import { SCREEN_TINT, GAME_HUD_HEIGHT } from '@/theme/game'

const Section = ({ index, children }: { index: number; children: React.ReactNode }) => (
  <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(16)}>{children}</Animated.View>
)

export default function Home() {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const { data, isLoading, refetch, isRefetching } = useDashboard()

  if (isLoading) return <Stage tint={SCREEN_TINT.home}><LoadingState label="加载首页…" /></Stage>
  if (!data) return <Stage tint={SCREEN_TINT.home}><EmptyState Icon={Sparkles} title="暂无数据" subtitle="下拉刷新试试" /></Stage>

  const topPad = insets.top + GAME_HUD_HEIGHT
  const heroMin = height - topPad - 80 // leave room so the data panels peek below

  return (
    <Stage tint={SCREEN_TINT.home}>
      <Animated.ScrollView contentContainerStyle={{ paddingBottom: 28 }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.ink} />}>
        <HeroStage
          character={data.character}
          attributes={data.attributes}
          recoveryScore={data.today_snapshot.recovery_score}
          stamina={data.today_stamina}
          minHeight={heroMin}
          topPad={topPad}
        />
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 16 }}>
          <Section index={0}><QuestSummary quests={data.quests} /></Section>
          <Section index={1}><VitalsGrid today={data.today_snapshot} /></Section>
          <Section index={2}><AdventureCarousel adventures={data.adventure_log} /></Section>
        </View>
      </Animated.ScrollView>
      <LevelUpCelebration level={data.character?.level ?? null} />
    </Stage>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/app/\(tabs\)/index.tsx && git commit -m "feat(mobile): Home = hero stage + scroll-reveal data panels"`

> The now-unused `RecoveryHero.tsx` and `StaminaBand.tsx` components are left in the tree (no longer imported). Removing them is optional cleanup — do NOT delete in this task (other plans/docs reference them); a follow-up can prune.

---

## Task 4: Final gate + acceptance

- [ ] **Step 1:** `cd mobile && pnpm test && pnpm typecheck` → 28 tests green, typecheck clean.

- [ ] **Step 2: On-device / screenshot acceptance:**
1. Home opens to a **full hero stage**: recovery-tinted sky, Hermes in a framed portrait (energetic when recovery high, sleepy/ZZ when low), name + title.
2. Recovery + scene/stamina chips; HP + EXP bars; a **glowing 出发冒险 button** → Adventures.
3. A 2px **horizon line** separates the sky from the cream data area; scrolling reveals 任务 / vitals / 最近冒险.
4. Pull-to-refresh works; level-up still fires confetti.
5. The persistent HUD (G1) sits above the sky; nothing is hidden under it.

- [ ] **Step 3:** Final cleanup commit if needed.

---

## Self-Review

**Spec coverage** (spec §HeroStage + Home): full-bleed recovery-tinted stage ✔; character art swap by recovery (state-high/mid/low/base) ✔ (Tasks 1,2); framed portrait (art has baked cream bg) ✔; name/title + HP/EXP frames ✔; recovery + scene/stamina chips ✔; glowing 出发冒险 CTA → adventures ✔; scroll-reveal data panels (quests/vitals/carousel) ✔ (Task 3); idle breathing + CTA glow ✔; level-up confetti retained ✔. **Folded in:** old `RecoveryHero`/`StaminaBand` info now lives in HeroStage + HUD (those components left unused, not deleted). **Deferred (not gaps):** active-pet sticker beside hero (needs `usePets`; optional polish); achievements panel; layered doodle horizon art (solid recovery sky for now).

**Placeholder scan:** none.

**Type consistency:** `HERO_ART: Record<RecoveryKey, number>` keyed by `recoveryBucket().key` (Task 1) consumed by HeroStage (Task 2). `HeroStage` props (`character/attributes/recoveryScore/stamina/minHeight/topPad`) match the Home call site (Task 3). `useDashboard()` returns the `Dashboard` used. `SCREEN_TINT`/`GAME_HUD_HEIGHT` from G1 reused. `RECOVERY`/`recoveryBucket`/`expPct` from tested modules.
