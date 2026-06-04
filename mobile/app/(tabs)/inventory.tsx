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
  const shown = useMemo(() => (filter === 'all' ? items : items.filter((i: InventoryItem) => i.meta.type === filter)), [items, filter])
  const selFresh = useMemo(() => (sel ? items.find((i: InventoryItem) => i.id === sel.id) ?? sel : null), [sel, items])

  if (isLoading) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><LoadingState label="加载背包…" /></View>

  const open = (it: InventoryItem) => { setSel(it); sheetRef.current?.present() }

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
