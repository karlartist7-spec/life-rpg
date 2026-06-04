# Mobile Slice E — Adventures Tab (list + chapter-unlock detail + Realtime) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Build the Adventures tab to spec: an image-first `<SceneCard>` list (16:10 scene art, tier/rarity, story preview, reward chips, generating/failed states with inline retry) and a full-screen Adventure Detail with the **vertical chapter-unlock timeline** (locked chapters show a live MM:SS countdown; at 0 they unlock and reveal body), all kept live by the `adventures` Realtime subscription (enabled in Slice B migration 015). Also closes two earlier deferrals: the **Home adventure carousel** (Slice A) and the **item 来源 link** (Slice D).

**Architecture:** Reuses the Slice C/D data pattern. `useAdventures()` → `useQuery(['adventures'])` → `apiFetch('/api/adventures')` + `adventures` Realtime → invalidate `['adventures']` & `['adventure']`. `useAdventure(id)` → `useQuery(['adventure', id])` → `apiFetch('/api/adventures?id=')` + same Realtime. `useRetryAdventure()` → `apiSend('/api/adventures/retry')`. Chapter unlock is pure client-side time math (`started_at + unlock_offset_min·60s` vs a 1s `now` tick), isolated + unit-tested in `adventure-derive.ts`. Detail is a full-screen route `app/adventure/[id].tsx` pushed over the tabs (immersive, own back). Scene art uses **`expo-image`** (fade-in) — the one new dep, first-party Expo, the image-heavy surface this slice owns.

**Tech Stack:** Expo SDK 52, `expo-image` (new), `@shopify/flash-list`, TanStack Query 5, supabase-js Realtime, expo-router (`router.push('/adventure/<id>')`, `useLocalSearchParams`).

**Chapter model** (from `adventures.chapters` jsonb): `Chapter = {idx, title, body, unlock_offset_min}`; `unlockAt = startedAtMs + unlock_offset_min*60000`; old records (no chapters) fall back to one chapter from `story_md`.

**Verification:** pure logic TDD'd via jest; UI gated on `pnpm typecheck` + on-device acceptance.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `mobile/package.json` | + `expo-image` | Modify |
| `mobile/src/lib/types.ts` | `Chapter`, `Adventure`, `AdventuresResponse`, `AdventureDetailResponse`; fix `DashAdventure.chapters` | Modify |
| `mobile/src/lib/adventure-derive.ts` (+`.test.ts`) | chapter unlock / countdown / state / preview | Create |
| `mobile/src/lib/use-adventures.ts` | `useAdventures`, `useAdventure`, `useRetryAdventure` | Create |
| `mobile/components/SceneCard.tsx` | list card (image-first) | Create |
| `mobile/app/(tabs)/adventures.tsx` | list screen | Rewrite |
| `mobile/app/adventure/[id].tsx` | detail (chapter timeline) | Create |
| `mobile/components/home/AdventureCarousel.tsx` | Home carousel (closes Slice A deferral) | Create |
| `mobile/app/(tabs)/index.tsx` | wire carousel into Home | Modify |
| `mobile/components/inventory/ItemActionSheet.tsx` | 来源 link (closes Slice D deferral) | Modify |

---

## Task 1: expo-image dep + types

**Files:** `mobile/package.json`, `mobile/src/lib/types.ts`

- [ ] **Step 1: Install** (from inside `mobile/`, retry on flaky proxy)
```bash
cd /Users/yangweidong/Desktop/life-rpg/mobile && npx expo install expo-image
```

- [ ] **Step 2: Append types + fix DashAdventure.chapters**

In `mobile/src/lib/types.ts`, **change** the existing `DashAdventure` field `chapters: number | null` to `chapters: Chapter[] | null`, then append:

```ts
export type Chapter = { idx: number; title: string; body: string; unlock_offset_min: number }

export type Adventure = {
  id: string
  user_id?: string
  started_at: string
  completed_at: string | null
  scene_type: string | null
  scene_tier: SceneTier | null
  rarity_tier: Rarity | null
  stamina_used: number | null
  duration_min: number | null
  chapters: Chapter[] | null
  triggered_by: string | null
  story_md: string | null
  scene_image_url: string | null
  pets_dispatched: unknown
  rewards: unknown
  pet_encounter: { name?: string; rarity?: string; element?: string; image_url?: string } | null
  status: string
}

export type AdventuresResponse = { adventures: Adventure[] }
export type AdventureDetailResponse = { adventure: Adventure }
```
(`Chapter` is referenced by the edited `DashAdventure`; declaring it below is fine — types hoist. If the toolchain complains about use-before-declare for types, move the `Chapter` line above `DashAdventure`.)

