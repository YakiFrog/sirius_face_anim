#!/bin/bash

# VOICEVOX + フェイスアニメーションシステム起動スクリプト
# 使用方法: ./start_system.sh

# 色付きログ用の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ログ関数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"  # pythonディレクトリがプロジェクトルート

log_info "🚀 VOICEVOX + フェイスアニメーションシステム起動中..."
log_debug "スクリプトディレクトリ: $SCRIPT_DIR"
log_debug "プロジェクトルート: $PROJECT_ROOT"

# 仮想環境のアクティベート
VENV_PATH="$PROJECT_ROOT/bin/activate"
if [ -f "$VENV_PATH" ]; then
    log_info "🐍 Python仮想環境をアクティベート: $VENV_PATH"
    source "$VENV_PATH"
else
    log_error "❌ 仮想環境が見つかりません: $VENV_PATH"
    log_error "以下のコマンドで仮想環境を作成してください:"
    log_error "  cd $PROJECT_ROOT"
    log_error "  python3 -m venv ."
    log_error "  source bin/activate"
    log_error "  pip install -r requirements.txt"
    exit 1
fi

# 必要なファイルの存在確認
log_info "📋 必要なファイルの存在確認..."

# Pythonスクリプト
MAIN_PY="$SCRIPT_DIR/main.py"
VOICEVOX_PY="$SCRIPT_DIR/voicevox_lipsync.py"
AUDIOQUERY_PY="$SCRIPT_DIR/audioquery_phoneme.py"

for file in "$MAIN_PY" "$VOICEVOX_PY" "$AUDIOQUERY_PY"; do
    if [ ! -f "$file" ]; then
        log_error "❌ 必要なファイルが見つかりません: $file"
        exit 1
    fi
    log_debug "✅ $file"
done

# VOICEVOXコアファイル
VOICEVOX_CORE_DIR="$SCRIPT_DIR/voicevox_core"
if [ ! -d "$VOICEVOX_CORE_DIR" ]; then
    log_error "❌ VOICEVOXコアディレクトリが見つかりません: $VOICEVOX_CORE_DIR"
    exit 1
fi

# プロセス管理用のPIDファイル
PID_DIR="$SCRIPT_DIR/pids"
mkdir -p "$PID_DIR"

# 既存プロセスの終了
log_info "🛑 既存プロセスの確認と終了..."
if [ -f "$PID_DIR/main.pid" ]; then
    MAIN_PID=$(cat "$PID_DIR/main.pid")
    if kill -0 "$MAIN_PID" 2>/dev/null; then
        log_warn "main.py (PID: $MAIN_PID) を終了中..."
        kill "$MAIN_PID"
        sleep 2
    fi
    rm -f "$PID_DIR/main.pid"
fi

if [ -f "$PID_DIR/audioquery.pid" ]; then
    AUDIOQUERY_PID=$(cat "$PID_DIR/audioquery.pid")
    if kill -0 "$AUDIOQUERY_PID" 2>/dev/null; then
        log_warn "audioquery_phoneme.py (PID: $AUDIOQUERY_PID) を終了中..."
        kill "$AUDIOQUERY_PID"
        sleep 2
    fi
    rm -f "$PID_DIR/audioquery.pid"
fi

# システム情報表示
log_info "🖥️  システム情報:"
echo "  プラットフォーム: $(uname -s) $(uname -m)"
echo "  Python: $(python3 --version)"
echo "  作業ディレクトリ: $(pwd)"

# 1. フェイスアニメーションサーバー起動
log_info "🎭 フェイスアニメーションサーバー起動中..."
cd "$SCRIPT_DIR"
python3 "$MAIN_PY" > "$PID_DIR/main.log" 2>&1 &
MAIN_PID=$!
echo "$MAIN_PID" > "$PID_DIR/main.pid"
log_info "✅ main.py 起動完了 (PID: $MAIN_PID)"

# サーバーの起動を待機
log_info "⏳ フェイスアニメーションサーバーの起動を待機中..."
for i in {1..10}; do
    if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
        log_info "✅ フェイスアニメーションサーバー準備完了"
        break
    fi
    if [ $i -eq 10 ]; then
        log_error "❌ フェイスアニメーションサーバーの起動に失敗しました"
        log_error "ログを確認してください: $PID_DIR/main.log"
        exit 1
    fi
    sleep 1
done

