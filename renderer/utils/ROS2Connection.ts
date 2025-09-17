import { FacialExpression } from '../types/FaceAnimationTypes';
import { TalkingMode } from './TalkingMode';
import { fastWebSocketClient } from './FastWebSocketClient';

export class ROS2Connection {
  private enableRos2Connection: boolean;
  private ros2HttpUrl: string;
  private isConnected: boolean = false;
  private connectionStatus: string = '切断';
  private pollingInterval?: NodeJS.Timeout;
  private isPollingActive: boolean = true;
  private lastTalkingMouthModeState: boolean | null = null;
  private webSocketConnected: boolean = false;
  
  // 使用統計
  private stats = {
    webSocketRequests: 0,
    httpRequests: 0,
    webSocketSuccesses: 0,
    httpSuccesses: 0
  };

  constructor(enableRos2Connection: boolean, ros2HttpUrl: string) {
    this.enableRos2Connection = enableRos2Connection;
    this.ros2HttpUrl = ros2HttpUrl;
    
    // WebSocket接続状態を監視
    this.initWebSocketMonitoring();
  }

  private initWebSocketMonitoring() {
    // WebSocketからのメッセージを監視
    fastWebSocketClient.onMessage('expression_changed', (data) => {
      console.log('🚀 WebSocket: 表情変更受信:', data.expression);
    });
    
    fastWebSocketClient.onMessage('talking_mode_changed', (data) => {
      console.log('🚀 WebSocket: おしゃべりモード変更受信:', data.enabled);
    });
    
    fastWebSocketClient.onMessage('status', (data) => {
      console.log('🚀 WebSocket: 状態更新受信:', data);
    });
    
    // 定期的にWebSocket接続状態をチェック
    setInterval(() => {
      this.webSocketConnected = fastWebSocketClient.isConnected();
    }, 1000);
  }

  public startConnection(
    manualExpressionRef: React.MutableRefObject<{ isManual: boolean; timeout: NodeJS.Timeout | null }>,
    eyeOverTapReactionRef: React.MutableRefObject<boolean>,
    eyeOverTapReactionStartTime: React.MutableRefObject<number>,
    setExpression: (expression: FacialExpression) => void,
    setIsConnected: (connected: boolean) => void,
    setConnectionStatus: (status: string) => void,
    displayMode: string,
    onDisplayModeToggle?: () => void,
    talkingMode?: TalkingMode
  ) {
    if (!this.enableRos2Connection) {
      setConnectionStatus('切断');
      console.log('ROS2接続が無効のため、ポーリングを停止します');
      return;
    }

    console.log(`ROS2接続開始: ${this.ros2HttpUrl}`);
    this.isPollingActive = true;

    // 初回取得
    this.fetchExpression(manualExpressionRef, eyeOverTapReactionRef, eyeOverTapReactionStartTime, setExpression, setIsConnected, setConnectionStatus);
    this.fetchDisplayMode(displayMode, onDisplayModeToggle);
    this.fetchTalkingMouthModeAndControl(talkingMode);

    // ポーリング間隔を調整（1000ms = 1秒間隔）
    this.pollingInterval = setInterval(() => {
      this.fetchExpression(manualExpressionRef, eyeOverTapReactionRef, eyeOverTapReactionStartTime, setExpression, setIsConnected, setConnectionStatus);
      this.fetchDisplayMode(displayMode, onDisplayModeToggle);
      this.fetchTalkingMouthModeAndControl(talkingMode);
    }, 1000);
  }

