# Mobile Slice B — Bearer+CORS for pets/inventory/adventures + Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Open the pets / inventory / adventures user routes to the native app by applying the existing `getRouteUser` (Bearer→cookie fallback) + CORS preamble that `/api/dashboard` already uses, and enable Supabase Realtime on the tables the app subscribes to — **without changing Web cookie behavior or touching any machine route.**

**Architecture:** Pure backend, minimal & backward-compatible. Each of 7 user routes swaps its `createSrv()` + `auth.getUser()` preamble for `const { supabase: supa, user } = await getRouteUser(req)` (bind `supa` only where used), wraps every response in `withCors(req, …)`, and adds `export function OPTIONS(req) { return preflight(req) }`. Realtime is enabled via a new idempotent migration that adds tables to the `supabase_realtime` publication (RLS already owner-only filters per-subscriber). Machine routes (`cron/*`, `webhook/*`, `adventures/trigger|render`, `admin/*`, `debug/telegram-test`) are **untouched** — they keep their exact `Bearer ${CRON_SECRET}` comparison.

**Tech Stack:** Next.js (App Router, Node runtime), `@supabase/supabase-js`, `@supabase/ssr`. Existing helpers `lib/supabase/route-auth.ts` (`getRouteUser`) and `lib/http/cors.ts` (`preflight`, `withCors`) — already shipped and proven by `/api/dashboard` in Phase 1.

