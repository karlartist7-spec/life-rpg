#!/usr/bin/env node
/**
 * GitHub Actions 烧图 worker（独立版 — 不依赖 Vercel render endpoint）
 *
 * 每次跑：
 * 1. Supabase 查 status='pending' 且 scene_image_url IS NULL 的 adventures
 * 2. 直接调 OpenAI gpt-image-2 烧图
 * 3. 直接上传 Supabase Storage
 * 4. 回写 adventures.scene_image_url + status='completed'
 * 5. 如果有捕获的宠物（无 base_image_url），也烧
 *
 * 为啥不用 Vercel render endpoint？Hobby plan 60s timeout 跑不完一张图。
 * GitHub Actions 上限 6 小时，绰绰有余。
 *
 * 环境变量：
 *   OPENAI_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import OpenAI from 'openai'
import { Buffer } from 'node:buffer'

const MAX_PER_RUN = 5

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('缺少环境变量')
  process.exit(1)
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

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
      referenceUrls.slice(0, 4).map((u, i) => urlToFile(u, `ref_${i}.png`))
    )
    const resp = await openai.images.edit({
      model: 'gpt-image-2',
      image: refs,
      prompt,
      size,
      quality,
    })
    return Buffer.from(resp.data[0].b64_json, 'base64')
  } else {
    const resp = await openai.images.generate({
      model: 'gpt-image-2',
      prompt,
      size,
      quality,
    })
    return Buffer.from(resp.data[0].b64_json, 'base64')
  }
}

async function renderOne(adv) {
  const start = Date.now()
  console.log(`\n[worker] === ${adv.id} (${adv.scene_type}) ===`)

  // 取 image_prompt（暂存在 references_used[0] 的 __PROMPT__: 前缀里）
  const refs = adv.references_used || []
  let imagePrompt = `${adv.scene_type} adventure scene with character and pets, cute doodle art`
  for (const r of refs) {
    if (typeof r === 'string' && r.startsWith('__PROMPT__:')) {
      imagePrompt = r.replace(/^__PROMPT__:/, '')
      break
    }
  }

  // 取角色 + active 宠物 base 作 reference
  const charState = (
    await sb(`character_state?user_id=eq.${adv.user_id}&select=character_base_image_url`)
  )[0]
  const activePets = await sb(
    `user_pets?user_id=eq.${adv.user_id}&is_active=eq.true&select=current_image_url`
  )

  const references = []
  if (charState?.character_base_image_url) references.push(charState.character_base_image_url)
  for (const p of activePets) {
    if (p.current_image_url && references.length < 4) references.push(p.current_image_url)
  }

  // 1. 烧场景图
  const scenePrompt = `${imagePrompt}

视觉风格：cute doodle art, pastel colors, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), playful, no text, no emoji, no logos.
关键：保持 reference 图中角色和宠物的视觉一致性。`

  console.log(`  - 烧场景图 (refs=${references.length})`)
  const sceneBuf = await genImage({
    prompt: scenePrompt,
    referenceUrls: references,
    size: '1536x1024',
    quality: 'medium',
  })
  const sceneUrl = await uploadToStorage('character-art', `adventures/${adv.id}/scene.png`, sceneBuf)
  console.log(`  ✅ 场景图 ${(sceneBuf.length / 1024).toFixed(0)}KB → ${sceneUrl}`)

  // 2. 如果有捕获的宠物，烧宠物 base 图
  let petImageUrl
  const enc = adv.pet_encounter
  if (enc?.user_pet_id && enc?.caught) {
    const userPet = (await sb(`user_pets?id=eq.${enc.user_pet_id}&select=*`))[0]
    if (userPet && !userPet.base_image_url) {
      console.log(`  - 烧宠物 base 图: ${userPet.name}`)
      const petBuf = await genImage({
        prompt: userPet.base_prompt,
        size: '1024x1024',
        quality: 'medium',
      })
      petImageUrl = await uploadToStorage('character-art', `pets/${userPet.id}/base.png`, petBuf)
      await sb(`user_pets?id=eq.${userPet.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          base_image_url: petImageUrl,
          current_image_url: petImageUrl,
        }),
      })
      console.log(`  ✅ 宠物图 ${(petBuf.length / 1024).toFixed(0)}KB → ${petImageUrl}`)
    }
  }

  // 3. 回写 adventure
  await sb(`adventures?id=eq.${adv.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      scene_image_url: sceneUrl,
      references_used: references,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }),
  })

  const dur = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`[worker] ✅ ${adv.id} 完成 (${dur}s)`)
}

async function main() {
  const pending = await sb(
    `adventures?status=eq.pending&scene_image_url=is.null&select=*&order=created_at.asc&limit=${MAX_PER_RUN}`
  )

  if (pending.length === 0) {
    console.log('[worker] 无 pending adventure，退出')
    return
  }

  console.log(`[worker] 发现 ${pending.length} 个 pending adventure`)

  // 串行（避免 OpenAI rate limit + GitHub Actions 单机就够）
  for (const adv of pending) {
    try {
      await renderOne(adv)
    } catch (e) {
      console.error(`[worker] ❌ ${adv.id} 失败:`, e.message)
      // 标记 failed 避免反复重试
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
