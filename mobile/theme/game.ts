import { COLORS } from './tokens'

/** Height (below the safe-area top inset) reserved by the persistent GameHud. */
export const GAME_HUD_HEIGHT = 56

/** Per-tab full-bleed "world" tint — light washes over paper (not loud candy). */
export const SCREEN_TINT = {
  home: COLORS.cream,
  pets: '#e9fff4',
  inventory: '#fffdf0',
  adventures: '#eef7ff',
  character: '#f6f0ff',
} as const
