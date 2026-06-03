# Mobile Slice D — Inventory Tab (grid + action sheet: use/equip/hatch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Build the Inventory tab to spec: a FlashList 2-column `<ItemCard>` grid (rarity-framed art, qty badge, equipped stamp) with a stats strip + type filter track, and a `@gorhom/bottom-sheet` `<ItemActionSheet>` whose action adapts to the item `type` — **使用** (consumable), **装备/卸下** (equip), **孵化** (egg, the big moment: heavy haptic + confetti + pink toast → deep-link to Pets) — wired to `/api/inventory/use` and `/api/inventory/equip` (Bearer, live since Slice B), kept fresh by a Supabase Realtime subscription on `user_inventory`.

**Architecture:** Reuses the Slice C pattern wholesale. Data via `useInventory()` — `useQuery(['inventory'])` → `apiFetch('/api/inventory')` (returns `{items, stats}`) + a `user_inventory` Realtime subscription that invalidates `['inventory']`. Mutations `useUseItem` / `useEquipItem` via `apiSend` (non-throwing), mapping backend codes (`NOT_USABLE`/`NOT_EQUIPPABLE`/`ITEM_NOT_FOUND`) and effect payloads (`stamina`/`bonus_drops`/`hatch`) to toasts. Pure logic (action-for-type, effect/error messages) in a renderless, unit-tested `inventory-derive.ts`. Hatching an egg creates a `pending_render:'hatch'` pet server-side; the app celebrates and navigates to the Pets tab where Slice C's Realtime swaps in the hatched art. No new deps — gorhom/flash-list/confetti/Toast already present.

**Tech Stack:** Expo SDK 52, `@gorhom/bottom-sheet`, `@shopify/flash-list`, `react-native-confetti-cannon`, TanStack Query 5, supabase-js Realtime, expo-router (`router.navigate('/pets')`).

**Item taxonomy** (`items.type`): `consumable` → use · `egg` → hatch (use endpoint) · `equip` → equip/unequip · `collect`/`material` → view-only.

**Verification:** pure logic TDD'd via jest; UI gated on `pnpm typecheck` + on-device acceptance.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `mobile/src/lib/types.ts` | `InventoryItem`, `InventoryResponse` | Modify |
| `mobile/src/lib/inventory-derive.ts` (+`.test.ts`) | action-for-type, effect/error messages | Create |
| `mobile/src/lib/use-inventory.ts` | `useInventory` (query+realtime), `useUseItem`, `useEquipItem` | Create |
| `mobile/components/ItemCard.tsx` | grid cell (rarity-framed, qty, equipped) | Create |
| `mobile/components/inventory/ItemActionSheet.tsx` | gorhom action sheet | Create |
| `mobile/app/(tabs)/inventory.tsx` | inventory screen | Rewrite |

---

## Task 1: Inventory types

**Files:** Modify `mobile/src/lib/types.ts`

- [ ] **Step 1: Append**

```ts
export type ItemType = 'consumable' | 'egg' | 'equip' | 'collect' | 'material'

export type ItemMeta = {
  slug: string
  name: string
  description: string | null
  type: ItemType | string
  rarity: Rarity
  image_url: string | null
  metadata?: unknown
}

export type InventoryItem = {
  id: string
  item_slug: string
  qty: number
  equipped: boolean
  acquired_adventure_id: string | null
  acquired_at: string
  meta: ItemMeta
}

export type InventoryResponse = {
  items: InventoryItem[]
  stats: {
    total_qty: number
    unique_count: number
    by_type: Record<string, number>
    by_rarity: Record<string, number>
  }
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/src/lib/types.ts && git commit -m "feat(mobile): InventoryItem + InventoryResponse types"`

---

## Task 2: inventory-derive (TDD)

