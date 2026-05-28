# Slice 4: Inventory Consumables + Equip Bonuses

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Items finally do something — `energy_drink` boosts today's stamina (and its scene/rarity tier), `health_potion` queues a +1 guaranteed drop for the next adventure, and equipped gear (`wooden_sword`/`silver_blade`/`cosmic_helm`) adds drop/catch bonuses the worker applies.

**Architecture:** Light action handlers in `lib/pet-actions.mjs` (`useItem`, `equipItem`, service-role + userId filter) behind two POST routes. Consumable effects write to `character_state` (`today_stamina` / `pending_buffs`). The worker reads equipped gear + `pending_buffs` alongside pet bonuses, applies them, and clears `pending_buffs.bonus_drops`.

**Tech Stack:** Node ESM, Supabase REST, Next 16, gpt-image-2 worker.

> No test framework: `node -e` for pure math; node harness (mutate real data + revert) for the action helpers; routes compile (401); one paid worker run to prove equip+buff consumption (deterministic bonus_drops), then revert. `curl --noproxy '*'`; migrations via mgmt API + `NOTIFY pgrst`.

---

## File Structure
- Create: `migrations/013_pending_buffs.sql` — `character_state.pending_buffs jsonb default '{}'`.
- Modify: `lib/progression.mjs` — `EQUIP_BONUS`, `sumEquipBonuses`, `staminaTiers`.
- Modify: `lib/pet-actions.mjs` — `useItem`, `equipItem`, `consumeOne`.
- Create: `app/api/inventory/use/route.ts`, `app/api/inventory/equip/route.ts`.
- Modify: `scripts/render-pending-adventures.mjs` — equip + pending_buffs in `fillStory`.
- Modify: `app/dashboard/inventory/page.tsx` — refresh fn + use/equip buttons.

---

## Task 1: Migration 013 — `character_state.pending_buffs`

Create `migrations/013_pending_buffs.sql`:
```sql
-- 013: 角色一次性增益（被下一次冒险消费），如 {"bonus_drops": 1}
ALTER TABLE character_state
  ADD COLUMN IF NOT EXISTS pending_buffs jsonb NOT NULL DEFAULT '{}'::jsonb;
```
- [ ] Apply + reload (statement-only):
```bash
SUPA_MGMT_TOKEN=<SET-SUPABASE_MGMT_TOKEN-FROM-ENV>
MGMT="https://api.supabase.com/v1/projects/qgowirdryppnbgnvuzpg/database/query"
curl -s --noproxy '*' -X POST "$MGMT" -H "Authorization: Bearer $SUPA_MGMT_TOKEN" -H "Content-Type: application/json" -H "User-Agent: Mozilla/5.0" \
  -d "{\"query\":\"ALTER TABLE character_state ADD COLUMN IF NOT EXISTS pending_buffs jsonb NOT NULL DEFAULT '{}'::jsonb;\"}"
curl -s --noproxy '*' -X POST "$MGMT" -H "Authorization: Bearer $SUPA_MGMT_TOKEN" -H "Content-Type: application/json" -H "User-Agent: Mozilla/5.0" \
  -d "{\"query\":\"NOTIFY pgrst, 'reload schema';\"}"
```
- [ ] Verify REST: `character_state?select=user_id,pending_buffs&limit=1` → `"pending_buffs":{}`.

---

## Task 2: progression.mjs — equip bonuses + stamina tiers

