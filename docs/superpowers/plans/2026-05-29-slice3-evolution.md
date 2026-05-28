# Slice 3: Pet Evolution (level + item, player-triggered)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A player can evolve an eligible pet (stage < max, level ≥ threshold, owns the required material); this consumes the item and queues a worker render that produces the next-stage art and advances the pet.

**Architecture:** Deliberate, two-phase like adventures. The light validation + item-consume + queue happens in `POST /api/pets/evolve` (via a service-role helper `lib/pet-actions.mjs` that filters by the authenticated user id); the heavy gpt-image-2 render happens in a new worker pass (`pending_render='evolution'`). Requirements live in `lib/progression.mjs` (shared by API + UI).

**Tech Stack:** Node ESM, Supabase REST, Next 16, gpt-image-2 worker.

> No test framework: `node -e` for pure math; node harness for the action helper; one paid worker run (~$0.04) for the render, then revert. `curl --noproxy '*'`; migrations via mgmt API + `NOTIFY pgrst`.

---

## File Structure

- Create: `migrations/012_pet_pending_render.sql` — `user_pets.pending_render` (`evolution`|`hatch`).
- Modify: `lib/progression.mjs` — `EVOLUTION_REQUIREMENTS` + `evolutionRequirement(target)`.
- Create: `lib/pet-actions.mjs` — `requestEvolution(userId, userPetId)` (service-role REST).
- Create: `app/api/pets/evolve/route.ts` — POST, session auth → helper.
- Modify: `scripts/render-pending-adventures.mjs` — `renderEvolution(pet)` + 段3 in `main()`.
- Modify: `app/dashboard/pets/page.tsx` — evolve button in the detail modal.

---

## Task 1: Migration 012 — `user_pets.pending_render`

**Files:** Create `migrations/012_pet_pending_render.sql`

- [ ] **Step 1: Write migration**
```sql
-- 012: 宠物 worker 渲染队列（进化 / 孵化）。null = 无待办。
ALTER TABLE user_pets
  ADD COLUMN IF NOT EXISTS pending_render text
  CHECK (pending_render IS NULL OR pending_render IN ('evolution','hatch'));
CREATE INDEX IF NOT EXISTS user_pets_pending_render_idx
  ON user_pets(pending_render) WHERE pending_render IS NOT NULL;
```

- [ ] **Step 2: Apply + reload schema** (statement-only, NOT via `tr '\n'`; reload after)
```bash
SUPA_MGMT_TOKEN=<SET-SUPABASE_MGMT_TOKEN-FROM-ENV>
MGMT="https://api.supabase.com/v1/projects/qgowirdryppnbgnvuzpg/database/query"
curl -s --noproxy '*' -X POST "$MGMT" -H "Authorization: Bearer $SUPA_MGMT_TOKEN" -H "Content-Type: application/json" -H "User-Agent: Mozilla/5.0" \
  -d "{\"query\":\"ALTER TABLE user_pets ADD COLUMN IF NOT EXISTS pending_render text CHECK (pending_render IS NULL OR pending_render IN ('evolution','hatch'));\"}"
curl -s --noproxy '*' -X POST "$MGMT" -H "Authorization: Bearer $SUPA_MGMT_TOKEN" -H "Content-Type: application/json" -H "User-Agent: Mozilla/5.0" \
  -d "{\"query\":\"CREATE INDEX IF NOT EXISTS user_pets_pending_render_idx ON user_pets(pending_render) WHERE pending_render IS NOT NULL;\"}"
curl -s --noproxy '*' -X POST "$MGMT" -H "Authorization: Bearer $SUPA_MGMT_TOKEN" -H "Content-Type: application/json" -H "User-Agent: Mozilla/5.0" \
  -d "{\"query\":\"NOTIFY pgrst, 'reload schema';\"}"
```

- [ ] **Step 3: Verify (REST)**
```bash
SRV=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"')
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
curl -s --noproxy '*' "$SUPA_URL/rest/v1/user_pets?select=id,pending_render&limit=1" -H "apikey: $SRV" -H "Authorization: Bearer $SRV"
```
Expected: a row with `"pending_render":null`.

---

## Task 2: Evolution requirements in `lib/progression.mjs`

