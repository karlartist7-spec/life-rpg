import { View, type ViewProps } from 'react-native'

/** Full-bleed tinted "world" surface — replaces the flat cream root View on each screen. */
export function Stage({ tint, children, style, ...rest }: ViewProps & { tint: string }) {
  return (
    <View style={[{ flex: 1, backgroundColor: tint }, style]} {...rest}>
      {children}
    </View>
  )
}
