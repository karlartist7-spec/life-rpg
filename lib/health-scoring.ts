/**
 * WHOOP 五维健康评分 + 风险惩罚 + 数据驱动建议
 * 移植自 ~/.hermes/skills/whoop-health-scoring
 */

export interface DayData {
  date: string
  recovery?: {
    recovery_score: number
    hrv_rmssd_milli: number
    resting_heart_rate: number
    spo2_percentage?: number
    skin_temp_celsius?: number
  }
  sleep?: {
    sleep_performance_percentage: number
    sleep_efficiency_percentage: number
    stage_summary?: {
      total_in_bed_time_milli: number
      total_awake_time_milli: number
      total_light_sleep_time_milli: number
      total_slow_wave_sleep_time_milli: number
      total_rem_sleep_time_milli: number
    }
  }
  cycle?: {
    strain: number
    kilojoule: number
    average_heart_rate: number
  }
  workouts?: Array<{ strain: number }>
}

export interface HealthScore {
  total: number
  grade: string
  tag: string
  dimensions: {
    recovery: number
    sleep: number
    strain: number
    physio: number
    habit: number
  }
  penalties: Array<{ reason: string; points: number }>
  advice: string[]
}

function grade(score: number): string {
  if (score >= 90) return 'A+'
  if (score >= 85) return 'A'
  if (score >= 80) return 'A-'
  if (score >= 75) return 'B+'
  if (score >= 70) return 'B'
  if (score >= 65) return 'B-'
  if (score >= 60) return 'C+'
  if (score >= 55) return 'C'
  if (score >= 50) return 'C-'
  if (score >= 40) return 'D'
  return 'F'
}

