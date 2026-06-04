import { niceMax, barHeights, linePoints } from './stats-derive'

describe('niceMax', () => {
  it('rounds the leading significant figure up, min 1', () => {
    expect(niceMax([0, 0])).toBe(1)
    expect(niceMax([3, 7, 5])).toBe(7)
    expect(niceMax([42, 80])).toBe(80)
    expect(niceMax([120, 250])).toBe(300)
  })
  it('ignores non-finite', () => {
    expect(niceMax([NaN, 5, Infinity])).toBe(5)
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
