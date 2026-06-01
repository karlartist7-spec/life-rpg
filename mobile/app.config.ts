import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: 'Life RPG',
  slug: 'liferpg',
  scheme: 'liferpg',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  ios: { bundleIdentifier: 'com.karlartist7.liferpg', supportsTablet: false },
  android: { package: 'com.karlartist7.liferpg' },
  plugins: ['expo-router', 'expo-secure-store', 'expo-font'],
  experiments: { typedRoutes: true },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  },
}
export default config
