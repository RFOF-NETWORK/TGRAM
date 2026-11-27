import os
import re
import json
import subprocess

TARGET_DIRS = [".", "blockchain-cloud"]
ENV_FILES = [".env", ".env.example", "blockchain-cloud/.env", "blockchain-cloud/.env.example"]

ENV_PATTERNS = [
    r'process\.env\.([A-Z0-9_]+)', r'process\.env\[[\'"]([A-Z0-9_]+)[\'"]\]',
    r'env::var\([\'"]([A-Z0-9_]+)[\'"]\)', r'os\.environ\.get\([\'"]([A-Z0-9_]+)[\'"]',
    r'os\.getenv\([\'"]([A-Z0-9_]+)[\'"]', r'\$\{([A-Z0-9_]+)\}'
]

def find_keys_in_code():
    found_keys = set()
    for target_dir in TARGET_DIRS:
        if not os.path.exists(target_dir): continue
        for root, _, files in os.walk(target_dir):
            if any(ignored in root for ignored in [".git", "node_modules", "target", "build"]): continue
            for file in files:
                if file.endswith((".py", ".ts", ".js", ".rs", ".sh", ".yml", ".yaml")):
                    filepath = os.path.join(root, file)
                    try:
                        with open(filepath, "r", encoding="utf-8") as f:
                            content = f.read()
                            for pattern in ENV_PATTERNS:
                                for match in re.findall(pattern, content): found_keys.add(match)
                    except Exception: pass
    return sorted(list(found_keys))

def get_existing_keys(filepath):
    keys = set()
    if not os.path.exists(filepath): return keys
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                keys.add(line.split("=")[0].strip())
    return keys

def heal_env_file(filepath, required_keys):
    existing_keys = get_existing_keys(filepath)
    missing_keys = [k for k in required_keys if k not in existing_keys]
    if missing_keys:
        print(f"[*] Heile {filepath}: Füge {len(missing_keys)} fehlende Keys hinzu.")
        with open(filepath, "a", encoding="utf-8") as f:
            f.write(f"\n\n# ========================================================\n")
            f.write(f"# AUTO-HEALED BY TGRAM AI AGENT (Found in Code)\n")
            f.write(f"# ========================================================\n")
            for key in missing_keys:
                default_val = ""
                if key == "UBICLOUD_API_TOKEN": default_val = "hier_dein_ubicloud_token_eintragen"
                f.write(f"{key}={default_val}\n")
        return True
    return False

if __name__ == "__main__":
    print("[*] Starte Auto-Heal Scan...")
    required_keys = find_keys_in_code()
    healed_any = False
    for env_file in ENV_FILES:
        if not os.path.exists(env_file):
            os.makedirs(os.path.dirname(env_file) or ".", exist_ok=True)
            open(env_file, "w").close()
        if heal_env_file(env_file, required_keys): healed_any = True
            
    if healed_any:
        print("[OK] Fehlende Keys automatisch hinzugefügt.")
        subprocess.run(["git", "add", ".env", ".env.example", "blockchain-cloud/.env", "blockchain-cloud/.env.example"])
        subprocess.run(["git", "commit", "-m", "Auto-Heal: Added missing env keys found in code"])
        os._exit(0) 
    else:
        print("[OK] Alle Keys vorhanden.")
        os._exit(0)
