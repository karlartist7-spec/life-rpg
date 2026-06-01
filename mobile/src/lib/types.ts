export type Dashboard = {
  character: { name: string; level: number; exp: number; next_level_exp: number; exp_to_next: number } | null
  today_snapshot: { recovery_score: number | null; sleep_minutes: number | null; strain: number | null; streak: number }
  today_stamina: { stamina: number; tier_label: string; stamina_pct: number } | null
  attributes: { hp_current: number; hp_max: number } | null
}
