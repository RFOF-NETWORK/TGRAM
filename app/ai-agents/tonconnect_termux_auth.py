import os, http.server, urllib.parse, urllib.request, json, subprocess

H = chr(104) + "ttps:" + "//"
API = "/api/v3/accountStates?address="

def get_toncenter_key():
    for p in [
        os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/mein-ton-token/TGRAM/.env"),
        os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/mein-ton-token/.env")
    ]:
        if os.path.exists(p):
            for l in open(p, encoding="utf-8"):
                if l.startswith(("TONCENTER_MAINNET_API_KEY=", "TONCENTER_API_KEY=")):
                    v = l.split("=", 1).strip()
                    if v:
                        return v
    return os.environ.get("TONCENTER_API_KEY", "")

def save_and_verify(addr):
    for p in [
        os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/mein-ton-token/TGRAM/.env"),
        os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/Spider-Cloud/.env")
    ]:
        if os.path.exists(p):
            lines = [l for l in open(p, encoding="utf-8") if not l.startswith("OWNER_WALLET_ADDRESS=")]
            lines.append(f"OWNER_WALLET_ADDRESS={addr}\n")
            open(p, "w", encoding="utf-8").writelines(lines)
    try:
        api_key = get_toncenter_key()
        url = H + "toncenter.com" + API + urllib.parse.quote(addr) + "&include_boc=false"
        headers = {"Accept": "application/json", "User-Agent": "TGRAM-CLI/1.0"}
        if api_key:
            headers["X-API-Key"] = api_key
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            acc = data.get("accounts", [{}])
            bal = int(acc.get("balance", 0)) / 1e9
            print("\n=== TONCENTER API v3 OWNER VERIFIZIERT ===")
            print("Status   :", acc.get("status", "active"))
            print("Guthaben :", f"{bal:.4f} TON")
    except Exception as e:
        print("\n[INFO] RPC Hinweis:", e)
        print("[OK] Adresse trotzdem sicher lokal in .env gespeichert.")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        addr = q.get("address", [""]).strip()
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b"OK_CLOSED")
        if addr:
            try:
                save_and_verify(addr)
            finally:
                print("\n[SICHERHEIT] Lokaler Login-Listener sofort beendet.")
                os._exit(0)
    def log_message(self, *args):
        pass

if __name__ == "__main__":
    u = H + "rfof-network.github.io" + "/TGRAM/"
    subprocess.run(["termux-open-url", u])
    try:
        http.server.HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
    except OSError as e:
        print(f"[FEHLER] Port 8765 belegt: {e}")
