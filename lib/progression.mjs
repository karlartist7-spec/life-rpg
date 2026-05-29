// 成长纯函数（宠物 + 角色 + 加成）：worker (JS) 与 UI (TS) 共用，单一真源。
// 宠物升级曲线沿用 lib/pets.ts 的 levelCurve = floor(100 * level^1.5)。

/** 升到 `level` 的下一级所需 EXP。 */
export function levelCurve(level) {
  return Math.floor(100 * Math.pow(level, 1.5))
}

/** 场景档位 → 每只出战宠物本次冒险获得的 EXP。 */
export const PET_TIER_EXP = {
  nearby: 10,
  coast: 25,
  ruin: 50,
  astral: 100,
}

/**
 * 给 (level, exp) 累加 delta，连续升级。返回新 {level, exp, leveledUp}。
 * 纯函数，不碰 DB。
 */
export function applyPetExp(level, exp, delta) {
  let lvl = level
  let e = exp + delta
  let leveledUp = false
  while (e >= levelCurve(lvl)) {
    e -= levelCurve(lvl)
    lvl += 1
    leveledUp = true
    if (lvl > 999) break
  }
  return { level: lvl, exp: e, leveledUp }
}

/** 角色升级曲线（与 lib/scoring.ts nextLevelExp 一致）。 */
export function characterNextLevelExp(level) {
  return 1000 + level * 120
}

/** 给角色 (level, exp, totalExp) 累加 gain，连续升级。 */
export function applyCharacterExp(level, exp, totalExp, gain) {
  let lvl = level
  let e = exp + gain
  const t = totalExp + gain
  let leveledUp = false
  while (e >= characterNextLevelExp(lvl)) {
    e -= characterNextLevelExp(lvl)
    lvl += 1
    leveledUp = true
    if (lvl > 999) break
  }
  return { level: lvl, exp: e, totalExp: t, leveledUp }
}

/** 野宠基础捕获率（按稀有度），worker 在此基础上叠加 catchBonus。
 *  调高以贴合"高捕获率"手感（common/rare 基本能抓，epic/legendary 偏难）。 */
export const CATCH_BASE_RATE = { common: 0.9, rare: 0.7, epic: 0.5, legendary: 0.35 }

/** 出战宠物总等级 → 三项加成（均有上限）。 */
export function petBonuses(totalLevel) {
  return {
    dropChance: Math.min(0.5, totalLevel * 0.005), // 额外掉落几率
    catchBonus: Math.min(0.3, totalLevel * 0.003), // 叠加到基础捕获率
    expBonus: Math.min(0.25, totalLevel * 0.005),  // 角色冒险 exp 乘数
  }
}

/** 进化要求：目标阶段 → { level 阈值, item 消耗 slug }。 */
export const EVOLUTION_REQUIREMENTS = {
  2: { level: 20, item: 'rare_herb' },
  3: { level: 40, item: 'star_fragment' },
}

/** 取进化到 `targetStage` 的要求；无则 null。 */
export function evolutionRequirement(targetStage) {
  return EVOLUTION_REQUIREMENTS[targetStage] ?? null
}

/** 装备被动加成（按 slug）。 */
export const EQUIP_BONUS = {
  wooden_sword: { drop: 0.05 },
  silver_blade: { drop: 0.10 },
  cosmic_helm: { catch: 0.10 },
}

/** 汇总一组已装备 slug 的加成。 */
export function sumEquipBonuses(slugs) {
  let drop = 0
  let catch_ = 0
  for (const s of slugs) {
    const b = EQUIP_BONUS[s]
    if (b) {
      drop += b.drop ?? 0
      catch_ += b.catch ?? 0
    }
  }
  return { drop, catch: catch_ }
}

/** 体力 → 场景/稀有度档位（与 lib/stats.ts 阈值一致）。 */
export function staminaTiers(stamina) {
  const scene = stamina < 100 ? 'nearby' : stamina < 250 ? 'coast' : stamina < 400 ? 'ruin' : 'astral'
  const rarity = stamina < 100 ? 'common' : stamina < 250 ? 'rare' : stamina < 400 ? 'epic' : 'legendary'
  return { scene_tier: scene, rarity_tier: rarity }
}
