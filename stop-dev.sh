#!/bin/bash

# CLONEBOT Development Stop Script
# Останавливает Web UI сервер

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🛑 Stopping CLONEBOT development server..."

# Останавливаем tmux сессию если существует
if command -v tmux &> /dev/null; then
    if tmux has-session -t clonebot-dev 2>/dev/null; then
        echo "📺 Killing tmux session..."
        tmux kill-session -t clonebot-dev
        echo "✅ Tmux session stopped"
    fi
fi

# Останавливаем процессы по PID файлам (legacy)
if [ -f "$PROJECT_DIR/logs/gateway.pid" ]; then
    GATEWAY_PID=$(cat "$PROJECT_DIR/logs/gateway.pid")
    if ps -p $GATEWAY_PID > /dev/null 2>&1; then
        kill $GATEWAY_PID 2>/dev/null
    fi
    rm "$PROJECT_DIR/logs/gateway.pid" 2>/dev/null
fi

if [ -f "$PROJECT_DIR/logs/web.pid" ]; then
    WEB_PID=$(cat "$PROJECT_DIR/logs/web.pid")
    if ps -p $WEB_PID > /dev/null 2>&1; then
        kill $WEB_PID 2>/dev/null
    fi
    rm "$PROJECT_DIR/logs/web.pid" 2>/dev/null
fi

# Убиваем процессы web-ui-server
echo "🧹 Stopping Web UI server processes..."
pkill -f "web-ui-server" 2>/dev/null

# Убиваем процессы на портах (по умолчанию)
for PORT in 3000 3001 3002; do
    PID=$(lsof -ti :$PORT 2>/dev/null)
    if [ -n "$PID" ]; then
        echo "   Stopping process on port $PORT (PID: $PID)"
        kill $PID 2>/dev/null
    fi
done

# Legacy: убиваем старые процессы
pkill -f "start:gateway" 2>/dev/null
pkill -f "next dev" 2>/dev/null

echo ""
echo "✅ Development server stopped"
