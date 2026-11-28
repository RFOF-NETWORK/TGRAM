import os

import requests

EXPLORERS = {
    "TON": "https://tonviewer.com/{address}",
    "ETH": "https://etherscan.io/address/{address}",
    "SEPOLIA": "https://sepolia.etherscan.io/address/{address}",
    "BTC": "https://mempool.space/address/{address}",
}


def get_wallet_explorer_url(chain: str, address: str) -> str:
    template = EXPLORERS.get(chain.upper())
    return template.format(address=address) if template else ""


def check_evm_balance(rpc_url: str, wallet_address: str) -> dict:
    payload = {"jsonrpc": "2.0", "method": "eth_getBalance", "params": [wallet_address, "latest"], "id": 1}
    try:
        r = requests.post(rpc_url, json=payload, timeout=10).json()
        if "result" in r:
            return {"status": "success", "balance_eth": int(r["result"], 16) / 1e18}
        return {"status": "error", "error": r.get("error")}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


def check_ton_balance(address: str) -> dict:
    headers = {"Authorization": f"Bearer {os.environ['TONAPI_KEY']}"} if os.environ.get("TONAPI_KEY") else {}
    try:
        acc = requests.get(f"https://tonapi.io/v2/accounts/{address}", headers=headers, timeout=10).json()
        return {"status": acc.get("status", "unknown"), "balance_ton": int(acc.get("balance", 0)) / 1e9}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


if __name__ == "__main__":
    print("[*] Multichain Explorer & RPC Wrapper ready.")
    print(get_wallet_explorer_url("TON", "satoramy-on.ton"))
