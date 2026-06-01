import '../global.css'
import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka'
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito'
import { queryClient } from '@/src/lib/query-client'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [loaded] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold })
  useEffect(() => { if (loaded) SplashScreen.hideAsync() }, [loaded])
  if (!loaded) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#fbf7f0' } }} />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
