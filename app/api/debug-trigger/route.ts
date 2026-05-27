// 临时 — 一步步重现 generateStoryAndPet 看哪步炸。用完立删！
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const steps: any[] = []
  const log = (name: string, data?: any) => {
    steps.push({ name, t: Date.now(), ...(data ? { data } : {}) })
  }

  try {
    log('start')

    // Step 1: 创建 OpenAI client
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    log('openai_init')

    // Step 2: 简单 LLM 调用
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Reply with just: pong' }],
      max_tokens: 10,
    })
    log('openai_call', { content: resp.choices[0]?.message?.content })

    // Step 3: Supabase REST ping
    const sbR = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/adventures?select=count&limit=1`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: 'count=exact',
        },
      }
    )
    log('supabase_call', { status: sbR.status, ok: sbR.ok })

    // Step 4: import lib/adventures.ts 看 module-level 是否炸
    const mod = await import('@/lib/adventures')
    log('import_adventures', { has_generate: typeof mod.generateStoryAndPet })

    // Step 5: 真实调用
    const result = await mod.generateStoryAndPet({
      userId: '57f57048-7517-4e60-a74a-565c6a1f9430',
      recoveryScore: 60,
    })
    log('generateStoryAndPet_done', { adventureId: result.adventureId })

    return NextResponse.json({ ok: true, steps })
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message || String(e),
      stack: e?.stack?.split('\n').slice(0, 10),
      steps,
    }, { status: 500 })
  }
}
