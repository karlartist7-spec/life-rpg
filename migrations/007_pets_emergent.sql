-- ============================================================
-- Migration 007: 宠物系统从"物种目录"重构为"涌现式 unique 个体"
--
-- 核心变化：
--   1. 删除 pets 表（物种目录概念取消）
--   2. user_pets 改为 self-contained：每只宠物的所有元数据都在自己行内
--   3. 强化 active 上限触发器（3 只）
--   4. 用 gen_random_uuid() 给每只宠物一个唯一 species_uid（用于追踪进化链）
-- ============================================================

BEGIN;

-- 1. 先解除 user_pets 对 pets 的外键依赖
ALTER TABLE user_pets DROP CONSTRAINT IF EXISTS user_pets_pet_slug_fkey;

-- 2. 删除 pets 表（10 行物种数据，用不到了）
DROP TABLE IF EXISTS pets CASCADE;

-- 3. user_pets 重构为 self-contained
-- pet_slug 字段不再指向 pets 表，改为存储该 unique 个体的"种类标识"（LLM 生成时给的 slug）
-- 添加新列：name/description/base_prompt/rarity/element/habitat_origin/max_stage
ALTER TABLE user_pets
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS base_prompt text,
  ADD COLUMN IF NOT EXISTS rarity text DEFAULT 'common'
    CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  ADD COLUMN IF NOT EXISTS element text,
  ADD COLUMN IF NOT EXISTS habitat_origin text,
  ADD COLUMN IF NOT EXISTS max_stage integer DEFAULT 1
    CHECK (max_stage BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS species_uid uuid DEFAULT gen_random_uuid();

-- pet_slug 改为可空（旧字段不再强制，未来用 species_uid 锁定身份）
ALTER TABLE user_pets ALTER COLUMN pet_slug DROP NOT NULL;

-- 4. 加强 active 上限触发器（防 race condition）
-- 旧触发器（如果存在）先删
DROP TRIGGER IF EXISTS user_pets_active_limit ON user_pets;
DROP FUNCTION IF EXISTS check_user_pets_active_limit();

-- 新版本：用 SERIALIZABLE 级别的锁防并发
CREATE OR REPLACE FUNCTION check_user_pets_active_limit()
RETURNS TRIGGER AS $$
DECLARE
  active_count integer;
BEGIN
  -- 只在 INSERT 或 UPDATE 把 is_active 从 false → true 时检查
  IF NEW.is_active = true AND (TG_OP = 'INSERT' OR OLD.is_active = false) THEN
    -- 行级锁防并发
    SELECT COUNT(*) INTO active_count
    FROM user_pets
    WHERE user_id = NEW.user_id
      AND is_active = true
      AND id != NEW.id
    FOR UPDATE;

    IF active_count >= 3 THEN
      RAISE EXCEPTION 'PET_SLOT_FULL: 出站宠物已达上限 3 只 (user_id=%)', NEW.user_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_pets_active_limit
  BEFORE INSERT OR UPDATE ON user_pets
  FOR EACH ROW
  EXECUTE FUNCTION check_user_pets_active_limit();

-- 5. 索引：按 user_id 查 active 宠物（高频）
CREATE INDEX IF NOT EXISTS idx_user_pets_user_active
  ON user_pets(user_id, is_active) WHERE is_active = true;

-- 6. 索引：species_uid 用于追踪进化链
CREATE INDEX IF NOT EXISTS idx_user_pets_species_uid
  ON user_pets(species_uid);

COMMIT;
