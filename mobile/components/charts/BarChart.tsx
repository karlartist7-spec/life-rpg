import { View, Text } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { niceMax, barHeights } from '@/src/lib/stats-derive'
import { COLORS } from '@/theme/tokens'

export function BarChart({
  data, fill = COLORS.mint, barWidth = 14, gap = 8, height = 140,
}: { data: { label: string; value: number }[]; fill?: string; barWidth?: number; gap?: number; height?: number }) {
  const values = data.map((d) => d.value)
  const max = niceMax(values)
  const heights = barHeights(values, max, height)
  const width = data.length * (barWidth + gap) + gap
  return (
    <View>
      <Svg width={width} height={height + 2}>
        {data.map((_, i) => {
          const h = heights[i]
          const x = gap + i * (barWidth + gap)
          const y = height - h
          return <Rect key={i} x={x} y={y} width={barWidth} height={Math.max(h, 1)} fill={fill} stroke={COLORS.ink} strokeWidth={2} />
        })}
      </Svg>
      <View style={{ flexDirection: 'row' }}>
        {data.map((d, i) => (
          <Text key={i} style={{ width: barWidth + gap, marginLeft: i === 0 ? gap : 0, textAlign: 'center', fontFamily: 'Nunito_700Bold', fontSize: 8, color: COLORS.mute }} numberOfLines={1}>{d.label}</Text>
        ))}
      </View>
    </View>
  )
}