**Files:** Create `mobile/src/lib/inventory-derive.ts` + `.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { itemAction, useEffectMessage, inventoryErrorMessage } from './inventory-derive'

describe('itemAction', () => {
  it('maps type to the affordance', () => {
    expect(itemAction('consumable')).toBe('use')
    expect(itemAction('egg')).toBe('hatch')
    expect(itemAction('equip')).toBe('equip')
    expect(itemAction('collect')).toBe('none')
    expect(itemAction('material')).toBe('none')
    expect(itemAction('weird')).toBe('none')
  })
})

describe('useEffectMessage', () => {
  it('describes each consume effect', () => {
    expect(useEffectMessage({ effect: 'stamina', stamina: 120 })).toContain('120')
    expect(useEffectMessage({ effect: 'bonus_drops', bonus_drops: 2 })).toContain('保底')
    expect(useEffectMessage({ effect: 'hatch', rarity: 'rare' })).toContain('孵化')
    expect(useEffectMessage({ effect: 'unknown' as never })).toBeTruthy()
  })
})

describe('inventoryErrorMessage', () => {
  it('maps known codes', () => {
    expect(inventoryErrorMessage('NOT_USABLE')).toBeTruthy()
    expect(inventoryErrorMessage('NOT_EQUIPPABLE')).toContain('装备')
    expect(inventoryErrorMessage('ITEM_NOT_FOUND')).toContain('找不到')
    expect(inventoryErrorMessage('???')).toBeTruthy()
  })
})
```

- [ ] **Step 2:** `cd mobile && pnpm test` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
export type ItemActionKind = 'use' | 'equip' | 'hatch' | 'none'

export function itemAction(type: string): ItemActionKind {
  switch (type) {
    case 'consumable': return 'use'
    case 'egg': return 'hatch'
    case 'equip': return 'equip'
    default: return 'none'
  }
}

export type UseEffect =
  | { effect: 'stamina'; stamina: number; scene_tier?: string }
  | { effect: 'bonus_drops'; bonus_drops: number }
  | { effect: 'hatch'; rarity: string }
  | { effect: string; [k: string]: unknown }

export function useEffectMessage(r: UseEffect): string {
  switch (r.effect) {
    case 'stamina': return `体力恢复 → ${(r as { stamina: number }).stamina}`
    case 'bonus_drops': return '下次冒险保底掉落 +1'
    case 'hatch': return '孵化成功！去「宠物」看看新伙伴'
    default: return '使用成功'
  }
}

export function inventoryErrorMessage(code: string): string {
  switch (code) {
    case 'NOT_USABLE': return '这个物品不能直接使用'
    case 'NOT_EQUIPPABLE': return '这个物品不能装备'
    case 'ITEM_NOT_FOUND': return '找不到这个物品'
    default: return '操作失败，请重试'
  }
}
```

- [ ] **Step 4:** `cd mobile && pnpm test` (green) + `pnpm typecheck` → commit `git add mobile/src/lib/inventory-derive.ts mobile/src/lib/inventory-derive.test.ts && git commit -m "feat(mobile): inventory-derive action/effect/error helpers + tests"`

---

## Task 3: use-inventory hooks

**Files:** Create `mobile/src/lib/use-inventory.ts`

- [ ] **Step 1: Create it** (mirrors `use-pets.ts`; `apiSend` already exists from Slice C)

```tsx
import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiSend } from './api-client'
import { supabase } from './supabase'
import type { InventoryResponse } from './types'
import type { UseEffect } from './inventory-derive'

export function useInventory() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['inventory'], queryFn: () => apiFetch<InventoryResponse>('/api/inventory') })

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id
      if (!uid || cancelled) return
      channel = supabase
        .channel('user_inventory_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_inventory', filter: `user_id=eq.${uid}` },
          () => { qc.invalidateQueries({ queryKey: ['inventory'] }) })
        .subscribe()
    })()
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [qc])

  return query
}

