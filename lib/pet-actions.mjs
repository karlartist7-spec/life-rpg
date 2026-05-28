// 宠物/背包动作处理（service-role REST）。路由鉴权后传入 userId，函数始终按 userId 过滤。
import { evolutionRequirement, staminaTiers, EQUIP_BONUS } from './progression.mjs'

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
  const t = await r.text()
  return t ? JSON.parse(t) : null
}

/** 校验等级+道具 → 消耗道具 → 标记 pending_render='evolution'。 */
export async function requestEvolution(userId, userPetId) {
  const pets = await sb(
    `user_pets?id=eq.${userPetId}&user_id=eq.${userId}&select=id,level,evolution_stage,max_stage,pending_render`,
  )
  const pet = pets?.[0]
  if (!pet) return { ok: false, code: 404, error: 'PET_NOT_FOUND' }
  if (pet.pending_render) return { ok: false, code: 409, error: 'ALREADY_PENDING' }
  if (pet.evolution_stage >= pet.max_stage) return { ok: false, code: 409, error: 'MAX_STAGE' }

  const target = pet.evolution_stage + 1
  const req = evolutionRequirement(target)
  if (!req) return { ok: false, code: 409, error: 'NO_REQUIREMENT' }
  if ((pet.level ?? 1) < req.level) return { ok: false, code: 409, error: 'LEVEL_TOO_LOW', need: req }

  const inv = await sb(
    `user_inventory?user_id=eq.${userId}&item_slug=eq.${req.item}&equipped=eq.false&select=id,qty`,
  )
  const row = inv?.[0]
  if (!row || row.qty < 1) return { ok: false, code: 409, error: 'MISSING_ITEM', need: req }

  if (row.qty > 1) {
    await sb(`user_inventory?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ qty: row.qty - 1 }) })
  } else {
    await sb(`user_inventory?id=eq.${row.id}`, { method: 'DELETE' })
  }
  await sb(`user_pets?id=eq.${pet.id}`, { method: 'PATCH', body: JSON.stringify({ pending_render: 'evolution' }) })
  return { ok: true, target, item: req.item }
}

async function consumeOne(row) {
  if (row.qty > 1) {
    await sb(`user_inventory?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ qty: row.qty - 1 }) })
  } else {
    await sb(`user_inventory?id=eq.${row.id}`, { method: 'DELETE' })
  }
}

/** 使用物品：energy_drink → +50 体力(重算档位)；health_potion → +1 下次保底掉落；宠物蛋 → 孵化。 */
export async function consumeItem(userId, rowId) {
  const rows = await sb(`user_inventory?id=eq.${rowId}&user_id=eq.${userId}&select=id,item_slug,qty`)
  const row = rows?.[0]
  if (!row || row.qty < 1) return { ok: false, code: 404, error: 'ITEM_NOT_FOUND' }

  if (row.item_slug === 'energy_drink') {
    const cs = (await sb(`character_state?user_id=eq.${userId}&select=today_stamina`))[0]
    const stamina = (cs?.today_stamina ?? 0) + 50
    const t = staminaTiers(stamina)
    await sb(`character_state?user_id=eq.${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ today_stamina: stamina, today_scene_tier: t.scene_tier, today_rarity_tier: t.rarity_tier }),
    })
    await consumeOne(row)
    return { ok: true, effect: 'stamina', stamina, scene_tier: t.scene_tier }
  }

  if (row.item_slug === 'health_potion') {
    const cs = (await sb(`character_state?user_id=eq.${userId}&select=pending_buffs`))[0]
    const buffs = cs?.pending_buffs ?? {}
    buffs.bonus_drops = (buffs.bonus_drops ?? 0) + 1
    await sb(`character_state?user_id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ pending_buffs: buffs }) })
    await consumeOne(row)
    return { ok: true, effect: 'bonus_drops', bonus_drops: buffs.bonus_drops }
  }

  if (row.item_slug === 'pet_egg_common' || row.item_slug === 'pet_egg_rare') {
    const rarity = row.item_slug === 'pet_egg_rare' ? 'rare' : 'common'
    const maxStage = rarity === 'rare' ? 2 : 1
    const mult = rarity === 'rare' ? 1.3 : 1
    await sb(`user_pets`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        rarity,
        max_stage: maxStage,
        name: '孵化中…',
        nickname: '孵化中…',
        base_prompt: '',
        evolution_stage: 1,
        stats: { hp: Math.floor(100 * mult), atk: Math.floor(10 * mult), def: Math.floor(10 * mult) },
        pending_render: 'hatch',
      }),
    })
    await consumeOne(row)
    return { ok: true, effect: 'hatch', rarity }
  }

  return { ok: false, code: 400, error: 'NOT_USABLE' }
}

/** 装备/卸下：整行切换 equipped。卸下时若已存在未装备同 slug 行则并库存（避免 partial unique 冲突）。 */
export async function equipItem(userId, rowId, equipped) {
  const rows = await sb(`user_inventory?id=eq.${rowId}&user_id=eq.${userId}&select=id,item_slug,qty,equipped`)
  const row = rows?.[0]
  if (!row) return { ok: false, code: 404, error: 'ITEM_NOT_FOUND' }
  if (!EQUIP_BONUS[row.item_slug]) return { ok: false, code: 400, error: 'NOT_EQUIPPABLE' }

  if (equipped) {
    if (!row.equipped) {
      await sb(`user_inventory?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ equipped: true }) })
    }
    return { ok: true, equipped: true }
  }
  if (row.equipped) {
    const un = await sb(`user_inventory?user_id=eq.${userId}&item_slug=eq.${row.item_slug}&equipped=eq.false&select=id,qty`)
    if (un?.[0]) {
      await sb(`user_inventory?id=eq.${un[0].id}`, { method: 'PATCH', body: JSON.stringify({ qty: un[0].qty + row.qty }) })
      await sb(`user_inventory?id=eq.${row.id}`, { method: 'DELETE' })
    } else {
      await sb(`user_inventory?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ equipped: false }) })
    }
  }
  return { ok: true, equipped: false }
}
