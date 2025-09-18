import { FacialExpression } from '../types/FaceAnimationTypes';
import { TalkingMode } from './TalkingMode';
import { MouthPatternController } from './MouthPatternController';

export class ROS2Connection {
  private enableRos2Connection: boolean;
  private ros2HttpUrl: string;
  private isConnected: boolean = false;
  private connectionStatus: string = '切断';
  private pollingInterval?: NodeJS.Timeout;
  private isPollingActive: boolean = true;
  private lastTalkingMouthModeState: boolean | null = null;
  private lastMouthPatternState: string | null = null;
  
  // 高速化用の設定
  private fastPollingInterval: number = 100; // 100ms間隔に短縮
  private requestTimeout: number = 50; // タイムアウトを50msに短縮
  private consecutiveErrors: number = 0;
  private maxConsecutiveErrors: number = 5;
  private backoffMultiplier: number = 1;
  
  // ログ制御用の設定
  private lastErrorLogTime: number = 0;
  private errorLogInterval: number = 5000; // 5秒に1回までエラーログ出力
  private totalErrorCount: number = 0;
  private maxErrorsBeforeStop: number = 50; // 50回エラーで一時停止
  
  // リクエストキャッシュ（冗長リクエスト防止）
  private requestCache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout: number = 200; // 200msキャッシュ

  constructor(enableRos2Connection: boolean, ros2HttpUrl: string) {
    this.enableRos2Connection = enableRos2Connection;
    this.ros2HttpUrl = ros2HttpUrl;
    
    // 初期化時に接続チェック
    if (enableRos2Connection) {
      this.checkServerHealth();
    }
  }

