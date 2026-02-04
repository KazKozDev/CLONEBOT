#!/bin/bash

# CLONEBOT Development Startup Script
# Запускает Web UI сервер (бэкенд + фронтенд в одном процессе)

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starting CLONEBOT development environment..."
echo ""

# Проверяем что мы в правильной директории
if [ ! -f "$PROJECT_DIR/package.json" ]; then
    echo "❌ Error: package.json not found in $PROJECT_DIR"
    exit 1
fi

# Проверяем наличие static файлов
if [ ! -f "$PROJECT_DIR/web/static/index.html" ]; then
    echo "❌ Error: web/static/index.html not found"
    echo "   Run: cp -r art/web/static/* web/static/"
    exit 1
fi

# Параметры по умолчанию
WEB_PORT="${WEB_PORT:-3001}"
WEB_HOST="${WEB_HOST:-127.0.0.1}"
DATA_DIR="${DATA_DIR:-./data}"

# Проверяем что Ollama запущен
if ! curl -s "http://localhost:11434/api/tags" > /dev/null 2>&1; then
    echo "⚠️  Warning: Ollama not running on localhost:11434"
    echo "   Start Ollama first: ollama serve"
    echo ""
fi

# Функция для освобождения порта
kill_port() {
    local PORT=$1
    local PID=$(lsof -ti :$PORT 2>/dev/null)
    if [ -n "$PID" ]; then
        echo "🔪 Killing process on port $PORT (PID: $PID)..."
        kill -9 $PID 2>/dev/null
        sleep 0.5
    fi
}

# Освобождаем порт перед запуском
echo "🧹 Cleaning up port $WEB_PORT..."
kill_port $WEB_PORT

# Функция для запуска в новой вкладке Terminal (macOS)
open_in_new_tab() {
    osascript <<EOF
tell application "Terminal"
    activate
    tell application "System Events" to keystroke "t" using command down
    delay 0.5
    do script "cd \"$1\" && $2" in front window
end tell
EOF
}

# Проверяем ОС
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "📱 Detected macOS"
    
    if [ "$1" == "--new-tab" ]; then
        # Запускаем в новой вкладке Terminal
        echo "🌐 Starting Web UI in new Terminal tab..."
        open_in_new_tab "$PROJECT_DIR" "WEB_PORT=$WEB_PORT WEB_HOST=$WEB_HOST DATA_DIR=$DATA_DIR npm run web"
        
        echo ""
        echo "✅ Server starting in new Terminal tab"
        echo ""
        echo "🌐 Web UI: http://localhost:$WEB_PORT"
        echo ""
        echo "To stop: close the Terminal tab or press Ctrl+C"
    else
        # Запускаем в текущем терминале
        echo "🌐 Starting Web UI on http://localhost:$WEB_PORT..."
        echo ""
        
        cd "$PROJECT_DIR"
        WEB_PORT=$WEB_PORT WEB_HOST=$WEB_HOST DATA_DIR=$DATA_DIR npm run web
    fi
    
elif command -v tmux &> /dev/null && [ "$1" == "--tmux" ]; then
    echo "📺 Using tmux"
    
    SESSION="clonebot-dev"
    tmux kill-session -t $SESSION 2>/dev/null
    
    tmux new-session -d -s $SESSION -c "$PROJECT_DIR" \
        "WEB_PORT=$WEB_PORT WEB_HOST=$WEB_HOST DATA_DIR=$DATA_DIR npm run web"
    
    echo ""
    echo "✅ Server started in tmux session: $SESSION"
    echo ""
    echo "🌐 Web UI: http://localhost:$WEB_PORT"
    echo ""
    echo "Commands:"
    echo "  tmux attach -t $SESSION      - attach to session"
    echo "  Ctrl+B then D                - detach from session"
    echo "  tmux kill-session -t $SESSION - stop server"
    echo ""
    
    tmux attach -t $SESSION
    
else
    # Запускаем в текущем терминале (по умолчанию)
    echo "🌐 Starting Web UI on http://localhost:$WEB_PORT..."
    echo ""
    
    cd "$PROJECT_DIR"
    WEB_PORT=$WEB_PORT WEB_HOST=$WEB_HOST DATA_DIR=$DATA_DIR npm run web
fi
