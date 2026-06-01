# Mobile Phase 1 — Thin Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up the `mobile/` Expo app and prove every load-bearing seam against LIVE data: NativeWind token port + the dual-plate Brutal shadow, Supabase email/password auth with chunked SecureStore + AppState refresh, the Bearer-augmented `/api/dashboard` path, a 5-tab bottom nav, and ONE real screen (Home/Today) reading live `/api/dashboard`.

**Architecture:** New `mobile/` pnpm workspace package (root web app untouched). Backend gains a `getRouteUser(req)` helper so user routes accept either a cookie (web) or `Authorization: Bearer <supabase JWT>` (app). The app uses supabase-js for auth/session and a Bearer fetch wrapper for `/api`. Doodle tokens port 1:1; the hard offset shadow becomes a real sibling black "shadow-plate" View.

**Tech Stack:** Expo (SDK 52+) + Expo Router + TypeScript + NativeWind v4 + @supabase/supabase-js + expo-secure-store + @tanstack/react-query + react-native-reanimated + expo-haptics + lucide-react-native.

> **Verification split (be honest about it):**
> - **Backend tasks (T7–T8): I verify here** — `pnpm build` (root) green + `/api/dashboard` still 401 unauth + web cookie path unchanged.
> - **Mobile tasks (T1–T6, T9–T12): code is written here, but Expo cannot run in this sandbox.** The USER runs `pnpm install` + `npx expo` on their machine (real device/simulator) using the commands in each task's verify step. Mark these "user-verified".
> - All `curl` to localhost on this machine needs `--noproxy '*'` (proxy on :7890). gh push: `gh auth switch -u karlartist7-spec` first.

---

## File Structure

**Backend (root, web stays intact):**
- Create `lib/supabase/route-auth.ts` — `getRouteUser(req)` (Bearer-or-cookie → `{ supabase, user }`).
- Create `lib/http/cors.ts` — `corsHeaders()`, `withCors()`, `preflight()`.
- Modify `app/api/dashboard/route.ts` — `GET(req)` + `getRouteUser` + CORS/OPTIONS.

**Mobile (`mobile/`):**
- Config: `package.json`, `app.config.ts`, `babel.config.js`, `metro.config.js`, `tsconfig.json`, `.npmrc`, `eas.json`, `nativewind-env.d.ts`, `global.css`, `tailwind.config.js`.
- `theme/tokens.ts` — colors / brutalOffset / rarity (TS mirror of CSS tokens).
- `src/lib/` — `supabase.ts`, `secure-store-adapter.ts`, `api-client.ts`, `query-client.ts`, `haptics.ts`, `env.ts`.
- `components/` — `Brutal.tsx`, `Button.tsx`, `Card.tsx`, `StatTile.tsx`, `ProgressBar.tsx`, `LoadingState.tsx`, `AnimatedNumber.tsx`.
- `app/` (Expo Router) — `_layout.tsx`, `index.tsx` (auth gate), `login.tsx`, `(tabs)/_layout.tsx` (custom Brutal tab bar), `(tabs)/index.tsx` (Home/Today), `(tabs)/adventures.tsx` `(tabs)/pets.tsx` `(tabs)/inventory.tsx` `(tabs)/character.tsx` (placeholders).

---

## Task 1: `mobile/` workspace + Expo scaffold

**Files:** Create `mobile/package.json`, `mobile/.npmrc`, `mobile/app.config.ts`, `mobile/babel.config.js`, `mobile/metro.config.js`, `mobile/tsconfig.json`, `mobile/eas.json`; Modify `pnpm-workspace.yaml`.

- [ ] **Step 1: Make `mobile/` a workspace member**

`pnpm-workspace.yaml` currently has only build config (no `packages:`). Add a `packages:` key at the top (keep the existing build keys):
```yaml
packages:
  - 'mobile'
onlyBuiltDependencies:
  - sharp
  - unrs-resolver
ignoredBuiltDependencies:
  - msw
allowBuilds:
  msw: false
  sharp: true
  unrs-resolver: true
```
> Without `packages:`, only the root is a package. Adding `'mobile'` (NOT `'.'`/`'*'`) keeps the web root as-is and adds mobile as a sibling member.

