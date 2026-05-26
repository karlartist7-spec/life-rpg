import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LogoutButton from './logout-button'
import { AttrIcon, GameIcon, WhoopIcon, BellIcon } from '@/components/icons'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // 角色卡
  const { data: character } = await supabase
    .from('current_character_view')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // WHOOP 连接状态
  const { data: whoopToken } = await supabase
    .from('whoop_tokens')
    .select('whoop_user_id, expires_at')
    .eq('user_id', user.id)
    .maybeSingle()

  // 个人资料（拿 telegram_chat_id 显示是否绑定）
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, telegram_chat_id, timezone')
    .eq('id', user.id)
    .single()

  return (
    <main className="min-h-screen bg-[--color-paper] p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1
            className="text-5xl font-bold flex items-center gap-3"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <GameIcon className="w-12 h-12" />
            你的人生面板
          </h1>
          <LogoutButton />
        </div>

        <div className="text-sm text-[--color-mute] mb-6">
          登录邮箱: {user.email}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <ConnectionCard
            connected={!!whoopToken}
            title="WHOOP"
            subtitle={
              whoopToken
                ? `已连接 (whoop_user ${whoopToken.whoop_user_id})`
                : '点击授权同步健康数据'
            }
            href={whoopToken ? undefined : '/api/auth/whoop/login'}
            actionLabel={whoopToken ? '已连接' : '连接 WHOOP'}
            icon={<WhoopIcon className="w-8 h-8" />}
          />
          <ConnectionCard
            connected={!!profile?.telegram_chat_id}
            title="Telegram 早报"
            subtitle={
              profile?.telegram_chat_id
                ? `chat_id ${profile.telegram_chat_id} · ${profile.timezone || 'Asia/Shanghai'}`
                : '未绑定推送目标'
            }
            actionLabel={
              profile?.telegram_chat_id ? '已绑定' : '未绑定'
            }
            icon={<BellIcon className="w-8 h-8" />}
          />
        </div>

        {character ? (
          <CharacterCard character={character} />
        ) : (
          <div
            className="p-6 rounded-2xl bg-[--color-cream]"
            style={{
              border: '3px solid var(--color-ink)',
              boxShadow: 'var(--shadow-doodle-md)',
            }}
          >
            <p>角色卡还没创建——可能数据库触发器没跑成功。检查 Supabase logs。</p>
          </div>
        )}
      </div>
    </main>
  )
}

function ConnectionCard({
  connected,
  title,
  subtitle,
  href,
  actionLabel,
  icon,
}: {
  connected: boolean
  title: string
  subtitle: string
  href?: string
  actionLabel: string
  icon: React.ReactNode
}) {
  const bg = connected ? 'bg-[--color-bg-mint]' : 'bg-[--color-cream]'
  const buttonInner = (
    <span
      className={`text-sm font-bold px-4 py-2 rounded-full ${
        connected
          ? 'bg-white text-[--color-ink]'
          : 'bg-[--color-ink] text-white'
      }`}
      style={{ border: '2px solid var(--color-ink)' }}
    >
      {actionLabel}
    </span>
  )

  return (
    <div
      className={`p-5 rounded-2xl ${bg} flex items-center justify-between gap-4`}
      style={{
        border: '3px solid var(--color-ink)',
        boxShadow: 'var(--shadow-doodle-md)',
      }}
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0">{icon}</div>
        <div>
          <div className="font-bold">{title}</div>
          <div className="text-xs text-[--color-ink-soft]">{subtitle}</div>
        </div>
      </div>
      {href ? (
        <a href={href}>{buttonInner}</a>
      ) : (
        buttonInner
      )}
    </div>
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
  const expPercent = Math.min(
    100,
    (character.exp / character.next_level_exp) * 100
  )
  const attrs: {
    name: 'VIT' | 'SPR' | 'INT' | 'WIL' | 'CHA'
    label: string
    value: number
    color: string
  }[] = [
    { name: 'VIT', label: '体力', value: character.vit, color: '#E64545' },
    { name: 'SPR', label: '精神', value: character.spr, color: '#3DD6C5' },
    { name: 'INT', label: '智力', value: character.int, color: '#8A5CF6' },
    { name: 'WIL', label: '意志', value: character.wil, color: '#FF9133' },
    { name: 'CHA', label: '魅力', value: character.cha, color: '#F5C518' },
  ]
  const total = attrs.reduce((s, a) => s + a.value, 0)

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div
        className="p-6 rounded-2xl bg-[--color-bg-pink]"
        style={{
          border: '3px solid var(--color-ink)',
          boxShadow: 'var(--shadow-doodle-lg)',
        }}
      >
        <div className="text-sm uppercase tracking-wider text-[--color-ink-soft]">
          Level
        </div>
        <div
          className="text-7xl font-bold"
          style={{ fontFamily: 'var(--font-display)' }}
        >
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
        style={{
          border: '3px solid var(--color-ink)',
          boxShadow: 'var(--shadow-doodle-lg)',
        }}
      >
        <div className="text-sm uppercase tracking-wider text-[--color-ink-soft] mb-4">
          五维属性
        </div>
        <div className="space-y-3">
          {attrs.map((a) => (
            <div key={a.name}>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-2">
                  <AttrIcon name={a.name} className="w-4 h-4" color={a.color} />
                  {a.label} ({a.name})
                </span>
                <span className="font-bold">{a.value}</span>
              </div>
              <div
                className="h-3 rounded-full bg-white overflow-hidden"
                style={{ border: '2px solid var(--color-ink)' }}
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, a.value)}%`,
                    backgroundColor: a.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
