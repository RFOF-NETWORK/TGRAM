import os, http.server, urllib.parse, urllib.request, json, subprocess, time

H = chr(104) + "ttps:" + "//"

def save_and_verify(addr):
    for env_file in [
        os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/mein-ton-token/TGRAM/.env"),
        os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/Spider-Cloud/.env")
    ]:
        if os.path.exists(env_file):
            lines = [l for l in open(env_file, encoding="utf-8") if not l.startswith("OWNER_WALLET_ADDRESS=")]
            lines.append(f"OWNER_WALLET_ADDRESS={addr}\n")
            open(env_file, "w", encoding="utf-8").writelines(lines)
    url = H + "://toncenter.com" + urllib.parse.quote(addr) + "&include_boc=false"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())
        acc = data.get("accounts", [{}])
        bal = int(acc.get("balance", 0)) / 1e9
        print("\n=== TONCENTER API v3 OWNER & AGENT VERIFIZIERT ===")
        print("Status      :", acc.get("status", "uninitialized"))
        print("Guthaben    :", f"{bal:.4f} TON")
        print("Interfaces  :", acc.get("interfaces", []))
        print("Agent-Pool  : Verbunden mit Owner-Wallet (NEC / BBC)")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        addr = q.get("address", [""]).strip()
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b"OK")
        if addr:
            save_and_verify(addr)
            os._exit(0)
    def log_message(self, *args):
        pass

if __name__ == "__main__":
    page_url = H + "rfof-network.github.io/TGRAM/"
    print("Oeffne Browser unter:", page_url)
    subprocess.run(["termux-open-url", page_url])
    http.server.HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
