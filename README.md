# life-rpg

把真实生活变成放置挂机 RPG —— **睡觉就是冒险，运动就是练级，宠物随冒险捕获**。

线上：https://life-rpg-steel.vercel.app

---

## 这是什么

把 WHOOP 健康设备的睡眠/恢复/运动数据接入一个游戏化系统：

- **睡多久 = 冒险多久**：一觉醒来自动触发当日冒险
- **WHOOP recovery + sleep + strain → 三维属性**：体魄 / 耐力 / 专注
- **三维属性 → 当日体力**：体力档位决定能去哪种场景
  - 0-100 体力 → 近郊（common 掉落为主）
  - 100-250 → 海岸（rare）
  - 250-400 → 遗迹（epic）
  - 400+ → 异界（legendary）
- **冒险流程**：webhook 触发 → 写骨架 → GitHub Actions worker 用 LLM 生成多章节叙事 → gpt-image-2 烧场景图 / 宠物图 → 章节按时间逐步解锁
- **宠物收集**：冒险中按概率遭遇野生宠物，capture 成功后留在仓库，可装备出征

视觉是浅色 Doodles + Neo-brutalism（黑粗描边 + 硬 offset shadow + 糖果色），**禁深色、禁 emoji、禁 blur**。所有 UI 图标走 `lucide-react`，绝不用 emoji。

---

## 技术栈

| 层 | 选型 | 用法 |
|---|---|---|
| Framework | Next.js 16 + React 19 + Tailwind v4 | App Router |
| UI 组件 | shadcn/ui + lucide-react | 不要从零写组件 |
| 数据库 | Supabase (PostgreSQL + Storage + Auth) | ap-northeast-1 东京（PRC 友好）|
| 图像生成 | OpenAI gpt-image-2 | 禁 gpt-image-1，禁 `response_format` |
| LLM 叙事 | OpenAI gpt-4o-mini | 可热切 DeepSeek（同一 base_url 配 DEEPSEEK_API_KEY 自动切）|
| 数据源 | WHOOP API v2 | OAuth + webhook |
| 部署 | Vercel Hobby + GitHub Actions | 详见下文「Vercel 60s 限制」|
| 包管理 | pnpm | `pnpm-lock.yaml`，**不要混用 npm/yarn** |

---

## 项目结构

```
app/
  api/
    webhook/whoop/      # WHOOP webhook 入口（HMAC 验签）
    adventures/
      trigger/          # 冒险 bootstrap（5s 内返回）
      [id]/             # 单冒险详情
    cron/morning/       # GH Actions 调用的早报投递
    inventory/          # 物品/装备 API
    pets/               # 宠物管理 API
    sync/whoop/         # WHOOP 数据同步
    auth/               # NextAuth 回调
    admin/              # 管理面板（需登录）
    debug/              # 调试用，生产关闭
  dashboard/            # 主页（角色 + 冒险时间轴 + 宠物）
  preview/              # 设计稿预览页
  login/                # 登录页

components/
  ui/                   # shadcn/ui 组件
  ...                   # 业务组件

lib/
  supabase/             # SSR client + service role client
  whoop/                # OAuth + API client + webhook 验签
  telegram/             # 早报投递（可选）

scripts/
  render-pending-adventures.mjs   # GH Actions 冒险 worker（核心）
  lib-render.mjs                  # 风格锁/稀有度配色/生图工具（共享）
  reset-all-images.mjs            # 一次性：重烧所有宠物+场景图
  add-drop-shadow.py              # 后处理：加 brutalism offset shadow
  gen-character-base.mjs          # 生成角色基础形象
  gen-hermes-art.mjs              # 早期角色制作脚本
  seed-items.mjs                  # 物品目录初始化
  tg-daily-summary.py             # Telegram 早报推送

migrations/                       # SQL 迁移按序号执行
.github/workflows/
  morning-poll.yml                # 每日 0:00 UTC 拉 WHOOP + 投早报
  render-adventures.yml           # 每 5min 扫 pending 冒险并烧

docs/
  spec-v1.md                      # 完整规格
  design-system.md                # 视觉规范
```

