-- 015: 开启 Supabase Realtime —— 把 App 实时订阅的表加入 supabase_realtime publication。
-- 用途：冒险章节解锁 / 进化·孵化完成（adventures、user_pets）+ 直读实时列表
-- （user_inventory、character_state）。RLS 已是 owner-only，Realtime 按订阅者 JWT 过滤，
-- 客户端只会收到属于自己的行变更。
-- 幂等：发布缺失则建之；表已在发布中则跳过。
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['adventures', 'user_pets', 'user_inventory', 'character_state'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
