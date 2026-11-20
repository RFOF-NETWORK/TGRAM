import os

def load_env(path):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

def status():
    load_env(os.path.expanduser("~/storage/shared/InterBOxSpiderWeb/mein-ton-token/TGRAM/.env"))
    pub_key = os.getenv("WIREGUARD_PUBLIC_KEY", "")
    address = os.getenv("WIREGUARD_ADDRESSES", "")
    dns = os.getenv("WIREGUARD_DNS_SERVER", "")
    print("=== PRVPNRFAI Tunnel & Validator Status ===")
    print(f"Public Key : {pub_key[:10] + '...' if pub_key else 'FEHLT'}")
    print(f"Adresse    : {address or 'FEHLT'}")
    print(f"DNS Server : {dns or 'FEHLT'}")

if __name__ == "__main__":
    status()
