import { useEffect } from 'react'
import { View, Pressable, Text } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Home, PawPrint, Compass, Package, User, type LucideProps } from 'lucide-react-native'
import type { ComponentType } from 'react'
import { COLORS } from '@/theme/tokens'
import { tapMedium } from '@/src/lib/haptics'

// @react-navigation/bottom-tabs is not installed (expo-router's Tabs does not
// surface its types here), so BottomTabBarProps is unresolvable — fall back to
// the structural shape the tabBar callback actually passes.
type GameDockProps = { state: any; navigation: any }

const SLOTS: { name: string; label: string; Icon: ComponentType<LucideProps>; center?: boolean }[] = [
  { name: 'index', label: '主城', Icon: Home },
  { name: 'pets', label: '伙伴', Icon: PawPrint },
  { name: 'adventures', label: '冒险', Icon: Compass, center: true },
  { name: 'inventory', label: '行囊', Icon: Package },
  { name: 'character', label: '英雄', Icon: User },
]

function SideTab({ focused, label, Icon, onPress }: { focused: boolean; label: string; Icon: ComponentType<LucideProps>; onPress: () => void }) {
  const t = useSharedValue(focused ? 1 : 0)
  useEffect(() => { t.value = withSpring(focused ? 1 : 0, { damping: 14, stiffness: 200 }) }, [focused])
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * t.value }] }))
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center' }}>
      <Animated.View style={[{ alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9999, borderWidth: focused ? 2 : 0, borderColor: COLORS.ink, backgroundColor: focused ? COLORS.periwinkle : 'transparent' }, s]}>
        <Icon size={22} strokeWidth={2.5} color={focused ? COLORS.paper : COLORS.ink} />
        <Text style={{ fontFamily: 'Fredoka_600SemiBold', fontSize: 10, marginTop: 2, color: focused ? COLORS.paper : COLORS.ink }}>{label}</Text>
      </Animated.View>
    </Pressable>
  )
}

function CenterHub({ focused, onPress }: { focused: boolean; onPress: () => void }) {
  const pulse = useSharedValue(1)
  useEffect(() => { pulse.value = withSpring(focused ? 1.06 : 1, { damping: 10, stiffness: 160 }) }, [focused])
  const s = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))
  return (
    <Pressable onPress={onPress} style={{ position: 'absolute', left: 0, right: 0, top: -22, alignItems: 'center' }}>
      <View style={{ position: 'relative', alignItems: 'center' }}>
        {/* shadow plate */}
        <View pointerEvents="none" style={{ position: 'absolute', width: 60, height: 60, borderRadius: 9999, backgroundColor: COLORS.ink, top: 4, left: 4 }} />
        <Animated.View style={[{ width: 60, height: 60, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.periwinkle, alignItems: 'center', justifyContent: 'center' }, s]}>
          <Compass size={28} strokeWidth={2.5} color={COLORS.paper} />
        </Animated.View>
      </View>
      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 10, color: COLORS.ink, marginTop: 2 }}>冒险</Text>
    </Pressable>
  )
}

export function GameDock({ state, navigation }: GameDockProps) {
  const insets = useSafeAreaInsets()
  const activeName = state.routes[state.index]?.name
  const go = (name: string) => {
    if (activeName !== name) { tapMedium(); navigation.navigate(name) }
  }
  return (
    <View style={{ borderTopWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper, paddingBottom: insets.bottom, paddingTop: 10, flexDirection: 'row', alignItems: 'flex-start' }}>
      {SLOTS.map((slot) =>
        slot.center
          ? <View key={slot.name} style={{ flex: 1 }} />
          : <SideTab key={slot.name} focused={activeName === slot.name} label={slot.label} Icon={slot.Icon} onPress={() => go(slot.name)} />
      )}
      <CenterHub focused={activeName === 'adventures'} onPress={() => go('adventures')} />
    </View>
  )
}
