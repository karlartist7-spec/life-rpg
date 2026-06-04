import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { GameDock } from '@/components/game/GameDock'
import { GameHud } from '@/components/game/GameHud'

const SCREENS = ['index', 'adventures', 'pets', 'inventory', 'character']

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <GameDock {...props} />}>
        {SCREENS.map((n) => <Tabs.Screen key={n} name={n} />)}
      </Tabs>
      <GameHud />
    </View>
  )
}
