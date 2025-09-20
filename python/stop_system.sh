#!/bin/bash

# VOICEVOX + フェイスアニメーションシステム停止スクリプト
# 使用方法: ./stop_system.sh

# 色付きログ用の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/pids"

log_info "🛑 VOICEVOX + フェイスアニメーションシステム停止中..."

# プロセス終了関数
stop_process() {
    local name=$1
    local pid_file=$2
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "$name (PID: $pid) を終了中..."
            kill "$pid"
            
            # プロセス終了を待機（最大10秒）
            for i in {1..10}; do
                if ! kill -0 "$pid" 2>/dev/null; then
                    log_info "✅ $name 終了完了"
                    break
                fi
                if [ $i -eq 10]; then
                    log_warn "⚠️ $name が応答しません。強制終了します..."
                    kill -9 "$pid" 2>/dev/null
                fi
                sleep 1
            done
        else
            log_warn "$name のプロセスは既に終了しています"
        fi
        rm -f "$pid_file"
    else
        log_warn "$name のPIDファイルが見つかりません: $pid_file"
    fi
}

# 各プロセスを停止
stop_process "main.py" "$PID_DIR/main.pid"
stop_process "audioquery_phonome.py" "$PID_DIR/audioquery.pid"

# ポート確認と強制終了
log_info "🔍 ポート使用状況を確認中..."

# ポート8080のプロセスを確認
PORT_8080_PID=$(lsof -ti:8080 2>/dev/null)
if [ -n "$PORT_8080_PID" ]; then
    log_warn "ポート8080が使用中です (PID: $PORT_8080_PID)"
    kill -9 "$PORT_8080_PID" 2>/dev/null
    log_info "ポート8080のプロセスを強制終了しました"
fi

# ポート8081のプロセスを確認
PORT_8081_PID=$(lsof -ti:8081 2>/dev/null)
if [ -n "$PORT_8081_PID" ]; then
    log_warn "ポート8081が使用中です (PID: $PORT_8081_PID)"
    kill -9 "$PORT_8081_PID" 2>/dev/null
    log_info "ポート8081のプロセスを強制終了しました"
fi

# PIDディレクトリのクリーンアップ
if [ -d "$PID_DIR" ]; then
    rm -f "$PID_DIR"/*.pid
    log_info "🧹 PIDファイルをクリーンアップしました"
fi

log_info "✅ システム停止完了"
