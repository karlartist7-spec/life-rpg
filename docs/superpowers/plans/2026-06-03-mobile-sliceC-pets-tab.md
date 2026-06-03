# Mobile Slice C — Pets Tab (gallery + detail sheet, evolve/dispatch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the Pets tab to the locked spec: a FlashList 2-column sticker gallery of `<PetCard>` (rarity-framed art, Lv/element/EXP, active stamp) with a dispatch-slots header, and a `@gorhom/bottom-sheet` Pet Detail sheet (evolution lineage, Lv/EXP + stage progress, HP/ATK/DEF, evolve + dispatch/recall) wired to `/api/pets` (PATCH) and `/api/pets/evolve` (POST), kept live by a Supabase Realtime subscription on `user_pets`.

**Architecture:** Data via `usePets()` — `useQuery(['pets'])` calling `apiFetch('/api/pets')` (already Bearer-wired in Slice B; returns `{pets, active_count, max_active}`) + a `user_pets` Realtime subscription that invalidates `['pets']` so evolve/hatch art and level-ups appear live. Mutations `useSetPetActive` (PATCH, optimistic, `PET_SLOT_FULL`→coral toast) and `useEvolvePet` (POST, maps `LEVEL_TOO_LOW`/`MISSING_ITEM`/`ALREADY_PENDING`/`MAX_STAGE`→toast, success→confetti+haptic, `pending_render` shimmer until Realtime swaps art). Pure pet math (`petNextLevelExp`, `petExpPct`, `evolveErrorMessage`) lives in a renderless, unit-tested `pet-derive.ts`. Two new heavy deps approved by the user: `@gorhom/bottom-sheet`, `@shopify/flash-list`. Pet art uses RN built-in `Image` (expo-image deferred to Slice E to limit this slice to the two approved deps).

**Tech Stack:** Expo SDK 52, reanimated 3.16 + gesture-handler 2.20 (present), `@gorhom/bottom-sheet` (new), `@shopify/flash-list` (new), TanStack Query 5, supabase-js Realtime. `GestureHandlerRootView` already at root; only `BottomSheetModalProvider` is added.

**Pet exp curve** (mirror of `lib/pets.ts` `levelCurve`): next-level exp at level L = `floor(100 * L^1.5)`.

**Verification:** pure logic TDD'd via the existing jest setup; UI gated on `pnpm typecheck` + on-device acceptance (RN can't render in sandbox).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `mobile/package.json` / lockfile | + `@gorhom/bottom-sheet`, `@shopify/flash-list` | Modify |
| `mobile/app/_layout.tsx` | wrap `BottomSheetModalProvider` + `ToastProvider` | Modify |
| `mobile/src/lib/types.ts` | `UserPet`, `PetsResponse` | Modify |
| `mobile/src/lib/pet-derive.ts` (+ `.test.ts`) | pure exp/stage/error helpers | Create |
| `mobile/src/lib/api-client.ts` | add `apiSend` (non-throwing, returns status) | Modify |
| `mobile/src/lib/use-pets.ts` | `usePets` (query+realtime), `useSetPetActive`, `useEvolvePet` | Create |
| `mobile/components/Toast.tsx` | `ToastProvider` + `useToast` | Create |
| `mobile/components/RarityBadge.tsx` | rarity label badge + `ActiveStamp` | Create |
| `mobile/components/PetCard.tsx` | grid cell (rarity-framed) | Create |
| `mobile/components/pets/PetDetailSheet.tsx` | gorhom detail sheet | Create |
| `mobile/app/(tabs)/pets.tsx` | gallery screen | Rewrite |

---

## Task 1: Deps + root providers

**Files:** `mobile/package.json`, `mobile/app/_layout.tsx`

- [ ] **Step 1: Install (from inside `mobile/`; retry on flaky proxy)**

