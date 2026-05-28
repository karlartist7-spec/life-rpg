-- 011: 宠物 EXP 幂等标记
-- worker 在段1 给出战宠物发经验，pet_exp_granted 防止 worker 重跑时重复发放。
ALTER TABLE adventures
  ADD COLUMN IF NOT EXISTS pet_exp_granted boolean NOT NULL DEFAULT false;
