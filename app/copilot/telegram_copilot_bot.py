import os
import subprocess
import urllib.request
import json

def load_env(path):
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

def ask_free_copilot(prompt_text):
    gh_token = subprocess.getoutput("gh auth token").strip()
    url = "https://github.ai"
    payload = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "Du bist der TGRAM Copilot für TON, NEC, BBC, DEX, Launchpad und Wallet-Sicherheit."},
            {"role": "user", "content": prompt_text}
        ]
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Bearer {gh_token}",
        "Content-Type": "application/json"
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"TGRAM Copilot Hinweis: {e}"

if __name__ == "__main__":
    load_env(os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/mein-ton-token/TGRAM/.env"))
    print("TGRAM Free Copilot Test:", ask_free_copilot("Bestätige kurz, dass TGRAM Copilot für TON, NEC und BBC bereit ist."))