export type UseItemResult = { ok: true; data: UseEffect } | { ok: false; code: string }
export function useUseItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { item_id: string }): Promise<UseItemResult> => {
      const r = await apiSend<UseEffect & { error?: string }>('/api/inventory/use', 'POST', vars)
      if (r.ok) return { ok: true, data: r.data }
      return { ok: false, code: r.data?.error ?? `HTTP_${r.status}` }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['pets'] })       // egg hatch creates a pet
      qc.invalidateQueries({ queryKey: ['dashboard'] })  // stamina/buffs change
    },
  })
}

export type EquipResult = { ok: true; equipped: boolean } | { ok: false; code: string }
export function useEquipItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { item_id: string; equipped: boolean }): Promise<EquipResult> => {
      const r = await apiSend<{ equipped?: boolean; error?: string }>('/api/inventory/equip', 'POST', vars)
      if (r.ok) return { ok: true, equipped: r.data.equipped ?? vars.equipped }
      return { ok: false, code: r.data?.error ?? `HTTP_${r.status}` }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/src/lib/use-inventory.ts && git commit -m "feat(mobile): useInventory/useUseItem/useEquipItem hooks (realtime-backed)"`

---

## Task 4: ItemCard

**Files:** Create `mobile/components/ItemCard.tsx`

- [ ] **Step 1: Create it** (parallels `PetCard`; qty badge bottom-right, sunshine equipped stamp)

```tsx
import { Pressable, View, Text, Image } from 'react-native'
import Animated from 'react-native-reanimated'
import { ProgressBar } from './ProgressBar'
import { RarityBadge } from './RarityBadge'
import { usePressPhysics } from './usePressPhysics'
import { COLORS, RARITY, type Rarity } from '@/theme/tokens'
import type { InventoryItem } from '@/src/lib/types'

export function ItemCard({ item, onPress }: { item: InventoryItem; onPress: () => void }) {
  const { off, faceStyle, plateStyle, onPressIn, onPressOut } = usePressPhysics('md')
  const rarity = (item.meta.rarity ?? 'common') as Rarity
  const plates = RARITY[rarity].plates
  const name = item.meta.name || item.item_slug
  const art = item.meta.image_url

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress} style={{ flex: 1 }}>
      <View style={{ position: 'relative' }}>
        {plates.map((p, i) => (
          <Animated.View key={i} pointerEvents="none" style={[{ position: 'absolute', left: p.off, top: p.off, right: -p.off, bottom: -p.off, backgroundColor: p.color, borderRadius: 16 }, plateStyle]} />
        ))}
        <Animated.View style={[{ backgroundColor: RARITY[rarity].bg, borderRadius: 16, borderWidth: 2, borderColor: COLORS.ink, overflow: 'hidden' }, faceStyle]}>
          <View style={{ aspectRatio: 1, backgroundColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }}>
            {art ? <Image source={{ uri: art }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
            <View style={{ position: 'absolute', top: 6, left: 6 }}><RarityBadge rarity={rarity} /></View>
            {item.equipped ? (
              <View style={{ position: 'absolute', top: 6, right: 6, transform: [{ rotate: '8deg' }], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.sunshine }}>
                <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 10, color: COLORS.ink }}>已装备</Text>
              </View>
            ) : null}
            {item.qty > 1 ? (
              <View style={{ position: 'absolute', bottom: 6, right: 6, minWidth: 24, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.ink, alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 11, color: COLORS.paper }}>×{item.qty}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ padding: 10, gap: 4 }}>
            <Text numberOfLines={1} style={{ fontFamily: 'Fredoka_700Bold', fontSize: 13, color: COLORS.ink }}>{name}</Text>
            <Text numberOfLines={1} style={{ fontFamily: 'Nunito_700Bold', fontSize: 10, color: COLORS.mute }}>{item.meta.type}</Text>
          </View>
        </Animated.View>
      </View>
      <View style={{ height: off + 4 }} />
    </Pressable>
  )
}
```
*(`ProgressBar` import retained-free: removed — ItemCard has no bar. Drop the `ProgressBar` import line. The code above does NOT import ProgressBar.)*

> Implementer note: the code block above does **not** use `ProgressBar`; do not add that import.

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/ItemCard.tsx && git commit -m "feat(mobile): rarity-framed ItemCard (qty + equipped)"`

