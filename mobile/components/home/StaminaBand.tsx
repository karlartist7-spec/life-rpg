import { View, Text } from 'react-native'
import { Brutal } from '@/components/Brutal'
import { ProgressBar } from '@/components/ProgressBar'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { COLORS, SCENE_TINT } from '@/theme/tokens'
import type { DashStamina } from '@/src/lib/types'

export function StaminaBand({ stamina }: { stamina: DashStamina }) {
  const tint = SCENE_TINT[stamina.scene_tier] ?? COLORS.mint
  return (
    <Brutal bg={COLORS.paper} radius={20} offset="md" faceStyle={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: 'Fredoka_600SemiBold', fontSize: 14, color: COLORS.ink }}>今日体力</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: tint }}>
            <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: COLORS.ink }}>{stamina.tier_label}</Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 6 }}>
        <AnimatedNumber value={stamina.stamina} style={{ fontFamily: 'Fredoka_700Bold', fontSize: 34, color: COLORS.ink }} />
        <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.mute, marginBottom: 6 }}>体力</Text>
      </View>
      <View style={{ marginTop: 6 }}>
        <ProgressBar pct={stamina.stamina_pct} fill={tint} height={12} />
      </View>
    </Brutal>
  )
}
