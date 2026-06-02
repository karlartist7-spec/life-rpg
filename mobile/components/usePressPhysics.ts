import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { BRUTAL_OFFSET, type BrutalSize } from '@/theme/tokens'
import { tapLight } from '@/src/lib/haptics'

/**
 * The "砸进纸面" press physics shared by every interactive Brutal surface:
 * on press the face springs toward the shadow plate (+offset) and the plate
 * fades out; on release it springs back with overshoot. Returns animated
 * styles for the face and the plate, plus press handlers.
 */
export function usePressPhysics(size: BrutalSize = 'md', opts?: { haptic?: boolean }) {
  const off = BRUTAL_OFFSET[size]
  const t = useSharedValue(0) // 0 = rest, 1 = pressed
  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * off }, { translateY: t.value * off }],
  }))
  const plateStyle = useAnimatedStyle(() => ({ opacity: 1 - t.value }))
  const onPressIn = () => {
    t.value = withSpring(1, { damping: 18, stiffness: 320 })
    if (opts?.haptic !== false) tapLight()
  }
  const onPressOut = () => {
    t.value = withSpring(0, { damping: 12, stiffness: 180 })
  }
  return { off, faceStyle, plateStyle, onPressIn, onPressOut }
}
