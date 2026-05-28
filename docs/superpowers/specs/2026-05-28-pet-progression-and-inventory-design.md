# Pet Progression & Inventory Consumption — Design

Date: 2026-05-28
Status: Draft (awaiting review)

## Problem

Two gameplay loops are dead ends:

- **Pets never progress.** Dispatched (active) pets join adventures but gain no EXP; `user_pets.level/exp/evolution_stage` are only set at capture. Leveling/evolution code exists in `lib/pets.ts` (`addPetExp`, `evolvePet`, `levelCurve = ⌊100·level^1.5⌋`) but is **completely orphaned** — nothing calls it. The standalone worker (`scripts/render-pending-adventures.mjs`) reads active pets only as story/image context.
- **Inventory is write-only.** `user_inventory` accumulates items (`consumable / material / equip / egg / collect`) but nothing ever consumes them. The catalog (`scripts/seed-items.mjs`) has 11 items, all inert.

## Goals

1. Dispatched pets earn EXP and level up from adventures.
2. Pet level meaningfully affects adventure output (drops / catch rate / character EXP).
3. Pets evolve via **level threshold + consuming an evolution item** (player-triggered).
4. Inventory items do something: consumables (pre-adventure buff), eggs (hatch a pet), equip (passive bonus), evolution materials (above).

Non-goals (v1): pet combat / Boss battles, HP-as-a-resource (no damage sink yet), equip slot system with stat trees.

## Architecture constraints (existing)

- **Vercel Hobby 60s function cap** → all heavy work (gpt-image-2, LLM) lives in the GitHub Actions worker, triggered via a `pending_*` row that the worker scans. API routes only do light validation + write pending state.
- The worker is **standalone JS** and cannot import `lib/*.ts`; it re-implements DB access via Supabase REST (already re-declares `ITEM_CATALOG`, style locks, etc.). New worker logic follows this pattern.
- `lib/pets.ts` (`evolvePet`, `addPetExp`) does **synchronous** image gen — unusable from a 60s API route. We reuse its *formulas* (level curve, rarity→max_stage, evolution reference-image prompt) but the actual rendering happens in the worker.

## Data model — migration `011_pet_progression_inventory.sql`

```sql
-- worker render queue for pets (evolution / egg hatch). null = nothing pending.
ALTER TABLE user_pets   ADD COLUMN IF NOT EXISTS pending_render text
  CHECK (pending_render IS NULL OR pending_render IN ('evolution','hatch'));
-- pending one-shot buffs consumed by the next adventure (e.g. {"bonus_drops": 1})
ALTER TABLE character_state ADD COLUMN IF NOT EXISTS pending_buffs jsonb NOT NULL DEFAULT '{}'::jsonb;
-- idempotency guard so re-running the worker doesn't double-grant pet exp
ALTER TABLE adventures  ADD COLUMN IF NOT EXISTS pet_exp_granted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS user_pets_pending_render_idx
  ON user_pets(pending_render) WHERE pending_render IS NOT NULL;
```

Equip bonuses are a fixed code-side map (small static catalog) — no `items.metadata` writes needed.

## Mechanics

### A. Pet EXP & leveling

- **Trigger:** worker, in the story stage (`pending_story`), after rewards are written and only if `adventures.pet_exp_granted = false`.
- **Amount per active pet (tier-scaled):** `nearby 10 / coast 25 / ruin 50 / astral 100` (mirrors stamina tiers).
- **Curve:** `levelCurve(level) = ⌊100 · level^1.5⌋`, supporting multiple level-ups per grant.
- Worker updates `user_pets.level/exp` via REST, sets `pets_dispatched` = active pet ids on the adventure row, sets `pet_exp_granted = true`.

### B. Pet level → adventure impact

At story-generation time, `totalPetLevel = Σ active pets' level`. Bonuses (all capped):

| Bonus | Formula | Cap |
|---|---|---|
| Drop quality / extra-drop chance | +0.5% · totalPetLevel | +50% |
| Wild-pet catch rate | +0.3% · totalPetLevel | +30% |
| Character bonus EXP | +0.5% · totalPetLevel | +25% |

Equip bonuses (D) are added on top before caps.

