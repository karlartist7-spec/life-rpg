import { Fragment } from 'react'
import { View } from 'react-native'
import Svg, { Polyline, Circle } from 'react-native-svg'
import { linePoints, type LinePoint } from '@/src/lib/stats-derive'
import { COLORS } from '@/theme/tokens'

export type Series = { values: (number | null)[]; color: string }

/** Split points into contiguous non-null segments so the line breaks across gaps. */
function segments(pts: LinePoint[]): LinePoint[][] {
  const segs: LinePoint[][] = []
  let cur: LinePoint[] = []
  for (const p of pts) {
    if (p.v == null) {
      if (cur.length) { segs.push(cur); cur = [] }
    } else {
      cur.push(p)
    }
  }
  if (cur.length) segs.push(cur)
  return segs
}

export function LineChart({ series, max = 100, width = 320, height = 140 }: { series: Series[]; max?: number; width?: number; height?: number }) {
  const pad = 6
  const w = width - pad * 2
  const h = height - pad * 2
  return (
    <View>
      <Svg width={width} height={height}>
        {series.map((s, si) => {
          const pts = linePoints(s.values, max, w, h)
          return (
            <Fragment key={si}>
              {segments(pts).map((seg, gi) => (
                <Polyline
                  key={gi}
                  points={seg.map((p) => `${p.x + pad},${p.y + pad}`).join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {pts.filter((p) => p.v != null).map((p, pi) => (
                <Circle key={`d${pi}`} cx={p.x + pad} cy={p.y + pad} r={3.5} fill={s.color} stroke={COLORS.ink} strokeWidth={2} />
              ))}
            </Fragment>
          )
        })}
      </Svg>
    </View>
  )
}