```bash
cd /Users/yangweidong/Desktop/life-rpg/mobile
npx expo install @gorhom/bottom-sheet @shopify/flash-list
```
Expected: both land in `dependencies` at SDK-52-compatible versions. If a network/proxy error occurs, retry up to ~3×; if persistent, report BLOCKED.

- [ ] **Step 2: Add providers to root layout**

Replace `mobile/app/_layout.tsx` with (adds `BottomSheetModalProvider` inside the existing `GestureHandlerRootView`, and `ToastProvider` so every tab can raise toasts):

```tsx
import '../global.css'
import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka'
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito'
import { queryClient } from '@/src/lib/query-client'
import { ToastProvider } from '@/components/Toast'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [loaded] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold })
  useEffect(() => { if (loaded) SplashScreen.hideAsync() }, [loaded])
  if (!loaded) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <BottomSheetModalProvider>
            <ToastProvider>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#fbf7f0' } }} />
            </ToastProvider>
          </BottomSheetModalProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
```

> Note: `ToastProvider` is created in Task 4. Implement Task 4 before this file typechecks; if executing strictly in order, do Task 1 Step 1 now, then return to Step 2 after Task 4. (Subagent: do Step 1, then Tasks 2–4, then Step 2 + commit.)

- [ ] **Step 3: Commit (after Task 4 exists)**

```bash
cd /Users/yangweidong/Desktop/life-rpg
git add mobile/package.json mobile/pnpm-lock.yaml mobile/app/\(tabs\)/../_layout.tsx mobile/app/_layout.tsx
git commit -m "feat(mobile): add gorhom bottom-sheet + flash-list; mount BottomSheetModal + Toast providers"
```

---

## Task 2: Pet types

**Files:** Modify `mobile/src/lib/types.ts`

- [ ] **Step 1: Append**

```ts
export type UserPet = {
  id: string
  user_id: string
  nickname: string | null
  name: string | null
  description: string | null
  level: number
  exp: number
  evolution_stage: number
  max_stage: number
  rarity: Rarity
  element: string | null
  base_image_url: string | null
  current_image_url: string | null
  evolution_history: Array<{ stage: number; image_url: string; evolved_at: string }>
  is_active: boolean
  pending_render: 'evolution' | 'hatch' | null
  stats: { hp?: number; atk?: number; def?: number } & Record<string, number | undefined>
  caught_at: string
  species_uid: string | null
}

export type PetsResponse = {
  pets: UserPet[]
  active_count: number
  max_active: number
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` (passes) → commit `git add mobile/src/lib/types.ts && git commit -m "feat(mobile): UserPet + PetsResponse types"`

---

## Task 3: pet-derive (TDD)

**Files:** Create `mobile/src/lib/pet-derive.ts` + `mobile/src/lib/pet-derive.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { petNextLevelExp, petExpPct, evolveErrorMessage } from './pet-derive'

describe('petNextLevelExp', () => {
  it('mirrors floor(100 * level^1.5)', () => {
    expect(petNextLevelExp(1)).toBe(100)
    expect(petNextLevelExp(4)).toBe(800)
    expect(petNextLevelExp(9)).toBe(2700)
  })
})

describe('petExpPct', () => {
  it('is exp over the current level curve, clamped', () => {
    expect(petExpPct(1, 50)).toBe(50)
    expect(petExpPct(1, 100)).toBe(100)
    expect(petExpPct(1, 250)).toBe(100)
    expect(petExpPct(4, 400)).toBe(50)
  })
})

describe('evolveErrorMessage', () => {
  it('maps known codes to human zh messages', () => {
    expect(evolveErrorMessage('PET_SLOT_FULL')).toContain('出战')
    expect(evolveErrorMessage('MAX_STAGE')).toContain('最终')
    expect(evolveErrorMessage('ALREADY_PENDING')).toContain('进化中')
    expect(evolveErrorMessage('LEVEL_TOO_LOW', { level: 20, item: 'evo_stone' }))
      .toContain('Lv.20')
    expect(evolveErrorMessage('MISSING_ITEM', { level: 20, item: 'evo_stone' }))
      .toContain('evo_stone')
  })
  it('falls back for unknown codes', () => {
    expect(evolveErrorMessage('SOMETHING_ELSE')).toBeTruthy()
  })
})
```

