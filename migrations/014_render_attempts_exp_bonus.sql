-- 014: 冒险渲染重试计数 + 结算 EXP 拆分（base/bonus）
-- render_attempts: worker 段1/段2 失败时 +1，达到上限才置 failed，避免单次瞬时网络错误永久卡死
ALTER TABLE adventures
  ADD COLUMN IF NOT EXISTS render_attempts integer NOT NULL DEFAULT 0;

-- exp_bonus: 成就奖励 EXP 与基础 EXP 分开存，重算时正确回退，避免每次重结算 EXP 缩水
ALTER TABLE daily_settlements
  ADD COLUMN IF NOT EXISTS exp_bonus integer NOT NULL DEFAULT 0;
