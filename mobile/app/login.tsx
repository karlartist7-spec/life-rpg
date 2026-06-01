import { useState } from 'react'
import { View, Text, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { COLORS } from '@/theme/tokens'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  async function submit() {
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    setBusy(false)
    if (error) { setErr(error.message); return }
    router.replace('/(tabs)')
  }
  const input = { borderWidth: 2, borderColor: COLORS.ink, borderRadius: 16, padding: 12, fontSize: 16, backgroundColor: COLORS.paper, marginTop: 6 }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Card>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 28 }}>欢迎回来</Text>
        <Text style={{ color: COLORS.inkSoft, marginTop: 4 }}>Life RPG · 私有 beta</Text>
        <TextInput style={input} placeholder="your@email.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!busy} />
        <TextInput style={input} placeholder="密码" secureTextEntry value={pw} onChangeText={setPw} editable={!busy} />
        <View style={{ height: 16 }} />
        <Button label={busy ? '登录中…' : '登录'} variant="sunshine" onPress={submit} disabled={busy} />
        {err ? <Text style={{ color: COLORS.coral, marginTop: 10 }}>出错了：{err}</Text> : null}
        <Text style={{ color: COLORS.mute, fontSize: 12, marginTop: 14, textAlign: 'center' }}>没有账号？联系管理员</Text>
      </Card>
    </KeyboardAvoidingView>
  )
}
