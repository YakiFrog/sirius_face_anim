#!/usr/bin/env python3
"""
WebSocketサーバー for リアルタイム通信
HTTPの代替として低遅延な双方向通信を提供
"""

import asyncio
import websockets
import json
import logging
from typing import Set, Dict, Any

logger = logging.getLogger(__name__)

class WebSocketServer:
    def __init__(self, host="localhost", port=8081):
        self.host = host
        self.port = port
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.controller = None  # FaceControllerインスタンスへの参照
        
    def set_controller(self, controller):
        """FaceControllerインスタンスを設定"""
        self.controller = controller
    
    async def register_client(self, websocket):
        """クライアント接続時の登録"""
        self.clients.add(websocket)
        logger.info(f"WebSocketクライアント接続: {websocket.remote_address}")
        
        # 接続時に現在の状態を送信
        if self.controller:
            await self.send_current_status(websocket)
    
    async def unregister_client(self, websocket):
        """クライアント切断時の登録解除"""
        self.clients.discard(websocket)
        logger.info(f"WebSocketクライアント切断: {websocket.remote_address}")
    
    async def send_current_status(self, websocket):
        """現在の状態を送信"""
        if self.controller:
            status = self.controller.get_status()
            await websocket.send(json.dumps({
                "type": "status",
                "data": status
            }))
    
    async def broadcast(self, message: Dict[str, Any]):
        """全クライアントにメッセージを送信"""
        if self.clients:
            message_str = json.dumps(message)
            await asyncio.gather(
                *[client.send(message_str) for client in self.clients],
                return_exceptions=True
            )
    
    async def handle_message(self, websocket, message: str):
        """クライアントからのメッセージを処理"""
        try:
            data = json.loads(message)
            message_type = data.get("type")
            payload = data.get("data", {})
            
            logger.info(f"🚀 WebSocketメッセージ受信: {message_type} - {payload}")
            
            if not self.controller:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Controller not initialized"
                }))
                return
            
            response = {"type": "response", "success": False}
            
            if message_type == "set_expression":
                expression = payload.get("expression")
                if self.controller.set_expression(expression):
                    response["success"] = True
                    logger.info(f"🚀 WebSocket: 表情を {expression} に設定完了")
                    # 他のクライアントに変更を通知
                    await self.broadcast({
                        "type": "expression_changed",
                        "expression": expression
                    })
            
            elif message_type == "set_talking_mode":
                enabled = payload.get("enabled", False)
                if self.controller.set_talking_mouth_mode(enabled):
                    response["success"] = True
                    mode_str = "有効" if enabled else "無効"
                    logger.info(f"🚀 WebSocket: おしゃべりモードを {mode_str} に設定完了")
                    await self.broadcast({
                        "type": "talking_mode_changed",
                        "enabled": enabled
                    })
            
            elif message_type == "get_status":
                status = self.controller.get_status()
                response = {
                    "type": "status",
                    "data": status
                }
                logger.info(f"🚀 WebSocket: 状態取得 - {status}")
            
            await websocket.send(json.dumps(response))
            
        except json.JSONDecodeError:
            logger.error("WebSocket: 無効なJSONメッセージ")
            await websocket.send(json.dumps({
                "type": "error",
                "message": "Invalid JSON"
            }))
        except Exception as e:
            logger.error(f"WebSocketメッセージ処理エラー: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": str(e)
            }))
    
    async def handler(self, websocket):
        """WebSocket接続ハンドラー"""
        await self.register_client(websocket)
        try:
            async for message in websocket:
                await self.handle_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            logger.error(f"WebSocketエラー: {e}")
        finally:
            await self.unregister_client(websocket)
    
    async def start(self):
        """WebSocketサーバー開始"""
        logger.info(f"WebSocketサーバー開始: ws://{self.host}:{self.port}")
        server = await websockets.serve(self.handler, self.host, self.port)
        await server.wait_closed()

# グローバルWebSocketサーバーインスタンス
websocket_server = WebSocketServer()

def start_websocket_server(controller):
    """WebSocketサーバーをバックグラウンドで開始"""
    websocket_server.set_controller(controller)
    
    def run_server():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(websocket_server.start())
    
    import threading
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    logger.info("WebSocketサーバースレッド開始")
    
    return websocket_server
