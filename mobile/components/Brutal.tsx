import { View, type ViewProps } from 'react-native'
import { BRUTAL_OFFSET, COLORS, type BrutalSize } from '@/theme/tokens'

type Plate = { color: string; off: number }

// NOTE (USER-VERIFIED on Android): the black shadow-plate is an absolutely-positioned
// sibling that overflows the container down-right (right/bottom: -off). The container
// must NOT clip (no overflow:hidden here — only the face clips). On Android, parent
// overflow defaults can clip absolutely-positioned children that exceed bounds; verify
// on a real Android device/emulator that the plate is visible down-right. If clipped,
// promote the plate to a true sibling at the same tree level as the face wrapper.
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
