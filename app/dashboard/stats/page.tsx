'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { TrendingUp, BarChart3, Activity, Dumbbell, Wind, Brain } from 'lucide-react'

interface StatsData {
  exp_trend: Array<{ date: string; exp: number; level: number }>
  attributes: {
    physique: { label: string; value: number; color: string; source: string }
    endurance: { label: string; value: number; color: string; source: string }
    focus: { label: string; value: number; color: string; source: string }
    hp_max: number
    hp_current: number
    last7: Array<{ date: string; recovery: number; sleep_min: number; sleep_perf: number; strain: number; hrv: number }>
  } | null
}

const fmt = (d: string) => {
  const date = new Date(d)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then(setData)
  }, [])

  if (!data) return <div className="card-doodle">Loading...</div>

  const expData = data.exp_trend.map((d) => ({ ...d, dateFmt: fmt(d.date) }))
  const totalExp = expData.reduce((s, d) => s + d.exp, 0)
  const avgExp = expData.length ? Math.round(totalExp / expData.length) : 0
  const maxExpDay = expData.reduce((max, d) => (d.exp > max.exp ? d : max), { exp: 0, dateFmt: '' })

  const attrs = data.attributes
  // 7 天三维：从 last7 真信号回推每天的三维即时值
  const attrData = (attrs?.last7 ?? []).map((d) => {
    const physique = d.recovery ?? 0
    const endurance = Math.min(100, ((d.strain ?? 0) / 21) * 50 + ((d.sleep_min ?? 0) / 480) * 50)
    const focus = ((d.sleep_perf ?? 0) + (d.hrv ?? 0)) / 2
    return {
      dateFmt: fmt(d.date),
      physique: Math.round(physique),
      endurance: Math.round(endurance),
      focus: Math.round(focus),
    }
  })

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-doodle bg-doodle-periwinkle text-paper"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">数据中心</h1>
            <p className="mt-1 opacity-90">过去 30 天的成长轨迹 · WHOOP 真信号驱动</p>
          </div>
          <BarChart3 className="h-16 w-16 text-paper" strokeWidth={2.5} />
        </div>
      </motion.div>

      {/* 三维当前值 */}
      {attrs && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: '体魄', Icon: Dumbbell, value: attrs.physique.value, source: attrs.physique.source, color: 'bg-doodle-mint' },
            { label: '耐力', Icon: Wind, value: attrs.endurance.value, source: attrs.endurance.source, color: 'bg-doodle-sky' },
            { label: '专注', Icon: Brain, value: attrs.focus.value, source: attrs.focus.source, color: 'bg-doodle-lilac' },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`card-doodle ${s.color} text-center`}
            >
              <s.Icon className="mx-auto mb-1 h-8 w-8 text-ink" strokeWidth={2.5} />
              <p className="text-sm font-bold opacity-80">{s.label}</p>
              <p className="font-display text-4xl font-bold">{s.value}</p>
              <p className="mt-1 text-[10px] opacity-70">{s.source}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* EXP 总览 */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: '总 EXP', value: totalExp, sub: '30 天累计', color: 'bg-doodle-mint' },
          { label: '日均', value: avgExp, sub: 'EXP / 天', color: 'bg-doodle-pink' },
          { label: '最高单日', value: maxExpDay.exp, sub: maxExpDay.dateFmt || '—', color: 'bg-doodle-sunshine' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className={`card-doodle ${s.color} text-center`}
          >
            <p className="text-sm font-bold opacity-80">{s.label}</p>
            <p className="font-display text-4xl font-bold">{s.value}</p>
            <p className="text-xs opacity-70">{s.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* 30 天 EXP 柱状 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card-doodle"
      >
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-doodle-periwinkle" />
          <h2 className="font-display text-xl font-bold">30 天 EXP 趋势</h2>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={expData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="dateFmt" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  border: '2px solid #000',
                  borderRadius: '12px',
                  background: '#fff',
                  fontFamily: 'var(--font-body)',
                }}
              />
              <Bar dataKey="exp" fill="#8b8bff" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* 7 天三维 */}
      {attrData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card-doodle"
        >
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-doodle-periwinkle" />
            <h2 className="font-display text-xl font-bold">7 天三维变化</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attrData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="dateFmt" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    border: '2px solid #000',
                    borderRadius: '12px',
                    background: '#fff',
                  }}
                />
                <Line type="monotone" dataKey="physique"  stroke="#83ffc1" strokeWidth={3} name="体魄" dot={{ r: 4, strokeWidth: 2 }} />
                <Line type="monotone" dataKey="endurance" stroke="#a8dcff" strokeWidth={3} name="耐力" dot={{ r: 4, strokeWidth: 2 }} />
                <Line type="monotone" dataKey="focus"     stroke="#e0b8ff" strokeWidth={3} name="专注" dot={{ r: 4, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs">
            {[
              ['体魄', '#83ffc1', 'Recovery'],
              ['耐力', '#a8dcff', 'Strain + Sleep'],
              ['专注', '#e0b8ff', 'Sleep Perf + HRV'],
            ].map(([name, color, src]) => (
              <div key={name} className="flex items-center gap-1">
                <div
                  className="h-3 w-3 rounded-full border-2 border-ink"
                  style={{ background: color }}
                />
                <span className="font-bold">{name}</span>
                <span className="text-mute">· {src}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
