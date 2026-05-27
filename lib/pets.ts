/**
 * 宠物 CRUD + 进化 + 出站名额管理
 */

import { generateAndUpload } from './image-gen'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!

export type Pet = {
  id: string
  slug: string
  name: string
  description: string | null
  base_prompt: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  primary_element: string | null
  evolution_chain: string[]
  max_stage: number
  habitat: string[]
  catch_rate: number
}

export type UserPet = {
  id: string
  user_id: string
  pet_slug: string
  nickname: string | null
  level: number
  exp: number
  evolution_stage: number
  base_image_url: string | null
  current_image_url: string | null
  evolution_history: Array<{ stage: number; image_url: string; evolved_at: string }>
  is_active: boolean
  caught_at: string
  caught_adventure_id: string | null
  stats: Record<string, number>
}

const MAX_ACTIVE_PETS = 3

/** Supabase REST 调用工具 */
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

export async function getPetSpecies(slug: string): Promise<Pet> {
  const rows: Pet[] = await sb(`pets?slug=eq.${slug}&select=*`)
  if (!rows.length) throw new Error(`未知宠物物种: ${slug}`)
  return rows[0]
}

export async function listUserPets(userId: string): Promise<UserPet[]> {
  return sb(`user_pets?user_id=eq.${userId}&select=*&order=caught_at.desc`)
}

export async function getActivePets(userId: string): Promise<UserPet[]> {
  return sb(`user_pets?user_id=eq.${userId}&is_active=eq.true&select=*&order=caught_at.asc`)
}

export async function setPetActive(
  userId: string,
  userPetId: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (active) {
    const activeCount = (await getActivePets(userId)).length
    const target = (await sb(`user_pets?id=eq.${userPetId}&select=is_active`))[0]
    if (!target) return { ok: false, error: 'PET_NOT_FOUND' }
    if (!target.is_active && activeCount >= MAX_ACTIVE_PETS) {
      return { ok: false, error: 'PET_SLOT_FULL' }
    }
  }
  await sb(`user_pets?id=eq.${userPetId}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: active }),
  })
  return { ok: true }
}

/**
 * 捕获新宠物：创建实例 + 即时生成 base 图（作为永久 reference）
 */
export async function catchPet(
  userId: string,
  petSlug: string,
  adventureId: string | null,
  nickname?: string
): Promise<UserPet> {
  const species = await getPetSpecies(petSlug)

  // 1. 创建 user_pets 行（图先空着）
  const inserted: UserPet[] = await sb(`user_pets`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      pet_slug: petSlug,
      nickname: nickname || species.name,
      evolution_stage: 1,
      caught_adventure_id: adventureId,
      stats: defaultStats(species.rarity),
    }),
  })
  const userPet = inserted[0]

  // 2. 生成 base 图 → 上传 → 回写 base_image_url + current_image_url
  const gen = await generateAndUpload({
    prompt: species.base_prompt,
    bucket: 'character-art',
    storagePath: `pets/${userPet.id}/base.png`,
    quality: 'high',
  })

  const updated: UserPet[] = await sb(`user_pets?id=eq.${userPet.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      base_image_url: gen.publicUrl,
      current_image_url: gen.publicUrl,
    }),
  })
  return updated[0]
}

/**
 * 宠物进化：用当前形态作 reference 生成下一形态
 */
export async function evolvePet(userPetId: string): Promise<UserPet> {
  const userPet: UserPet = (await sb(`user_pets?id=eq.${userPetId}&select=*`))[0]
  if (!userPet) throw new Error('宠物不存在')

  const species = await getPetSpecies(userPet.pet_slug)
  if (userPet.evolution_stage >= species.max_stage) {
    throw new Error(`已是最终形态（${species.max_stage} 阶）`)
  }
  if (species.evolution_chain.length < userPet.evolution_stage + 1) {
    throw new Error('进化链未定义')
  }

  const nextStage = userPet.evolution_stage + 1
  const nextSlug = species.evolution_chain[nextStage - 1]
  const nextSpecies = await getPetSpecies(nextSlug)

  // 用当前 image 作 reference + 新物种的 prompt 生成进化形态
  const evolutionPrompt = `${nextSpecies.base_prompt}\n\n关键：保持与 reference 图角色的视觉一致性（同样的配色、眼神、轮廓 DNA），但形态升级为更强大、更成熟的版本。这是同一只宠物的进化形态。`

  const gen = await generateAndUpload({
    prompt: evolutionPrompt,
    referenceUrls: [userPet.current_image_url!],
    bucket: 'character-art',
    storagePath: `pets/${userPet.id}/evo-${nextStage}.png`,
    quality: 'high',
  })

  // 把当前形态推入 history，更新 current_image_url + stage + pet_slug
  const newHistory = [
    ...userPet.evolution_history,
    {
      stage: userPet.evolution_stage,
      image_url: userPet.current_image_url!,
      evolved_at: new Date().toISOString(),
    },
  ]

  const updated: UserPet[] = await sb(`user_pets?id=eq.${userPetId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      pet_slug: nextSlug,
      evolution_stage: nextStage,
      current_image_url: gen.publicUrl,
      evolution_history: newHistory,
      stats: defaultStats(nextSpecies.rarity),
    }),
  })
  return updated[0]
}

/**
 * 增加宠物经验，自动升级 + 自动进化（20/40 级触发）
 */
export async function addPetExp(
  userPetId: string,
  expDelta: number
): Promise<{ leveledUp: boolean; level: number; evolved: boolean }> {
  const userPet: UserPet = (await sb(`user_pets?id=eq.${userPetId}&select=*`))[0]
  let { level, exp } = userPet
  let leveledUp = false

  exp += expDelta
  while (exp >= levelCurve(level)) {
    exp -= levelCurve(level)
    level += 1
    leveledUp = true
  }

  await sb(`user_pets?id=eq.${userPetId}`, {
    method: 'PATCH',
    body: JSON.stringify({ level, exp }),
  })

  // 自动进化检查
  let evolved = false
  const species = await getPetSpecies(userPet.pet_slug)
  if (
    (level >= 20 && userPet.evolution_stage === 1 && species.max_stage >= 2) ||
    (level >= 40 && userPet.evolution_stage === 2 && species.max_stage >= 3)
  ) {
    try {
      await evolvePet(userPetId)
      evolved = true
    } catch (e) {
      console.warn(`auto-evolve 失败 ${userPetId}:`, e)
    }
  }

  return { leveledUp, level, evolved }
}

function levelCurve(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5))
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
