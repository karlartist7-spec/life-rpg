# Life RPG — Mobile (Expo)

The native iOS/Android client for Life RPG. Built with Expo (SDK 52) + Expo Router +
NativeWind v4 + Supabase auth. Phase 1 is a thin vertical slice: invite-only login →
a live Home/Today screen that reads `/api/dashboard` over a Bearer token.

> This is a **standalone** project. It has its own `node_modules` and its own install —
> it is **not** installed via the repo-root pnpm workspace. Run `pnpm install` from
> inside `mobile/`, not from the repo root.

## Prerequisites

- **Node 18+** and **pnpm**.
- An **Expo account** (`npx expo login`) — needed for dev builds / EAS.
- A device or simulator. Either:
  - **iOS:** Xcode + an iOS Simulator (macOS only), or
  - **Android:** Android Studio + an emulator (or a physical device), or
  - the **Expo Go** app on a physical device for quick JS-only checks, or
  - **EAS Build** (`npx eas build`) if you want a hosted dev/preview build instead of local toolchains.

## Environment variables

The app reads three public env vars (exposed to the client, so the `EXPO_PUBLIC_` prefix is required).
Create `mobile/.env` (or export them in your shell before `npx expo start`):

```
EXPO_PUBLIC_SUPABASE_URL=...          # same value as NEXT_PUBLIC_SUPABASE_URL in root .env.local
EXPO_PUBLIC_SUPABASE_ANON_KEY=...     # same value as NEXT_PUBLIC_SUPABASE_ANON_KEY in root .env.local
EXPO_PUBLIC_API_BASE_URL=https://life-rpg-steel.vercel.app
```

- Copy `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from the repo-root `.env.local`.
- `EXPO_PUBLIC_API_BASE_URL` points at the deployed backend (the `/api/dashboard` route must accept a
  `Authorization: Bearer <supabase JWT>` — shipped in the backend Bearer + CORS change).

These are wired into `app.config.ts` → `extra` and read back in `src/lib/env.ts`.

## Running

```bash
cd mobile
pnpm install
npx expo start
```

Then press `i` (iOS simulator), `a` (Android emulator), or scan the QR code with a device.

- Need a **dev client** (anything beyond Expo Go, e.g. native modules): build one with
  `npx eas build --profile development` and run `npx expo start --dev-client`.
- If Expo complains about dependency versions for your installed SDK, run `npx expo install --fix`.
- If Metro reports a missing `react-native-url-polyfill` (pulled in by `@supabase/supabase-js`),
  run `npx expo install react-native-url-polyfill`.

## Phase 1 acceptance test

Run on a real device or simulator with the env vars above set:

1. Launch the app → the **invite-only login** screen renders (no signup).
2. Log in with a real Supabase user (email + password). On success you land on the tabbed UI.
3. The **Home/Today** tab shows **live stats** — character name + level, the EXP bar, today's
   stamina, and the recovery / sleep / strain / streak tiles. This proves the full seam:
   Supabase session → `Authorization: Bearer` → `/api/dashboard` → live data on screen.
4. **Pull-to-refresh** on Home re-fetches the dashboard.
5. **Kill and reopen** the app → you are still logged in (session persisted in chunked SecureStore)
   and Home loads again.

## Known caveat — verify on Android

The Brutal "hard offset shadow" is a real sibling black plate behind each card's face (see
`components/Brutal.tsx`), not a native shadow. The container relies on **`overflow: visible`**
so the down-right black plate shows past the face. iOS renders this fine; **on Android, confirm
the black plate is actually visible** (down-right of each `<Brutal>` card) and not clipped. If
Android clips it, move the plate to a true sibling at the same tree level as the face wrapper.
