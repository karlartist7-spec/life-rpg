import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LogoutButton from './logout-button'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // 拿当前角色卡（如果触发器已建好初始角色）
  const { data: character } = await supabase
    .from('current_character_view')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return (
    <main className="min-h-screen bg-[--color-paper] p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1
            className="text-5xl font-bold"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            🎮 你的人生面板
          </h1>
          <LogoutButton />
        </div>

        <div className="text-sm text-[--color-mute] mb-6">
          登录邮箱: {user.email}
        </div>

        {character ? (
          <CharacterCard character={character} />
        ) : (
          <div
            className="p-6 rounded-2xl bg-[--color-cream]"
            style={{ border: '3px solid var(--color-ink)', boxShadow: 'var(--shadow-doodle-md)' }}
          >
            <p>角色卡还没创建——可能数据库触发器没跑成功。检查 Supabase logs。</p>
          </div>
        )}
      </div>
    </main>
  )
}

type Character = {
  user_id: string
  display_name: string | null
  level: number
  exp: number
  next_level_exp: number
  vit: number
  spr: number
  int: number
  wil: number
  cha: number
}

function CharacterCard({ character }: { character: Character }) {
  const expPercent = Math.min(100, (character.exp / character.next_level_exp) * 100)
  const attrs = [
    { name: 'VIT', label: '体力', value: character.vit, color: '#E64545', emoji: '🫀' },
    { name: 'SPR', label: '精神', value: character.spr, color: '#3DD6C5', emoji: '🧘' },
    { name: 'INT', label: '智力', value: character.int, color: '#8A5CF6', emoji: '🧠' },
    { name: 'WIL', label: '意志', value: character.wil, color: '#FF9133', emoji: '🔥' },
    { name: 'CHA', label: '魅力', value: character.cha, color: '#F5C518', emoji: '🌟' },
  ]
  const total = attrs.reduce((s, a) => s + a.value, 0)

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div
        className="p-6 rounded-2xl bg-[--color-bg-pink]"
        style={{ border: '3px solid var(--color-ink)', boxShadow: 'var(--shadow-doodle-lg)' }}
      >
        <div className="text-sm uppercase tracking-wider text-[--color-ink-soft]">
          Level
        </div>
        <div className="text-7xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          {character.level}
        </div>
        <div className="text-sm mt-2">
          {character.display_name || '冒险者'}
        </div>
        <div className="mt-4">
          <div className="text-xs mb-1 flex justify-between">
            <span>EXP</span>
            <span>
              {character.exp} / {character.next_level_exp}
            </span>
          </div>
          <div
            className="h-4 rounded-full bg-white overflow-hidden"
            style={{ border: '2px solid var(--color-ink)' }}
          >
            <div
              className="h-full bg-[--color-doodle-mint] transition-all"
              style={{ width: `${expPercent}%` }}
            />
          </div>
        </div>
        <div className="text-xs mt-4 text-[--color-ink-soft]">
          总属性点: <span className="font-bold">{total}</span>
        </div>
      </div>

      <div
        className="p-6 rounded-2xl bg-[--color-cream]"
        style={{ border: '3px solid var(--color-ink)', boxShadow: 'var(--shadow-doodle-lg)' }}
      >
        <div className="text-sm uppercase tracking-wider text-[--color-ink-soft] mb-4">
          五维属性
        </div>
        <div className="space-y-3">
          {attrs.map((a) => (
            <div key={a.name}>
              <div className="flex justify-between text-sm mb-1">
                <span>
                  {a.emoji} {a.label} ({a.name})
                </span>
                <span className="font-bold">{a.value}</span>
              </div>
              <div
                className="h-3 rounded-full bg-white overflow-hidden"
                style={{ border: '2px solid var(--color-ink)' }}
              >
                <div
                  className="h-full transition-all"
                  style={{ width: `${Math.min(100, a.value)}%`, backgroundColor: a.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="md:col-span-2 p-6 rounded-2xl bg-[--color-bg-yellow]"
        style={{ border: '3px solid var(--color-ink)', boxShadow: 'var(--shadow-doodle-md)' }}
      >
        <div className="text-sm uppercase tracking-wider text-[--color-ink-soft] mb-2">
          下一步
        </div>
        <p className="text-lg">
          骨架搭好了。接下来：接 WHOOP webhook → 每日结算 → 自动涨属性。
        </p>
      </div>
    </div>
  )
}
