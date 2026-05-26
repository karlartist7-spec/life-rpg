'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'busy' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('busy')
    setErrorMsg('')
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
      return
    }
    router.push('/dashboard')
    router.refresh()
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
          邮箱 + 密码登录（私有 beta）
        </p>

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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            className="w-full px-4 py-3 rounded-xl text-lg bg-white outline-none focus:ring-0"
            style={{ border: '2px solid var(--color-ink)' }}
            disabled={status === 'busy'}
            autoComplete="current-password"
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
            {status === 'busy' ? '...' : '登录 →'}
          </button>
          {status === 'error' && (
            <p className="text-sm text-[--color-doodle-coral]">出错了：{errorMsg}</p>
          )}
        </form>
      </div>
    </main>
  )
}
