# life-rpg UI 与生图规范 (v4 — 当前权威)

本文是 life-rpg 视觉系统与图像生成的**唯一权威规范**，由 `scripts/lib-render.mjs` 实施。
任何 UI / prompt 改动以本文为准；旧版 `docs/design-system.md` 仅留作历史参考，**不要照抄**。

更新于：2026-05-28

---

## TL;DR（先读这一段）

**风格**：浅色 Doodles + Neo-brutalism。黑粗描边 + 硬 offset shadow + 糖果色 + 平面填色。
**风格反义词**：深色、blur、gradient、emoji、3D 渲染、写实、阴森、anime/动漫、纤细描边。
**UI icon**：全部 `lucide-react`，**绝不用 emoji 替代图标**。
**生图模型**：`gpt-image-2`（不是 1，不是 3）。
**LLM 叙事**：`gpt-4o-mini`，DeepSeek 同 base_url 热切。
**稀有度背景色**（宠物图按这个上色，写死在 `lib-render.mjs`）：

| 稀有度 | hex | 名字 |
|---|---|---|
| common | `#7FE3B0` | mint green 薄荷 |
| rare | `#9ED8F5` | sky blue 天蓝 |
| epic | `#7C7BE8` | periwinkle 紫蓝 |
| legendary | `#FFD84D` | sunshine yellow 金黄 |

**场景图始终奶油底** `#FAF8F3`（多元素不抢色）。

---

## 1. 设计哲学

### 1.1 为什么是这个风格
- **Doodles NFT 风格**：可爱、平面、糖果色、线条厚重 → 友好、收藏感
- **Neo-brutalism 硬 offset shadow**：贴纸 / 丝网印刷质感 → 强烈、有 game 感、不平庸
- **避开传统 dashboard**：哥反复说"单调静态卡片网格 = 简单无聊枯燥"。要 game-like。

### 1.2 反模式（看到必拒）
- ❌ 单调静态卡片网格
- ❌ Material / iOS / Bootstrap 默认风
- ❌ 渐变背景 / blur / 半透明
- ❌ emoji 当图标（包括所有 ❌🎯🚀✨🎮 这种）
- ❌ 自绘 SVG 图标当作图标系统（视觉系统严格要求时除外，默认走 lucide-react）
- ❌ 表里有数据就直接画 UI。先回答"用户对它做什么动作 + 系统里什么状态会变"，答不出就先做机制设计

### 1.3 必有元素
- ✅ 动效：进度条 / 数字滚动 / 卡片入场
- ✅ 徽章 / 等级 / 进度 / 排行 / 对比 / 趋势
- ✅ game 感：声音 / 反馈 / 庆祝（升级 confetti）
- ✅ 信息密度高，多色块拼贴

---

## 2. 颜色系统

### 2.1 主调色板（写在 globals.css）

```css
:root {
  /* 主背景 */
  --bg-cream:      #FAF8F3;   /* 奶油底（场景图、首页底） */
  --bg-app:        #C2E2F4;   /* dashboard 浅蓝底（旧版保留） */
  --bg-card:       #FFFFFF;
  --ink:           #1A1A1A;   /* 描边 / 硬阴影 */

  /* 糖果色（subject palette — 角色 / 宠物 / icon 主体上色用） */
  --candy-mint:    #7FE3B0;   /* common 稀有度 */
  --candy-sky:     #9ED8F5;   /* rare 稀有度 */
  --candy-peri:    #7C7BE8;   /* epic 稀有度 */
  --candy-sun:     #FFD84D;   /* legendary 稀有度 */
  --candy-pink:    #FF8FCB;
  --candy-coral:   #FF7B7B;
  --candy-lilac:   #C9A8FF;

  /* 硬阴影预设 */
  --shadow-brut:    4px 4px 0 0 #1A1A1A;
  --shadow-brut-sm: 3px 3px 0 0 #1A1A1A;
  --shadow-brut-lg: 6px 6px 0 0 #1A1A1A;
  --shadow-brut-xl: 8px 8px 0 0 #1A1A1A;
}
```

### 2.2 稀有度 → 背景色映射（核心约束）

**唯一权威定义**：`scripts/lib-render.mjs` `RARITY_BG` 常量。

```js
export const RARITY_BG = {
  common:    { hex: '#7FE3B0', name: 'mint green' },
  rare:      { hex: '#9ED8F5', name: 'sky blue' },
  epic:      { hex: '#7C7BE8', name: 'periwinkle purple-blue' },
  legendary: { hex: '#FFD84D', name: 'sunshine yellow' },
}
```

