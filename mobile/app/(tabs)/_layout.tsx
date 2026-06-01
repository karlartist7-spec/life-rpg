import { Tabs } from 'expo-router'
import { View, Pressable, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Home, Compass, PawPrint, Package, User } from 'lucide-react-native'
import { COLORS } from '@/theme/tokens'
import { tapMedium } from '@/src/lib/haptics'

const TABS = [
  { name: 'index', label: '首页', Icon: Home },
  { name: 'adventures', label: '冒险', Icon: Compass },
  { name: 'pets', label: '宠物', Icon: PawPrint },
  { name: 'inventory', label: '背包', Icon: Package },
  { name: 'character', label: '角色', Icon: User },
]

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <View style={{ flexDirection: 'row', borderTopWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper, paddingBottom: insets.bottom, paddingTop: 8 }}>
          {state.routes.map((route, i) => {
            const tab = TABS.find((t) => t.name === route.name); if (!tab) return null
            const focused = state.index === i
            return (
              <Pressable key={route.key} style={{ flex: 1, alignItems: 'center' }}
                onPress={() => { if (!focused) { tapMedium(); navigation.navigate(route.name) } }}>
                <View style={{ alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 9999,
                  borderWidth: focused ? 2 : 0, borderColor: COLORS.ink, backgroundColor: focused ? COLORS.periwinkle : 'transparent' }}>
                  <tab.Icon size={22} strokeWidth={2.5} color={focused ? COLORS.paper : COLORS.ink} />
                  <Text style={{ fontFamily: 'Fredoka_600SemiBold', fontSize: 11, marginTop: 2, color: focused ? COLORS.paper : COLORS.ink }}>{tab.label}</Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      )}
    >
      {TABS.map((t) => <Tabs.Screen key={t.name} name={t.name} />)}
    </Tabs>
  )
}
