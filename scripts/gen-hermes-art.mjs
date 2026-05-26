#!/usr/bin/env node
/**
 * 生成 Hermes 角色立绘 + 3 个状态变体，上传到 Supabase Storage。
 *
 * 流程：
 *   1. 用 prompt 生 base（卡通形象，神色中性）
 *   2. 用 base.png 当 reference + variation prompt 生 3 张同形象不同表情
 *      - state-high: 精力充沛、笑容、双手叉腰
 *      - state-mid:  正常、淡定微笑
 *      - state-low:  疲惫、垂肩、眯眼
 *   3. 全部上传到 character-art bucket
 *
 * 用法：node scripts/gen-hermes-art.mjs
 *
 * 依赖：openai sdk + node fetch（Node 20+ 原生）
 */

import OpenAI from 'openai'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'

config({ path: resolve(process.cwd(), '.env.local') })

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY

const CHARACTER_DESCRIPTION = `
A friendly cartoon character named Hermes, designed in modern Doodles NFT inspired style:
- Round friendly face with big expressive eyes
- Short messy dark hair with a single bright accent strand (lavender purple)
- Wearing a cozy cream/off-white hoodie with simple geometric pattern (soft mint and pastel pink accents)
- 2px bold black outlines, flat colors, no gradients or blur
- Soft cream/pastel background
- Hard offset drop shadow (5px right, 5px down, pure black)
- Square 1:1 aspect ratio, centered, half-body shot
- Style: Doodles NFT, hand-drawn, playful, modern, professional
- IMPORTANT: NO text, NO emoji, NO logos
`

const STATE_PROMPTS = {
  base:
    `${CHARACTER_DESCRIPTION}\nPose: standing upright, calm and friendly neutral expression, looking forward. Default reference pose.`,
  high:
    `${CHARACTER_DESCRIPTION}\nPose: energetic and confident — bright wide smile, eyes sparkling with joy, fists up at chest, slight body lean forward as if ready to take action. Aura of high energy and recovery.`,
  mid:
    `${CHARACTER_DESCRIPTION}\nPose: calm and steady — gentle relaxed smile, eyes half-closed in contentment, arms loose at sides, slight head tilt. Aura of balance and moderate energy.`,
  low:
    `${CHARACTER_DESCRIPTION}\nPose: tired but cute — small tired smile, droopy sleepy eyes (one eye more closed), shoulders slightly slumped, one hand rubbing the back of head. Aura of low energy, needs rest. A small zZ symbol floating near head.`,
}

async function genImage(prompt, outName) {
  console.log(`\n[gen] ${outName} ...`)
  const t0 = Date.now()
  const resp = await openai.images.generate({
    model: 'gpt-image-2',
    prompt,
    size: '1024x1024',
    quality: 'high',
    n: 1,
  })
  const b64 = resp.data[0].b64_json
  const bytes = Buffer.from(b64, 'base64')
  const localPath = resolve('public', 'character-art', `${outName}.png`)
  writeFileSync(localPath, bytes)
  console.log(`[gen] ${outName} done in ${Math.round((Date.now() - t0) / 1000)}s, ${(bytes.length / 1024).toFixed(0)}KB → ${localPath}`)
  return bytes
}

async function upload(name, bytes) {
  console.log(`[up] ${name} ...`)
  const path = `hermes/${name}.png`
  const r = await fetch(`${SUPA_URL}/storage/v1/object/${encodeURI('character-art/' + path)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPA_SRV}`,
      apikey: SUPA_SRV,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: bytes,
  })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`upload ${name}: ${r.status} ${txt}`)
  }
  const publicUrl = `${SUPA_URL}/storage/v1/object/public/character-art/${path}`
  console.log(`[up] ${name} → ${publicUrl}`)
  return publicUrl
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const which = args.size ? [...args] : ['base', 'high', 'mid', 'low']

  // 准备本地 dir
  mkdirSync(resolve('public', 'character-art'), { recursive: true })

  const results = {}
  for (const key of which) {
    const prompt = STATE_PROMPTS[key]
    if (!prompt) {
      console.error(`unknown state: ${key}`)
      continue
    }
    const fileName = key === 'base' ? 'base' : `state-${key}`
    try {
      const bytes = await genImage(prompt, fileName)
      const url = await upload(fileName, bytes)
      results[key] = url
    } catch (e) {
      console.error(`[fail] ${key}: ${e.message}`)
      results[key] = `ERROR: ${e.message}`
    }
  }

  console.log('\n=== Result ===')
  console.log(JSON.stringify(results, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