**应用范围**：
- 宠物 base 图背景色 → 跟 rarity 走
- 宠物卡片边框 / 徽章 / 稀有度标签 → 跟 rarity 走
- **场景图不跟**：始终奶油底 `#FAF8F3`（场景图含多元素，糖果色背景会和主体抢色）

### 2.3 关键约束
- 主体颜色**必须与背景色对比**，避免融在一起
  - 例：epic 紫蓝背景 → 主体不能再是紫色
  - `lib-render.mjs` 的 prompt 已经写了 "Pick colors that CONTRAST with the {bg} background"
- **禁止渐变**：所有色块平面填色
- **禁止半透明**：alpha 100% 或 0%
- **禁止 muted / dark colors**：饱和度要够，不要灰扑扑

---

## 3. 描边 + 硬阴影规则

### 3.1 描边
- 全局 `2px solid var(--ink)` 描边所有卡片 / icon 容器 / 按钮 / 进度条
- 生图 prompt 里要求 "VERY BOLD black outline" "thick chunky lines like a marker pen"
- 生图描边粗度 ≈ 4-5px（gpt-image-2 渲染下相当于 marker pen）

### 3.2 硬阴影（Neo-brutalism 灵魂）
- **零模糊**：`box-shadow` 不允许带模糊半径
- **纯黑实色**：`#1A1A1A` 或 `#000`，不允许半透明
- **右下偏移**：UI 卡片 4px / 6px / 8px，生图主体 8px
- 偏移规则：x 与 y 等距，方向永远右下（光源左上）

### 3.3 hover / 按下感
```css
.card {
  box-shadow: var(--shadow-brut);
  transition: transform 0.15s, box-shadow 0.15s;
}
.card:hover {
  box-shadow: var(--shadow-brut-lg);
  transform: translate(-2px, -2px);
}
.card:active {
  box-shadow: var(--shadow-brut-sm);
  transform: translate(2px, 2px);
}
```

---

## 4. 圆角系统

| 元素 | radius | Tailwind |
|---|---|---|
| 大卡片 | 20px | `rounded-[20px]` |
| 中卡片 | 16px | `rounded-2xl` |
| 小按钮 / icon 容器 | 12px | `rounded-xl` |
| Pill / 徽章 / 进度条 | 全圆 | `rounded-full` |

---

## 5. 字体

```ts
import { Nunito } from 'next/font/google'
const nunito = Nunito({ subsets: ['latin'], weight: ['400','600','700','800','900'] })
```

- 中文走系统 fallback（PingFang SC / Noto Sans SC）
- **数字 / 标题**：Nunito 800/900（圆润感强）
- 正文：500
- label / 按钮：600-700
- 数字滚动用 `react-countup`

---

## 6. 图标系统（硬约束）

### 6.1 唯一选型：lucide-react
- `strokeWidth={2.5}`（默认 2 太细，不够 brutal）
- size 按容器：sm 16px / md 20px / lg 24px
- 同色容器内 icon 用更深一档同色或 `--ink` 纯黑

### 6.2 反模式
- ❌ emoji 当图标（任何场景，包括 toast / button / nav）
- ❌ 自绘 SVG 图标（除非 lucide 真的没有，或视觉系统严格要求纯 doodle 插画）
- ❌ Heroicons / Phosphor / Tabler 混用（保持唯一选型）

### 6.3 例外：插画
- 角色立绘、宠物图、场景图、空状态插画 → gpt-image-2 生成，不走 lucide
- 装饰性 doodle SVG（`<svg>` 内嵌）→ 允许，但要 manual 画的 doodle 风（粗黑描边 + 平面填色）

---

## 7. UI 组件库

### 7.1 选型
- **shadcn/ui** 底座（已装）
- 不引入 HeroUI / Aceternity / Material / Ant Design

### 7.2 shadcn theme 覆盖
`components.json` + `app/globals.css` 改：
- `--radius: 16px`
- 自定义 `boxShadow.brut: 4px 4px 0 0 #1A1A1A`

### 7.3 必装 shadcn 组件
Card / Button / Badge / Progress / Avatar / Tabs / Tooltip / Dialog / ScrollArea / Sheet / Skeleton

---

## 8. 动效

| 库 | 用途 |
|---|---|
| `react-countup` | 数字滚动（属性、EXP、recovery、stamina） |
| `framer-motion` | 卡片入场 fade+up spring，hover 按下感 |
| `canvas-confetti` | 升级 / 三任务全完成时小爆撒 |
| 自定义 keyframes | 立绘 subtle 呼吸（scale 1.0↔1.02, 4s ease-in-out infinite）|