---

## 已配置的内容（state of the world）

### Supabase 项目
- **ref**: `qgowirdryppnbgnvuzpg`（**ap-northeast-1 东京**，避开港区）
- **DB schema**: migrations 005-010 全部 apply 到 prod
- **Storage bucket**: `character-art` 公开读，存 `pets/{id}/base.png` + `adventures/{id}/scene.png`
- **RLS**: 大部分表启用，service role 旁路

### Vercel 部署
- **Project ID**: `prj_Y14s0pw7rD8wuQC2Z50xzFiX1Ynl`
- **Domain**: `life-rpg-steel.vercel.app`
- **Plan**: Hobby（关键限制：函数 60s 硬上限）
- **Env vars**: 通过 Vercel 控制台或 `vercel env pull` 同步

### WHOOP 集成
- **Client ID**: `36a3e0eb...`（life-rpg 专用，**不是** Hermes 的 `b4ff52bf`）
- **Scope**: `read:recovery read:sleep read:workout read:cycles offline`（refresh **必须**单值 `offline`，多值 400）
- **Webhook**: 已注册到 `https://life-rpg-steel.vercel.app/api/webhook/whoop`
- **Webhook 验签**: `base64(HMAC-SHA256(client_secret, ts + body))` —— 用的是 **client_secret，不是独立 webhook secret**（Dashboard 没有独立字段）

### GitHub Actions
- `render-adventures.yml`: 每 5 分钟扫一次 status=pending_story/pending_image 的冒险，跑 worker
- `morning-poll.yml`: 每日定时拉 WHOOP daily 数据 + 写 daily_settlement + 投 Telegram 早报
- 双 workflow_dispatch，可手动触发
- **secrets** 已注入（OPENAI_API_KEY / SUPABASE_* / WHOOP_* / TELEGRAM_*）

### 视觉资产
- 角色 base 图：已生成存 Supabase Storage `character-art/character/base.png`
- 物品图：在 `public/character-art/items/` 静态打包
- **15 只 user_pets 全部按新规则重烧**（稀有度背景色 + Doodles 风格，2026-05-28 完成）
- **1 个 adventure 场景图**（75184adc，ruin/epic）也按新规则重烧

### gh CLI 双账号（重要）
本机 gh CLI 配了两个账号：
- `Zy-GN`（主账号）
- `karlartist7-spec`（**life-rpg 专用**）

涉及 life-rpg 的 push/PR **必须先切**：
```bash
gh auth switch -u karlartist7-spec
```
否则 push 403。

---

## 本地开发

### 1. 拉代码
```bash
gh auth switch -u karlartist7-spec
gh repo clone karlartist7-spec/life-rpg
cd life-rpg
```

### 2. 装依赖
```bash
# 没 pnpm 的话先装
brew install pnpm   # 或 npm i -g pnpm
pnpm install
```

需要 Node 20+（Next 16 要求）。

### 3. 配 .env.local

**最快**：从 Vercel 拉一份，保证一致
```bash
npx vercel link        # 选 life-rpg 项目
npx vercel env pull .env.local
```

**手动配**：参考 `~/.hermes/secrets/life-rpg-tokens.json`，需要这些 key：
```bash
NEXT_PUBLIC_SUPABASE_URL=https://qgowirdryppnbgnvuzpg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...     # 服务端独占，永不返回前端
OPENAI_API_KEY=...
WHOOP_CLIENT_ID=36a3e0eb...
WHOOP_CLIENT_SECRET=...
WHOOP_REDIRECT_URI=http://localhost:3000/api/auth/whoop/callback   # 本地用
TELEGRAM_BOT_TOKEN=...             # 早报推送，可选
TELEGRAM_CHAT_ID=...
```

### 4. 跑起来
```bash
pnpm dev   # localhost:3000
pnpm build && pnpm start   # 生产模式
pnpm lint  # ESLint
```

---

