#!/bin/bash

# Telegram Integration Checkpoint Script
# Runs integration test for Phase 3 completion

set -e

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  INTEGRATION CHECKPOINT - Phase 3: Telegram           ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Run this script from the project root"
  exit 1
fi

# Check for bot token
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "❌ ERROR: TELEGRAM_BOT_TOKEN not set"
  echo ""
  echo "Чтобы запустить Telegram checkpoint:"
  echo "1. Получите токен от @BotFather в Telegram"
  echo "2. Установите переменную окружения:"
  echo "   export TELEGRAM_BOT_TOKEN=\"your_token_here\""
  echo "3. Запустите checkpoint снова:"
  echo "   ./scripts/telegram-checkpoint.sh"
  echo ""
  echo "Для тестирования БЕЗ реального бота:"
  echo "   npm run checkpoint  # Phase 2 checkpoint (mock mode)"
  echo ""
  exit 1
fi

echo "Step 1: Building TypeScript..."
npx tsc src/telegram-checkpoint.ts --outDir dist --moduleResolution node --module commonjs --target es2020 --esModuleInterop --resolveJsonModule

echo ""
echo "Step 2: Running Telegram checkpoint..."
echo ""
echo "⚠️  Бот будет работать до Ctrl+C"
echo ""

node dist/telegram-checkpoint.js

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  ✅ CHECKPOINT COMPLETED                               ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
