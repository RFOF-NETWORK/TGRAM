#!/bin/sh
set -e
echo "=== TGRAM 24/7 AUTONOMOUS & SEMI-AUTONOMOUS CLI ==="
python3 blockchain-cloud/serverfull-validators/validator-monitor.py
python3 app/copilot/telegram_copilot_bot.py
echo "=== TGRAM CLI STATUS: AKTIV ==="
