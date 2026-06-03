import { Pressable, View, Text, Image } from 'react-native'
import Animated from 'react-native-reanimated'
import { RarityBadge } from './RarityBadge'
import { usePressPhysics } from './usePressPhysics'
import { COLORS, RARITY, type Rarity } from '@/theme/tokens'
import type { InventoryItem } from '@/src/lib/types'

export function ItemCard({ item, onPress }: { item: InventoryItem; onPress: () => void }) {
  const { off, faceStyle, plateStyle, onPressIn, onPressOut } = usePressPhysics('md')
  const rarity = (item.meta.rarity ?? 'common') as Rarity
  const plates = RARITY[rarity].plates
  const name = item.meta.name || item.item_slug
  const art = item.meta.image_url

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress} style={{ flex: 1 }}>
      <View style={{ position: 'relative' }}>
        {plates.map((p, i) => (
          <Animated.View key={i} pointerEvents="none" style={[{ position: 'absolute', left: p.off, top: p.off, right: -p.off, bottom: -p.off, backgroundColor: p.color, borderRadius: 16 }, plateStyle]} />
        ))}
        <Animated.View style={[{ backgroundColor: RARITY[rarity].bg, borderRadius: 16, borderWidth: 2, borderColor: COLORS.ink, overflow: 'hidden' }, faceStyle]}>
          <View style={{ aspectRatio: 1, backgroundColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }}>
            {art ? <Image source={{ uri: art }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
            <View style={{ position: 'absolute', top: 6, left: 6 }}><RarityBadge rarity={rarity} /></View>
            {item.equipped ? (
              <View style={{ position: 'absolute', top: 6, right: 6, transform: [{ rotate: '8deg' }], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.sunshine }}>
                <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 10, color: COLORS.ink }}>已装备</Text>
              </View>
            ) : null}
            {item.qty > 1 ? (
              <View style={{ position: 'absolute', bottom: 6, right: 6, minWidth: 24, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.ink, alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 11, color: COLORS.paper }}>×{item.qty}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ padding: 10, gap: 4 }}>
            <Text numberOfLines={1} style={{ fontFamily: 'Fredoka_700Bold', fontSize: 13, color: COLORS.ink }}>{name}</Text>
            <Text numberOfLines={1} style={{ fontFamily: 'Nunito_700Bold', fontSize: 10, color: COLORS.mute }}>{item.meta.type}</Text>
          </View>
        </Animated.View>
      </View>
      <View style={{ height: off + 4 }} />
    </Pressable>
  )
}
