export const COLORS = {
  mint: '#83ffc1', pink: '#ff94db', periwinkle: '#8b8bff', sunshine: '#ffe780',
  coral: '#ff6b6b', sky: '#a8dcff', lilac: '#e0b8ff',
  paper: '#ffffff', cream: '#fbf7f0', ink: '#000000', inkSoft: '#1a1a1a', mute: '#9b9b9b',
} as const

/** 硬 offset 阴影位移（移植 --shadow-doodle-sm/md/lg/xl）。 */
export const BRUTAL_OFFSET = { sm: 2, md: 4, lg: 6, xl: 8 } as const
export type BrutalSize = keyof typeof BRUTAL_OFFSET

/** 稀有度：背景 + 阴影板（彩色在黑下）。 */
export const RARITY = {
  common: { bg: COLORS.paper, plates: [{ color: COLORS.ink, off: 4 }] },
  rare: { bg: '#d6ebff', plates: [{ color: '#4ba3ff', off: 6 }, { color: COLORS.ink, off: 8.5 }] },
  epic: { bg: '#e8c4ff', plates: [{ color: '#c850ff', off: 7 }, { color: COLORS.ink, off: 9.5 }] },
  legendary: { bg: '#fff4c4', plates: [{ color: '#ffb800', off: 8 }, { color: COLORS.ink, off: 10.5 }] },
} as const
export type Rarity = keyof typeof RARITY
