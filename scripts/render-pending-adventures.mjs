#!/usr/bin/env node
/**
 * GitHub Actions 冒险 worker（独立版 — 不依赖 Vercel）
 *
 * 两段处理：
 *
 * 段 1：status='pending_story' （trigger 刚写完骨架）
 *   1. 拉 character_state（角色名 + 三维 + 体力）
 *   2. 拉 active 宠物
 *   3. 调 OpenAI gpt-4o-mini 一次生成 N 章节 + 故事 + 掉落 + 宠物遭遇 + image_prompt
 *   4. 写 chapters / story_md / rewards / pet_encounter / references_used[__PROMPT__:...]
 *   5. 写 user_inventory 掉落，写 user_pets（如有捕获）
 *   6. status → 'pending_image'
 *
 * 段 2：status='pending_image' AND scene_image_url IS NULL
 *   1. 调 OpenAI gpt-image-2 烧场景图（角色 + 宠物 base 作 reference）
 *   2. 上传 Supabase Storage
 *   3. 如有捕获新宠物 → 烧宠物 base 图
 *   4. status → 'completed'
 *
 * 为啥拆？Vercel Hobby plan 函数 60s timeout，LM 多章节 + 烧图都跑不完。
 * GitHub Actions 6h 上限，绰绰有余。
 *
 * 环境变量：OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import OpenAI from 'openai'
import { Buffer } from 'node:buffer'

const MAX_PER_RUN = 15

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('缺少环境变量 OPENAI_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

// === 物品目录（必须和 lib/adventures.ts 的 ITEM_CATALOG 一致） ===
const ITEM_CATALOG = [
  { slug: 'health_potion', name: '生命药水', rarity: 'common' },
  { slug: 'energy_drink', name: '能量饮料', rarity: 'common' },
  { slug: 'rare_herb', name: '稀有药草', rarity: 'rare' },
  { slug: 'star_fragment', name: '星辰碎片', rarity: 'epic' },
  { slug: 'ancient_rune', name: '远古符文', rarity: 'legendary' },
  { slug: 'wooden_sword', name: '木剑', rarity: 'common' },
  { slug: 'silver_blade', name: '银刃', rarity: 'rare' },
  { slug: 'cosmic_helm', name: '星空头盔', rarity: 'epic' },
  { slug: 'pet_egg_common', name: '普通宠物蛋', rarity: 'common' },
  { slug: 'pet_egg_rare', name: '稀有宠物蛋', rarity: 'rare' },
  { slug: 'memory_shard', name: '记忆碎片', rarity: 'rare' },
]
const ITEM_SLUGS = ITEM_CATALOG.map((c) => c.slug)

const SCENE_TIER_LABEL = { nearby: '近郊', coast: '海岸', ruin: '遗迹', astral: '异界' }

// === 视觉风格锁（与官网 life-rpg-steel.vercel.app 一致：Doodles + Neo-brutalism） ===
// 这一段直接拼在每个生图 prompt 末尾，确保所有图片背景/构图/笔触统一
const DOODLES_STYLE = `
STYLE LOCK (mandatory, do not deviate):
- Doodles NFT illustration style, neo-brutalism cartoon aesthetic
- Solid cream off-white background #FAF8F3 (NO gradients, NO photo backgrounds, NO patterns, NO scenery behind subject)
- Pastel candy palette ONLY: mint green #7FE3B0, candy pink #FF8FCB, periwinkle #7C7BE8, sunshine yellow #FFD84D, coral #FF7B7B, sky blue #9ED8F5, lilac #C9A8FF
- VERY BOLD black outline on EVERY shape — thick chunky lines, like a marker pen drawing, not thin sketch lines. Same line weight on character, pet, and background elements.
- HARD OFFSET DROP SHADOW on every character, pet, and major background element: a solid pure black #000 silhouette offset 8 pixels right and 8 pixels down behind the shape, with absolutely zero blur. This shadow is a visible SECOND BLACK SHAPE, not a subtle effect. Think sticker-on-paper or screenprint poster.
- Flat fills, no shading, no gradients, no texture, no airbrush, no cel-shading
- Cute chibi proportions, friendly facial expression, big round eyes
- Subject(s) centered, full body visible, NO cropping
- ABSOLUTELY NO: text, emoji, watermark, logo, signature, photo-realism, anime style, dark fantasy, gothic, horror, 3D render, sketchy lines, muted/dark colors
`.trim()

// 宠物 base 图必须严格遵守的构图约束（除了 STYLE_LOCK 还要加这个）
const PET_COMPOSITION = `
COMPOSITION (mandatory for pet portraits):
- Single creature, full body, standing/sitting pose facing camera at slight 3/4 angle
- Subject occupies ~70% of frame, centered, plenty of breathing room
- Solid cream #FAF8F3 background — NO environment, NO floor, NO shadow on ground, NO decorations
- 1:1 square canvas
`.trim()

// 场景图的额外约束（场景图允许背景，但仍 doodle 风）
const SCENE_COMPOSITION = `
COMPOSITION (mandatory for scene illustration):
- Wide landscape 3:2 ratio canvas
- Show the protagonist character + their active pets exploring (do not draw new pets, use reference images for character/pet appearance)
- All shapes drawn with VERY THICK 4-5px PURE BLACK outline (NOT gray, NOT brown, NOT thin — must be unmistakably bold)
- Every distinct element (character, pet, tree, rock, etc.) gets its own hard offset drop shadow (5px right + 5px down, pure #000, zero blur)
- Background is solid cream #FAF8F3 with sparse doodle-style flat shapes (3-5 max simple elements like a tree-blob, rock-blob, flower) — NOT a dense painted landscape
- Lots of empty cream space, NOT crowded — Neo-brutalism breathes
- Limit to 4 visible characters/pets total in the frame, no extra creatures
`.trim()

function rarityToMaxStage(r) {
  return { common: 1, rare: 2, epic: 3, legendary: 3 }[r] ?? 1
}
function defaultStats(r) {
  const mult = { common: 1, rare: 1.3, epic: 1.6, legendary: 2 }[r] ?? 1
  return {
    hp: Math.floor(100 * mult),
    atk: Math.floor(10 * mult),
    def: Math.floor(10 * mult),
  }
}

async function sb(path, init = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
  const text = await r.text()
  return text ? JSON.parse(text) : null
}

async function uploadToStorage(bucket, path, buffer) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: buffer,
  })
  if (!r.ok) throw new Error(`Storage upload ${r.status}: ${await r.text()}`)
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

async function urlToFile(url, filename) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`download ref ${r.status}`)
  const ab = await r.arrayBuffer()
  return new File([ab], filename, { type: 'image/png' })
}

async function genImage({ prompt, referenceUrls = [], size = '1536x1024', quality = 'medium' }) {
  if (referenceUrls.length > 0) {
    const refs = await Promise.all(
      referenceUrls.slice(0, 4).map((u, i) => urlToFile(u, `ref_${i}.png`)),
    )
    const resp = await openai.images.edit({ model: 'gpt-image-2', image: refs, prompt, size, quality })
    return Buffer.from(resp.data[0].b64_json, 'base64')
  }
  const resp = await openai.images.generate({ model: 'gpt-image-2', prompt, size, quality })
  return Buffer.from(resp.data[0].b64_json, 'base64')
}

// ============ 段 1：LLM 章节生成 ============

async function callNarrator(args) {
  const tierLabel = SCENE_TIER_LABEL[args.sceneTier] ?? args.sceneTier

  const sysPrompt = `你是一位幻想冒险叙事大师。角色"${args.characterName}"带着 ${args.activePets.length} 只宠物伙伴，今日体力 ${args.stamina}（睡了 ${Math.round(args.durationMin / 60)} 小时，恢复 ${args.recoveryScore}%），可达"${tierLabel}"级别区域。

请用中文生成 ${args.chapterCount} 个连续章节，组合起来是一段完整冒险。每章 2-3 句紧凑描写，覆盖一个事件（遭遇/发现/挑战/宠物互动），章节之间有时间推进感。

每章字段：
- title: 短句标题（4-8 字）
- body: 2-3 句正文（50-100 字）
- unlock_offset_min: 距离冒险开始的分钟数。第 1 章 = 0，最后一章 ≈ ${args.durationMin}，中间章节均匀分布。

最后用 story_md 字段把所有章节合成一段完整 markdown（每章用 ## 标题 + 正文段落）。

主稀有度档位：**${args.rarityTier}**（严格按这个档位分配掉落，80% 在档，20% 浮动 ±1 档）：
- legendary 档：必出 ancient_rune（远古符文）+ 可能 epic 装备 + 高几率宠物蛋
- epic 档：star_fragment + 可能 rare 装备 + 中等宠物蛋
- rare 档：rare_herb + common 装备
- common 档：health_potion / energy_drink

宠物遭遇规则（场景 ${args.sceneType}，档位 ${args.sceneTier}）：
- 80% 概率出现野生宠物。**rarity 必须 = ${args.rarityTier}**
- 即兴创作：name（中文）, description（2-3 句外观/性格）, element（元素属性自由发挥）
- base_prompt 字段只写**生物本身的外观特征描述**（英文，1-2 句，30 字以内），例如 "a fluffy round bunny with one long ear, mint green fur, tiny gold horn"。**不要写背景、不要写风格、不要写构图、不要写颜色调色板** —— 这些会由系统统一拼接。
- caught 概率：common 90%, rare 75%, epic 50%, legendary 25%

EXP 奖励：体力越高 EXP 越多，common ≈ 20-40, rare ≈ 40-60, epic ≈ 60-80, legendary ≈ 80-100。

绝对不能编造不在 item_slug 列表里的物品。image_prompt 字段只写**场景内容描述**（英文，30-50 字，描述该地点 + 角色和宠物在做什么）。不要写风格、不要写颜色 hex、不要写"doodle style" —— 这些由系统统一拼接。`

  const userPrompt = JSON.stringify({
    scene_type: args.sceneType,
    scene_tier: args.sceneTier,
    rarity_tier: args.rarityTier,
    stamina: args.stamina,
    recovery_score: args.recoveryScore,
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
                  item_slug: { type: 'string', enum: ITEM_SLUGS },
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

async function fillStory(adv) {
  const start = Date.now()
  console.log(`\n[story] === ${adv.id.slice(0, 8)} (${adv.scene_type}/${adv.scene_tier}) ===`)

  // 1. 角色 + 体力 + 三维（character_state 已被 trigger 写好了）
  const csList = await sb(
    `character_state?user_id=eq.${adv.user_id}&select=name,today_stamina,today_scene_tier,today_rarity_tier`,
  )
  const cs = csList[0]
  if (!cs) throw new Error(`character_state 不存在 user=${adv.user_id}`)
  const characterName = cs.name || 'Hermes'

  // 2. active 宠物
  const activePets = await sb(
    `user_pets?user_id=eq.${adv.user_id}&is_active=eq.true&select=name,nickname,evolution_stage,level,element`,
  )

  // 3. 推今日 settlement 拿 recovery（兜底用 cs 信号）
  const today = new Date().toISOString().slice(0, 10)
  const dsList = await sb(
    `daily_settlements?user_id=eq.${adv.user_id}&date=eq.${today}&select=recovery_score`,
  )
  const recoveryScore = dsList[0]?.recovery_score ?? 50

  // 4. 章节数
  const chapterCount = Math.max(3, Math.min(8, Math.round((adv.duration_min ?? 480) / 60)))

  // 5. 调 LLM
  console.log(`  - LLM gpt-4o-mini (${chapterCount} 章)`)
  const llm = await callNarrator({
    sceneType: adv.scene_type,
    sceneTier: adv.scene_tier,
    rarityTier: adv.rarity_tier,
    stamina: adv.stamina_used ?? cs.today_stamina ?? 0,
    recoveryScore,
    chapterCount,
    durationMin: adv.duration_min ?? 480,
    characterName,
    activePets: activePets.map((p) => ({
      name: p.name,
      nickname: p.nickname,
      stage: p.evolution_stage,
      level: p.level,
      element: p.element,
    })),
  })

  // 6. 校验/补全章节（LM 偶尔会乱给 unlock_offset_min）
  const dur = adv.duration_min ?? 480
  const chapters = (llm.chapters || []).slice(0, chapterCount).map((c, i) => ({
    idx: i,
    title: c.title || `第 ${i + 1} 章`,
    body: c.body || '',
    unlock_offset_min: i === 0 ? 0 : Math.round((dur / (chapterCount - 1)) * i),
  }))
  while (chapters.length < chapterCount) {
    const i = chapters.length
    chapters.push({
      idx: i,
      title: `第 ${i + 1} 章`,
      body: '冒险继续...',
      unlock_offset_min: i === 0 ? 0 : Math.round((dur / (chapterCount - 1)) * i),
    })
  }

  // 7. 写掉落
  const validDrops = (llm.drops || []).filter((d) => ITEM_SLUGS.includes(d.item_slug))
  for (const drop of validDrops) {
    const existing = await sb(
      `user_inventory?user_id=eq.${adv.user_id}&item_slug=eq.${drop.item_slug}&equipped=eq.false&select=id,qty`,
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
          user_id: adv.user_id,
          item_slug: drop.item_slug,
          qty: drop.qty,
          acquired_adventure_id: adv.id,
        }),
      })
    }
  }

  // 8. 宠物捕获
  let userPetId
  if (llm.pet_encounter && llm.pet_encounter.caught) {
    const meta = llm.pet_encounter
    const inserted = await sb(`user_pets`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: adv.user_id,
        name: meta.name,
        description: meta.description,
        base_prompt: meta.base_prompt,
        rarity: meta.rarity,
        element: meta.element,
        habitat_origin: adv.scene_type,
        max_stage: rarityToMaxStage(meta.rarity),
        nickname: meta.name,
        evolution_stage: 1,
        caught_adventure_id: adv.id,
        stats: defaultStats(meta.rarity),
      }),
    })
    userPetId = inserted[0].id
  }

  // 9. 写 adventure 段 1 完成
  await sb(`adventures?id=eq.${adv.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      story_md: llm.story_md,
      chapters,
      rewards: { items: validDrops, exp: llm.exp_reward },
      pet_encounter: llm.pet_encounter
        ? { ...llm.pet_encounter, user_pet_id: userPetId ?? null }
        : null,
      references_used: [`__PROMPT__:${llm.image_prompt}`],
      status: 'pending_image',
    }),
  })

  const ms = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`[story] ✅ ${adv.id.slice(0, 8)} 章节完成 (${ms}s) → pending_image`)
}

// ============ 段 2：烧图 ============

async function renderImages(adv) {
  const start = Date.now()
  console.log(`\n[image] === ${adv.id.slice(0, 8)} (${adv.scene_type}) ===`)

  const refs = adv.references_used || []
  let imagePrompt = `${adv.scene_type} adventure scene with character and pets, cute doodle art`
  for (const r of refs) {
    if (typeof r === 'string' && r.startsWith('__PROMPT__:')) {
      imagePrompt = r.replace(/^__PROMPT__:/, '')
      break
    }
  }

  const csList = await sb(
    `character_state?user_id=eq.${adv.user_id}&select=character_base_image_url`,
  )
  const charState = csList[0]
  const activePets = await sb(
    `user_pets?user_id=eq.${adv.user_id}&is_active=eq.true&select=current_image_url`,
  )

  const references = []
  if (charState?.character_base_image_url) references.push(charState.character_base_image_url)
  for (const p of activePets) {
    if (p.current_image_url && references.length < 4) references.push(p.current_image_url)
  }

  // 1. 烧场景图（统一风格 + 场景构图）
  const scenePrompt = `SCENE: ${imagePrompt}

${SCENE_COMPOSITION}

${DOODLES_STYLE}`

  console.log(`  - 烧场景图 (refs=${references.length})`)
  const sceneBuf = await genImage({
    prompt: scenePrompt,
    referenceUrls: references,
    size: '1536x1024',
    quality: 'medium',
  })
  const sceneUrl = await uploadToStorage('character-art', `adventures/${adv.id}/scene.png`, sceneBuf)
  console.log(`  ✅ 场景图 ${(sceneBuf.length / 1024).toFixed(0)}KB`)

  // 2. 宠物 base 图
  const enc = adv.pet_encounter
  if (enc?.user_pet_id && enc?.caught) {
    const upList = await sb(`user_pets?id=eq.${enc.user_pet_id}&select=*`)
    const userPet = upList[0]
    if (userPet && !userPet.base_image_url) {
      console.log(`  - 烧宠物 base 图: ${userPet.name}`)
      // 拼接统一风格：LLM 只给生物特征 + 系统加构图 + 系统加风格锁
      const petPrompt = `PET CREATURE: ${userPet.base_prompt}

${PET_COMPOSITION}

${DOODLES_STYLE}`
      const petBuf = await genImage({
        prompt: petPrompt,
        size: '1024x1024',
        quality: 'medium',
      })
      const petUrl = await uploadToStorage('character-art', `pets/${userPet.id}/base.png`, petBuf)
      await sb(`user_pets?id=eq.${userPet.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ base_image_url: petUrl, current_image_url: petUrl }),
      })
      console.log(`  ✅ 宠物图 ${(petBuf.length / 1024).toFixed(0)}KB`)
    }
  }

  // 3. 标完成
  await sb(`adventures?id=eq.${adv.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      scene_image_url: sceneUrl,
      references_used: references,
      status: 'completed',
    }),
  })

  const ms = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`[image] ✅ ${adv.id.slice(0, 8)} 完成 (${ms}s)`)
}

async function main() {
  // 段 1：先把所有 pending_story 的章节填好
  const pendingStory = await sb(
    `adventures?status=eq.pending_story&select=*&order=created_at.asc&limit=${MAX_PER_RUN}`,
  )
  console.log(`[worker] pending_story: ${pendingStory.length}`)

  for (const adv of pendingStory) {
    try {
      await fillStory(adv)
    } catch (e) {
      console.error(`[worker] ❌ story ${adv.id.slice(0, 8)}:`, e.message)
      await sb(`adventures?id=eq.${adv.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'failed' }),
      }).catch(() => {})
    }
  }

  // 段 2：再扫所有 pending_image（含旧 pending 兼容）
  const pendingImage = await sb(
    `adventures?or=(status.eq.pending_image,and(status.eq.pending,scene_image_url.is.null))&select=*&order=created_at.asc&limit=${MAX_PER_RUN}`,
  )
  console.log(`[worker] pending_image: ${pendingImage.length}`)

  for (const adv of pendingImage) {
    try {
      await renderImages(adv)
    } catch (e) {
      console.error(`[worker] ❌ image ${adv.id.slice(0, 8)}:`, e.message)
      await sb(`adventures?id=eq.${adv.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'failed' }),
      }).catch(() => {})
    }
  }

  console.log('\n[worker] 全部任务完成')
}

main().catch((e) => {
  console.error('[worker] 致命错误:', e)
  process.exit(1)
})