- [ ] **Step 3:** `cd mobile && pnpm typecheck` → commit `git add mobile/package.json mobile/pnpm-lock.yaml mobile/src/lib/types.ts && git commit -m "feat(mobile): expo-image dep + Adventure/Chapter types"`

---

## Task 2: adventure-derive (TDD)

**Files:** Create `mobile/src/lib/adventure-derive.ts` + `.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { normalizeChapters, chapterUnlock, fmtCountdown, adventureState, storyPreview } from './adventure-derive'

describe('normalizeChapters', () => {
  it('returns chapters when present', () => {
    const ch = [{ idx: 1, title: 'A', body: 'x', unlock_offset_min: 0 }]
    expect(normalizeChapters({ chapters: ch, story_md: 'ignored' })).toBe(ch)
  })
  it('falls back to story_md as one chapter', () => {
    const out = normalizeChapters({ chapters: null, story_md: 'hello' })
    expect(out).toHaveLength(1)
    expect(out[0].body).toBe('hello')
    expect(out[0].unlock_offset_min).toBe(0)
  })
})

describe('chapterUnlock', () => {
  const start = 1_000_000
  it('locked before offset, with positive remain', () => {
    const r = chapterUnlock(start, 10, start + 5 * 60_000)
    expect(r.unlocked).toBe(false)
    expect(r.remainMs).toBe(5 * 60_000)
  })
  it('unlocked at/after offset, remain clamped to 0', () => {
    expect(chapterUnlock(start, 10, start + 10 * 60_000).unlocked).toBe(true)
    expect(chapterUnlock(start, 10, start + 20 * 60_000).remainMs).toBe(0)
  })
})

describe('fmtCountdown', () => {
  it('MM:SS zero-padded', () => {
    expect(fmtCountdown(0)).toBe('00:00')
    expect(fmtCountdown(65_000)).toBe('01:05')
    expect(fmtCountdown(5 * 60_000)).toBe('05:00')
  })
})

describe('adventureState', () => {
  it('flags generating and failed', () => {
    expect(adventureState('pending_story').generating).toBe(true)
    expect(adventureState('pending_image').generating).toBe(true)
    expect(adventureState('failed').failed).toBe(true)
    expect(adventureState('completed').generating).toBe(false)
    expect(adventureState('active').label).toBeTruthy()
  })
})

describe('storyPreview', () => {
  it('strips markdown and truncates', () => {
    expect(storyPreview('## Title\n\nHello **world** foo', 10)).toContain('Hello')
    expect(storyPreview(null, 10)).toBe('')
  })
})
```

- [ ] **Step 2:** `cd mobile && pnpm test` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
import type { Chapter } from './types'

export function normalizeChapters(adv: { chapters: Chapter[] | null; story_md: string | null }): Chapter[] {
  if (Array.isArray(adv.chapters) && adv.chapters.length > 0) return adv.chapters
  return [{ idx: 1, title: '冒险记录', body: adv.story_md ?? '', unlock_offset_min: 0 }]
}

