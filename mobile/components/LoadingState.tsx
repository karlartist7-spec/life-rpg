import { View, Text } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { useEffect } from 'react'
import { Compass } from 'lucide-react-native'
import { COLORS } from '@/theme/tokens'
export function LoadingState({ label = '加载中…' }: { label?: string }) {
  const r = useSharedValue(0)
  useEffect(() => { r.value = withRepeat(withTiming(360, { duration: 1200, easing: Easing.linear }), -1) }, [])
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }))
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
      <Animated.View style={s}><Compass size={44} color={COLORS.periwinkle} strokeWidth={2.5} /></Animated.View>
      <Text style={{ fontFamily: 'Fredoka_600SemiBold', color: COLORS.mute, marginTop: 14 }}>{label}</Text>
    </View>
  )
}