- [ ] **Step 2:** `cd mobile && pnpm test` → FAIL (module missing). 

- [ ] **Step 3: Implement**

```ts
export function petNextLevelExp(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5))
}

export function petExpPct(level: number, exp: number): number {
  const need = petNextLevelExp(level)
  if (need <= 0) return 100
  return Math.max(0, Math.min(100, (exp / need) * 100))
}

export function evolveErrorMessage(code: string, need?: { level?: number; item?: string }): string {
  switch (code) {
    case 'PET_SLOT_FULL': return '出战位已满（3/3），先收回一只'
    case 'MAX_STAGE': return '已是最终形态'
    case 'ALREADY_PENDING': return '进化中，请稍候'
    case 'PET_NOT_FOUND': return '找不到这只宠物'
    case 'NO_REQUIREMENT': return '暂无进化路线'
    case 'LEVEL_TOO_LOW': return `进化需要 Lv.${need?.level ?? '?'}${need?.item ? ` + ${need.item}` : ''}`
    case 'MISSING_ITEM': return `缺少进化道具${need?.item ? `：${need.item}` : ''}`
    default: return '操作失败，请重试'
  }
}
```

- [ ] **Step 4:** `cd mobile && pnpm test` (green) + `pnpm typecheck` → commit `git add mobile/src/lib/pet-derive.ts mobile/src/lib/pet-derive.test.ts && git commit -m "feat(mobile): pet-derive exp/stage/error helpers + tests"`

---

## Task 4: Toast + ToastProvider

**Files:** Create `mobile/components/Toast.tsx`

- [ ] **Step 1: Create it**

Context provider with `useToast()` returning `show({ message, tone })`. Renders one Brutal toast at the bottom, animated in/out with reanimated, auto-dismiss after 2.6s. Tones: `error`(coral, paper text), `success`(mint), `info`(paper).

```tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { View, Text } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Brutal } from './Brutal'
import { COLORS } from '@/theme/tokens'

type Tone = 'error' | 'success' | 'info'
type ToastState = { id: number; message: string; tone: Tone }
type Ctx = { show: (t: { message: string; tone?: Tone }) => void }

const ToastCtx = createContext<Ctx | null>(null)
export function useToast(): Ctx {
  const c = useContext(ToastCtx)
  if (!c) throw new Error('useToast must be used within ToastProvider')
  return c
}

const TONE: Record<Tone, { bg: string; fg: string }> = {
  error: { bg: COLORS.coral, fg: COLORS.paper },
  success: { bg: COLORS.mint, fg: COLORS.ink },
  info: { bg: COLORS.paper, fg: COLORS.ink },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idRef = useRef(0)

  const show = useCallback((t: { message: string; tone?: Tone }) => {
    idRef.current += 1
    setToast({ id: idRef.current, message: t.message, tone: t.tone ?? 'info' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.springify().damping(16)}
          exiting={FadeOutDown}
          pointerEvents="none"
          style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 76, zIndex: 100 }}
        >
          <Brutal bg={TONE[toast.tone].bg} radius={16} offset="md" faceStyle={{ paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 13, color: TONE[toast.tone].fg, textAlign: 'center' }}>{toast.message}</Text>
          </Brutal>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/Toast.tsx && git commit -m "feat(mobile): Toast + ToastProvider"`

> After this task, complete **Task 1 Steps 2–3** (root providers compile now).

---

## Task 5: RarityBadge + ActiveStamp

**Files:** Create `mobile/components/RarityBadge.tsx`

- [ ] **Step 1: Create it**

