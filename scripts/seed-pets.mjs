#!/usr/bin/env node
/**
 * Seed 8 个初始宠物物种到 pets 表
 */

import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY

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

const PETS = [
  // 3-stage 火龙进化链
  {
    slug: 'baby_drake',
    name: '火苗龙宝',
    description: '刚孵化的小火龙，尾巴上燃烧着微弱的火苗',
    rarity: 'common',
    primary_element: '火',
    evolution_chain: ['baby_drake', 'drake', 'elder_drake'],
    max_stage: 3,
    habitat: ['cave', 'mountain', 'ruin'],
    catch_rate: 0.5,
    base_prompt:
      'A tiny baby dragon with a small flame on its tail, round friendly eyes, chubby body, cute doodle art style, pastel orange and cream colors, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), simple shapes, playful, soft cream background, 1:1 square, centered, NO text, NO emoji, NO logos',
  },
  {
    slug: 'drake',
    name: '烈焰龙',
    description: '成长后的火龙，火焰更加旺盛，开始展现龙族威严',
    rarity: 'rare',
    primary_element: '火',
    evolution_chain: ['baby_drake', 'drake', 'elder_drake'],
    max_stage: 3,
    habitat: ['cave', 'mountain', 'ruin'],
    catch_rate: 0.2,
    base_prompt:
      'A young dragon with bright flames, confident posture, sleek body, cute doodle art style, vibrant orange and red colors, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), simple shapes, playful yet powerful, soft cream background, 1:1 square, centered, NO text, NO emoji, NO logos',
  },
  {
    slug: 'elder_drake',
    name: '永恒龙王',
    description: '火龙的最终形态，掌控烈焰的古老龙王',
    rarity: 'epic',
    primary_element: '火',
    evolution_chain: ['baby_drake', 'drake', 'elder_drake'],
    max_stage: 3,
    habitat: ['cave', 'mountain', 'ruin'],
    catch_rate: 0.05,
    base_prompt:
      'A majestic elder dragon with blazing flames, regal horns, powerful wings, cute doodle art style, deep red and gold colors, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), simple shapes, commanding presence, soft cream background, 1:1 square, centered, NO text, NO emoji, NO logos',
  },

  // 2-stage 水精灵
  {
    slug: 'water_sprite',
    name: '水滴精灵',
    description: '由纯净水滴凝聚而成的小精灵',
    rarity: 'common',
    primary_element: '水',
    evolution_chain: ['water_sprite', 'tide_fairy'],
    max_stage: 2,
    habitat: ['ocean', 'forest'],
    catch_rate: 0.4,
    base_prompt:
      'A small water sprite made of droplets, sparkling eyes, translucent body, cute doodle art style, pastel blue and aqua colors, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), simple shapes, playful, soft cream background, 1:1 square, centered, NO text, NO emoji, NO logos',
  },
  {
    slug: 'tide_fairy',
    name: '潮汐妖精',
    description: '掌控潮汐之力的水之妖精',
    rarity: 'rare',
    primary_element: '水',
    evolution_chain: ['water_sprite', 'tide_fairy'],
    max_stage: 2,
    habitat: ['ocean', 'forest'],
    catch_rate: 0.15,
    base_prompt:
      'A graceful water fairy with flowing water ribbons, elegant pose, cute doodle art style, vibrant blue and teal colors, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), simple shapes, mystical, soft cream background, 1:1 square, centered, NO text, NO emoji, NO logos',
  },

  // 1-stage 风雀
  {
    slug: 'wind_sparrow',
    name: '风之雀',
    description: '轻盈的风元素小鸟，翅膀带着微风',
    rarity: 'common',
    primary_element: '风',
    evolution_chain: ['wind_sparrow'],
    max_stage: 1,
    habitat: ['forest', 'mountain'],
    catch_rate: 0.6,
    base_prompt:
      'A small bird with wind swirls around wings, cheerful expression, cute doodle art style, pastel mint and white colors, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), simple shapes, playful, soft cream background, 1:1 square, centered, NO text, NO emoji, NO logos',
  },

  // 2-stage 苔藓兽
  {
    slug: 'mossling',
    name: '苔藓幼兽',
    description: '身上长满苔藓的森林小兽',
    rarity: 'common',
    primary_element: '土',
    evolution_chain: ['mossling', 'forest_guardian'],
    max_stage: 2,
    habitat: ['forest', 'ruin'],
    catch_rate: 0.45,
    base_prompt:
      'A small creature covered in moss and tiny plants, round body, gentle eyes, cute doodle art style, pastel green and brown colors, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), simple shapes, peaceful, soft cream background, 1:1 square, centered, NO text, NO emoji, NO logos',
  },
  {
    slug: 'forest_guardian',
    name: '森林守护',
    description: '进化后的森林守护者，身上长满古树',
    rarity: 'epic',
    primary_element: '土',
    evolution_chain: ['mossling', 'forest_guardian'],
    max_stage: 2,
    habitat: ['forest', 'ruin'],
    catch_rate: 0.1,
    base_prompt:
      'A large guardian creature with ancient trees growing on its back, wise expression, cute doodle art style, deep green and earthy colors, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), simple shapes, majestic, soft cream background, 1:1 square, centered, NO text, NO emoji, NO logos',
  },

  // 1-stage 稀有影猫
  {
    slug: 'shadow_cat',
    name: '影猫',
    description: '神秘的暗影猫，身影若隐若现',
    rarity: 'rare',
    primary_element: '暗',
    evolution_chain: ['shadow_cat'],
    max_stage: 1,
    habitat: ['cave', 'ruin', 'astral'],
    catch_rate: 0.25,
    base_prompt:
      'A mysterious cat with shadowy wisps, glowing eyes, sleek silhouette, cute doodle art style, dark purple and black colors with pastel accents, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), simple shapes, enigmatic, soft cream background, 1:1 square, centered, NO text, NO emoji, NO logos',
  },

  // 1-stage 传说独角兽
  {
    slug: 'radiant_unicorn',
    name: '光辉独角',
    description: '传说中的光之独角兽，极其罕见',
    rarity: 'legendary',
    primary_element: '光',
    evolution_chain: ['radiant_unicorn'],
    max_stage: 1,
    habitat: ['astral', 'ruin'],
    catch_rate: 0.05,
    base_prompt:
      'A radiant unicorn with glowing horn, ethereal mane, elegant stance, cute doodle art style, pastel gold and white colors with sparkles, thick 2px black outline, hard offset drop shadow (5px right, 5px down, pure black), simple shapes, divine, soft cream background, 1:1 square, centered, NO text, NO emoji, NO logos',
  },
]

async function main() {
  let inserted = 0
  let skipped = 0

  for (const pet of PETS) {
    const existing = await sb(`pets?slug=eq.${pet.slug}&select=id`)
    if (existing.length) {
      console.log(`[skip] ${pet.slug} 已存在`)
      skipped++
      continue
    }
    await sb(`pets`, {
      method: 'POST',
      body: JSON.stringify(pet),
    })
    console.log(`[✓] ${pet.slug} (${pet.name})`)
    inserted++
  }

  console.log(`\n=== 完成 ===`)
  console.log(`插入: ${inserted}, 跳过: ${skipped}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
