import { FacialExpression } from '../types/FaceAnimationTypes';

export class EyeTapManager {
  private eyeTapTimestampsRef: React.MutableRefObject<number[]>;
  private eyeOverTapReactionRef: React.MutableRefObject<boolean>;
  private eyeOverTapReactionStartTime: React.MutableRefObject<number>;

  constructor(
    eyeTapTimestampsRef: React.MutableRefObject<number[]>,
    eyeOverTapReactionRef: React.MutableRefObject<boolean>,
    eyeOverTapReactionStartTime: React.MutableRefObject<number>
  ) {
    this.eyeTapTimestampsRef = eyeTapTimestampsRef;
    this.eyeOverTapReactionRef = eyeOverTapReactionRef;
    this.eyeOverTapReactionStartTime = eyeOverTapReactionStartTime;
  }

  public handleEyeTap(setManualExpression: (expression: FacialExpression) => void): boolean | string {
    const now = Date.now();
    
    // 現在時刻を記録
    this.eyeTapTimestampsRef.current.push(now);
    
    // 10秒より古いタップ記録を削除
    this.eyeTapTimestampsRef.current = this.eyeTapTimestampsRef.current.filter(
      timestamp => now - timestamp <= 10000
    );
    
    const recentTapCount = this.eyeTapTimestampsRef.current.length;
    console.log(`👁️ 目タップ回数（過去10秒）: ${recentTapCount}/10`);
    
    // 過度なタップ反応中かチェック
    const isInOverTapReaction = this.eyeOverTapReactionRef.current && 
      (now - this.eyeOverTapReactionStartTime.current) < 10000;
    
    if (isInOverTapReaction) {
      return 'in_reaction';
    }
    
    // タップ回数が7回以上になったら警告ログ
    if (recentTapCount >= 7 && recentTapCount < 10) {
      console.log(`⚠️ 警告: 目タップ回数が多くなっています (${recentTapCount}/10)`);
    }
    
    // 10回以上タップされた場合の反応
    if (recentTapCount >= 10 && !this.eyeOverTapReactionRef.current) {
      this.handleOverTapReaction(setManualExpression, recentTapCount);
      return true;
    }
    
    return false;
  }

  private handleOverTapReaction(setManualExpression: (expression: FacialExpression) => void, tapCount: number) {
    this.eyeOverTapReactionRef.current = true;
    this.eyeOverTapReactionStartTime.current = Date.now();
    
    // 怒りか泣きをランダムに選択
    const overTapExpressions: FacialExpression[] = ['angry', 'crying'];
    const randomExpression = overTapExpressions[Math.floor(Math.random() * overTapExpressions.length)];
    
    console.log(`🔥 過度なタップ検出！${tapCount}回 - 表情: ${randomExpression}`);
    setManualExpression(randomExpression);
    
    // 過度なタップ反応の表情を7-10秒間維持
    const expressionDuration = 7000 + Math.random() * 3000;
    
    setTimeout(() => {
      this.handleOverTapRecovery(setManualExpression);
    }, expressionDuration);
    
    // 12秒後にフラグをリセット
    setTimeout(() => {
      this.eyeOverTapReactionRef.current = false;
      this.eyeOverTapReactionStartTime.current = 0;
    }, 12000);
  }

  private handleOverTapRecovery(setManualExpression: (expression: FacialExpression) => void) {
    const currentTime = Date.now();
    const recentTapsAtRecovery = this.eyeTapTimestampsRef.current.filter(
      timestamp => currentTime - timestamp <= 10000
    );
    
    const lastTapTime = this.eyeTapTimestampsRef.current.length > 0 ? 
      Math.max(...this.eyeTapTimestampsRef.current) : 0;
    const timeSinceLastTap = currentTime - lastTapTime;
    
    if (recentTapsAtRecovery.length > 0 && timeSinceLastTap < 3000) {
      setManualExpression('hurt');
      setTimeout(() => {
        setManualExpression('neutral');
      }, 1500);
    } else {
      setManualExpression('neutral');
    }
  }

  public getRecentTapCount(): number {
    const now = Date.now();
    const recentTaps = this.eyeTapTimestampsRef.current.filter(
      timestamp => now - timestamp <= 10000
    );
    return recentTaps.length;
  }

  public cleanup() {
    this.eyeTapTimestampsRef.current = [];
    this.eyeOverTapReactionRef.current = false;
    this.eyeOverTapReactionStartTime.current = 0;
  }
}
