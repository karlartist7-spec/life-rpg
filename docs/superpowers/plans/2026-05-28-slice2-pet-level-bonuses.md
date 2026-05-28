# Slice 2: Pet Level → Adventure Bonuses + Apply Adventure EXP to Character

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Total active-pet level boosts each adventure's extra-drop chance, wild catch rate, and the adventure EXP granted to the character — and that adventure EXP is now actually applied to `character_state` (it was previously display-only).

**Architecture:** All progression math (pet + character + bonuses) consolidates into one plain-JS module `lib/progression.mjs` (renamed from `lib/pet-progression.mjs`), imported by the worker and UI. The worker computes `totalPetLevel` once from the active pets it already queries, derives capped bonuses, overrides the LLM's `caught` with a bonus-adjusted roll, rolls an optional extra drop, and applies `exp_reward × (1+expBonus)` to the character — all under the existing `pet_exp_granted` idempotency guard.

**Tech Stack:** Node ESM, Supabase REST, Next 16, gpt-image-2 worker.

> Same verification reality as slice 1: no test framework. `node -e` for pure math; non-destructive real-data read; one paid worker run (~$0.04) observing logged chances, then clean up (incl. reverting character EXP). `curl --noproxy '*'`.

---

## File Structure

- Rename: `lib/pet-progression.mjs` → `lib/progression.mjs` (add character + bonus functions).
- Modify: `scripts/render-pending-adventures.mjs` — single active-pet query; compute bonuses; catch roll; extra-drop roll; apply character EXP; update import.
- Modify: `components/pet-card.tsx` — update import path.
- Modify: spec doc — note char-exp landing + settleDay drift.

---

## Task 1: Consolidate progression module

**Files:**
- Rename: `lib/pet-progression.mjs` → `lib/progression.mjs`

- [ ] **Step 1: git-rename the module**

```bash
cd /Users/yangweidong/Desktop/life-rpg
git mv lib/pet-progression.mjs lib/progression.mjs
```

- [ ] **Step 2: Append character + bonus functions**

Add to `lib/progression.mjs`:

```js
/** 角色升级曲线（与 lib/scoring.ts nextLevelExp 一致）。 */
export function characterNextLevelExp(level) {
  return 1000 + level * 120
}

/** 给角色 (level, exp, totalExp) 累加 gain，连续升级。 */
export function applyCharacterExp(level, exp, totalExp, gain) {
  let lvl = level
  let e = exp + gain
  const t = totalExp + gain
  let leveledUp = false
  while (e >= characterNextLevelExp(lvl)) {
    e -= characterNextLevelExp(lvl)
    lvl += 1
    leveledUp = true
    if (lvl > 999) break
  }
  return { level: lvl, exp: e, totalExp: t, leveledUp }
}

/** 野宠基础捕获率（按稀有度），worker 在此基础上叠加 catchBonus。 */
export const CATCH_BASE_RATE = { common: 0.6, rare: 0.4, epic: 0.25, legendary: 0.15 }

/** 出战宠物总等级 → 三项加成（均有上限）。 */
export function petBonuses(totalLevel) {
  return {
    dropChance: Math.min(0.5, totalLevel * 0.005), // 额外掉落几率
    catchBonus: Math.min(0.3, totalLevel * 0.003), // 叠加到基础捕获率
    expBonus: Math.min(0.25, totalLevel * 0.005),  // 角色冒险 exp 乘数
  }
}
```

- [ ] **Step 3: Unit-test the new functions**

```bash
cd /Users/yangweidong/Desktop/life-rpg
node --input-type=module -e '
import { characterNextLevelExp, applyCharacterExp, CATCH_BASE_RATE, petBonuses } from "./lib/progression.mjs";
import assert from "node:assert";
assert.equal(characterNextLevelExp(0), 1000);
assert.equal(characterNextLevelExp(5), 1600);
// Lv0 exp0 +1200 -> Lv1 (cost 1000), remainder 200; totalExp 1200
let r = applyCharacterExp(0, 0, 0, 1200);
assert.equal(r.level, 1); assert.equal(r.exp, 200); assert.equal(r.totalExp, 1200); assert.equal(r.leveledUp, true);
assert.equal(CATCH_BASE_RATE.epic, 0.25);
// caps: totalLevel 1000 -> all capped
let b = petBonuses(1000);
assert.equal(b.dropChance, 0.5); assert.equal(b.catchBonus, 0.3); assert.equal(b.expBonus, 0.25);
// small: totalLevel 30 -> 0.15/0.09/0.15
let s = petBonuses(30);
assert.ok(Math.abs(s.dropChance-0.15)<1e-9); assert.ok(Math.abs(s.catchBonus-0.09)<1e-9); assert.ok(Math.abs(s.expBonus-0.15)<1e-9);
console.log("OK progression slice2");
'
```
Expected: `OK progression slice2`.

