import { type ViewProps } from 'react-native'
import { Brutal } from './Brutal'
import { COLORS } from '@/theme/tokens'
export function Card({ children, bg = COLORS.paper, style, ...rest }: ViewProps & { bg?: string }) {
  return <Brutal bg={bg} radius={24} offset="md" style={style} faceStyle={{ padding: 20 }} {...rest}>{children}</Brutal>
}
