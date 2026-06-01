/**
 * Doodle 共享 UI 组件 —— 统一 loading / empty / KPI 三类高频元素，
 * 取代各页面手搓的版本，保证全站一致（Doodles + Neo-brutalism，无 emoji）。
 */
import type { LucideIcon } from 'lucide-react'

/** 全页加载态：居中 min-h-[60vh] + 旋转图标 + 文案 */
export function LoadingState({
  icon: Icon,
  label = '加载中…',
}: {
  icon: LucideIcon
  label?: string
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <Icon className="mx-auto mb-4 h-12 w-12 animate-spin text-doodle-periwinkle" strokeWidth={2.5} />
        <p className="font-display text-lg text-mute">{label}</p>
      </div>
    </div>
  )
}

/** 空态：card-doodle + 大图标 + 标题 + 提示 + 可选行动按钮 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="card-doodle py-16 text-center">
      <Icon className="mx-auto mb-3 h-16 w-16 text-mute" strokeWidth={1.5} />
      <p className="font-display text-lg text-ink-soft">{title}</p>
      {hint && <p className="mt-1 text-sm text-mute">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

const TILE_BG: Record<string, string> = {
  mint: 'bg-doodle-mint text-ink',
  sky: 'bg-doodle-sky text-ink',
  coral: 'bg-doodle-coral text-paper',
  sunshine: 'bg-doodle-sunshine text-ink',
  pink: 'bg-doodle-pink text-ink',
  periwinkle: 'bg-doodle-periwinkle text-paper',
  lilac: 'bg-doodle-lilac text-paper',
  paper: 'bg-paper text-ink',
}

/** KPI 数据块：统一圆角/边框/硬阴影/字体（tabular-nums） */
export function StatTile({
  color = 'paper',
  label,
  value,
  sub,
  icon: Icon,
}: {
  color?: keyof typeof TILE_BG | string
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: LucideIcon
}) {
  return (
    <div className={`rounded-2xl border-2 border-ink p-4 shadow-doodle-md ${TILE_BG[color] ?? TILE_BG.paper}`}>
      <div className="flex items-center justify-between">
        <div className="font-display text-3xl font-bold tabular-nums">{value}</div>
        {Icon && <Icon className="h-6 w-6 opacity-80" strokeWidth={2.5} />}
      </div>
      <div className="mt-0.5 text-xs font-bold">{label}</div>
      {sub != null && <div className="mt-0.5 text-[11px] opacity-80">{sub}</div>}
    </div>
  )
}
