import { RefreshControl, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react-native'
import { apiFetch } from '@/src/lib/api-client'
import type { Dashboard } from '@/src/lib/types'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { RecoveryHero } from '@/components/home/RecoveryHero'
import { StaminaBand } from '@/components/home/StaminaBand'
import { VitalsGrid } from '@/components/home/VitalsGrid'
import { QuestSummary } from '@/components/home/QuestSummary'
import { AdventureCarousel } from '@/components/home/AdventureCarousel'
import { LevelUpCelebration } from '@/components/home/LevelUpCelebration'
import { COLORS } from '@/theme/tokens'
import { Stage } from '@/components/Stage'
import { SCREEN_TINT, GAME_HUD_HEIGHT } from '@/theme/game'

const Section = ({ index, children }: { index: number; children: React.ReactNode }) => (
  <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(16)}>{children}</Animated.View>
)

export default function Home() {
  const insets = useSafeAreaInsets()
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'], queryFn: () => apiFetch<Dashboard>('/api/dashboard'),
  })

  if (isLoading) return <Stage tint={SCREEN_TINT.home}><LoadingState label="加载首页…" /></Stage>
  if (!data) return <Stage tint={SCREEN_TINT.home}><EmptyState Icon={Sparkles} title="暂无数据" subtitle="下拉刷新试试" /></Stage>

  return (
    <Stage tint={SCREEN_TINT.home}>
      <Animated.ScrollView
        scrollEventThrottle={16}
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + GAME_HUD_HEIGHT + 8, paddingBottom: 24, gap: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.periwinkle} />}
      >
        <Section index={0}><RecoveryHero character={data.character} attributes={data.attributes} recoveryScore={data.today_snapshot.recovery_score} /></Section>
        {data.today_stamina ? <Section index={1}><StaminaBand stamina={data.today_stamina} /></Section> : null}
        <Section index={2}><VitalsGrid today={data.today_snapshot} /></Section>
        <Section index={3}><QuestSummary quests={data.quests} /></Section>
        <Section index={4}><AdventureCarousel adventures={data.adventure_log} /></Section>
      </Animated.ScrollView>
      <LevelUpCelebration level={data.character?.level ?? null} />
    </Stage>
  )
}