Append:
```js
/** 装备被动加成（按 slug）。 */
export const EQUIP_BONUS = {
  wooden_sword: { drop: 0.05 },
  silver_blade: { drop: 0.10 },
  cosmic_helm: { catch: 0.10 },
}

/** 汇总一组已装备 slug 的加成。 */
export function sumEquipBonuses(slugs) {
  let drop = 0
  let catch_ = 0
  for (const s of slugs) {
    const b = EQUIP_BONUS[s]
    if (b) {
      drop += b.drop ?? 0
      catch_ += b.catch ?? 0
    }
  }
  return { drop, catch: catch_ }
}

/** 体力 → 场景/稀有度档位（与 lib/stats.ts 阈值一致）。 */
export function staminaTiers(stamina) {
  const scene = stamina < 100 ? 'nearby' : stamina < 250 ? 'coast' : stamina < 400 ? 'ruin' : 'astral'
  const rarity = stamina < 100 ? 'common' : stamina < 250 ? 'rare' : stamina < 400 ? 'epic' : 'legendary'
  return { scene_tier: scene, rarity_tier: rarity }
}
```
- [ ] Test:
```bash
cd /Users/yangweidong/Desktop/life-rpg
node --input-type=module -e '
import { EQUIP_BONUS, sumEquipBonuses, staminaTiers } from "./lib/progression.mjs";
import assert from "node:assert";
assert.equal(EQUIP_BONUS.silver_blade.drop, 0.10);
let b = sumEquipBonuses(["wooden_sword","cosmic_helm","unknown"]);
assert.ok(Math.abs(b.drop-0.05)<1e-9); assert.ok(Math.abs(b.catch-0.10)<1e-9);
assert.deepEqual(staminaTiers(50), {scene_tier:"nearby",rarity_tier:"common"});
assert.deepEqual(staminaTiers(300), {scene_tier:"ruin",rarity_tier:"epic"});
assert.deepEqual(staminaTiers(500), {scene_tier:"astral",rarity_tier:"legendary"});
console.log("OK slice4 progression");
'
```

---

## Task 3: pet-actions.mjs — `useItem`, `equipItem`

- [ ] Step 1: extend the import line
```js
import { evolutionRequirement, staminaTiers, EQUIP_BONUS } from './progression.mjs'
```
- [ ] Step 2: append handlers
```js
async function consumeOne(row) {
  if (row.qty > 1) {
    await sb(`user_inventory?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ qty: row.qty - 1 }) })
  } else {
    await sb(`user_inventory?id=eq.${row.id}`, { method: 'DELETE' })
  }
}

/** 使用消耗品：energy_drink → +50 体力(重算档位)；health_potion → +1 下次保底掉落。 */
export async function useItem(userId, rowId) {
  const rows = await sb(`user_inventory?id=eq.${rowId}&user_id=eq.${userId}&select=id,item_slug,qty`)
  const row = rows?.[0]
  if (!row || row.qty < 1) return { ok: false, code: 404, error: 'ITEM_NOT_FOUND' }

  if (row.item_slug === 'energy_drink') {
    const cs = (await sb(`character_state?user_id=eq.${userId}&select=today_stamina`))[0]
    const stamina = (cs?.today_stamina ?? 0) + 50
    const t = staminaTiers(stamina)
    await sb(`character_state?user_id=eq.${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ today_stamina: stamina, today_scene_tier: t.scene_tier, today_rarity_tier: t.rarity_tier }),
    })
    await consumeOne(row)
    return { ok: true, effect: 'stamina', stamina, scene_tier: t.scene_tier }
  }

  if (row.item_slug === 'health_potion') {
    const cs = (await sb(`character_state?user_id=eq.${userId}&select=pending_buffs`))[0]
    const buffs = cs?.pending_buffs ?? {}
    buffs.bonus_drops = (buffs.bonus_drops ?? 0) + 1
    await sb(`character_state?user_id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ pending_buffs: buffs }) })
    await consumeOne(row)
    return { ok: true, effect: 'bonus_drops', bonus_drops: buffs.bonus_drops }
  }

  return { ok: false, code: 400, error: 'NOT_USABLE' }
}

