# life-rpg 视觉规范 v3 (FINAL — 1:1 高保真还原)

参考设计稿: `~/.hermes/image_cache/img_781d734c56d8.jpg`（哥 2026-05-26 最终稿）

风格：**Soft Neubrutalism + Kawaii**
日系 chibi 角色 + 柔和 pastel 配色 + 2px 黑描边 + 4px 硬阴影 + Notion 式 dashboard 布局。

---

## 色板 (CSS variables — globals.css)

```css
:root {
  /* 底色 */
  --bg-app:        #C2E2F4;   /* 全局淡蓝底 */
  --bg-sidebar:    #FBF3E2;   /* 左 sidebar 奶油米 */
  --bg-card:       #FFFFFF;   /* 通用白卡内层 */

  /* 描边 + 阴影 */
  --ink:           #1A1A1A;
  --shadow-brut:   4px 4px 0 0 #1A1A1A;
  --shadow-brut-sm:3px 3px 0 0 #1A1A1A;
  --shadow-brut-lg:6px 6px 0 0 #1A1A1A;

  /* 文字 */
  --text-primary:  #1A1A1A;
  --text-soft:     #5A5A5A;
  --text-mute:     #9A9A9A;

  /* 主紫 (character 卡 / 智力卡 / sidebar 选中 / EXP 填充) */
  --purple-card:   #DBCAF5;   /* character 主卡 */
  --purple-attr:   #DCCBF5;   /* 智力属性卡 */
  --purple-select: #E8DCF7;   /* sidebar 选中态 */
  --purple-exp:    #B49CE3;   /* EXP 填充 */
  --purple-text:   #6B4FBB;   /* 紫色文字/icon */
  --purple-track:  #EFE6FB;   /* EXP 槽 */

  /* Today 4 卡 (右上) — 略低饱和 */
  --today-green:   #D4F0D2;
  --today-blue:    #D6E6F8;
  --today-yellow:  #FBEBC2;
  --today-pink:    #FBD7DC;

  /* Attribute 5 卡 (底部) — 略高饱和 */
  --attr-pink:     #FBD3D9;   /* 体质 VIT */
  --attr-green:    #CFEBCB;   /* 灵性 SPR */
  --attr-purple:   #DCCBF5;   /* 智力 INT */
  --attr-blue:     #CFE0F6;   /* 意志 WIL */
  --attr-yellow:   #FBE5B0;   /* 魅力 CHA */
}
```

## 描边 & 阴影规则

- 描边：**2px solid var(--ink)**，全局所有卡片 / icon 容器 / 按钮 / 进度条统一
- 硬阴影：`box-shadow: var(--shadow-brut)`（4px 4px 0 0），blur=0
- hover 时阴影变 6px 6px，元素位移 `transform: translate(-2px, -2px)`（按下感）
- 禁止用 blur / 渐变阴影 / 半透明阴影

## 圆角

| 元素 | radius |
|---|---|
| 大卡片（主紫卡、今日概览） | `rounded-[20px]` |
| 中卡片（today/attribute 单卡、log/成就行） | `rounded-2xl` (16px) |
| 小按钮 / icon 容器 / sidebar 项 | `rounded-xl` (12px) |
| Pill / class badge / EXP 条 | `rounded-full` |

## 字体

```ts
// app/layout.tsx
import { Nunito } from 'next/font/google'
const nunito = Nunito({ subsets: ['latin'], weight: ['400','600','700','800','900'] })
```

- 中文走系统 fallback (PingFang SC / Noto Sans SC)
- 数字 / 标题：Nunito **800/900**，圆润感
- 正文：500，label：500-600

## 图标

- **lucide-react** 全部线性图标，`strokeWidth=2.5`
- 给 icon 配色用属性卡同色（pink icon on pink card 视觉冲突→ icon 用更深一档同色或纯 ink）

## 角色立绘 / 头像

- **gpt-image-1 生成**，存 Supabase Storage public bucket `character-art/`
- 角色立绘 1024×1024（紫卡内左半位置），头像 256×256（右上角圆形裁剪）
- prompt 模板（doodle chibi）：
  ```
  Cute chibi RPG character, [描述: 紫发男孩/法师袍/魔杖/盾牌],
  flat colors, 2-3px thick black outlines, no gradients, no shading except minimal cel-shade,
  pastel palette (lavender purple #DBCAF5, mint teal, white),
  plain transparent background, kawaii Japanese mascot style,
  full body / front view / smiling, sticker style
  ```

## 布局骨架（1280×800 设计基准）

```
┌──────────┬─────────────────────────────────────────────────┐
│ Sidebar  │  Top tabs (首页/任务/背包/数据/商店)       Avatar │
│ w=224    ├─────────────────────────────────────────────────┤
│  Logo    │  ┌─────────────────────┐  ┌─────────────────┐  │
│  Nav x8  │  │  Character 紫卡     │  │  今日概览       │  │
│          │  │  (大立绘 + 名字     │  │  2×2 today 卡   │  │
│  ───     │  │   + LV + class      │  │                 │  │
│  探索者  │  │   + EXP 条 + motto) │  │                 │  │
│  level 3 │  └─────────────────────┘  └─────────────────┘  │
│  EXP bar │                                                  │
│          │  ┌────┬────┬────┬────┬────┐                     │
│          │  │ 5 张属性卡横排                │                │
│          │  └────┴────┴────┴────┴────┘                     │
│          │                                                   │
│          │  ┌─────────────┐ ┌──────────┐ ┌──────────┐     │
│          │  │ 每日任务     │ │ 冒险日志  │ │ 成就徽章  │   │
│          │  │ 3/3 progress │ │ timeline │ │ 4 badges │     │
│          │  └─────────────┘ └──────────┘ └──────────┘     │
└──────────┴─────────────────────────────────────────────────┘
```

间距：组与组 `gap-6`，组内卡间 `gap-4`，padding 容器 `p-6`。

## UI 组件库

- **shadcn/ui** 底座：Card / Button / Badge / Progress / Avatar / Tabs / Tooltip / Dialog / ScrollArea
- shadcn theme 覆盖（components.json 之后改 tailwind.config.ts）：
  - `borderRadius`: 改大 (--radius: 16px)
  - 自定义 `boxShadow.brut`: `4px 4px 0 0 #1A1A1A`
- 不引入 HeroUI / Aceternity

## 动效

- `react-countup` —— 数字滚动（属性、EXP、recovery 数值）
- `framer-motion` —— 卡片入场 fade+up spring，hover 按下感
- `canvas-confetti` —— 升级 / 三任务全完成时小爆撒
- 立绘可加 **subtle 呼吸动画**（scale 1.0 ↔ 1.02, 4s ease-in-out infinite）