export function chapterUnlock(startedAtMs: number, unlockOffsetMin: number, now: number): { unlocked: boolean; remainMs: number } {
  const unlockAt = startedAtMs + unlockOffsetMin * 60_000
  const remainMs = unlockAt - now
  return { unlocked: remainMs <= 0, remainMs: Math.max(0, remainMs) }
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export type AdvState = { label: string; generating: boolean; failed: boolean }
export function adventureState(status: string): AdvState {
  switch (status) {
    case 'pending_story': return { label: '生成故事中', generating: true, failed: false }
    case 'pending_image': return { label: '绘制场景中', generating: true, failed: false }
    case 'pending': return { label: '准备中', generating: true, failed: false }
    case 'active': return { label: '进行中', generating: false, failed: false }
    case 'completed': return { label: '已完成', generating: false, failed: false }
    case 'failed': return { label: '生成失败', generating: false, failed: true }
    default: return { label: status, generating: false, failed: false }
  }
}

export function storyPreview(story: string | null, max = 120): string {
  if (!story) return ''
  const plain = story.replace(/[#*_`>~\-]/g, '').replace(/\s+/g, ' ').trim()
  return plain.length > max ? plain.slice(0, max) + '…' : plain
}
```

- [ ] **Step 4:** `cd mobile && pnpm test` (green) + `pnpm typecheck` → commit `git add mobile/src/lib/adventure-derive.ts mobile/src/lib/adventure-derive.test.ts && git commit -m "feat(mobile): adventure-derive chapter/countdown/state helpers + tests"`

---

## Task 3: use-adventures hooks

**Files:** Create `mobile/src/lib/use-adventures.ts`

- [ ] **Step 1: Create it**

```tsx
import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiSend } from './api-client'
import { supabase } from './supabase'
import type { AdventuresResponse, AdventureDetailResponse } from './types'

function useAdventuresRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id
      if (!uid || cancelled) return
      channel = supabase
        .channel('adventures_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'adventures', filter: `user_id=eq.${uid}` },
          () => {
            qc.invalidateQueries({ queryKey: ['adventures'] })
            qc.invalidateQueries({ queryKey: ['adventure'] })
            qc.invalidateQueries({ queryKey: ['dashboard'] })
          })
        .subscribe()
    })()
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [qc])
}

export function useAdventures() {
  useAdventuresRealtime()
  return useQuery({ queryKey: ['adventures'], queryFn: () => apiFetch<AdventuresResponse>('/api/adventures') })
}

export function useAdventure(id: string) {
  useAdventuresRealtime()
  return useQuery({
    queryKey: ['adventure', id],
    queryFn: () => apiFetch<AdventureDetailResponse>(`/api/adventures?id=${id}`),
    enabled: !!id,
  })
}

export function useRetryAdventure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { adventure_id: string }): Promise<{ ok: true; status: string } | { ok: false; code: string }> => {
      const r = await apiSend<{ status?: string; error?: string }>('/api/adventures/retry', 'POST', vars)
      if (r.ok) return { ok: true, status: r.data.status ?? 'pending' }
      return { ok: false, code: r.data?.error ?? `HTTP_${r.status}` }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adventures'] })
      qc.invalidateQueries({ queryKey: ['adventure'] })
    },
  })
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/src/lib/use-adventures.ts && git commit -m "feat(mobile): useAdventures/useAdventure/useRetryAdventure hooks (realtime-backed)"`

---

## Task 4: SceneCard

**Files:** Create `mobile/components/SceneCard.tsx`

- [ ] **Step 1: Create it** (image-first; generating overlay; failed → inline retry button)

```tsx
import { Pressable, View, Text } from 'react-native'
import { Image } from 'expo-image'
import Animated from 'react-native-reanimated'
import { Brutal } from './Brutal'
import { RarityBadge } from './RarityBadge'
import { Button } from './Button'
import { usePressPhysics } from './usePressPhysics'
import { COLORS, SCENE_TINT, type Rarity } from '@/theme/tokens'
import { adventureState, storyPreview } from '@/src/lib/adventure-derive'
import type { Adventure, SceneTier } from '@/src/lib/types'

const TIER_LABEL: Record<SceneTier, string> = { nearby: '近郊', coast: '海岸', ruin: '遗迹', astral: '异界' }

