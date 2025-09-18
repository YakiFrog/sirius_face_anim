/**
 * おしゃべりモードの管理クラス（高速化・最適化版）
 * Sキーでトリガーされ、口の3パターンを切り替える
 */
export class TalkingMode {
  private isActive: boolean = false;
  private currentMouthPattern: number = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private mouthPatterns: string[] = ['mouth_a', 'mouth_i', 'mouth_o'];
  private switchInterval: number = 200; // 400ms→200msに高速化
  private isRandomMode: boolean = false;
  private minInterval: number = 80; // 150ms→80msに高速化
  private maxInterval: number = 180; // 350ms→180msに高速化
  
  // バウンスアニメーション用（高速化）
  private bounceStartTime: number = 0;
  private bounceAnimationDuration: number = 100; // 150ms→100msに高速化
  private isBouncing: boolean = false;
  
  // 停止待機用
  private pendingStop: boolean = false;
  private stopTimeoutId: NodeJS.Timeout | null = null;
  
  // パフォーマンス最適化用
  private lastPatternChangeTime: number = 0;
  private minChangeInterval: number = 50; // 最小変更間隔50ms

  constructor() {}

  /**
   * おしゃべりモードを開始（高速化版）
   */
  public start(randomMode: boolean = false): void {
    if (this.isActive) return;
    
    // 停止待機中の場合はキャンセル
    this.pendingStop = false;
    if (this.stopTimeoutId) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }
    
    this.isActive = true;
    this.isRandomMode = randomMode;
    this.currentMouthPattern = 0;
    this.lastPatternChangeTime = Date.now();
    this.startBounceAnimation();
    
    console.log(`✨ ${randomMode ? 'ランダム' : '順次'}おしゃべりモード開始（高速化版）`);
    
    // 最初のパターン変更をスケジュール
    this.scheduleNextPatternChange();
  }

  /**
   * 次のパターン変更をスケジュール（高速化版）
   */
  private scheduleNextPatternChange(): void {
    if (!this.isActive) return;
    
    // ランダムモードの場合は時間間隔もランダムに（短縮）
    let interval = this.isRandomMode 
      ? Math.random() * (this.maxInterval - this.minInterval) + this.minInterval
      : this.switchInterval;
    
    // 「i」の口の場合は切り替え時間を短くする（さらに短縮）
    if (this.mouthPatterns[this.currentMouthPattern] === 'mouth_i') {
      interval *= 0.3; // 40%→30%に短縮
    }
    
    // 最小間隔を保証
    interval = Math.max(interval, this.minChangeInterval);
    
    this.intervalId = setTimeout(() => {
      if (!this.isActive) return;
      
      const now = Date.now();
      
      // 前回の変更から十分な時間が経過していない場合はスキップ
      if (now - this.lastPatternChangeTime < this.minChangeInterval) {
        this.scheduleNextPatternChange();
        return;
      }
      
      let newPattern: number;
      
      if (this.isRandomMode) {
        // ランダムモード：0-2のランダムな値（前回と同じでも可）
        newPattern = Math.floor(Math.random() * this.mouthPatterns.length);
      } else {
        // 順次モード：順番に切り替え
        newPattern = (this.currentMouthPattern + 1) % this.mouthPatterns.length;
      }
      
      // パターンが実際に変わった場合のみバウンスアニメーションを実行
      const patternChanged = newPattern !== this.currentMouthPattern;
      this.currentMouthPattern = newPattern;
      this.lastPatternChangeTime = now;
      
      if (patternChanged) {
        this.startBounceAnimation();
        // console.log(`口パターン変更: ${this.mouthPatterns[this.currentMouthPattern]} (${interval.toFixed(0)}ms後)`);
      }
      
      // 次のパターン変更をスケジュール
      this.scheduleNextPatternChange();
    }, interval);
  }

  /**
   * バウンスアニメーションを開始
   */
  private startBounceAnimation(): void {
    this.isBouncing = true;
    this.bounceStartTime = Date.now();
  }

  /**
   * バウンススケールを計算（イージング関数付き・高速化版）
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
    
    // バウンスイージング関数（軽量化）
    // 1.0 → 1.05 → 1.0 の動きを作る（5%に減らして軽量化）
    const bounceHeight = 0.05; // 10%→5%に軽量化
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
   * おしゃべりモードを停止（高速化版）
   */
  public stop(): void {
    if (!this.isActive) return;
    
    // 現在アニメーション中の場合は停止を待機
    if (this.isBouncing) {
      this.pendingStop = true;
      // console.log('🔄 アニメーション完了待ち - おしゃべりモード停止予約');
      return;
    }
    
    // アニメーション中でない場合は即座に停止
    this.executeStop();
  }

  /**
   * 実際の停止処理を実行（高速化版）
   */
  private executeStop(): void {
    if (!this.isActive && !this.pendingStop) return;
    
    this.isActive = false;
    this.currentMouthPattern = 0;
    this.pendingStop = false;
    
    // 停止時にもバウンスアニメーションを開始
    this.startBounceAnimation();
    
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.stopTimeoutId) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }
    
    // console.log('🔇 おしゃべりモード停止（高速化版）');
  }

  /**
   * ランダムモードかどうかを取得
   */
  public getIsRandomMode(): boolean {
    return this.isRandomMode;
  }

  /**
   * ランダム時間間隔の範囲を設定
   */
  public setRandomIntervalRange(minMs: number, maxMs: number): void {
    this.minInterval = Math.max(minMs, 100); // 最小100ms
    this.maxInterval = Math.min(maxMs, 2000); // 最大2000ms
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
  public toggle(randomMode: boolean = false): void {
    if (this.isActive) {
      this.stop();
    } else {
      this.start(randomMode);
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
