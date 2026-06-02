import { useEffect, useRef, useState } from 'react'
import { View, Dimensions } from 'react-native'
import ConfettiCannon from 'react-native-confetti-cannon'
import { COLORS } from '@/theme/tokens'
import { success } from '@/src/lib/haptics'

const CANDY = [COLORS.mint, COLORS.pink, COLORS.periwinkle, COLORS.sunshine, COLORS.coral, COLORS.sky, COLORS.lilac]

export function LevelUpCelebration({ level }: { level: number | null }) {
  const prev = useRef<number | null>(null)
  const [burst, setBurst] = useState(0)
  useEffect(() => {
    if (level == null) return
    if (prev.current != null && level > prev.current) {
      success()
      setBurst((n) => n + 1)
    }
    prev.current = level
  }, [level])
  if (burst === 0) return null
  const { width } = Dimensions.get('window')
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
      <ConfettiCannon
        key={burst}
        count={90}
        origin={{ x: width / 2, y: 0 }}
        autoStart
        fadeOut
        explosionSpeed={350}
        fallSpeed={2600}
        colors={CANDY}
      />
    </View>
  )
}
