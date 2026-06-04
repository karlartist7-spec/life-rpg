import { RefreshControl, View } from 'react-native'
import Animated, { FadeInDown, useAnimatedRef, useScrollViewOffset } from 'react-native-reanimated'
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
import { CollapsibleHeader } from '@/components/home/CollapsibleHeader'
import { LevelUpCelebration } from '@/components/home/LevelUpCelebration'
import { COLORS } from '@/theme/tokens'

const Section = ({ index, children }: { index: number; children: React.ReactNode }) => (
  <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(16)}>{children}</Animated.View>
)

export default function Home() {
  const insets = useSafeAreaInsets()
  const ref = useAnimatedRef<Animated.ScrollView>()
  const scrollY = useScrollViewOffset(ref)
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'], queryFn: () => apiFetch<Dashboard>('/api/dashboard'),
  })

  if (isLoading) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><LoadingState label="加载首页…" /></View>
  if (!data) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><EmptyState Icon={Sparkles} title="暂无数据" subtitle="下拉刷新试试" /></View>

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <CollapsibleHeader scrollY={scrollY} character={data.character} connections={data.connections} />
      <Animated.ScrollView
        ref={ref}
        scrollEventThrottle={16}
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 24, gap: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.periwinkle} />}
      >
        <Section index={0}><RecoveryHero character={data.character} attributes={data.attributes} recoveryScore={data.today_snapshot.recovery_score} /></Section>
        {data.today_stamina ? <Section index={1}><StaminaBand stamina={data.today_stamina} /></Section> : null}
        <Section index={2}><VitalsGrid today={data.today_snapshot} /></Section>
        <Section index={3}><QuestSummary quests={data.quests} /></Section>
        <Section index={4}><AdventureCarousel adventures={data.adventure_log} /></Section>
      </Animated.ScrollView>
      <LevelUpCelebration level={data.character?.level ?? null} />
    </View>
  )
}
