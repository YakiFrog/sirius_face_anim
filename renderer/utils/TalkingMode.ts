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
  private isRandomMode: boolean = false; // ランダムモードフラグ
  private minInterval: number = 150; // 最小切り替え間隔（ms）
  private maxInterval: number = 350; // 最大切り替え間隔（ms）
  
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
    this.startBounceAnimation();
    
    console.log(`✨ ${randomMode ? 'ランダム' : '順次'}おしゃべりモード開始`);
    
    // 最初のパターン変更をスケジュール
    this.scheduleNextPatternChange();
  }

  /**
   * 次のパターン変更をスケジュール
   */
  private scheduleNextPatternChange(): void {
    if (!this.isActive) return;
    
    // ランダムモードの場合は時間間隔もランダムに
    let interval = this.isRandomMode 
      ? Math.random() * (this.maxInterval - this.minInterval) + this.minInterval
      : this.switchInterval;
    
    // 「i」の口の場合は切り替え時間を短くする
    if (this.mouthPatterns[this.currentMouthPattern] === 'mouth_i') {
      interval *= 0.4; // 40%に短縮
    }
    
    this.intervalId = setTimeout(() => {
      if (!this.isActive) return;
      
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
      
      if (patternChanged) {
        this.startBounceAnimation();
        console.log(`口パターン変更: ${this.mouthPatterns[this.currentMouthPattern]} (${interval.toFixed(0)}ms後)`);
      } else {
        console.log(`口パターン変更なし: ${this.mouthPatterns[this.currentMouthPattern]} (同じパターンのためバウンスなし)`);
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
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.stopTimeoutId) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }
    
    console.log('🔇 おしゃべりモード停止');
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
