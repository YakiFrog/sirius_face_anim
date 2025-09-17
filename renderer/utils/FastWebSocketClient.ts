/**
 * WebSocketクライアント for リアルタイム通信
 * HTTPの代替として低遅延な双方向通信を提供
 */

export interface WebSocketMessage {
  type: string;
  data?: any;
}

export interface WebSocketResponse {
  type: string;
  success?: boolean;
  data?: any;
  message?: string;
}

export class FastWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  private requestId = 0;

  constructor(host = "localhost", port = 8081) {
    this.url = `ws://${host}:${port}`;
  }

  /**
   * WebSocket接続を開始
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("WebSocket接続成功");
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = () => {
          console.log("WebSocket接続切断");
          this.isConnecting = false;
          this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error("WebSocketエラー:", error);
          this.isConnecting = false;
          reject(error);
        };

        // 接続タイムアウト
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.ws?.close();
            this.isConnecting = false;
            reject(new Error("WebSocket接続タイムアウト"));
          }
        }, 5000);

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * メッセージハンドラーを処理
   */
  private handleMessage(data: string) {
    try {
      const message: WebSocketResponse = JSON.parse(data);
      
      // ブロードキャストメッセージの処理
      if (message.type === "expression_changed") {
        this.messageHandlers.get("expression_changed")?.(message);
      } else if (message.type === "talking_mode_changed") {
        this.messageHandlers.get("talking_mode_changed")?.(message);
      } else if (message.type === "status") {
        this.messageHandlers.get("status")?.(message.data);
      }

    } catch (error) {
      console.error("WebSocketメッセージ解析エラー:", error);
    }
  }

  /**
   * 再接続をスケジュール
   */
  private scheduleReconnect() {
    if (this.reconnectAttempts >= 10) {
      console.error("WebSocket再接続諦め");
      return;
    }

    setTimeout(() => {
      this.reconnectAttempts++;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      console.log(`WebSocket再接続試行 ${this.reconnectAttempts}/10`);
      this.connect().catch(() => {
        // 再接続失敗は次回に委ねる
      });
    }, this.reconnectDelay);
  }

  /**
   * メッセージハンドラーを登録
   */
  onMessage(type: string, handler: (data: any) => void) {
    this.messageHandlers.set(type, handler);
  }

  /**
   * メッセージ送信（レスポンス待ちなし）
   */
  async send(message: WebSocketMessage): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log(`🚀 WebSocket送信: ${message.type}`, message.data);
      this.ws.send(JSON.stringify(message));
    } else {
      throw new Error("WebSocket未接続");
    }
  }

  /**
   * 表情変更（超高速）
   */
  async setExpression(expression: string): Promise<boolean> {
    try {
      await this.send({
        type: "set_expression",
        data: { expression }
      });
      return true;
    } catch (error) {
      console.error("表情変更エラー:", error);
      return false;
    }
  }

  /**
   * おしゃべりモード切り替え（超高速）
   */
  async setTalkingMode(enabled: boolean): Promise<boolean> {
    try {
      await this.send({
        type: "set_talking_mode",
        data: { enabled }
      });
      return true;
    } catch (error) {
      console.error("おしゃべりモード切り替えエラー:", error);
      return false;
    }
  }

  /**
   * 現在の状態を取得
   */
  async getStatus(): Promise<any> {
    try {
      await this.send({
        type: "get_status"
      });
      // WebSocketでは即座にレスポンスが来るため、ここではPromiseを返さない
      return {};
    } catch (error) {
      console.error("状態取得エラー:", error);
      return null;
    }
  }

  /**
   * 接続状態を確認
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 接続を閉じる
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// シングルトンインスタンス
export const fastWebSocketClient = new FastWebSocketClient();

// 自動接続を試行
fastWebSocketClient.connect().catch(console.error);
