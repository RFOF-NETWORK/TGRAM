import os
import json
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

STATUS_FILE = "CyberNode-status.json"
EXTENSIONS_FILE = "extensions.json"

def get_data():
    status_data = {}
    ext_data = {}
    if os.path.exists(STATUS_FILE):
        with open(STATUS_FILE, "r", encoding="utf-8") as f:
            status_data = json.load(f)
    if os.path.exists(EXTENSIONS_FILE):
        with open(EXTENSIONS_FILE, "r", encoding="utf-8") as f:
            ext_data = json.load(f)
    return status_data, ext_data

class TgramOSHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()
            
            status, ext = get_data()
            
            # HiveOS-Style HTML UI
            html = """
            <html>
            <head>
                <title>TGRAM Master-OS (HiveOS Style)</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { background: #0b0f17; color: #e2e8f0; font-family: monospace; padding: 1rem; }
                    h1 { color: #38bdf8; }
                    .card { background: #131a29; border: 1px solid #263248; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
                    .ok { color: #4ade80; }
                    .err { color: #ef4444; }
                    .vault { border-bottom: 1px solid #334155; padding: 0.5rem 0; }
                    button { background: #0284c7; color: white; border: none; padding: 0.5rem 1rem; cursor: pointer; border-radius: 5px; margin-top: 10px;}
                </style>
            </head>
            <body>
                <h1>🖥️ TGRAM Master-OS Dashboard</h1>
                
                <div class="card">
                    <h3>🤖 AI & API Verbindungen</h3>
                    <p>Gemini / AI Studio: <span class="%s">%s</span></p>
                    <p>Telegram Bot: <span class="%s">%s</span></p>
                </div>
                
                <div class="card">
                    <h3>🏦 Deine Vaults & Extensions</h3>
            """ % (
                "ok" if status.get("private_connections", {}).get("google_ai_combined", {}).get("gemini", {}).get("connected") else "err", 
                "VERBUNDEN" if status.get("private_connections", {}).get("google_ai_combined", {}).get("gemini", {}).get("connected") else "FEHLER",
                "ok" if status.get("private_connections", {}).get("telegram_bot", {}).get("connected") else "err",
                "VERBUNDEN" if status.get("private_connections", {}).get("telegram_bot", {}).get("connected") else "FEHLER"
            )

            vaults = ext.get("extensions", {}).get("vaults", [])
            if not vaults:
                html += "<p>Keine Vaults gefunden.</p>"
            for v in vaults:
                html += f"<div class='vault'><strong>{v.get('id')}</strong> ({v.get('type')})<br>"
                html += f"Status: {v.get('onchain_status', 'unbekannt')} | Balance: {v.get('balance_ton', 0)} TON</div>"

            html += """
                </div>
                <div class="card">
                    <h3>🛠️ System-Aktionen</h3>
                    <button onclick="fetch('/heal').then(()=>alert('Auto-Heal gestartet!'))">Auto-Heal ausführen</button>
                    <button onclick="fetch('/audit').then(()=>alert('Audit gestartet!'))">Neues Audit starten</button>
                </div>
            </body>
            </html>
            """
            self.wfile.write(html.encode('utf-8'))
            
        elif self.path == '/heal':
            self.send_response(200)
            self.end_headers()
            subprocess.Popen(["python", "auto_heal_env.py"])
            self.wfile.write(b"Auto-Heal gestartet")
            
        elif self.path == '/audit':
            self.send_response(200)
            self.end_headers()
            subprocess.Popen(["python", "gemini_private_scan.py"])
            self.wfile.write(b"Audit gestartet")

if __name__ == '__main__':
    print("[*] Starte TGRAM Master-OS auf http://127.0.0.1:8080")
    server = HTTPServer(('0.0.0.0', 8080), TgramOSHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    os._exit(0)
