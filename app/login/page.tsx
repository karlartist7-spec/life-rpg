'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'busy' | 'signup-pending' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('busy')
    setErrorMsg('')
    const supabase = createClient()

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setStatus('error')
        setErrorMsg(error.message)
        return
      }
      // 登录成功 → 进 dashboard
      router.push('/dashboard')
      router.refresh()
    } else {
      // 注册
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setStatus('error')
        setErrorMsg(error.message)
        return
      }
      // session 已经在了 = 邮箱确认关闭，直接进
      if (data.session) {
        router.push('/dashboard')
        router.refresh()
      } else {
        // 邮箱确认开着 → 等点链接
        setStatus('signup-pending')
      }
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[--color-paper] p-6">
      <div
        className="w-full max-w-md bg-[--color-cream] rounded-2xl p-8"
        style={{
          border: '3px solid var(--color-ink)',
          boxShadow: 'var(--shadow-doodle-lg)',
        }}
      >
        <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          欢迎来到 life-rpg
        </h1>
        <p className="text-[--color-ink-soft] mb-6">
          {mode === 'signin' ? '邮箱 + 密码登录' : '注册新账号'}
        </p>

        {/* Tab 切换 */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => { setMode('signin'); setStatus('idle'); setErrorMsg('') }}
            className={`flex-1 px-4 py-2 rounded-xl font-bold transition-transform ${
              mode === 'signin' ? 'bg-[--color-doodle-mint]' : 'bg-white'
            }`}
            style={{
              border: '2px solid var(--color-ink)',
              boxShadow: mode === 'signin' ? 'var(--shadow-doodle-md)' : 'none',
            }}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setStatus('idle'); setErrorMsg('') }}
            className={`flex-1 px-4 py-2 rounded-xl font-bold transition-transform ${
              mode === 'signup' ? 'bg-[--color-doodle-pink]' : 'bg-white'
            }`}
            style={{
              border: '2px solid var(--color-ink)',
              boxShadow: mode === 'signup' ? 'var(--shadow-doodle-md)' : 'none',
            }}
          >
            注册
          </button>
        </div>

        {status === 'signup-pending' ? (
          <div
            className="p-4 rounded-xl bg-[--color-doodle-mint] text-center"
            style={{ border: '2px solid var(--color-ink)' }}
          >
            <p className="font-bold text-lg">📬 确认邮件已发送</p>
            <p className="text-sm mt-1">去 {email} 邮箱点链接激活账号</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 rounded-xl text-lg bg-white outline-none focus:ring-0"
              style={{ border: '2px solid var(--color-ink)' }}
              disabled={status === 'busy'}
              autoComplete="email"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码（至少 6 位）"
              className="w-full px-4 py-3 rounded-xl text-lg bg-white outline-none focus:ring-0"
              style={{ border: '2px solid var(--color-ink)' }}
              disabled={status === 'busy'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
            <button
              type="submit"
              disabled={status === 'busy'}
              className="w-full px-6 py-3 rounded-xl text-lg font-bold bg-[--color-doodle-sunshine] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_0_var(--color-ink)] transition-transform disabled:opacity-50"
              style={{
                border: '2px solid var(--color-ink)',
                boxShadow: 'var(--shadow-doodle-md)',
              }}
            >
              {status === 'busy' ? '...' : mode === 'signin' ? '登录 →' : '注册 →'}
            </button>
            {status === 'error' && (
              <p className="text-sm text-[--color-doodle-coral]">出错了：{errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </main>
  )
}