- [ ] **Step 2: `mobile/.npmrc` — hoisted linker (Metro can't follow pnpm symlinks)**
```
node-linker=hoisted
```

- [ ] **Step 3: `mobile/package.json`**
```json
{
  "name": "liferpg-mobile",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "expo-constants": "~17.0.0",
    "expo-linking": "~7.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-haptics": "~14.0.0",
    "expo-font": "~13.0.0",
    "expo-splash-screen": "~0.29.0",
    "expo-status-bar": "~2.0.0",
    "@expo-google-fonts/fredoka": "^0.2.3",
    "@expo-google-fonts/nunito": "^0.2.3",
    "react": "18.3.1",
    "react-native": "0.76.5",
    "react-native-reanimated": "~3.16.0",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.4.0",
    "react-native-gesture-handler": "~2.20.0",
    "@supabase/supabase-js": "^2.106.2",
    "@tanstack/react-query": "^5.62.0",
    "@react-native-async-storage/async-storage": "1.23.1",
    "@react-native-community/netinfo": "11.4.1",
    "nativewind": "^4.1.23",
    "tailwindcss": "^3.4.17",
    "react-native-svg": "15.8.0",
    "lucide-react-native": "^0.460.0"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "@types/react": "~18.3.12",
    "typescript": "~5.3.3"
  }
}
```
> NativeWind v4 pins Tailwind **v3** (the root web app uses Tailwind v4 — separate, fine; isolated by `mobile/`'s own config). Versions target Expo SDK 52 (RN 0.76, React 18). The user can `npx expo install --fix` to align after.

- [ ] **Step 4: `mobile/app.config.ts`** (locked identity)
```ts
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
```

- [ ] **Step 5: `mobile/babel.config.js`** (NativeWind + reanimated; reanimated plugin MUST be last)
```js
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins: ['react-native-reanimated/plugin'],
  }
}
```

- [ ] **Step 6: `mobile/metro.config.js`** (NativeWind + monorepo watch of repo root)
```js
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)
config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
module.exports = withNativeWind(config, { input: './global.css' })
```

- [ ] **Step 7: `mobile/tsconfig.json`**
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts", "nativewind-env.d.ts"]
}
```

- [ ] **Step 8: `mobile/eas.json`**
```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal" },
    "production": {}
  },
  "submit": { "production": {} }
}
```

- [ ] **Step 9: `mobile/nativewind-env.d.ts`**
```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 10 (USER-VERIFIED): install + boot**
```bash
cd /Users/yangweidong/Desktop/life-rpg && pnpm install
cd mobile && npx expo start
```
Expected: Metro starts, QR code shows. (Blank app is fine — screens come later.) If pnpm symlink errors appear, confirm `.npmrc` `node-linker=hoisted` and re-`pnpm install`.

- [ ] **Step 11: Commit**
```bash
gh auth switch -u karlartist7-spec
git add mobile/package.json mobile/.npmrc mobile/app.config.ts mobile/babel.config.js mobile/metro.config.js mobile/tsconfig.json mobile/eas.json mobile/nativewind-env.d.ts pnpm-workspace.yaml
git commit -m "feat(mobile): Expo + Expo Router + NativeWind workspace scaffold"
```

---

## Task 2: Token port — Tailwind config, global.css, theme/tokens.ts, fonts

**Files:** Create `mobile/tailwind.config.js`, `mobile/global.css`, `mobile/theme/tokens.ts`.

- [ ] **Step 1: `mobile/tailwind.config.js`** (Doodle tokens 1:1 from web `app/globals.css`)
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        'doodle-mint': '#83ffc1', 'doodle-pink': '#ff94db', 'doodle-periwinkle': '#8b8bff',
        'doodle-sunshine': '#ffe780', 'doodle-coral': '#ff6b6b', 'doodle-sky': '#a8dcff', 'doodle-lilac': '#e0b8ff',
        paper: '#ffffff', cream: '#fbf7f0', ink: '#000000', 'ink-soft': '#1a1a1a', mute: '#9b9b9b',
        'rarity-rare-bg': '#d6ebff', 'rarity-epic-bg': '#e8c4ff', 'rarity-legendary-bg': '#fff4c4',
      },
      borderRadius: { sm: '8px', md: '16px', lg: '24px', pill: '9999px' },
      fontFamily: { display: ['Fredoka_600SemiBold'], body: ['Nunito_600SemiBold'] },
    },
  },
  plugins: [],
}
```

- [ ] **Step 2: `mobile/global.css`**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: `mobile/theme/tokens.ts`** (TS mirror for non-className use: plate colors, offsets, rarity)
```ts
export const COLORS = {
  mint: '#83ffc1', pink: '#ff94db', periwinkle: '#8b8bff', sunshine: '#ffe780',
  coral: '#ff6b6b', sky: '#a8dcff', lilac: '#e0b8ff',
  paper: '#ffffff', cream: '#fbf7f0', ink: '#000000', inkSoft: '#1a1a1a', mute: '#9b9b9b',
} as const

/** 硬 offset 阴影位移（移植 --shadow-doodle-sm/md/lg/xl）。 */
export const BRUTAL_OFFSET = { sm: 2, md: 4, lg: 6, xl: 8 } as const
export type BrutalSize = keyof typeof BRUTAL_OFFSET

