-- 013: 角色一次性增益（被下一次冒险消费），如 {"bonus_drops": 1}
ALTER TABLE character_state
  ADD COLUMN IF NOT EXISTS pending_buffs jsonb NOT NULL DEFAULT '{}'::jsonb;
