import { View, Text } from 'react-native'
import { COLORS, RARITY, type Rarity } from '@/theme/tokens'

const LABEL: Record<Rarity, string> = { common: '普通', rare: '稀有', epic: '史诗', legendary: '传说' }

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  const r = RARITY[rarity]
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: r.bg }}>
      <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 10, color: COLORS.ink }}>{LABEL[rarity]}</Text>
    </View>
  )
}

export function ActiveStamp() {
  return (
    <View style={{ transform: [{ rotate: '-8deg' }], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.coral }}>
      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 11, color: COLORS.paper }}>出战</Text>
    </View>
  )
}
