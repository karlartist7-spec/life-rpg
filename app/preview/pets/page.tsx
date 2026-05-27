'use client'

/**
 * 设计 QA 公开预览页：4 档稀有度并排对照
 * 仅用于调色 / 截图给设计 review，不挂在 /dashboard 下避免登录拦截。
 */
import { PetCard, type PetCardData } from '@/components/pet-card'
import { RarityBadge, type Rarity } from '@/components/rarity-badge'

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect fill="#fbf7f0" width="200" height="200"/>
      <circle cx="100" cy="90" r="35" fill="#000" opacity="0.08"/>
      <text x="100" y="160" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#9b9b9b">立绘预览</text>
    </svg>`
  )

function mockPet(rarity: Rarity, name: string, opts: Partial<PetCardData> = {}): PetCardData {
  return {
    id: `mock-${rarity}`,
    name,
    nickname: name,
    rarity,
    level: { common: 5, rare: 12, epic: 24, legendary: 48 }[rarity],
    evolution_stage: { common: 1, rare: 1, epic: 2, legendary: 3 }[rarity],
    max_stage: { common: 1, rare: 2, epic: 3, legendary: 3 }[rarity],
    element: { common: '土', rare: '光', epic: '幻影', legendary: '星辰' }[rarity],
    current_image_url: PLACEHOLDER,
    is_active: rarity === 'legendary',
    ...opts,
  }
}

const MOCKS: PetCardData[] = [
  mockPet('common', '小灰鼠'),
  mockPet('rare', '光影猫'),
  mockPet('epic', '幻影狐'),
  mockPet('legendary', '星辰龙'),
]

export default function PetsPreviewPage() {
  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1 className="font-display text-4xl font-bold">稀有度视觉系统 QA</h1>
          <p className="mt-2 text-mute">
            从左到右：common / rare / epic / legendary —— 边框、底色、阴影、动效全档差异化
          </p>
        </header>

        {/* 卡片对照 */}
        <section>
          <h2 className="mb-4 font-display text-xl font-bold">宠物卡片（hover 看 transform）</h2>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {MOCKS.map((pet) => (
              <PetCard key={pet.id} pet={pet} />
            ))}
          </div>
        </section>

        {/* 徽章对照 */}
        <section>
          <h2 className="mb-4 font-display text-xl font-bold">稀有度徽章</h2>
          <div className="flex flex-wrap gap-4 rounded-2xl border-2 border-ink bg-paper p-6 shadow-doodle-md">
            {(['common', 'rare', 'epic', 'legendary'] as Rarity[]).map((r) => (
              <div key={r} className="flex flex-col items-center gap-2">
                <RarityBadge rarity={r} size="md" />
                <span className="text-xs text-mute">{r}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 卡片裸样式（无内容） */}
        <section>
          <h2 className="mb-4 font-display text-xl font-bold">空卡片：边框 / 阴影 / 动效对比</h2>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {(['common', 'rare', 'epic', 'legendary'] as Rarity[]).map((r) => (
              <div
                key={r}
                className={`rarity-card rarity-card--${r} flex aspect-square items-center justify-center`}
              >
                <span className="relative z-10 font-display text-xl font-bold uppercase">
                  {r}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
