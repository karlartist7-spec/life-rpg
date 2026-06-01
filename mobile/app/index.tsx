import { useEffect, useState } from 'react'
import { Redirect } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { LoadingState } from '@/components/LoadingState'
export default function Index() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s))
    return () => sub.subscription.unsubscribe()
  }, [])
  if (authed === null) return <LoadingState label="启动中…" />
  return <Redirect href={authed ? '/(tabs)' : '/login'} />
}
