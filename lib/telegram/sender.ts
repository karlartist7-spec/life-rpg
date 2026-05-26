/**
 * Telegram bot 直发消息。Vercel serverless 不需要代理。
 * 用 Bot API 的 sendMessage。
 *
 * 哥的 chat_id 直接存在 profiles.telegram_chat_id；MVP 阶段先这样硬绑。
 * 未来可以做 /start 命令的 deep-link 绑定，目前手动种到 DB 即可。
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org'

export async function sendTelegram(opts: {
  chatId: string
  text: string
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
}): Promise<{ ok: boolean; message_id?: number; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' }
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: opts.chatId,
        text: opts.text,
        parse_mode: opts.parseMode ?? 'Markdown',
        disable_web_page_preview: true,
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.ok) {
      return { ok: false, error: `${res.status} ${data.description ?? 'unknown'}` }
    }
    return { ok: true, message_id: data.result?.message_id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch failed' }
  }
}