**Implemented (slice 2):** bonuses are applied worker-side, not via LLM prompt:
- **Catch rate** — the LLM only decides whether a pet *appears*; the worker rolls capture: `caught = random() < min(1, CATCH_BASE_RATE[rarity] + catchBonus)` (base rates common .6 / rare .4 / epic .25 / legendary .15).
- **Extra drop** — `random() < dropChance` adds +1 to a random existing drop (or a `health_potion` fallback).
- **Character bonus EXP** — slice 2 also wires the previously **display-only** `adventures.rewards.exp` into the character: `character_state` gains `round(exp_reward × (1 + expBonus))` via `applyCharacterExp` (curve `1000 + level·120`, matching `lib/scoring.ts`). All three live under the `pet_exp_granted` idempotency guard.

**settleDay interaction:** the daily WHOOP settlement only reverses *its own* prior daily gains, so adventure EXP added here persists across settlement runs (accepted v1 drift, consistent with settleDay's existing "level reversal not strictly inverted" note).

### C. Evolution — level + item (player-triggered)

- **`POST /api/pets/evolve { user_pet_id }`** validates: `evolution_stage < max_stage` **AND** `level ≥ threshold` **AND** required item owned. Then: decrement item qty, set `user_pets.pending_render = 'evolution'`. Returns immediately (no render).
- **Thresholds & cost:** st1→2 at **Lv20**, requires `rare_herb` ×1. st2→3 at **Lv40**, requires `star_fragment` ×1. (`common` pets have `max_stage=1`, never evolve.)
- **Worker** scans `user_pets where pending_render='evolution'`: renders next stage (current image as reference, per `evolvePet`'s prompt), then increments `evolution_stage`, sets `current_image_url`, appends to `evolution_history`, clears `pending_render`.
- Auto-evolve in `lib/pets.ts.addPetExp` is removed/bypassed (evolution is now deliberate).

### D. Inventory consumption

**`POST /api/inventory/use { item_id }`** (decrements qty, branches on type/slug):
- `energy_drink` (consumable): `today_stamina += 50`, recompute `today_scene_tier`/`today_rarity_tier`. Usable before the day's adventure to push a tier.
- `health_potion` (consumable): `pending_buffs.bonus_drops += 1` (→ +1 guaranteed drop on next adventure; worker reads & clears). *(HP heal deferred — no HP sink exists yet.)*
- `pet_egg_common` / `pet_egg_rare` (egg): insert a `user_pets` row with rarity from the egg and `pending_render = 'hatch'`. Worker narrator generates metadata (name/description/base_prompt/element) for that rarity, renders base image, clears `pending_render`.

**`POST /api/inventory/equip { item_id, equipped }`** toggles `user_inventory.equipped`. Equip bonus map (code-side):
| slug | bonus |
|---|---|
| `wooden_sword` | +5% drop quality |
| `silver_blade` | +10% drop quality |
| `cosmic_helm` | +10% catch rate |

`memory_shard` (collect) and unspecified items stay pure collectibles.

### E. UI

- **Pets page** (`app/dashboard/pets/page.tsx`): per-pet EXP bar (level + exp/levelCurve), evolve button showing locked/ready state and the required item; "evolving…" while `pending_render='evolution'`.
- **Inventory page** (`app/dashboard/inventory/page.tsx`): per-item Use / Equip buttons (type-aware), with toasts for buffs applied / pet hatched.

## Build order (vertical slices, each shippable)

1. **Pet EXP in worker** (A) + EXP bar UI — fastest visible growth loop.
2. **Pet level → adventure bonuses** (B).
3. **Evolution** (C): API + worker render pass + pets-page button.
4. **Consumables + equip** (D consumable/equip) + inventory-page actions.
5. **Egg hatching** (D egg) — most involved (worker metadata gen + render).

## Idempotency & edge cases

- Pet EXP: guarded by `adventures.pet_exp_granted`.
- `energy_drink` directly mutates `today_stamina`; the `applyStatsToCharacter` daily recompute (force) will overwrite it next morning — acceptable (buff is same-day only).
- Worker pet-render pass must be idempotent: only acts on `pending_render IS NOT NULL`, clears it on success.
- Egg hatch respects nothing re: active-pet limit (it's storage, not dispatch).

## Open questions resolved

- **HP / health_potion:** repurposed as a drop buff (no HP sink in v1).
- **Scope:** all four inventory mechanics in, built as slices 1→5.
