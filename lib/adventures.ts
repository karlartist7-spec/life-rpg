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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function sb(path: string, init: RequestInit = {}): Promise<any> {
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
  return text ? JSON.parse(text) : null
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
}

export type StoryResult = {
  adventureId: string
  story: string
  sceneType: SceneType
  rewards: { items: Array<{ item_slug: string; qty: number }>; exp: number }
  userPetId?: string
  petName?: string
  petRarity?: string
  imagePending: true
}

type LLMOutput = {
  story_md: string
  image_prompt: string
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
 * 阶段 1：LLM 故事 + 写 DB（不烧图）
 */
export async function generateStoryAndPet(input: AdventureInput): Promise<StoryResult> {
  const { userId, triggerEventId } = input

  // 1. 取 recovery（如未传）
  let recoveryScore: number = input.recoveryScore ?? -1
  let strain: number | undefined = input.strain
  let hrv: number | undefined = input.hrv
  if (recoveryScore < 0) {
    const today = new Date().toISOString().slice(0, 10)
    const settlement: any = (
      await sb(
        `daily_settlements?user_id=eq.${userId}&date=eq.${today}&select=recovery_score,strain,hrv&limit=1`
      )
    )[0]
    if (settlement) {
      recoveryScore = settlement.recovery_score ?? 50
      strain = strain ?? settlement.strain
      hrv = hrv ?? settlement.hrv
    } else {
      recoveryScore = 50
    }
  }

  // 2. 角色 + active 宠物
  const charState: any = (
    await sb(`character_state?user_id=eq.${userId}&select=name,character_base_image_url`)
  )[0]
  if (!charState) throw new Error('character_state 未初始化')
  const activePets = await getActivePets(userId)

  // 3. 选场景
  const sceneType = SCENE_TYPES[Math.floor(Math.random() * SCENE_TYPES.length)]

  // 4. LLM
  const llmOutput = await callNarrator({
    sceneType,
    recoveryScore,
    strain,
    hrv,
    characterName: charState.name || 'Hermes',
    activePets: activePets.map((p) => ({
      name: p.name,
      nickname: p.nickname,
      stage: p.evolution_stage,
      level: p.level,
      element: p.element,
    })),
  })

  // 5. 建 adventures 行（status='pending_image'，story / drops 已经全有）
  const adventureRow = await sb(`adventures`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      trigger_event_id: triggerEventId || null,
      scene_type: sceneType,
      story_md: llmOutput.story_md,
      pets_dispatched: activePets.map((p) => p.id),
      status: 'pending_image',
      rewards: { items: [], exp: llmOutput.exp_reward },
    }),
  })
  const adventureId = adventureRow[0].id

  // 6. 写掉落（不需要等图）
  const validDrops = llmOutput.drops.filter((d) =>
    ITEM_CATALOG.some((c) => c.slug === d.item_slug)
  )
  for (const drop of validDrops) {
    const existing = await sb(
      `user_inventory?user_id=eq.${userId}&item_slug=eq.${drop.item_slug}&equipped=eq.false&select=id,qty`
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

  // 7. 如果有宠物捕获 → 先写 user_pets 行（无图）
  let userPetId: string | undefined
  let petName: string | undefined
  let petRarity: string | undefined

  if (llmOutput.pet_encounter && llmOutput.pet_encounter.caught) {
    const meta = llmOutput.pet_encounter
    const insertedPet = await sb(`user_pets`, {
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
        // base_image_url / current_image_url 留空 → 阶段 2 填
      }),
    })
    userPetId = insertedPet[0].id
    petName = meta.name
    petRarity = meta.rarity
  }

  // 8. 写 pet_encounter 快照到 adventures（含 LLM 原始数据 + userPetId）
  await sb(`adventures?id=eq.${adventureId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      pet_encounter: llmOutput.pet_encounter
        ? {
            ...llmOutput.pet_encounter,
            user_pet_id: userPetId ?? null,
          }
        : null,
      rewards: { items: validDrops, exp: llmOutput.exp_reward },
      // 把 image_prompt 暂存到 references_used 第 0 位（阶段 2 用）
      references_used: [`__PROMPT__:${llmOutput.image_prompt}`],
    }),
  })

  return {
    adventureId,
    story: llmOutput.story_md,
    sceneType,
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
  const adv: any = (await sb(`adventures?id=eq.${adventureId}&select=*`))[0]
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
  const charState: any = (
    await sb(`character_state?user_id=eq.${adv.user_id}&select=character_base_image_url`)
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
    const userPet: any = (await sb(`user_pets?id=eq.${userPetId}&select=*`))[0]
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
 * LLM 故事生成
 */
async function callNarrator(args: {
  sceneType: SceneType
  recoveryScore: number
  strain?: number
  hrv?: number
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

  const sysPrompt = `你是一位幻想冒险叙事大师。角色"${args.characterName}"带着 ${args.activePets.length} 只宠物伙伴探索世界。请用中文生成一段 2-3 段的简短生动故事，包含 1-3 个事件（遭遇/发现/挑战）。

掉落规则（recovery_score 影响品质）：
- recovery >= 67：可掉 epic / legendary
- recovery 34-66：可掉 common / rare
- recovery < 34：只可掉 common

宠物遭遇（30% 概率）：
- 如果遇到野生宠物，你需要**即兴创作**一只全新的 unique 宠物
- 包含：name（中文名）, description（2-3 句描述外观/性格）, base_prompt（英文 gpt-image-2 prompt，Doodles 风格，1:1 square，centered，full-body，thick 2px black outline，hard offset shadow，pastel colors，NO text/emoji/logos）, rarity（按 recovery 决定）, element（元素属性，自由发挥）
- caught 概率：common 50%, rare 30%, epic 15%, legendary 5%

绝对不能编造不在 item_slug 列表里的物品。`

  const userPrompt = JSON.stringify({
    scene_type: args.sceneType,
    recovery_score: args.recoveryScore,
    strain: args.strain,
    hrv: args.hrv,
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
          required: ['story_md', 'image_prompt', 'drops', 'pet_encounter', 'exp_reward'],
          properties: {
            story_md: { type: 'string' },
            image_prompt: { type: 'string' },
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
  return JSON.parse(content)
}

/**
 * Seed 物品目录
 */
export async function seedItemCatalog(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0
  let skipped = 0
  for (const item of ITEM_CATALOG) {
    const existing = await sb(`items?slug=eq.${item.slug}&select=id`)
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
