/**
 * Doodle 风格 SVG 图标系统。
 * 全部黑粗描边、圆角、扁平填色，与 Doodles NFT 视觉一致。
 * 禁止用 emoji 代替图标。
 */

type IconProps = {
  className?: string
  color?: string
}

const STROKE = '#1A1A1A'
const SW = 2.5 // stroke-width

export function GameIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke={STROKE}
      strokeWidth={SW}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="14" width="40" height="24" rx="10" fill="#FFD1E8" />
      <circle cx="14" cy="26" r="2.5" fill={STROKE} />
      <circle cx="22" cy="26" r="2.5" fill={STROKE} />
      <rect x="30" y="22" width="4" height="8" rx="1.5" fill="#FF9133" />
      <rect x="36" y="24" width="4" height="4" rx="1.5" fill="#3DD6C5" />
    </svg>
  )
}

export function WhoopIcon({ className }: IconProps) {
  // 腕带 + 脉冲
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke={STROKE}
      strokeWidth={SW}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="10" width="20" height="12" rx="4" fill="#FFEFA1" />
      <path d="M9 16 L13 16 L15 12 L18 20 L20 16 L23 16" stroke="#E64545" fill="none" />
    </svg>
  )
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke={STROKE}
      strokeWidth={SW}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M16 5 C11 5 9 9 9 14 V19 L6 23 H26 L23 19 V14 C23 9 21 5 16 5 Z"
        fill="#A8E6CF"
      />
      <path d="M13 25 C13 27 14.5 28 16 28 C17.5 28 19 27 19 25" />
    </svg>
  )
}

// 五维属性各自的 doodle 图标
export function AttrIcon({
  name,
  className,
  color,
}: {
  name: 'VIT' | 'SPR' | 'INT' | 'WIL' | 'CHA'
  className?: string
  color?: string
}) {
  const fill = color || '#FFD1E8'
  switch (name) {
    case 'VIT':
      // 心脏
      return (
        <svg viewBox="0 0 24 24" className={className} fill={fill} stroke={STROKE} strokeWidth={SW} strokeLinejoin="round">
          <path d="M12 20 C5 14 3 10 5 6.5 C7 3 11 4 12 7 C13 4 17 3 19 6.5 C21 10 19 14 12 20 Z" />
        </svg>
      )
    case 'SPR':
      // 莲花/静坐
      return (
        <svg viewBox="0 0 24 24" className={className} fill={fill} stroke={STROKE} strokeWidth={SW} strokeLinejoin="round">
          <circle cx="12" cy="8" r="3" />
          <path d="M5 19 C5 15 8 13 12 13 C16 13 19 15 19 19 Z" />
        </svg>
      )
    case 'INT':
      // 脑/灯泡
      return (
        <svg viewBox="0 0 24 24" className={className} fill={fill} stroke={STROKE} strokeWidth={SW} strokeLinejoin="round" strokeLinecap="round">
          <path d="M9 4 C5 4 4 8 6 11 C5 13 6 15 8 15 V19 H16 V15 C18 15 19 13 18 11 C20 8 19 4 15 4 Z" />
          <path d="M10 21 H14" />
        </svg>
      )
    case 'WIL':
      // 火焰
      return (
        <svg viewBox="0 0 24 24" className={className} fill={fill} stroke={STROKE} strokeWidth={SW} strokeLinejoin="round">
          <path d="M12 3 C12 8 7 9 7 14 C7 18 9 21 12 21 C15 21 17 18 17 14 C17 11 14 11 14 8 C14 6 12 5 12 3 Z" />
        </svg>
      )
    case 'CHA':
      // 星
      return (
        <svg viewBox="0 0 24 24" className={className} fill={fill} stroke={STROKE} strokeWidth={SW} strokeLinejoin="round">
          <path d="M12 3 L14.5 9 L21 9.5 L16 14 L17.5 20.5 L12 17 L6.5 20.5 L8 14 L3 9.5 L9.5 9 Z" />
        </svg>
      )
  }
}
