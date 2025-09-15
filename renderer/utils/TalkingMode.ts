/**
 * おしゃべりモードの管理クラス
 * Sキーでトリガーされ、口の3パターンを切り替える
 */
export class TalkingMode {
  private isActive: boolean = false;
  private currentMouthPattern: number = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private mouthPatterns: string[] = ['mouth_a', 'mouth_i', 'mouth_o'];
  private switchInterval: number = 400; // 400msごとに切り替え
  
  // バウンスアニメーション用
  private bounceStartTime: number = 0;
  private bounceAnimationDuration: number = 150; // 150msのアニメーション
  private isBouncing: boolean = false;
  
  // 停止待機用
  private pendingStop: boolean = false;
  private stopTimeoutId: NodeJS.Timeout | null = null;

  constructor() {}

  /**
   * おしゃべりモードを開始
   */
  public start(): void {
    if (this.isActive) return;
    
    // 停止待機中の場合はキャンセル
    this.pendingStop = false;
    if (this.stopTimeoutId) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }
    
    this.isActive = true;
    this.currentMouthPattern = 0;
    this.startBounceAnimation();
    
    console.log('✨ おしゃべりモード開始');
    
    // 定期的に口のパターンを切り替え
    this.intervalId = setInterval(() => {
      this.currentMouthPattern = (this.currentMouthPattern + 1) % this.mouthPatterns.length;
      this.startBounceAnimation();
      console.log(`口パターン変更: ${this.mouthPatterns[this.currentMouthPattern]}`);
    }, this.switchInterval);
  }

  /**
   * バウンスアニメーションを開始
   */
  private startBounceAnimation(): void {
    this.isBouncing = true;
    this.bounceStartTime = Date.now();
  }

  /**
   * バウンススケールを計算（イージング関数付き）
   */
  public getBounceScale(): number {
    if (!this.isBouncing) return 1.0;
    
    const elapsed = Date.now() - this.bounceStartTime;
    const progress = Math.min(elapsed / this.bounceAnimationDuration, 1.0);
    
    if (progress >= 1.0) {
      this.isBouncing = false;
      
      // アニメーション完了時に停止待機中だった場合、実際に停止する
      if (this.pendingStop) {
        this.executeStop();
      }
      
      return 1.0;
    }
    
    // バウンスイージング関数
    // 1.0 → 1.1 → 1.0 の動きを作る
    const bounceHeight = 0.1; // 10%拡大
    const bounceScale = 1.0 + bounceHeight * Math.sin(progress * Math.PI);
    
    return bounceScale;
  }

  /**
   * アニメーション中かどうか
   */
  public getIsBouncing(): boolean {
    return this.isBouncing;
  }

  /**
   * おしゃべりモードを停止
   */
  public stop(): void {
    if (!this.isActive) return;
    
    // 現在アニメーション中の場合は停止を待機
    if (this.isBouncing) {
      this.pendingStop = true;
      console.log('🔄 アニメーション完了待ち - おしゃべりモード停止予約');
      return;
    }
    
    // アニメーション中でない場合は即座に停止
    this.executeStop();
  }

  /**
   * 実際の停止処理を実行
   */
  private executeStop(): void {
    if (!this.isActive && !this.pendingStop) return;
    
    this.isActive = false;
    this.currentMouthPattern = 0;
    this.pendingStop = false;
    
    // 停止時にもバウンスアニメーションを開始
    this.startBounceAnimation();
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.stopTimeoutId) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }
    
    console.log('🔇 おしゃべりモード停止');
  }

  /**
   * おしゃべりモードがアクティブかどうか
   */
  public getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * 現在の口のパターンを取得
   */
  public getCurrentMouthPattern(): string {
    return this.mouthPatterns[this.currentMouthPattern];
  }

  /**
   * おしゃべりモードの切り替え
   */
  public toggle(): void {
    if (this.isActive) {
      this.stop();
    } else {
      this.start();
    }
  }

  /**
   * クリーンアップ
   */
  public cleanup(): void {
    this.pendingStop = false;
    if (this.stopTimeoutId) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }
    this.executeStop();
  }
}
