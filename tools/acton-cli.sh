#!/bin/sh
# Offizieller Acton TON-Compiler & CLI Starter für RFOF-NETWORK/TGRAM
if ! command -v acton >/dev/null 2>&1; then
  curl -LsSf https://github.com | sh
fi
acton "$@"
