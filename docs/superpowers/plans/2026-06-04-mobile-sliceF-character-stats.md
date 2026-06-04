# Mobile Slice F — Character / Stats Tab (brutalist charts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Build the Character tab (tab 5) to spec: a stats/data center with three attribute tiles (体魄/耐力/专注), an EXP overview, a horizontally-scrolling **30-day EXP bar chart** (2px-black-outline flat-top candy bars), a **7-day 3-line chart** (mint/sky/lilac, ink dots) with a source legend, and an EmptyState when there's no WHOOP data — all from the live `/api/dashboard` payload.

**Architecture:** Reuses `useQuery(['dashboard'])` (same key as Home — React Query dedupes/caches, no extra request). Charts are **hand-rolled with `react-native-svg`** (already installed), NOT victory-native: the brutalist look (hard 2px ink strokes, flat-top bars, no anti-aliased rounding) is exactly what raw SVG primitives give, and it avoids adding `@shopify/react-native-skia` (victory-native XL's heavy native dependency). Pure chart math (nice-max scaling, bar heights, normalized line points) lives in a renderless, unit-tested `stats-derive.ts`. **Deviation flagged:** spec's "victory-native" technical default is substituted by react-native-svg — same visual result, no new dep. Long-press inspector is deferred (values shown as inline axis labels for the MVP).

**Tech Stack:** Expo SDK 52, `react-native-svg` (present), TanStack Query 5. Data: `dashboard.attributes` ({physique, endurance, focus, hp_*, last7[]}), `dashboard.exp_trend` ([{date, exp, level}]), `dashboard.character`.

**Verification:** pure chart math TDD'd via jest; UI gated on `pnpm typecheck` + on-device acceptance.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `mobile/src/lib/stats-derive.ts` (+`.test.ts`) | niceMax / bar heights / line points | Create |
| `mobile/components/charts/BarChart.tsx` | SVG 30-day EXP bars (h-scroll) | Create |
| `mobile/components/charts/LineChart.tsx` | SVG 7-day 3-line + dots | Create |
| `mobile/app/(tabs)/character.tsx` | Character/Stats screen | Rewrite |

---

## Task 1: stats-derive (TDD)

**Files:** Create `mobile/src/lib/stats-derive.ts` + `.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { niceMax, barHeights, linePoints } from './stats-derive'

describe('niceMax', () => {
  it('rounds up to a nice ceiling, min 1', () => {
    expect(niceMax([0, 0])).toBe(1)
    expect(niceMax([3, 7, 5])).toBe(10)
    expect(niceMax([42, 80])).toBe(100)
    expect(niceMax([120, 250])).toBe(300)
  })
  it('ignores non-finite', () => {
    expect(niceMax([NaN, 5, Infinity])).toBe(10)
  })
})

describe('barHeights', () => {
  it('scales values to pixel heights', () => {
    expect(barHeights([0, 50, 100], 100, 200)).toEqual([0, 100, 200])
  })
  it('zero max → all zero', () => {
    expect(barHeights([1, 2], 0, 200)).toEqual([0, 0])
  })
})

describe('linePoints', () => {
  it('spreads x evenly and inverts y (0 at bottom)', () => {
    const pts = linePoints([0, 100], 100, 100, 50)
    expect(pts[0]).toEqual({ x: 0, y: 50, v: 0 })
    expect(pts[1]).toEqual({ x: 100, y: 0, v: 100 })
  })
  it('marks nulls with v=null and y at baseline', () => {
    const pts = linePoints([null, 50], 100, 100, 50)
    expect(pts[0].v).toBeNull()
    expect(pts[1].v).toBe(50)
  })
})
```

- [ ] **Step 2:** `cd mobile && pnpm test` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
export function niceMax(values: number[]): number {
  const finite = values.filter((v) => Number.isFinite(v))
  const m = Math.max(1, ...finite)
  const pow = Math.pow(10, Math.floor(Math.log10(m)))
  return Math.ceil(m / pow) * pow
}

export function barHeights(values: number[], max: number, h: number): number[] {
  return values.map((v) => (max > 0 ? Math.max(0, (v / max) * h) : 0))
}

export type LinePoint = { x: number; y: number; v: number | null }
export function linePoints(values: (number | null)[], max: number, w: number, h: number): LinePoint[] {
  const n = values.length
  return values.map((v, i) => {
    const x = n > 1 ? (i / (n - 1)) * w : 0
    const y = v == null ? h : max > 0 ? h - (v / max) * h : h
    return { x, y, v }
  })
}
```

- [ ] **Step 4:** `cd mobile && pnpm test` (green) + `pnpm typecheck` → commit `git add mobile/src/lib/stats-derive.ts mobile/src/lib/stats-derive.test.ts && git commit -m "feat(mobile): stats-derive chart-scaling helpers + tests"`

---

## Task 2: BarChart (SVG)

**Files:** Create `mobile/components/charts/BarChart.tsx`

- [ ] **Step 1: Create it** (flat-top, 2px ink stroke, candy fill; caller wraps in a horizontal ScrollView for 30-day)

```tsx
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
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {data.map((d, i) => (
          <Text key={i} style={{ width: barWidth + gap, marginLeft: i === 0 ? gap : 0, textAlign: 'center', fontFamily: 'Nunito_700Bold', fontSize: 8, color: COLORS.mute }} numberOfLines={1}>{d.label}</Text>
        ))}
      </View>
    </View>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/charts/BarChart.tsx && git commit -m "feat(mobile): brutalist SVG BarChart"`

---

## Task 3: LineChart (SVG)

**Files:** Create `mobile/components/charts/LineChart.tsx`

- [ ] **Step 1: Create it** (multiple 3px series with ink dots; nulls break the line)

```tsx
import Svg, { Polyline, Circle } from 'react-native-svg'
import { View } from 'react-native'
import { linePoints, type LinePoint } from '@/src/lib/stats-derive'
import { COLORS } from '@/theme/tokens'

export type Series = { values: (number | null)[]; color: string }

export function LineChart({ series, max = 100, width = 320, height = 140 }: { series: Series[]; max?: number; width?: number; height?: number }) {
  const pad = 6
  const w = width - pad * 2
  const h = height - pad * 2
  return (
    <View>
      <Svg width={width} height={height}>
        {series.map((s, si) => {
          const pts = linePoints(s.values, max, w, h)
          // split into segments at nulls
          const segs: LinePoint[][] = []
          let cur: LinePoint[] = []
          for (const p of pts) {
            if (p.v == null) { if (cur.length) { segs.push(cur); cur = [] } }
            else cur.push(p)
          }
          if (cur.length) segs.push(cur)
          return (
            <View key={si} />,
            segs.map((seg, gi) => (
              <Polyline key={`${si}-${gi}`} points={seg.map((p) => `${p.x + pad},${p.y + pad}`).join(' ')} fill="none" stroke={s.color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            ))
          )
        })}
        {series.map((s, si) =>
          linePoints(s.values, max, w, h).filter((p) => p.v != null).map((p, pi) => (
            <Circle key={`${si}-d-${pi}`} cx={p.x + pad} cy={p.y + pad} r={3.5} fill={s.color} stroke={COLORS.ink} strokeWidth={2} />
          ))
        )}
      </Svg>
    </View>
  )
}
```

> Implementer note: the `(<View key={si} />, segs.map(...))` comma-operator returns only `segs.map(...)` — but that's obscure. **Replace it** with a clean fragment: map each series to its segment `<Polyline>`s directly (return `segs.map(...)` from the `series.map` callback; drop the stray `<View>`). Keep behavior: one polyline per non-null segment, plus the dots pass below. Ensure the function returns valid JSX (typecheck must pass).

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/components/charts/LineChart.tsx && git commit -m "feat(mobile): brutalist SVG LineChart (multi-series + ink dots)"`

---

## Task 4: Character / Stats screen

**Files:** Rewrite `mobile/app/(tabs)/character.tsx`

- [ ] **Step 1: Rewrite**

```tsx
import { ScrollView, View, Text } from 'react-native'
import { ScrollView as HScroll } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { User } from 'lucide-react-native'
import { apiFetch } from '@/src/lib/api-client'
import type { Dashboard } from '@/src/lib/types'
import { Brutal } from '@/components/Brutal'
import { StatTile } from '@/components/StatTile'
import { ProgressBar } from '@/components/ProgressBar'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { expPct } from '@/src/lib/dashboard-derive'
import { COLORS } from '@/theme/tokens'

function md(date: string): string {
  const parts = date.split('-')
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : date
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper }}>
      <View style={{ width: 10, height: 10, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: color }} />
      <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: COLORS.ink }}>{label}</Text>
    </View>
  )
}

export default function CharacterScreen() {
  const insets = useSafeAreaInsets()
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => apiFetch<Dashboard>('/api/dashboard') })

  if (isLoading) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><LoadingState label="加载数据…" /></View>
  const c = data?.character
  const attrs = data?.attributes
  const trend = data?.exp_trend ?? []

  if (!attrs) {
    return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><EmptyState Icon={User} title="暂无数据" subtitle="连接 WHOOP 后这里会显示你的属性与趋势" /></View>
  }

  const bars = trend.map((t) => ({ label: md(t.date), value: t.exp ?? 0 }))
  const last7 = attrs.last7 ?? []
  const recovery = last7.map((d) => d.recovery)
  const sleepPerf = last7.map((d) => d.sleep_perf)
  const strain = last7.map((d) => (d.strain != null ? Math.round((d.strain / 21) * 100) : null)) // strain 0-21 → 0-100

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.cream }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, gap: 16 }}>
      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 24, color: COLORS.ink }}>{c?.name ?? 'Hermes'} · 数据中心</Text>

      {/* 三属性 */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><StatTile color="mint" label={attrs.physique.label} value={attrs.physique.value} sub="体魄" /></View>
        <View style={{ flex: 1 }}><StatTile color="sky" label={attrs.endurance.label} value={attrs.endurance.value} sub="耐力" /></View>
        <View style={{ flex: 1 }}><StatTile color="lilac" label={attrs.focus.label} value={attrs.focus.value} sub="专注" /></View>
      </View>

      {/* EXP 总览 */}
      <Brutal bg={COLORS.sunshine} radius={20} offset="md" faceStyle={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 16, color: COLORS.ink }}>等级 {c?.level ?? 1}</Text>
          <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 13, color: COLORS.ink }}>总 EXP {c?.total_exp ?? 0}</Text>
        </View>
        <View style={{ marginTop: 8 }}><ProgressBar pct={c ? expPct(c.exp, c.next_level_exp) : 0} fill={COLORS.mint} height={10} /></View>
      </Brutal>

      {/* 30 天 EXP 柱 */}
      <Brutal bg={COLORS.paper} radius={20} offset="md" faceStyle={{ padding: 16 }}>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 14, color: COLORS.ink, marginBottom: 10 }}>近 30 天 EXP</Text>
        {bars.length ? (
          <HScroll horizontal showsHorizontalScrollIndicator={false}>
            <BarChart data={bars} fill={COLORS.mint} />
          </HScroll>
        ) : <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.mute }}>暂无记录</Text>}
      </Brutal>

      {/* 7 天三线 */}
      <Brutal bg={COLORS.paper} radius={20} offset="md" faceStyle={{ padding: 16 }}>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 14, color: COLORS.ink, marginBottom: 10 }}>近 7 天趋势</Text>
        <LineChart
          width={300}
          height={140}
          max={100}
          series={[
            { values: recovery, color: COLORS.mint },
            { values: sleepPerf, color: COLORS.sky },
            { values: strain, color: COLORS.lilac },
          ]}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <LegendChip color={COLORS.mint} label="恢复" />
          <LegendChip color={COLORS.sky} label="睡眠表现" />
          <LegendChip color={COLORS.lilac} label="负荷" />
        </View>
      </Brutal>
    </ScrollView>
  )
}
```

- [ ] **Step 2:** `cd mobile && pnpm typecheck` → commit `git add mobile/app/\(tabs\)/character.tsx && git commit -m "feat(mobile): Character/Stats tab — brutalist SVG charts + attributes"`

---

## Task 5: Final gate + acceptance

- [ ] **Step 1:** `cd mobile && pnpm test && pnpm typecheck` → tests green (incl. stats-derive), typecheck clean.

- [ ] **Step 2: On-device acceptance** (`npx expo start`):
1. Character tab shows name · 数据中心, three attribute tiles (体魄/耐力/专注, count-up).
2. EXP overview tile: 等级 + 总 EXP + progress bar.
3. **30-day EXP bars**: horizontally scrollable, flat-top candy bars with 2px black outline + date labels.
4. **7-day 3-line chart**: mint/sky/lilac lines with ink-outlined dots; legend chips below.
5. No-WHOOP-data account → **EmptyState** ("连接 WHOOP 后…").
6. Cards show the black offset plate (Android: not clipped).

- [ ] **Step 3:** Final cleanup commit if needed.

---

## Self-Review

**Spec coverage** (spec §屏幕 "Stats / 数据中心"): 3 属性 tile ✔ (Task 4); EXP 总览 tile ✔; 横滚 30 天 EXP 柱（2px 黑描边平顶糖果柱）✔ (Tasks 2,4); 7 天三线（mint/sky/lilac 3px + ink 点）+ 来源 legend chips ✔ (Tasks 3,4); 无 WHOOP 数据 EmptyState ✔ (Task 4). **Deviation flagged:** victory-native → hand-rolled `react-native-svg` (same brutalist visual, avoids the Skia native dep + install risk). **Deferred/flagged:** long-press inspector (values via labels for MVP); the 7-day "strain" line is rescaled 0–21→0–100 to share the recovery/sleep_perf 0–100 axis (noted so a future per-series axis can refine it).

**Placeholder scan:** none. (Task 3 has an explicit implementer note to clean up the comma-operator into a plain `segs.map` return — the reviewer/implementer must ensure valid JSX; gate is typecheck.)

**Type consistency:** `niceMax`/`barHeights`/`linePoints` + `LinePoint` (Task 1) match `BarChart`/`LineChart`. Charts consume `react-native-svg` `Svg/Rect/Polyline/Circle`. Screen reads `dashboard.attributes.{physique,endurance,focus,last7}`, `exp_trend`, `character.{level,exp,total_exp,next_level_exp}` — all present on the `Dashboard` type from Slice A. `expPct` reused from `dashboard-derive`.