/** 稀有度：背景 + 阴影板（彩色在黑下）。 */
export const RARITY = {
  common: { bg: COLORS.paper, plates: [{ color: COLORS.ink, off: 4 }] },
  rare: { bg: '#d6ebff', plates: [{ color: '#4ba3ff', off: 6 }, { color: COLORS.ink, off: 8.5 }] },
  epic: { bg: '#e8c4ff', plates: [{ color: '#c850ff', off: 7 }, { color: COLORS.ink, off: 9.5 }] },
  legendary: { bg: '#fff4c4', plates: [{ color: '#ffb800', off: 8 }, { color: COLORS.ink, off: 10.5 }] },
} as const
export type Rarity = keyof typeof RARITY
```

- [ ] **Step 4: Commit**
```bash
git add mobile/tailwind.config.js mobile/global.css mobile/theme/tokens.ts
git commit -m "feat(mobile): port Doodle design tokens (tailwind + ts mirror)"
```

---

## Task 3: `<Brutal>` shadow-plate primitive (the load-bearing visual)

**Files:** Create `mobile/components/Brutal.tsx`.

- [ ] **Step 1: Write `Brutal.tsx`** — face + sibling black plate (no native shadow)
```tsx
import { View, type ViewProps } from 'react-native'
import { BRUTAL_OFFSET, COLORS, type BrutalSize } from '@/theme/tokens'

type Plate = { color: string; off: number }

export function Brutal({
  children,
  bg = COLORS.paper,
  radius = 16,
  offset = 'md',
  plates,
  borderColor = COLORS.ink,
  borderWidth = 2,
  style,
  faceStyle,
  ...rest
}: ViewProps & {
  bg?: string
  radius?: number
  offset?: BrutalSize
  plates?: Plate[]            // 覆盖默认单板（稀有度用）
  borderColor?: string
  borderWidth?: number
  faceStyle?: ViewProps['style']
}) {
  const layers: Plate[] = plates ?? [{ color: COLORS.ink, off: BRUTAL_OFFSET[offset] }]
  return (
    <View style={[{ position: 'relative' }, style]} {...rest}>
      {layers.map((p, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute', left: p.off, top: p.off, right: -p.off, bottom: -p.off,
            backgroundColor: p.color, borderRadius: radius,
          }}
        />
      ))}
      <View style={[{ backgroundColor: bg, borderRadius: radius, borderWidth, borderColor, overflow: 'hidden' }, faceStyle]}>
        {children}
      </View>
    </View>
  )
}
```
> The plate is offset by `+off` on left/top and `-off` on right/bottom so it sits down-right of the face, exact CSS `Npx Npx 0 0` equivalent. Face has `overflow:hidden` to clip imagery; the container does NOT clip (so the plate shows).

- [ ] **Step 2 (USER-VERIFIED — critical Android check):** render two `<Brutal>` on a screen, run on **Android** device/emulator. Confirm the black plate is visible down-right (not clipped). If Android clips it, switch the plate to a true sibling at the same tree level as the face wrapper (note in code). iOS should be fine.

- [ ] **Step 3: Commit**
```bash
git add mobile/components/Brutal.tsx
git commit -m "feat(mobile): Brutal shadow-plate primitive (hard offset shadow)"
```

---

## Task 4: Core components + haptics

**Files:** Create `mobile/components/Button.tsx`, `Card.tsx`, `StatTile.tsx`, `ProgressBar.tsx`, `LoadingState.tsx`, `AnimatedNumber.tsx`, `mobile/src/lib/haptics.ts`.

- [ ] **Step 1: `src/lib/haptics.ts`**
```ts
import * as Haptics from 'expo-haptics'
export const tapLight = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
export const tapMedium = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
export const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
```

- [ ] **Step 2: `components/Button.tsx`** (press-into-paper physics + haptic)
```tsx
import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { BRUTAL_OFFSET, COLORS } from '@/theme/tokens'
import { tapLight } from '@/src/lib/haptics'

const BG: Record<string, string> = {
  pink: COLORS.pink, mint: COLORS.mint, sunshine: COLORS.sunshine, sky: COLORS.sky,
  peri: COLORS.periwinkle, coral: COLORS.coral, lilac: COLORS.lilac,
}
const PAPER_TEXT = new Set(['peri', 'coral', 'lilac'])

