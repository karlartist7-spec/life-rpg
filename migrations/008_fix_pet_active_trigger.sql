-- Migration 008: 修复 pet active 触发器
-- 
-- BUG：007 用 SELECT COUNT(*) ... FOR UPDATE，PG 拒绝（0A000 FOR UPDATE is not allowed with aggregate functions）
-- 后果：任何把宠物 is_active 从 false→true 的 PATCH 都被 DB 拒，前端 500。
-- 
-- 修法：用 pg_advisory_xact_lock(user_id hash) 做并发互斥 —— 同一 user 的出站操作串行化，
-- 然后普通 COUNT 检查名额。advisory lock 在 commit 时自动释放。

CREATE OR REPLACE FUNCTION check_user_pets_active_limit()
RETURNS TRIGGER AS $$
DECLARE
  active_count integer;
BEGIN
  -- 只在 INSERT 或 UPDATE 把 is_active 从 false → true 时检查
  IF NEW.is_active = true AND (TG_OP = 'INSERT' OR OLD.is_active = false) THEN
    -- 事务级 advisory lock：同 user 的并发出站操作串行化
    -- 用 user_id::text 的 hashtext 作为 lock key
    PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text));

    SELECT COUNT(*) INTO active_count
    FROM user_pets
    WHERE user_id = NEW.user_id
      AND is_active = true
      AND id != NEW.id;

    IF active_count >= 3 THEN
      RAISE EXCEPTION 'PET_SLOT_FULL: 出站宠物已达上限 3 只 (user_id=%)', NEW.user_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
