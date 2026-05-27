-- 010_adventure_status_split.sql
-- adventures.status 加 pending_story / pending_image 两个新阶段
-- pending_story: trigger 写完骨架（无 chapters），等 worker 调 LLM
-- pending_image: LLM 章节写完，等 worker 烧图
-- 旧 'pending' 保留（向后兼容老数据），worker 仍按 scene_image_url IS NULL 兜底处理

ALTER TABLE adventures
  DROP CONSTRAINT IF EXISTS adventures_status_check;

ALTER TABLE adventures
  ADD CONSTRAINT adventures_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'pending_story'::text,
    'pending_image'::text,
    'active'::text,
    'completed'::text,
    'failed'::text
  ]));

-- 索引：worker 扫 pending_story / pending_image
CREATE INDEX IF NOT EXISTS adventures_status_created_idx
  ON adventures(status, created_at)
  WHERE status IN ('pending_story', 'pending_image');
