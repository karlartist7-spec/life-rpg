/**
 * 稀有度徽章 + 工具函数
 * 视觉系统按 4 档：common / rare / epic / legendary
 * 视觉差异由 globals.css 的 .rarity-badge--<tier> + .rarity-card--<tier> 决定
 */
import { Sparkles, Star, Crown, Circle } from 'lucide-react'

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

const LABELS: Record<Rarity, string> = {
  common: '常见',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
}

const ICONS = {
  common: Circle,
  rare: Star,
  epic: Sparkles,
  legendary: Crown,
}

export function RarityBadge({ rarity, size = 'sm' }: { rarity: Rarity; size?: 'sm' | 'md' }) {
  const Icon = ICONS[rarity]
  const px = size === 'md' ? 'px-3 py-1.5 text-sm' : ''
  return (
    <span className={`rarity-badge rarity-badge--${rarity} ${px}`}>
      <Icon className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} strokeWidth={2.5} />
      {LABELS[rarity]}
    </span>
  )
}

/** 给文字版稀有度颜色（适用于详情页大标题等） */
export function rarityTextColor(rarity: Rarity): string {
  return {
    common: 'text-mute',
    rare: 'text-doodle-sky',
    epic: 'text-doodle-lilac',
    legendary: 'text-[#ffb800]',
  }[rarity]
}

export function rarityLabel(rarity: Rarity): string {
  return LABELS[rarity]
}
