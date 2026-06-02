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
