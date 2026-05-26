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
import { TrendingUp, BarChart3, Heart, Moon, Activity } from 'lucide-react'

interface StatsData {
  exp_trend: Array<{ date: string; exp: number; level: number }>
  attributes: {
    last7: Array<{ date: string; vit: number; spr: number; int: number; wil: number; cha: number }>
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

  const attrData = (data.attributes?.last7 ?? []).map((d) => ({ ...d, dateFmt: fmt(d.date) }))

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
            <p className="mt-1 opacity-90">过去 30 天的成长轨迹</p>
          </div>
          <BarChart3 className="h-16 w-16 text-paper" strokeWidth={2.5} />
        </div>
      </motion.div>

      {/* 总览 */}
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
            transition={{ delay: i * 0.1 }}
            className={`card-doodle ${s.color} text-center`}
          >
            <p className="text-sm font-bold uppercase opacity-80">{s.label}</p>
            <p className="font-display text-4xl font-bold">{s.value}</p>
            <p className="text-xs opacity-70">{s.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* 30 天 EXP 柱状 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
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

      {/* 7 天五维 */}
      {attrData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card-doodle"
        >
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-doodle-periwinkle" />
            <h2 className="font-display text-xl font-bold">7 天五维成长</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attrData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="dateFmt" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    border: '2px solid #000',
                    borderRadius: '12px',
                    background: '#fff',
                  }}
                />
                <Line type="monotone" dataKey="vit" stroke="#83ffc1" strokeWidth={3} name="VIT" />
                <Line type="monotone" dataKey="spr" stroke="#a8dcff" strokeWidth={3} name="SPR" />
                <Line type="monotone" dataKey="int" stroke="#e0b8ff" strokeWidth={3} name="INT" />
                <Line type="monotone" dataKey="wil" stroke="#ffe780" strokeWidth={3} name="WIL" />
                <Line type="monotone" dataKey="cha" stroke="#ff94db" strokeWidth={3} name="CHA" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {[
              ['VIT', '#83ffc1', '体质'],
              ['SPR', '#a8dcff', '灵性'],
              ['INT', '#e0b8ff', '智力'],
              ['WIL', '#ffe780', '意志'],
              ['CHA', '#ff94db', '魅力'],
            ].map(([code, color, name]) => (
              <div key={code} className="flex items-center gap-1">
                <div
                  className="h-3 w-3 rounded-full border-2 border-ink"
                  style={{ background: color }}
                />
                <span className="font-bold">{code}</span>
                <span className="text-mute">{name}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
