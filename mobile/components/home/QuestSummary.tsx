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
