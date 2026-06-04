import type { RecoveryKey } from '@/src/lib/dashboard-derive'

/** Hero portrait art by recovery zone. Metro turns each require into an asset id (number). */
export const HERO_ART: Record<RecoveryKey, number> = {
  high: require('../assets/character/state-high.png'),
  med: require('../assets/character/state-mid.png'),
  low: require('../assets/character/state-low.png'),
  unknown: require('../assets/character/base.png'),
}
