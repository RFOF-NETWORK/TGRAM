#!/usr/bin/env python3
"""
Parallel-Debug-Listener fuer TonConnect.
Laeuft NEBEN bestehendem Prozess (Port 8765) auf 8766+.
Schreibt nur JSONL-Diagnose, kein .env-Write.
"""
import argparse, http.server, json, os, socketserver, sys, time, urllib.parse

LOG_DIR = os.environ.get("DEBUG_LOG_DIR") or os.path.expanduser(
    "~/storage/shared/InterBOxSpiderWeb/mein-ton-token/TGRAM/debug"
)
os.makedirs(LOG_DIR, exist_ok=True)

class ReuseServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True

class DebugHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _log(self, entry):
        p = os.path.join(LOG_DIR, f"tonconnect_{time.strftime('%Y%m%d')}.jsonl")
        with open(p, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        self._log({
            "ts": time.time(),
            "client": self.client_address[0],
            "path": u.path,
            "query": q,
            "headers": dict(self.headers),
        })
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(
            {"ok": True, "debug": True, "addr": q.get("address", [""])[0]}
        ).encode())

def serve(host, ports):
    for p in ports:
        try:
            srv = ReuseServer((host, p), DebugHandler)
            print(f"[debug] lauscht auf http://{host}:{p}", flush=True)
            srv.serve_forever()
        except OSError as e:
            print(f"[debug] Port {p} belegt ({e}), naechster...", file=sys.stderr, flush=True)
    raise SystemExit("[debug] kein freier Port")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--ports", nargs="+", type=int, default=list(range(8766, 8776)))
    a = ap.parse_args()
    print(f"[debug] Logs: {LOG_DIR}", flush=True)
    serve(a.host, a.ports)
