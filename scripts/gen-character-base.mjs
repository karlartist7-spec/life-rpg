#!/usr/bin/env node
/**
 * 一次性脚本：生成角色 Hermes base 全身立绘 + 上传 → 写入 character_state.character_base_image_url
 *
 * 用法：
 *   node scripts/gen-character-base.mjs [user_id]
 *
 * 默认用 secrets 里的 user_id 57f57048-7517-4e60-a74a-565c6a1f9430
 */

import OpenAI from 'openai'
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY

const DEFAULT_USER_ID = '57f57048-7517-4e60-a74a-565c6a1f9430'
const userId = process.argv[2] || DEFAULT_USER_ID

const PROMPT = `A friendly cartoon character named Hermes, designed in modern Doodles NFT inspired style:
- Round friendly face with big expressive eyes
- Short messy dark hair with a single bright accent strand (lavender purple)
- Wearing a cozy cream/off-white hoodie with simple geometric pattern (soft mint and pastel pink accents)
- 2px bold black outlines, flat colors, no gradients or blur
- Soft cream/pastel background
- Hard offset drop shadow (5px right, 5px down, pure black)
- Square 1:1 aspect ratio, centered, full-body shot, standing pose, neutral expression
- This is the canonical base reference for future scenes — character must be clear and complete
- Style: Doodles NFT, hand-drawn, playful, modern, professional
- IMPORTANT: NO text, NO emoji, NO logos`

async function main() {
  console.log(`[1/3] 生成 Hermes base 立绘 (user_id=${userId})...`)
  const t0 = Date.now()

  const resp = await openai.images.generate({
    model: 'gpt-image-2',
    prompt: PROMPT,
    size: '1024x1024',
    quality: 'high',
    response_format: 'b64_json',
    n: 1,
  })
  const b64 = resp.data[0].b64_json
  const bytes = Buffer.from(b64, 'base64')
  console.log(`  ✓ 生成完成 ${Math.round((Date.now() - t0) / 1000)}s, ${(bytes.length / 1024).toFixed(0)}KB`)

  const storagePath = `characters/${userId}/hermes-base.png`
  console.log(`[2/3] 上传到 character-art/${storagePath}...`)
  const upResp = await fetch(
    `${SUPA_URL}/storage/v1/object/${encodeURI('character-art/' + storagePath)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPA_SRV}`,
        apikey: SUPA_SRV,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      },
      body: bytes,
    }
  )
  if (!upResp.ok) throw new Error(`上传失败: ${upResp.status} ${await upResp.text()}`)
  const publicUrl = `${SUPA_URL}/storage/v1/object/public/character-art/${storagePath}`
  console.log(`  ✓ ${publicUrl}`)

  console.log(`[3/3] 更新 character_state.character_base_image_url...`)
  const dbResp = await fetch(
    `${SUPA_URL}/rest/v1/character_state?user_id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPA_SRV,
        Authorization: `Bearer ${SUPA_SRV}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ character_base_image_url: publicUrl }),
    }
  )
  if (!dbResp.ok) {
    const txt = await dbResp.text()
    console.warn(`  ⚠ DB 更新失败（不影响图片，可手动改）: ${dbResp.status} ${txt}`)
  } else {
    const rows = await dbResp.json()
    if (!rows.length) {
      console.warn(`  ⚠ 未找到 character_state 行（user_id=${userId}），请先初始化角色`)
    } else {
      console.log(`  ✓ 已更新`)
    }
  }

  console.log(`\n=== 完成 ===\nBase URL: ${publicUrl}`)
}

main().catch((e) => {
  console.error('FAIL:', e)
  process.exit(1)
})
