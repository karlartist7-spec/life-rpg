# Slice 5: Egg Hatching

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Using a `pet_egg_common`/`pet_egg_rare` consumes it and creates a pending pet; the worker generates that pet's metadata (LLM) + base image and finalizes it — a second way to obtain pets besides wild capture.

**Architecture:** Reuses the `pending_render` queue (`'hatch'`, already allowed in migration 012). `useItem` (slice 4) gains an egg branch that inserts a minimal `user_pets` row (`pending_render='hatch'`, placeholder name) and consumes the egg. The worker's pending-render pass (slice 3 段3) gains a `'hatch'` branch: narrator generates name/desc/base_prompt/element for the rarity, then base image, then clears `pending_render`.

**Tech Stack:** Node ESM, Supabase REST, Next 16, gpt-4o-mini + gpt-image-2 worker.

> No migration needed. Verify: helper via node harness; one paid worker run (LLM + image) for hatch render; then revert (delete hatched pet + image, restore egg).

---

## File Structure
- Modify: `lib/pet-actions.mjs` — egg branch in `useItem`.
- Modify: `scripts/render-pending-adventures.mjs` — `generateHatchPet` + `renderHatch`; unify 段3 to scan all `pending_render`.
- Modify: `app/dashboard/inventory/page.tsx` — egg "孵化" button + `hatch` alert.

---

## Task 1: `useItem` egg branch

In `lib/pet-actions.mjs`, inside `useItem`, BEFORE the final `return { ok:false, code:400, error:'NOT_USABLE' }`, add:
```js
  if (row.item_slug === 'pet_egg_common' || row.item_slug === 'pet_egg_rare') {
    const rarity = row.item_slug === 'pet_egg_rare' ? 'rare' : 'common'
    const maxStage = rarity === 'rare' ? 2 : 1
    const mult = rarity === 'rare' ? 1.3 : 1
    await sb(`user_pets`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        rarity,
        max_stage: maxStage,
        name: '孵化中…',
        nickname: '孵化中…',
        base_prompt: '',
        evolution_stage: 1,
        stats: { hp: Math.floor(100 * mult), atk: Math.floor(10 * mult), def: Math.floor(10 * mult) },
        pending_render: 'hatch',
      }),
    })
    await consumeOne(row)
    return { ok: true, effect: 'hatch', rarity }
  }
```
- [ ] `node --check lib/pet-actions.mjs`.

---

## Task 2: Worker — hatch render

In `scripts/render-pending-adventures.mjs`:

- [ ] Step 1: add `generateHatchPet` + `renderHatch` before `async function main()` (next to `renderEvolution`):
```js
async function generateHatchPet(rarity) {
  const isDeepSeek = NARRATOR_MODEL.startsWith('deepseek')
  const sys = `你为一只刚从「${rarity}」稀有度宠物蛋中孵化的奇幻生物生成设定。可爱、奇幻、积极。只输出 JSON，不要 markdown。`
  const userPrompt = `稀有度: ${rarity}。生成字段：name(中文名,2-4字), description(中文一句话设定), base_prompt(英文30字以内外观特征,用于生图), element(中文单字或词,如 火/水/风/土/光/暗/雷/冰)。`
  const schema = {
    type: 'object', additionalProperties: false,
    required: ['name', 'description', 'base_prompt', 'element'],
    properties: {
      name: { type: 'string' }, description: { type: 'string' },
      base_prompt: { type: 'string' }, element: { type: 'string' },
    },
  }
  const resp = await narrator.chat.completions.create({
    model: NARRATOR_MODEL,
    messages: [
      { role: 'system', content: isDeepSeek ? `${sys}\nschema: ${JSON.stringify(schema)}` : sys },
      { role: 'user', content: userPrompt },
    ],
    response_format: isDeepSeek
      ? { type: 'json_object' }
      : { type: 'json_schema', json_schema: { name: 'hatch_pet', strict: true, schema } },
  })
  return JSON.parse(resp.choices[0].message.content)
}

async function renderHatch(pet) {
  const start = Date.now()
  console.log(`\n[hatch] === ${pet.id.slice(0, 8)} [${pet.rarity}] ===`)
  const meta = await generateHatchPet(pet.rarity)
  console.log(`  - 生成设定: ${meta.name} (${meta.element})`)
  const bg = RARITY_BG[pet.rarity] || RARITY_BG.common
  const petPrompt = `PET CREATURE: ${meta.base_prompt}

