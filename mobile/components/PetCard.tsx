import { Pressable, View, Text, Image } from 'react-native'
import Animated from 'react-native-reanimated'
import { Brutal } from './Brutal'
import { ProgressBar } from './ProgressBar'
import { RarityBadge, ActiveStamp } from './RarityBadge'
import { usePressPhysics } from './usePressPhysics'
import { COLORS, RARITY, type Rarity } from '@/theme/tokens'
import { petExpPct } from '@/src/lib/pet-derive'
import type { UserPet } from '@/src/lib/types'

export function PetCard({ pet, onPress }: { pet: UserPet; onPress: () => void }) {
  const { off, faceStyle, plateStyle, onPressIn, onPressOut } = usePressPhysics('md')
  const rarity = (pet.rarity ?? 'common') as Rarity
  const plates = RARITY[rarity].plates
  const title = pet.nickname || pet.name || '神秘宠物'
  const art = pet.current_image_url || pet.base_image_url
  const pending = pet.pending_render != null

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress} style={{ flex: 1 }}>
      <View style={{ position: 'relative' }}>
        {plates.map((p, i) => (
          <Animated.View key={i} pointerEvents="none" style={[{ position: 'absolute', left: p.off, top: p.off, right: -p.off, bottom: -p.off, backgroundColor: p.color, borderRadius: 16 }, plateStyle]} />
        ))}
        <Animated.View style={[{ backgroundColor: RARITY[rarity].bg, borderRadius: 16, borderWidth: 2, borderColor: COLORS.ink, overflow: 'hidden', opacity: pending ? 0.6 : 1 }, faceStyle]}>
          <View style={{ aspectRatio: 1, backgroundColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }}>
            {art ? <Image source={{ uri: art }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
            <View style={{ position: 'absolute', top: 6, left: 6 }}><RarityBadge rarity={rarity} /></View>
            {pet.is_active ? <View style={{ position: 'absolute', top: 6, right: 6 }}><ActiveStamp /></View> : null}
            {pending ? <View style={{ position: 'absolute', bottom: 6, alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper }}><Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 9, color: COLORS.ink }}>进化中…</Text></View> : null}
          </View>
          <View style={{ padding: 10, gap: 6 }}>
            <Text numberOfLines={1} style={{ fontFamily: 'Fredoka_700Bold', fontSize: 14, color: COLORS.ink }}>{title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: COLORS.ink }}>Lv.{pet.level}</Text>
              {pet.element ? <Text numberOfLines={1} style={{ fontFamily: 'Nunito_700Bold', fontSize: 10, color: COLORS.mute, maxWidth: '60%' }}>{pet.element}</Text> : null}
            </View>
            <ProgressBar pct={petExpPct(pet.level, pet.exp)} fill={COLORS.sunshine} height={8} />
          </View>
        </Animated.View>
      </View>
      <View style={{ height: off + 4 }} />
    </Pressable>
  )
}