export function SceneCard({ adv, onPress, onRetry, retrying }: { adv: Adventure; onPress: () => void; onRetry: () => void; retrying: boolean }) {
  const { off, faceStyle, plateStyle, onPressIn, onPressOut } = usePressPhysics('md')
  const st = adventureState(adv.status)
  const tier = (adv.scene_tier ?? 'nearby') as SceneTier
  const rarity = (adv.rarity_tier ?? 'common') as Rarity

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress} disabled={st.generating}>
      <View style={{ position: 'relative' }}>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: off, top: off, right: -off, bottom: -off, backgroundColor: COLORS.ink, borderRadius: 20 }, plateStyle]} />
        <Animated.View style={[{ backgroundColor: COLORS.paper, borderRadius: 20, borderWidth: 2, borderColor: COLORS.ink, overflow: 'hidden' }, faceStyle]}>
          <View style={{ aspectRatio: 16 / 10, backgroundColor: COLORS.cream }}>
            {adv.scene_image_url ? <Image source={{ uri: adv.scene_image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={300} /> : null}
            <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 6 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: SCENE_TINT[tier] }}>
                <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 10, color: COLORS.ink }}>{TIER_LABEL[tier]}</Text>
              </View>
              <RarityBadge rarity={rarity} />
            </View>
            {st.generating ? (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(251,247,240,0.85)' }}>
                <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 14, color: COLORS.ink }}>{st.label}…</Text>
              </View>
            ) : null}
          </View>
          <View style={{ padding: 14, gap: 8 }}>
            <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 16, color: COLORS.ink }} numberOfLines={1}>{adv.scene_type ?? '未知场景'}</Text>
            {st.failed ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.coral }}>生成失败</Text>
                <Button label={retrying ? '重试中…' : '重试'} variant="coral" size="sm" onPress={onRetry} disabled={retrying} />
              </View>
            ) : (
              <Text style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 13, color: COLORS.inkSoft }} numberOfLines={3}>{storyPreview(adv.story_md, 140)}</Text>
            )}
          </View>
        </Animated.View>
      </View>
      <View style={{ height: off + 6 }} />
    </Pressable>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/SceneCard.tsx && git commit -m "feat(mobile): image-first SceneCard (generating/failed + retry)"`

---

## Task 5: Adventures list screen

**Files:** Rewrite `mobile/app/(tabs)/adventures.tsx`

- [ ] **Step 1: Rewrite**

```tsx
import { useMemo, useState } from 'react'
import { View, Text, Pressable, ScrollView } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Compass } from 'lucide-react-native'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { SceneCard } from '@/components/SceneCard'
import { useToast } from '@/components/Toast'
import { useAdventures, useRetryAdventure } from '@/src/lib/use-adventures'
import { COLORS } from '@/theme/tokens'
import type { Adventure } from '@/src/lib/types'

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'nearby', label: '近郊' },
  { key: 'coast', label: '海岸' },
  { key: 'ruin', label: '遗迹' },
  { key: 'astral', label: '异界' },
]

export default function AdventuresScreen() {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { data, isLoading, refetch, isRefetching } = useAdventures()
  const retry = useRetryAdventure()
  const [filter, setFilter] = useState('all')
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const advs = data?.adventures ?? []
  const shown = useMemo(() => (filter === 'all' ? advs : advs.filter((a: Adventure) => a.scene_tier === filter)), [advs, filter])
  const stats = useMemo(() => ({
    total: advs.length,
    done: advs.filter((a: Adventure) => a.status === 'completed').length,
  }), [advs])

  if (isLoading) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><LoadingState label="加载冒险…" /></View>

  const onRetry = async (a: Adventure) => {
    setRetryingId(a.id)
    const r = await retry.mutateAsync({ adventure_id: a.id })
    setRetryingId(null)
    toast.show(r.ok ? { message: '已重新排队，稍候刷新', tone: 'success' } : { message: '重试失败，请稍后再试', tone: 'error' })
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <FlashList<Adventure>
        data={shown}
        keyExtractor={(a: Adventure) => a.id}
        estimatedItemSize={320}
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8 }}
        ListHeaderComponent={
          <View style={{ paddingBottom: 12, gap: 10 }}>
            <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 24, color: COLORS.ink }}>冒险日志</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.mint }}>
                <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>共 {stats.total}</Text>
              </View>
              <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.sky }}>
                <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>已完成 {stats.done}</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {FILTERS.map((f) => {
                const on = filter === f.key
                return (
                  <Pressable key={f.key} onPress={() => setFilter(f.key)}
                    style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: on ? COLORS.periwinkle : COLORS.paper }}>
                    <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: on ? COLORS.paper : COLORS.ink }}>{f.label}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        }
        renderItem={({ item }: { item: Adventure }) => (
          <View style={{ paddingBottom: 14 }}>
            <SceneCard adv={item} onPress={() => router.push(`/adventure/${item.id}`)} onRetry={() => onRetry(item)} retrying={retryingId === item.id} />
          </View>
        )}
        ListEmptyComponent={<EmptyState Icon={Compass} title="还没有冒险" subtitle="体力足够时会自动触发冒险" />}
        onRefresh={refetch}
        refreshing={isRefetching}
      />
    </View>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/app/\(tabs\)/adventures.tsx && git commit -m "feat(mobile): Adventures list (image-first SceneCards + filters + retry)"`

---

## Task 6: Adventure detail (chapter timeline)

**Files:** Create `mobile/app/adventure/[id].tsx`

- [ ] **Step 1: Create it** (full-screen; 1s `now` tick drives per-chapter countdown; Realtime via `useAdventure`)

```tsx
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Lock } from 'lucide-react-native'
import { Brutal } from '@/components/Brutal'
import { RarityBadge } from '@/components/RarityBadge'
import { LoadingState } from '@/components/LoadingState'
import { useAdventure } from '@/src/lib/use-adventures'
import { normalizeChapters, chapterUnlock, fmtCountdown, adventureState } from '@/src/lib/adventure-derive'
import { tapMedium } from '@/src/lib/haptics'
import { COLORS, SCENE_TINT, type Rarity } from '@/theme/tokens'
import type { SceneTier } from '@/src/lib/types'

