import html
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

DB_FILE = os.environ.get("CLOUD_SYNC_DB", "cloud-sync-db.json")
PORT = int(os.environ.get("SPIDER_UI_PORT", "8081"))
OWNER = "satoramy-on.ton"

PAGE = """<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>InterBOxSpiderWeb OS</title>
<style>
body{background:#050505;color:#d1fae5;font-family:monospace;margin:0;padding:16px}
h1{color:#00ffcc;font-size:1.2rem}
.grid{display:flex;flex-wrap:wrap;gap:16px}
.panel{flex:1 1 320px;border:1px solid #1f2937;padding:12px;background:#0d1117;border-radius:8px}
a{color:#00ffcc}
</style></head><body>
<h1>InterBOxSpiderWeb // Master Database UI</h1>
<div class="grid">
<section class="panel"><h2>Cloud Files</h2><ul>__FILES__</ul></section>
<section class="panel"><h2>EU / FinTS</h2><p>ISO 13616 validation ready.</p><p>Zone: EU-DE / EU-FR</p></section>
<section class="panel"><h2>Explorer</h2><ul>
<li><a href="https://tonviewer.com/__OWNER__" target="_blank" rel="noopener">Tonviewer: __OWNER__</a></li>
<li><a href="https://etherscan.io" target="_blank" rel="noopener">Etherscan</a></li>
<li><a href="https://mempool.space" target="_blank" rel="noopener">Mempool (BTC)</a></li>
</ul></section>
</div></body></html>"""


def load_db() -> dict:
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


class SpiderUI(BaseHTTPRequestHandler):
    def _send(self, body: bytes, ctype: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        db = load_db()
        if self.path == "/api/files":
            self._send(json.dumps(db).encode(), "application/json")
            return
        items = "".join(
            f"<li>{html.escape(k)} &rarr; {html.escape(v.get('target', ''))} ({html.escape(v.get('status', ''))})</li>"
            for k, v in db.items()
        ) or "<li>No synced files yet.</li>"
        self._send(PAGE.replace("__FILES__", items).replace("__OWNER__", OWNER).encode(), "text/html; charset=utf-8")


if __name__ == "__main__":
    print(f"[*] InterBOxSpiderWeb UI on http://127.0.0.1:{PORT}")
    HTTPServer(("0.0.0.0", PORT), SpiderUI).serve_forever()
