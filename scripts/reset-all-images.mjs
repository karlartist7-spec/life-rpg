#!/usr/bin/env node
/**
 * 一次性脚本：重烧所有宠物 base 图 + 所有 adventures 场景图
 *
 * 用途：旧图风格不统一（早期 base_prompt 把"doodle style"塞进 prompt 污染 + 没有稀有度背景色）。
 * 用新规则统一重烧：worker 同一套 doodlesStyleLock + RARITY_BG + COMPOSITION。
 *
 * 安全设计：
 *   - 串行处理（不并行）：怕 OpenAI rate limit + 容易追日志
 *   - 直接 upsert 覆盖（storage 路径不变 → base_image_url 也不动）
 *   - DRY_RUN=1 环境变量先验证盘点不动手
 *   - LIMIT=N 环境变量限制处理数量（先烧 1-2 张验证再放开）
 *   - 失败一张不阻塞后面（log 错误继续）
 *
 * 环境变量：OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 跑法：
 *   bash /tmp/run-worker.sh-style env 注入  →  node scripts/reset-all-images.mjs
 *   或：DRY_RUN=1 LIMIT=2 node scripts/reset-all-images.mjs  （只看不烧）
 */

import {
  RARITY_BG,
  doodlesStyleLock,
  petComposition,
  SCENE_COMPOSITION,
  makeOpenAI,
  genImage,
  uploadToStorage,
  makeSb,
} from './lib-render.mjs'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.env.DRY_RUN === '1'
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('缺少环境变量 OPENAI_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const openai = makeOpenAI(OPENAI_API_KEY)
const sb = makeSb(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

console.log(`[reset] DRY_RUN=${DRY_RUN} LIMIT=${LIMIT === Infinity ? 'all' : LIMIT}`)

// ============ 清理被污染的 base_prompt ============
// 旧 base_prompt 里塞了"doodle style/pastel colors/ancient ruins"等风格/场景关键词
// 重烧前剥离 —— 只留生物特征部分（取第一句 + 删风格短语）
function cleanBasePrompt(raw) {
  if (!raw) return raw
  // 1) 删常见污染短语（不区分大小写）
  const noise = [
    /in (a |the )?doodles? art style/gi,
    /doodles? style/gi,
    /pastel (color )?palette/gi,
    /pastel colors/gi,
    /with a thick \d+px? black outline/gi,
    /hard offset shadow/gi,
    /full-?body[, ]/gi,
    /centered[, ]/gi,
    /like an? ink wash painting/gi,
    /surrounded by [^.]+/gi,
    /in a pastel [^.]+/gi,
    // 删 "a whimsical creature named 'XXX' (YYY)" 但保留后面的 "with..." 主体描述
    /a whimsical creature named ['""'][^'""']+['""']\s*(\([^)]+\))?\s*/gi,
    /a whimsical creature named [^\s,]+,?\s*/gi,
  ]
  let cleaned = raw
  for (const re of noise) cleaned = cleaned.replace(re, '')
  // 2) 收缩多余空格/标点
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/[,.\s]+([,.])/g, '$1').trim()
  cleaned = cleaned.replace(/^[,.\s]+/, '').replace(/[,.\s]+$/, '')
  return cleaned || raw  // 万一被洗光了就退回原文
}