## 关键坑（写代码前先扫一眼）

### 1. Vercel Hobby 函数 60s 硬上限
- 包括 `after()` 也会被 kill
- **长任务（生图/LLM 多次调用）必须挪到 GitHub Actions worker**，不要在 API route 里直跑
- life-rpg 现成模式：trigger API 写 pending → GH Actions cron 每 5min 扫 → worker 直调 OpenAI + Supabase Storage

### 2. Node 20+ 原生 fetch 不读代理环境变量
PRC 环境直跑 `fetch()` 会因为代理走不通直接 fail，curl 同 URL 通 = 典型症状。修复：
```js
import { ProxyAgent, setGlobalDispatcher } from 'undici'
setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || 'http://127.0.0.1:7890'))
```
`undici` 是 Node 18+ 内置，但 `ProxyAgent` 要 `npm install undici`。
worker 里已处理，写新脚本时要小心。

### 3. Supabase Storage public URL 默认浏览器缓存
- URL 模式：`/storage/v1/object/public/{bucket}/{path}`
- 服务端 `cache-control: no-cache` ✅
- **但浏览器 / Next `/_next/image` 看 URL 字符串相同就吃本地缓存**
- 同一路径覆盖（upsert）不变 URL → 旧图卡住
- **解决**：DB 里存的 URL 加 `?v={epoch}` cache-buster：
  ```sql
  UPDATE user_pets SET base_image_url = split_part(base_image_url,'?',1)||'?v='||EXTRACT(EPOCH FROM updated_at)::bigint
  ```

### 4. gpt-image-2 行为
- ✅ 用 `gpt-image-2` 模型名（**不是** gpt-image-1）
- ✅ 不要传 `response_format`（会报错）
- ✅ 输出是 `b64_json`，buffer = `Buffer.from(resp.data[0].b64_json, 'base64')`
- ❌ 单一主体 + 实色背景下，prompt 里写 "drop shadow" 经常被误解成 outline。Neo-brutalism 硬 offset shadow 在场景图（多元素）里能稳定出，宠物图较难
- 解决方案：`scripts/add-drop-shadow.py` 后处理（按背景色 hex 抠主体 alpha → 偏移 8px 右下 → 合成黑色剪影）

### 5. WHOOP API 陷阱
- Base URL: `https://api.prod.whoop.com/developer/v2`
- Refresh scope **必须单值 `offline`**（多值会 400）
- Refresh token **single-use 自动轮换**：每次 refresh 拿到新 token 必须立刻存回 DB，旧的失效
- Webhook payload 用 `client_secret` 验签，不是独立 webhook secret
- Trigger 触发后**同日只能创建一个 adventure**（UTC+8 算今日）。测试 fixture **必须清理**，否则会 409 挡掉真实 webhook

### 6. UI 视觉系统硬约束
- **禁 emoji**：所有图标用 `lucide-react`，绝不用 ❌🎯🚀✨ 这种
- **禁深色 / blur / gradient**：浅色 Doodles 风
- **黑粗描边 4-5px** + **硬 offset shadow（5-8px 右下，零模糊）**
- **稀有度背景色**（写在 `lib-render.mjs`）：
  - common: `#7FE3B0` 薄荷
  - rare: `#9ED8F5` 天蓝
  - epic: `#7C7BE8` 紫蓝
  - legendary: `#FFD84D` 金黄
  - 场景图始终奶油底 `#FAF8F3`
- **导航**：5 Tabs（首页/冒险/宠物/仓库/角色）
- 反模式：单调静态卡片网格 = "简单无聊枯燥"。要 game-like：动效、进度条、徽章、对比、排行、变化趋势

### 7. 建系统前先把机制讲清楚
看到表里有数据就直接画 UI = 反模式。每个 entity **必须一句话回答**：用户对它做什么动作 + 系统里什么状态会变？答不出来就先设计机制，不要写展示页。