const TIER_LABEL: Record<SceneTier, string> = { nearby: '近郊', coast: '海岸', ruin: '遗迹', astral: '异界' }

function Chip({ children, bg = COLORS.paper }: { children: React.ReactNode; bg?: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: bg }}>
      <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: COLORS.ink }}>{children}</Text>
    </View>
  )
}

export default function AdventureDetail() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, isLoading } = useAdventure(id ?? '')
  const [now, setNow] = useState(() => 0)

  // 1s tick for countdowns (seed off mount via a state setter, never Date in module scope)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  if (isLoading || !data) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><LoadingState label="加载冒险…" /></View>
  const adv = data.adventure
  const tier = (adv.scene_tier ?? 'nearby') as SceneTier
  const rarity = (adv.rarity_tier ?? 'common') as Rarity
  const chapters = normalizeChapters(adv)
  const startedAtMs = new Date(adv.started_at).getTime()
  const st = adventureState(adv.status)

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={{ aspectRatio: 16 / 10, backgroundColor: COLORS.cream, borderBottomWidth: 2, borderColor: COLORS.ink }}>
          {adv.scene_image_url ? <Image source={{ uri: adv.scene_image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={300} /> : null}
          <Pressable onPress={() => router.back()} style={{ position: 'absolute', top: insets.top + 6, left: 12, width: 40, height: 40, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={22} strokeWidth={2.5} color={COLORS.ink} />
          </Pressable>
        </View>

        <View style={{ padding: 16, gap: 14 }}>
          <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 24, color: COLORS.ink }}>{adv.scene_type ?? '未知场景'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Chip bg={SCENE_TINT[tier]}>{TIER_LABEL[tier]}</Chip>
            <RarityBadge rarity={rarity} />
            {adv.stamina_used != null ? <Chip>体力 {adv.stamina_used}</Chip> : null}
            {adv.duration_min != null ? <Chip>{Math.round((adv.duration_min / 60) * 10) / 10}h · {chapters.length} 章</Chip> : null}
            <Chip bg={st.failed ? COLORS.coral : COLORS.mint}>{st.label}</Chip>
          </View>

          {adv.pet_encounter ? (
            <Brutal bg={COLORS.lilac} radius={16} offset="md" faceStyle={{ padding: 14 }}>
              <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 14, color: COLORS.ink }}>宠物遭遇</Text>
              <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 13, color: COLORS.ink, marginTop: 4 }}>{adv.pet_encounter.name ?? '神秘生物'}{adv.pet_encounter.element ? ` · ${adv.pet_encounter.element}` : ''}</Text>
            </Brutal>
          ) : null}

          {/* 章节时间线 */}
          <View style={{ gap: 12, marginTop: 4 }}>
            {chapters.map((ch) => {
              const u = chapterUnlock(startedAtMs, ch.unlock_offset_min, now)
              return (
                <Brutal key={ch.idx} bg={u.unlocked ? COLORS.paper : COLORS.cream} radius={16} offset="md" faceStyle={{ padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      {u.unlocked ? null : <Lock size={16} strokeWidth={2.5} color={COLORS.mute} />}
                      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 15, color: u.unlocked ? COLORS.ink : COLORS.mute }} numberOfLines={1}>
                        第 {ch.idx} 章 · {u.unlocked ? ch.title : '？？？'}
                      </Text>
                    </View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: u.unlocked ? COLORS.mint : COLORS.paper }}>
                      <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: u.unlocked ? COLORS.ink : COLORS.mute }}>{u.unlocked ? '已解锁' : fmtCountdown(u.remainMs)}</Text>
                    </View>
                  </View>
                  {u.unlocked ? (
                    <Text style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 13, color: COLORS.inkSoft, marginTop: 10, lineHeight: 20 }}>{ch.body}</Text>
                  ) : (
                    <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.mute, marginTop: 8 }}>冒险开始 {ch.unlock_offset_min} 分钟后揭晓</Text>
                  )}
                </Brutal>
              )
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
```

> The `tapMedium` import is used when a chapter transitions locked→unlocked — wire it: inside the `chapters.map`, this MVP omits the transition haptic to avoid per-render firing. Keep the import OUT to avoid an unused-var lint error. **Implementer: remove the `tapMedium` import line** (no call site in this MVP).

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/app/adventure/\[id\].tsx && git commit -m "feat(mobile): Adventure detail — vertical chapter-unlock timeline (live countdown + Realtime)"`

