import { View } from 'react-native'
import { Compass } from 'lucide-react-native'
import { EmptyState } from '@/components/EmptyState'
import { COLORS } from '@/theme/tokens'
export default function Screen() {
  return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><EmptyState Icon={Compass} title="冒险" subtitle="即将上线" /></View>
}
