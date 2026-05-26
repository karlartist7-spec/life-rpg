// Dashboard API 返回类型定义
export interface DashboardData {
  character: {
    name: string
    level: number
    current_exp: number
    next_level_exp: number
    title: string
    motto: string | null
    vit: number
    spr: number
    int: number
    wil: number
    cha: number
    primary_attribute: string
  }
  today: {
    date: string
    recovery_score: number | null
    sleep_minutes: number | null
    strain: number | null
    streak_count: number
    yesterday_recovery: number | null
    yesterday_sleep: number | null
    yesterday_strain: number | null
  }
  quests: Array<{
    id: string
    slug: string
    title: string
    description: string
    reward_exp: number
    condition: { metric: string; op: string; value: number }
    current_value: number | null
    target_value: number
    status: 'completed' | 'pending' | 'locked'
  }>
  recent_logs: Array<{
    id: string
    date: string
    content: string
    category: string
  }>
  achievements: Array<{
    id: string
    slug: string
    title: string
    description: string
    icon_url: string | null
    unlocked: boolean
    unlocked_at: string | null
    progress: number
    target: number
  }>
  exp_trend: Array<{
    date: string
    exp_gained: number
  }>
  attr_deltas: {
    vit: number
    spr: number
    int: number
    wil: number
    cha: number
  }
  attr_sparklines: {
    vit: number[]
    spr: number[]
    int: number[]
    wil: number[]
    cha: number[]
  }
}
