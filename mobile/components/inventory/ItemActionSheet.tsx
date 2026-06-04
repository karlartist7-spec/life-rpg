import { forwardRef, useState } from 'react'
import { View, Text, Image, Dimensions } from 'react-native'
import { BottomSheetModal, BottomSheetView, useBottomSheetModal } from '@gorhom/bottom-sheet'
import ConfettiCannon from 'react-native-confetti-cannon'
import { router } from 'expo-router'
import { Brutal } from '@/components/Brutal'
import { Button } from '@/components/Button'
import { RarityBadge } from '@/components/RarityBadge'
import { useToast } from '@/components/Toast'
import { useUseItem, useEquipItem } from '@/src/lib/use-inventory'
import { itemAction, useEffectMessage, inventoryErrorMessage } from '@/src/lib/inventory-derive'
import { success as hapticSuccess, tapHeavy } from '@/src/lib/haptics'
import { COLORS, RARITY, type Rarity } from '@/theme/tokens'
import type { InventoryItem } from '@/src/lib/types'

const CANDY = [COLORS.mint, COLORS.pink, COLORS.periwinkle, COLORS.sunshine, COLORS.coral, COLORS.sky, COLORS.lilac]

export const ItemActionSheet = forwardRef<BottomSheetModal, { item: InventoryItem | null; onDone?: () => void }>(
  function ItemActionSheet({ item, onDone }, ref) {
    const toast = useToast()
    const { dismiss } = useBottomSheetModal()
    const useItem = useUseItem()
    const equip = useEquipItem()
    const [burst, setBurst] = useState(0)

    if (!item) {
      return <BottomSheetModal ref={ref} snapPoints={['60%']} backgroundStyle={{ backgroundColor: COLORS.cream }}><BottomSheetView><View /></BottomSheetView></BottomSheetModal>
    }

    const rarity = (item.meta.rarity ?? 'common') as Rarity
    const action = itemAction(item.meta.type)
    const name = item.meta.name || item.item_slug
    const art = item.meta.image_url

    const close = () => { onDone?.(); dismiss() }

    const onUse = async () => {
      const r = await useItem.mutateAsync({ item_id: item.id })
      if (!r.ok) { toast.show({ message: inventoryErrorMessage(r.code), tone: 'error' }); return }
      if (r.data.effect === 'hatch') {
        tapHeavy(); setBurst((n) => n + 1)
        toast.show({ message: useEffectMessage(r.data), tone: 'celebrate' })
        setTimeout(() => { close(); router.navigate('/pets') }, 900)
      } else {
        hapticSuccess(); toast.show({ message: useEffectMessage(r.data), tone: 'success' }); close()
      }
    }
    const onEquip = async () => {
      const r = await equip.mutateAsync({ item_id: item.id, equipped: !item.equipped })
      if (!r.ok) { toast.show({ message: inventoryErrorMessage(r.code), tone: 'error' }); return }
      toast.show({ message: r.equipped ? '已装备' : '已卸下', tone: 'success' }); close()
    }

    return (
      <BottomSheetModal ref={ref} snapPoints={['60%']} backgroundStyle={{ backgroundColor: COLORS.cream }} handleIndicatorStyle={{ backgroundColor: COLORS.ink }}>
        <BottomSheetView style={{ flex: 1, padding: 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Brutal bg={RARITY[rarity].bg} radius={16} offset="md" plates={[...RARITY[rarity].plates]} faceStyle={{ padding: 0, overflow: 'hidden' }}>
              <View style={{ width: 96, height: 96, backgroundColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }}>
                {art ? <Image source={{ uri: art }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
              </View>
            </Brutal>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 20, color: COLORS.ink }} numberOfLines={2}>{name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <RarityBadge rarity={rarity} />
                <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 11, color: COLORS.mute }}>{item.meta.type} · ×{item.qty}</Text>
              </View>
            </View>
          </View>

          {item.meta.description ? <Text style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 13, color: COLORS.ink }}>{item.meta.description}</Text> : null}

          <View style={{ marginTop: 'auto', paddingBottom: 8, gap: 10 }}>
            {action === 'use' ? <Button label="使用" variant="mint" onPress={onUse} disabled={useItem.isPending} /> : null}
            {action === 'hatch' ? <Button label="孵化" variant="pink" onPress={onUse} disabled={useItem.isPending} /> : null}
            {action === 'equip' ? <Button label={item.equipped ? '卸下' : '装备'} variant={item.equipped ? 'coral' : 'sunshine'} onPress={onEquip} disabled={equip.isPending} /> : null}
            {action === 'none' ? <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.mute, textAlign: 'center' }}>该物品用于冒险/进化，暂无直接操作</Text> : null}
          </View>
        </BottomSheetView>

        {burst > 0 ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <ConfettiCannon key={burst} count={90} origin={{ x: Dimensions.get('window').width / 2, y: 0 }} autoStart fadeOut explosionSpeed={350} fallSpeed={2600} colors={CANDY} />
          </View>
        ) : null}
      </BottomSheetModal>
    )
  }
)