### 8. Supabase 列名易踩
- `daily_settlements.sleep_minutes`（不是 `sleep_min`）
- `events.type`（不是 `kind`）
- `character_state.character_base_image_url`（不是 `image_url`）
- `events.processed_at` 全是 NULL **不代表 webhook 失败**（webhook 路由直接 waitUntil 调下游，没单独 processor）

### 9. Vercel logs 保留期短（~1h）
过去事件查不到就模拟重放：手动 `curl` 触发 webhook + 看 GH Actions log。

---

## 常用运维命令

```bash
# 切到 life-rpg 专用 GH 账号
gh auth switch -u karlartist7-spec

# 手动触发冒险 worker（不等 cron）
gh workflow run render-adventures -R karlartist7-spec/life-rpg

# 查 worker 最近 run
gh run list -w render-adventures -L 5 -R karlartist7-spec/life-rpg

# 查 GH Actions secrets（不显示值）
gh secret list -R karlartist7-spec/life-rpg

# Supabase SQL 查询（要 Mozilla UA）
curl -X POST "https://api.supabase.com/v1/projects/qgowirdryppnbgnvuzpg/database/query" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0" \
  -d '{"query":"SELECT count(*) FROM user_pets"}'

# 重烧所有宠物+场景图
OPENAI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/reset-all-images.mjs
# 限制数量：LIMIT=2 node scripts/reset-all-images.mjs
# 只跑场景：SCENES_ONLY=1 node scripts/reset-all-images.mjs
# Dry run：DRY_RUN=1 node scripts/reset-all-images.mjs

# 后处理加 drop shadow（背景色按稀有度）
python3 scripts/add-drop-shadow.py --bg "#7C7BE8" /path/to/pet.png
```

---

## 数据流（一图）

```
WHOOP wearable
   │ wakes up + recovery score
   ▼
WHOOP webhook (recovery.updated)
   │ POST /api/webhook/whoop  (HMAC verify)
   ▼ waitUntil 并发触发：
   ├─→ /api/cron/morning  → daily_settlement + Telegram 早报
   └─→ /api/adventures/trigger  → 写 adventures 骨架 (status=pending_story)
                                  → 5s 内返回（避开 60s 限制）

GitHub Actions render-adventures (cron */5)
   │ 扫 pending_story
   ▼
worker (scripts/render-pending-adventures.mjs)
   段1：LLM (gpt-4o-mini) 生成章节 + 故事 + 掉落 + 宠物遭遇
        → 写 chapters / story_md / rewards / pet_encounter
        → 写 user_inventory（掉落物品）
        → 写 user_pets（捕获新宠物 + 烧 base 图）
        → status='pending_image'
   段2：gpt-image-2 烧场景图（带 character + active pets 作 reference）
        → 写 scene_image_url
        → status='completed'

User 打开 /dashboard
   │ 拉 character_state + adventures + user_pets + user_inventory
   ▼
   首页：角色卡 + 今日冒险时间轴 + 装备宠物
   章节按 unlock_offset_min 时间戳逐步解锁可读
```

---

## 文档与参考

- `docs/spec-v1.md` —— 完整业务规格
- `docs/design-system.md` —— 视觉系统规范
- `migrations/*.sql` —— DB schema 演变历史
- `AGENTS.md` —— Next.js 16 注意事项（破坏性变更要查 `node_modules/next/dist/docs/`）

---

## 维护者备忘

- **PR 流程**：先 `gh auth switch -u karlartist7-spec`，分支命名 `feat/xxx` 或 `fix/xxx`
- **commit 风格**：`feat(xxx): 中文描述`
- **migrations 严禁修改已 apply 的文件**，新加只能往后加序号
- **Storage bucket 名固定** `character-art`，目录结构 `pets/{id}/`、`adventures/{id}/`、`character/`
- **OpenAI 成本预估**：gpt-image-2 medium ≈ $0.04/张，gpt-4o-mini 一次叙事生成 ≈ $0.001
- **GH Actions 配额**：Hobby 2000 min/月，render-adventures 每 5min 一次空扫 ~10s，月耗 ~50min
