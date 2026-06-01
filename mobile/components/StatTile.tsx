import { View, Text } from 'react-native'
import { Brutal } from './Brutal'
import { AnimatedNumber } from './AnimatedNumber'
import { COLORS } from '@/theme/tokens'
const BG: Record<string, { bg: string; paper?: boolean }> = {
  mint: { bg: COLORS.mint }, sky: { bg: COLORS.sky }, coral: { bg: COLORS.coral, paper: true },
  sunshine: { bg: COLORS.sunshine }, periwinkle: { bg: COLORS.periwinkle, paper: true }, paper: { bg: COLORS.paper },
}
export function StatTile({ color = 'paper', label, value, sub }: { color?: keyof typeof BG; label: string; value: number; sub?: string }) {
  const c = BG[color]; const fg = c.paper ? COLORS.paper : COLORS.ink
  return (
    <Brutal bg={c.bg} radius={16} offset="md" faceStyle={{ padding: 16 }}>
      <AnimatedNumber value={value} style={{ fontSize: 28, color: fg }} />
      <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: fg, marginTop: 2 }}>{label}</Text>
      {sub ? <Text style={{ fontSize: 11, color: fg, opacity: 0.8 }}>{sub}</Text> : null}
    </Brutal>
  )
}
