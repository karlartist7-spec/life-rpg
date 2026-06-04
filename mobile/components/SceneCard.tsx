import { Pressable, View, Text } from 'react-native'
import { Image } from 'expo-image'
import Animated from 'react-native-reanimated'
import { RarityBadge } from './RarityBadge'
import { Button } from './Button'
import { usePressPhysics } from './usePressPhysics'
import { COLORS, SCENE_TINT, type Rarity } from '@/theme/tokens'
import { adventureState, storyPreview } from '@/src/lib/adventure-derive'
import type { Adventure, SceneTier } from '@/src/lib/types'

const TIER_LABEL: Record<SceneTier, string> = { nearby: '近郊', coast: '海岸', ruin: '遗迹', astral: '异界' }

export function SceneCard({ adv, onPress, onRetry, retrying }: { adv: Adventure; onPress: () => void; onRetry: () => void; retrying: boolean }) {
  const { off, faceStyle, plateStyle, onPressIn, onPressOut } = usePressPhysics('md')
  const st = adventureState(adv.status)
  const tier = (adv.scene_tier ?? 'nearby') as SceneTier
  const rarity = (adv.rarity_tier ?? 'common') as Rarity

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress} disabled={st.generating}>
      <View style={{ position: 'relative' }}>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: off, top: off, right: -off, bottom: -off, backgroundColor: COLORS.ink, borderRadius: 20 }, plateStyle]} />
        <Animated.View style={[{ backgroundColor: COLORS.paper, borderRadius: 20, borderWidth: 2, borderColor: COLORS.ink, overflow: 'hidden' }, faceStyle]}>
          <View style={{ aspectRatio: 16 / 10, backgroundColor: COLORS.cream }}>
            {adv.scene_image_url ? <Image source={{ uri: adv.scene_image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={300} /> : null}
            <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 6 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9999, borderWidth: 2, borderColor: COLORS.ink, backgroundColor: SCENE_TINT[tier] }}>
                <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 10, color: COLORS.ink }}>{TIER_LABEL[tier]}</Text>
              </View>
              <RarityBadge rarity={rarity} />
            </View>
            {st.generating ? (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(251,247,240,0.85)' }}>
                <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 14, color: COLORS.ink }}>{st.label}…</Text>
              </View>
            ) : null}
          </View>
          <View style={{ padding: 14, gap: 8 }}>
            <Text style={{ fontFamily: 'Fredoka_700Bold', fontSize: 16, color: COLORS.ink }} numberOfLines={1}>{adv.scene_type ?? '未知场景'}</Text>
            {st.failed ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 12, color: COLORS.coral }}>生成失败</Text>
                <Button label={retrying ? '重试中…' : '重试'} variant="coral" size="sm" onPress={onRetry} disabled={retrying} />
              </View>
            ) : (
              <Text style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 13, color: COLORS.inkSoft }} numberOfLines={3}>{storyPreview(adv.story_md, 140)}</Text>
            )}
          </View>
        </Animated.View>
      </View>
      <View style={{ height: off + 6 }} />
    </Pressable>
  )
}
