import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

const ATTRIBUTES = [
  {
    code: "VIT",
    name: "Vitality",
    desc: "睡眠 · 恢复 · 体力",
    value: 72,
    color: "var(--color-doodle-mint)",
  },
  {
    code: "SPR",
    name: "Spirit",
    desc: "情绪 · 正念 · HRV",
    value: 58,
    color: "var(--color-doodle-pink)",
  },
  {
    code: "INT",
    name: "Intellect",
    desc: "学习 · 阅读 · 写作",
    value: 81,
    color: "var(--color-doodle-periwinkle)",
  },
  {
    code: "WIL",
    name: "Willpower",
    desc: "习惯 · 训练 · 连胜",
    value: 64,
    color: "var(--color-doodle-sunshine)",
  },
  {
    code: "CHA",
    name: "Charisma",
    desc: "社交 · 沟通 · 输出",
    value: 47,
    color: "var(--color-doodle-coral)",
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 space-y-12">
      {/* Hero */}
      <section className="space-y-4">
        <span className="inline-block rounded-full border-2 border-ink bg-doodle-lilac px-3 py-1 text-xs font-bold uppercase tracking-wider shadow-[var(--shadow-doodle-sm)]">
          life-rpg · v0
        </span>
        <h1
          className="font-display text-5xl md:text-6xl font-bold leading-[1.05]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          把每一天活成一场 <span className="text-doodle-pink">值得刷怪</span>
          {" "}的副本。
        </h1>
        <p className="text-lg text-ink-soft max-w-2xl">
          life-rpg 把 WHOOP 的睡眠 / 恢复、GitHub 的 commits、还有你手动上报的小胜利，
          融合成五维属性，让自我成长像玩游戏一样有反馈。
        </p>
        <div className="flex flex-wrap gap-4 pt-2">
          <Link href="/login" className="btn-doodle">
            <Sparkles className="h-4 w-4" strokeWidth={2.5} />
            开始我的角色
          </Link>
          <Link href="/dashboard" className="btn-doodle btn-doodle--mint">
            进入面板
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
        </div>
      </section>

      {/* Five Attributes showcase */}
      <section className="card-doodle space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-2">
          <h2 className="font-display text-3xl font-bold">五维属性</h2>
          <span className="text-sm text-mute">demo · 静态占位数据</span>
        </header>
        <ul className="space-y-5">
          {ATTRIBUTES.map((a) => (
            <li key={a.code} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="font-display font-bold text-xl px-2.5 py-0.5 border-2 border-ink rounded-[var(--radius-sm)]"
                    style={{ background: a.color }}
                  >
                    {a.code}
                  </span>
                  <span className="font-semibold">{a.name}</span>
                  <span className="text-sm text-mute hidden md:inline">
                    {a.desc}
                  </span>
                </div>
                <span className="font-display font-bold tabular-nums">
                  {a.value}
                </span>
              </div>
              <div className="stat-bar">
                <div
                  className="stat-bar__fill"
                  style={{ width: `${a.value}%`, background: a.color }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Buttons showcase */}
      <section className="card-doodle space-y-4">
        <h2 className="font-display text-3xl font-bold">按钮 / CTA 样式</h2>
        <div className="flex flex-wrap gap-3">
          <button className="btn-doodle">Primary · Pink</button>
          <button className="btn-doodle btn-doodle--mint">Mint CTA</button>
          <button className="btn-doodle btn-doodle--peri">Periwinkle</button>
          <button className="btn-doodle btn-doodle--sunshine">Sunshine</button>
        </div>
        <p className="text-sm text-mute">
          hover 时偏移 + 阴影变大 · active 时压扁，符合 Doodles 弹性原则。
        </p>
      </section>

      {/* Color swatches */}
      <section className="card-doodle space-y-4">
        <h2 className="font-display text-3xl font-bold">主色板</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            ["Mint", "var(--color-doodle-mint)"],
            ["Pink", "var(--color-doodle-pink)"],
            ["Periwinkle", "var(--color-doodle-periwinkle)"],
            ["Sunshine", "var(--color-doodle-sunshine)"],
            ["Coral", "var(--color-doodle-coral)"],
            ["Sky", "var(--color-doodle-sky)"],
            ["Lilac", "var(--color-doodle-lilac)"],
          ].map(([name, c]) => (
            <div
              key={name}
              className="border-2 border-ink rounded-[var(--radius-md)] overflow-hidden shadow-[var(--shadow-doodle-sm)]"
            >
              <div className="h-16" style={{ background: c }} />
              <div className="px-2 py-1.5 text-xs font-semibold">{name}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center text-sm text-mute pt-8">
        Built with Next.js · Tailwind v4 · Supabase · Doodles vibes
      </footer>
    </main>
  );
}
