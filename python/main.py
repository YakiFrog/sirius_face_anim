#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
表情・口パクモード切り替えHTTPサーバー
フェイスアニメーションシステム用のHTTP APIサーバー
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import threading
import time
from urllib.parse import urlparse, parse_qs
from enum import Enum
import logging

# ログ設定
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ExpressionMode(Enum):
    """表情モード"""
    NEUTRAL = "neutral"
    HAPPY = "happy"
    SAD = "sad"
    ANGRY = "angry"
    SURPRISED = "surprised"
    CRYING = "crying"
    HURT = "hurt"
    WINK = "wink"
    MOUTH3 = "mouth3"
    PIEN = "pien"

class DisplayMode(Enum):
    """表示モード"""
    FACE = "face"
    IMAGE = "image"

class FaceAnimationController:
    """フェイスアニメーション制御クラス"""
    
    def __init__(self):
        self.current_expression = ExpressionMode.NEUTRAL
        self.current_display_mode = DisplayMode.FACE
        self.talking_mouth_mode = False
        self.is_blinking = True
        self.blink_interval = 3.0  # 秒
        self._lock = threading.Lock()
        
    def set_expression(self, expression_mode):
        """表情モードを設定"""
        with self._lock:
            if isinstance(expression_mode, str):
                try:
                    expression_mode = ExpressionMode(expression_mode)
                except ValueError:
                    return False
            
            self.current_expression = expression_mode
            logger.info(f"表情モードを {expression_mode.value} に変更")
            return True
    
    def set_display_mode(self, display_mode):
        """表示モードを設定"""
        with self._lock:
            if isinstance(display_mode, str):
                try:
                    display_mode = DisplayMode(display_mode)
                except ValueError:
                    return False
            
            self.current_display_mode = display_mode
            logger.info(f"表示モードを {display_mode.value} に変更")
            return True
    
    def set_talking_mouth_mode(self, enabled):
        """お喋り口モードを設定"""
        with self._lock:
            self.talking_mouth_mode = bool(enabled)
            logger.info(f"お喋り口モード: {self.talking_mouth_mode}")
            return True
    
    def set_blinking(self, enabled, interval=None):
        """瞬きの設定"""
        with self._lock:
            self.is_blinking = enabled
            if interval is not None:
                self.blink_interval = interval
            logger.info(f"瞬き: {enabled}, 間隔: {self.blink_interval}秒")
            return True
    
    def get_status(self):
        """現在の状態を取得"""
        with self._lock:
            return {
                "expression": self.current_expression.value,
                "display_mode": self.current_display_mode.value,
                "talking_mouth_mode": self.talking_mouth_mode,
                "is_blinking": self.is_blinking,
                "blink_interval": self.blink_interval
            }

