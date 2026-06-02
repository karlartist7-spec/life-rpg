import { Pressable, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { COLORS } from '@/theme/tokens'
import { usePressPhysics } from './usePressPhysics'

const BG: Record<string, string> = {
  pink: COLORS.pink, mint: COLORS.mint, sunshine: COLORS.sunshine, sky: COLORS.sky,
  peri: COLORS.periwinkle, coral: COLORS.coral, lilac: COLORS.lilac,
}
const PAPER_TEXT = new Set(['peri', 'coral', 'lilac'])

export function Button({
  label, onPress, variant = 'pink', size = 'default', disabled,
}: { label: string; onPress?: () => void; variant?: keyof typeof BG; size?: 'default' | 'sm'; disabled?: boolean }) {
  const { off, faceStyle, plateStyle, onPressIn, onPressOut } = usePressPhysics('md')
  const pad = size === 'sm' ? { paddingVertical: 7, paddingHorizontal: 14 } : { paddingVertical: 12, paddingHorizontal: 24 }
  return (
    <Pressable disabled={disabled} onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress} style={{ opacity: disabled ? 0.5 : 1 }}>
      <View style={{ position: 'relative' }}>
        <Animated.View style={[{ position: 'absolute', left: off, top: off, right: -off, bottom: -off, backgroundColor: COLORS.ink, borderRadius: 9999 }, plateStyle]} />
        <Animated.View style={[{ backgroundColor: BG[variant], borderWidth: 2, borderColor: COLORS.ink, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', ...pad }, faceStyle]}>
          <Text style={{ fontFamily: 'Fredoka_600SemiBold', fontSize: size === 'sm' ? 13 : 16, color: PAPER_TEXT.has(variant) ? COLORS.paper : COLORS.ink }}>{label}</Text>
        </Animated.View>
      </View>
    </Pressable>
  )
}