```tsx
import { View, Text } from 'react-native'
import { COLORS, RARITY, type Rarity } from '@/theme/tokens'

const LABEL: Record<Rarity, string> = { common: '普通', rare: '稀有', epic: '史诗', legendary: '传说' }

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  const r = RARITY[rarity]
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: r.bg }}>
      <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 10, color: COLORS.ink }}>{LABEL[rarity]}</Text>
    </View>
  )
}

export function ActiveStamp() {
  return (
    <View style={{ transform: [{ rotate: '-8deg' }], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.coral }}>
      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 11, color: COLORS.paper }}>出战</Text>
    </View>
  )
}
```

- [ ] **Step 2:** typecheck → commit `git add mobile/components/RarityBadge.tsx && git commit -m "feat(mobile): RarityBadge + ActiveStamp"`

> **Note on `Rarity` type:** import `Rarity` from `@/theme/tokens` (the `keyof typeof RARITY` one). `UserPet.rarity` in `types.ts` is the string-union `Rarity` from `@/src/lib/types` — structurally identical (`'common'|'rare'|'epic'|'legendary'`), so values pass freely. Where a component needs the tokens `RARITY` map, import that `Rarity` from tokens to index it.

---

## Task 6: PetCard

**Files:** Create `mobile/components/PetCard.tsx`

- [ ] **Step 1: Create it**

Rarity-framed `<Brutal>` (uses `RARITY[rarity].plates`), square art via RN `Image` over a cream placeholder, footer with name + Lv + element chip + EXP bar, `ActiveStamp` when `is_active`, `pending_render` dims + shows "进化中". Press uses `usePressPhysics`.

```tsx
import { Pressable, View, Text, Image } from 'react-native'
import Animated from 'react-native-reanimated'
import { Brutal } from './Brutal'
import { ProgressBar } from './ProgressBar'
import { RarityBadge, ActiveStamp } from './RarityBadge'
import { usePressPhysics } from './usePressPhysics'
import { COLORS, RARITY, type Rarity } from '@/theme/tokens'
import { petExpPct } from '@/src/lib/pet-derive'
import type { UserPet } from '@/src/lib/types'

export function PetCard({ pet, onPress }: { pet: UserPet; onPress: () => void }) {
  const { off, faceStyle, plateStyle, onPressIn, onPressOut } = usePressPhysics('md')
  const rarity = (pet.rarity ?? 'common') as Rarity
  const plates = RARITY[rarity].plates
  const title = pet.nickname || pet.name || '神秘宠物'
  const art = pet.current_image_url || pet.base_image_url
  const pending = pet.pending_render != null

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress} style={{ flex: 1 }}>
      <View style={{ position: 'relative' }}>
        {plates.map((p, i) => (
          <Animated.View key={i} pointerEvents="none" style={[{ position: 'absolute', left: p.off, top: p.off, right: -p.off, bottom: -p.off, backgroundColor: p.color, borderRadius: 16 }, plateStyle]} />
        ))}
        <Animated.View style={[{ backgroundColor: RARITY[rarity].bg, borderRadius: 16, borderWidth: 2, borderColor: COLORS.ink, overflow: 'hidden', opacity: pending ? 0.6 : 1 }, faceStyle]}>
          <View style={{ aspectRatio: 1, backgroundColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }}>
            {art ? <Image source={{ uri: art }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
            <View style={{ position: 'absolute', top: 6, left: 6 }}><RarityBadge rarity={rarity} /></View>
            {pet.is_active ? <View style={{ position: 'absolute', top: 6, right: 6 }}><ActiveStamp /></View> : null}
            {pending ? <View style={{ position: 'absolute', bottom: 6, alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper }}><Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 9, color: COLORS.ink }}>进化中…</Text></View> : null}
          </View>
          <View style={{ padding: 10, gap: 6 }}>
            <Text numberOfLines={1} style={{ fontFamily: 'Fredoka_700Bold', fontSize: 14, color: COLORS.ink }}>{title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: COLORS.ink }}>Lv.{pet.level}</Text>
              {pet.element ? <Text numberOfLines={1} style={{ fontFamily: 'Nunito_700Bold', fontSize: 10, color: COLORS.mute, maxWidth: '60%' }}>{pet.element}</Text> : null}
            </View>
            <ProgressBar pct={petExpPct(pet.level, pet.exp)} fill={COLORS.sunshine} height={8} />
          </View>
        </Animated.View>
      </View>
      <View style={{ height: off + 4 }} />
    </Pressable>
  )
}
```

