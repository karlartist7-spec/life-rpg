import { useMemo, useRef, useState } from 'react'
import { View, Text } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { PawPrint } from 'lucide-react-native'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { PetCard } from '@/components/PetCard'
import { PetDetailSheet } from '@/components/pets/PetDetailSheet'
import { usePets } from '@/src/lib/use-pets'
import { COLORS } from '@/theme/tokens'
import type { UserPet } from '@/src/lib/types'

export default function PetsScreen() {
  const insets = useSafeAreaInsets()
  const { data, isLoading, refetch, isRefetching } = usePets()
  const sheetRef = useRef<BottomSheetModal>(null)
  const [sel, setSel] = useState<UserPet | null>(null)

  const pets = data?.pets ?? []
  // keep the selected pet in sync with fresh data (e.g. after evolve/realtime)
  const selFresh = useMemo(() => (sel ? pets.find((p: UserPet) => p.id === sel.id) ?? sel : null), [sel, pets])

  if (isLoading) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><LoadingState label="加载宠物…" /></View>

  const openPet = (p: UserPet) => { setSel(p); sheetRef.current?.present() }
  const full = (data?.active_count ?? 0) >= (data?.max_active ?? 3)

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <FlashList<UserPet>
        data={pets}
        keyExtractor={(p: UserPet) => p.id}
        numColumns={2}
        estimatedItemSize={210}
        contentContainerStyle={{ padding: 12, paddingTop: insets.top + 8 }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 4, paddingBottom: 12, gap: 8 }}>
            <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 24, color: COLORS.ink }}>宠物图鉴</Text>
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: full ? COLORS.coral : COLORS.mint }}>
              <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: full ? COLORS.paper : COLORS.ink }}>出战 {data?.active_count ?? 0}/{data?.max_active ?? 3}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1, paddingHorizontal: 4, paddingBottom: 8 }}>
            <PetCard pet={item} onPress={() => openPet(item)} />
          </View>
        )}
        ListEmptyComponent={<EmptyState Icon={PawPrint} title="还没有宠物" subtitle="去冒险捕捉第一只伙伴" />}
        onRefresh={refetch}
        refreshing={isRefetching}
      />
      <PetDetailSheet ref={sheetRef} pet={selFresh} />
    </View>
  )
}
