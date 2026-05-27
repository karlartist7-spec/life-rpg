-- ============================================================
-- 009: 三维属性 + 体力系统 + 章节化冒险
-- 设计原则：身体真信号 → 三维（体魄/耐力/专注）→ 体力 → 场景档位 → 冒险范围
-- ============================================================

-- 1. character_state 加三维字段（保留旧 vit/spr/int/wil/cha 兼容渐进迁移）
ALTER TABLE character_state
  ADD COLUMN IF NOT EXISTS physique  INTEGER NOT NULL DEFAULT 10,  -- 体魄 ← recovery 30天均值
  ADD COLUMN IF NOT EXISTS endurance INTEGER NOT NULL DEFAULT 10,  -- 耐力 ← strain 累计 + 睡眠时长
  ADD COLUMN IF NOT EXISTS focus     INTEGER NOT NULL DEFAULT 10,  -- 专注 ← sleep_efficiency × hrv 稳定性
  ADD COLUMN IF NOT EXISTS hp_max    INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS hp_current INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS today_stamina       INTEGER,            -- 当日体力（醒来算一次）
  ADD COLUMN IF NOT EXISTS today_scene_tier    TEXT,               -- 'nearby'/'coast'/'ruin'/'astral'
  ADD COLUMN IF NOT EXISTS today_rarity_tier   TEXT,               -- 'common'/'rare'/'epic'/'legendary'
  ADD COLUMN IF NOT EXISTS today_stats_date    DATE;               -- 今日属性算到了哪天（幂等）

COMMENT ON COLUMN character_state.physique  IS '体魄: WHOOP recovery_score 最近 30 天滚动均值';
COMMENT ON COLUMN character_state.endurance IS '耐力: strain 30天累计 × sleep_minutes 30天均值 归一化';
COMMENT ON COLUMN character_state.focus     IS '专注: sleep_efficiency 30天均值 × HRV 稳定度';
COMMENT ON COLUMN character_state.today_stamina IS '当日体力: sleep_min × (recovery/100) × (1 + strain/20)';

-- 2. adventures 加章节化 + 体力档位字段
ALTER TABLE adventures
  ADD COLUMN IF NOT EXISTS stamina_used    INTEGER,                -- 触发时的体力快照
  ADD COLUMN IF NOT EXISTS scene_tier      TEXT,                   -- 'nearby'/'coast'/'ruin'/'astral'
  ADD COLUMN IF NOT EXISTS rarity_tier     TEXT,                   -- 主掉落稀有度档
  ADD COLUMN IF NOT EXISTS duration_min    INTEGER,                -- 等于 sleep_minutes
  ADD COLUMN IF NOT EXISTS chapters        JSONB,                  -- [{idx,title,body,unlock_at,...}]
  ADD COLUMN IF NOT EXISTS triggered_by    TEXT;                   -- 'sleep_recovery'/'manual'

COMMENT ON COLUMN adventures.chapters IS '章节数组: 一次性 LM 生成，按 unlock_at 时间逐步揭晓';

-- 3. 当日唯一约束（一天一次冒险）
-- 用 partial unique index：同一 user 同一日期只允许一行
CREATE UNIQUE INDEX IF NOT EXISTS adventures_user_date_unique
  ON adventures (user_id, (date(started_at AT TIME ZONE 'Asia/Shanghai')));

-- 4. 索引：按 user 倒序查最新冒险
CREATE INDEX IF NOT EXISTS adventures_user_started_idx
  ON adventures (user_id, started_at DESC);