# 2. AudioQuery音素解析サーバー起動（オプション）
if [ -f "$AUDIOQUERY_PY" ]; then
    log_info "🎵 AudioQuery音素解析サーバー起動中..."
    python3 "$AUDIOQUERY_PY" > "$PID_DIR/audioquery.log" 2>&1 &
    AUDIOQUERY_PID=$!
    echo "$AUDIOQUERY_PID" > "$PID_DIR/audioquery.pid"
    log_info "✅ audioquery_phoneme.py 起動完了 (PID: $AUDIOQUERY_PID)"
    
    # AudioQueryサーバーの起動を待機
    log_info "⏳ AudioQueryサーバーの起動を待機中..."
    for i in {1..10}; do
        if curl -s http://localhost:8081/health > /dev/null 2>&1; then
            log_info "✅ AudioQueryサーバー準備完了"
            break
        fi
        if [ $i -eq 10 ]; then
            log_warn "⚠️ AudioQueryサーバーの起動に時間がかかっています"
            break
        fi
        sleep 1
    done
else
    log_warn "⚠️ audioquery_phoneme.py が見つかりません。スキップします。"
fi

# システム起動完了
log_info "🎉 システム起動完了！"
echo ""
echo -e "${CYAN}=== 利用可能なサービス ===${NC}"
echo "🎭 フェイスアニメーションAPI: http://localhost:8080"
echo "   - GET  /status            : 現在の状態"
echo "   - POST /expression        : 表情設定"
echo "   - POST /talking_mouth_mode: おしゃべりモード"
echo ""
if [ -f "$PID_DIR/audioquery.pid" ]; then
    echo "🎵 AudioQuery音素解析API: http://localhost:8081"
    echo "   - POST /audio_query_phonome: 音素解析"
    echo ""
fi
echo -e "${CYAN}=== VOICEVOX音声合成 ===${NC}"
echo "🤖 VOICEVOXシステム:"
echo "   対話モード: python3 voicevox_lipsync.py"
echo "   単発発話  : python3 voicevox_lipsync.py --text '発話したいテキスト'"
echo ""
echo -e "${CYAN}=== 手動制御 ===${NC}"
echo "フェイスアニメーションサーバーのコンソールで以下のキーが利用可能:"
echo "  D: おしゃべりモード切り替え"
echo "  1-9,0: 表情変更"
echo "  Z,X,C: 口パターン (あ,い,お)"
echo "  A: 全表情デモ"
echo "  S: 状態表示"
echo "  Q: 終了"
echo ""
echo -e "${CYAN}=== ログファイル ===${NC}"
echo "📄 main.py ログ: $PID_DIR/main.log"
if [ -f "$PID_DIR/audioquery.pid" ]; then
    echo "📄 audioquery ログ: $PID_DIR/audioquery.log"
fi
echo ""
echo -e "${YELLOW}システム終了は './stop_system.sh' または Ctrl+C${NC}"

# シグナルハンドラー設定（Ctrl+C対応）
cleanup() {
    log_info ""
    log_warn "🛑 システム終了シグナルを受信しました"
    
    # プロセス終了
    if [ -f "$PID_DIR/main.pid" ]; then
        MAIN_PID=$(cat "$PID_DIR/main.pid")
        if kill -0 "$MAIN_PID" 2>/dev/null; then
            log_info "main.py (PID: $MAIN_PID) を終了中..."
            kill "$MAIN_PID"
        fi
        rm -f "$PID_DIR/main.pid"
    fi
    
    if [ -f "$PID_DIR/audioquery.pid" ]; then
        AUDIOQUERY_PID=$(cat "$PID_DIR/audioquery.pid")
        if kill -0 "$AUDIOQUERY_PID" 2>/dev/null; then
            log_info "audioquery_phoneme.py (PID: $AUDIOQUERY_PID) を終了中..."
            kill "$AUDIOQUERY_PID"
        fi
        rm -f "$PID_DIR/audioquery.pid"
    fi
    
    log_info "👋 システム終了完了"
    exit 0
}

trap cleanup SIGINT SIGTERM

# フォアグラウンドで実行継続（ログ監視）
log_info "📊 システム監視中... (Ctrl+C で終了)"

# ログの tail表示（オプション）
if command -v tail > /dev/null 2>&1; then
    echo ""
    echo -e "${BLUE}=== リアルタイムログ (最新10行) ===${NC}"
    tail -f "$PID_DIR/main.log" &
    TAIL_PID=$!
    
    # cleanup時にtailも終了
    original_cleanup() {
        kill $TAIL_PID 2>/dev/null
        cleanup
    }
    trap original_cleanup SIGINT SIGTERM
fi

# メインプロセスの監視
while true; do
    if [ -f "$PID_DIR/main.pid" ]; then
        MAIN_PID=$(cat "$PID_DIR/main.pid")
        if ! kill -0 "$MAIN_PID" 2>/dev/null; then
            log_error "❌ main.py プロセスが予期せず終了しました"
            log_error "ログを確認してください: $PID_DIR/main.log"
            break
        fi
    else
        log_error "❌ main.py PIDファイルが見つかりません"
        break
    fi
    
    sleep 5
done

cleanup
