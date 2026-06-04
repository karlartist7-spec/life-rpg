import type { Chapter } from './types'

export function normalizeChapters(adv: { chapters: Chapter[] | null; story_md: string | null }): Chapter[] {
  if (Array.isArray(adv.chapters) && adv.chapters.length > 0) return adv.chapters
  return [{ idx: 1, title: '冒险记录', body: adv.story_md ?? '', unlock_offset_min: 0 }]
}

export function chapterUnlock(startedAtMs: number, unlockOffsetMin: number, now: number): { unlocked: boolean; remainMs: number } {
  const unlockAt = startedAtMs + unlockOffsetMin * 60_000
  const remainMs = unlockAt - now
  return { unlocked: remainMs <= 0, remainMs: Math.max(0, remainMs) }
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export type AdvState = { label: string; generating: boolean; failed: boolean }
export function adventureState(status: string): AdvState {
  switch (status) {
    case 'pending_story': return { label: '生成故事中', generating: true, failed: false }
    case 'pending_image': return { label: '绘制场景中', generating: true, failed: false }
    case 'pending': return { label: '准备中', generating: true, failed: false }
    case 'active': return { label: '进行中', generating: false, failed: false }
    case 'completed': return { label: '已完成', generating: false, failed: false }
    case 'failed': return { label: '生成失败', generating: false, failed: true }
    default: return { label: status, generating: false, failed: false }
  }
}

export function storyPreview(story: string | null, max = 120): string {
  if (!story) return ''
  const plain = story.replace(/[#*_`>~\-]/g, '').replace(/\s+/g, ' ').trim()
  return plain.length > max ? plain.slice(0, max) + '…' : plain
}
