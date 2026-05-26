'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()
  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }
  return (
    <button
      onClick={logout}
      className="px-4 py-2 rounded-xl bg-[--color-doodle-coral] font-bold text-sm hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_0_var(--color-ink)] transition-transform"
      style={{
        border: '2px solid var(--color-ink)',
        boxShadow: 'var(--shadow-doodle-md)',
      }}
    >
      登出
    </button>
  )
}
