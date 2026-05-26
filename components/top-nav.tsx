'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ListTodo, Package, BarChart3, ShoppingBag } from 'lucide-react'

const tabs = [
  { href: '/dashboard', label: '首页', icon: Home },
  { href: '/dashboard/quests', label: '任务', icon: ListTodo },
  { href: '/dashboard/inventory', label: '背包', icon: Package, soon: true },
  { href: '/dashboard/stats', label: '数据', icon: BarChart3 },
  { href: '/dashboard/shop', label: '商店', icon: ShoppingBag, soon: true },
]

export function TopNav() {
  const pathname = usePathname()

  return (
    <nav className="border-b-2 border-ink bg-paper">
      <div className="container mx-auto flex items-center gap-1 px-4">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.soon ? '#' : tab.href}
              className={`
                relative flex items-center gap-2 px-4 py-3 font-display text-sm font-bold
                transition-colors duration-200
                ${
                  isActive
                    ? 'bg-doodle-periwinkle text-paper'
                    : 'text-ink-soft hover:bg-cream'
                }
                ${tab.soon ? 'cursor-not-allowed opacity-50' : ''}
              `}
              aria-disabled={tab.soon}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.soon && (
                <span className="ml-1 rounded-full bg-doodle-sunshine px-2 py-0.5 text-[10px] font-bold text-ink">
                  Soon
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
