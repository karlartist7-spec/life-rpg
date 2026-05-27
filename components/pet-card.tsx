'use client'

/**
 * 宠物卡片：Doodles 风 + 4 档稀有度强差异化视觉
 * 视觉切换由 .rarity-card--<tier> CSS 类驱动（见 globals.css）
 */
import Image from 'next/image'
import { Sparkles } from 'lucide-react'
import { RarityBadge, type Rarity } from './rarity-badge'

export type PetCardData = {
  id: string
  name: string
  nickname: string | null
  rarity: Rarity
  level: number
  evolution_stage: number
  max_stage: number
  element: string | null
  current_image_url: string | null
  is_active: boolean
}

export function PetCard({
  pet,
  onClick,
}: {
  pet: PetCardData
  onClick?: () => void
}) {
  const display = pet.nickname || pet.name
  const evolved = pet.evolution_stage > 1

  return (
    <button
      onClick={onClick}
      className={`rarity-card rarity-card--${pet.rarity} group relative w-full text-left`}
      aria-label={`${display}（${pet.rarity}）`}
    >
      {pet.is_active && (
        <span className="active-stamp">
          <Sparkles className="h-3 w-3" strokeWidth={3} />
          出战
        </span>
      )}

      {/* 立绘 */}
      <div className="relative aspect-square w-full overflow-hidden bg-cream">
        {pet.current_image_url ? (
          <Image
            src={pet.current_image_url}
            alt={display}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-cream">
            <span className="font-display text-sm text-mute">立绘生成中…</span>
          </div>
        )}

        {/* 进化阶段指示（角标） */}
        {pet.max_stage > 1 && (
          <div className="absolute bottom-2 left-2 z-10 flex gap-1">
            {Array.from({ length: pet.max_stage }).map((_, i) => (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-full border-2 border-ink ${
                  i < pet.evolution_stage ? 'bg-doodle-coral' : 'bg-paper'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* 信息条 */}
      <div className="relative z-10 border-t-2 border-ink bg-paper/90 px-3 py-2.5 backdrop-blur-sm">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 className="truncate font-display text-base font-bold text-ink">
            {display}
          </h3>
          <RarityBadge rarity={pet.rarity} />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="font-display font-bold text-ink-soft">
            Lv.{pet.level}
            {evolved && (
              <span className="ml-1 text-doodle-coral">
                · {pet.evolution_stage}阶
              </span>
            )}
          </span>
          {pet.element && (
            <span className="rounded-full border border-ink bg-cream px-2 py-0.5 font-display text-[10px] font-bold uppercase text-ink-soft">
              {pet.element}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
