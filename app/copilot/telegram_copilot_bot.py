import os, urllib.request, urllib.parse, json

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
            return data["candidates"][0]["content"]["parts"][0]["text"]

    q = urllib.parse.quote("Du bist TGRAM Copilot für TON, NEC und BBC. " + prompt_text)
    url = P + f"text.pollinations.ai/{q}"
    req = urllib.request.Request(url, headers={"User-Agent": "TGRAM-Copilot/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8").strip()

if __name__ == "__main__":
    load_env(os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/mein-ton-token/TGRAM/.env"))
    print("TGRAM Free Copilot Antwort:", ask_free_copilot("Bestätige kurz auf Deutsch, dass TGRAM Copilot für TON, NEC und BBC aktiv ist."))
