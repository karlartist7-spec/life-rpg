#!/usr/bin/env python3
"""
Telegram 日志总结 cron 脚本
每天 23:30 运行，抓当天 TG 对话 → LLM 总结 → 写 adventure_log

Usage:
  python3 scripts/tg-daily-summary.py [--date YYYY-MM-DD]
"""
import sys, os, json, sqlite3, datetime, time
from pathlib import Path

# 读 secrets
SECRETS = json.loads(Path.home().joinpath('.hermes/secrets/life-rpg-tokens.json').read_text())
OPENAI_KEY = SECRETS['openai_api_key']
SUPA_URL = SECRETS['supabase_url']
SUPA_SRV = SECRETS['supabase_service_role_key']
USER_ID = '57f57048-7517-4e60-a74a-565c6a1f9430'  # yangweidong

def get_today_tg_messages(date_str: str):
    """从 Hermes state.db 抓指定日期的 TG user 消息"""
    db_path = Path.home() / '.hermes/state.db'
    conn = sqlite3.connect(str(db_path))
    
    # 转 epoch
    dt = datetime.datetime.strptime(date_str, '%Y-%m-%d')
    start_ts = dt.replace(hour=0, minute=0, second=0).timestamp()
    end_ts = (dt + datetime.timedelta(days=1)).replace(hour=0, minute=0, second=0).timestamp()
    
    rows = conn.execute("""
        SELECT m.timestamp, m.content
        FROM messages m JOIN sessions s ON m.session_id = s.id
        WHERE m.role='user' AND m.timestamp >= ? AND m.timestamp < ?
          AND s.source='telegram'
        ORDER BY m.timestamp
    """, (start_ts, end_ts)).fetchall()
    
    conn.close()
    return [(time.strftime('%H:%M', time.localtime(ts)), content) for ts, content in rows]

def summarize_with_llm(messages: list[tuple[str, str]], date_str: str) -> str:
    """用 OpenAI 总结当天对话"""
    if not messages:
        return f"{date_str} 无对话"
    
    # 拼对话文本
    lines = [f"[{t}] {c}" for t, c in messages]
    transcript = '\n'.join(lines)
    
    prompt = f"""你是 life-rpg 的日志助手。用户今天（{date_str}）和 AI 助手 Hermes 的 Telegram 对话如下：

{transcript}

请用 1-2 句话总结今天的主要活动/话题/成果，风格：简洁、第一人称、RPG 冒险日志风（如"今天和 Hermes 一起搭建了 life-rpg 前端 UI，完成了角色卡和任务页"）。不要提"用户说"或"AI 回复"，只提实际做了什么。"""
    
    import urllib.request
    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=json.dumps({
            'model': 'gpt-4o-mini',
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': 0.7,
            'max_tokens': 150
        }).encode(),
        headers={
            'Authorization': f'Bearer {OPENAI_KEY}',
            'Content-Type': 'application/json'
        }
    )
    resp = urllib.request.urlopen(req, timeout=30)
    data = json.loads(resp.read())
    return data['choices'][0]['message']['content'].strip()

def write_to_supabase(date_str: str, summary: str):
    """写 adventure_log"""
    import urllib.request
    
    # 检查是否已存在（幂等）
    check_req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/adventure_log?user_id=eq.{USER_ID}&log_date=eq.{date_str}&category=eq.telegram_summary&select=id",
        headers={
            'apikey': SUPA_SRV,
            'Authorization': f'Bearer {SUPA_SRV}',
            'Content-Type': 'application/json'
        }
    )
    check_resp = urllib.request.urlopen(check_req)
    existing = json.loads(check_resp.read())
    if existing:
        print(f"  ✓ {date_str} telegram_summary 已存在，跳过")
        return
    
    # INSERT
    occurred_at = f"{date_str}T23:30:00+08:00"
    payload = {
        'user_id': USER_ID,
        'log_date': date_str,
        'occurred_at': occurred_at,
        'category': 'telegram_summary',
        'message': summary,
        'exp_delta': None,
        'attr_delta': None
    }
    
    insert_req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/adventure_log",
        data=json.dumps(payload).encode(),
        headers={
            'apikey': SUPA_SRV,
            'Authorization': f'Bearer {SUPA_SRV}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        method='POST'
    )
    urllib.request.urlopen(insert_req)
    print(f"  ✓ 写入 adventure_log: {summary[:60]}...")

def main():
    # 默认昨天（因为 cron 在 23:30 跑，当天还没结束；或者今天 00:01 跑昨天）
    if len(sys.argv) > 1 and sys.argv[1].startswith('--date'):
        date_str = sys.argv[2] if len(sys.argv) > 2 else sys.argv[1].split('=')[1]
    else:
        # 默认今天（如果是 23:30 跑就是今天，如果是次日凌晨跑就传 --date 昨天）
        date_str = datetime.date.today().isoformat()
    
    print(f"[TG Summary] {date_str}")
    
    # 1. 抓消息
    msgs = get_today_tg_messages(date_str)
    print(f"  找到 {len(msgs)} 条 TG user 消息")
    if not msgs:
        print("  无消息，跳过")
        return
    
    # 2. LLM 总结
    summary = summarize_with_llm(msgs, date_str)
    print(f"  总结: {summary}")
    
    # 3. 写 Supabase
    write_to_supabase(date_str, summary)
    print("  ✓ 完成")

if __name__ == '__main__':
    main()
