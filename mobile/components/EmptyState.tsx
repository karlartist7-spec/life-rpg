import { View, Text } from 'react-native'
import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react-native'
import { COLORS } from '@/theme/tokens'

export function EmptyState({
  Icon, title, subtitle,
}: { Icon: ComponentType<LucideProps>; title: string; subtitle?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 320 }}>
      <View style={{ width: 88, height: 88, borderRadius: 24, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={40} strokeWidth={2.5} color={COLORS.ink} />
      </View>
      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 18, color: COLORS.ink, marginTop: 16 }}>{title}</Text>
      {subtitle ? <Text style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 13, color: COLORS.mute, marginTop: 4, textAlign: 'center' }}>{subtitle}</Text> : null}
    </View>
  )
}