- [ ] **Step 1: Append**
```js
/** 进化要求：目标阶段 → { level 阈值, item 消耗 slug }。 */
export const EVOLUTION_REQUIREMENTS = {
  2: { level: 20, item: 'rare_herb' },
  3: { level: 40, item: 'star_fragment' },
}

/** 取进化到 `targetStage` 的要求；无则 null。 */
export function evolutionRequirement(targetStage) {
  return EVOLUTION_REQUIREMENTS[targetStage] ?? null
}
```

- [ ] **Step 2: Test**
```bash
cd /Users/yangweidong/Desktop/life-rpg
node --input-type=module -e '
import { evolutionRequirement } from "./lib/progression.mjs";
import assert from "node:assert";
assert.deepEqual(evolutionRequirement(2), { level:20, item:"rare_herb" });
assert.deepEqual(evolutionRequirement(3), { level:40, item:"star_fragment" });
assert.equal(evolutionRequirement(4), null);
console.log("OK evolution reqs");
'
```
Expected: `OK evolution reqs`.

---

## Task 3: `lib/pet-actions.mjs` — `requestEvolution`

**Files:** Create `lib/pet-actions.mjs`

- [ ] **Step 1: Write the helper**
```js
// 宠物/背包动作处理（service-role REST）。路由鉴权后传入 userId，函数始终按 userId 过滤。
import { evolutionRequirement } from './progression.mjs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY

async function sb(path, init = {}) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPA_SRV,
      Authorization: `Bearer ${SUPA_SRV}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
  const t = await r.text()
  return t ? JSON.parse(t) : null
}

