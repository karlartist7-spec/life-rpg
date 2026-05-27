-- 006: 宠物 / 冒险 / 物品系统
-- 哥的设计：宠物作为可派遣单位（最多 3 只 active），冒险由事件触发，掉落进物品栏
-- 美术规范：cute doodle, pastel + 2px black outline + 5px offset shadow（与角色画风统一）

-- ============================================================
-- 1. pets —— 物种 / 图鉴定义（共享目录）
-- ============================================================
CREATE TABLE IF NOT EXISTS pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  base_prompt text NOT NULL,
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary')),
  primary_element text CHECK (primary_element IS NULL OR primary_element IN ('火','水','风','土','光','暗')),
  evolution_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_stage int NOT NULL DEFAULT 1,
  habitat text[] NOT NULL DEFAULT '{}',
  catch_rate numeric NOT NULL DEFAULT 0.3 CHECK (catch_rate >= 0 AND catch_rate <= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. user_pets —— 玩家持有的宠物实例
-- ============================================================
CREATE TABLE IF NOT EXISTS user_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_slug text NOT NULL REFERENCES pets(slug) ON DELETE RESTRICT,
  nickname text,
  level int NOT NULL DEFAULT 1,
  exp int NOT NULL DEFAULT 0,
  evolution_stage int NOT NULL DEFAULT 1,
  base_image_url text,
  current_image_url text,
  evolution_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  caught_at timestamptz NOT NULL DEFAULT now(),
  caught_adventure_id uuid,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_pets_user_active ON user_pets(user_id, is_active);

-- 触发器：每个 user 最多 3 只 is_active=true
CREATE OR REPLACE FUNCTION enforce_active_pets_limit()
RETURNS TRIGGER AS $$
DECLARE
  active_count int;
BEGIN
  IF NEW.is_active = true THEN
    SELECT COUNT(*) INTO active_count
    FROM user_pets
    WHERE user_id = NEW.user_id
      AND is_active = true
      AND id <> NEW.id;
    IF active_count >= 3 THEN
      RAISE EXCEPTION '宠物上阵上限（3 只）已达到，请先收回一只再派遣';
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_active_pets_limit ON user_pets;
CREATE TRIGGER trg_enforce_active_pets_limit
  BEFORE INSERT OR UPDATE ON user_pets
  FOR EACH ROW EXECUTE FUNCTION enforce_active_pets_limit();

-- ============================================================
-- 3. adventures —— 冒险记录
-- ============================================================
CREATE TABLE IF NOT EXISTS adventures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  scene_type text CHECK (scene_type IS NULL OR scene_type IN ('forest','ocean','town','cave','mountain','ruin','astral')),
  story_md text,
  scene_image_url text,
  references_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  pets_dispatched uuid[] NOT NULL DEFAULT '{}',
  rewards jsonb NOT NULL DEFAULT '{}'::jsonb,
  pet_encounter jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adventures_user_status_started
  ON adventures(user_id, status, started_at DESC);

-- 现在可以补 user_pets.caught_adventure_id 的外键
ALTER TABLE user_pets
  DROP CONSTRAINT IF EXISTS user_pets_caught_adventure_fk;
ALTER TABLE user_pets
  ADD CONSTRAINT user_pets_caught_adventure_fk
  FOREIGN KEY (caught_adventure_id) REFERENCES adventures(id) ON DELETE SET NULL;

-- ============================================================
-- 4. items —— 物品目录（共享）
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('equip','material','consumable','egg','collect')),
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary')),
  image_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. user_inventory —— 玩家背包
-- ============================================================
CREATE TABLE IF NOT EXISTS user_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_slug text NOT NULL REFERENCES items(slug) ON DELETE RESTRICT,
  qty int NOT NULL DEFAULT 1 CHECK (qty >= 0),
  equipped boolean NOT NULL DEFAULT false,
  acquired_adventure_id uuid REFERENCES adventures(id) ON DELETE SET NULL,
  acquired_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_inventory_user_item ON user_inventory(user_id, item_slug);

-- 部分唯一索引：非装备物品同种合并堆叠（每个 user 每个 slug 一行）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_inventory_unequipped
  ON user_inventory(user_id, item_slug)
  WHERE equipped = false;

-- ============================================================
-- 6. character_state 扩展
-- ============================================================
ALTER TABLE character_state ADD COLUMN IF NOT EXISTS character_base_image_url text;
ALTER TABLE character_state ADD COLUMN IF NOT EXISTS pet_slots_max int DEFAULT 3;

-- ============================================================
-- 7. RLS
-- ============================================================
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE adventures ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_inventory ENABLE ROW LEVEL SECURITY;

-- pets / items：共享目录，所有已认证用户可读
DROP POLICY IF EXISTS "pets_read_all_authed" ON pets;
CREATE POLICY "pets_read_all_authed" ON pets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "items_read_all_authed" ON items;
CREATE POLICY "items_read_all_authed" ON items
  FOR SELECT TO authenticated USING (true);

-- user_pets：自己可读写
DROP POLICY IF EXISTS "user_pets_select_own" ON user_pets;
CREATE POLICY "user_pets_select_own" ON user_pets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "user_pets_insert_own" ON user_pets;
CREATE POLICY "user_pets_insert_own" ON user_pets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "user_pets_update_own" ON user_pets;
CREATE POLICY "user_pets_update_own" ON user_pets
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "user_pets_delete_own" ON user_pets;
CREATE POLICY "user_pets_delete_own" ON user_pets
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- adventures：自己可读写
DROP POLICY IF EXISTS "adventures_select_own" ON adventures;
CREATE POLICY "adventures_select_own" ON adventures
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "adventures_insert_own" ON adventures;
CREATE POLICY "adventures_insert_own" ON adventures
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "adventures_update_own" ON adventures;
CREATE POLICY "adventures_update_own" ON adventures
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "adventures_delete_own" ON adventures;
CREATE POLICY "adventures_delete_own" ON adventures
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- user_inventory：自己可读写
DROP POLICY IF EXISTS "user_inventory_select_own" ON user_inventory;
CREATE POLICY "user_inventory_select_own" ON user_inventory
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "user_inventory_insert_own" ON user_inventory;
CREATE POLICY "user_inventory_insert_own" ON user_inventory
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "user_inventory_update_own" ON user_inventory;
CREATE POLICY "user_inventory_update_own" ON user_inventory
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "user_inventory_delete_own" ON user_inventory;
CREATE POLICY "user_inventory_delete_own" ON user_inventory
  FOR DELETE TO authenticated USING (user_id = auth.uid());
