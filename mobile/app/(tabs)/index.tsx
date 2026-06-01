import { ScrollView, View, Text, RefreshControl } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/src/lib/api-client'
import type { Dashboard } from '@/src/lib/types'
import { Card } from '@/components/Card'
import { StatTile } from '@/components/StatTile'
import { ProgressBar } from '@/components/ProgressBar'
import { LoadingState } from '@/components/LoadingState'
import { COLORS } from '@/theme/tokens'

export default function Home() {
  const insets = useSafeAreaInsets()
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'], queryFn: () => apiFetch<Dashboard>('/api/dashboard'),
  })
  if (isLoading) return <LoadingState label="加载首页…" />
  const c = data?.character; const t = data?.today_snapshot; const stam = data?.today_stamina
  const expPct = c ? (c.exp / Math.max(c.next_level_exp, 1)) * 100 : 0
  const sleepH = t?.sleep_minutes != null ? (t.sleep_minutes / 60).toFixed(1) : '–'
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, gap: 16 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.periwinkle} />}
    >
      {/* 角色 hero */}
      <Card bg={COLORS.periwinkle}>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 26, color: COLORS.paper }}>{c?.name ?? 'Hermes'}</Text>
        <Text style={{ fontFamily: 'Fredoka_600SemiBold', color: COLORS.paper, marginTop: 2 }}>Lv.{c?.level ?? 1}</Text>
        <View style={{ height: 10 }} />
        <ProgressBar pct={expPct} fill={COLORS.sunshine} />
        <Text style={{ color: COLORS.paper, fontSize: 12, marginTop: 4 }}>EXP {c?.exp ?? 0} / {c?.next_level_exp ?? 1000}</Text>
      </Card>

      {/* 今日体力 */}
      {stam && (
        <Card bg={COLORS.mint}>
          <Text style={{ fontFamily: 'Fredoka_600SemiBold', fontSize: 14 }}>今日体力 · {stam.tier_label}</Text>
          <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 32 }}>{stam.stamina}</Text>
          <ProgressBar pct={stam.stamina_pct} fill={COLORS.coral} />
        </Card>
      )}

      {/* Vitals 2x2 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ width: '47%' }}><StatTile color="mint" label="恢复" value={Math.round(t?.recovery_score ?? 0)} sub="Recovery" /></View>
        <View style={{ width: '47%' }}><StatTile color="sky" label="睡眠(h)" value={Number(sleepH) || 0} sub={`${sleepH}h`} /></View>
        <View style={{ width: '47%' }}><StatTile color="coral" label="负荷" value={Math.round(t?.strain ?? 0)} sub="Strain" /></View>
        <View style={{ width: '47%' }}><StatTile color="sunshine" label="连击" value={t?.streak ?? 0} sub="天" /></View>
      </View>
    </ScrollView>
  )
}