class FaceAnimationHandler(BaseHTTPRequestHandler):
    """HTTPリクエストハンドラー"""
    
    def __init__(self, *args, controller=None, **kwargs):
        self.controller = controller
        super().__init__(*args, **kwargs)
    
    def _send_response(self, status_code, data):
        """レスポンス送信"""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        response = json.dumps(data, ensure_ascii=False, indent=2)
        self.wfile.write(response.encode('utf-8'))
    
    def _parse_json_body(self):
        """JSON本文を解析"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                return {}
            
            body = self.rfile.read(content_length)
            return json.loads(body.decode('utf-8'))
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"JSON解析エラー: {e}")
            return None
    
    def do_OPTIONS(self):
        """OPTIONSリクエスト処理（CORS対応）"""
        self._send_response(200, {"message": "OK"})
    
    def do_GET(self):
        """GETリクエスト処理"""
        url_parts = urlparse(self.path)
        path = url_parts.path
        query_params = parse_qs(url_parts.query)
        
        if path == '/status':
            # 現在の状態を取得
            status = self.controller.get_status()
            self._send_response(200, {"status": "success", "data": status})
            
        elif path == '/expression':
            # 現在の表情を取得
            status = self.controller.get_status()
            self._send_response(200, {"expression": status["expression"]})
            
        elif path == '/display_mode':
            # 現在の表示モードを取得
            status = self.controller.get_status()
            self._send_response(200, {"display_mode": status["display_mode"]})
            
        elif path == '/talking_mouth_mode':
            # 現在のお喋り口モードを取得
            status = self.controller.get_status()
            self._send_response(200, {"talking_mouth_mode": status["talking_mouth_mode"]})
            
        elif path == '/api/expression':
            # 利用可能な表情モード一覧
            expressions = [mode.value for mode in ExpressionMode]
            self._send_response(200, {"status": "success", "expressions": expressions})
            
        elif path == '/api/display_mode':
            # 利用可能な表示モード一覧
            display_modes = [mode.value for mode in DisplayMode]
            self._send_response(200, {"status": "success", "display_modes": display_modes})
            
        elif path == '/':
            # ルート：使用方法を表示
            usage = {
                "message": "フェイスアニメーション制御API",
                "endpoints": {
                    "GET /status": "現在の状態を取得",
                    "GET /expression": "現在の表情を取得",
                    "GET /display_mode": "現在の表示モードを取得",
                    "GET /talking_mouth_mode": "現在のお喋り口モードを取得",
                    "POST /expression": "表情モードを設定 {'expression': 'happy'}",
                    "POST /display_mode": "表示モードを設定 {'display_mode': 'face'}",
                    "POST /talking_mouth_mode": "お喋り口モードを設定 {'talking_mouth_mode': true}",
                    "POST /api/blink": "瞬き設定 {'enabled': true, 'interval': 3.0}",
                    "POST /api/reset": "全設定をリセット"
                }
            }
            self._send_response(200, usage)
            
        else:
            self._send_response(404, {"status": "error", "message": "エンドポイントが見つかりません"})
    
    def do_POST(self):
        """POSTリクエスト処理"""
        url_parts = urlparse(self.path)
        path = url_parts.path
        
        # JSON本文を解析
        data = self._parse_json_body()
        if data is None:
            self._send_response(400, {"status": "error", "message": "不正なJSONデータ"})
            return
        
        if path == '/expression':
            # 表情モード設定
            expression = data.get('expression')
            if not expression:
                self._send_response(400, {"status": "error", "message": "expressionパラメータが必要です"})
                return
            
            if self.controller.set_expression(expression):
                self._send_response(200, {
                    "status": "success", 
                    "message": f"表情を {expression} に設定しました"
                })
            else:
                expressions = [mode.value for mode in ExpressionMode]
                self._send_response(400, {
                    "status": "error", 
                    "message": f"無効な表情モード: {expression}",
                    "valid_expressions": expressions
                })
        
        elif path == '/display_mode':
            # 表示モード設定
            display_mode = data.get('display_mode')
            if not display_mode:
                self._send_response(400, {"status": "error", "message": "display_modeパラメータが必要です"})
                return
            
            if self.controller.set_display_mode(display_mode):
                self._send_response(200, {
                    "status": "success",
                    "message": f"表示モードを {display_mode} に設定しました"
                })
            else:
                display_modes = [mode.value for mode in DisplayMode]
                self._send_response(400, {
                    "status": "error",
                    "message": f"無効な表示モード: {display_mode}",
                    "valid_display_modes": display_modes
                })
        
        elif path == '/talking_mouth_mode':
            # お喋り口モード設定
            talking_mouth_mode = data.get('talking_mouth_mode')
            if talking_mouth_mode is None:
                self._send_response(400, {"status": "error", "message": "talking_mouth_modeパラメータが必要です"})
                return
            
            self.controller.set_talking_mouth_mode(talking_mouth_mode)
            self._send_response(200, {
                "status": "success",
                "message": f"お喋り口モードを {'有効' if talking_mouth_mode else '無効'} に設定しました"
            })
        
        elif path == '/api/blink':
            # 瞬き設定
            enabled = data.get('enabled', True)
            interval = data.get('interval')
            
            self.controller.set_blinking(enabled, interval)
            self._send_response(200, {
                "status": "success",
                "message": "瞬き設定を更新しました"
            })
        
        elif path == '/api/reset':
            # 設定リセット
            self.controller.set_expression(ExpressionMode.NEUTRAL)
            self.controller.set_display_mode(DisplayMode.FACE)
            self.controller.set_talking_mouth_mode(False)
            self.controller.set_blinking(True, 3.0)
            
            self._send_response(200, {
                "status": "success",
                "message": "設定をリセットしました"
            })
        
        else:
            self._send_response(404, {"status": "error", "message": "エンドポイントが見つかりません"})
    
    def log_message(self, format, *args):
        """ログメッセージをカスタマイズ（定期的なGETリクエストは非表示）"""
        # 定期的なポーリングリクエストは非表示
        request_line = format % args
        if any(endpoint in request_line for endpoint in [
            'GET /expression',
            'GET /display_mode', 
            'GET /talking_mouth_mode',
            'OPTIONS /expression',
            'OPTIONS /display_mode',
            'OPTIONS /talking_mouth_mode'
        ]):
            return  # ログを出力しない
        
        # その他のリクエスト（POST等）は表示
        logger.info(f"{self.address_string()} - {request_line}")

def create_handler(controller):
    """ハンドラーファクトリー"""
    def handler(*args, **kwargs):
        return FaceAnimationHandler(*args, controller=controller, **kwargs)
    return handler

def main():
    """メイン関数"""
    # コントローラーを初期化
    controller = FaceAnimationController()
    
    # HTTPサーバーを設定
    server_address = ('localhost', 8080)
    handler_class = create_handler(controller)
    httpd = HTTPServer(server_address, handler_class)
    
    logger.info(f"HTTPサーバーを起動中... http://{server_address[0]}:{server_address[1]}")
    logger.info("APIエンドポイント:")
    logger.info("  GET  /status - 現在の状態を取得")
    logger.info("  GET  /expression - 現在の表情を取得")
    logger.info("  GET  /display_mode - 現在の表示モードを取得")
    logger.info("  GET  /talking_mouth_mode - 現在のお喋り口モードを取得")
    logger.info("  POST /expression - 表情モードを設定")
    logger.info("  POST /display_mode - 表示モードを設定")
    logger.info("  POST /talking_mouth_mode - お喋り口モードを設定")
    logger.info("  POST /api/blink - 瞬き設定")
    logger.info("  POST /api/reset - 設定リセット")
    logger.info("\n使用例:")
    logger.info("  curl -X POST http://localhost:8080/expression -H 'Content-Type: application/json' -d '{\"expression\": \"happy\"}'")
    logger.info("  curl -X POST http://localhost:8080/talking_mouth_mode -H 'Content-Type: application/json' -d '{\"talking_mouth_mode\": true}'")
    logger.info("  curl http://localhost:8080/expression")
    logger.info("\nサーバー起動後の手動制御:")
    logger.info("  コンソールで 'D' + Enter : お喋りモード切り替え")
    logger.info("  コンソールで '1-9' + Enter : 表情変更")
    logger.info("    1: neutral  2: happy    3: angry    4: sad      5: surprised")
    logger.info("    6: crying   7: hurt     8: wink     9: mouth3   0: pien")
    logger.info("  コンソールで 'A' + Enter : 全ての表情を順次表示")
    logger.info("  コンソールで 'R' + Enter : 設定リセット")
    logger.info("  コンソールで 'S' + Enter : 現在の状態表示")
    logger.info("  コンソールで 'Q' + Enter : サーバー停止")
    logger.info("\nCtrl+C で停止")
    
    def manual_control():
        """手動制御用の入力処理"""
        import threading
        import time
        
        # 表情マッピング
        expression_map = {
            '1': 'neutral',
            '2': 'happy', 
            '3': 'angry',
            '4': 'sad',
            '5': 'surprised',
            '6': 'crying',
            '7': 'hurt',
            '8': 'wink',
            '9': 'mouth3',
            '0': 'pien'
        }
        
        def show_all_expressions():
            """全ての表情を順次表示"""
            logger.info("🎭 全表情デモンストレーション開始...")
            for key, expression in expression_map.items():
                controller.set_expression(expression)
                logger.info(f"  {key}: {expression}")
                time.sleep(2)  # 2秒間隔で表示
            logger.info("🎭 表情デモンストレーション完了")
        
        while True:
            try:
                command = input().strip().upper()
                
                if command == 'D':
                    # お喋りモード切り替え
                    current_state = controller.get_status()["talking_mouth_mode"]
                    controller.set_talking_mouth_mode(not current_state)
                    mode_str = "有効" if not current_state else "無効"
                    logger.info(f"🎤 手動制御: お喋りモードを{mode_str}に切り替え")
                    
                elif command in expression_map:
                    # 表情変更
                    expression = expression_map[command]
                    controller.set_expression(expression)
                    logger.info(f"😊 手動制御: 表情を {expression} に変更")
                    
                elif command == 'A':
                    # 全表情デモ（別スレッドで実行）
                    demo_thread = threading.Thread(target=show_all_expressions, daemon=True)
                    demo_thread.start()
                    
                elif command == 'R':
                    # 設定リセット
                    controller.set_expression(ExpressionMode.NEUTRAL)
                    controller.set_display_mode(DisplayMode.FACE)
                    controller.set_talking_mouth_mode(False)
                    controller.set_blinking(True, 3.0)
                    logger.info("🔄 手動制御: 全設定をリセットしました")
                    
                elif command == 'S':
                    # 現在の状態表示
                    status = controller.get_status()
                    logger.info("📊 現在の状態:")
                    logger.info(f"  表情: {status['expression']}")
                    logger.info(f"  表示モード: {status['display_mode']}")
                    logger.info(f"  お喋りモード: {'有効' if status['talking_mouth_mode'] else '無効'}")
                    logger.info(f"  瞬き: {'有効' if status['is_blinking'] else '無効'} (間隔: {status['blink_interval']}秒)")
                    
                elif command == 'Q':
                    logger.info("👋 手動制御: 終了指示")
                    httpd.shutdown()
                    break
                    
                elif command == 'H' or command == 'HELP':
                    # ヘルプ表示
                    logger.info("📖 利用可能なコマンド:")
                    logger.info("  D: お喋りモード切り替え")
                    logger.info("  1-9,0: 表情変更 (1:neutral, 2:happy, 3:angry, 4:sad, 5:surprised, 6:crying, 7:hurt, 8:wink, 9:mouth3, 0:pien)")
                    logger.info("  A: 全表情デモ")
                    logger.info("  R: 設定リセット")
                    logger.info("  S: 状態表示")
                    logger.info("  H: ヘルプ表示")
                    logger.info("  Q: 終了")
                    
                else:
                    logger.info("❓ 不明なコマンド。'H' または 'HELP' でヘルプを表示")
                    
            except (EOFError, KeyboardInterrupt):
                break
            except Exception as e:
                logger.error(f"❌ 手動制御エラー: {e}")
    
    # 手動制御を別スレッドで開始
    import threading
    control_thread = threading.Thread(target=manual_control, daemon=True)
    control_thread.start()
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("\nサーバーを停止中...")
        httpd.shutdown()
        logger.info("サーバーが停止しました")

if __name__ == "__main__":
    main()