function tag(recovery: number): string {
  if (recovery >= 75) return '冲🚀'
  if (recovery >= 60) return '稳✅'
  if (recovery >= 40) return '收⚠️'
  return '恢复🛌'
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function slope(arr: number[]): number {
  if (arr.length < 2) return 0
  const n = arr.length
  const x = Array.from({ length: n }, (_, i) => i)
  const mx = mean(x)
  const my = mean(arr)
  const num = x.reduce((sum, xi, i) => sum + (xi - mx) * (arr[i] - my), 0)
  const den = x.reduce((sum, xi) => sum + (xi - mx) ** 2, 0)
  return den === 0 ? 0 : num / den
}

/** 1. 恢复维度 (30) */
function scoreRecovery(day: DayData): number {
  const rec = day.recovery?.recovery_score ?? 0
  return (rec / 100) * 30
}

/** 2. 睡眠维度 (25) */
function scoreSleep(day: DayData): number {
  const perf = day.sleep?.sleep_performance_percentage ?? 0
  return (perf / 100) * 25
}

/** 3. 负荷维度 (20) - 倒 U 型 */
function scoreStrain(day: DayData, hour: number): number {
  const strain = day.cycle?.strain ?? 0
  // 午报保护：≤14 点且 strain < 8 → 中性 50% (10/20)
  if (hour <= 14 && strain < 8) {
    return 10
  }
  // 倒 U：12-16 满分，<8 或 >18 衰减
  if (strain >= 12 && strain <= 16) return 20
  if (strain < 8) return (strain / 8) * 10
  if (strain > 18) return Math.max(0, 20 - (strain - 18) * 2)
  // 8-12 或 16-18 线性过渡
  if (strain < 12) return 10 + ((strain - 8) / 4) * 10
  return 20 - ((strain - 16) / 2) * 5
}

/** 4. 生理维度 (15) - HRV Z-score(10) + RHR Z-score(5) */
function scorePhysio(day: DayData, baseline14d: { hrv: number; rhr: number }): number {
  const hrv = day.recovery?.hrv_rmssd_milli ?? 0
  const rhr = day.recovery?.resting_heart_rate ?? 0
  if (!hrv || !rhr || !baseline14d.hrv || !baseline14d.rhr) return 7.5 // 中性

  // HRV 越高越好，Z-score 映射到 0-10
  const hrvZ = (hrv - baseline14d.hrv) / (baseline14d.hrv * 0.15)
  const hrvScore = Math.max(0, Math.min(10, 5 + hrvZ * 2))

  // RHR 越低越好
  const rhrZ = (baseline14d.rhr - rhr) / (baseline14d.rhr * 0.08)
  const rhrScore = Math.max(0, Math.min(5, 2.5 + rhrZ * 1))

  return hrvScore + rhrScore
}

/** 5. 习惯维度 (10) - 睡眠时长(5) + 规律性(3) + 本周训练日数(2) */
function scoreHabit(day: DayData, last7: DayData[]): number {
  let score = 0
  const sleepMin = day.sleep?.stage_summary
    ? (day.sleep.stage_summary.total_in_bed_time_milli - (day.sleep.stage_summary.total_awake_time_milli ?? 0)) / 60000
    : 0
  const sleepHr = sleepMin / 60

  // 睡眠时长 7-9h 满分 5
  if (sleepHr >= 7 && sleepHr <= 9) score += 5
  else if (sleepHr >= 6 && sleepHr < 7) score += 3
  else if (sleepHr > 9 && sleepHr <= 10) score += 3
  else if (sleepHr >= 5 && sleepHr < 6) score += 1

  // 规律性：7 天睡眠时长标准差 < 1h → +3
  const sleeps = last7
    .map((d) => {
      const s = d.sleep?.stage_summary
      return s ? (s.total_in_bed_time_milli - (s.total_awake_time_milli ?? 0)) / 3600000 : 0
    })
    .filter((x) => x > 0)
  if (sleeps.length >= 3) {
    const avg = mean(sleeps)
    const std = Math.sqrt(sleeps.reduce((sum, x) => sum + (x - avg) ** 2, 0) / sleeps.length)
    if (std < 1) score += 3
    else if (std < 1.5) score += 1.5
  }

  // 本周训练日数 ≥3 → +2
  const workoutDays = last7.filter((d) => (d.workouts?.length ?? 0) > 0).length
  if (workoutDays >= 3) score += 2
  else if (workoutDays >= 2) score += 1

  return score
}

/** 风险惩罚 (最多 -25) */
function riskPenalty(
  day: DayData,
  last7: DayData[],
  baseline14d: { hrv: number; rhr: number }
): Array<{ reason: string; points: number }> {
  const penalties: Array<{ reason: string; points: number }> = []
  const hrv = day.recovery?.hrv_rmssd_milli ?? 0
  const rhr = day.recovery?.resting_heart_rate ?? 0
  const strain = day.cycle?.strain ?? 0
  const rec = day.recovery?.recovery_score ?? 0

  // HRV 比基线低 30%+
  if (hrv && baseline14d.hrv && hrv < baseline14d.hrv * 0.7) {
    penalties.push({ reason: 'HRV 比基线低 30%+', points: -8 })
  }

  // RHR 高出基线 5+ bpm
  if (rhr && baseline14d.rhr && rhr > baseline14d.rhr + 5) {
    penalties.push({ reason: 'RHR 高出基线 5+ bpm', points: -5 })
  }

  // Day strain > 18 过载
  if (strain > 18) {
    penalties.push({ reason: 'Strain 过载 (>18)', points: -5 })
  }

  // HRV 7 日斜率 < -1.5
  const hrvs = last7.map((d) => d.recovery?.hrv_rmssd_milli ?? 0).filter((x) => x > 0)
  if (hrvs.length >= 5 && slope(hrvs) < -1.5) {
    penalties.push({ reason: 'HRV 7 日持续下滑', points: -4 })
  }

  // RHR 7 日斜率 > +0.8
  const rhrs = last7.map((d) => d.recovery?.resting_heart_rate ?? 0).filter((x) => x > 0)
  if (rhrs.length >= 5 && slope(rhrs) > 0.8) {
    penalties.push({ reason: 'RHR 7 日持续上升', points: -3 })
  }

  // 连续 3+ 天 recovery < 50
  const lowRecDays = last7.slice(-3).filter((d) => (d.recovery?.recovery_score ?? 100) < 50).length
  if (lowRecDays >= 3) {
    penalties.push({ reason: '连续 3+ 天 Recovery < 50', points: -5 })
  }

  return penalties
}

/** 数据驱动建议 */
function advise(day: DayData, score: HealthScore, baseline14d: { hrv: number; rhr: number }): string[] {
  const advice: string[] = []
  const rec = day.recovery?.recovery_score ?? 0
  const sleepMin = day.sleep?.stage_summary
    ? (day.sleep.stage_summary.total_in_bed_time_milli - (day.sleep.stage_summary.total_awake_time_milli ?? 0)) / 60000
    : 0
  const sleepHr = sleepMin / 60
  const strain = day.cycle?.strain ?? 0
  const hrv = day.recovery?.hrv_rmssd_milli ?? 0

  // 睡眠不足
  if (sleepHr < 7) {
    const deficit = 7 - sleepHr
    advice.push(`睡眠欠 ${deficit.toFixed(1)}h，今晚 23:00 前上床补回来`)
  }

  // Recovery 低
  if (rec < 50) {
    advice.push('Recovery < 50，今天主动休息，避免高强度训练')
  } else if (rec < 67) {
    advice.push('Recovery 中等，量力而行，别硬推')
  }

  // Strain 过低
  if (strain < 8 && sleepHr >= 7) {
    advice.push('Strain 偏低，今天可以加点活动量')
  }

  // HRV 异常低
  if (hrv && baseline14d.hrv && hrv < baseline14d.hrv * 0.7) {
    advice.push('HRV 异常低，身体在应激，优先恢复')
  }

  // 总分低
  if (score.total < 60) {
    advice.push('综合评分偏低，今天保守策略，早睡早起')
  }

  return advice.length ? advice : ['状态不错，保持节奏']
}

/** 计算 14 天基线 */
function baseline14d(last14: DayData[]): { hrv: number; rhr: number } {
  const hrvs = last14.map((d) => d.recovery?.hrv_rmssd_milli ?? 0).filter((x) => x > 0)
  const rhrs = last14.map((d) => d.recovery?.resting_heart_rate ?? 0).filter((x) => x > 0)
  return {
    hrv: hrvs.length ? mean(hrvs) : 0,
    rhr: rhrs.length ? mean(rhrs) : 0,
  }
}

/** 主评分函数 */
export function calculateHealthScore(day: DayData, last14: DayData[], hour: number = 23): HealthScore {
  const base14 = baseline14d(last14)
  const last7 = last14.slice(-7)

  const dimRecovery = scoreRecovery(day)
  const dimSleep = scoreSleep(day)
  const dimStrain = scoreStrain(day, hour)
  const dimPhysio = scorePhysio(day, base14)
  const dimHabit = scoreHabit(day, last7)

  const baseScore = dimRecovery + dimSleep + dimStrain + dimPhysio + dimHabit
  const penalties = riskPenalty(day, last7, base14)
  const totalPenalty = penalties.reduce((sum, p) => sum + p.points, 0)
  const total = Math.max(0, Math.min(100, baseScore + totalPenalty))

  const result: HealthScore = {
    total,
    grade: grade(total),
    tag: tag(day.recovery?.recovery_score ?? 0),
    dimensions: {
      recovery: dimRecovery,
      sleep: dimSleep,
      strain: dimStrain,
      physio: dimPhysio,
      habit: dimHabit,
    },
    penalties,
    advice: [],
  }

  result.advice = advise(day, result, base14)
  return result
}
