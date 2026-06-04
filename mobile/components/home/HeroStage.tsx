import { useEffect } from 'react'
import { View, Text, Image, Pressable } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { router } from 'expo-router'
import { Compass } from 'lucide-react-native'
import { Brutal } from '@/components/Brutal'
import { ProgressBar } from '@/components/ProgressBar'
import { COLORS, RECOVERY } from '@/theme/tokens'
import { recoveryBucket, expPct } from '@/src/lib/dashboard-derive'
import { HERO_ART } from '@/theme/character-art'
import type { DashCharacter, DashAttributes, DashStamina } from '@/src/lib/types'

export function HeroStage({
  character, attributes, recoveryScore, stamina, minHeight, topPad,
}: {
  character: DashCharacter | null
  attributes: DashAttributes | null
  recoveryScore: number | null
  stamina: DashStamina | null
  minHeight: number
  topPad: number
}) {
  const bucket = recoveryBucket(recoveryScore)
  const zone = RECOVERY[bucket.key]
  const fg = bucket.key === 'low' ? COLORS.paper : COLORS.ink
  const exp = character ? expPct(character.exp, character.next_level_exp) : 0
  const hpPct = attributes ? (attributes.hp_current / Math.max(attributes.hp_max, 1)) * 100 : 100

  const breathe = useSharedValue(1)
  useEffect(() => { breathe.value = withRepeat(withTiming(1.025, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1, true) }, [])
  const breatheStyle = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }))

  const glow = useSharedValue(1)
  useEffect(() => { glow.value = withRepeat(withTiming(1.04, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true) }, [])
  const glowStyle = useAnimatedStyle(() => ({ transform: [{ scale: glow.value }] }))

  return (
    <View style={{ minHeight, paddingTop: topPad + 8, paddingBottom: 20, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: zone.face, borderBottomWidth: 2, borderColor: COLORS.ink }}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 30, color: fg }}>{character?.name ?? 'Hermes'}</Text>
        {character?.title ? (
          <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper }}>
            <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: COLORS.ink }}>{character.title}</Text>
          </View>
        ) : null}
      </View>

      {/* hero portrait window (art has a cream bg baked in → frame it) */}
      <Animated.View style={breatheStyle}>
        <Brutal bg={COLORS.paper} radius={28} offset="lg" faceStyle={{ padding: 0, overflow: 'hidden' }}>
          <Image source={HERO_ART[bucket.key]} style={{ width: 224, height: 224 }} resizeMode="cover" />
        </Brutal>
      </Animated.View>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper }}>
          <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>恢复 · {zone.label}</Text>
        </View>
        {stamina ? (
          <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper }}>
            <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>{stamina.tier_label} · 体力 {stamina.stamina}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ width: '100%', maxWidth: 300, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>HP</Text>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>{attributes?.hp_current ?? 100}/{attributes?.hp_max ?? 100}</Text>
        </View>
        <ProgressBar pct={hpPct} fill={COLORS.coral} height={12} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>EXP</Text>
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>{character?.exp ?? 0}/{character?.next_level_exp ?? 1000}</Text>
        </View>
        <ProgressBar pct={exp} fill={COLORS.sunshine} height={12} />
      </View>

      <Animated.View style={glowStyle}>
        <Pressable onPress={() => router.navigate('/adventures')}>
          <Brutal bg={COLORS.periwinkle} radius={9999} offset="md" faceStyle={{ paddingVertical: 14, paddingHorizontal: 36, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Compass size={20} strokeWidth={2.5} color={COLORS.paper} />
            <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 18, color: COLORS.paper }}>出发冒险</Text>
          </Brutal>
        </Pressable>
      </Animated.View>

      <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg, opacity: 0.75 }}>↓ 上滑查看任务与数据</Text>
    </View>
  )
}
