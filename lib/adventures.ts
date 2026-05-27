/**
 * LLM 驱动的冒险引擎
 *
 * 流程：
 * 1. 选场景 (forest/ocean/town/cave/mountain/ruin/astral)
 * 2. LLM (gpt-4o-mini) 生成故事 + 配图 prompt + 掉落 + 宠物遭遇（含宠物元数据）
 * 3. gpt-image-2 用角色 base + active 宠物 base 作 reference 生场景图
 * 4. 写 adventures 表 + user_inventory + 触发 catchPet
 */

import OpenAI from 'openai'
import { generateAndUpload } from './image-gen'
import { catchPet, getActivePets } from './pets'

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

/** 物品目录（LLM 只能从这些 slug 里选） */
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

export type AdventureResult = {
  adventureId: string
  story: string
  sceneType: SceneType
  sceneImageUrl: string
  rewards: { items: Array<{ item_slug: string; qty: number }>; exp: number }
  petEncounter?: {
    meta: {
      name: string
      description: string
      base_prompt: string
      rarity: 'common' | 'rare' | 'epic' | 'legendary'
      element?: string
    }
    caught: boolean
    userPetId?: string
  }
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

/**
 * 主入口：生成一次冒险
 */
export async function generateAdventure(input: AdventureInput): Promise<AdventureResult> {
  const { userId, triggerEventId } = input

  // 如未传 recovery/strain/hrv，从今日 daily_settlements 读
  let recoveryScore = input.recoveryScore
  let strain = input.strain
  let hrv = input.hrv
  if (recoveryScore === undefined) {
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

  // 1. 取角色 base + active 宠物
  const charState: any = (
    await sb(`character_state?user_id=eq.${userId}&select=character_base_image_url,name`)
  )[0]
  if (!charState) throw new Error('character_state 未初始化')
  const activePets = await getActivePets(userId)

  // 2. 随机选场景
  const sceneType = SCENE_TYPES[Math.floor(Math.random() * SCENE_TYPES.length)]

  // 3. LLM 生成故事 + 宠物元数据
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

  // 4. 先建 adventures 行拿 ID
  const adventureRow = await sb(`adventures`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      trigger_event_id: triggerEventId || null,
      scene_type: sceneType,
      story_md: llmOutput.story_md,
      pets_dispatched: activePets.map((p) => p.id),
      status: 'active',
    }),
  })
  const adventureId = adventureRow[0].id

  // 5. 生成场景图（角色 base + 宠物 base 作 reference）
  const references: string[] = []
  if (charState.character_base_image_url) references.push(charState.character_base_image_url)
  for (const p of activePets) {
    if (p.current_image_url && references.length < 4) references.push(p.current_image_url)
  }

  const scenePrompt = `${llmOutput.image_prompt}

视觉风格：cute doodle art, pastel colors, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), playful, no text, no emoji, no logos.
关键：保持 reference 图中角色和宠物的视觉一致性（同样的配色、轮廓、设计 DNA）。`

  const sceneGen = await generateAndUpload({
    prompt: scenePrompt,
    referenceUrls: references,
    bucket: 'character-art',
    storagePath: `adventures/${adventureId}/scene.png`,
    size: '1792x1024',
    quality: 'high',
  })

  // 6. 写入掉落到 user_inventory
  const validDrops = llmOutput.drops.filter((d) =>
    ITEM_CATALOG.some((c) => c.slug === d.item_slug)
  )
  for (const drop of validDrops) {
    // upsert：用 unique index (user_id, item_slug) where equipped=false
    await sb(
      `user_inventory?on_conflict=user_id,item_slug&user_id=eq.${userId}&item_slug=eq.${drop.item_slug}&equipped=eq.false`,
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          user_id: userId,
          item_slug: drop.item_slug,
          qty: drop.qty,
          equipped: false,
          acquired_adventure_id: adventureId,
        }),
      }
    ).catch(async () => {
      // 如果 upsert 失败，fallback：手动加 qty
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
    })
  }

  // 7. 宠物遭遇
  let petEncounter: AdventureResult['petEncounter']
  if (llmOutput.pet_encounter) {
    const { caught, ...meta } = llmOutput.pet_encounter
    if (caught) {
      const newPet = await catchPet(userId, adventureId, {
        ...meta,
        habitat_origin: sceneType,
      })
      petEncounter = { meta, caught: true, userPetId: newPet.id }
    } else {
      petEncounter = { meta, caught: false }
    }
  }

  // 8. 完成
  await sb(`adventures?id=eq.${adventureId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      scene_image_url: sceneGen.publicUrl,
      references_used: references,
      rewards: { items: validDrops, exp: llmOutput.exp_reward },
      pet_encounter: petEncounter ? { ...petEncounter, raw: llmOutput.pet_encounter } : null,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }),
  })

  return {
    adventureId,
    story: llmOutput.story_md,
    sceneType,
    sceneImageUrl: sceneGen.publicUrl,
    rewards: { items: validDrops, exp: llmOutput.exp_reward },
    petEncounter,
  }
}

/**
 * LLM 故事生成：Structured Output 严格 schema
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
- 如果遇到野生宠物，你需要**即兴创作**一只全新的 unique 宠物（不是从预设列表里选）
- 包含：name（中文名）, description（2-3 句描述外观/性格）, base_prompt（英文 gpt-image-2 prompt，Doodles 风格，1:1 square，centered，full-body，thick 2px black outline，hard offset shadow，pastel colors，NO text/emoji/logos）, rarity（根据场景稀有度 + recovery 决定）, element（元素属性，自由发挥）
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
            story_md: { type: 'string', description: '中文 2-3 段故事，markdown' },
            image_prompt: {
              type: 'string',
              description:
                '场景图英文 prompt（doodle 风格基底由调用方拼接）。描述：场景环境 + 角色+宠物在画面里的姿态。',
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
                name: { type: 'string', description: '宠物中文名' },
                description: { type: 'string', description: '2-3 句外观/性格描述' },
                base_prompt: {
                  type: 'string',
                  description:
                    '英文 gpt-image-2 prompt，Doodles 风格，1:1 square，centered，full-body，thick 2px black outline，hard offset shadow，pastel colors，NO text/emoji/logos',
                },
                rarity: { type: 'string', enum: ['common', 'rare', 'epic', 'legendary'] },
                element: { type: 'string', description: '元素属性（火/水/风/土/光/暗等）' },
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
 * Seed 物品目录到 items 表
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
