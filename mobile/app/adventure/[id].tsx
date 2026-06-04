import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Lock } from 'lucide-react-native'
import { Brutal } from '@/components/Brutal'
import { RarityBadge } from '@/components/RarityBadge'
import { LoadingState } from '@/components/LoadingState'
import { useAdventure } from '@/src/lib/use-adventures'
import { normalizeChapters, chapterUnlock, fmtCountdown, adventureState } from '@/src/lib/adventure-derive'
import { COLORS, SCENE_TINT, type Rarity } from '@/theme/tokens'
import type { SceneTier } from '@/src/lib/types'

const TIER_LABEL: Record<SceneTier, string> = { nearby: '近郊', coast: '海岸', ruin: '遗迹', astral: '异界' }

function Chip({ children, bg = COLORS.paper }: { children: React.ReactNode; bg?: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: bg }}>
      <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: COLORS.ink }}>{children}</Text>
    </View>
  )
}

export default function AdventureDetail() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, isLoading } = useAdventure(id ?? '')
  const [now, setNow] = useState(() => 0)

  // 1s tick for countdowns (seed off mount via a state setter, never Date in module scope)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  if (isLoading || !data) return <View style={{ flex: 1, backgroundColor: COLORS.cream }}><LoadingState label="加载冒险…" /></View>
  const adv = data.adventure
  const tier = (adv.scene_tier ?? 'nearby') as SceneTier
  const rarity = (adv.rarity_tier ?? 'common') as Rarity
  const chapters = normalizeChapters(adv)
  const startedAtMs = new Date(adv.started_at).getTime()
  const st = adventureState(adv.status)

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={{ aspectRatio: 16 / 10, backgroundColor: COLORS.cream, borderBottomWidth: 2, borderColor: COLORS.ink }}>
          {adv.scene_image_url ? <Image source={{ uri: adv.scene_image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={300} /> : null}
          <Pressable onPress={() => router.back()} style={{ position: 'absolute', top: insets.top + 6, left: 12, width: 40, height: 40, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: COLORS.paper, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={22} strokeWidth={2.5} color={COLORS.ink} />
          </Pressable>
        </View>

        <View style={{ padding: 16, gap: 14 }}>
          <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 24, color: COLORS.ink }}>{adv.scene_type ?? '未知场景'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Chip bg={SCENE_TINT[tier]}>{TIER_LABEL[tier]}</Chip>
            <RarityBadge rarity={rarity} />
            {adv.stamina_used != null ? <Chip>体力 {adv.stamina_used}</Chip> : null}
            {adv.duration_min != null ? <Chip>{Math.round((adv.duration_min / 60) * 10) / 10}h · {chapters.length} 章</Chip> : null}
            <Chip bg={st.failed ? COLORS.coral : COLORS.mint}>{st.label}</Chip>
          </View>

          {adv.pet_encounter ? (
            <Brutal bg={COLORS.lilac} radius={16} offset="md" faceStyle={{ padding: 14 }}>
              <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 14, color: COLORS.ink }}>宠物遭遇</Text>
              <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 13, color: COLORS.ink, marginTop: 4 }}>{adv.pet_encounter.name ?? '神秘生物'}{adv.pet_encounter.element ? ` · ${adv.pet_encounter.element}` : ''}</Text>
            </Brutal>
          ) : null}

          {/* 章节时间线 */}
          <View style={{ gap: 12, marginTop: 4 }}>
            {chapters.map((ch) => {
              const u = chapterUnlock(startedAtMs, ch.unlock_offset_min, now)
              return (
                <Brutal key={ch.idx} bg={u.unlocked ? COLORS.paper : COLORS.cream} radius={16} offset="md" faceStyle={{ padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      {u.unlocked ? null : <Lock size={16} strokeWidth={2.5} color={COLORS.mute} />}
                      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 15, color: u.unlocked ? COLORS.ink : COLORS.mute }} numberOfLines={1}>
                        第 {ch.idx} 章 · {u.unlocked ? ch.title : '？？？'}
                      </Text>
                    </View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: u.unlocked ? COLORS.mint : COLORS.paper }}>
                      <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 11, color: u.unlocked ? COLORS.ink : COLORS.mute }}>{u.unlocked ? '已解锁' : fmtCountdown(u.remainMs)}</Text>
                    </View>
                  </View>
                  {u.unlocked ? (
                    <Text style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 13, color: COLORS.inkSoft, marginTop: 10, lineHeight: 20 }}>{ch.body}</Text>
                  ) : (
                    <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.mute, marginTop: 8 }}>冒险开始 {ch.unlock_offset_min} 分钟后揭晓</Text>
                  )}
                </Brutal>
              )
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
