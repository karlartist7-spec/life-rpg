import { useEffect } from 'react'
import { View, Text } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { Brutal } from '@/components/Brutal'
import { ProgressBar } from '@/components/ProgressBar'
import { COLORS, RECOVERY } from '@/theme/tokens'
import { recoveryBucket, expPct } from '@/src/lib/dashboard-derive'
import type { DashCharacter, DashAttributes } from '@/src/lib/types'

export function RecoveryHero({
  character, attributes, recoveryScore,
}: { character: DashCharacter | null; attributes: DashAttributes | null; recoveryScore: number | null }) {
  const bucket = recoveryBucket(recoveryScore)
  const zone = RECOVERY[bucket.key]
  const fg = bucket.key === 'low' ? COLORS.paper : COLORS.ink
  const exp = character ? expPct(character.exp, character.next_level_exp) : 0
  const hpPct = attributes ? (attributes.hp_current / Math.max(attributes.hp_max, 1)) * 100 : 100

  // idle breathing (1 ↔ 1.02, ~4s)
  const breathe = useSharedValue(1)
  useEffect(() => {
    breathe.value = withRepeat(withTiming(1.02, { duration: 2000, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [])
  const breatheStyle = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }))

  return (
    <Brutal bg={zone.face} radius={24} offset="lg" faceStyle={{ padding: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 28, color: fg }}>{character?.name ?? 'Hermes'}</Text>
          {character?.title ? <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 13, color: fg, opacity: 0.85, marginTop: 2 }}>{character.title}</Text> : null}
        </View>
        <Animated.View style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper }, breatheStyle]}>
          <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 16, color: COLORS.ink }}>Lv.{character?.level ?? 1}</Text>
        </Animated.View>
      </View>

      <View style={{ marginTop: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>HP</Text>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>{attributes?.hp_current ?? 100}/{attributes?.hp_max ?? 100}</Text>
        </View>
        <ProgressBar pct={hpPct} fill={COLORS.coral} height={10} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>EXP</Text>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>{character?.exp ?? 0}/{character?.next_level_exp ?? 1000}</Text>
        </View>
        <ProgressBar pct={exp} fill={COLORS.sunshine} height={10} />
      </View>

      <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg, opacity: 0.8, marginTop: 12 }}>恢复 · {zone.label}</Text>
    </Brutal>
  )
}
