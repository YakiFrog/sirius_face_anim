/**
 * おしゃべりモードの管理クラス
 * Sキーでトリガーされ、口の3パターンを切り替える
 */
export class TalkingMode {
  private isActive: boolean = false;
  private currentMouthPattern: number = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private mouthPatterns: string[] = ['mouth_a', 'mouth_i', 'mouth_o'];
  private switchInterval: number = 300; // 300msごとに切り替え

  constructor() {}

  /**
   * おしゃべりモードを開始
   */
  public start(): void {
    if (this.isActive) return;
    
    this.isActive = true;
    this.currentMouthPattern = 0;
    
    console.log('✨ おしゃべりモード開始');
    
    // 定期的に口のパターンを切り替え
    this.intervalId = setInterval(() => {
      this.currentMouthPattern = (this.currentMouthPattern + 1) % this.mouthPatterns.length;
      console.log(`口パターン変更: ${this.mouthPatterns[this.currentMouthPattern]}`);
    }, this.switchInterval);
  }

  /**
   * おしゃべりモードを停止
   */
  public stop(): void {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.currentMouthPattern = 0;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
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
    this.stop();
  }
}