- [ ] **Step 4: Commit (deferred — batch at end per user).**

---

## Task 2: Update importers to the renamed module

**Files:**
- Modify: `scripts/render-pending-adventures.mjs`
- Modify: `components/pet-card.tsx`

- [ ] **Step 1: Worker import line**

In `scripts/render-pending-adventures.mjs`, change:
```js
import { PET_TIER_EXP, applyPetExp } from '../lib/pet-progression.mjs'
```
to:
```js
import { PET_TIER_EXP, applyPetExp, petBonuses, CATCH_BASE_RATE, applyCharacterExp } from '../lib/progression.mjs'
```

- [ ] **Step 2: pet-card import line**

In `components/pet-card.tsx`, change:
```tsx
import { levelCurve } from '@/lib/pet-progression.mjs'
```
to:
```tsx
import { levelCurve } from '@/lib/progression.mjs'
```

- [ ] **Step 3: Verify UI still compiles**

```bash
curl -s --noproxy '*' --max-time 15 -o /dev/null -w "preview status=%{http_code}\n" http://127.0.0.1:3000/preview/pets
```
Expected: `status=200`.

---

## Task 3: Worker — one active-pet query, bonuses, catch roll, extra drop, character EXP

**Files:**
- Modify: `scripts/render-pending-adventures.mjs`

- [ ] **Step 1: Extend the active-pet query (add `id`, `exp`)**

Change the query at ~line 341 from:
```js
  const activePets = await sb(
    `user_pets?user_id=eq.${adv.user_id}&is_active=eq.true&select=name,nickname,evolution_stage,level,element`,
  )
```
to:
```js
  const activePets = await sb(
    `user_pets?user_id=eq.${adv.user_id}&is_active=eq.true&select=id,name,nickname,evolution_stage,level,element,exp`,
  )
  const totalPetLevel = (activePets ?? []).reduce((s, p) => s + (p.level ?? 0), 0)
  const bonuses = petBonuses(totalPetLevel)
  console.log(`  - 出战宠物总等级 ${totalPetLevel} → drop+${(bonuses.dropChance*100).toFixed(0)}% catch+${(bonuses.catchBonus*100).toFixed(0)}% exp+${(bonuses.expBonus*100).toFixed(0)}%`)
```

- [ ] **Step 2: Catch roll (override LLM `caught`)**

Immediately AFTER the LLM call returns `llm` (after `const llm = await callNarrator({...})`, around line 357-378 — find where `llm` is assigned), insert:
```js
  // 捕获改为掷骰：LLM 决定是否"出现"宠物，worker 用 基础率 + 宠物加成 掷骰决定捕获
  if (llm.pet_encounter) {
    const base = CATCH_BASE_RATE[llm.pet_encounter.rarity] ?? 0.3
    const chance = Math.min(1, base + bonuses.catchBonus)
    const roll = Math.random()
    llm.pet_encounter.caught = roll < chance
    console.log(`  - 遭遇 ${llm.pet_encounter.name}[${llm.pet_encounter.rarity}] 捕获率 ${(chance*100).toFixed(0)}% 掷 ${(roll*100).toFixed(0)} → ${llm.pet_encounter.caught ? '捕获' : '逃脱'}`)
  }
```

- [ ] **Step 3: Extra-drop roll**

Find where `validDrops` is finalized (the array written to inventory / `rewards.items`, around line 380-414). Immediately AFTER `validDrops` is built and BEFORE it is written to `user_inventory`, insert:
```js
  // 额外掉落：按宠物加成掷骰，命中则随机一件已掉落物 +1（无掉落则给一个普通药水）
  if (Math.random() < bonuses.dropChance) {
    if (validDrops.length > 0) {
      const pick = validDrops[Math.floor(Math.random() * validDrops.length)]
      pick.qty += 1
      console.log(`  - 额外掉落命中 → ${pick.item_slug} +1`)
    } else {
      validDrops.push({ item_slug: 'health_potion', qty: 1 })
      console.log('  - 额外掉落命中 → health_potion x1 (无基础掉落兜底)')
    }
  }
```
> Note: this must run before the loop that upserts `validDrops` into `user_inventory`. If the inventory write loop reads `validDrops` earlier, move this block above it.

