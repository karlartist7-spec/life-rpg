import { View, Text, Pressable, ScrollView } from 'react-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { Brutal } from '@/components/Brutal'
import { RarityBadge } from '@/components/RarityBadge'
import { adventureState, storyPreview } from '@/src/lib/adventure-derive'
import { COLORS, type Rarity } from '@/theme/tokens'
import type { DashAdventure } from '@/src/lib/types'

export function AdventureCarousel({ adventures }: { adventures: DashAdventure[] }) {
  if (!adventures || adventures.length === 0) return null
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 18, color: COLORS.ink }}>最近冒险</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8, paddingBottom: 6 }} snapToInterval={236} decelerationRate="fast">
        {adventures.map((a) => {
          const st = adventureState(a.status)
          const rarity = (a.rarity_tier ?? 'common') as Rarity
          return (
            <Pressable key={a.id} onPress={() => router.push(`/adventure/${a.id}`)} style={{ width: 224 }}>
              <Brutal bg={COLORS.paper} radius={16} offset="md" faceStyle={{ padding: 0, overflow: 'hidden' }}>
                <View style={{ aspectRatio: 16 / 10, backgroundColor: COLORS.cream }}>
                  {a.scene_image_url ? <Image source={{ uri: a.scene_image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={300} /> : null}
                  <View style={{ position: 'absolute', top: 6, left: 6 }}><RarityBadge rarity={rarity} /></View>
                  {st.generating ? <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(251,247,240,0.85)' }}><Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 12, color: COLORS.ink }}>{st.label}…</Text></View> : null}
                </View>
                <View style={{ padding: 10, gap: 4 }}>
                  <Text numberOfLines={1} style={{ fontFamily: 'Fredoka_700Bold', fontSize: 13, color: COLORS.ink }}>{a.scene_type ?? '未知场景'}</Text>
                  <Text numberOfLines={2} style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 11, color: COLORS.inkSoft }}>{storyPreview(a.story_md, 60)}</Text>
                </View>
              </Brutal>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
