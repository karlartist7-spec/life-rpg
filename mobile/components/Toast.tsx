import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { View, Text } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Brutal } from './Brutal'
import { COLORS } from '@/theme/tokens'

type Tone = 'error' | 'success' | 'info' | 'celebrate'
type ToastState = { id: number; message: string; tone: Tone }
type Ctx = { show: (t: { message: string; tone?: Tone }) => void }

const ToastCtx = createContext<Ctx | null>(null)
export function useToast(): Ctx {
  const c = useContext(ToastCtx)
  if (!c) throw new Error('useToast must be used within ToastProvider')
  return c
}

const TONE: Record<Tone, { bg: string; fg: string }> = {
  error: { bg: COLORS.coral, fg: COLORS.paper },
  success: { bg: COLORS.mint, fg: COLORS.ink },
  info: { bg: COLORS.paper, fg: COLORS.ink },
  celebrate: { bg: COLORS.pink, fg: COLORS.ink },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idRef = useRef(0)

  const show = useCallback((t: { message: string; tone?: Tone }) => {
    idRef.current += 1
    setToast({ id: idRef.current, message: t.message, tone: t.tone ?? 'info' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.springify().damping(16)}
          exiting={FadeOutDown}
          pointerEvents="none"
          style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 76, zIndex: 100 }}
        >
          <Brutal bg={TONE[toast.tone].bg} radius={16} offset="md" faceStyle={{ paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 13, color: TONE[toast.tone].fg, textAlign: 'center' }}>{toast.message}</Text>
          </Brutal>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  )
}
