/**
 * 口パターン制御クラス
 * 表情の目部分を保持したまま、口だけをa、i、oパターンに変更する
 */
export class MouthPatternController {
  private currentMouthPattern: string | null = null;
  private isActive: boolean = false;
  
  // バウンスアニメーション用
  private bounceStartTime: number = 0;
  private bounceAnimationDuration: number = 150; // 150msのアニメーション
  private isBouncing: boolean = false;

  constructor() {}

  /**
   * 口パターンを設定
   */
  public setMouthPattern(pattern: 'mouth_a' | 'mouth_i' | 'mouth_o' | null): void {
    // パターンが変わった場合のみバウンスアニメーションを実行
    const patternChanged = pattern !== this.currentMouthPattern;
    
    this.currentMouthPattern = pattern;
    this.isActive = pattern !== null;
    
    if (patternChanged) {
      this.startBounceAnimation();
      console.log(`口パターン変更: ${pattern || 'なし'}`);
    }
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