// ============ 重烧一只宠物 ============
async function resetPet(pet, idx, total) {
  const tag = `[${idx + 1}/${total}] ${pet.name} (${pet.rarity})`
  const bg = RARITY_BG[pet.rarity] || RARITY_BG.common

  const cleaned = cleanBasePrompt(pet.base_prompt)
  const promptChanged = cleaned !== pet.base_prompt

  const finalPrompt = `PET CREATURE: ${cleaned}

${petComposition(bg)}

${doodlesStyleLock({ background: bg })}`

  console.log(`\n${tag}  bg=${bg.hex}`)
  if (promptChanged) {
    console.log(`  · base_prompt 清洗: "${pet.base_prompt.slice(0, 60)}..." → "${cleaned.slice(0, 60)}..."`)
  }

  if (DRY_RUN) {
    console.log(`  · [DRY_RUN] 跳过生图`)
    return { pet, ok: true, dryrun: true, cleaned, promptChanged }
  }

  const t0 = Date.now()
  try {
    const buf = await genImage(openai, { prompt: finalPrompt, size: '1024x1024', quality: 'medium' })
    const path = `pets/${pet.id}/base.png`
    const publicUrl = await uploadToStorage(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'character-art', path, buf)

    // 把清洗后的 prompt 也写回 DB（避免下次再被读到污染版）
    const update = { base_image_url: publicUrl }
    if (promptChanged) update.base_prompt = cleaned
    await sb(`user_pets?id=eq.${pet.id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    })
    console.log(`  ✅ ${(Date.now() - t0) / 1000 | 0}s  ${buf.length / 1024 | 0}KB`)
    return { pet, ok: true }
  } catch (e) {
    console.error(`  ❌ ${e.message}`)
    return { pet, ok: false, error: e.message }
  }
}

// ============ 重烧一个 adventure 场景图 ============
async function resetAdventure(adv, idx, total) {
  const tag = `[${idx + 1}/${total}] adv ${adv.id.slice(0, 8)} (${adv.scene_tier})`

  // 1) 从 chapters 抽场景描述（第一章 body 就是开场场景）
  const chapters = adv.chapters || []
  const sceneDesc = chapters.length > 0 ? chapters[0].body : `A ${adv.scene_type} scene with the protagonist and pets.`
  // 中文 chapter body 直接拼 prompt 也行 —— gpt-image-2 接受多语言
  // 但加一句英文短描述更稳，避免风格被中文叙事漂走
  const imagePrompt = `Scene: ${adv.scene_type} environment. ${sceneDesc}`

  // 2) 拉 character + active pets 作 reference
  const character = await sb(`character_state?user_id=eq.${adv.user_id}&select=character_base_image_url,name`)
  const dispatched = Array.isArray(adv.pets_dispatched) ? adv.pets_dispatched : []
  let references = []
  if (character[0]?.character_base_image_url) references.push(character[0].character_base_image_url)
  if (dispatched.length > 0) {
    const ids = dispatched.slice(0, 3).map((p) => (typeof p === 'string' ? p : p.user_pet_id)).filter(Boolean)
    if (ids.length > 0) {
      const pets = await sb(`user_pets?id=in.(${ids.join(',')})&select=base_image_url,current_image_url`)
      for (const p of pets) {
        if (references.length >= 4) break
        if (p.current_image_url) references.push(p.current_image_url)
        else if (p.base_image_url) references.push(p.base_image_url)
      }
    }
  }

  const finalPrompt = `SCENE: ${imagePrompt}

${SCENE_COMPOSITION}

${doodlesStyleLock({})}`

  console.log(`\n${tag}  refs=${references.length}`)
  if (DRY_RUN) {
    console.log(`  · [DRY_RUN] prompt=${finalPrompt.slice(0, 120)}...`)
    return { adv, ok: true, dryrun: true }
  }

  const t0 = Date.now()
  try {
    const buf = await genImage(openai, {
      prompt: finalPrompt,
      referenceUrls: references,
      size: '1536x1024',
      quality: 'medium',
    })
    const path = `adventures/${adv.id}/scene.png`
    const publicUrl = await uploadToStorage(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'character-art', path, buf)
    await sb(`adventures?id=eq.${adv.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ scene_image_url: publicUrl }),
    })
    console.log(`  ✅ ${(Date.now() - t0) / 1000 | 0}s  ${buf.length / 1024 | 0}KB`)
    return { adv, ok: true }
  } catch (e) {
    console.error(`  ❌ ${e.message}`)
    return { adv, ok: false, error: e.message }
  }
}

// ============ 主流程 ============
async function main() {
  const pets = await sb(`user_pets?select=id,name,rarity,base_prompt&order=created_at.desc`)
  const advs = await sb(`adventures?select=id,user_id,scene_type,scene_tier,chapters,pets_dispatched&scene_image_url=not.is.null&order=started_at.desc`)

  console.log(`\n=== 待处理 ===`)
  console.log(`  宠物: ${pets.length}  按 rarity: ${JSON.stringify(pets.reduce((a, p) => { a[p.rarity] = (a[p.rarity] || 0) + 1; return a }, {}))}`)
  console.log(`  场景: ${advs.length}`)
  const cost = (pets.length + advs.length) * 0.04
  console.log(`  预估成本: ~$${cost.toFixed(2)} (gpt-image-2 medium @ ~$0.04/张)`)
  console.log(`  预估时间: ~${Math.ceil((pets.length + advs.length) * 80 / 60)} 分钟（串行）`)

  // 应用 LIMIT
  const skipPets = process.env.SCENES_ONLY === '1'
  const skipScenes = process.env.PETS_ONLY === '1'
  const petsTodo = skipPets ? [] : pets.slice(0, LIMIT)
  const advsTodo = skipScenes ? [] : advs.slice(0, Math.max(0, LIMIT - petsTodo.length))
  if (LIMIT < pets.length + advs.length) {
    console.log(`\n  ⚠️  LIMIT=${LIMIT}，只处理前 ${petsTodo.length} 宠物 + ${advsTodo.length} 场景`)
  }

  // 1. 宠物
  console.log(`\n=== 重烧宠物 ===`)
  const petResults = []
  for (let i = 0; i < petsTodo.length; i++) {
    petResults.push(await resetPet(petsTodo[i], i, petsTodo.length))
  }

  // 2. 场景
  console.log(`\n=== 重烧场景图 ===`)
  const advResults = []
  for (let i = 0; i < advsTodo.length; i++) {
    advResults.push(await resetAdventure(advsTodo[i], i, advsTodo.length))
  }

  // 汇总
  console.log(`\n=== 汇总 ===`)
  const petOk = petResults.filter((r) => r.ok).length
  const advOk = advResults.filter((r) => r.ok).length
  console.log(`  宠物: ${petOk}/${petResults.length} 成功`)
  console.log(`  场景: ${advOk}/${advResults.length} 成功`)
  const fails = [...petResults, ...advResults].filter((r) => !r.ok)
  if (fails.length > 0) {
    console.log(`  失败项：`)
    for (const f of fails) console.log(`    - ${f.pet?.name || f.adv?.id?.slice(0, 8)}: ${f.error}`)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
