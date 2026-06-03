export function petNextLevelExp(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5))
}

export function petExpPct(level: number, exp: number): number {
  const need = petNextLevelExp(level)
  if (need <= 0) return 100
  return Math.max(0, Math.min(100, (exp / need) * 100))
}

export function evolveErrorMessage(code: string, need?: { level?: number; item?: string }): string {
  switch (code) {
    case 'PET_SLOT_FULL': return '出战位已满（3/3），先收回一只'
    case 'MAX_STAGE': return '已是最终形态'
    case 'ALREADY_PENDING': return '进化中，请稍候'
    case 'PET_NOT_FOUND': return '找不到这只宠物'
    case 'NO_REQUIREMENT': return '暂无进化路线'
    case 'LEVEL_TOO_LOW': return `进化需要 Lv.${need?.level ?? '?'}${need?.item ? ` + ${need.item}` : ''}`
    case 'MISSING_ITEM': return `缺少进化道具${need?.item ? `：${need.item}` : ''}`
    default: return '操作失败，请重试'
  }
}
