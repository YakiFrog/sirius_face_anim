import { FacialExpression } from '../types/FaceAnimationTypes';

export class ROS2Connection {
  private enableRos2Connection: boolean;
  private ros2HttpUrl: string;
  private isConnected: boolean = false;
  private connectionStatus: string = '切断';
  private pollingInterval?: NodeJS.Timeout;
  private isPollingActive: boolean = true;

  constructor(enableRos2Connection: boolean, ros2HttpUrl: string) {
    this.enableRos2Connection = enableRos2Connection;
    this.ros2HttpUrl = ros2HttpUrl;
  }

  public startConnection(
    manualExpressionRef: React.MutableRefObject<{ isManual: boolean; timeout: NodeJS.Timeout | null }>,
    eyeOverTapReactionRef: React.MutableRefObject<boolean>,
    eyeOverTapReactionStartTime: React.MutableRefObject<number>,
    setExpression: (expression: FacialExpression) => void,
    setIsConnected: (connected: boolean) => void,
    setConnectionStatus: (status: string) => void,
    displayMode: string,
    onDisplayModeToggle?: () => void
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

    // ポーリング間隔を調整（1000ms = 1秒間隔）
    this.pollingInterval = setInterval(() => {
      this.fetchExpression(manualExpressionRef, eyeOverTapReactionRef, eyeOverTapReactionStartTime, setExpression, setIsConnected, setConnectionStatus);
      this.fetchDisplayMode(displayMode, onDisplayModeToggle);
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
        setConnectionStatus('接続中');
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

  public async sendExpressionToRos2(expression: FacialExpression): Promise<void> {
    if (!this.enableRos2Connection) return;

    try {
      const response = await fetch(`${this.ros2HttpUrl}/expression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
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
    try {
      const response = await fetch(`${this.ros2HttpUrl}/talking_mouth_mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ talking_mouth_mode: enable }),
        signal: AbortSignal.timeout(2000)
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.warn('お喋り口モード切替失敗:', error.message);
    }
  }

  private isValidExpression(exp: string): boolean {
    return ['neutral', 'happy', 'angry', 'sad', 'surprised', 'crying', 'hurt', 'wink', 'mouth3', 'pien'].includes(exp);
  }
}
