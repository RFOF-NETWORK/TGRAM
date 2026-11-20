import os
import subprocess
import urllib.request
import urllib.error
import json

P = chr(104) + "ttps://"

def load_env(path):
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

def ask_free_copilot(prompt_text):
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    if gemini_key:
        url = P + f"://googleapis.com{gemini_key}"
        payload = json.dumps({"contents": [{"parts": [{"text": prompt_text}]}]}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            return data["candidates"]["content"]["parts"]["text"]

    token = os.getenv("GITHUB_MODELS_TOKEN", "").strip() or subprocess.getoutput("gh auth token").strip()
    url = P + "models.github.ai/inference/chat/completions"
    payload = json.dumps({
        "model": "openai/gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "Du bist der TGRAM Copilot für TON, NEC, BBC, DEX, Launchpad und Wallet-Sicherheit."},
            {"role": "user", "content": prompt_text}
        ]
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode()
            if not raw.strip():
                return f"Leere Antwort (HTTP {resp.status}) – bitte GITHUB_MODELS_TOKEN oder GEMINI_API_KEY in .env setzen."
            data = json.loads(raw)
            return data["choices"]["message"]["content"]
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}: {e.read().decode(errors='ignore')}"
    except Exception as e:
        return f"TGRAM Copilot Hinweis: {e}"

if __name__ == "__main__":
    load_env(os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/mein-ton-token/TGRAM/.env"))
    print("TGRAM Free Copilot Test:", ask_free_copilot("Bestätige kurz, dass TGRAM Copilot für TON, NEC und BBC bereit ist."))
