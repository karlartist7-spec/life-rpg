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