- [ ] **Step 2:** typecheck → commit `git add mobile/components/PetCard.tsx && git commit -m "feat(mobile): rarity-framed PetCard"`

---

## Task 7: use-pets hooks + apiSend

**Files:** Modify `mobile/src/lib/api-client.ts`; Create `mobile/src/lib/use-pets.ts`

- [ ] **Step 1: Add `apiSend` to api-client (non-throwing, returns status + parsed body)**

Append to `mobile/src/lib/api-client.ts`:

```ts
/** Like apiFetch but never throws on non-2xx — returns the status + parsed JSON so
 *  callers can branch on domain error codes (e.g. PET_SLOT_FULL). 401 refresh-retries once. */
export async function apiSend<T = unknown>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `${API_BASE_URL}${path}`
  const doFetch = async () =>
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: body == null ? undefined : JSON.stringify(body),
    })
  let res = await doFetch()
  if (res.status === 401) {
    const { error } = await supabase.auth.refreshSession()
    if (!error) res = await doFetch()
  }
  const data = (await res.json().catch(() => ({}))) as T
  return { ok: res.ok, status: res.status, data }
}
```

- [ ] **Step 2: Create the hooks**

```tsx
import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiSend } from './api-client'
import { supabase } from './supabase'
import type { PetsResponse } from './types'

export function usePets() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['pets'], queryFn: () => apiFetch<PetsResponse>('/api/pets') })

  // Realtime: any change to my user_pets → refetch (evolve/hatch art, level-ups go live).
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id
      if (!uid || cancelled) return
      channel = supabase
        .channel('user_pets_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_pets', filter: `user_id=eq.${uid}` },
          () => { qc.invalidateQueries({ queryKey: ['pets'] }) })
        .subscribe()
    })()
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [qc])

  return query
}

export type EvolveResult =
  | { ok: true; target: number }
  | { ok: false; code: string; need?: { level?: number; item?: string } }

export function useSetPetActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { user_pet_id: string; active: boolean }): Promise<{ ok: true } | { ok: false; code: string }> => {
      const r = await apiSend<{ error?: string }>('/api/pets', 'PATCH', vars)
      if (r.ok) return { ok: true }
      return { ok: false, code: r.data?.error ?? `HTTP_${r.status}` }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pets'] }),
  })
}

export function useEvolvePet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { user_pet_id: string }): Promise<EvolveResult> => {
      const r = await apiSend<{ target?: number; error?: string; need?: { level?: number; item?: string } }>('/api/pets/evolve', 'POST', vars)
      if (r.ok) return { ok: true, target: r.data.target ?? 0 }
      return { ok: false, code: r.data?.error ?? `HTTP_${r.status}`, need: r.data?.need }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pets'] }),
  })
}
```

- [ ] **Step 3:** `cd mobile && pnpm typecheck` → commit `git add mobile/src/lib/api-client.ts mobile/src/lib/use-pets.ts && git commit -m "feat(mobile): apiSend + usePets/useSetPetActive/useEvolvePet hooks (realtime-backed)"`

---

## Task 8: PetDetailSheet

**Files:** Create `mobile/components/pets/PetDetailSheet.tsx`

- [ ] **Step 1: Create it**