${PET_COMPOSITION.replace('Solid cream #FAF8F3 background', `Solid ${bg.name} ${bg.hex} background (rarity tier: ${pet.rarity})`)}

${doodlesStyleLock({ background: bg })}`
  const buf = await genImage({ prompt: petPrompt, size: '1024x1024', quality: 'medium' })
  const url = await uploadToStorage('character-art', `pets/${pet.id}/base.png`, buf)
  await sb(`user_pets?id=eq.${pet.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: meta.name, nickname: meta.name, description: meta.description,
      base_prompt: meta.base_prompt, element: meta.element,
      base_image_url: url, current_image_url: url, pending_render: null,
    }),
  })
  console.log(`[hatch] ✅ ${pet.id.slice(0, 8)} ${meta.name} (${((Date.now() - start) / 1000).toFixed(1)}s)`)
}
```

- [ ] Step 2: unify the 段3 scan — replace the evolution-only block in `main()`:
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
with:
```js
  // 段 3：宠物渲染队列（进化 / 孵化）。失败不清 pending_render，下次重试。
  const pendingPets = await sb(
    `user_pets?pending_render=not.is.null&select=*&limit=${MAX_PER_RUN}`,
  )
  console.log(`[worker] pending_render(pets): ${pendingPets.length}`)
  for (const pet of pendingPets) {
    try {
      if (pet.pending_render === 'evolution') await renderEvolution(pet)
      else if (pet.pending_render === 'hatch') await renderHatch(pet)
    } catch (e) {
      console.error(`[worker] ❌ ${pet.pending_render} ${pet.id.slice(0, 8)}:`, e.message)
    }
  }
```
- [ ] Step 3: `node --check scripts/render-pending-adventures.mjs`.

---

## Task 3: Inventory UI — egg button + hatch alert

In `app/dashboard/inventory/page.tsx`:

- [ ] Step 1: generalize the `useConsumable` alert to cover hatch:
```tsx
      const m =
        j.effect === 'stamina'
          ? `体力 +50 → ${j.stamina}（${j.scene_tier}）`
          : j.effect === 'bonus_drops'
            ? `下次冒险 +${j.bonus_drops} 保底掉落`
            : j.effect === 'hatch'
              ? `${j.rarity} 宠物蛋开始孵化，去宠物图鉴看看`
              : '已使用'
      alert(m)
```
(replaces the existing two-branch `alert(...)` in `useConsumable`.)

- [ ] Step 2: add an egg button next to the consumable/equip buttons in the card:
```tsx
                {row.meta.type === 'egg' && (
                  <button
                    onClick={() => useConsumable(row)}
                    disabled={busyId === row.id}
                    className={`btn-doodle btn-doodle--pink mt-2 w-full !py-1.5 !text-xs ${busyId === row.id ? 'cursor-wait opacity-60' : ''}`}
                  >
                    {busyId === row.id ? '…' : '孵化'}
                  </button>
                )}
```

- [ ] Step 3: verify compile: `curl .../dashboard/inventory` → `307`.

---

## Task 4: E2E (paid worker run) + revert

- [ ] Snapshot a `pet_egg_rare` inventory row (id, qty) + current pet count. Then:
  - call `useItem(user, eggRowId)` via node harness with env loaded → assert `{ok:true,effect:'hatch',rarity:'rare'}`; egg qty −1; a new `user_pets` row exists with `pending_render='hatch'`, `name='孵化中…'`.
  - run the worker → assert `[hatch] ✅ … <name>`; the new pet now has a real `name`/`base_prompt`/`element`, `base_image_url` set, `pending_render=null`.
  - **revert**: delete the hatched `user_pets` row, delete `pets/<id>/base.png`, restore the egg qty (+1).

---

## Self-Review
**Spec coverage (§D egg):** consume egg → pending pet (Task 1), worker generates metadata + image (Task 2), UI hatch button (Task 3). ✓ Completes #5 (all inventory mechanics).
**Placeholder scan:** Task 4 prose reuses the established harness-run-revert pattern; all code steps complete. ✓
**Type consistency:** `useItem` egg returns `{ok,effect:'hatch',rarity}`; worker branches on `pending_render` `'evolution'|'hatch'`; `generateHatchPet→{name,description,base_prompt,element}`. ✓
