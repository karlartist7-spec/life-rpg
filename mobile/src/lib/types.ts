export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type SceneTier = 'nearby' | 'coast' | 'ruin' | 'astral'

export type DashCharacter = {
  name: string
  title: string | null
  title_code: string
  motto: string | null
  level: number
  exp: number
  total_exp: number
  next_level_exp: number
  exp_to_next: number
}

export type DashTodaySnapshot = {
  date: string
  recovery_score: number | null
  sleep_minutes: number | null
  sleep_performance: number | null
  strain: number | null
  streak: number
  yesterday: {
    recovery_score: number | null
    sleep_minutes: number | null
    strain: number | null
  }
}

export type DashStamina = {
  stamina: number
  scene_tier: SceneTier
  rarity_tier: Rarity
  stats_date: string | null
  stamina_pct: number
  tier_label: string
}

export type DashAttributes = {
  physique: { label: string; value: number; color: string; source: string }
  endurance: { label: string; value: number; color: string; source: string }
  focus: { label: string; value: number; color: string; source: string }
  hp_max: number
  hp_current: number
  last7: Array<{
    date: string
    recovery: number | null
    sleep_min: number | null
    sleep_perf: number | null
    strain: number | null
    hrv: number | null
  }>
}

export type DashQuest = {
  id: string
  slug: string
  title: string
  description: string | null
  reward_exp: number
  reward: unknown
  progress: {
    status: string // 'pending' | 'in_progress' | 'completed'
    current_value: number
    target_value: number
    completed_at?: string | null
  }
}

export type DashAdventure = {
  id: string
  started_at: string
  completed_at: string | null
  scene_type: string | null
  scene_tier: SceneTier | null
  rarity_tier: Rarity | null
  stamina_used: number | null
  duration_min: number | null
  chapters: number | null
  triggered_by: string | null
  story_md: string | null
  scene_image_url: string | null
  pets_dispatched: unknown
  rewards: unknown
  pet_encounter: unknown
  status: string
}

export type DashAchievement = {
  id: string
  [k: string]: unknown
  progress: {
    status: string // 'locked' | 'in_progress' | 'unlocked'
    progress_current: number
    progress_target: number
    unlocked_at?: string | null
  }
}

export type DashConnections = {
  whoop: { connected: boolean; last_sync: string | null; expired: boolean | null }
  github: { connected: boolean }
  telegram: { connected: boolean; chat_id: string | null }
}

export type Dashboard = {
  user: { id: string; email?: string; display_name?: string; avatar_url?: string; timezone: string }
  character: DashCharacter | null
  today_snapshot: DashTodaySnapshot
  attributes: DashAttributes | null
  today_stamina: DashStamina | null
  quests: DashQuest[]
  adventure_log: DashAdventure[]
  achievements: DashAchievement[]
  exp_trend: Array<{ date: string; exp: number | null; level: number | null }>
  connections: DashConnections
}
