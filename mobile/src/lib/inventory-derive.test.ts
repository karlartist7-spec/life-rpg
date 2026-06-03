import { itemAction, useEffectMessage, inventoryErrorMessage } from './inventory-derive'

describe('itemAction', () => {
  it('maps type to the affordance', () => {
    expect(itemAction('consumable')).toBe('use')
    expect(itemAction('egg')).toBe('hatch')
    expect(itemAction('equip')).toBe('equip')
    expect(itemAction('collect')).toBe('none')
    expect(itemAction('material')).toBe('none')
    expect(itemAction('weird')).toBe('none')
  })
})

describe('useEffectMessage', () => {
  it('describes each consume effect', () => {
    expect(useEffectMessage({ effect: 'stamina', stamina: 120 })).toContain('120')
    expect(useEffectMessage({ effect: 'bonus_drops', bonus_drops: 2 })).toContain('保底')
    expect(useEffectMessage({ effect: 'hatch', rarity: 'rare' })).toContain('孵化')
    expect(useEffectMessage({ effect: 'unknown' as never })).toBeTruthy()
  })
})

describe('inventoryErrorMessage', () => {
  it('maps known codes', () => {
    expect(inventoryErrorMessage('NOT_USABLE')).toBeTruthy()
    expect(inventoryErrorMessage('NOT_EQUIPPABLE')).toContain('装备')
    expect(inventoryErrorMessage('ITEM_NOT_FOUND')).toContain('找不到')
    expect(inventoryErrorMessage('???')).toBeTruthy()
  })
})