/** 装备/卸下：整行切换 equipped。卸下时若已存在未装备同 slug 行则并库存（避免 partial unique 冲突）。 */
export async function equipItem(userId, rowId, equipped) {
  const rows = await sb(`user_inventory?id=eq.${rowId}&user_id=eq.${userId}&select=id,item_slug,qty,equipped`)
  const row = rows?.[0]
  if (!row) return { ok: false, code: 404, error: 'ITEM_NOT_FOUND' }
  if (!EQUIP_BONUS[row.item_slug]) return { ok: false, code: 400, error: 'NOT_EQUIPPABLE' }

  if (equipped) {
    if (!row.equipped) {
      await sb(`user_inventory?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ equipped: true }) })
    }
    return { ok: true, equipped: true }
  }
  if (row.equipped) {
    const un = await sb(`user_inventory?user_id=eq.${userId}&item_slug=eq.${row.item_slug}&equipped=eq.false&select=id,qty`)
    if (un?.[0]) {
      await sb(`user_inventory?id=eq.${un[0].id}`, { method: 'PATCH', body: JSON.stringify({ qty: un[0].qty + row.qty }) })
      await sb(`user_inventory?id=eq.${row.id}`, { method: 'DELETE' })
    } else {
      await sb(`user_inventory?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ equipped: false }) })
    }
  }
  return { ok: true, equipped: false }
}
```
- [ ] Step 3: `node --check lib/pet-actions.mjs`.

---

## Task 4: Routes

- [ ] Create `app/api/inventory/use/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'
import { useItem } from '@/lib/pet-actions.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body?.item_id) return NextResponse.json({ error: 'missing item_id' }, { status: 400 })
  const r = await useItem(user.id, body.item_id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.code ?? 400 })
  return NextResponse.json(r)
}
```
- [ ] Create `app/api/inventory/equip/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'
import { equipItem } from '@/lib/pet-actions.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body?.item_id || typeof body.equipped !== 'boolean') {
    return NextResponse.json({ error: 'need { item_id, equipped }' }, { status: 400 })
  }
  const r = await equipItem(user.id, body.item_id, body.equipped)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.code ?? 400 })
  return NextResponse.json(r)
}
```
- [ ] Verify both compile: `curl -s --noproxy '*' -X POST .../api/inventory/use` and `.../equip` → `401`.

---

## Task 5: Worker — apply equip bonus + pending_buffs in `fillStory`

- [ ] Step 1: import — extend the worker's progression import to add `sumEquipBonuses`:
```js
import { PET_TIER_EXP, applyPetExp, petBonuses, CATCH_BASE_RATE, applyCharacterExp, sumEquipBonuses } from '../lib/progression.mjs'
```
- [ ] Step 2: after `const bonuses = petBonuses(totalPetLevel)` (and its console.log), add:
```js
  // 装备加成 + 角色 pending_buffs（保底掉落）
  const equippedRows = await sb(`user_inventory?user_id=eq.${adv.user_id}&equipped=eq.true&select=item_slug`)
  const equipB = sumEquipBonuses((equippedRows ?? []).map((r) => r.item_slug))
  const buffRow = (await sb(`character_state?user_id=eq.${adv.user_id}&select=pending_buffs`))[0]
  const pendingBuffs = buffRow?.pending_buffs ?? {}
  const bonusDrops = pendingBuffs.bonus_drops ?? 0
  const dropChance = Math.min(0.75, bonuses.dropChance + equipB.drop)
  const catchBonus = Math.min(0.5, bonuses.catchBonus + equipB.catch)
  console.log(`  - 装备 drop+${(equipB.drop * 100).toFixed(0)}% catch+${(equipB.catch * 100).toFixed(0)}%; 保底掉落 ${bonusDrops}`)
```
- [ ] Step 3: catch roll — change `base + bonuses.catchBonus` to `base + catchBonus`.
- [ ] Step 4: drop section — change the extra-drop condition `Math.random() < bonuses.dropChance` to `Math.random() < dropChance`. Then, immediately AFTER that extra-drop block and BEFORE the `for (const drop of validDrops)` loop, add the guaranteed bonus drops + clear the buff:
```js
  // 角色 pending_buffs.bonus_drops：保底额外掉落，消费后清空
  for (let i = 0; i < bonusDrops; i++) {
    if (validDrops.length > 0) {
      validDrops[Math.floor(Math.random() * validDrops.length)].qty += 1
    } else {
      validDrops.push({ item_slug: 'health_potion', qty: 1 })
    }
  }
  if (bonusDrops > 0) {
    const cleared = { ...pendingBuffs }
    delete cleared.bonus_drops
    await sb(`character_state?user_id=eq.${adv.user_id}`, { method: 'PATCH', body: JSON.stringify({ pending_buffs: cleared }) })
    console.log(`  - 消费保底掉落 ${bonusDrops} 件，清空 pending_buffs.bonus_drops`)
  }
```
- [ ] Step 5: `node --check scripts/render-pending-adventures.mjs`.

---

## Task 6: Inventory UI — use/equip buttons

**Files:** Modify `app/dashboard/inventory/page.tsx`

- [ ] Step 1: refactor fetch into a `refresh()` + add `busyId` state:
```tsx
  const [busyId, setBusyId] = useState<string | null>(null)
  const refresh = async () => {
    const r = await fetch('/api/inventory', { cache: 'no-store' })
    const j = await r.json()
    setItems(j.items ?? [])
    setStats(j.stats ?? null)
  }
  useEffect(() => { refresh().finally(() => setLoading(false)) }, [])
