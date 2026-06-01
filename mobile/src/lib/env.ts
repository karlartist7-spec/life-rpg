import Constants from 'expo-constants'
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>
export const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL!
export const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
export const API_BASE_URL = extra.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL!
