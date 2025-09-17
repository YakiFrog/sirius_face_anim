/**
 * 高速HTTPクライアント
 * Keep-Alive接続とリクエストプールを使用してレスポンス時間を最適化
 */
export class FastHttpClient {
  private baseUrl: string;
  private keepAliveAgent: any;
  private requestQueue: Array<() => void> = [];
  private isProcessing = false;

  constructor(baseUrl: string = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
    
    // Keep-Alive接続の設定
    if (typeof window === 'undefined') {
      // Node.js環境（通常は使用されない）
      const http = require('http');
      this.keepAliveAgent = new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 5,
        maxFreeSockets: 2,
        timeout: 500
      });
    }
  }

  /**
   * 表情変更（最適化済み）
   */
  public async setExpression(expression: string): Promise<boolean> {
    return this.fastPost('/expression', { expression });
  }

  /**
   * おしゃべりモード変更（最適化済み）
   */
  public async setTalkingMode(enabled: boolean): Promise<boolean> {
    return this.fastPost('/talking_mouth_mode', { talking_mouth_mode: enabled });
  }

  /**
   * 高速POSTリクエスト
   */
  private async fastPost(endpoint: string, data: any): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300); // 300ms タイムアウト

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Connection': 'keep-alive',
          'Keep-Alive': 'timeout=5, max=1000'
        },
        body: JSON.stringify(data),
        signal: controller.signal,
        // ブラウザの接続プールを有効活用
        keepalive: true
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // レスポンスボディを読まずに即座にreturn（さらなる高速化）
        return true;
      }

      console.warn(`HTTP ${response.status}: ${endpoint}`);
      return false;

    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn(`Timeout: ${endpoint}`);
      } else {
        console.error(`Request failed: ${endpoint}`, error);
      }
      return false;
    }
  }

  /**
   * バッチリクエスト（複数の要求を一度に送信）
   */
  public async batchRequest(requests: Array<{endpoint: string, data: any}>): Promise<boolean[]> {
    const promises = requests.map(req => this.fastPost(req.endpoint, req.data));
    return Promise.all(promises);
  }

  /**
   * リクエストの事前準備（接続プールの準備）
   */
  public async warmup(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/status`, {
        method: 'GET',
        headers: { 'Connection': 'keep-alive' }
      });
      console.log('🔥 HTTP接続ウォームアップ完了');
    } catch (error) {
      console.warn('HTTP接続ウォームアップ失敗:', error);
    }
  }
}

// シングルトンインスタンス
export const fastHttpClient = new FastHttpClient();
