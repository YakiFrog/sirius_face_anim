#!/bin/bash

# 簡単起動スクリプト
# 使用方法: ./quick_start.sh [オプション]

# オプション処理
VOICE_ONLY=false
FACE_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --voice-only)
            VOICE_ONLY=true
            shift
            ;;
        --face-only)
            FACE_ONLY=true
            shift
            ;;
        -h|--help)
            echo "使用方法: $0 [オプション]"
            echo "オプション:"
            echo "  --voice-only  音声合成のみ起動"
            echo "  --face-only   フェイスアニメーションのみ起動"
            echo "  -h, --help    ヘルプ表示"
            exit 0
            ;;
        *)
            echo "不明なオプション: $1"
            echo "ヘルプ: $0 --help"
            exit 1
            ;;
    esac
done

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"  # pythonディレクトリがプロジェクトルート

# 仮想環境のアクティベート
source "$PROJECT_ROOT/bin/activate"

if [ "$VOICE_ONLY" = true ]; then
    echo "🎤 音声合成システムのみ起動..."
    cd "$SCRIPT_DIR"
    python3 voicevox_lipsync.py
elif [ "$FACE_ONLY" = true ]; then
    echo "🎭 フェイスアニメーションのみ起動..."
    cd "$SCRIPT_DIR"
    python3 main.py
else
    echo "🚀 フルシステム起動..."
    exec "$SCRIPT_DIR/start_system.sh"
fi