export function Button({
  label, onPress, variant = 'pink', size = 'default', disabled,
}: { label: string; onPress?: () => void; variant?: keyof typeof BG; size?: 'default' | 'sm'; disabled?: boolean }) {
  const off = BRUTAL_OFFSET.md
  const t = useSharedValue(0) // 0 = rest, 1 = pressed
  const face = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * off }, { translateY: t.value * off }] }))
  const plate = useAnimatedStyle(() => ({ opacity: 1 - t.value }))
  const pad = size === 'sm' ? { paddingVertical: 7, paddingHorizontal: 14 } : { paddingVertical: 12, paddingHorizontal: 24 }
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => { t.value = withSpring(1, { damping: 18, stiffness: 320 }); tapLight() }}
      onPressOut={() => { t.value = withSpring(0, { damping: 12, stiffness: 180 }) }}
      onPress={onPress}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ position: 'relative' }}>
        <Animated.View style={[{ position: 'absolute', left: off, top: off, right: -off, bottom: -off, backgroundColor: COLORS.ink, borderRadius: 9999 }, plate]} />
        <Animated.View style={[{ backgroundColor: BG[variant], borderWidth: 2, borderColor: COLORS.ink, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', ...pad }, face]}>
          <Text style={{ fontFamily: 'Fredoka_600SemiBold', fontSize: size === 'sm' ? 13 : 16, color: PAPER_TEXT.has(variant) ? COLORS.paper : COLORS.ink }}>{label}</Text>
        </Animated.View>
      </View>
    </Pressable>
  )
}
```

- [ ] **Step 3: `components/Card.tsx`**
```tsx
import { type ViewProps } from 'react-native'
import { Brutal } from './Brutal'
import { COLORS } from '@/theme/tokens'
export function Card({ children, bg = COLORS.paper, style, ...rest }: ViewProps & { bg?: string }) {
  return <Brutal bg={bg} radius={24} offset="md" style={style} faceStyle={{ padding: 20 }} {...rest}>{children}</Brutal>
}
```

- [ ] **Step 4: `components/AnimatedNumber.tsx`** (count-up)
```tsx
import { useEffect, useState } from 'react'
import { Text, type TextProps } from 'react-native'
import { useSharedValue, withTiming, useDerivedValue, runOnJS } from 'react-native-reanimated'
export function AnimatedNumber({ value, style }: { value: number; style?: TextProps['style'] }) {
  const sv = useSharedValue(0)
  const [shown, setShown] = useState(0)
  useEffect(() => { sv.value = withTiming(value, { duration: 900 }) }, [value])
  useDerivedValue(() => { runOnJS(setShown)(Math.round(sv.value)) })
  return <Text style={[{ fontFamily: 'Fredoka_600SemiBold', fontVariant: ['tabular-nums'] }, style]}>{shown}</Text>
}
```

- [ ] **Step 5: `components/StatTile.tsx`**
```tsx
import { View, Text } from 'react-native'
import { Brutal } from './Brutal'
import { AnimatedNumber } from './AnimatedNumber'
import { COLORS } from '@/theme/tokens'
const BG: Record<string, { bg: string; paper?: boolean }> = {
  mint: { bg: COLORS.mint }, sky: { bg: COLORS.sky }, coral: { bg: COLORS.coral, paper: true },
  sunshine: { bg: COLORS.sunshine }, periwinkle: { bg: COLORS.periwinkle, paper: true }, paper: { bg: COLORS.paper },
}
export function StatTile({ color = 'paper', label, value, sub }: { color?: keyof typeof BG; label: string; value: number; sub?: string }) {
  const c = BG[color]; const fg = c.paper ? COLORS.paper : COLORS.ink
  return (
    <Brutal bg={c.bg} radius={16} offset="md" faceStyle={{ padding: 16 }}>
      <AnimatedNumber value={value} style={{ fontSize: 28, color: fg }} />
      <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: fg, marginTop: 2 }}>{label}</Text>
      {sub ? <Text style={{ fontSize: 11, color: fg, opacity: 0.8 }}>{sub}</Text> : null}
    </Brutal>
  )
}
```

- [ ] **Step 6: `components/ProgressBar.tsx`**
```tsx
import { View } from 'react-native'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { COLORS } from '@/theme/tokens'
export function ProgressBar({ pct, fill = COLORS.mint, height = 14 }: { pct: number; fill?: string; height?: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const style = useAnimatedStyle(() => ({ width: withTiming(`${clamped}%`, { duration: 700 }) }))
  return (
    <View style={{ height, borderWidth: 2, borderColor: COLORS.ink, borderRadius: 9999, backgroundColor: COLORS.paper, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', backgroundColor: fill, borderRadius: 9999 }, style]} />
    </View>
  )
}
```

- [ ] **Step 7: `components/LoadingState.tsx`**
```tsx
import { View, Text } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { useEffect } from 'react'
import { Compass } from 'lucide-react-native'
import { COLORS } from '@/theme/tokens'
export function LoadingState({ label = '加载中…' }: { label?: string }) {
  const r = useSharedValue(0)
  useEffect(() => { r.value = withRepeat(withTiming(360, { duration: 1200, easing: Easing.linear }), -1) }, [])
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }))
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
      <Animated.View style={s}><Compass size={44} color={COLORS.periwinkle} strokeWidth={2.5} /></Animated.View>
      <Text style={{ fontFamily: 'Fredoka_600SemiBold', color: COLORS.mute, marginTop: 14 }}>{label}</Text>
    </View>
  )
}
```

- [ ] **Step 8: Commit**
```bash
git add mobile/components/Button.tsx mobile/components/Card.tsx mobile/components/StatTile.tsx mobile/components/ProgressBar.tsx mobile/components/LoadingState.tsx mobile/components/AnimatedNumber.tsx mobile/src/lib/haptics.ts
git commit -m "feat(mobile): core component kit (Button/Card/StatTile/ProgressBar/Loading/AnimatedNumber)"
```

---

## Task 5: Supabase client + chunked SecureStore + AppState refresh

**Files:** Create `mobile/src/lib/env.ts`, `mobile/src/lib/secure-store-adapter.ts`, `mobile/src/lib/supabase.ts`.

- [ ] **Step 1: `src/lib/env.ts`**
```ts
import Constants from 'expo-constants'
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>
export const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL!
export const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
export const API_BASE_URL = extra.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL!
```

- [ ] **Step 2: `src/lib/secure-store-adapter.ts`** (chunk to beat the ~2KB Keychain limit)
```ts
import * as SecureStore from 'expo-secure-store'
const CHUNK = 1800
export const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key)
    if (head === null) return null
    if (!head.startsWith('__chunks__:')) return head
    const n = parseInt(head.split(':')[1], 10)
    let out = ''
    for (let i = 0; i < n; i++) out += (await SecureStore.getItemAsync(`${key}__${i}`)) ?? ''
    return out
  },
  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK) { await SecureStore.setItemAsync(key, value); return }
    const n = Math.ceil(value.length / CHUNK)
    await SecureStore.setItemAsync(key, `__chunks__:${n}`)
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${key}__${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK))
  },
  async removeItem(key: string): Promise<void> {
    const head = await SecureStore.getItemAsync(key)
    if (head?.startsWith('__chunks__:')) {
      const n = parseInt(head.split(':')[1], 10)
      for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}__${i}`)
    }
    await SecureStore.deleteItemAsync(key)
  },
}
```

- [ ] **Step 3: `src/lib/supabase.ts`** (+ AppState autoRefresh)
```ts
import 'react-native-url-polyfill/auto'
import { AppState } from 'react-native'
import { createClient } from '@supabase/supabase-js'
import { ChunkedSecureStore } from './secure-store-adapter'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ChunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

AppState.addEventListener('change', (s) => {
  if (s === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})
```
> `react-native-url-polyfill` is pulled in by `@supabase/supabase-js` for RN; if Metro complains it's missing, `npx expo install react-native-url-polyfill`.

- [ ] **Step 4: Commit**
```bash
git add mobile/src/lib/env.ts mobile/src/lib/secure-store-adapter.ts mobile/src/lib/supabase.ts
git commit -m "feat(mobile): supabase client + chunked SecureStore + AppState refresh"
```

---

## Task 6: API client (Bearer + 401 retry) + React Query

**Files:** Create `mobile/src/lib/api-client.ts`, `mobile/src/lib/query-client.ts`.

- [ ] **Step 1: `src/lib/api-client.ts`**
```ts
import { supabase } from './supabase'
import { API_BASE_URL } from './env'

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`
  const doFetch = async () =>
    fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(await authHeader()), ...(init.headers || {}) } })

  let res = await doFetch()
  if (res.status === 401) {
    const { error } = await supabase.auth.refreshSession()
    if (!error) res = await doFetch()
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`)
  return res.json() as Promise<T>
}
```

- [ ] **Step 2: `src/lib/query-client.ts`**
```ts
import { QueryClient } from '@tanstack/react-query'
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})
```
> Phase 1 keeps it lean. The AsyncStorage persister + NetInfo onlineManager from the spec land in Phase 2.

- [ ] **Step 3: Commit**
```bash
git add mobile/src/lib/api-client.ts mobile/src/lib/query-client.ts
git commit -m "feat(mobile): bearer api client (401 refresh-retry) + react-query"
```

---

## Task 7: BACKEND — `getRouteUser` + CORS helpers (I VERIFY)

**Files:** Create `lib/supabase/route-auth.ts`, `lib/http/cors.ts`.

- [ ] **Step 1: `lib/supabase/route-auth.ts`**
```ts
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * 解析请求用户：优先 Authorization: Bearer <supabase JWT>（原生 App），
 * 否则回退 cookie session（Web）。返回的 supabase client 都带该用户身份，RLS 等价。
 */
export async function getRouteUser(
  req: Request
): Promise<{ supabase: SupabaseClient; user: User | null }> {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7)
    const supabase = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await supabase.auth.getUser(token)
    return { supabase, user: data.user ?? null }
  }
  // cookie 回退（与 lib/supabase/server.ts 一致）
  const cookieStore = await cookies()
  const supabase = createServerClient(URL, ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
      },
    },
  })
  const { data } = await supabase.auth.getUser()
  return { supabase, user: data.user ?? null }
}
```

- [ ] **Step 2: `lib/http/cors.ts`**
```ts
import { NextResponse } from 'next/server'

function allowOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? ''
  const list = (process.env.NATIVE_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  // 原生 fetch 无 Origin → 回退 '*'（无凭据，安全）；Web 同源不发 Origin 也不需要 CORS。
  if (!origin) return '*'
  return list.includes(origin) ? origin : list[0] ?? '*'
}

export function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowOrigin(req),
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
  }
}

/** OPTIONS 预检。 */
export function preflight(req: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

/** 给一个 NextResponse 附上 CORS 头并返回它。 */
export function withCors(req: Request, res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v)
  return res
}
```

- [ ] **Step 3: Typecheck via root build**
```bash
cd /Users/yangweidong/Desktop/life-rpg
set -a; . ./.env.local 2>/dev/null; set +a
pnpm build 2>&1 | tail -3   # retry on next/font network flake
```
Expected: build succeeds (no type errors from the new files; they're not imported yet).

- [ ] **Step 4: Commit**
```bash
git add lib/supabase/route-auth.ts lib/http/cors.ts
git commit -m "feat(api): getRouteUser (bearer-or-cookie) + cors helpers"
```

---

## Task 8: BACKEND — wire `/api/dashboard` to Bearer + CORS (I VERIFY)

**Files:** Modify `app/api/dashboard/route.ts`.

- [ ] **Step 1: Swap auth preamble + add OPTIONS + wrap response**

Change the imports + handler signature. Current (line 16): `import { createClient as createSrv } from '@/lib/supabase/server'`. Add:
```ts
import { getRouteUser } from '@/lib/supabase/route-auth'
import { preflight, withCors } from '@/lib/http/cors'
```
Change `export async function GET() {` to `export async function GET(req: Request) {`, and replace the first two lines of the body:
```ts
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })
```
with:
```ts
  const { supabase: supa, user } = await getRouteUser(req)
  if (!user) return withCors(req, new NextResponse('unauthorized', { status: 401 }))
```
At the very end, change the final `return NextResponse.json({ ... })` to capture + wrap:
```ts
  return withCors(req, NextResponse.json({
    /* ...existing payload unchanged... */
  }))
```
Add an OPTIONS handler at the bottom of the file:
```ts
export function OPTIONS(req: Request) {
  return preflight(req)
}
```
> Keep the `createSrv` import ONLY if still referenced elsewhere in the file; if not, remove it. All `supa.from(...)` queries are unchanged — `getRouteUser` returns a `supabase` client bound to the same user.

- [ ] **Step 2 (I VERIFY): build + unauth 401 + web cookie path intact**
```bash
cd /Users/yangweidong/Desktop/life-rpg
set -a; . ./.env.local 2>/dev/null; set +a
pnpm build 2>&1 | tail -3
# dev server (if not running): pnpm dev & then:
curl -s --noproxy '*' -o /dev/null -w "no-auth -> %{http_code}\n" --max-time 15 http://127.0.0.1:3000/api/dashboard
curl -s --noproxy '*' -o /dev/null -w "OPTIONS -> %{http_code}\n" -X OPTIONS --max-time 15 http://127.0.0.1:3000/api/dashboard
curl -s --noproxy '*' -o /dev/null -w "bad-bearer -> %{http_code}\n" -H "authorization: Bearer not-a-jwt" --max-time 15 http://127.0.0.1:3000/api/dashboard
```
Expected: build OK; `no-auth -> 401`; `OPTIONS -> 204`; `bad-bearer -> 401`. (A valid-JWT 200 is verified from the device in Task 11 since minting a user JWT here needs the test user's password.)

- [ ] **Step 3 (I VERIFY): web regression** — load the deployed/local web `/dashboard` logged in (cookie path) and confirm it still returns data. Code-review: cookie branch of `getRouteUser` mirrors the old `lib/supabase/server.ts` exactly.

- [ ] **Step 4: Commit**
```bash
git add app/api/dashboard/route.ts
git commit -m "feat(api): /api/dashboard accepts bearer token + CORS (web cookie path intact)"
```

---

## Task 9: Login screen

**Files:** Create `mobile/app/_layout.tsx`, `mobile/app/index.tsx`, `mobile/app/login.tsx`.

- [ ] **Step 1: `app/_layout.tsx`** (fonts + splash + providers + Stack)
```tsx
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
```

- [ ] **Step 2: `app/index.tsx`** (auth gate → login or tabs)
```tsx
import { useEffect, useState } from 'react'
import { Redirect } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { LoadingState } from '@/components/LoadingState'
export default function Index() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s))
    return () => sub.subscription.unsubscribe()
  }, [])
  if (authed === null) return <LoadingState label="启动中…" />
  return <Redirect href={authed ? '/(tabs)' : '/login'} />
}
```

- [ ] **Step 3: `app/login.tsx`** (invite-only — no signup)
```tsx
import { useState } from 'react'
import { View, Text, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { COLORS } from '@/theme/tokens'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  async function submit() {
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    setBusy(false)
    if (error) { setErr(error.message); return }
    router.replace('/(tabs)')
  }
  const input = { borderWidth: 2, borderColor: COLORS.ink, borderRadius: 16, padding: 12, fontSize: 16, backgroundColor: COLORS.paper, marginTop: 6 }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Card>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 28 }}>欢迎回来</Text>
        <Text style={{ color: COLORS.inkSoft, marginTop: 4 }}>Life RPG · 私有 beta</Text>
        <TextInput style={input} placeholder="your@email.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!busy} />
        <TextInput style={input} placeholder="密码" secureTextEntry value={pw} onChangeText={setPw} editable={!busy} />
        <View style={{ height: 16 }} />
        <Button label={busy ? '登录中…' : '登录'} variant="sunshine" onPress={submit} disabled={busy} />
        {err ? <Text style={{ color: COLORS.coral, marginTop: 10 }}>出错了：{err}</Text> : null}
        <Text style={{ color: COLORS.mute, fontSize: 12, marginTop: 14, textAlign: 'center' }}>没有账号？联系管理员</Text>
      </Card>
    </KeyboardAvoidingView>
  )
}
```

- [ ] **Step 4 (USER-VERIFIED):** `npx expo start`, open app → login screen renders, log in with a real Supabase user → redirects to tabs. Kill+reopen the app → still logged in (SecureStore persistence).

- [ ] **Step 5: Commit**
```bash
git add mobile/app/_layout.tsx mobile/app/index.tsx mobile/app/login.tsx
git commit -m "feat(mobile): root layout (fonts/providers) + auth gate + invite-only login"
```

---

## Task 10: 5-tab Brutal bottom navigation

**Files:** Create `mobile/app/(tabs)/_layout.tsx`, and placeholder `mobile/app/(tabs)/adventures.tsx`, `pets.tsx`, `inventory.tsx`, `character.tsx`.

- [ ] **Step 1: `app/(tabs)/_layout.tsx`** (custom Brutal tab bar, periwinkle active pill)
```tsx
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
```

- [ ] **Step 2: placeholder screens** — create `adventures.tsx`, `pets.tsx`, `inventory.tsx`, `character.tsx`, each:
```tsx
import { View, Text } from 'react-native'
export default function Screen() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: 'Fredoka_600SemiBold', color: '#9b9b9b' }}>即将上线</Text></View>
}
```
(Change the visible label per file; Phase 2 fills them.)

- [ ] **Step 3 (USER-VERIFIED):** tabs render, 5 icons, active = periwinkle pill, tapping switches + Medium haptic.

- [ ] **Step 4: Commit**
```bash
git add "mobile/app/(tabs)"
git commit -m "feat(mobile): 5-tab Brutal bottom navigation"
```

---

## Task 11: Home / Today screen (live `/api/dashboard`)

**Files:** Create `mobile/app/(tabs)/index.tsx`, `mobile/src/lib/types.ts`.

- [ ] **Step 1: `src/lib/types.ts`** (subset of the dashboard payload used in Phase 1)
```ts
export type Dashboard = {
  character: { name: string; level: number; exp: number; next_level_exp: number; exp_to_next: number } | null
  today_snapshot: { recovery_score: number | null; sleep_minutes: number | null; strain: number | null; streak: number }
  today_stamina: { stamina: number; tier_label: string; stamina_pct: number } | null
  attributes: { hp_current: number; hp_max: number } | null
}
```

- [ ] **Step 2: `app/(tabs)/index.tsx`** (hero + vitals grid + stamina, pull-to-refresh)
```tsx
import { ScrollView, View, Text, RefreshControl } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/src/lib/api-client'
import type { Dashboard } from '@/src/lib/types'
import { Card } from '@/components/Card'
import { StatTile } from '@/components/StatTile'
import { ProgressBar } from '@/components/ProgressBar'
import { LoadingState } from '@/components/LoadingState'
import { COLORS } from '@/theme/tokens'

export default function Home() {
  const insets = useSafeAreaInsets()
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'], queryFn: () => apiFetch<Dashboard>('/api/dashboard'),
  })
  if (isLoading) return <LoadingState label="加载首页…" />
  const c = data?.character; const t = data?.today_snapshot; const stam = data?.today_stamina
  const expPct = c ? (c.exp / Math.max(c.next_level_exp, 1)) * 100 : 0
  const sleepH = t?.sleep_minutes != null ? (t.sleep_minutes / 60).toFixed(1) : '–'
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, gap: 16 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.periwinkle} />}
    >
      {/* 角色 hero */}
      <Card bg={COLORS.periwinkle}>
        <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 26, color: COLORS.paper }}>{c?.name ?? 'Hermes'}</Text>
        <Text style={{ fontFamily: 'Fredoka_600SemiBold', color: COLORS.paper, marginTop: 2 }}>Lv.{c?.level ?? 1}</Text>
        <View style={{ height: 10 }} />
        <ProgressBar pct={expPct} fill={COLORS.sunshine} />
        <Text style={{ color: COLORS.paper, fontSize: 12, marginTop: 4 }}>EXP {c?.exp ?? 0} / {c?.next_level_exp ?? 1000}</Text>
      </Card>

      {/* 今日体力 */}
      {stam && (
        <Card bg={COLORS.mint}>
          <Text style={{ fontFamily: 'Fredoka_600SemiBold', fontSize: 14 }}>今日体力 · {stam.tier_label}</Text>
          <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 32 }}>{stam.stamina}</Text>
          <ProgressBar pct={stam.stamina_pct} fill={COLORS.coral} />
        </Card>
      )}

      {/* Vitals 2x2 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ width: '47%' }}><StatTile color="mint" label="恢复" value={Math.round(t?.recovery_score ?? 0)} sub="Recovery" /></View>
        <View style={{ width: '47%' }}><StatTile color="sky" label="睡眠(h)" value={Number(sleepH) || 0} sub={`${sleepH}h`} /></View>
        <View style={{ width: '47%' }}><StatTile color="coral" label="负荷" value={Math.round(t?.strain ?? 0)} sub="Strain" /></View>
        <View style={{ width: '47%' }}><StatTile color="sunshine" label="连击" value={t?.streak ?? 0} sub="天" /></View>
      </View>
    </ScrollView>
  )
}
```

- [ ] **Step 3 (USER-VERIFIED — the Phase 1 acceptance test):**
  1. Set `mobile/.env` (or shell): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (from root `.env.local`), `EXPO_PUBLIC_API_BASE_URL=https://life-rpg-steel.vercel.app` (prod) — note the deployed dashboard route must have Task 8 shipped.
  2. `cd mobile && npx expo start`, open on device, log in.
  3. **Home shows live stats** (level, EXP bar, today stamina, recovery/sleep/strain/streak) — proving Bearer → `/api/dashboard` → live data end to end.
  4. Pull-to-refresh re-fetches. Kill+reopen → still logged in, data loads.

- [ ] **Step 4: Commit**
```bash
git add "mobile/app/(tabs)/index.tsx" mobile/src/lib/types.ts
git commit -m "feat(mobile): Home/Today screen reading live /api/dashboard (vertical slice complete)"
```

---

## Task 12: Phase 1 wrap — docs + deploy backend

**Files:** Create `mobile/README.md`.

- [ ] **Step 1: `mobile/README.md`** — prerequisites (Expo account, Xcode/Android Studio or EAS), env vars, `pnpm install` at root then `cd mobile && npx expo start`, dev-client note, and the Android Brutal-plate caveat to watch.

- [ ] **Step 2 (I VERIFY): deploy the backend changes** so the device can hit a live Bearer dashboard:
```bash
cd /Users/yangweidong/Desktop/life-rpg
gh auth switch -u karlartist7-spec
git push origin main
# Vercel auto-deploys; or trigger: vercel deploy --prod --yes --scope karlartist7-4094s-projects --token <VERCEL_TOKEN>
# verify live: curl --noproxy '*' -o /dev/null -w "%{http_code}" https://life-rpg-steel.vercel.app/api/dashboard  (expect 401)
```

- [ ] **Step 3: Commit**
```bash
git add mobile/README.md
git commit -m "docs(mobile): phase 1 run instructions + prerequisites"
```

---

## Self-Review

**Spec coverage (Phase 1 scope only):**
- Workspace + Expo scaffold (spec Phase 1 bullet 1) → Task 1. ✓
- Token port + fonts (bullet 2) → Task 2 + Task 9 Step 1. ✓
- Brutal primitive + core components + haptics (bullet 3) → Tasks 3–4. ✓
- supabase + chunked SecureStore + AppState + api-client + query-client (bullet 4) → Tasks 5–6. ✓
- Backend `route-auth` + `cors` + ONLY `/api/dashboard` edited + web-intact + token-discrimination check (bullet 5) → Tasks 7–8. ✓
- login + 5-tab nav + live Home + device run (bullet 6) → Tasks 9–11. ✓
- Realtime/push/WHOOP/health/EAS-release are explicitly NOT in Phase 1 (later phases). ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. "即将上线" in placeholder tab screens is intended product copy, not a plan placeholder. ✓

**Type consistency:** `getRouteUser → { supabase, user }` used identically in Task 8; `apiFetch<T>(path)` used in Task 11; `Dashboard` type matches the fields `/api/dashboard` returns (`character.{level,exp,next_level_exp,exp_to_next}`, `today_snapshot`, `today_stamina.{stamina,tier_label,stamina_pct}`); `BRUTAL_OFFSET`/`COLORS`/`RARITY` from `theme/tokens.ts` used consistently; `Button` variant keys (pink/mint/sunshine/sky/peri/coral/lilac) consistent. ✓

**Known caveat (flagged, not a defect):** Expo dep versions target SDK 52; the user may need `npx expo install --fix` to align exact patch versions for their installed SDK. The Android `overflow:visible` plate-clipping risk is verified at Task 3 Step 2 before more is built on `<Brutal>`.
