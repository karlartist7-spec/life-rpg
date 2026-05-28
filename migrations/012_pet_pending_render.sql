-- 012: 宠物 worker 渲染队列（进化 / 孵化）。null = 无待办。
ALTER TABLE user_pets
  ADD COLUMN IF NOT EXISTS pending_render text
  CHECK (pending_render IS NULL OR pending_render IN ('evolution','hatch'));

CREATE INDEX IF NOT EXISTS user_pets_pending_render_idx
  ON user_pets(pending_render) WHERE pending_render IS NOT NULL;