**约束**：动效要服务可读性，不要花里胡哨。每个动效问一句"它解决什么"，答不出来就删。

---

## 9. 布局骨架

### 9.1 桌面（1280×800 基准）

```
┌──────────┬─────────────────────────────────────────────────┐
│ Sidebar  │  Top tabs (首页/冒险/宠物/仓库/角色)    Avatar  │
│ w=224    ├─────────────────────────────────────────────────┤
│  Logo    │  ┌─────────────────────┐  ┌─────────────────┐  │
│  Nav 5   │  │  Character 主卡    │  │  今日概览        │  │
│          │  │  (立绘+名+lv+exp)  │  │  4 stat 卡      │  │
│          │  └─────────────────────┘  └─────────────────┘  │
│          │                                                  │
│          │  ┌──────────────┐  ┌──────────────────────┐    │
│          │  │ 当日冒险     │  │ 装备宠物 (3 slot)   │    │
│          │  │ 时间轴章节    │  │                      │    │
│          │  └──────────────┘  └──────────────────────┘    │
└──────────┴─────────────────────────────────────────────────┘
```

间距：组与组 `gap-6`，组内卡间 `gap-4`，容器 `p-6`。

### 9.2 移动（< 768px）
- Sidebar 折叠成底部 tab bar 5 项
- Character 主卡 + 今日概览 → 上下堆叠
- 冒险时间轴单列展开

### 9.3 五个主 Tab
| Tab | 路径 | 内容 |
|---|---|---|
| 首页 | `/dashboard` | 角色卡 + 今日 + 冒险时间轴 + 装备宠物 |
| 冒险 | `/dashboard/adventures` | 历史冒险列表 + 详情 |
| 宠物 | `/dashboard/pets` | 全部宠物（仓库 + 装备）|
| 仓库 | `/dashboard/inventory` | 物品（材料/装备/消耗品）|
| 角色 | `/dashboard/character` | 三维属性 + 装备槽 + 自定义 |

---

## 10. 图像生成规范（**core**）

### 10.1 模型与参数

| 参数 | 值 | 说明 |
|---|---|---|
| `model` | `gpt-image-2` | **禁** gpt-image-1 / gpt-image-3 |
| `quality` | `medium` | high 4 倍价格收益不显著；low 描边出不来 |
| `size` (宠物) | `1024x1024` | 1:1 |
| `size` (场景) | `1536x1024` | 3:2 横版 |
| `n` | 1 | 不要批量 |
| `response_format` | **不传** | 传了会报错 |
| 输出 | `resp.data[0].b64_json` | `Buffer.from(b64, 'base64')` |

### 10.2 Prompt 三段结构（不要乱）

每张图的 prompt **必须由三段拼接**，顺序固定：

```
[1. SUBJECT 描述]

[2. COMPOSITION 约束]

[3. STYLE LOCK]
```

实现见 `lib-render.mjs`：
- `petComposition(bg)` / `SCENE_COMPOSITION` → 第 2 段
- `doodlesStyleLock({ background })` → 第 3 段

### 10.3 SUBJECT 描述编写规则

#### 宠物 base_prompt
**只写生物特征**，不写背景 / 风格 / 颜色 / 构图（这些由系统拼接）。

✅ 好例子：
```
a fluffy round bunny with one long ear, mint green fur, tiny gold horn
a slender wolf with black feathers and cunning eyes
```

❌ 反例（污染 prompt，必须清洗）：
```
A cute glowing rabbit, ..., with a thick 2px black outline, hard offset shadow, pastel colors, in Doodles art style, centered and full-body illustration
```
（"thick black outline" "doodles style" "pastel" 都是 STYLE LOCK 的工作，写在 SUBJECT 里会跟系统重复甚至冲突）

**清洗逻辑**：见 `scripts/reset-all-images.mjs` 的 `cleanBasePrompt()`，正则删除常见污染短语。

#### 场景 image_prompt
**只写场景内容**：环境地点 + 角色和宠物在做什么。30-50 字英文。

✅ 好例子：
```
A windswept coastal cliff at sunset. The protagonist and a fluffy bunny pet stand on the edge, looking at distant rocks.
```

❌ 反例：
```
Doodles style coastal scene with bold black outlines and pastel colors, drop shadows...
```

### 10.4 STYLE LOCK 完整规则
（来自 `lib-render.mjs` `doodlesStyleLock`）