- [ ] **Step 4: Apply character EXP in the reward-grant block**

In the slice-1 grant block (`if (!adv.pet_exp_granted) { ... }`), (a) replace the separate pet query with iteration over `activePets`, and (b) add character EXP application. Replace the whole block:
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
with:
```js
  // 8b. 发放奖励（幂等：pet_exp_granted 防重发）：出战宠物 EXP + 角色冒险 EXP
  let dispatchedIds = []
  if (!adv.pet_exp_granted) {
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
    // 角色冒险 EXP = exp_reward × (1 + 宠物 expBonus)，应用到 character_state
    const charGain = Math.round((llm.exp_reward ?? 0) * (1 + bonuses.expBonus))
    const csRow = (await sb(`character_state?user_id=eq.${adv.user_id}&select=level,exp,total_exp`))[0]
    if (csRow) {
      const nc = applyCharacterExp(csRow.level ?? 1, csRow.exp ?? 0, csRow.total_exp ?? 0, charGain)
      await sb(`character_state?user_id=eq.${adv.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ level: nc.level, exp: nc.exp, total_exp: nc.totalExp, updated_at: new Date().toISOString() }),
      })
      console.log(`  - 角色 +${charGain} exp → Lv.${nc.level}${nc.leveledUp ? ' (LEVEL UP)' : ''}`)
    }
  }
```

- [ ] **Step 5: Syntax check**

```bash
cd /Users/yangweidong/Desktop/life-rpg
node --check scripts/render-pending-adventures.mjs && echo "syntax OK"
```

- [ ] **Step 6: Non-destructive bonus read against real data**

```bash
cd /Users/yangweidong/Desktop/life-rpg
SRV=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"')
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
TEST_USER=57f57048-7517-4e60-a74a-565c6a1f9430
node --input-type=module -e "
import { petBonuses } from './lib/progression.mjs';
const r = await fetch('$SUPA_URL/rest/v1/user_pets?user_id=eq.$TEST_USER&is_active=eq.true&select=level', { headers:{ apikey:'$SRV', Authorization:'Bearer $SRV' }});
const pets = await r.json();
const total = pets.reduce((s,p)=>s+(p.level??0),0);
console.log('totalPetLevel=', total, 'bonuses=', petBonuses(total));
"
```
Expected: prints totalPetLevel (3 pets × Lv.1 = 3) and bonuses (drop 1.5% / catch 0.9% / exp 1.5%).

- [ ] **Step 7: Paid worker run + observe logs, then clean up** (snapshot character + pets first; revert after).

Same synthetic-adventure approach as slice 1: snapshot `character_state` (level/exp/total_exp) and active pets; insert a `pending_story` adventure on a past date with `scene_tier='ruin'`; run the worker; confirm logs show the bonus line, catch roll, char EXP line; then delete the synthetic adventure + any captured pet + drops, and **revert character_state and the 3 pets to their snapshot**. (Detailed commands mirror slice 1's verification + cleanup; reuse them.)

---

## Task 4: Update spec note

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-pet-progression-and-inventory-design.md`

- [ ] **Step 1:** In §B, change the "Character bonus EXP" row note to record that slice 2 also wires `adventures.rewards.exp` → `character_state` (previously display-only), and add an idempotency/`settleDay` drift note: adventure EXP persists across daily settlement (settleDay only reverses its own daily gains), accepted as v1 drift.

---

## Self-Review

**Spec coverage:** §B all three bonuses (drop/catch/exp) → Task 3. The missing "apply adventure exp to character" → Task 3 Step 4. Module consolidation → Task 1. ✓
**Placeholder scan:** Task 3 Step 7 references "reuse slice 1 commands" rather than repeating them — acceptable since slice 1's verification/cleanup commands are in this session's history and the prior plan; all *code* steps are complete. ✓
**Type consistency:** `petBonuses` returns `{dropChance, catchBonus, expBonus}` used consistently; `applyCharacterExp` returns `{level, exp, totalExp, leveledUp}`; `CATCH_BASE_RATE` keyed by rarity. Import path `lib/progression.mjs` updated in both importers (Task 2). ✓
