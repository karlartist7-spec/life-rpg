import { petNextLevelExp, petExpPct, evolveErrorMessage } from './pet-derive'

describe('petNextLevelExp', () => {
  it('mirrors floor(100 * level^1.5)', () => {
    expect(petNextLevelExp(1)).toBe(100)
    expect(petNextLevelExp(4)).toBe(800)
    expect(petNextLevelExp(9)).toBe(2700)
  })
})

describe('petExpPct', () => {
  it('is exp over the current level curve, clamped', () => {
    expect(petExpPct(1, 50)).toBe(50)
    expect(petExpPct(1, 100)).toBe(100)
    expect(petExpPct(1, 250)).toBe(100)
    expect(petExpPct(4, 400)).toBe(50)
  })
})

describe('evolveErrorMessage', () => {
  it('maps known codes to human zh messages', () => {
    expect(evolveErrorMessage('PET_SLOT_FULL')).toContain('出战')
    expect(evolveErrorMessage('MAX_STAGE')).toContain('最终')
    expect(evolveErrorMessage('ALREADY_PENDING')).toContain('进化中')
    expect(evolveErrorMessage('LEVEL_TOO_LOW', { level: 20, item: 'evo_stone' }))
      .toContain('Lv.20')
    expect(evolveErrorMessage('MISSING_ITEM', { level: 20, item: 'evo_stone' }))
      .toContain('evo_stone')
  })
  it('falls back for unknown codes', () => {
    expect(evolveErrorMessage('SOMETHING_ELSE')).toBeTruthy()
  })
})