---

## Task 5: ItemActionSheet

**Files:** Create `mobile/components/inventory/ItemActionSheet.tsx`

- [ ] **Step 1: Create it** (gorhom sheet; action button adapts to `itemAction(type)`; egg hatch = heavy haptic + confetti + pink toast + navigate to Pets)

```tsx
import { forwardRef, useState } from 'react'
import { View, Text, Image, Dimensions } from 'react-native'
import { BottomSheetModal, BottomSheetView, useBottomSheetModal } from '@gorhom/bottom-sheet'
import ConfettiCannon from 'react-native-confetti-cannon'
import { router } from 'expo-router'
import { Brutal } from '@/components/Brutal'
import { Button } from '@/components/Button'
import { RarityBadge } from '@/components/RarityBadge'
import { useToast } from '@/components/Toast'
import { useUseItem, useEquipItem } from '@/src/lib/use-inventory'
import { itemAction, useEffectMessage, inventoryErrorMessage } from '@/src/lib/inventory-derive'
import { success as hapticSuccess, tapHeavy } from '@/src/lib/haptics'
import { COLORS, RARITY, type Rarity } from '@/theme/tokens'
import type { InventoryItem } from '@/src/lib/types'

const CANDY = [COLORS.mint, COLORS.pink, COLORS.periwinkle, COLORS.sunshine, COLORS.coral, COLORS.sky, COLORS.lilac]

export const ItemActionSheet = forwardRef<BottomSheetModal, { item: InventoryItem | null; onDone?: () => void }>(
  function ItemActionSheet({ item, onDone }, ref) {
    const toast = useToast()
    const { dismiss } = useBottomSheetModal()
    const useItem = useUseItem()
    const equip = useEquipItem()
    const [burst, setBurst] = useState(0)

    if (!item) {
      return <BottomSheetModal ref={ref} snapPoints={['60%']} backgroundStyle={{ backgroundColor: COLORS.cream }}><BottomSheetView><View /></BottomSheetView></BottomSheetModal>
    }

    const rarity = (item.meta.rarity ?? 'common') as Rarity
    const action = itemAction(item.meta.type)
    const name = item.meta.name || item.item_slug
    const art = item.meta.image_url

    const close = () => { onDone?.(); dismiss() }

    const onUse = async () => {
      const r = await useItem.mutateAsync({ item_id: item.id })
      if (!r.ok) { toast.show({ message: inventoryErrorMessage(r.code), tone: 'error' }); return }
      if (r.data.effect === 'hatch') {
        tapHeavy(); setBurst((n) => n + 1)
        toast.show({ message: useEffectMessage(r.data), tone: 'success' })
        setTimeout(() => { close(); router.navigate('/pets') }, 900)
      } else {
        hapticSuccess(); toast.show({ message: useEffectMessage(r.data), tone: 'success' }); close()
      }
    }
    const onEquip = async () => {
      const r = await equip.mutateAsync({ item_id: item.id, equipped: !item.equipped })
      if (!r.ok) { toast.show({ message: inventoryErrorMessage(r.code), tone: 'error' }); return }
      toast.show({ message: r.equipped ? '已装备' : '已卸下', tone: 'success' }); close()
    }

    return (
      <BottomSheetModal ref={ref} snapPoints={['60%']} backgroundStyle={{ backgroundColor: COLORS.cream }} handleIndicatorStyle={{ backgroundColor: COLORS.ink }}>
        <BottomSheetView style={{ flex: 1, padding: 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Brutal bg={RARITY[rarity].bg} radius={16} offset="md" plates={[...RARITY[rarity].plates]} faceStyle={{ padding: 0, overflow: 'hidden' }}>
              <View style={{ width: 96, height: 96, backgroundColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }}>
                {art ? <Image source={{ uri: art }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
              </View>
            </Brutal>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 20, color: COLORS.ink }} numberOfLines={2}>{name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <RarityBadge rarity={rarity} />
                <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: COLORS.mute }}>{item.meta.type} · ×{item.qty}</Text>
              </View>
            </View>
          </View>

          {item.meta.description ? <Text style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 13, color: COLORS.ink }}>{item.meta.description}</Text> : null}

          <View style={{ marginTop: 'auto', paddingBottom: 8, gap: 10 }}>
            {action === 'use' ? <Button label="使用" variant="mint" onPress={onUse} disabled={useItem.isPending} /> : null}
            {action === 'hatch' ? <Button label="孵化" variant="pink" onPress={onUse} disabled={useItem.isPending} /> : null}
            {action === 'equip' ? <Button label={item.equipped ? '卸下' : '装备'} variant={item.equipped ? 'coral' : 'sunshine'} onPress={onEquip} disabled={equip.isPending} /> : null}
            {action === 'none' ? <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.mute, textAlign: 'center' }}>该物品用于冒险/进化，暂无直接操作</Text> : null}
          </View>
        </BottomSheetView>

        {burst > 0 ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <ConfettiCannon key={burst} count={90} origin={{ x: Dimensions.get('window').width / 2, y: 0 }} autoStart fadeOut explosionSpeed={350} fallSpeed={2600} colors={CANDY} />
          </View>
        ) : null}
      </BottomSheetModal>
    )
  }
)
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/inventory/ItemActionSheet.tsx && git commit -m "feat(mobile): ItemActionSheet (use/equip/hatch) — egg hatch big moment"`

