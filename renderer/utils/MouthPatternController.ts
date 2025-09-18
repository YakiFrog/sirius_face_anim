/**
 * 口パターン制御クラス（高速化・最適化版）
 * 表情の目部分を保持したまま、口だけをa、i、oパターンに変更する
 */
export class MouthPatternController {
  private currentMouthPattern: string | null = null;
  private isActive: boolean = false;
  
  // バウンスアニメーション用（高速化）
  private bounceStartTime: number = 0;
  private bounceAnimationDuration: number = 50;
  private isBouncing: boolean = false;
  
  // パフォーマンス最適化用
  private lastPatternChangeTime: number = 0;
  private minChangeInterval: number = 30; // 最小変更間隔30ms

  constructor() {}

  /**
   * 口パターンを設定（高速化版）
   */
  public setMouthPattern(pattern: 'mouth_a' | 'mouth_i' | 'mouth_o' | null): void {
    const now = Date.now();
    
    // 頻繁な変更を制限
    if (now - this.lastPatternChangeTime < this.minChangeInterval) {
      return;
    }
    
    // パターンが変わった場合のみバウンスアニメーションを実行
    const patternChanged = pattern !== this.currentMouthPattern;
    
    this.currentMouthPattern = pattern;
    this.isActive = pattern !== null;
    this.lastPatternChangeTime = now;
    
    if (patternChanged) {
      this.startBounceAnimation();
      // console.log(`口パターン変更: ${pattern || 'なし'}（高速化版）`);
    }
  }

  /**
   * バウンスアニメーションを開始（高速化版）
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
   * 口パターン制御がアクティブかどうか
   */
  public getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * 現在の口のパターンを取得
   */
  public getCurrentMouthPattern(): string | null {
    return this.currentMouthPattern;
  }

  /**
   * 口パターンをクリア
   */
  public clear(): void {
    this.setMouthPattern(null);
  }

  /**
   * クリーンアップ
   */
  public cleanup(): void {
    this.clear();
  }
}