**Verification reality:** Root has no test runner. Gates are (1) **no new `app/api/` tsc errors** (`npx tsc --noEmit 2>&1 | grep '^app/api/'` → empty; the only pre-existing tsc errors are in `app/dashboard/pets/page.tsx`), (2) **scoped eslint** of the 7 changed files → 0 errors, (3) a **curl boundary checklist** (user-run, covers the spec's CRON_SECRET-rejected / user-JWT-rejected assertions via real integration), and (4) a **Web non-regression** check (cookie pages still load). The spec's "add automated boundary tests" is intentionally substituted by the curl checklist — see Self-Review.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `app/api/pets/route.ts` | GET list + PATCH active → Bearer+CORS | Modify |
| `app/api/pets/evolve/route.ts` | POST evolve → Bearer+CORS | Modify |
| `app/api/inventory/route.ts` | GET inventory → Bearer+CORS | Modify |
| `app/api/inventory/use/route.ts` | POST use → Bearer+CORS | Modify |
| `app/api/inventory/equip/route.ts` | POST equip → Bearer+CORS | Modify |
| `app/api/adventures/route.ts` | GET list/detail → Bearer+CORS | Modify |
| `app/api/adventures/retry/route.ts` | POST retry → Bearer+CORS | Modify |
| `migrations/015_realtime_publication.sql` | add tables to `supabase_realtime` | Create |

**Numbering note:** the design spec tentatively reserved `015`=push_tokens (Phase 4) and `016`=oauth_states (Phase 3). Those files don't exist yet; this slice takes `015` for Realtime, so Phase 3/4 shift to `016`/`017`. Flagged so the later phases renumber.

---

## Task 1: pets/route.ts → Bearer+CORS

**Files:** Modify `app/api/pets/route.ts`

- [ ] **Step 1: Replace the entire file**

`supa` is used in GET (queries) but NOT in PATCH (`setPetActive` takes `user.id`), so PATCH binds only `user` to avoid an unused-var lint error.

```ts
/**
 * GET  /api/pets   → 列出当前用户的全部宠物
 * PATCH /api/pets  → 切换宠物 is_active（出战 / 收回），body: { user_pet_id, active }
 *
 * 鉴权：getRouteUser —— 原生 App 用 Authorization: Bearer <JWT>，Web 回退 cookie；
 * 二者 RLS 等价（都按 user_id 隔离）。仅 App 调用的用户路由附 CORS。
 */
import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase/route-auth'
import { preflight, withCors } from '@/lib/http/cors'
import { setPetActive } from '@/lib/pets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { supabase: supa, user } = await getRouteUser(req)
  if (!user) return withCors(req, new NextResponse('unauthorized', { status: 401 }))

  const { data, error } = await supa
    .from('user_pets')
    .select('*')
    .eq('user_id', user.id)
    .order('caught_at', { ascending: false })

  if (error) {
    return withCors(req, NextResponse.json({ error: error.message }, { status: 500 }))
  }

  return withCors(req, NextResponse.json({
    pets: data ?? [],
    active_count: (data ?? []).filter((p: any) => p.is_active).length,
    max_active: 3,
  }))
}

export async function PATCH(req: Request) {
  const { user } = await getRouteUser(req)
  if (!user) return withCors(req, new NextResponse('unauthorized', { status: 401 }))

  const body = await req.json().catch(() => null)
  if (!body || typeof body.user_pet_id !== 'string' || typeof body.active !== 'boolean') {
    return withCors(req, NextResponse.json(
      { error: 'body 需要 { user_pet_id: string, active: boolean }' },
      { status: 400 }
    ))
  }

  // 业务规则在 setPetActive：检查 PET_SLOT_FULL（>= 3 active 时阻止上场）
  const result = await setPetActive(user.id, body.user_pet_id, body.active)
  if (!result.ok) {
    const code = result.error === 'PET_SLOT_FULL' ? 409 : 400
    return withCors(req, NextResponse.json({ error: result.error }, { status: code }))
  }

  return withCors(req, NextResponse.json({ ok: true }))
}

export function OPTIONS(req: Request) {
  return preflight(req)
}
```

- [ ] **Step 2: Verify no new API type errors**

Run: `npx tsc --noEmit 2>&1 | grep '^app/api/' || echo "OK no app/api errors"`
Expected: `OK no app/api errors`

- [ ] **Step 3: Commit**

```bash
git add app/api/pets/route.ts
git commit -m "feat(api): pets route accepts Bearer + CORS (Web cookie path unchanged)"
```

---

## Task 2: pets/evolve/route.ts → Bearer+CORS

**Files:** Modify `app/api/pets/evolve/route.ts`

- [ ] **Step 1: Replace the entire file** (`supa` unused → bind only `user`)

```ts
import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase/route-auth'
import { preflight, withCors } from '@/lib/http/cors'
import { requestEvolution } from '@/lib/pet-actions.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { user } = await getRouteUser(req)
  if (!user) return withCors(req, new NextResponse('unauthorized', { status: 401 }))

  const body = await req.json().catch(() => ({}))
  if (!body?.user_pet_id) {
    return withCors(req, NextResponse.json({ error: 'missing user_pet_id' }, { status: 400 }))
  }
  const r = await requestEvolution(user.id, body.user_pet_id)
  if (!r.ok) return withCors(req, NextResponse.json({ error: r.error, need: r.need ?? null }, { status: r.code ?? 400 }))
  return withCors(req, NextResponse.json({ ok: true, target: r.target }))
}

export function OPTIONS(req: Request) {
  return preflight(req)
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit 2>&1 | grep '^app/api/' || echo "OK no app/api errors"` → `OK no app/api errors`
- [ ] **Step 3: Commit** — `git add app/api/pets/evolve/route.ts && git commit -m "feat(api): pets/evolve accepts Bearer + CORS"`

---

## Task 3: inventory/route.ts → Bearer+CORS

**Files:** Modify `app/api/inventory/route.ts`

- [ ] **Step 1: Replace the entire file** (`supa` used → bind `supabase: supa`)

```ts
/**
 * GET /api/inventory → 列出当前用户的全部物品（join items 元数据）
 * 鉴权：getRouteUser（Bearer / cookie 等价 RLS）。仅 App 用户路由附 CORS。
 */
import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase/route-auth'
import { preflight, withCors } from '@/lib/http/cors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { supabase: supa, user } = await getRouteUser(req)
  if (!user) return withCors(req, new NextResponse('unauthorized', { status: 401 }))

  // 1. 取用户库存（按 acquired_at 倒序，新拿到的在前）
  const { data: inv, error } = await supa
    .from('user_inventory')
    .select('id, item_slug, qty, equipped, acquired_adventure_id, acquired_at')
    .eq('user_id', user.id)
    .order('acquired_at', { ascending: false })

  if (error) return withCors(req, NextResponse.json({ error: error.message }, { status: 500 }))

  // 2. 批量取 items 元数据
  const slugs = Array.from(new Set((inv ?? []).map((r) => r.item_slug)))
  let metaMap: Record<string, any> = {}
  if (slugs.length) {
    const { data: items } = await supa
      .from('items')
      .select('slug, name, description, type, rarity, image_url, metadata')
      .in('slug', slugs)
    metaMap = (items ?? []).reduce((m, it) => {
      m[it.slug] = it
      return m
    }, {} as Record<string, any>)
  }

  // 3. 合并
  const merged = (inv ?? []).map((row) => ({
    ...row,
    meta: metaMap[row.item_slug] ?? {
      slug: row.item_slug,
      name: row.item_slug,
      type: 'unknown',
      rarity: 'common',
      description: null,
      image_url: null,
    },
  }))

  // 4. 类型统计
  const byType: Record<string, number> = {}
  const byRarity: Record<string, number> = {}
  for (const row of merged) {
    byType[row.meta.type] = (byType[row.meta.type] ?? 0) + row.qty
    byRarity[row.meta.rarity] = (byRarity[row.meta.rarity] ?? 0) + row.qty
  }

  return withCors(req, NextResponse.json({
    items: merged,
    stats: {
      total_qty: merged.reduce((s, r) => s + r.qty, 0),
      unique_count: merged.length,
      by_type: byType,
      by_rarity: byRarity,
    },
  }))
}

export function OPTIONS(req: Request) {
  return preflight(req)
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit 2>&1 | grep '^app/api/' || echo "OK no app/api errors"` → `OK no app/api errors`
- [ ] **Step 3: Commit** — `git add app/api/inventory/route.ts && git commit -m "feat(api): inventory route accepts Bearer + CORS"`

---

## Task 4: inventory/use/route.ts → Bearer+CORS

**Files:** Modify `app/api/inventory/use/route.ts`

- [ ] **Step 1: Replace the entire file** (`supa` unused → bind only `user`)

```ts
import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase/route-auth'
import { preflight, withCors } from '@/lib/http/cors'
import { consumeItem } from '@/lib/pet-actions.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { user } = await getRouteUser(req)
  if (!user) return withCors(req, new NextResponse('unauthorized', { status: 401 }))
  const body = await req.json().catch(() => ({}))
  if (!body?.item_id) return withCors(req, NextResponse.json({ error: 'missing item_id' }, { status: 400 }))
  const r = await consumeItem(user.id, body.item_id)
  if (!r.ok) return withCors(req, NextResponse.json({ error: r.error }, { status: r.code ?? 400 }))
  return withCors(req, NextResponse.json(r))
}

export function OPTIONS(req: Request) {
  return preflight(req)
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit 2>&1 | grep '^app/api/' || echo "OK no app/api errors"` → `OK no app/api errors`
- [ ] **Step 3: Commit** — `git add app/api/inventory/use/route.ts && git commit -m "feat(api): inventory/use accepts Bearer + CORS"`

---

## Task 5: inventory/equip/route.ts → Bearer+CORS

**Files:** Modify `app/api/inventory/equip/route.ts`

- [ ] **Step 1: Replace the entire file** (`supa` unused → bind only `user`)

```ts
import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase/route-auth'
import { preflight, withCors } from '@/lib/http/cors'
import { equipItem } from '@/lib/pet-actions.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { user } = await getRouteUser(req)
  if (!user) return withCors(req, new NextResponse('unauthorized', { status: 401 }))
  const body = await req.json().catch(() => ({}))
  if (!body?.item_id || typeof body.equipped !== 'boolean') {
    return withCors(req, NextResponse.json({ error: 'need { item_id, equipped }' }, { status: 400 }))
  }
  const r = await equipItem(user.id, body.item_id, body.equipped)
  if (!r.ok) return withCors(req, NextResponse.json({ error: r.error }, { status: r.code ?? 400 }))
  return withCors(req, NextResponse.json(r))
}

export function OPTIONS(req: Request) {
  return preflight(req)
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit 2>&1 | grep '^app/api/' || echo "OK no app/api errors"` → `OK no app/api errors`
- [ ] **Step 3: Commit** — `git add app/api/inventory/equip/route.ts && git commit -m "feat(api): inventory/equip accepts Bearer + CORS"`

---

## Task 6: adventures/route.ts → Bearer+CORS

**Files:** Modify `app/api/adventures/route.ts`

- [ ] **Step 1: Replace the entire file** (`supa` used → bind `supabase: supa`; param stays named `request`)

```ts
/**
 * GET /api/adventures            → 列出当前用户全部冒险（按 started_at 降序）
 * GET /api/adventures?id=<uuid>  → 取单条冒险详情（含 chapters / scene_tier 等新字段）
 *
 * 鉴权：getRouteUser（Bearer / cookie 等价 RLS）。仅 App 用户路由附 CORS。
 */
import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase/route-auth'
import { preflight, withCors } from '@/lib/http/cors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT_FULL =
  'id, started_at, completed_at, scene_type, scene_tier, rarity_tier, stamina_used, duration_min, chapters, triggered_by, story_md, scene_image_url, pets_dispatched, rewards, pet_encounter, status'

export async function GET(request: Request) {
  const { supabase: supa, user } = await getRouteUser(request)
  if (!user) return withCors(request, new NextResponse('unauthorized', { status: 401 }))

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id) {
    const { data, error } = await supa
      .from('adventures')
      .select(SELECT_FULL)
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle()

    if (error) return withCors(request, NextResponse.json({ error: error.message }, { status: 500 }))
    if (!data) return withCors(request, NextResponse.json({ error: 'not_found' }, { status: 404 }))
    return withCors(request, NextResponse.json({ adventure: data }))
  }

  const { data, error } = await supa
    .from('adventures')
    .select(SELECT_FULL)
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(100)

  if (error) return withCors(request, NextResponse.json({ error: error.message }, { status: 500 }))
  return withCors(request, NextResponse.json({ adventures: data ?? [] }))
}

export function OPTIONS(req: Request) {
  return preflight(req)
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit 2>&1 | grep '^app/api/' || echo "OK no app/api errors"` → `OK no app/api errors`
- [ ] **Step 3: Commit** — `git add app/api/adventures/route.ts && git commit -m "feat(api): adventures route accepts Bearer + CORS"`

---

## Task 7: adventures/retry/route.ts → Bearer+CORS

**Files:** Modify `app/api/adventures/retry/route.ts`

- [ ] **Step 1: Replace the entire file** (`supa` used → bind `supabase: supa`)

```ts
/**
 * POST /api/adventures/retry — 用户重试卡住/失败的冒险
 *
 * Body: { adventure_id: string }
 * 鉴权：getRouteUser（Bearer / cookie 等价）。把属于当前用户的 failed（或仍 pending）冒险
 * 重置回正确的 pending 状态并清零 render_attempts，让 worker 下次 cron 重新接管。
 * RLS（adventures_update_own）保证只能改自己的。
 */
import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase/route-auth'
import { preflight, withCors } from '@/lib/http/cors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { supabase: supa, user } = await getRouteUser(req)
  if (!user) return withCors(req, new NextResponse('unauthorized', { status: 401 }))

  const body = await req.json().catch(() => ({}))
  const id = body?.adventure_id
  if (!id) return withCors(req, NextResponse.json({ error: 'missing adventure_id' }, { status: 400 }))

  const { data: adv } = await supa
    .from('adventures')
    .select('id, status, story_md')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!adv) return withCors(req, NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }))
  if (adv.status === 'completed') return withCors(req, NextResponse.json({ error: 'ALREADY_COMPLETED' }, { status: 409 }))

  // 有故事就只缺图 → pending_image；否则从头 → pending_story
  const next = adv.story_md ? 'pending_image' : 'pending_story'
  const { error } = await supa
    .from('adventures')
    .update({ status: next, render_attempts: 0 })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return withCors(req, NextResponse.json({ error: error.message }, { status: 500 }))

  return withCors(req, NextResponse.json({ ok: true, status: next }))
}

export function OPTIONS(req: Request) {
  return preflight(req)
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit 2>&1 | grep '^app/api/' || echo "OK no app/api errors"` → `OK no app/api errors`
- [ ] **Step 3: Commit** — `git add app/api/adventures/retry/route.ts && git commit -m "feat(api): adventures/retry accepts Bearer + CORS"`

---

## Task 8: Realtime publication migration

**Files:** Create `migrations/015_realtime_publication.sql`

- [ ] **Step 1: Create the migration**

Idempotent: creates the publication if somehow missing (Supabase ships it by default), then adds only tables not already members. RLS is already owner-only, and Realtime `postgres_changes` filters per-subscriber JWT, so each client only receives its own rows.

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add migrations/015_realtime_publication.sql
git commit -m "feat(db): migration 015 — enable Realtime on adventures/user_pets/user_inventory/character_state"
```

> **Applied by the user** against their Supabase (migrations are run manually, see README). Verification query in Task 9.

---

## Task 9: Final gate + acceptance checklists

- [ ] **Step 1: Whole-tree API typecheck is clean of new errors**

Run: `npx tsc --noEmit 2>&1 | grep '^app/api/' || echo "OK no app/api errors"`
Expected: `OK no app/api errors` (the only remaining tsc errors are the pre-existing `app/dashboard/pets/page.tsx` ones — confirm with `npx tsc --noEmit 2>&1 | grep 'error TS' | sed -E 's/\(.*//' | sort -u`, which should list ONLY `app/dashboard/pets/page.tsx`).

- [ ] **Step 2: Scoped eslint of the 7 changed files → 0 errors**

Run:
```bash
npx eslint app/api/pets/route.ts app/api/pets/evolve/route.ts app/api/inventory/route.ts app/api/inventory/use/route.ts app/api/inventory/equip/route.ts app/api/adventures/route.ts app/api/adventures/retry/route.ts
```
Expected: no output / exit 0 (no errors in the changed files).

- [ ] **Step 3 (user-run): curl boundary checklist** against the deployed backend `$BASE` (e.g. `https://life-rpg-steel.vercel.app`). `$JWT` = a real Supabase access token (from a mobile login); `$CRON` = the `CRON_SECRET`.

1. **No auth → 401:** `curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/pets` → `401`
2. **Real Bearer → 200 + CORS:** `curl -s -D - -o /dev/null -H "Authorization: Bearer $JWT" $BASE/api/pets` → `200`, response includes `access-control-allow-origin`.
3. **Preflight → 204 + CORS:** `curl -s -D - -o /dev/null -X OPTIONS -H 'Origin: https://example.app' -H 'Access-Control-Request-Method: GET' $BASE/api/inventory` → `204` with `access-control-allow-methods: GET,POST,PATCH,OPTIONS`.
4. **Spec boundary — user route rejects CRON_SECRET:** `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $CRON" $BASE/api/pets` → `401` (CRON_SECRET is not a valid Supabase JWT → `getUser` fails).
5. **Spec boundary — machine route rejects a user JWT:** `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer $JWT" $BASE/api/adventures/trigger` → `401`/`403` (machine route compares exact `CRON_SECRET`; a 3-part JWT never matches). *(Read-only check — `trigger` rejects before doing work.)*
6. Repeat 1–2 for `/api/inventory` and `/api/adventures`.

- [ ] **Step 4 (user-run): Web non-regression.** With a normal browser cookie session, load the Web dashboard's pets / inventory / adventures views — they must still work (cookie fallback path unchanged).

- [ ] **Step 5 (user-run, after applying migration 015): Realtime verification.** In the Supabase SQL editor:
```sql
SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' ORDER BY tablename;
```
Expected rows: `adventures`, `character_state`, `user_inventory`, `user_pets` (all `public`).

---

## Self-Review

**Spec coverage** (spec §架构 "后端适配" + Phase 2 "改 … Bearer+CORS" + "开 Supabase Realtime"): all 7 named user routes converted ✔ (Tasks 1–7); `dashboard` was already done in Phase 1; machine routes deliberately untouched ✔; Realtime enabled ✔ (Task 8). The spec's "GET() → GET(req)" requirement is satisfied for `pets` and `inventory` (Tasks 1, 3).

**Deliberate deviation — automated boundary tests:** the spec calls for tests asserting "CRON_SECRET rejected by user routes" and "user JWT rejected by machine routes." The root app has **no test runner**, and the rejection logic lives entirely in the already-shipped, Phase-1-proven `getRouteUser`/CORS helpers (this slice only *applies* them). Standing up a test framework to cover mechanical preamble application is disproportionate for a cost-aware repo. Substituted with the curl boundary checklist (Task 9 steps 4–5), which exercises the **exact** assertions against the real deployment. If the user wants the automated suite, that's a follow-up slice (add vitest + mock `@supabase/supabase-js`).

**Placeholder scan:** none — every route's full target content is inlined.

**Consistency:** every converted handler uses `getRouteUser(req)` binding `supabase: supa` **only** where `supa` is subsequently used (pets GET, inventory GET, adventures GET, retry POST) and `{ user }` only otherwise (pets PATCH, evolve, use, equip) — avoids unused-var lint failures. Every response path (200/400/401/404/409/500) is wrapped in `withCors`. Every file adds `OPTIONS`. No machine route, no `lib/*`, no Web cookie helper is modified.

**Risk:** `ALTER PUBLICATION` requires the migration to run as a role that owns the publication (Supabase migrations run as a superuser-equivalent — fine). If the Supabase project restricts this, the user applies the table toggles via the dashboard Realtime UI instead — same effect.
