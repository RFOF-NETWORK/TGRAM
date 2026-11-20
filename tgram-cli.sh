#!/bin/sh
set -e
echo "=== TGRAM AUTONOMOUS & INTERACTIVE CLI ==="
mkdir -p tools
[ -f tools/acton-cli.sh ] && chmod +x tools/acton-cli.sh
[ -f tools/ton-ai-agent-cli.sh ] && chmod +x tools/ton-ai-agent-cli.sh
python3 blockchain-cloud/serverfull-validators/validator-monitor.py
python3 app/copilot/telegram_copilot_bot.py
echo "=== TGRAM CLI STATUS: BEREIT (24/7 CLOUD + LOKAL) ==="