```
(remove the old inline `useEffect` fetch.)

- [ ] Step 2: add handlers in `InventoryPage`:
```tsx
  const useConsumable = async (row: InvRow) => {
    setBusyId(row.id)
    try {
      const r = await fetch('/api/inventory/use', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: row.id }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { alert(`使用失败：${j.error || r.status}`); return }
      alert(j.effect === 'stamina' ? `体力 +50 → ${j.stamina}（${j.scene_tier}）` : `下次冒险 +${j.bonus_drops} 保底掉落`)
      await refresh()
    } finally { setBusyId(null) }
  }
  const toggleEquip = async (row: InvRow) => {
    setBusyId(row.id)
    try {
      const r = await fetch('/api/inventory/equip', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: row.id, equipped: !row.equipped }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { alert(`操作失败：${j.error || r.status}`); return }
      await refresh()
    } finally { setBusyId(null) }
  }
```

- [ ] Step 3: render an action button per card. Inside the card `<motion.div>` (after the 来源 link block, before the card closes), add:
```tsx
                {row.meta.type === 'consumable' && (
                  <button
                    onClick={() => useConsumable(row)}
                    disabled={busyId === row.id}
                    className={`btn-doodle btn-doodle--mint mt-2 w-full !py-1.5 !text-xs ${busyId === row.id ? 'cursor-wait opacity-60' : ''}`}
                  >
                    {busyId === row.id ? '…' : '使用'}
                  </button>
                )}
                {row.meta.type === 'equip' && (
                  <button
                    onClick={() => toggleEquip(row)}
                    disabled={busyId === row.id}
                    className={`btn-doodle mt-2 w-full !py-1.5 !text-xs ${row.equipped ? 'btn-doodle--peri' : 'btn-doodle--sunshine'} ${busyId === row.id ? 'cursor-wait opacity-60' : ''}`}
                  >
                    {busyId === row.id ? '…' : row.equipped ? '卸下' : '装备'}
                  </button>
                )}
```

- [ ] Step 4: verify compiles: `curl .../dashboard/inventory` → `307`.

- [ ] Step 5: e2e (helpers via node harness + one paid worker run), then revert. Snapshot `character_state` (today_stamina/today_scene_tier/today_rarity_tier/pending_buffs) and the `energy_drink`/`health_potion`/an equip inventory rows. Then:
  - **useItem energy_drink**: call `useItem(user, energyRowId)`; assert `today_stamina` +50 and tier recomputed; qty −1.
  - **useItem health_potion**: call; assert `pending_buffs.bonus_drops` +1; qty −1.
  - **equipItem**: equip a `wooden_sword` row → assert `equipped=true`; unequip → assert merged/`equipped=false`.
  - **worker buff+equip**: with `pending_buffs.bonus_drops` set (e.g. 2) and a sword equipped, insert a synthetic `pending_story` adventure (past date, scene_tier ruin), run the worker; assert log shows `装备 drop+5%` and `消费保底掉落 2`, the adventure's `rewards.items` got the extra qty, and `pending_buffs.bonus_drops` is cleared.
  - **revert**: restore `character_state` snapshot, restore inventory rows (re-add consumed qty, un-equip the sword, merge), delete the synthetic adventure + any captured pet/drops/images.

---

## Self-Review
**Spec coverage (§D consumables + equip):** energy_drink/health_potion (Task 3 useItem), equip toggle + bonus (Task 3 equipItem + Task 5 worker), pending_buffs column (Task 1), worker consumes buffs + equip (Task 5), UI (Task 6). Egg hatch is slice 5 (not here). ✓
**Placeholder scan:** Task 6 Step 5 e2e described in prose (reuses established snapshot-run-revert pattern); all new code complete. ✓
**Type consistency:** `useItem→{ok,effect,stamina?,scene_tier?,bonus_drops?}`; `equipItem→{ok,equipped}`; `sumEquipBonuses→{drop,catch}`; `staminaTiers→{scene_tier,rarity_tier}`; `pending_buffs.bonus_drops` consistent across useItem/worker. Worker var `dropChance`/`catchBonus` replace `bonuses.*` at both use sites. ✓
