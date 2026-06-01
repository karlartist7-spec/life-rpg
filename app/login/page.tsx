'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Mail, Lock, ArrowRight, Loader2, AlertTriangle, Sparkles } from 'lucide-react'

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
    <main className="flex min-h-screen items-center justify-center bg-cream p-6">
      <div className="card-doodle w-full max-w-md shadow-doodle-lg">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-ink bg-doodle-pink shadow-doodle-sm">
            <Sparkles className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold leading-none">欢迎回来</h1>
            <p className="mt-1 text-sm text-ink-soft">life-rpg · 私有 beta</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-ink-soft">
              <Mail className="h-3.5 w-3.5" strokeWidth={2.5} />邮箱
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="input-doodle"
              disabled={status === 'busy'}
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-ink-soft">
              <Lock className="h-3.5 w-3.5" strokeWidth={2.5} />密码
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-doodle"
              disabled={status === 'busy'}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={status === 'busy'} className="btn-doodle btn-doodle--sunshine w-full">
            {status === 'busy' ? (
              <><Loader2 className="h-4 w-4 animate-spin" />登录中…</>
            ) : (
              <>登录<ArrowRight className="h-4 w-4" strokeWidth={2.5} /></>
            )}
          </button>
          {status === 'error' && (
            <div className="flex items-start gap-2 rounded-xl border-2 border-ink bg-doodle-coral/20 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-doodle-coral" strokeWidth={2.5} />
              <span className="text-ink-soft">出错了：{errorMsg}</span>
            </div>
          )}
        </form>
      </div>
    </main>
  )
}
