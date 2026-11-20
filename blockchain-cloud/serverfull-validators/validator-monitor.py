import os
import urllib.request
import json

def check_masterchain():
    url = "https://toncenter.com"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            seqno = data.get("result", {}).get("last", {}).get("seqno")
            print(f"TON Masterchain online | Aktueller Block (seqno): {seqno}")
    except Exception as e:
        print(f"Validator/RPC Check fehlgeschlagen: {e}")

if __name__ == "__main__":
    check_masterchain()