  // サーバーの健全性チェック
  private async checkServerHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000); // 1秒タイムアウト
      
      const response = await fetch(`${this.ros2HttpUrl}/api/health`, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log('✅ ROS2サーバー接続確認完了');
        return true;
      } else {
        console.warn('⚠️ ROS2サーバーが異常な状態です');
        return false;
      }
    } catch (error) {
      console.warn('⚠️ ROS2サーバーが起動していないか、接続できません。main.pyを起動してください。');
      return false;
    }
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
    talkingMode?: TalkingMode,
    mouthPatternController?: MouthPatternController
  ) {
    if (!this.enableRos2Connection) {
      setConnectionStatus('切断');
      console.log('ROS2接続が無効のため、ポーリングを停止します');
      return;
    }

    console.log(`🚀 高速ROS2接続開始: ${this.ros2HttpUrl} (${this.fastPollingInterval}ms間隔)`);
    this.isPollingActive = true;
    this.consecutiveErrors = 0;
    this.totalErrorCount = 0; // エラーカウンタをリセット

    // 初回取得
    this.fetchExpression(manualExpressionRef, eyeOverTapReactionRef, eyeOverTapReactionStartTime, setExpression, setIsConnected, setConnectionStatus);
    this.fetchDisplayMode(displayMode, onDisplayModeToggle);
    this.fetchTalkingMouthModeAndControl(talkingMode);
    this.fetchMouthPatternAndControl(mouthPatternController);

    // 高速ポーリング開始
    this.pollingInterval = setInterval(() => {
      // エラーが多すぎる場合は一時的にスキップ
      if (this.totalErrorCount > this.maxErrorsBeforeStop) {
        // 10秒後にリセットして再試行
        if (this.totalErrorCount === this.maxErrorsBeforeStop + 1) {
          setTimeout(() => {
            console.log('🔄 接続エラーカウンタをリセットして再試行します');
            this.totalErrorCount = 0;
            this.consecutiveErrors = 0;
            this.backoffMultiplier = 1;
          }, 10000);
          this.totalErrorCount++; // フラグとして増加
        }
        return;
      }
      
      const currentInterval = this.fastPollingInterval * this.backoffMultiplier;
      
      Promise.all([
        this.fetchExpression(manualExpressionRef, eyeOverTapReactionRef, eyeOverTapReactionStartTime, setExpression, setIsConnected, setConnectionStatus),
        this.fetchDisplayMode(displayMode, onDisplayModeToggle),
        this.fetchTalkingMouthModeAndControl(talkingMode),
        this.fetchMouthPatternAndControl(mouthPatternController)
      ]).catch(() => {
        // エラーハンドリングは各メソッド内で実施
      });
      
    }, this.fastPollingInterval);

    // 定期的なキャッシュクリーンアップ
    setInterval(() => {
      this.cleanupCache();
    }, 1000);
  }

  public stopConnection() {
    this.isPollingActive = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    this.requestCache.clear();
    
    // エラーカウンタもリセット
    this.consecutiveErrors = 0;
    this.totalErrorCount = 0;
    this.backoffMultiplier = 1;
    
    console.log('🛑 ROS2接続を停止しました（エラーカウンタもリセット）');
  }

  private cleanupCache() {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.requestCache.forEach((value, key) => {
      if (now - value.timestamp > this.cacheTimeout) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.requestCache.delete(key);
    });
  }

  private async fetchWithCache(url: string): Promise<any> {
    const cacheKey = url;
    const cached = this.requestCache.get(cacheKey);
    const now = Date.now();
    
    // キャッシュが有効な場合は返す
    if (cached && (now - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }

    // エラーが多すぎる場合は一時停止
    if (this.totalErrorCount > this.maxErrorsBeforeStop) {
      throw new Error('Too many consecutive errors - temporarily stopped');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        
        // キャッシュに保存
        this.requestCache.set(cacheKey, { data, timestamp: now });
        
        // エラーカウンタをリセット
        this.consecutiveErrors = 0;
        this.backoffMultiplier = 1;
        this.totalErrorCount = 0; // 成功時にリセット
        
        return data;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      this.handleRequestError(url, error);
      throw error;
    }
  }

  private async postWithTimeout(url: string, body: any): Promise<boolean> {
    // エラーが多すぎる場合は一時停止
    if (this.totalErrorCount > this.maxErrorsBeforeStop) {
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.consecutiveErrors = 0;
        this.backoffMultiplier = 1;
        this.totalErrorCount = 0; // 成功時にリセット
        return true;
      } else {
        this.handleRequestError(url, new Error(`HTTP ${response.status}`));
        return false;
      }
    } catch (error) {
      this.handleRequestError(url, error);
      return false;
    }
  }

  private handleRequestError(url?: string, error?: any) {
    this.consecutiveErrors++;
    this.totalErrorCount++;
    
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 8); // 最大8倍まで
    }

    // ログ出力の制御（5秒に1回まで）
    const now = Date.now();
    if (now - this.lastErrorLogTime > this.errorLogInterval) {
      console.warn(`🔗 ROS2接続エラー (${this.totalErrorCount}回目):`, {
        url: url?.replace(this.ros2HttpUrl, '') || 'unknown',
        consecutiveErrors: this.consecutiveErrors,
        backoffMultiplier: this.backoffMultiplier,
        errorType: error?.name || 'Unknown'
      });
      this.lastErrorLogTime = now;
      
      // エラーが多すぎる場合は警告
      if (this.totalErrorCount === this.maxErrorsBeforeStop) {
        console.warn(`⚠️ 接続エラーが${this.maxErrorsBeforeStop}回に達しました。一時的にリクエストを停止します。`);
      }
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
      const data = await this.fetchWithCache(`${this.ros2HttpUrl}/expression`);
      
      if (data.expression && this.isValidExpression(data.expression)) {
        const newExpression = data.expression as FacialExpression;
        setExpression(newExpression);
      }
      setIsConnected(true);
      setConnectionStatus('高速接続中');
    } catch (error) {
      setIsConnected(false);
      setConnectionStatus('切断');
      // エラーログは handleRequestError で制御される
    }
  }

  private async fetchDisplayMode(displayMode: string, onDisplayModeToggle?: () => void) {
    if (!this.isPollingActive) return;

    try {
      const data = await this.fetchWithCache(`${this.ros2HttpUrl}/display_mode`);
      
      if (data.display_mode && (data.display_mode === 'face' || data.display_mode === 'image')) {
        if (data.display_mode !== displayMode && onDisplayModeToggle) {
          onDisplayModeToggle();
        }
      }
    } catch (error) {
      // サイレントエラー処理
    }
  }

  private async fetchTalkingMouthModeAndControl(talkingMode?: TalkingMode) {
    if (!this.isPollingActive || !talkingMode) return;

    try {
      const data = await this.fetchWithCache(`${this.ros2HttpUrl}/talking_mouth_mode`);
      const currentState = !!data.talking_mouth_mode;
      
      // 状態が変更された場合のみ制御
      if (this.lastTalkingMouthModeState !== currentState) {
        console.log(`🎭 お喋り口モード状態変更: ${this.lastTalkingMouthModeState} → ${currentState}`);
        
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
    } catch (error) {
      // サイレントエラー処理
    }
  }

  private async fetchMouthPatternAndControl(mouthPatternController?: MouthPatternController) {
    if (!this.isPollingActive || !mouthPatternController) return;

    try {
      const data = await this.fetchWithCache(`${this.ros2HttpUrl}/mouth_pattern`);
      const currentPattern = data.mouth_pattern;
      
      // 状態が変更された場合のみ制御
      if (this.lastMouthPatternState !== currentPattern) {
        console.log(`👄 口パターン状態変更: ${this.lastMouthPatternState} → ${currentPattern}`);
        
        if (currentPattern && this.isValidMouthPattern(currentPattern)) {
          mouthPatternController.setMouthPattern(currentPattern as 'mouth_a' | 'mouth_i' | 'mouth_o');
          console.log(`🎯 HTTPサーバー指示により口パターンを${currentPattern}に変更`);
        } else if (currentPattern === null) {
          mouthPatternController.clear();
          console.log(`🎯 HTTPサーバー指示により口パターンをクリア`);
        }
        
        this.lastMouthPatternState = currentPattern;
      }
    } catch (error) {
      // サイレントエラー処理
    }
  }

  public async sendExpressionToRos2(expression: FacialExpression): Promise<void> {
    if (!this.enableRos2Connection) return;

    const success = await this.postWithTimeout(`${this.ros2HttpUrl}/expression`, { expression });
    if (!success) {
      console.warn('表情の送信に失敗しました');
    }
  }

  // お喋り口モードの状態を取得
  public async fetchTalkingMouthMode(): Promise<boolean | null> {
    if (!this.enableRos2Connection) return null;
    try {
      const data = await this.fetchWithCache(`${this.ros2HttpUrl}/talking_mouth_mode`);
      return !!data.talking_mouth_mode;
    } catch (error) {
      return null;
    }
  }

  // お喋り口モードのオン/オフを設定
  public async setTalkingMouthMode(enable: boolean): Promise<void> {
    if (!this.enableRos2Connection) return;
    await this.postWithTimeout(`${this.ros2HttpUrl}/talking_mouth_mode`, { talking_mouth_mode: enable });
  }

  // 口パターンの状態を取得
  public async fetchMouthPattern(): Promise<string | null> {
    if (!this.enableRos2Connection) return null;
    try {
      const data = await this.fetchWithCache(`${this.ros2HttpUrl}/mouth_pattern`);
      return data.mouth_pattern || null;
    } catch (error) {
      return null;
    }
  }

  // 口パターンを設定
  public async setMouthPattern(pattern: string): Promise<void> {
    if (!this.enableRos2Connection) return;
    await this.postWithTimeout(`${this.ros2HttpUrl}/mouth_pattern`, { mouth_pattern: pattern });
  }

  private isValidExpression(exp: string): boolean {
    return ['neutral', 'happy', 'angry', 'sad', 'surprised', 'crying', 'hurt', 'wink', 'mouth3', 'pien'].includes(exp);
  }

  private isValidMouthPattern(pattern: string): boolean {
    return ['mouth_a', 'mouth_i', 'mouth_o'].includes(pattern);
  }
}
