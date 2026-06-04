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