```
- Doodles NFT illustration style, neo-brutalism cartoon aesthetic
- Solid {bg.name} background {bg.hex}
  (NO gradients, NO photo backgrounds, NO patterns, NO scenery behind subject)
- Subject color palette: pastel candy colors —
  mint green #7FE3B0, candy pink #FF8FCB, periwinkle #7C7BE8, sunshine yellow #FFD84D,
  coral #FF7B7B, sky blue #9ED8F5, lilac #C9A8FF.
  Pick colors that CONTRAST with {bg.name} background so the subject pops.
- VERY BOLD black outline on EVERY shape — thick chunky lines, like a marker pen drawing
- HARD OFFSET DROP SHADOW: solid pure black #000 silhouette
  offset 8px right + 8px down, ZERO blur.
  Visible SECOND BLACK SHAPE, not subtle. Sticker-on-paper / screenprint feel.
- Flat fills, no shading, no gradients, no texture, no airbrush, no cel-shading
- Cute chibi proportions, friendly facial expression, big round eyes
- Subject(s) centered, full body visible, NO cropping
- ABSOLUTELY NO: text, emoji, watermark, logo, signature,
  photo-realism, anime style, dark fantasy, gothic, horror, 3D render,
  sketchy lines, muted/dark colors
```

### 10.5 COMPOSITION 约束

#### 宠物 (`petComposition(bg)`)
```
- Single creature, full body, standing/sitting pose facing camera at slight 3/4 angle
- Subject occupies ~70% of frame, centered, plenty of breathing room
- Solid {bg.name} {bg.hex} background — NO environment, NO floor, NO shadow on ground, NO decorations
- 1:1 square canvas
```

#### 场景 (`SCENE_COMPOSITION`)
```
- Wide landscape 3:2 ratio canvas
- Show the protagonist character + their active pets exploring
  (do not draw new pets, use reference images for character/pet appearance)
- All shapes drawn with VERY THICK 4-5px PURE BLACK outline
- Every distinct element gets its own hard offset drop shadow (5px right + 5px down)
- Background: solid cream #FAF8F3 with sparse doodle shapes (3-5 max simple elements)
- Lots of empty cream space, NOT crowded — Neo-brutalism breathes
- Limit to 4 visible characters/pets total in the frame
```

### 10.6 Reference image (image edit) 模式

烧场景图时把 character 立绘 + active pets base 图作 reference 传给 gpt-image-2 `images.edit()`：

```js
const refs = await Promise.all(referenceUrls.slice(0, 4).map(urlToFile))
const resp = await openai.images.edit({
  model: 'gpt-image-2',
  image: refs,
  prompt,
  size: '1536x1024',
  quality: 'medium',
})
```

**约束**：
- ≤ 4 张 reference（gpt-image-2 上限）
- 顺序：character 在前，pets 后接，最多 3 只
- 不传 reference → `images.generate()`，模型根据 prompt 自由发挥

### 10.7 已知模型行为

| 现象 | 状态 | 解决 |
|---|---|---|
| 多元素场景图 shadow 容易出（8/10） | OK | 不需要后处理 |
| 单一主体宠物图 shadow 经常没出（1-3/10） | 已知 | `scripts/add-drop-shadow.py` 后处理 |
| 描边粗度稳定 9-10/10 | OK | prompt 已固化 |
| 稀有度背景色命中率高 | OK | prompt 写死 hex 值 |
| 主体配色偶尔与背景同色融图 | 偶发 | "pick colors that CONTRAST" 已加，必要时重烧 |

### 10.8 后处理：硬 offset drop shadow

`scripts/add-drop-shadow.py` 用 Pillow 给已烧的图加 brutalism shadow：
1. 按背景色 hex 算 mask（与背景色差 > 25 阈值 = 主体）
2. 主体 mask → 纯黑剪影
3. 偏移 8px 右下
4. 合成回原背景色

```bash
python3 scripts/add-drop-shadow.py --bg "#7C7BE8" pet.png    # epic 紫蓝
python3 scripts/add-drop-shadow.py --bg "#FFD84D" --offset 10 pet.png  # 调偏移
```

需要 Python 3.13 + Pillow（`pip3 install Pillow`）。

### 10.9 成本估算

| 操作 | 单价 | 备注 |
|---|---|---|
| gpt-image-2 medium 1024x1024 | ~$0.04 | 宠物 base 图 |
| gpt-image-2 medium 1536x1024 | ~$0.06 | 场景图 |
| gpt-4o-mini 一次冒险叙事 | ~$0.001 | 7 章 + 掉落 + 遭遇 |
| 一次完整冒险（叙事 + 1 场景 + N 宠物） | ~$0.10-$0.15 | N=0-2 |

