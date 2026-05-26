# Life-RPG Dashboard v1 需求规范（FINAL）

哥 2026-05-26 锁定。所有开发以此为唯一准绳。设计稿见 `~/.hermes/image_cache/img_781d734c56d8.jpg`（仅做布局参考，视觉走 Doodles NFT 风）。

## 1. 产品目标
做 Doodles NFT 风的人生 RPG 面板。**用户每天打开页面，看到自己的角色因为真实生活数据成长了**。
不是健康 BI、不是手账、不是暗黑 HUD。

## 2. 首版 P0 范围

### 必做
- WHOOP 近 30 天数据同步（webhook + manual sync）
- DB: events / daily_scores / attributes / characters / quests / achievements / user_achievements / streaks
- 五维属性算法 + EXP 公式
- 每日结算 cron（06:30 用户时区）
- 30 天回填接口
- dashboard 聚合接口
- Doodles 风格首页 UI（首页一个页面，其它 Coming Soon）

### 不做
完整换装 / 好友 / 排行榜 / 复杂任务树 / 多用户权限 / BI 分析。

## 3. 首页布局
```
┌─────────────────────────────────────────────────┐
│ 顶部栏：life-rpg / 日期 / 通知 / 用户（连接状态） │
├──────┬──────────────────────┬───────────────────┤
│      │ 角色主卡（PFP/Lv/EXP）│ 今日状态（4 today） │
│ Side ├──────────────────────┴───────────────────┤
│ Nav  │ 五维属性 5 卡横排                          │
│      ├────────────────────┬──────────────────────┤
│      │ 每日任务            │ 冒险日志              │
│      ├────────────────────┴──────────────────────┤
│      │ 成就墙 / 30 天 EXP 趋势                    │
└──────┴────────────────────────────────────────────┘
```

## 4. 模块清单
- 顶部栏：life-rpg / 日期 / 通知 / 用户头像 + 连接状态徽标 (WHOOP/GitHub/Telegram)
- 左 sidebar：首页 ▸ 属性 / 任务 / 日志 / 成就 / 连接 / 设置（仅首页 active，其它 Coming Soon）
- 角色主卡：大 PFP + 名字 + Lv + 称号 + EXP 进度条 + 今日 motto
- 今日状态：Recovery / Sleep / Strain / Streak 4 张，大数字 + 昨日对比，没数据显示"等待同步"
- 五维属性 5 张：值 / 今日增量 / 进度条 / 7 天 sparkline / 数据来源
- 每日任务：默认 5 任务（睡 7h / Recovery≥60 / Strain≥12 / Commit 3 次 / 阅读 30 min）
- 冒险日志：最近 5 条 RPG 风格文案
- 成就墙：6 个成就（早起鸟 / Recovery Wizard / Code Knight / Workout Hero / Book Worm / Streak Monk）

## 5. 称号规则
| 条件 | 称号 |
|---|---|
| SPR 最高 | Recovery Wizard |
| VIT 最高 | Strain Runner |
| INT 最高 | Code Knight |
| WIL 最高 | Streak Monk |
| CHA 最高 | Social Bard |
| 数据不足 | Rookie Adventurer |

## 6. 属性算法（单日 delta）

### VIT (体力, max +3)
- Recovery ≥ 60 → +1
- Strain ≥ 12 → +1
- Strain ≥ 14 → 额外 +1
- 有 Workout → +1

### SPR (精神, max +3)
- 睡眠 ≥ 7h → +1
- sleep_performance ≥ 85 → +1
- Recovery ≥ 70 → +1
- HRV > 7 日均值 → +1

### INT (智力, max +4)
- Commits ≥ 1 → +1
- Commits ≥ 3 → 额外 +1
- Commits ≥ 5 → 额外 +1
- 阅读 ≥ 30 min → +2

### WIL (意志, max +3)
- 完成 3 个日常任务 → +1
- Streak ≥ 7 → +1
- Streak ≥ 15 → 额外 +1
- Recovery < 40 但完成核心任务 → +2

### CHA (魅力)
- 社交打卡 → +1
- 饭局/电话/见面 → +1
- 演讲/公开表达 → +2

## 7. EXP 公式
```
exp_gained =
  VIT_delta * 10
+ SPR_delta * 10
+ INT_delta * 10
+ WIL_delta * 12
+ CHA_delta * 10
+ tasks_completed * 5
```

升级曲线：`next_level_exp = 1000 + current_level * 120`

## 8. 视觉规范
明亮糖果色 + 粗黑描边（2px #1A1A1A）+ 圆润几何 + 现代圆体字体（Nunito）+ 大 PFP。
**禁忌**：暗黑 HUD / 手账 / 儿童学习 / BI 大屏 / 手写体 / 草稿线条 / 过多装饰。

详细 token 见 `docs/design-system.md`。

## 9. 触发流程
- WHOOP webhook → events → 等待结算
- Cron 06:30 → 读昨日 events → 算五维/EXP → 升级 → 更新任务/成就 → 写 adventure log → Telegram 推送早报
- 同日同用户**幂等**：重复执行不重复加 EXP
- 没数据**跳过**，不写 0

## 10. 接口
- `POST /api/webhook/whoop` — webhook 入口（已有）
- `POST /api/sync/whoop` — 手动同步
- `POST /api/admin/backfill` — 30 天回填
- `GET /api/whoop/status` — WHOOP 连接状态
- `POST /api/cron/daily` — 每日结算（GH Actions 触发）
- `GET /api/dashboard` — 首页聚合数据

## 11. 验收
**打开首页 3 秒内，用户能看懂：我今天状态如何、角色为什么成长、下一步该完成什么。**