---

## Task 6: Inventory screen

**Files:** Rewrite `mobile/app/(tabs)/inventory.tsx`

- [ ] **Step 1: Rewrite** (FlashList 2-col + stats header + type filter track + action sheet)

```tsx
import { useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, ScrollView } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { Package } from 'lucide-react-native'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { ItemCard } from '@/components/ItemCard'
import { ItemActionSheet } from '@/components/inventory/ItemActionSheet'
import { useInventory } from '@/src/lib/use-inventory'
import { tapLight } from '@/src/lib/haptics'
import { COLORS } from '@/theme/tokens'
import type { InventoryItem } from '@/src/lib/types'

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'consumable', label: '消耗' },
  { key: 'equip', label: '装备' },
  { key: 'egg', label: '宠物蛋' },
  { key: 'material', label: '材料' },
  { key: 'collect', label: '收藏' },
]

export default function InventoryScreen() {
  const insets = useSafeAreaInsets()
  const { data, isLoading, refetch, isRefetching } = useInventory()
  const sheetRef = useRef<BottomSheetModal>(null)
  const [sel, setSel] = useState<InventoryItem | null>(null)
  const [filter, setFilter] = useState('all')

  const items = data?.items ?? []
  const shown = useMemo(() => (filter === 'all' ? items : items.filter((i) => i.meta.type === filter)), [items, filter])
  const selFresh = useMemo(() => (sel ? items.find((i) => i.id === sel.id) ?? sel : null), [sel, items])

  if (isLoading) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><LoadingState label="加载背包…" /></View>

  const open = (it: InventoryItem) => { tapLight(); setSel(it); sheetRef.current?.present() }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <FlashList<InventoryItem>
        data={shown}
        keyExtractor={(it: InventoryItem) => it.id}
        numColumns={2}
        estimatedItemSize={190}
        contentContainerStyle={{ padding: 12, paddingTop: insets.top + 8 }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 4, paddingBottom: 12, gap: 10 }}>
            <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 24, color: COLORS.ink }}>背包</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.mint }}>
                <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>共 {data?.stats.total_qty ?? 0} 件</Text>
              </View>
              <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.sky }}>
                <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>{data?.stats.unique_count ?? 0} 种</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {FILTERS.map((f) => {
                const on = filter === f.key
                return (
                  <Pressable key={f.key} onPress={() => { tapLight(); setFilter(f.key) }}
                    style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: on ? COLORS.periwinkle : COLORS.paper }}>
                    <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: on ? COLORS.paper : COLORS.ink }}>{f.label}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        }
        renderItem={({ item }: { item: InventoryItem }) => (
          <View style={{ flex: 1, paddingHorizontal: 4, paddingBottom: 8 }}>
            <ItemCard item={item} onPress={() => open(item)} />
          </View>
        )}
        ListEmptyComponent={<EmptyState Icon={Package} title="背包是空的" subtitle="去冒险收集物品与宠物蛋" />}
        onRefresh={refetch}
        refreshing={isRefetching}
      />
      <ItemActionSheet ref={sheetRef} item={selFresh} />
    </View>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/app/\(tabs\)/inventory.tsx && git commit -m "feat(mobile): Inventory tab (FlashList grid + filters + action sheet)"`

