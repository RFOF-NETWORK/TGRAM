import json
import os
import shutil
import sys
from datetime import datetime, timezone

CLOUDS = {
    "Spider-Cloud": "Spider-Cloud/storage",
    "cloud-storage": "mein-ton-token/cloud-storage/storage",
    "blockchain-cloud": "mein-ton-token/TGRAM/blockchain-cloud/storage",
}
CLOUD_ROOT = os.environ.get("SPIDER_CLOUD_ROOT", os.path.expanduser("~/storage/shared/InterBOxSpiderWeb"))
DB_FILE = os.environ.get("CLOUD_SYNC_DB", "cloud-sync-db.json")
ROUTING = {"blockchain": "blockchain-cloud", "config": "Spider-Cloud"}


def cloud_path(name: str) -> str:
    return os.path.join(CLOUD_ROOT, CLOUDS[name])


def ensure_dirs() -> None:
    for name in CLOUDS:
        os.makedirs(cloud_path(name), exist_ok=True)


def load_db() -> dict:
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def sync_file(source_path: str, file_type: str = "digital") -> dict | None:
    if not os.path.isfile(source_path):
        print(f"[!] Not found: {source_path}")
        return None
    target_dir = cloud_path(ROUTING.get(file_type, "cloud-storage"))
    target = os.path.join(target_dir, os.path.basename(source_path))
    shutil.copy2(source_path, target)

    db = load_db()
    entry = {
        "source": source_path,
        "target": target,
        "type": file_type,
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "status": "synced",
    }
    db[os.path.basename(source_path)] = entry
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)
    print(f"[+] Synced {source_path} -> {target}")
    return entry


if __name__ == "__main__":
    ensure_dirs()
    if len(sys.argv) >= 2:
        sync_file(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "digital")
    else:
        print("Usage: python cloud_sync.py <file> [digital|blockchain|config]")