A `forwardRef<BottomSheetModal>` wrapping `BottomSheetModal` (snap `['90%']`). Shows art, title, RarityBadge + element, evolution stage dots (1..max_stage), Lv + EXP bar + stage progress, HP/ATK/DEF, and a sticky footer: **进化** (enabled when `evolution_stage < max_stage && !pending_render`) and **出战/收回**. Wires mutations + toast + confetti on evolve success.

```tsx
import { forwardRef, useState } from 'react'
import { View, Text, Image } from 'react-native'
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import ConfettiCannon from 'react-native-confetti-cannon'
import { Dimensions } from 'react-native'
import { Brutal } from '@/components/Brutal'
import { Button } from '@/components/Button'
import { ProgressBar } from '@/components/ProgressBar'
import { RarityBadge } from '@/components/RarityBadge'
import { useToast } from '@/components/Toast'
import { useSetPetActive, useEvolvePet } from '@/src/lib/use-pets'
import { petExpPct, evolveErrorMessage } from '@/src/lib/pet-derive'
import { success as hapticSuccess, tapMedium } from '@/src/lib/haptics'
import { COLORS, RARITY, type Rarity } from '@/theme/tokens'
import type { UserPet } from '@/src/lib/types'

const CANDY = [COLORS.mint, COLORS.pink, COLORS.periwinkle, COLORS.sunshine, COLORS.coral, COLORS.sky, COLORS.lilac]

function StageDots({ stage, max }: { stage: number; max: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: max }, (_, i) => (
        <View key={i} style={{ width: 14, height: 14, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: i < stage ? COLORS.periwinkle : COLORS.paper }} />
      ))}
      <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: COLORS.ink, marginLeft: 4 }}>{stage}/{max} 阶</Text>
    </View>
  )
}

export const PetDetailSheet = forwardRef<BottomSheetModal, { pet: UserPet | null }>(function PetDetailSheet({ pet }, ref) {
  const toast = useToast()
  const setActive = useSetPetActive()
  const evolve = useEvolvePet()
  const [burst, setBurst] = useState(0)

  if (!pet) {
    return <BottomSheetModal ref={ref} snapPoints={['90%']} backgroundStyle={{ backgroundColor: COLORS.cream }}><BottomSheetView /></BottomSheetModal>
  }

  const rarity = (pet.rarity ?? 'common') as Rarity
  const title = pet.nickname || pet.name || '神秘宠物'
  const art = pet.current_image_url || pet.base_image_url
  const canEvolve = pet.evolution_stage < pet.max_stage && pet.pending_render == null
  const s = pet.stats ?? {}

  const onDispatch = async () => {
    tapMedium()
    const r = await setActive.mutateAsync({ user_pet_id: pet.id, active: !pet.is_active })
    if (!r.ok) toast.show({ message: evolveErrorMessage(r.code), tone: 'error' })
  }
  const onEvolve = async () => {
    const r = await evolve.mutateAsync({ user_pet_id: pet.id })
    if (r.ok) { hapticSuccess(); setBurst((n) => n + 1); toast.show({ message: '进化开始！稍候新形态揭晓', tone: 'success' }) }
    else toast.show({ message: evolveErrorMessage(r.code, r.need), tone: 'error' })
  }

  return (
    <BottomSheetModal ref={ref} snapPoints={['90%']} backgroundStyle={{ backgroundColor: COLORS.cream }} handleIndicatorStyle={{ backgroundColor: COLORS.ink }}>
      <BottomSheetView style={{ flex: 1, padding: 16, gap: 14 }}>
        <Brutal bg={RARITY[rarity].bg} radius={20} offset="md" faceStyle={{ padding: 0, overflow: 'hidden' }} plates={RARITY[rarity].plates}>
          <View style={{ aspectRatio: 16 / 10, backgroundColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }}>
            {art ? <Image source={{ uri: art }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
          </View>
        </Brutal>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 22, color: COLORS.ink, flex: 1 }} numberOfLines={1}>{title}</Text>
          <RarityBadge rarity={rarity} />
        </View>
        {pet.element ? <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.mute }}>{pet.element}</Text> : null}

        <StageDots stage={pet.evolution_stage} max={pet.max_stage} />

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>Lv.{pet.level}</Text>
            <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: COLORS.mute }}>EXP {pet.exp}</Text>
          </View>
          <ProgressBar pct={petExpPct(pet.level, pet.exp)} fill={COLORS.sunshine} height={10} />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {([['HP', s.hp], ['ATK', s.atk], ['DEF', s.def]] as const).map(([k, v]) => (
            <View key={k} style={{ flex: 1 }}>
              <Brutal bg={COLORS.paper} radius={12} offset="sm" faceStyle={{ padding: 10, alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 18, color: COLORS.ink }}>{v ?? '—'}</Text>
                <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 10, color: COLORS.mute }}>{k}</Text>
              </Brutal>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto', paddingBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label={pet.is_active ? '收回' : '出战'} variant={pet.is_active ? 'coral' : 'mint'} onPress={onDispatch} disabled={setActive.isPending} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={pet.pending_render ? '进化中…' : '进化'} variant="peri" onPress={onEvolve} disabled={!canEvolve || evolve.isPending} />
          </View>
        </View>
      </BottomSheetView>

      {burst > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <ConfettiCannon key={burst} count={80} origin={{ x: Dimensions.get('window').width / 2, y: 0 }} autoStart fadeOut explosionSpeed={350} fallSpeed={2600} colors={CANDY} />
        </View>
      ) : null}
    </BottomSheetModal>
  )
})
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/pets/PetDetailSheet.tsx && git commit -m "feat(mobile): PetDetailSheet (gorhom) — evolve/dispatch wired"`

