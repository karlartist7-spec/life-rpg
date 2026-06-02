import { View, Text } from 'react-native'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react-native'
import { COLORS } from '@/theme/tokens'
import type { DeltaDir } from '@/src/lib/dashboard-derive'

const META: Record<DeltaDir, { color: string; Icon: typeof ArrowUp | null }> = {
  up:   { color: '#2bb673', Icon: ArrowUp },   // green improvement
  down: { color: COLORS.coral, Icon: ArrowDown },
  flat: { color: COLORS.mute, Icon: Minus },
  none: { color: COLORS.mute, Icon: null },
}

export function Delta({ dir, diff, color }: { dir: DeltaDir; diff: number; color?: string }) {
  const m = META[dir]
  if (dir === 'none' || !m.Icon) return null
  const fg = color ?? m.color
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <m.Icon size={12} strokeWidth={3} color={fg} />
      <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: fg }}>{Math.abs(Math.round(diff))}</Text>
    </View>
  )
}
