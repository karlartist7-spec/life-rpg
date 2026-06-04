import { normalizeChapters, chapterUnlock, fmtCountdown, adventureState, storyPreview } from './adventure-derive'

describe('normalizeChapters', () => {
  it('returns chapters when present', () => {
    const ch = [{ idx: 1, title: 'A', body: 'x', unlock_offset_min: 0 }]
    expect(normalizeChapters({ chapters: ch, story_md: 'ignored' })).toBe(ch)
  })
  it('falls back to story_md as one chapter', () => {
    const out = normalizeChapters({ chapters: null, story_md: 'hello' })
    expect(out).toHaveLength(1)
    expect(out[0].body).toBe('hello')
    expect(out[0].unlock_offset_min).toBe(0)
  })
})

describe('chapterUnlock', () => {
  const start = 1_000_000
  it('locked before offset, with positive remain', () => {
    const r = chapterUnlock(start, 10, start + 5 * 60_000)
    expect(r.unlocked).toBe(false)
    expect(r.remainMs).toBe(5 * 60_000)
  })
  it('unlocked at/after offset, remain clamped to 0', () => {
    expect(chapterUnlock(start, 10, start + 10 * 60_000).unlocked).toBe(true)
    expect(chapterUnlock(start, 10, start + 20 * 60_000).remainMs).toBe(0)
  })
})

describe('fmtCountdown', () => {
  it('MM:SS zero-padded', () => {
    expect(fmtCountdown(0)).toBe('00:00')
    expect(fmtCountdown(65_000)).toBe('01:05')
    expect(fmtCountdown(5 * 60_000)).toBe('05:00')
  })
})

describe('adventureState', () => {
  it('flags generating and failed', () => {
    expect(adventureState('pending_story').generating).toBe(true)
    expect(adventureState('pending_image').generating).toBe(true)
    expect(adventureState('failed').failed).toBe(true)
    expect(adventureState('completed').generating).toBe(false)
    expect(adventureState('active').label).toBeTruthy()
  })
})

describe('storyPreview', () => {
  it('strips markdown and truncates', () => {
    expect(storyPreview('## Title\n\nHello **world** foo', 20)).toContain('Hello')
    expect(storyPreview(null, 10)).toBe('')
  })
})
