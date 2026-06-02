import { recoveryBucket, delta, expPct, sleepHours, questSummary } from './dashboard-derive'

describe('recoveryBucket', () => {
  it('buckets high/med/low by WHOOP thresholds', () => {
    expect(recoveryBucket(80).key).toBe('high')
    expect(recoveryBucket(67).key).toBe('high')
    expect(recoveryBucket(50).key).toBe('med')
    expect(recoveryBucket(34).key).toBe('med')
    expect(recoveryBucket(10).key).toBe('low')
  })
  it('returns unknown for null', () => {
    expect(recoveryBucket(null).key).toBe('unknown')
  })
})

describe('delta', () => {
  it('signs the direction', () => {
    expect(delta(70, 60)).toEqual({ dir: 'up', diff: 10 })
    expect(delta(60, 70)).toEqual({ dir: 'down', diff: -10 })
    expect(delta(60, 60)).toEqual({ dir: 'flat', diff: 0 })
  })
  it('is none when either side is null', () => {
    expect(delta(70, null).dir).toBe('none')
    expect(delta(null, 70).dir).toBe('none')
  })
})

describe('expPct', () => {
  it('clamps to 0..100', () => {
    expect(expPct(500, 1000)).toBe(50)
    expect(expPct(2000, 1000)).toBe(100)
    expect(expPct(50, 0)).toBe(100) // guard divide-by-zero -> full
    expect(expPct(0, 1000)).toBe(0)
  })
})

describe('sleepHours', () => {
  it('formats minutes to one decimal', () => {
    expect(sleepHours(450)).toBe('7.5')
    expect(sleepHours(null)).toBe('–')
  })
})

describe('questSummary', () => {
  const q = (status: string, reward_exp: number) =>
    ({ progress: { status }, reward_exp } as any)
  it('counts completed and sums earned vs total exp', () => {
    const s = questSummary([q('completed', 100), q('pending', 50), q('completed', 30)])
    expect(s).toEqual({ done: 2, total: 3, earnedExp: 130, totalExp: 180 })
  })
  it('handles empty', () => {
    expect(questSummary([])).toEqual({ done: 0, total: 0, earnedExp: 0, totalExp: 0 })
  })
})
