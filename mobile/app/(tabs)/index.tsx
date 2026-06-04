import { RefreshControl, View, useWindowDimensions } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sparkles } from 'lucide-react-native'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { Stage } from '@/components/Stage'
import { HeroStage } from '@/components/home/HeroStage'
import { VitalsGrid } from '@/components/home/VitalsGrid'
import { QuestSummary } from '@/components/home/QuestSummary'
import { AdventureCarousel } from '@/components/home/AdventureCarousel'
import { LevelUpCelebration } from '@/components/home/LevelUpCelebration'
import { useDashboard } from '@/src/lib/use-dashboard'
import { COLORS } from '@/theme/tokens'
import { SCREEN_TINT, GAME_HUD_HEIGHT } from '@/theme/game'

const Section = ({ index, children }: { index: number; children: React.ReactNode }) => (
  <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(16)}>{children}</Animated.View>
)

export default function Home() {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const { data, isLoading, refetch, isRefetching } = useDashboard()

  if (isLoading) return <Stage tint={SCREEN_TINT.home}><LoadingState label="加载首页…" /></Stage>
  if (!data) return <Stage tint={SCREEN_TINT.home}><EmptyState Icon={Sparkles} title="暂无数据" subtitle="下拉刷新试试" /></Stage>

  const topPad = insets.top + GAME_HUD_HEIGHT
  const heroMin = height - topPad - 80 // leave room so the data panels peek below

  return (
    <Stage tint={SCREEN_TINT.home}>
      <Animated.ScrollView contentContainerStyle={{ paddingBottom: 28 }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.ink} />}>
        <HeroStage
          character={data.character}
          attributes={data.attributes}
          recoveryScore={data.today_snapshot.recovery_score}
          stamina={data.today_stamina}
          minHeight={heroMin}
          topPad={topPad}
        />
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 16 }}>
          <Section index={0}><QuestSummary quests={data.quests} /></Section>
          <Section index={1}><VitalsGrid today={data.today_snapshot} /></Section>
          <Section index={2}><AdventureCarousel adventures={data.adventure_log} /></Section>
        </View>
      </Animated.ScrollView>
      <LevelUpCelebration level={data.character?.level ?? null} />
    </Stage>
  )
}
