/**
 * LLM 驱动的冒险引擎 — 两阶段拆分版
 *
 * 阶段 1: generateStoryAndPet (~10s)
 *   - LLM 生成故事 + 宠物元数据
 *   - 写 adventures 表（status='pending_image'）+ user_pets 行（无图）
 *   - 写 user_inventory 掉落
 *   - 返回 adventureId / userPetId（图都还没生成）
 *
 * 阶段 2: renderAdventureImages (~3min)
 *   - gpt-image-2 烧场景图 + 宠物 base 图（如果有捕获）
 *   - 回写 scene_image_url + 宠物 base_image_url
 *   - 把 adventure status 改成 'completed'
 *
 * 为什么拆？Vercel Hobby plan 函数 timeout 60s，烧图要 2-3min 跑不完。
 * 阶段 1 返回快，阶段 2 用 waitUntil 异步跑（Vercel 后台函数 15min timeout）。
 */

import OpenAI from 'openai'
import { generateAndUpload } from './image-gen'
import { getActivePets } from './pets'
import {
  applyStatsToCharacter,
  SCENE_TIER_TYPES,
  SCENE_TIER_LABEL,
  type SceneTier,
  type RarityTier,
} from './stats'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function sb<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPA_SRV,
      Authorization: `Bearer ${SUPA_SRV}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
  const text = await r.text()
  return (text ? JSON.parse(text) : null) as T
}

const SCENE_TYPES = ['forest', 'ocean', 'town', 'cave', 'mountain', 'ruin', 'astral'] as const
type SceneType = (typeof SCENE_TYPES)[number]

export const ITEM_CATALOG = [
  { slug: 'health_potion', name: '生命药水', type: 'consumable', rarity: 'common' },
  { slug: 'energy_drink', name: '能量饮料', type: 'consumable', rarity: 'common' },
  { slug: 'rare_herb', name: '稀有药草', type: 'material', rarity: 'rare' },
  { slug: 'star_fragment', name: '星辰碎片', type: 'material', rarity: 'epic' },
  { slug: 'ancient_rune', name: '远古符文', type: 'material', rarity: 'legendary' },
  { slug: 'wooden_sword', name: '木剑', type: 'equip', rarity: 'common' },
  { slug: 'silver_blade', name: '银刃', type: 'equip', rarity: 'rare' },
  { slug: 'cosmic_helm', name: '星空头盔', type: 'equip', rarity: 'epic' },
  { slug: 'pet_egg_common', name: '普通宠物蛋', type: 'egg', rarity: 'common' },
  { slug: 'pet_egg_rare', name: '稀有宠物蛋', type: 'egg', rarity: 'rare' },
  { slug: 'memory_shard', name: '记忆碎片', type: 'collect', rarity: 'rare' },
] as const

export type AdventureInput = {
  userId: string
  triggerEventId?: string
  recoveryScore?: number
  strain?: number
  hrv?: number
  triggeredBy?: 'sleep_recovery' | 'manual'
}

export type Chapter = {
  idx: number
  title: string
  body: string
  unlock_offset_min: number
}

export type StoryResult = {
  adventureId: string
  story: string
  sceneType: SceneType
  sceneTier: SceneTier
  rarityTier: RarityTier
  stamina: number
  durationMin: number
  chapters: Chapter[]
  rewards: { items: Array<{ item_slug: string; qty: number }>; exp: number }
  userPetId?: string
  petName?: string
  petRarity?: string
  imagePending: true
}

type LLMOutput = {
  story_md: string
  image_prompt: string
  chapters: Chapter[]
  drops: Array<{ item_slug: string; qty: number }>
  pet_encounter: {
    name: string
    description: string
    base_prompt: string
    rarity: 'common' | 'rare' | 'epic' | 'legendary'
    element: string
    caught: boolean
  } | null
  exp_reward: number
}

function rarityToMaxStage(rarity: string): number {
  return { common: 1, rare: 2, epic: 3, legendary: 3 }[rarity] ?? 1
}

function defaultStats(rarity: string): Record<string, number> {
  const base = { hp: 100, atk: 10, def: 10 }
  const mult = { common: 1, rare: 1.3, epic: 1.6, legendary: 2 }[rarity] ?? 1
  return {
    hp: Math.floor(base.hp * mult),
    atk: Math.floor(base.atk * mult),
    def: Math.floor(base.def * mult),
  }
}

/**
 * 阶段 1：LLM 故事 + 章节 + 写 DB（不烧图）
 *
 * 数据流：
 *   1. applyStatsToCharacter() 用 30 天 daily_settlements 算三维 + 当日体力 → 写 character_state
 *   2. 根据 today_scene_tier 选场景，rarity_tier 决定主掉落
 *   3. 章节数 = round(sleep_min / 60)，clamp [3,8]，按时间均匀分布 unlock_offset_min
 *   4. LM 一次性生成所有章节，前端按时间逐步揭晓
 */
export async function generateStoryAndPet(input: AdventureInput): Promise<StoryResult> {
  const { userId, triggerEventId } = input

  // 1. 同步今日三维 + 体力（幂等，当日已算自动跳过）
  const statsResult = await applyStatsToCharacter(userId)
  const today = statsResult.today
  const stamina = today.stamina
  const sceneTier = today.scene_tier
  const rarityTier = today.rarity_tier
  const sleepMin = today.sleep_min ?? 480 // 兜底 8h
  const recoveryScore = today.recovery ?? input.recoveryScore ?? 50
  const strain = today.strain ?? input.strain ?? 0
  let hrv: number | undefined = input.hrv
  if (hrv == null) {
    const todayDate = new Date().toISOString().slice(0, 10)
    const settlement = (await sb<Array<{ hrv: number | null }>>(
      `daily_settlements?user_id=eq.${userId}&date=eq.${todayDate}&select=hrv&limit=1`,
    ))[0]
    if (settlement?.hrv != null) hrv = settlement.hrv
  }

  // 2. 角色 + active 宠物
  const charState = (await sb<Array<{ name: string | null; character_base_image_url: string | null }>>(
    `character_state?user_id=eq.${userId}&select=name,character_base_image_url`,
  ))[0]
  if (!charState) throw new Error('character_state 未初始化')
  const activePets = await getActivePets(userId)

  // 3. 按场景档位筛选场景
  const tierScenes = SCENE_TIER_TYPES[sceneTier] as readonly SceneType[]
  const sceneType = tierScenes[Math.floor(Math.random() * tierScenes.length)]

  // 4. 章节数 = sleep_min / 60，clamp [3, 8]
  const chapterCount = Math.max(3, Math.min(8, Math.round(sleepMin / 60)))
  const durationMin = sleepMin

  // 5. LLM 生故事 + 章节
  const llmOutput = await callNarrator({
    sceneType,
    sceneTier,
    rarityTier,
    stamina,
    recoveryScore,
    strain,
    hrv,
    chapterCount,
    durationMin,
    characterName: charState.name || 'Hermes',
    activePets: activePets.map((p) => ({
      name: p.name,
      nickname: p.nickname,
      stage: p.evolution_stage,
      level: p.level,
      element: p.element,
    })),
  })

  // 6. 校验/补全章节（LM 偶尔会乱给 unlock_offset_min）
  const chapters: Chapter[] = (llmOutput.chapters || []).slice(0, chapterCount).map((c, i) => ({
    idx: i,
    title: c.title || `第 ${i + 1} 章`,
    body: c.body || '',
    unlock_offset_min: i === 0 ? 0 : Math.round((durationMin / (chapterCount - 1)) * i),
  }))
  // 不足时补齐
  while (chapters.length < chapterCount) {
    const i = chapters.length
    chapters.push({
      idx: i,
      title: `第 ${i + 1} 章`,
      body: '冒险继续...',
      unlock_offset_min: i === 0 ? 0 : Math.round((durationMin / (chapterCount - 1)) * i),
    })
  }

  // 7. 建 adventures 行
  const startedAt = new Date()
  const completedAt = new Date(startedAt.getTime() + durationMin * 60_000)
  const adventureRow = await sb<Array<{ id: string }>>(`adventures`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      trigger_event_id: triggerEventId || null,
      scene_type: sceneType,
      scene_tier: sceneTier,
      rarity_tier: rarityTier,
      stamina_used: stamina,
      duration_min: durationMin,
      chapters,
      triggered_by: input.triggeredBy || 'manual',
      story_md: llmOutput.story_md,
      pets_dispatched: activePets.map((p) => p.id),
      status: 'pending',
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      rewards: { items: [], exp: llmOutput.exp_reward },
    }),
  })
  const adventureId = adventureRow[0].id

  // 8. 写掉落
  const validDrops = llmOutput.drops.filter((d) =>
    ITEM_CATALOG.some((c) => c.slug === d.item_slug),
  )
  for (const drop of validDrops) {
    const existing = await sb<Array<{ id: string; qty: number }>>(
      `user_inventory?user_id=eq.${userId}&item_slug=eq.${drop.item_slug}&equipped=eq.false&select=id,qty`,
    )
    if (existing.length) {
      await sb(`user_inventory?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ qty: existing[0].qty + drop.qty }),
      })
    } else {
      await sb(`user_inventory`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          item_slug: drop.item_slug,
          qty: drop.qty,
          acquired_adventure_id: adventureId,
        }),
      })
    }
  }

  // 9. 如果有宠物捕获 → 写 user_pets
  let userPetId: string | undefined
  let petName: string | undefined
  let petRarity: string | undefined

  if (llmOutput.pet_encounter && llmOutput.pet_encounter.caught) {
    const meta = llmOutput.pet_encounter
    const insertedPet = await sb<Array<{ id: string }>>(`user_pets`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        name: meta.name,
        description: meta.description,
        base_prompt: meta.base_prompt,
        rarity: meta.rarity,
        element: meta.element,
        habitat_origin: sceneType,
        max_stage: rarityToMaxStage(meta.rarity),
        nickname: meta.name,
        evolution_stage: 1,
        caught_adventure_id: adventureId,
        stats: defaultStats(meta.rarity),
      }),
    })
    userPetId = insertedPet[0].id
    petName = meta.name
    petRarity = meta.rarity
  }

  // 10. 写 pet_encounter + 暂存 image_prompt 给阶段 2
  await sb(`adventures?id=eq.${adventureId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      pet_encounter: llmOutput.pet_encounter
        ? { ...llmOutput.pet_encounter, user_pet_id: userPetId ?? null }
        : null,
      rewards: { items: validDrops, exp: llmOutput.exp_reward },
      references_used: [`__PROMPT__:${llmOutput.image_prompt}`],
    }),
  })

  return {
    adventureId,
    story: llmOutput.story_md,
    sceneType,
    sceneTier,
    rarityTier,
    stamina,
    durationMin,
    chapters,
    rewards: { items: validDrops, exp: llmOutput.exp_reward },
    userPetId,
    petName,
    petRarity,
    imagePending: true,
  }
}

/**
 * 阶段 2：烧图（场景图 + 宠物 base 图）
 *
 * 在 Vercel 后台函数（waitUntil 触发）或独立 endpoint 跑，可以 5-15 分钟。
 */
export async function renderAdventureImages(
  adventureId: string
): Promise<{ sceneImageUrl: string; petImageUrl?: string }> {
  // 1. 取 adventure
  const adv = (await sb<Array<Record<string, any>>>(`adventures?id=eq.${adventureId}&select=*`))[0]
  if (!adv) throw new Error(`adventure ${adventureId} 不存在`)
  if (adv.status === 'completed' && adv.scene_image_url) {
    // 已渲染过，幂等
    return { sceneImageUrl: adv.scene_image_url }
  }

  // 2. 取 image_prompt（从 references_used[0] 反解）
  const imagePrompt: string =
    (adv.references_used?.[0] || '').replace(/^__PROMPT__:/, '') ||
    `${adv.scene_type} adventure scene`

  // 3. 取角色 base + active 宠物 base（作 reference）
  const charState = (
    await sb<Array<{ character_base_image_url: string | null }>>(
      `character_state?user_id=eq.${adv.user_id}&select=character_base_image_url`,
    )
  )[0]
  const activePets = await getActivePets(adv.user_id)

  const references: string[] = []
  if (charState?.character_base_image_url) references.push(charState.character_base_image_url)
  for (const p of activePets) {
    if (p.current_image_url && references.length < 4) references.push(p.current_image_url)
  }

  // 4. 烧场景图
  const scenePrompt = `${imagePrompt}

视觉风格：cute doodle art, pastel colors, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), playful, no text, no emoji, no logos.
关键：保持 reference 图中角色和宠物的视觉一致性。`

  const sceneGen = await generateAndUpload({
    prompt: scenePrompt,
    referenceUrls: references,
    bucket: 'character-art',
    storagePath: `adventures/${adventureId}/scene.png`,
    size: '1536x1024',
    quality: 'medium',
  })

  // 5. 如果这次有宠物捕获 → 烧宠物 base 图
  let petImageUrl: string | undefined
  const petEnc = adv.pet_encounter
  if (petEnc?.user_pet_id && petEnc?.caught) {
    const userPetId = petEnc.user_pet_id
    const userPet = (await sb<Array<Record<string, any>>>(`user_pets?id=eq.${userPetId}&select=*`))[0]
    if (userPet && !userPet.base_image_url) {
      const petGen = await generateAndUpload({
        prompt: userPet.base_prompt,
        bucket: 'character-art',
        storagePath: `pets/${userPetId}/base.png`,
        size: '1024x1024',
        quality: 'medium',
      })
      await sb(`user_pets?id=eq.${userPetId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          base_image_url: petGen.publicUrl,
          current_image_url: petGen.publicUrl,
        }),
      })
      petImageUrl = petGen.publicUrl
    }
  }

  // 6. 更新 adventure 完成
  await sb(`adventures?id=eq.${adventureId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      scene_image_url: sceneGen.publicUrl,
      references_used: references,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }),
  })

  return { sceneImageUrl: sceneGen.publicUrl, petImageUrl }
}

/**
 * LLM 故事生成 — 章节化 + 体力档位驱动
 *
 * - 输入：场景类型 + 场景档位 + 主稀有度 + 体力 + 章节数 + 时长
 * - 输出：完整 story_md + 章节数组 + 掉落 + 宠物遭遇
 * - 主稀有度 80% 概率出在档，20% 上下浮动一档
 */
async function callNarrator(args: {
  sceneType: SceneType
  sceneTier: SceneTier
  rarityTier: RarityTier
  stamina: number
  recoveryScore: number
  strain: number
  hrv?: number
  chapterCount: number
  durationMin: number
  characterName: string
  activePets: Array<{
    name: string
    nickname: string | null
    stage: number
    level: number
    element: string | null
  }>
}): Promise<LLMOutput> {
  const itemEnum = ITEM_CATALOG.map((c) => c.slug)
  const tierLabel = SCENE_TIER_LABEL[args.sceneTier]

  const sysPrompt = `你是一位幻想冒险叙事大师。角色"${args.characterName}"带着 ${args.activePets.length} 只宠物伙伴，今日体力 ${args.stamina}（睡了 ${Math.round(args.durationMin / 60)} 小时，恢复 ${args.recoveryScore}%），可达"${tierLabel}"级别区域。

请用中文生成 ${args.chapterCount} 个连续章节，组合起来是一段完整冒险。每章 2-3 句紧凑描写，覆盖一个事件（遭遇/发现/挑战/宠物互动），章节之间有时间推进感。

每章字段：
- title: 短句标题（4-8 字）
- body: 2-3 句正文（50-100 字）
- unlock_offset_min: 距离冒险开始的分钟数。第 1 章 = 0，最后一章 ≈ ${args.durationMin}，中间章节均匀分布。

最后用 story_md 字段把所有章节合成一段完整 markdown（每章用 ## 标题 + 正文段落）。

主稀有度档位：**${args.rarityTier}**（严格按这个档位分配掉落，80% 在档，20% 浮动 ±1 档）：
- 体力 ${args.stamina} → 主稀有度 ${args.rarityTier}
- legendary 档：必出 ancient_rune（远古符文）+ 可能 epic 装备 + 高几率宠物蛋
- epic 档：star_fragment + 可能 rare 装备 + 中等宠物蛋
- rare 档：rare_herb + common 装备
- common 档：health_potion / energy_drink

宠物遭遇规则（场景 ${args.sceneType}，档位 ${args.sceneTier}）：
- 80% 概率出现野生宠物。**rarity 必须 = ${args.rarityTier}**（与场景档位匹配）
- 即兴创作：name（中文）, description（2-3 句外观/性格）, base_prompt（英文 gpt-image-2 prompt，Doodles 风格，1:1 square，centered，full-body，thick 2px black outline，hard offset shadow，pastel colors，NO text/emoji/logos）, element（元素属性自由发挥）
- caught 概率：common 90%, rare 75%, epic 50%, legendary 25%

EXP 奖励：体力越高 EXP 越多，common ≈ 20-40, rare ≈ 40-60, epic ≈ 60-80, legendary ≈ 80-100。

绝对不能编造不在 item_slug 列表里的物品。image_prompt 是给 gpt-image-2 用的英文 prompt，描述整个冒险场景的代表性画面（不是单章）。`

  const userPrompt = JSON.stringify({
    scene_type: args.sceneType,
    scene_tier: args.sceneTier,
    rarity_tier: args.rarityTier,
    stamina: args.stamina,
    recovery_score: args.recoveryScore,
    strain: args.strain,
    hrv: args.hrv,
    chapter_count: args.chapterCount,
    duration_min: args.durationMin,
    character: { name: args.characterName },
    active_pets: args.activePets,
  })

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'adventure_output',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['story_md', 'image_prompt', 'chapters', 'drops', 'pet_encounter', 'exp_reward'],
          properties: {
            story_md: { type: 'string' },
            image_prompt: { type: 'string' },
            chapters: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['idx', 'title', 'body', 'unlock_offset_min'],
                properties: {
                  idx: { type: 'integer', minimum: 0 },
                  title: { type: 'string' },
                  body: { type: 'string' },
                  unlock_offset_min: { type: 'integer', minimum: 0 },
                },
              },
            },
            drops: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['item_slug', 'qty'],
                properties: {
                  item_slug: { type: 'string', enum: itemEnum },
                  qty: { type: 'integer', minimum: 1, maximum: 5 },
                },
              },
            },
            pet_encounter: {
              type: ['object', 'null'],
              additionalProperties: false,
              required: ['name', 'description', 'base_prompt', 'rarity', 'element', 'caught'],
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                base_prompt: { type: 'string' },
                rarity: { type: 'string', enum: ['common', 'rare', 'epic', 'legendary'] },
                element: { type: 'string' },
                caught: { type: 'boolean' },
              },
            },
            exp_reward: { type: 'integer', minimum: 5, maximum: 100 },
          },
        },
      },
    },
  })

  const content = resp.choices[0].message.content
  if (!content) throw new Error('LLM 返回空内容')
  return JSON.parse(content) as LLMOutput
}

/**
 * Seed 物品目录
 */
export async function seedItemCatalog(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0
  let skipped = 0
  for (const item of ITEM_CATALOG) {
    const existing = await sb<Array<{ id: string }>>(`items?slug=eq.${item.slug}&select=id`)
    if (existing.length) {
      skipped++
      continue
    }
    await sb(`items`, {
      method: 'POST',
      body: JSON.stringify({
        slug: item.slug,
        name: item.name,
        type: item.type,
        rarity: item.rarity,
        description: `${item.name}（${item.type}, ${item.rarity}）`,
      }),
    })
    inserted++
  }
  return { inserted, skipped }
}
