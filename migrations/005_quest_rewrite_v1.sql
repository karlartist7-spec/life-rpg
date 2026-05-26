-- 005: 重写 quest seed —— 删除无 WHOOP 数据源的假任务，全部 5 个 quest 基于 WHOOP 真实数据
-- 哥说的原则："任务必须有真实数据源"

-- 1. 删除老 quest_progress（外键 cascade）+ 旧 quest
DELETE FROM quest_progress WHERE quest_id IN (
  SELECT id FROM quests WHERE slug IN ('commits_3', 'reading_30')
);
DELETE FROM quests WHERE slug IN ('commits_3', 'reading_30');

-- 2. 加 2 个新任务
INSERT INTO quests (slug, title, description, scope, active, reward_exp, condition, reward) VALUES
  ('workout_done', '完成训练', '今天完成至少 1 次训练', 'daily', true, 30,
   '{"metric":"workout_count","op":">=","value":1}'::jsonb,
   '{"exp":30,"attr":{"vit":1}}'::jsonb),
  ('strain_recovery_match', 'Strain 与 Recovery 匹配', '高 Recovery 上强训练 / 低 Recovery 适度休息', 'daily', true, 40,
   '{"metric":"strain_recovery_match","op":">=","value":1}'::jsonb,
   '{"exp":40,"attr":{"wil":1}}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  reward_exp = EXCLUDED.reward_exp,
  condition = EXCLUDED.condition,
  reward = EXCLUDED.reward,
  active = true;

SELECT slug, title, condition FROM quests WHERE active = true ORDER BY slug;