---

## Task 9: Pets gallery screen

**Files:** Rewrite `mobile/app/(tabs)/pets.tsx`

- [ ] **Step 1: Rewrite**

FlashList 2-col of `<PetCard>` with a dispatch-slots header (active N/max, coral when full) + rarity-tally chips; tapping a card opens the detail sheet. Loading/empty states reuse `LoadingState`/`EmptyState`.

```tsx
import { useMemo, useRef, useState } from 'react'
import { View, Text } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { PawPrint } from 'lucide-react-native'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { PetCard } from '@/components/PetCard'
import { PetDetailSheet } from '@/components/pets/PetDetailSheet'
import { usePets } from '@/src/lib/use-pets'
import { tapLight } from '@/src/lib/haptics'
import { COLORS } from '@/theme/tokens'
import type { UserPet } from '@/src/lib/types'

export default function PetsScreen() {
  const insets = useSafeAreaInsets()
  const { data, isLoading, refetch, isRefetching } = usePets()
  const sheetRef = useRef<BottomSheetModal>(null)
  const [sel, setSel] = useState<UserPet | null>(null)

  const pets = data?.pets ?? []
  // keep the selected pet in sync with fresh data (e.g. after evolve/realtime)
  const selFresh = useMemo(() => (sel ? pets.find((p) => p.id === sel.id) ?? sel : null), [sel, pets])

  if (isLoading) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><LoadingState label="加载宠物…" /></View>

  const openPet = (p: UserPet) => { tapLight(); setSel(p); sheetRef.current?.present() }
  const full = (data?.active_count ?? 0) >= (data?.max_active ?? 3)

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <FlashList
        data={pets}
        keyExtractor={(p) => p.id}
        numColumns={2}
        estimatedItemSize={210}
        contentContainerStyle={{ padding: 12, paddingTop: insets.top + 8 }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 4, paddingBottom: 12, gap: 8 }}>
            <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 24, color: COLORS.ink }}>宠物图鉴</Text>
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: full ? COLORS.coral : COLORS.mint }}>
              <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: full ? COLORS.paper : COLORS.ink }}>出战 {data?.active_count ?? 0}/{data?.max_active ?? 3}</Text>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={{ flex: 1, paddingHorizontal: 4, paddingBottom: 8, marginRight: index % 2 === 0 ? 4 : 0, marginLeft: index % 2 === 1 ? 4 : 0 }}>
            <PetCard pet={item} onPress={() => openPet(item)} />
          </View>
        )}
        ListEmptyComponent={<EmptyState Icon={PawPrint} title="还没有宠物" subtitle="去冒险捕捉第一只伙伴" />}
        onRefresh={refetch}
        refreshing={isRefetching}
      />
      <PetDetailSheet ref={sheetRef} pet={selFresh} />
    </View>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/app/\(tabs\)/pets.tsx && git commit -m "feat(mobile): Pets gallery (FlashList) + detail sheet wiring"`

