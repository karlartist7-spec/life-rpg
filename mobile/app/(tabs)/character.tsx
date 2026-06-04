import { ScrollView, View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { User } from 'lucide-react-native'
import { apiFetch } from '@/src/lib/api-client'
import type { Dashboard } from '@/src/lib/types'
import { Brutal } from '@/components/Brutal'
import { StatTile } from '@/components/StatTile'
import { ProgressBar } from '@/components/ProgressBar'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { expPct } from '@/src/lib/dashboard-derive'
import { COLORS } from '@/theme/tokens'

type TrendPt = Dashboard['exp_trend'][number]
type Last7Pt = NonNullable<Dashboard['attributes']>['last7'][number]

function md(date: string): string {
  const parts = date.split('-')
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : date
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper }}>
      <View style={{ width: 10, height: 10, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: color }} />
      <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: COLORS.ink }}>{label}</Text>
    </View>
  )
}

export default function CharacterScreen() {
  const insets = useSafeAreaInsets()
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => apiFetch<Dashboard>('/api/dashboard') })

  if (isLoading) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><LoadingState label="加载数据…" /></View>
  const c = data?.character
  const attrs = data?.attributes
  const trend = data?.exp_trend ?? []

  if (!attrs) {
    return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><EmptyState Icon={User} title="暂无数据" subtitle="连接 WHOOP 后这里会显示你的属性与趋势" /></View>
  }

  const bars = trend.map((t: TrendPt) => ({ label: md(t.date), value: t.exp ?? 0 }))
  const last7 = attrs.last7 ?? []
  const recovery = last7.map((d: Last7Pt) => d.recovery)
  const sleepPerf = last7.map((d: Last7Pt) => d.sleep_perf)
  const strain = last7.map((d: Last7Pt) => (d.strain != null ? Math.round((d.strain / 21) * 100) : null)) // strain 0-21 → 0-100

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.cream }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, gap: 16 }}>
      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 24, color: COLORS.ink }}>{c?.name ?? 'Hermes'} · 数据中心</Text>

      {/* 三属性 */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><StatTile color="mint" label={attrs.physique.label} value={attrs.physique.value} sub="体魄" /></View>
        <View style={{ flex: 1 }}><StatTile color="sky" label={attrs.endurance.label} value={attrs.endurance.value} sub="耐力" /></View>
        <View style={{ flex: 1 }}><StatTile color="lilac" label={attrs.focus.label} value={attrs.focus.value} sub="专注" /></View>
      </View>

      {/* EXP 总览 */}
      <Brutal bg={COLORS.sunshine} radius={20} offset="md" faceStyle={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 16, color: COLORS.ink }}>等级 {c?.level ?? 1}</Text>
          <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 13, color: COLORS.ink }}>总 EXP {c?.total_exp ?? 0}</Text>
        </View>
        <View style={{ marginTop: 8 }}><ProgressBar pct={c ? expPct(c.exp, c.next_level_exp) : 0} fill={COLORS.mint} height={10} /></View>
      </Brutal>

      {/* 30 天 EXP 柱 */}
      <Brutal bg={COLORS.paper} radius={20} offset="md" faceStyle={{ padding: 16 }}>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 14, color: COLORS.ink, marginBottom: 10 }}>近 30 天 EXP</Text>
        {bars.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <BarChart data={bars} fill={COLORS.mint} />
          </ScrollView>
        ) : <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.mute }}>暂无记录</Text>}
      </Brutal>

      {/* 7 天三线 */}
      <Brutal bg={COLORS.paper} radius={20} offset="md" faceStyle={{ padding: 16 }}>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 14, color: COLORS.ink, marginBottom: 10 }}>近 7 天趋势</Text>
        <LineChart
          width={300}
          height={140}
          max={100}
          series={[
            { values: recovery, color: COLORS.mint },
            { values: sleepPerf, color: COLORS.sky },
            { values: strain, color: COLORS.lilac },
          ]}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <LegendChip color={COLORS.mint} label="恢复" />
          <LegendChip color={COLORS.sky} label="睡眠表现" />
          <LegendChip color={COLORS.lilac} label="负荷" />
        </View>
      </Brutal>
    </ScrollView>
  )
}
