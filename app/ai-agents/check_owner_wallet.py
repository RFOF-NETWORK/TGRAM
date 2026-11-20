import os
import urllib.request
import json
def check_owner_and_agents(owner_address):
if not owner_address:
print("HINWEIS: Bitte trage deine TON Owner-Adresse in TGRAM/.env als OWNER_WALLET_ADDRESS=... ein.")
return
url = f"toncenter.com{owner_address}"
try:
with urllib.request.urlopen(url, timeout=10) as resp:
data = json.loads(resp.read().decode())
if data.get("ok"):
res = data["result"]
bal_ton = int(res.get("balance", 0)) / 1e9
state = res.get("state", "uninitialized")
print("=== TGRAM OWNER-WALLET & AGENT VERIFIZIERUNG ===")
print(f"Owner-Adresse  : {owner_address}")
print(f"On-Chain Status: {state}")
print(f"Guthaben       : {bal_ton:.4f} TON")
print("Agent-Status   : Bereit für Perpetual-Futures Sub-Wallets (NEC / BBC Arbitrage-Pool)")
else:
print("Adresse auf TON nicht gefunden:", data)
except Exception as e:
print("Abfragefehler:", e)
if name == "main":
env_path = os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/mein-ton-token/TGRAM/.env")
owner = os.getenv("OWNER_WALLET_ADDRESS", "")
if not owner and os.path.exists(env_path):
for line in open(env_path):
if line.startswith("OWNER_WALLET_ADDRESS="):
owner = line.split("=", 1).strip()
check_owner_and_agents(owner)