/** 校验等级+道具→消耗道具→标记 pending_render='evolution'。 */
export async function requestEvolution(userId, userPetId) {
  const pets = await sb(
    `user_pets?id=eq.${userPetId}&user_id=eq.${userId}&select=id,level,evolution_stage,max_stage,pending_render`,
  )
  const pet = pets?.[0]
  if (!pet) return { ok: false, code: 404, error: 'PET_NOT_FOUND' }
  if (pet.pending_render) return { ok: false, code: 409, error: 'ALREADY_PENDING' }
  if (pet.evolution_stage >= pet.max_stage) return { ok: false, code: 409, error: 'MAX_STAGE' }

  const target = pet.evolution_stage + 1
  const req = evolutionRequirement(target)
  if (!req) return { ok: false, code: 409, error: 'NO_REQUIREMENT' }
  if ((pet.level ?? 1) < req.level) return { ok: false, code: 409, error: 'LEVEL_TOO_LOW', need: req }

  const inv = await sb(
    `user_inventory?user_id=eq.${userId}&item_slug=eq.${req.item}&equipped=eq.false&select=id,qty`,
  )
  const row = inv?.[0]
  if (!row || row.qty < 1) return { ok: false, code: 409, error: 'MISSING_ITEM', need: req }

  if (row.qty > 1) {
    await sb(`user_inventory?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ qty: row.qty - 1 }) })
  } else {
    await sb(`user_inventory?id=eq.${row.id}`, { method: 'DELETE' })
  }
  await sb(`user_pets?id=eq.${pet.id}`, { method: 'PATCH', body: JSON.stringify({ pending_render: 'evolution' }) })
  return { ok: true, target, item: req.item }
}
```

- [ ] **Step 2: Syntax check**
```bash
cd /Users/yangweidong/Desktop/life-rpg && node --check lib/pet-actions.mjs && echo "syntax OK"
```
(Full functional test happens in Task 6's e2e.)

---

## Task 4: API route `app/api/pets/evolve/route.ts`

**Files:** Create `app/api/pets/evolve/route.ts`

- [ ] **Step 1: Write the route**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'
import { requestEvolution } from '@/lib/pet-actions.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!body?.user_pet_id) {
    return NextResponse.json({ error: 'missing user_pet_id' }, { status: 400 })
  }
  const r = await requestEvolution(user.id, body.user_pet_id)
  if (!r.ok) return NextResponse.json({ error: r.error, need: r.need ?? null }, { status: r.code ?? 400 })
  return NextResponse.json({ ok: true, target: r.target })
}
```

- [ ] **Step 2: Verify compiles (401 unauth)**
```bash
curl -s --noproxy '*' --max-time 12 -X POST -o /dev/null -w "status=%{http_code}\n" http://127.0.0.1:3000/api/pets/evolve
```
Expected: `status=401`.

---

## Task 5: Worker — evolution render pass (段3)

**Files:** Modify `scripts/render-pending-adventures.mjs`

- [ ] **Step 1: Add `renderEvolution` before `async function main()`**
```js
// ============ 段 3：宠物进化重烧 ============
async function renderEvolution(pet) {
  const start = Date.now()
  const target = (pet.evolution_stage ?? 1) + 1
  console.log(`\n[evolve] === ${pet.id.slice(0, 8)} ${pet.name} ${pet.evolution_stage}→${target} ===`)
  const bg = RARITY_BG[pet.rarity] || RARITY_BG.common
  const prompt = `PET CREATURE (evolution stage ${target}): ${pet.base_prompt}

This is the SAME creature evolved to a stronger, more mature form — keep the color palette, eyes, and silhouette DNA of the reference image, but bigger, more detailed, with a more powerful aura.

${PET_COMPOSITION.replace('Solid cream #FAF8F3 background', `Solid ${bg.name} ${bg.hex} background (rarity tier: ${pet.rarity})`)}

${doodlesStyleLock({ background: bg })}`
  const buf = await genImage({
    prompt,
    referenceUrls: pet.current_image_url ? [pet.current_image_url] : [],
    size: '1024x1024',
    quality: 'medium',
  })
  const url = await uploadToStorage('character-art', `pets/${pet.id}/evo-${target}.png`, buf)
  const history = Array.isArray(pet.evolution_history) ? pet.evolution_history : []
  history.push({ stage: pet.evolution_stage ?? 1, image_url: pet.current_image_url, evolved_at: new Date().toISOString() })
  await sb(`user_pets?id=eq.${pet.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      evolution_stage: target,
      current_image_url: url,
      evolution_history: history,
      pending_render: null,
    }),
  })
  console.log(`[evolve] ✅ ${pet.id.slice(0, 8)} → ${target}阶 (${((Date.now() - start) / 1000).toFixed(1)}s)`)
}
```

- [ ] **Step 2: Add 段3 to `main()`** — after the pending_image loop, before the final `console.log('\n[worker] 全部任务完成')`:
```js
  // 段 3：宠物进化重烧（失败不清 pending_render，下次重试，避免吞掉已消耗的道具）
  const pendingEvo = await sb(
    `user_pets?pending_render=eq.evolution&select=*&limit=${MAX_PER_RUN}`,
  )
  console.log(`[worker] pending_evolution: ${pendingEvo.length}`)
  for (const pet of pendingEvo) {
    try {
      await renderEvolution(pet)
    } catch (e) {
      console.error(`[worker] ❌ evolve ${pet.id.slice(0, 8)}:`, e.message)
    }
  }
```

- [ ] **Step 3: Syntax check**
```bash
cd /Users/yangweidong/Desktop/life-rpg && node --check scripts/render-pending-adventures.mjs && echo "syntax OK"
```

---

## Task 6: UI — evolve button in pets detail modal

**Files:** Modify `app/dashboard/pets/page.tsx`

- [ ] **Step 1: Imports + Pet type**
Add to the top imports:
```tsx
import { evolutionRequirement } from '@/lib/progression.mjs'
```
Add `pending_render: string | null` to the `Pet` type (after `exp: number`).

- [ ] **Step 2: Add an `onEvolve` handler in `PetsPage` and pass to the modal**
In `PetsPage`, add:
```tsx
  const evolvePet = async (pet: Pet) => {
    setBusyId(pet.id)
    try {
      const r = await fetch('/api/pets/evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_pet_id: pet.id }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        const msg: Record<string, string> = {
          LEVEL_TOO_LOW: `等级不够：需 Lv.${j.need?.level}`,
          MISSING_ITEM: `缺少道具：需要 ${j.need?.item}`,
          MAX_STAGE: '已是最终形态',
          ALREADY_PENDING: '进化已在队列中',
        }
        alert(msg[j.error] || `进化失败：${j.error || r.status}`)
        return
      }
      alert('进化已开始，稍后立绘会更新')
      await refresh()
    } finally {
      setBusyId(null)
    }
  }
```
Then update the modal render call:
```tsx
          <PetDetailModal
            pet={openPet}
            onClose={() => setOpenId(null)}
            onToggleActive={() => toggleActive(openPet)}
            onEvolve={() => evolvePet(openPet)}
            busy={busyId === openPet.id}
          />
```

- [ ] **Step 3: Render the evolve button in `PetDetailModal`**
Add `onEvolve` to the modal's props signature (`onEvolve: () => void`). Then, immediately BEFORE the existing 出战 button (`{/* 出战按钮 */}`), insert:
```tsx
            {/* 进化按钮 */}
            {pet.evolution_stage < pet.max_stage && (() => {
              const req = evolutionRequirement(pet.evolution_stage + 1)
              const pending = pet.pending_render === 'evolution'
              return (
                <button
                  onClick={onEvolve}
                  disabled={busy || pending}
                  className={`btn-doodle btn-doodle--sunshine w-full ${busy || pending ? 'cursor-wait opacity-60' : ''}`}
                >
                  <Sparkles className="h-4 w-4" />
                  {pending
                    ? '进化中…'
                    : req
                      ? `进化到 ${pet.evolution_stage + 1} 阶（需 Lv.${req.level} + ${req.item}）`
                      : '进化'}
                </button>
              )
            })()}
```

- [ ] **Step 4: Verify the page compiles**
```bash
curl -s --noproxy '*' --max-time 15 -o /dev/null -w "status=%{http_code}\n" http://127.0.0.1:3000/dashboard/pets
```
Expected: `307` (redirect to /login — page compiled; it's auth-gated). A `500` means a compile error.

> The logged-in modal can't be screenshotted without a session; UI correctness relies on compile + code review here. The functional path is proven by the Task 6 e2e below.

- [ ] **Step 5: End-to-end evolution test (paid render) + full revert**
Pick one pet; snapshot it; set it up to be eligible; drive the real API helper + worker; verify stage advanced; revert.
```bash
cd /Users/yangweidong/Desktop/life-rpg
SRV=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"')
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
TEST_USER=57f57048-7517-4e60-a74a-565c6a1f9430
# choose a rare/epic pet (max_stage>1). Snapshot:
curl -s --noproxy '*' "$SUPA_URL/rest/v1/user_pets?user_id=eq.$TEST_USER&max_stage=gt.1&select=id,name,rarity,level,evolution_stage,max_stage,current_image_url&limit=1" -H "apikey: $SRV" -H "Authorization: Bearer $SRV"
```
Then, for the chosen `PET_ID`: (a) `PATCH user_pets` set `level=20`; (b) `POST user_inventory` a `rare_herb` qty 1; (c) call `requestEvolution` via a node one-liner importing `lib/pet-actions.mjs` with env loaded (`set -a; . ./.env.local; set +a`); verify it returns `{ok:true,target:2}`, the `rare_herb` row is gone, and the pet has `pending_render='evolution'`; (d) run the worker (`set -a; . ./.env.local; set +a; export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"; node scripts/render-pending-adventures.mjs`) and confirm `[evolve] ✅ … → 2阶`; (e) verify pet `evolution_stage=2`, new `current_image_url`, `pending_render=null`, `evolution_history` has 1 entry; (f) **revert**: PATCH pet back to snapshot (level/evolution_stage/current_image_url/evolution_history=[]/pending_render=null), delete the orphaned `pets/PET_ID/evo-2.png` from storage, and ensure no stray `rare_herb` remains.

---

## Self-Review

**Spec coverage (§C):** player-triggered evolve (Task 4) with level+item gate (Task 3, reqs Task 2), worker render advancing stage/image/history (Task 5), pending_render column (Task 1), pets UI button (Task 6). ✓ Auto-evolve in `lib/pets.ts` stays orphaned (not invoked) — no change needed.
**Placeholder scan:** Task 6 Step 5 describes the e2e in prose (reuses slice-1/2 snapshot-run-revert commands already in session history) rather than repeating every curl; all *new code* steps are complete. ✓
**Type consistency:** `requestEvolution(userId, userPetId)` → `{ok, code?, error?, need?, target?}` used by route; `evolutionRequirement(target)` → `{level, item}|null` used by helper + UI; `pending_render` values `'evolution'|'hatch'` consistent across migration/worker/helper. ✓
