/**
 * 共享渲染模块：风格锁 + 稀有度背景色 + 生图/上传工具
 *
 * 给 worker (render-pending-adventures.mjs) 和 reset 脚本 (reset-all-images.mjs) 共用。
 * Single source of truth — 风格规则改一次两边都生效。
 */
import OpenAI from 'openai'
import { Buffer } from 'node:buffer'

// ============ 稀有度 → 背景色 ============
// 呼应官网糖果调色板，宠物 base 图按稀有度选色，一眼分档位
export const RARITY_BG = {
  common: { hex: '#7FE3B0', name: 'mint green' },
  rare: { hex: '#9ED8F5', name: 'sky blue' },
  epic: { hex: '#7C7BE8', name: 'periwinkle purple-blue' },
  legendary: { hex: '#FFD84D', name: 'sunshine yellow' },
}

// ============ 风格锁 ============
// 与官网 life-rpg-steel.vercel.app 一致：Doodles + Neo-brutalism
// 场景图用奶油底（多元素不抢色），宠物图按稀有度上糖果色
export function doodlesStyleLock(opts = {}) {
  const bg = opts.background || { hex: '#FAF8F3', name: 'cream off-white' }
  return `
STYLE LOCK (mandatory, do not deviate):
- Doodles NFT illustration style, neo-brutalism cartoon aesthetic
- Solid ${bg.name} background ${bg.hex} (NO gradients, NO photo backgrounds, NO patterns, NO scenery behind subject)
- Subject color palette: pastel candy colors — mint green #7FE3B0, candy pink #FF8FCB, periwinkle #7C7BE8, sunshine yellow #FFD84D, coral #FF7B7B, sky blue #9ED8F5, lilac #C9A8FF. Pick colors that CONTRAST with the ${bg.name} background so the subject pops.
- VERY BOLD black outline on EVERY shape — thick chunky lines, like a marker pen drawing, not thin sketch lines. Same line weight on character, pet, and background elements.
- HARD OFFSET DROP SHADOW on every character, pet, and major background element: a solid pure black #000 silhouette offset 8 pixels right and 8 pixels down behind the shape, with absolutely zero blur. This shadow is a visible SECOND BLACK SHAPE, not a subtle effect. Think sticker-on-paper or screenprint poster.
- Flat fills, no shading, no gradients, no texture, no airbrush, no cel-shading
- Cute chibi proportions, friendly facial expression, big round eyes
- Subject(s) centered, full body visible, NO cropping
- ABSOLUTELY NO: text, emoji, watermark, logo, signature, photo-realism, anime style, dark fantasy, gothic, horror, 3D render, sketchy lines, muted/dark colors
`.trim()
}

// 宠物 base 图额外构图约束 —— 接受一个稀有度背景色（reset 时按 rarity 注入）
export function petComposition(bg) {
  return `
COMPOSITION (mandatory for pet portraits):
- Single creature, full body, standing/sitting pose facing camera at slight 3/4 angle
- Subject occupies ~70% of frame, centered, plenty of breathing room
- Solid ${bg.name} ${bg.hex} background — NO environment, NO floor, NO shadow on ground, NO decorations
- 1:1 square canvas
`.trim()
}

// 场景图额外构图（场景始终奶油底）
export const SCENE_COMPOSITION = `
COMPOSITION (mandatory for scene illustration):
- Wide landscape 3:2 ratio canvas
- Show the protagonist character + their active pets exploring (do not draw new pets, use reference images for character/pet appearance)
- All shapes drawn with VERY THICK 4-5px PURE BLACK outline (NOT gray, NOT brown, NOT thin — must be unmistakably bold)
- Every distinct element (character, pet, tree, rock, etc.) gets its own hard offset drop shadow (5px right + 5px down, pure #000, zero blur)
- Background is solid cream #FAF8F3 with sparse doodle-style flat shapes (3-5 max simple elements like a tree-blob, rock-blob, flower) — NOT a dense painted landscape
- Lots of empty cream space, NOT crowded — Neo-brutalism breathes
- Limit to 4 visible characters/pets total in the frame, no extra creatures
`.trim()

// ============ OpenAI 生图工具 ============

export function makeOpenAI(apiKey) {
  return new OpenAI({ apiKey })
}

async function urlToFile(url, filename) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`download ref ${r.status}`)
  const ab = await r.arrayBuffer()
  return new File([ab], filename, { type: 'image/png' })
}

export async function genImage(openai, { prompt, referenceUrls = [], size = '1536x1024', quality = 'medium' }) {
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

// ============ Supabase Storage 上传 ============

export async function uploadToStorage(supabaseUrl, serviceRoleKey, bucket, path, buffer) {
  const r = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: buffer,
  })
  if (!r.ok) throw new Error(`Storage upload ${r.status}: ${await r.text()}`)
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}

// ============ Supabase REST 客户端 ============

export function makeSb(supabaseUrl, serviceRoleKey) {
  return async function sb(path, init = {}) {
    const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(init.headers || {}),
      },
    })
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
    const text = await r.text()
    return text ? JSON.parse(text) : null
  }
}
