import { View } from 'react-native'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { COLORS } from '@/theme/tokens'
export function ProgressBar({ pct, fill = COLORS.mint, height = 14 }: { pct: number; fill?: string; height?: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const style = useAnimatedStyle(() => ({ width: withTiming(`${clamped}%`, { duration: 700 }) }))
  return (
    <View style={{ height, borderWidth: 2, borderColor: COLORS.ink, borderRadius: 9999, backgroundColor: COLORS.paper, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', backgroundColor: fill, borderRadius: 9999 }, style]} />
    </View>
  )
}
