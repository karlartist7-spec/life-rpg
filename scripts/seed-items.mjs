#!/usr/bin/env node
/**
 * Seed 物品目录到 items 表
 * 用 lib/adventures.ts 里的 seedItemCatalog()
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY

// 必须与 lib/adventures.ts 的 ITEM_CATALOG 保持一致
const ITEMS = [
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
]

async function sb(path, init = {}) {
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

async function main() {
  let inserted = 0
  let skipped = 0
  for (const item of ITEMS) {
    const existing = await sb(`items?slug=eq.${item.slug}&select=id`)
    if (existing.length) {
      skipped++
      console.log(`[skip] ${item.slug}`)
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
    console.log(`[✓] ${item.slug} (${item.name})`)
    inserted++
  }
  console.log(`\n=== 完成 ===\n插入: ${inserted}, 跳过: ${skipped}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