  public stopConnection() {
    this.isPollingActive = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  private async fetchExpression(
    manualExpressionRef: React.MutableRefObject<{ isManual: boolean; timeout: NodeJS.Timeout | null }>,
    eyeOverTapReactionRef: React.MutableRefObject<boolean>,
    eyeOverTapReactionStartTime: React.MutableRefObject<number>,
    setExpression: (expression: FacialExpression) => void,
    setIsConnected: (connected: boolean) => void,
    setConnectionStatus: (status: string) => void
  ) {
    if (!this.isPollingActive) return;

    // 🚀 WebSocket接続時はHTTPポーリングをスキップ
    if (this.webSocketConnected) {
      setIsConnected(true);
      setConnectionStatus('WebSocket接続中');
      return;
    }

    // 手動表情変更中または過度なタップ反応中はポーリングをスキップ
    const now = Date.now();
    const isInOverTapReaction = eyeOverTapReactionRef.current &&
      (now - eyeOverTapReactionStartTime.current) < 12000;

    if (manualExpressionRef.current.isManual || isInOverTapReaction) {
      return;
    }

    try {
      const response = await fetch(`${this.ros2HttpUrl}/expression`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(2000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.expression && this.isValidExpression(data.expression)) {
          const newExpression = data.expression as FacialExpression;
          setExpression(newExpression);
        }
        setIsConnected(true);
        setConnectionStatus('HTTP接続中');
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.log('HTTP接続エラー:', error.message);
      setIsConnected(false);
      setConnectionStatus('切断');
    }
  }

  private async fetchDisplayMode(displayMode: string, onDisplayModeToggle?: () => void) {
    if (!this.isPollingActive) return;

    // 🚀 WebSocket接続時はHTTPポーリングをスキップ
    if (this.webSocketConnected) {
      return;
    }

    try {
      const response = await fetch(`${this.ros2HttpUrl}/display_mode`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(2000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.display_mode && (data.display_mode === 'face' || data.display_mode === 'image')) {
          if (data.display_mode !== displayMode && onDisplayModeToggle) {
            onDisplayModeToggle();
          }
        }
      }
    } catch (error) {
      console.log('表示モード取得エラー:', error.message);
    }
  }

  private async fetchTalkingMouthModeAndControl(talkingMode?: TalkingMode) {
    if (!this.isPollingActive || !talkingMode) return;

    // 🚀 WebSocket接続時はHTTPポーリングをスキップ
    if (this.webSocketConnected) {
      return;
    }

    try {
      const response = await fetch(`${this.ros2HttpUrl}/talking_mouth_mode`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(2000)
      });

      if (response.ok) {
        const data = await response.json();
        const currentState = !!data.talking_mouth_mode;
        
        // 状態が変更された場合のみ制御
        if (this.lastTalkingMouthModeState !== currentState) {
          console.log(`お喋り口モード状態変更: ${this.lastTalkingMouthModeState} → ${currentState}`);
          
          if (currentState) {
            // お喋りモードを開始（ランダムモード）
            if (!talkingMode.getIsActive()) {
              talkingMode.start(true); // Dキーと同じランダムモード
              console.log('🎯 HTTPサーバー指示によりランダムおしゃべりモード開始');
            }
          } else {
            // お喋りモードを停止
            if (talkingMode.getIsActive()) {
              talkingMode.stop();
              console.log('🛑 HTTPサーバー指示によりおしゃべりモード停止');
            }
          }
          
          this.lastTalkingMouthModeState = currentState;
        }
      }
    } catch (error) {
      console.log('お喋り口モード制御エラー:', error.message);
    }
  }

  public async sendExpressionToRos2(expression: FacialExpression): Promise<void> {
    if (!this.enableRos2Connection) return;

    // 🚀 WebSocket優先で送信
    if (this.webSocketConnected) {
      try {
        this.stats.webSocketRequests++;
        const success = await fastWebSocketClient.setExpression(expression);
        if (success) {
          this.stats.webSocketSuccesses++;
          console.log(`🚀 WebSocket: 表情 ${expression} 送信成功 (WebSocket: ${this.stats.webSocketSuccesses}/${this.stats.webSocketRequests}, HTTP: ${this.stats.httpSuccesses}/${this.stats.httpRequests})`);
          return;
        }
      } catch (error) {
        console.warn('WebSocket表情送信失敗、HTTPにフォールバック:', error);
      }
    }

    // HTTPフォールバック
    try {
      this.stats.httpRequests++;
      const response = await fetch(`${this.ros2HttpUrl}/expression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      this.stats.httpSuccesses++;
      console.log(`📡 HTTP: 表情 ${expression} 送信成功 (WebSocket: ${this.stats.webSocketSuccesses}/${this.stats.webSocketRequests}, HTTP: ${this.stats.httpSuccesses}/${this.stats.httpRequests})`);
    } catch (error) {
      console.warn('表情の送信に失敗しました:', error.message);
    }
  }

  // お喋り口モードの状態を取得
  public async fetchTalkingMouthMode(): Promise<boolean | null> {
    if (!this.enableRos2Connection) return null;
    try {
      const response = await fetch(`${this.ros2HttpUrl}/talking_mouth_mode`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        const data = await response.json();
        return !!data.talking_mouth_mode;
      }
    } catch (error) {
      console.warn('お喋り口モード取得失敗:', error.message);
    }
    return null;
  }

  // お喋り口モードのオン/オフを設定
  public async setTalkingMouthMode(enable: boolean): Promise<void> {
    if (!this.enableRos2Connection) return;
    
    // 🚀 WebSocket優先で送信
    if (this.webSocketConnected) {
      try {
        this.stats.webSocketRequests++;
        const success = await fastWebSocketClient.setTalkingMode(enable);
        if (success) {
          this.stats.webSocketSuccesses++;
          console.log(`🚀 WebSocket: おしゃべりモード ${enable ? '有効' : '無効'} 送信成功 (WebSocket: ${this.stats.webSocketSuccesses}/${this.stats.webSocketRequests}, HTTP: ${this.stats.httpSuccesses}/${this.stats.httpRequests})`);
          return;
        }
      } catch (error) {
        console.warn('WebSocketおしゃべりモード送信失敗、HTTPにフォールバック:', error);
      }
    }
    
    // HTTPフォールバック
    try {
      this.stats.httpRequests++;
      const response = await fetch(`${this.ros2HttpUrl}/talking_mouth_mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ talking_mouth_mode: enable }),
        signal: AbortSignal.timeout(2000)
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      this.stats.httpSuccesses++;
      console.log(`📡 HTTP: おしゃべりモード ${enable ? '有効' : '無効'} 送信成功 (WebSocket: ${this.stats.webSocketSuccesses}/${this.stats.webSocketRequests}, HTTP: ${this.stats.httpSuccesses}/${this.stats.httpRequests})`);
    } catch (error) {
      console.warn('お喋り口モード切替失敗:', error.message);
    }
  }

  // 使用統計を取得
  public getStats() {
    const totalRequests = this.stats.webSocketRequests + this.stats.httpRequests;
    const webSocketRate = totalRequests > 0 ? (this.stats.webSocketRequests / totalRequests * 100).toFixed(1) : '0.0';
    
    return {
      ...this.stats,
      totalRequests,
      webSocketRate: `${webSocketRate}%`,
      webSocketConnected: this.webSocketConnected
    };
  }

  private isValidExpression(exp: string): boolean {
    return ['neutral', 'happy', 'angry', 'sad', 'surprised', 'crying', 'hurt', 'wink', 'mouth3', 'pien'].includes(exp);
  }
}
