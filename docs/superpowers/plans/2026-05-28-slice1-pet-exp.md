# Slice 1: Pet EXP in Worker + EXP Bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dispatched (active) pets earn tier-scaled EXP from each adventure, level up via the existing curve, and the pets UI shows an EXP progress bar.

**Architecture:** Pure progression math lives in one plain-JS module (`lib/pet-progression.mjs`) imported by both the standalone worker and the Next UI (single source of truth, testable with `node -e`). The worker grants EXP during the story stage (`pending_story`), guarded by an idempotency flag on the adventure row. UI reads `level`/`exp` already returned by `/api/pets`.

**Tech Stack:** Node ESM, Supabase REST (service role), Next 16 + React 19, gpt-image-2 worker (GitHub Actions).

> **No test framework in this repo.** Verification is run-and-inspect: `node -e` assertions for pure logic; worker run + Supabase REST reads for integration; a `/preview/pets` headless-Chrome screenshot for UI. All `curl` to localhost must use `--noproxy '*'` (shell has an HTTP proxy on :7890). Migrations apply via the Supabase management API using the `sbp_…` token.

**Reference env (read from `.env.local`, never print values):**
```bash
cd /Users/yangweidong/Desktop/life-rpg
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
SRV=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"')
SUPA_REF=qgowirdryppnbgnvuzpg
SUPA_MGMT_TOKEN=<SET-SUPABASE_MGMT_TOKEN-FROM-ENV>   # management API (rotate after)
TEST_USER=57f57048-7517-4e60-a74a-565c6a1f9430
```

---

## File Structure

- Create: `migrations/011_pet_exp.sql` — adds `adventures.pet_exp_granted boolean`.
- Create: `lib/pet-progression.mjs` — `levelCurve`, `PET_TIER_EXP`, `applyPetExp` (pure).
- Modify: `scripts/render-pending-adventures.mjs` — import the module; grant pet EXP in the story stage (around lines 416-453); ensure the pending_story adventure select includes `scene_tier, pet_exp_granted`.
- Modify: `components/pet-card.tsx` — add EXP bar (needs `pet.exp` + `pet.level`).
- Modify: `app/preview/pets/page.tsx` — give mocks an `exp` value so the bar is visible without login.

---

## Task 1: Migration — `adventures.pet_exp_granted`

**Files:**
- Create: `migrations/011_pet_exp.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 011: 宠物 EXP 幂等标记
-- worker 在段1 给出战宠物发经验，pet_exp_granted 防止 worker 重跑时重复发放。
ALTER TABLE adventures
  ADD COLUMN IF NOT EXISTS pet_exp_granted boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply via Supabase management API, then reload PostgREST schema**

⚠️ Do NOT pipe the `.sql` file through `tr '\n' ' '` — that collapses the leading `-- comment` line onto the statement, turning the whole thing into a SQL comment (silent no-op that still returns `[]`). Send the statement(s) directly, and ALWAYS reload the PostgREST schema cache afterward or the REST API won't see the new column.

```bash
SUPA_MGMT_TOKEN=<SET-SUPABASE_MGMT_TOKEN-FROM-ENV>
MGMT="https://api.supabase.com/v1/projects/qgowirdryppnbgnvuzpg/database/query"
# apply
curl -s --noproxy '*' -X POST "$MGMT" \
  -H "Authorization: Bearer $SUPA_MGMT_TOKEN" -H "Content-Type: application/json" -H "User-Agent: Mozilla/5.0" \
  -d '{"query":"ALTER TABLE adventures ADD COLUMN IF NOT EXISTS pet_exp_granted boolean NOT NULL DEFAULT false;"}'
# reload PostgREST schema cache (otherwise REST returns 42703 column-does-not-exist)
curl -s --noproxy '*' -X POST "$MGMT" \
  -H "Authorization: Bearer $SUPA_MGMT_TOKEN" -H "Content-Type: application/json" -H "User-Agent: Mozilla/5.0" \
  -d '{"query":"NOTIFY pgrst, '"'"'reload schema'"'"';"}'