---

## Task 10: Final gate + acceptance

- [ ] **Step 1:** `cd mobile && pnpm test && pnpm typecheck` → tests green (incl. pet-derive), typecheck clean.

- [ ] **Step 2: On-device acceptance** (`npx expo start`):
1. Pets tab shows a **2-column grid** of pets with **rarity-colored frames**, art, name, Lv, element, EXP bar.
2. Header shows **出战 N/3** (coral when full); active pets show the **出战 stamp**.
3. Tapping a card opens a **draggable bottom sheet** (~90%) with art, stage dots, Lv/EXP, HP/ATK/DEF, and 出战/进化 buttons.
4. **出战/收回** toggles live; dispatching a 4th when full raises a **coral toast** (出战位已满).
5. **进化** on an eligible pet fires **confetti + success haptic** + a success toast; an ineligible pet shows the reason (Lv too low / missing item) as a coral toast; the card shows **进化中…** and dims.
6. After the worker finishes the evolution render, the **new art appears live** (Realtime) without manual refresh.
7. Pull-to-refresh works; cards show the **black offset plate** (Android: not clipped).

- [ ] **Step 3:** Final cleanup commit if needed.

---

## Self-Review

**Spec coverage** (spec §屏幕 "Pet Gallery" + "Pet Detail"): FlashList 2-col sticker PetCard (art, footer Lv/element/EXP, rarity, active stamp) ✔ (Task 6,9); DispatchSlots N/max with full=coral ✔ (Task 9); gorhom draggable detail sheet (rarity-framed, stage progress, Lv/EXP, HP/ATK/DEF) ✔ (Task 8); evolve→`/api/pets/evolve`→pending_render shimmer + confetti + Success haptic ✔ (Task 8); dispatch/recall→PATCH `/api/pets`, 409 `PET_SLOT_FULL`→coral toast ✔ (Task 8); optimistic-ish via invalidate + Realtime refeed ✔ (Task 7); Realtime swaps evolved art ✔ (Task 7). **Deferred/flagged:** rarity-summary *filter track* trimmed to a dispatch-slots header + empty rarity is acceptable for this slice (full filter rail can follow); legendary holo Skia shimmer is out of scope (spec's legendary effect is its own later task); `expo-image` fade deferred to Slice E (RN `Image` used here to honor the two-dep cap the user approved).

**Placeholder scan:** none — all code complete.

**Type consistency:** `UserPet`/`PetsResponse` (Task 2) field names match every consumer (Tasks 6–9). `petNextLevelExp`/`petExpPct`/`evolveErrorMessage` (Task 3) match call sites. `apiSend` signature (Task 7) matches `useSetPetActive`/`useEvolvePet`. `PetDetailSheet` is `forwardRef<BottomSheetModal>`, consumed via `useRef<BottomSheetModal>` in `pets.tsx`. Two `Rarity` aliases (tokens vs types) are structurally identical unions — see Task 5 note; components index `RARITY` with the tokens alias.

**Ordering caveat:** Task 1 Step 2 (root layout) imports `ToastProvider` (Task 4) and `BottomSheetModalProvider` (Task 1 dep) — execute Task 1 Step 1 (install) first, then Tasks 2–4, then Task 1 Steps 2–3. Called out inline so the typecheck gate never runs against a missing import.
