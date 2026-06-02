import { View, Text } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, Extrapolation, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TriangleAlert } from 'lucide-react-native'
import { COLORS } from '@/theme/tokens'
import { expPct } from '@/src/lib/dashboard-derive'
import type { DashCharacter, DashConnections } from '@/src/lib/types'

export function CollapsibleHeader({
  scrollY, character, connections,
}: { scrollY: SharedValue<number>; character: DashCharacter | null; connections: DashConnections }) {
  const insets = useSafeAreaInsets()
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [80, 140], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [80, 140], [-12, 0], Extrapolation.CLAMP) }],
  }))
  const exp = character ? expPct(character.exp, character.next_level_exp) : 0
  const whoopExpired = connections.whoop.expired === true
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 16, backgroundColor: COLORS.cream, borderBottomWidth: 2, borderColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', gap: 10 },
        style,
      ]}
    >
      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 16, color: COLORS.ink }}>{character?.name ?? 'Hermes'}</Text>
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.periwinkle }}>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 11, color: COLORS.paper }}>Lv.{character?.level ?? 1}</Text>
      </View>
      <View style={{ flex: 1, height: 8, borderWidth: 2, borderColor: COLORS.ink, borderRadius: 9999, backgroundColor: COLORS.paper, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${exp}%`, backgroundColor: COLORS.sunshine }} />
      </View>
      {whoopExpired ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.coral }}>
          <TriangleAlert size={12} strokeWidth={3} color={COLORS.paper} />
          <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 10, color: COLORS.paper }}>WHOOP</Text>
        </View>
      ) : null}
    </Animated.View>
  )
}
