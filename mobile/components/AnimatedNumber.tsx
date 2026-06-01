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
