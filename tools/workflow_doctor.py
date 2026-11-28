#!/usr/bin/env python3
"""
TGRAM Workflow Doctor (append-only).

Reads the logs of a failed GitHub Actions run, matches them against the
black/white checklist in .github/agent-checklist.json and:
  - keeps every found solution in agent-reports/known-fixes.jsonl (never deletes)
  - writes agent-reports/latest.md (human readable report)
  - auto-applies only WHITELISTED, append-only fixes and never touches BLACKLISTED files

Usage: python tools/workflow_doctor.py --run-id <id>   (needs gh CLI + GH_TOKEN)
       python tools/workflow_doctor.py --log-file failed.log
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

CHECKLIST = ".github/agent-checklist.json"
REPORT_DIR = "agent-reports"
MEMORY_FILE = os.path.join(REPORT_DIR, "known-fixes.jsonl")
LATEST_FILE = os.path.join(REPORT_DIR, "latest.md")


def load_checklist() -> dict:
    with open(CHECKLIST, "r", encoding="utf-8") as f:
        return json.load(f)


def is_blacklisted(path: str, blacklist: list[str]) -> bool:
    norm = path.lstrip("./")
    return any(norm == b or (b.endswith("/") and norm.startswith(b)) for b in blacklist)


def fetch_failed_log(run_id: str) -> str:
    try:
        result = subprocess.run(
            ["gh", "run", "view", run_id, "--log-failed"],
            capture_output=True, text=True, timeout=120, check=False,
        )
        return result.stdout + result.stderr
    except Exception as exc:
        return f"DOCTOR_FETCH_ERROR: {exc}"


def append_line(path: str, line: str) -> bool:
    existing = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
    if line.strip() in {l.strip() for l in existing.splitlines()}:
        return False
    with open(path, "a", encoding="utf-8") as f:
        if existing and not existing.endswith("\n"):
            f.write("\n")
        f.write(line + "\n")
    return True


def try_autofix(fix: dict, match: re.Match, blacklist: list[str], whitelist: list[str]) -> str:
    action = fix.get("fix")
    if action not in whitelist:
        return "skipped (action not whitelisted)"
    if fix["id"] == "module-not-found":
        pkg = match.group(1).split(".")[0]
        target = "requirements.txt"
        if is_blacklisted(target, blacklist):
            return "skipped (blacklisted target)"
        return f"appended {pkg} to {target}" if append_line(target, pkg) else "already present"
    if fix["id"] == "pip-cache-no-requirements" and not os.path.exists("requirements.txt"):
        append_line("requirements.txt", "requests>=2.31")
        append_line("requirements.txt", "python-dotenv>=1.0")
        return "created requirements.txt"
    return "report only (manual/known solution)"


def diagnose(log: str, checklist: dict) -> list[dict]:
    findings = []
    for fix in checklist.get("known_fixes", []):
        m = re.search(fix["pattern"], log, re.IGNORECASE)
        if m:
            result = try_autofix(fix, m, checklist["blacklist_never_touch"], checklist["whitelist_allowed_actions"])
            findings.append({**fix, "evidence": m.group(0)[:200], "autofix": result})
    if not findings and log.strip():
        errors = [l for l in log.splitlines() if "##[error]" in l or "Error" in l][:10]
        findings.append({
            "id": "unknown",
            "diagnosis": "No known pattern matched. Add a new entry to known_fixes once solved.",
            "evidence": "\n".join(errors)[:1500],
            "autofix": "none",
            "status": "open",
        })
    return findings


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--run-id")
    p.add_argument("--log-file")
    p.add_argument("--workflow", default=os.environ.get("FAILED_WORKFLOW", "unknown"))
    args = p.parse_args()

    log = open(args.log_file, encoding="utf-8", errors="ignore").read() if args.log_file else fetch_failed_log(args.run_id or "")
    checklist = load_checklist()
    findings = diagnose(log, checklist)

    os.makedirs(REPORT_DIR, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    for f in findings:
        append_line(MEMORY_FILE, json.dumps({"ts": now, "workflow": args.workflow, "run_id": args.run_id, **f}, ensure_ascii=False))

    lines = [f"# Workflow Doctor Report", "", f"- Workflow: `{args.workflow}`", f"- Run: `{args.run_id}`", f"- Time: {now}", ""]
    for f in findings:
        lines += [
            f"## [{f.get('status', 'open').upper()}] {f['id']}",
            f"- Diagnose: {f.get('diagnosis', '')}",
            f"- Loesung: {f.get('solution', 'offen')}",
            f"- Auto-Fix: {f.get('autofix')}",
            "```", f.get("evidence", ""), "```", "",
        ]
    with open(LATEST_FILE, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