```
Expected: `[]` from both. Confirm at DB level with `SELECT column_name FROM information_schema.columns WHERE table_name='adventures' AND column_name='pet_exp_granted';` → one row.

- [ ] **Step 3: Verify the column exists**

```bash
cd /Users/yangweidong/Desktop/life-rpg
SRV=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"')
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
curl -s --noproxy '*' "$SUPA_URL/rest/v1/adventures?select=id,pet_exp_granted&limit=1" \
  -H "apikey: $SRV" -H "Authorization: Bearer $SRV"
```
Expected: a row including `"pet_exp_granted":false`.

- [ ] **Step 4: Commit**

```bash
git add migrations/011_pet_exp.sql
git commit -m "feat(migrations): 011 adventures.pet_exp_granted 幂等标记"
```

---

## Task 2: Pure progression module `lib/pet-progression.mjs`

**Files:**
- Create: `lib/pet-progression.mjs`

- [ ] **Step 1: Write the module**

```js
// 宠物成长纯函数：worker (JS) 与 UI (TS) 共用，单一真源。
// 升级曲线沿用 lib/pets.ts 的 levelCurve = floor(100 * level^1.5)。

/** 升到 `level` 的下一级所需 EXP。 */
export function levelCurve(level) {
  return Math.floor(100 * Math.pow(level, 1.5))
}

/** 场景档位 → 每只出战宠物本次冒险获得的 EXP。 */
export const PET_TIER_EXP = {
  nearby: 10,
  coast: 25,
  ruin: 50,
  astral: 100,
}

/**
 * 给 (level, exp) 累加 delta，连续升级。返回新 {level, exp, leveledUp}。
 * 纯函数，不碰 DB。
 */
export function applyPetExp(level, exp, delta) {
  let lvl = level
  let e = exp + delta
  let leveledUp = false
  while (e >= levelCurve(lvl)) {
    e -= levelCurve(lvl)
    lvl += 1
    leveledUp = true
    if (lvl > 999) break
  }
  return { level: lvl, exp: e, leveledUp }
}
```

- [ ] **Step 2: Test the pure logic with node**

```bash
cd /Users/yangweidong/Desktop/life-rpg
node --input-type=module -e '
import { levelCurve, PET_TIER_EXP, applyPetExp } from "./lib/pet-progression.mjs";
import assert from "node:assert";
assert.equal(levelCurve(1), 100);
assert.equal(levelCurve(4), 800);
assert.equal(PET_TIER_EXP.ruin, 50);
// Lv1 exp0 + 50 -> still Lv1, exp50 (needs 100)
assert.deepEqual(applyPetExp(1, 0, 50), { level: 1, exp: 50, leveledUp: false });
// Lv1 exp0 + 100 -> Lv2, exp0
assert.deepEqual(applyPetExp(1, 0, 100), { level: 2, exp: 0, leveledUp: true });
// levelCurve(2)=282; 450 -100(->L2) -282(->L3) = 68 remainder at L3
let r = applyPetExp(1, 0, 450);
assert.equal(r.level, 3); assert.equal(r.exp, 68); assert.equal(r.leveledUp, true);
console.log("OK pet-progression");
'
```
Expected: prints `OK pet-progression` (no assertion error).

- [ ] **Step 3: Commit**

```bash
git add lib/pet-progression.mjs
git commit -m "feat(pets): 宠物成长纯函数模块 (levelCurve/tier-exp/applyPetExp)"
```

---

## Task 3: Grant pet EXP in the worker (story stage)

**Files:**
- Modify: `scripts/render-pending-adventures.mjs`

- [ ] **Step 1: Import the shared module**

At the top of `scripts/render-pending-adventures.mjs`, with the other imports (after `import { Buffer } from 'node:buffer'`):

```js
import { PET_TIER_EXP, applyPetExp } from '../lib/pet-progression.mjs'
```

- [ ] **Step 2: Ensure the pending_story adventure select includes the new fields**

Find the query in `main()` that fetches `status=eq.pending_story` adventures. Add `scene_tier` and `pet_exp_granted` to its `select=` list if not already present. Example shape:

```js
// before: ...&select=id,user_id,scene_type,duration_min,...
// after:  ...&select=id,user_id,scene_type,scene_tier,duration_min,pet_exp_granted,...
```

- [ ] **Step 3: Add the EXP-grant block in the story stage**

In the story function, immediately AFTER the pet-capture block (the `if (llm.pet_encounter && llm.pet_encounter.caught) { ... }` ending at line ~438) and BEFORE the `// 9. 写 adventure 段 1 完成` PATCH (line ~440), insert:

