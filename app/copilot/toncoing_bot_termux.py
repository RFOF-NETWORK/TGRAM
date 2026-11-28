"""@toncoing_bot Termux agent (parallel to the Vercel webhook).

Runs as the second agent: polls Telegram ONLY when no webhook is set (Telegram allows
one mode at a time) and otherwise acts as an agent-to-agent client of the Vercel
TGRAM Copilot (/api/copilot), so credits and pricing stay identical everywhere.

    pkg install python && python app/copilot/toncoing_bot_termux.py
Env: TELEGRAM_BOT_TOKEN (required), TGRAM_API (default https://tgram-tau.vercel.app)
"""
import json
import os
import time
import urllib.request

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
API = os.getenv("TGRAM_API", "https://tgram-tau.vercel.app").rstrip("/")
TG = f"https://api.telegram.org/bot{TOKEN}"


def http(url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode() or "{}")


def copilot(subject, prompt):
    return http(f"{API}/api/copilot", {"subject": subject, "prompt": prompt, "kind": "ai"})


def webhook_active():
    info = http(f"{TG}/getWebhookInfo").get("result", {})
    return bool(info.get("url"))


def handle(msg):
    chat = msg["chat"]["id"]
    uid = str(msg.get("from", {}).get("id", chat))
    text = (msg.get("text") or "").strip()
    if not text or text.startswith("/start") or text.startswith("/help"):
        out = "TGRAM Termux Agent: Schreibe eine Frage. Jede KI-Antwort kostet Credits (/buy im Bot)."
    else:
        prompt = text[4:].strip() if text.startswith("/ask") else text
        r = copilot(uid, prompt)
        if r.get("error") == "insufficient_credits":
            out = f"Nicht genug Credits. Aufladen mit Kommentar TGRAM:{uid}\n{r.get('pay') or ''}"
        else:
            out = f"{r.get('answer', r)}\n\n(Rest {r.get('available')} Credits)"
    http(f"{TG}/sendMessage", {"chat_id": chat, "text": out})


def main():
    if not TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN fehlt")
    offset = 0
    while True:
        if webhook_active():
            print("[TGRAM] Vercel-Webhook aktiv - Termux-Agent im Standby (Agent-to-Agent ueber /api/copilot).")
            time.sleep(300)
            continue
        res = http(f"{TG}/getUpdates?timeout=50&offset={offset}")
        for upd in res.get("result", []):
            offset = upd["update_id"] + 1
            if "message" in upd:
                handle(upd["message"])


if __name__ == "__main__":
    main()
