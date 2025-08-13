import { FacialExpression } from '../types/FaceAnimationTypes';

export class ExpressionManager {
  private manualExpressionRef: React.MutableRefObject<{ isManual: boolean; timeout: NodeJS.Timeout | null }>;
  private sendExpressionToRos2: (expression: FacialExpression) => Promise<void>;

  constructor(
    manualExpressionRef: React.MutableRefObject<{ isManual: boolean; timeout: NodeJS.Timeout | null }>,
    sendExpressionToRos2: (expression: FacialExpression) => Promise<void>
  ) {
    this.manualExpressionRef = manualExpressionRef;
    this.sendExpressionToRos2 = sendExpressionToRos2;
  }

  public setManualExpression(
    newExpression: FacialExpression,
    setExpression: (expression: FacialExpression) => void,
    eyeOverTapReactionRef: React.MutableRefObject<boolean>,
    eyeOverTapReactionStartTime: React.MutableRefObject<number>
  ) {
    console.log(`手動表情変更: ${newExpression}`);
    
    // 手動変更フラグをセット
    this.manualExpressionRef.current.isManual = true;
    
    // 既存のタイムアウトをクリア
    if (this.manualExpressionRef.current.timeout) {
      clearTimeout(this.manualExpressionRef.current.timeout);
    }
    
    // 表情を変更
    setExpression(newExpression);
    
    // ROS2サーバーにも新しい表情を送信
    this.sendExpressionToRos2(newExpression);
    
    // 過度なタップ反応中かチェック
    const now = Date.now();
    const isInOverTapReaction = eyeOverTapReactionRef.current && 
      (now - eyeOverTapReactionStartTime.current) < 10000;
    
    // 手動変更フラグの解除タイミングを調整
    if (isInOverTapReaction) {
      // 過度なタップ反応中は15秒後まで手動フラグを維持
      this.manualExpressionRef.current.timeout = setTimeout(() => {
        this.manualExpressionRef.current.isManual = false;
      }, 15000);
    } else {
      // 通常時は5秒後に手動変更フラグを解除
      this.manualExpressionRef.current.timeout = setTimeout(() => {
        this.manualExpressionRef.current.isManual = false;
      }, 5000);
    }
  }

  public cleanup() {
    if (this.manualExpressionRef.current.timeout) {
      clearTimeout(this.manualExpressionRef.current.timeout);
    }
  }
}