**Vercel Hobby 月预算**：~$5（免费），实际烧图都在 GH Actions 里调外部 API，不算 Vercel 函数 invocation。

### 10.10 Storage 路径约定

| 资源 | 路径 |
|---|---|
| 角色立绘 | `character/base.png` |
| 角色头像 | `character/avatar.png` |
| 宠物 base 图 | `pets/{user_pet_id}/base.png` |
| 宠物进化图 | `pets/{user_pet_id}/stage_{n}.png` |
| 冒险场景图 | `adventures/{adventure_id}/scene.png` |

**Bucket**: `character-art` (public read)。
**Cache busting**：DB 存的 URL 加 `?v={epoch}` 防浏览器缓存（详见 README 坑 3）。

---

## 11. Storybook 配色对应表（开发查表用）

```
common  → bg #7FE3B0  / 主体可用 pink / coral / lilac / 金黄
rare    → bg #9ED8F5  / 主体可用 pink / coral / lilac / 紫
epic    → bg #7C7BE8  / 主体可用 mint / pink / sun / coral
legend  → bg #FFD84D  / 主体可用 mint / sky / peri / coral
```

挑色原则：**不与背景同系**。

---

## 12. 验证 checklist

烧出新图或写完 UI 后，对照这张表自查：

### UI
- [ ] 没有 emoji 当图标
- [ ] 描边 2px 黑色，没用半透明
- [ ] 阴影零模糊，方向右下
- [ ] 没有渐变背景 / blur
- [ ] 字体 Nunito 800/900，数字滚动用 react-countup
- [ ] icon 全部 lucide-react，strokeWidth=2.5
- [ ] hover 有按下感（位移 + 阴影变化）
- [ ] 移动端 5 tab 折叠

### 生图
- [ ] 用了 `gpt-image-2`，没传 `response_format`
- [ ] Prompt 三段结构（SUBJECT / COMPOSITION / STYLE LOCK）
- [ ] SUBJECT 段没污染（没写 doodle / pastel / outline）
- [ ] 宠物图按 RARITY_BG 上色，场景图奶油底
- [ ] 主体颜色与背景对比足够（不融图）
- [ ] vision 抽样验过描边 / 风格 / 没违禁元素（emoji / 文字 / 写实）
- [ ] DB URL 加了 `?v={epoch}` cache buster
- [ ] Storage 路径符合约定（pets/{id}/base.png）

---

## 13. 常用代码片段

### 13.1 卡片基础样式
```tsx
<div className="
  bg-white rounded-2xl p-6
  border-2 border-[var(--ink)]
  shadow-[4px_4px_0_0_#1A1A1A]
  hover:shadow-[6px_6px_0_0_#1A1A1A]
  hover:-translate-x-0.5 hover:-translate-y-0.5
  transition
">...</div>
```

### 13.2 稀有度徽章
```tsx
const RARITY_HEX: Record<string, string> = {
  common: '#7FE3B0', rare: '#9ED8F5',
  epic: '#7C7BE8', legendary: '#FFD84D',
}
<span
  className="px-3 py-1 rounded-full border-2 border-[var(--ink)] font-bold text-sm"
  style={{ background: RARITY_HEX[pet.rarity] }}
>
  {pet.rarity.toUpperCase()}
</span>
```

### 13.3 数字滚动
```tsx
import CountUp from 'react-countup'
<CountUp end={stamina} duration={1.2} className="text-4xl font-black" />
```

### 13.4 lucide icon
```tsx
import { Sparkles } from 'lucide-react'
<Sparkles strokeWidth={2.5} className="w-5 h-5 text-[var(--candy-peri)]" />
```

---

## 14. 改本规范的流程

1. 改 `lib-render.mjs` 里的常量（`RARITY_BG` / `doodlesStyleLock` / `petComposition` / `SCENE_COMPOSITION`）—— 所有生图自动跟进
2. 同步改本文档
3. 改 `app/globals.css` 的 CSS 变量
4. 跑 `node scripts/reset-all-images.mjs` 重烧旧图（先 `DRY_RUN=1` + `LIMIT=2` 验证）
5. 加 cache buster：`UPDATE user_pets SET base_image_url = split_part(...) || '?v=' || EXTRACT(EPOCH ...)::bigint`
6. commit message: `style: ...`，PR 描述带前后对比图

---

## 附录 A：相关文档

- `docs/spec-v1.md` —— 业务规格（不含视觉）

旧 `docs/design-system.md`（v3）已删除，色板与布局规则已全量并入本文。
