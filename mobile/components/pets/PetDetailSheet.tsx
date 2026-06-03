import { forwardRef, useState } from 'react'
import { View, Text, Image } from 'react-native'
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import ConfettiCannon from 'react-native-confetti-cannon'
import { Dimensions } from 'react-native'
import { Brutal } from '@/components/Brutal'
import { Button } from '@/components/Button'
import { ProgressBar } from '@/components/ProgressBar'
import { RarityBadge } from '@/components/RarityBadge'
import { useToast } from '@/components/Toast'
import { useSetPetActive, useEvolvePet } from '@/src/lib/use-pets'
import { petExpPct, evolveErrorMessage } from '@/src/lib/pet-derive'
import { success as hapticSuccess, tapMedium } from '@/src/lib/haptics'
import { COLORS, RARITY, type Rarity } from '@/theme/tokens'
import type { UserPet } from '@/src/lib/types'

const CANDY = [COLORS.mint, COLORS.pink, COLORS.periwinkle, COLORS.sunshine, COLORS.coral, COLORS.sky, COLORS.lilac]

function StageDots({ stage, max }: { stage: number; max: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: max }, (_, i) => (
        <View key={i} style={{ width: 14, height: 14, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: i < stage ? COLORS.periwinkle : COLORS.paper }} />
      ))}
      <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: COLORS.ink, marginLeft: 4 }}>{stage}/{max} 阶</Text>
    </View>
  )
}

export const PetDetailSheet = forwardRef<BottomSheetModal, { pet: UserPet | null }>(function PetDetailSheet({ pet }, ref) {
  const toast = useToast()
  const setActive = useSetPetActive()
  const evolve = useEvolvePet()
  const [burst, setBurst] = useState(0)

  if (!pet) {
    return <BottomSheetModal ref={ref} snapPoints={['90%']} backgroundStyle={{ backgroundColor: COLORS.cream }}><BottomSheetView><View /></BottomSheetView></BottomSheetModal>
  }

  const rarity = (pet.rarity ?? 'common') as Rarity
  const title = pet.nickname || pet.name || '神秘宠物'
  const art = pet.current_image_url || pet.base_image_url
  const canEvolve = pet.evolution_stage < pet.max_stage && pet.pending_render == null
  const s = pet.stats ?? {}

  const onDispatch = async () => {
    tapMedium()
    const r = await setActive.mutateAsync({ user_pet_id: pet.id, active: !pet.is_active })
    if (!r.ok) toast.show({ message: evolveErrorMessage(r.code), tone: 'error' })
  }
  const onEvolve = async () => {
    const r = await evolve.mutateAsync({ user_pet_id: pet.id })
    if (r.ok) { hapticSuccess(); setBurst((n) => n + 1); toast.show({ message: '进化开始！稍候新形态揭晓', tone: 'success' }) }
    else toast.show({ message: evolveErrorMessage(r.code, r.need), tone: 'error' })
  }

  return (
    <BottomSheetModal ref={ref} snapPoints={['90%']} backgroundStyle={{ backgroundColor: COLORS.cream }} handleIndicatorStyle={{ backgroundColor: COLORS.ink }}>
      <BottomSheetView style={{ flex: 1, padding: 16, gap: 14 }}>
        <Brutal bg={RARITY[rarity].bg} radius={20} offset="md" faceStyle={{ padding: 0, overflow: 'hidden' }} plates={[...RARITY[rarity].plates]}>
          <View style={{ aspectRatio: 16 / 10, backgroundColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }}>
            {art ? <Image source={{ uri: art }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
          </View>
        </Brutal>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 22, color: COLORS.ink, flex: 1 }} numberOfLines={1}>{title}</Text>
          <RarityBadge rarity={rarity} />
        </View>
        {pet.element ? <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.mute }}>{pet.element}</Text> : null}

        <StageDots stage={pet.evolution_stage} max={pet.max_stage} />

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>Lv.{pet.level}</Text>
            <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: COLORS.mute }}>EXP {pet.exp}</Text>
          </View>
          <ProgressBar pct={petExpPct(pet.level, pet.exp)} fill={COLORS.sunshine} height={10} />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {([['HP', s.hp], ['ATK', s.atk], ['DEF', s.def]] as const).map(([k, v]) => (
            <View key={k} style={{ flex: 1 }}>
              <Brutal bg={COLORS.paper} radius={12} offset="sm" faceStyle={{ padding: 10, alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 18, color: COLORS.ink }}>{v ?? '—'}</Text>
                <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 10, color: COLORS.mute }}>{k}</Text>
              </Brutal>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto', paddingBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label={pet.is_active ? '收回' : '出战'} variant={pet.is_active ? 'coral' : 'mint'} onPress={onDispatch} disabled={setActive.isPending} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={pet.pending_render ? '进化中…' : '进化'} variant="peri" onPress={onEvolve} disabled={!canEvolve || evolve.isPending} />
          </View>
        </View>
      </BottomSheetView>

      {burst > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <ConfettiCannon key={burst} count={80} origin={{ x: Dimensions.get('window').width / 2, y: 0 }} autoStart fadeOut explosionSpeed={350} fallSpeed={2600} colors={CANDY} />
        </View>
      ) : null}
    </BottomSheetModal>
  )
})