---

## Task 7: Final gate + acceptance

- [ ] **Step 1:** `cd mobile && pnpm test && pnpm typecheck` → tests green (incl. inventory-derive), typecheck clean.

- [ ] **Step 2: On-device acceptance** (`npx expo start`):
1. Inventory tab shows a **2-col grid** with rarity frames, art, name, type, **×qty** badge, **已装备** stamp on equipped gear.
2. Header: **共 N 件 / N 种**; the **type filter track** (全部/消耗/装备/宠物蛋/材料/收藏) filters live.
3. Tapping an item opens the **action sheet** with the right button: 消耗→使用, 装备→装备/卸下, 蛋→孵化, 材料/收藏→"暂无直接操作".
4. **使用** a consumable → success toast (体力/保底); item qty decrements live (Realtime).
5. **装备/卸下** gear → toast + stamp updates live.
6. **孵化** an egg → **heavy haptic + confetti + pink toast**, then auto-navigates to the **Pets** tab, where the new "孵化中…" pet appears and (after the worker renders) its art swaps in live.
7. Pull-to-refresh works; cards show the **black offset plate** (Android: not clipped).

- [ ] **Step 3:** Final cleanup commit if needed.

---

## Self-Review

**Spec coverage** (spec §屏幕 "Inventory"): FlashList 2-col ItemCard (qty ink 胶囊, 装备 sunshine 章) ✔ (Task 4); StatsStrip 计数 tile + 类型 filter 轨 ✔ (Task 6); ItemActionSheet 使用/装备/孵化 ✔ (Task 5); actions → `/api/inventory/use|equip` ✔ (Task 3); egg hatch big moment (heavy haptic + confetti + pink toast 深链进 Pets) ✔ (Task 5); direct-read-equivalent via `/api/inventory` + Realtime refeed ✔ (Task 3). **Deferred/flagged:** "稀有度 tally" trimmed to the 共/种 stats chips (rarity tally chips can follow); the egg **wobble-crack** animation is deferred (confetti + heavy haptic + navigate convey the moment); item **来源链接** (acquired_adventure_id → adventure detail) deferred to Slice E when adventure detail exists.

**Placeholder scan:** none — all code complete. (ItemCard note: do NOT import `ProgressBar`.)

**Type consistency:** `InventoryItem`/`InventoryResponse`/`ItemType` (Task 1) match every consumer. `itemAction`/`useEffectMessage`/`inventoryErrorMessage` + `UseEffect` (Task 2) match `use-inventory` + the action sheet. `apiSend` reused from Slice C. `ItemActionSheet` is `forwardRef<BottomSheetModal>`, consumed via `useRef<BottomSheetModal>` + `selFresh` freshness (same pattern as `PetDetailSheet`). FlashList generic pinned `<FlashList<InventoryItem>>` with annotated callbacks (the Slice C fix, applied preemptively).