---

## Task 7: Home adventure carousel (closes Slice A deferral)

**Files:** Create `mobile/components/home/AdventureCarousel.tsx`; Modify `mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Create the carousel** (horizontal snap of `adventure_log`)

```tsx
import { View, Text, Pressable, ScrollView } from 'react-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { Brutal } from '@/components/Brutal'
import { RarityBadge } from '@/components/RarityBadge'
import { adventureState, storyPreview } from '@/src/lib/adventure-derive'
import { COLORS, type Rarity } from '@/theme/tokens'
import type { DashAdventure } from '@/src/lib/types'

export function AdventureCarousel({ adventures }: { adventures: DashAdventure[] }) {
  if (!adventures || adventures.length === 0) return null
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 18, color: COLORS.ink }}>最近冒险</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8, paddingBottom: 6 }} snapToInterval={236} decelerationRate="fast">
        {adventures.map((a) => {
          const st = adventureState(a.status)
          const rarity = (a.rarity_tier ?? 'common') as Rarity
          return (
            <Pressable key={a.id} onPress={() => router.push(`/adventure/${a.id}`)} style={{ width: 224 }}>
              <Brutal bg={COLORS.paper} radius={16} offset="md" faceStyle={{ padding: 0, overflow: 'hidden' }}>
                <View style={{ aspectRatio: 16 / 10, backgroundColor: COLORS.cream }}>
                  {a.scene_image_url ? <Image source={{ uri: a.scene_image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={300} /> : null}
                  <View style={{ position: 'absolute', top: 6, left: 6 }}><RarityBadge rarity={rarity} /></View>
                  {st.generating ? <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(251,247,240,0.85)' }}><Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 12, color: COLORS.ink }}>{st.label}…</Text></View> : null}
                </View>
                <View style={{ padding: 10, gap: 4 }}>
                  <Text numberOfLines={1} style={{ fontFamily: 'Fredoka_700Bold', fontSize: 13, color: COLORS.ink }}>{a.scene_type ?? '未知场景'}</Text>
                  <Text numberOfLines={2} style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 11, color: COLORS.inkSoft }}>{storyPreview(a.story_md, 60)}</Text>
                </View>
              </Brutal>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
```

- [ ] **Step 2: Wire into Home.** In `mobile/app/(tabs)/index.tsx`: add the import `import { AdventureCarousel } from '@/components/home/AdventureCarousel'`, and add a new `<Section>` after the QuestSummary section:

```tsx
        <Section index={4}><AdventureCarousel adventures={data.adventure_log} /></Section>
```
(Place it as the last child inside the `Animated.ScrollView`, after the QuestSummary `<Section index={3}>`.)

- [ ] **Step 3:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/home/AdventureCarousel.tsx mobile/app/\(tabs\)/index.tsx && git commit -m "feat(mobile): Home adventure carousel (closes Slice A deferral)"`

---

## Task 8: Item 来源 link (closes Slice D deferral)

**Files:** Modify `mobile/components/inventory/ItemActionSheet.tsx`

- [ ] **Step 1: Add a source link.** Add the import `import { router } from 'expo-router'` (already imported — verify; if present, reuse). Inside the footer `View` (the one with `marginTop: 'auto'`), **above** the action buttons, add:

```tsx
            {item.acquired_adventure_id ? (
              <Pressable onPress={() => { dismiss(); router.push(`/adventure/${item.acquired_adventure_id}`) }} style={{ alignSelf: 'center' }}>
                <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.periwinkle, textDecorationLine: 'underline' }}>查看来源冒险</Text>
              </Pressable>
            ) : null}
```
Add `Pressable` to the `react-native` import in that file.

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/inventory/ItemActionSheet.tsx && git commit -m "feat(mobile): item source-adventure link (closes Slice D deferral)"`

---

## Task 9: Final gate + acceptance

- [ ] **Step 1:** `cd mobile && pnpm test && pnpm typecheck` → tests green (incl. adventure-derive), typecheck clean.

- [ ] **Step 2: On-device acceptance** (`npx expo start`):
1. Adventures tab: image-first SceneCards (16:10 art fade-in), tier + rarity badges, 3-line story preview; header 共/已完成 + tier filter track.
2. A **generating** adventure shows the "生成故事中/绘制场景中" overlay and is not tappable; a **failed** one shows an inline **重试** → toast "已重新排队".
3. Tapping a card → full-screen detail: hero image + back button, meta chips (tier/rarity/体力/时长·章), pet-encounter card.
4. **Chapter timeline**: locked chapters show 🔒 + a **live MM:SS countdown** ticking each second + "？？？"; at 0 they flip to 已解锁 and reveal the body. Unlocking happens without manual refresh.
5. Worker finishing story/image updates the card + detail **live** (Realtime).
6. **Home** now shows a horizontal **最近冒险** carousel; tapping a tile deep-links to the detail.
7. **Inventory** item sheet shows **查看来源冒险** when the item came from an adventure → opens that detail.
8. Pull-to-refresh works; cards show the black offset plate (Android: not clipped).

- [ ] **Step 3:** Final cleanup commit if needed.

---

## Self-Review

**Spec coverage** (spec §屏幕 "Adventures" + "Adventure Detail"): image-first 16:10 SceneCard (expo-image fade + scene capsule + RarityBadge + 3-line story + … ) ✔ (Task 4); sticky stats header + filter track ✔ (Task 5); GeneratingCard + FailedCard inline retry→`/api/adventures/retry`+toast ✔ (Tasks 4,5); detail meta chips + total progress (via chapter count) ✔; **vertical chapter timeline with MM:SS countdown → unlock reveal** ✔ (Task 6); pet-encounter + rewards card (pet-encounter ✔; rewards shown via chips deferred — see below); Realtime chapter/render updates ✔ (Task 3); Home carousel ✔ (Task 7); item 来源 link ✔ (Task 8). **Deferred/flagged:** collapsing-parallax hero → static hero (MVP; parallax is polish); per-chapter **Expo local-notification scheduling** at unlockAt → Phase 4 (push slice); the rewards-chips card on detail trimmed (rewards jsonb shape varies; surfaced as a follow-up); sticky 2x2 stats "shelf" → simple header chips.

**Placeholder scan:** none. (Task 6 note: remove the `tapMedium` import — no call site.)

**Type consistency:** `Chapter`/`Adventure`/`AdventuresResponse`/`AdventureDetailResponse` (Task 1) match all consumers; `DashAdventure.chapters` corrected to `Chapter[] | null` (the carousel reads `scene_image_url`/`scene_type`/`story_md`/`rarity_tier`/`status`, not chapters, so no carousel change needed). `normalizeChapters`/`chapterUnlock`/`fmtCountdown`/`adventureState`/`storyPreview` (Task 2) match the detail + cards. `apiSend` reused. FlashList generics pinned with annotated callbacks (Slice C/D fix applied preemptively). `router.push('/adventure/<id>')` matches the new `app/adventure/[id].tsx` route.
