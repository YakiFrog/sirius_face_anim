#!/usr/bin/env python3
"""
HTTP経由で口のパターン（a、i、o）を制御するサーバーの参考実装

使用方法:
1. python3 mouth_pattern_server_example.py でサーバーを起動
2. 以下のAPIエンドポイントが利用可能:
   - GET  /mouth_pattern        - 現在の口パターンを取得
   - POST /mouth_pattern        - 口パターンを設定 (mouth_a, mouth_i, mouth_o)
   - GET  /talking_mouth_mode   - おしゃべりモードの状態を取得  
   - POST /talking_mouth_mode   - おしゃべりモードのオン/オフを設定
   - GET  /expression           - 現在の表情を取得
   - POST /expression           - 表情を設定
   - GET  /display_mode         - 表示モードを取得
   - POST /display_mode         - 表示モードを設定

クライアント側のキー操作:
- Zキー: mouth_a（あ）の口
- Xキー: mouth_i（い）の口  
- Cキー: mouth_o（お）の口
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import time

app = Flask(__name__)
CORS(app)  # CORS設定でブラウザからのアクセスを許可

# グローバル状態
current_mouth_pattern = None  # None, "mouth_a", "mouth_i", "mouth_o"
talking_mouth_mode = False
current_expression = "neutral"
display_mode = "face"

@app.route('/mouth_pattern', methods=['GET'])
def get_mouth_pattern():
    """現在の口パターンを取得"""
    return jsonify({
        'mouth_pattern': current_mouth_pattern,
        'timestamp': time.time()
    })

@app.route('/mouth_pattern', methods=['POST'])
def set_mouth_pattern():
    """口パターンを設定"""
    global current_mouth_pattern
    
    data = request.get_json()
    if not data or 'mouth_pattern' not in data:
        return jsonify({'error': 'mouth_pattern field is required'}), 400
    
    pattern = data['mouth_pattern']
    valid_patterns = ['mouth_a', 'mouth_i', 'mouth_o', None]
    
    if pattern not in valid_patterns:
        return jsonify({
            'error': f'Invalid mouth pattern. Must be one of: {valid_patterns}'
        }), 400
    
    current_mouth_pattern = pattern
    print(f"🗣️  口パターンを {pattern} に設定しました")
    
    return jsonify({
        'mouth_pattern': current_mouth_pattern,
        'message': f'Mouth pattern set to {pattern}',
        'timestamp': time.time()
    })

@app.route('/talking_mouth_mode', methods=['GET'])
def get_talking_mouth_mode():
    """おしゃべりモードの状態を取得"""
    return jsonify({
        'talking_mouth_mode': talking_mouth_mode,
        'timestamp': time.time()
    })

@app.route('/talking_mouth_mode', methods=['POST'])
def set_talking_mouth_mode():
    """おしゃべりモードのオン/オフを設定"""
    global talking_mouth_mode
    
    data = request.get_json()
    if not data or 'talking_mouth_mode' not in data:
        return jsonify({'error': 'talking_mouth_mode field is required'}), 400
    
    talking_mouth_mode = bool(data['talking_mouth_mode'])
    print(f"💬 おしゃべりモードを {'ON' if talking_mouth_mode else 'OFF'} に設定しました")
    
    return jsonify({
        'talking_mouth_mode': talking_mouth_mode,
        'message': f'Talking mouth mode {"enabled" if talking_mouth_mode else "disabled"}',
        'timestamp': time.time()
    })

@app.route('/expression', methods=['GET'])
def get_expression():
    """現在の表情を取得"""
    return jsonify({
        'expression': current_expression,
        'timestamp': time.time()
    })

@app.route('/expression', methods=['POST'])
def set_expression():
    """表情を設定"""
    global current_expression
    
    data = request.get_json()
    if not data or 'expression' not in data:
        return jsonify({'error': 'expression field is required'}), 400
    
    expression = data['expression']
    valid_expressions = [
        'neutral', 'happy', 'angry', 'sad', 'surprised', 
        'crying', 'hurt', 'wink', 'mouth3', 'pien',
        'mouth_a', 'mouth_i', 'mouth_o'
    ]
    
    if expression not in valid_expressions:
        return jsonify({
            'error': f'Invalid expression. Must be one of: {valid_expressions}'
        }), 400
    
    current_expression = expression
    print(f"😊 表情を {expression} に設定しました")
    
    return jsonify({
        'expression': current_expression,
        'message': f'Expression set to {expression}',
        'timestamp': time.time()
    })

@app.route('/display_mode', methods=['GET'])
def get_display_mode():
    """表示モードを取得"""
    return jsonify({
        'display_mode': display_mode,
        'timestamp': time.time()
    })

@app.route('/display_mode', methods=['POST'])
def set_display_mode():
    """表示モードを設定"""
    global display_mode
    
    data = request.get_json()
    if not data or 'display_mode' not in data:
        return jsonify({'error': 'display_mode field is required'}), 400
    
    mode = data['display_mode']
    valid_modes = ['face', 'image']
    
    if mode not in valid_modes:
        return jsonify({
            'error': f'Invalid display mode. Must be one of: {valid_modes}'
        }), 400
    
    display_mode = mode
    print(f"🖥️  表示モードを {mode} に設定しました")
    
    return jsonify({
        'display_mode': display_mode,
        'message': f'Display mode set to {mode}',
        'timestamp': time.time()
    })

@app.route('/status', methods=['GET'])
def get_status():
    """サーバーの全体状態を取得"""
    return jsonify({
        'mouth_pattern': current_mouth_pattern,
        'talking_mouth_mode': talking_mouth_mode,
        'expression': current_expression,
        'display_mode': display_mode,
        'timestamp': time.time(),
        'server_status': 'running'
    })

def demo_mouth_patterns():
    """デモ用: 自動で口パターンを循環させる"""
    global current_mouth_pattern
    patterns = ['mouth_a', 'mouth_i', 'mouth_o']
    
    while True:
        time.sleep(5)  # 5秒間隔
        if not talking_mouth_mode:  # おしゃべりモードがOFFの時のみ実行
            current_mouth_pattern = patterns[int(time.time() // 5) % len(patterns)]
            print(f"🔄 自動切り替え: {current_mouth_pattern}")

if __name__ == '__main__':
    print("=" * 60)
    print("🎤 顔アニメーション制御サーバー")
    print("=" * 60)
    print("サーバーURL: http://localhost:9090")
    print("")
    print("利用可能なAPI:")
    print("  GET/POST /mouth_pattern      - 口パターン制御 (mouth_a, mouth_i, mouth_o)")
    print("  GET/POST /talking_mouth_mode - おしゃべりモード制御")
    print("  GET/POST /expression         - 表情制御")
    print("  GET/POST /display_mode       - 表示モード制御")
    print("  GET      /status             - 全体状態取得")
    print("")
    print("キーボード操作:")
    print("  Zキー: mouth_a (あ)")
    print("  Xキー: mouth_i (い)")  
    print("  Cキー: mouth_o (お)")
    print("")
    print("使用例:")
    print("  curl -X POST http://localhost:9090/mouth_pattern \\")
    print("       -H 'Content-Type: application/json' \\")
    print("       -d '{\"mouth_pattern\": \"mouth_a\"}'")
    print("=" * 60)
    
    # デモ用の自動口パターン切り替えスレッドを開始
    # demo_thread = threading.Thread(target=demo_mouth_patterns, daemon=True)
    # demo_thread.start()
    
    # Flaskサーバーを起動
    app.run(host='0.0.0.0', port=9090, debug=True)
