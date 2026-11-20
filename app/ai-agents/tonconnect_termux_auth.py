import os, http.server, urllib.parse, subprocess

H = chr(104) + "ttps:" + "//"

def save_addr(addr):
    for env_file in [
        os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/mein-ton-token/TGRAM/.env"),
        os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/Spider-Cloud/.env")
    ]:
        if not os.path.exists(env_file):
            continue
        lines = open(env_file, encoding="utf-8").readlines()
        found = False
        out = []
        for l in lines:
            if l.startswith("OWNER_WALLET_ADDRESS="):
                out.append(f"OWNER_WALLET_ADDRESS={addr}\n")
                found = True
            else:
                out.append(l)
        if not found:
            out.append(f"OWNER_WALLET_ADDRESS={addr}\n")
        open(env_file, "w", encoding="utf-8").writelines(out)

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        addr = q.get("address", [""])[0].strip()
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b"OK")
        if addr:
            save_addr(addr)
            print("\n[OK] Tonkeeper-Wallet automatisch via TonConnect verknuepft!")
            subprocess.run(["python3", os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/mein-ton-token/TGRAM/app/ai-agents/check_owner_wallet.py")])
            os._exit(0)
    def log_message(self, *args):
        pass

if __name__ == "__main__":
    url = H + "rfof-network.github.io/TGRAM/"
    print("Oeffne Browser & warte auf Tonkeeper-Bestaetigung:", url)
    subprocess.run(["termux-open-url", url])
    http.server.HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