```js
  // 8b. 出战宠物获得 tier-scaled EXP（幂等：pet_exp_granted 防重发）
  let dispatchedIds = []
  if (!adv.pet_exp_granted) {
    const activePets = await sb(
      `user_pets?user_id=eq.${adv.user_id}&is_active=eq.true&select=id,level,exp`,
    )
    const gain = PET_TIER_EXP[adv.scene_tier] ?? PET_TIER_EXP.nearby
    dispatchedIds = (activePets ?? []).map((p) => p.id)
    for (const p of activePets ?? []) {
      const next = applyPetExp(p.level ?? 1, p.exp ?? 0, gain)
      await sb(`user_pets?id=eq.${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ level: next.level, exp: next.exp }),
      })
      console.log(`  - 宠物 ${p.id.slice(0, 8)} +${gain} exp → Lv.${next.level}`)
    }
  }
```

- [ ] **Step 4: Record dispatch + set the idempotency flag in the existing PATCH**

In the `// 9. 写 adventure 段 1 完成` PATCH body (lines ~443-452), add two fields:

```js
    body: JSON.stringify({
      story_md: llm.story_md,
      chapters,
      rewards: { items: validDrops, exp: llm.exp_reward },
      pet_encounter: llm.pet_encounter
        ? { ...llm.pet_encounter, user_pet_id: userPetId ?? null }
        : null,
      references_used: [`__PROMPT__:${llm.image_prompt}`],
      status: 'pending_image',
      pets_dispatched: dispatchedIds,
      pet_exp_granted: true,
    }),
```

- [ ] **Step 5: Integration verify — snapshot, run worker on one adventure, re-check**

This runs the real worker (calls gpt-4o-mini ~\$0.001 for story + gpt-image-2 ~\$0.04 for the scene image). Set up one active pet + a fresh pending_story adventure, then run.

```bash
cd /Users/yangweidong/Desktop/life-rpg
SRV=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"')
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
TEST_USER=57f57048-7517-4e60-a74a-565c6a1f9430
# before: record one active pet's level/exp
echo "BEFORE:"; curl -s --noproxy '*' "$SUPA_URL/rest/v1/user_pets?user_id=eq.$TEST_USER&is_active=eq.true&select=id,name,level,exp" -H "apikey: $SRV" -H "Authorization: Bearer $SRV"
```
- [ ] **Step 6: Run the worker against pending adventures**

```bash
cd /Users/yangweidong/Desktop/life-rpg
set -a; . ./.env.local; set +a
export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
node scripts/render-pending-adventures.mjs
```
Expected log lines: `宠物 xxxxxxxx +<gain> exp → Lv.N` for each active pet, then `章节完成 → pending_image`.

> If there are no pending adventures, create one first via the trigger route with `force:true` (needs CRON_SECRET) or insert a `status='pending_story'` row for `TEST_USER` with a known `scene_tier`.

- [ ] **Step 7: Verify EXP increased and flag set**

```bash
cd /Users/yangweidong/Desktop/life-rpg
SRV=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"')
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
TEST_USER=57f57048-7517-4e60-a74a-565c6a1f9430
echo "AFTER:"; curl -s --noproxy '*' "$SUPA_URL/rest/v1/user_pets?user_id=eq.$TEST_USER&is_active=eq.true&select=id,name,level,exp" -H "apikey: $SRV" -H "Authorization: Bearer $SRV"
echo; echo "ADVENTURE FLAG:"; curl -s --noproxy '*' "$SUPA_URL/rest/v1/adventures?user_id=eq.$TEST_USER&order=started_at.desc&limit=1&select=id,scene_tier,pets_dispatched,pet_exp_granted" -H "apikey: $SRV" -H "Authorization: Bearer $SRV"
```
Expected: each active pet's `exp` (or `level`) increased by the tier amount; latest adventure shows `pet_exp_granted:true` and `pets_dispatched` populated.

