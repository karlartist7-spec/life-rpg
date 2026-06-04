import { View, Text, Pressable, Image } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Flame, Zap } from 'lucide-react-native'
import { useDashboard } from '@/src/lib/use-dashboard'
import { recoveryBucket, expPct } from '@/src/lib/dashboard-derive'
import { COLORS, RECOVERY } from '@/theme/tokens'
import { GAME_HUD_HEIGHT } from '@/theme/game'

export function GameHud() {
  const insets = useSafeAreaInsets()
  const { data } = useDashboard()
  const c = data?.character
  const zone = RECOVERY[recoveryBucket(data?.today_snapshot.recovery_score ?? null).key]
  const exp = c ? expPct(c.exp, c.next_level_exp) : 0
  const whoopExpired = data?.connections.whoop.expired === true

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }}>
      <View style={{ paddingTop: insets.top + 6, height: insets.top + GAME_HUD_HEIGHT, paddingHorizontal: 12, paddingBottom: 6, backgroundColor: COLORS.paper, borderBottomWidth: 2, borderColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {/* avatar + Lv → Character tab */}
        <Pressable onPress={() => router.navigate('/character')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 32, height: 32, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.periwinkle, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {data?.user.avatar_url
              ? <Image source={{ uri: data.user.avatar_url }} style={{ width: '100%', height: '100%' }} />
              : <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 14, color: COLORS.paper }}>{(c?.name ?? 'H').slice(0, 1)}</Text>}
          </View>
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.sunshine }}>
            <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 12, color: COLORS.ink }}>Lv{c?.level ?? 1}</Text>
          </View>
        </Pressable>

        {/* EXP bar */}
        <View style={{ flex: 1, height: 10, borderWidth: 2, borderColor: COLORS.ink, borderRadius: 9999, backgroundColor: COLORS.cream, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${exp}%`, backgroundColor: COLORS.sunshine }} />
        </View>

        {/* energy crystal (today stamina, recovery-tinted) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: zone.face }}>
          <Zap size={13} strokeWidth={3} color={COLORS.ink} />
          <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>{data?.today_stamina?.stamina ?? 0}</Text>
          {whoopExpired ? <View style={{ width: 7, height: 7, borderRadius: 9999, backgroundColor: COLORS.coral, borderWidth: 1, borderColor: COLORS.ink }} /> : null}
        </View>

        {/* streak */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Flame size={15} strokeWidth={2.5} color={COLORS.coral} />
          <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 12, color: COLORS.ink }}>{data?.today_snapshot.streak ?? 0}</Text>
        </View>
      </View>
    </View>
  )
}
