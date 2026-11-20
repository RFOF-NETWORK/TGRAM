#!/bin/sh
if [ ! -d "$HOME/ton-ai-agent" ]; then
  git clone --depth 1 https://github.com "$HOME/ton-ai-agent" 2>/dev/null || \
  git clone --depth 1 https://github.com "$HOME/ton-ai-agent"
fi
echo "TON AI Agent bereit in $HOME/ton-ai-agent"