- [ ] **Step 8: Commit**

```bash
git add scripts/render-pending-adventures.mjs
git commit -m "feat(worker): 出战宠物按场景档位获得 EXP (幂等)"
```

---

## Task 4: EXP bar in the pets UI

**Files:**
- Modify: `components/pet-card.tsx`
- Modify: `app/preview/pets/page.tsx`

- [ ] **Step 1: Add `exp` to `PetCardData` and render an EXP bar**

In `components/pet-card.tsx`, add `exp: number` to the `PetCardData` type (after `level: number`). Import the curve at the top:

```tsx
import { levelCurve } from '@/lib/pet-progression.mjs'
```

In the info bar, after the `Lv.{pet.level}` block (inside the bottom info `<div>`, below the existing level/element row), add:

```tsx
        {(() => {
          const need = levelCurve(pet.level)
          const pct = Math.min(100, Math.round((pet.exp / need) * 100))
          return (
            <div className="mt-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full border-2 border-ink bg-paper">
                <div
                  className="h-full bg-doodle-mint"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="mt-0.5 block text-right font-display text-[10px] font-bold text-mute tabular-nums">
                {pet.exp}/{need} EXP
              </span>
            </div>
          )
        })()}
```

- [ ] **Step 2: Give the preview mocks an `exp` value**

In `app/preview/pets/page.tsx`, inside `mockPet(...)`’s returned object, add an `exp` field so the bar is visible:

```tsx
    level: { common: 5, rare: 12, epic: 24, legendary: 48 }[rarity],
    exp: { common: 120, rare: 900, epic: 4000, legendary: 30000 }[rarity],
```

- [ ] **Step 3: Verify the page compiles**

```bash
curl -s --noproxy '*' --max-time 12 -o /dev/null -w "status=%{http_code}\n" http://127.0.0.1:3000/preview/pets
```
Expected: `status=200`.

- [ ] **Step 4: Screenshot to confirm the EXP bar renders**

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --no-proxy-server --hide-scrollbars --window-size=1100,700 \
  --screenshot=/tmp/slice1-pets.png "http://127.0.0.1:3000/preview/pets" 2>/dev/null
ls -la /tmp/slice1-pets.png
```
Then open `/tmp/slice1-pets.png` and confirm each card shows a mint EXP bar with `exp/need EXP` text below the level.

- [ ] **Step 5: Commit**

```bash
git add components/pet-card.tsx app/preview/pets/page.tsx
git commit -m "feat(pets-ui): 宠物卡片 EXP 进度条"
```

---

## Self-Review

**Spec coverage (slice 1 scope only):**
- Spec §A "Pet EXP & leveling" → Tasks 2+3 (tier exp map, levelCurve, worker grant, idempotency flag). ✓
- Spec §E "pets page EXP bar" → Task 4. ✓
- Spec migration (the `pet_exp_granted` portion) → Task 1. ✓ (`pending_render`/`pending_buffs` are intentionally deferred to slices 3-5.)

**Placeholder scan:** No TBD/TODO; all code blocks complete; commands concrete. ✓

**Type consistency:** `levelCurve`, `PET_TIER_EXP`, `applyPetExp` signatures identical across Tasks 2/3/4. `pet_exp_granted` column name consistent across Tasks 1/3. `pets_dispatched` matches existing schema. ✓

**Note:** Importing a `.mjs` from a `.tsx` (`@/lib/pet-progression.mjs`) works under Next/Turbopack + `allowJs` (tsconfig `allowJs` should be on; if a type error appears, add `// @ts-expect-error` is NOT acceptable — instead create `lib/pet-progression.d.ts` with the three declarations). Verify at Task 4 Step 3.
