export type ItemActionKind = 'use' | 'equip' | 'hatch' | 'none'

export function itemAction(type: string): ItemActionKind {
  switch (type) {
    case 'consumable': return 'use'
    case 'egg': return 'hatch'
    case 'equip': return 'equip'
    default: return 'none'
  }
}

export type UseEffect =
  | { effect: 'stamina'; stamina: number; scene_tier?: string }
  | { effect: 'bonus_drops'; bonus_drops: number }
  | { effect: 'hatch'; rarity: string }
  | { effect: string; [k: string]: unknown }

export function useEffectMessage(r: UseEffect): string {
  switch (r.effect) {
    case 'stamina': return `体力恢复 → ${(r as { stamina: number }).stamina}`
    case 'bonus_drops': return '下次冒险保底掉落 +1'
    case 'hatch': return '孵化成功！去「宠物」看看新伙伴'
    default: return '使用成功'
  }
}

export function inventoryErrorMessage(code: string): string {
  switch (code) {
    case 'NOT_USABLE': return '这个物品不能直接使用'
    case 'NOT_EQUIPPABLE': return '这个物品不能装备'
    case 'ITEM_NOT_FOUND': return '找不到这个物品'
    default: return '操作失败，请重试'
  }
}
