'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('sent')
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
          输入邮箱，我们会发一个魔法链接给你 ✨
        </p>

        {status === 'sent' ? (
          <div
            className="p-4 rounded-xl bg-[--color-doodle-mint] text-center"
            style={{ border: '2px solid var(--color-ink)' }}
          >
            <p className="font-bold text-lg">📬 邮件已发送！</p>
            <p className="text-sm mt-1">去 {email} 邮箱点链接登录</p>
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
              disabled={status === 'sending'}
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full px-6 py-3 rounded-xl text-lg font-bold bg-[--color-doodle-pink] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_0_var(--color-ink)] transition-transform disabled:opacity-50"
              style={{
                border: '2px solid var(--color-ink)',
                boxShadow: 'var(--shadow-doodle-md)',
              }}
            >
              {status === 'sending' ? '发送中...' : '发送魔法链接 →'}
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
