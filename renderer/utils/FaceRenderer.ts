import { EyeParameters, FacialExpression } from '../types/FaceAnimationTypes';

export class FaceRenderer {
  private baseWidth = 1920;
  private baseHeight = 1080;

  constructor(
    private scaleFactorRef: React.MutableRefObject<number>,
    private dimensions: { width: number; height: number }
  ) {}

  /**
   * 目のパラメータを計算する関数
   */
  public calculateEyeParameters(eyeSpacingFactor: number): EyeParameters {
    const baseEyeSize = this.baseWidth / 4.5;
    const baseEyeSpacing = baseEyeSize * 1;
    const basePupilSize = baseEyeSize / 2.3;
    const baseEyeYOffset = this.baseHeight / 8;
    
    const eyeSizeFactor = 1.2;
    const scale = this.scaleFactorRef.current;
    
    return {
      eyeSize: baseEyeSize * scale * eyeSizeFactor,
      eyeSpacing: baseEyeSpacing * scale * eyeSpacingFactor,
      pupilSize: basePupilSize * scale * eyeSizeFactor,
      eyeYOffset: baseEyeYOffset * scale,
      easeFactor: 0.75,
      eyeRadius: (baseEyeSize / 10) * scale
    };
  }

  /**
   * 正確な目の位置を計算する関数
   */
  public calculateEyePositions(
    params: EyeParameters,
    expression: FacialExpression,
    headMovement: { x: number; y: number }
  ) {
    // 表情に応じた目のY位置オフセットを計算
    let eyeYOffset = 0;
    switch (expression) {
      case 'neutral':
        eyeYOffset = 0;
        break;
      case 'happy':
        eyeYOffset = -params.eyeSize * 0.05;
        break;
      case 'angry':
        eyeYOffset = params.eyeSize * 0.1;
        break;
      case 'sad':
        eyeYOffset = params.eyeSize * 0.15;
        break;
      case 'surprised':
        eyeYOffset = -params.eyeSize * 0.1;
        break;
      case 'crying':
        eyeYOffset = params.eyeSize * 0.1;
        break;
      case 'hurt':
        eyeYOffset = params.eyeSize * 0.10;
        break;
      case 'wink':
      case 'mouth3':
      case 'pien':
        eyeYOffset = 0;
        break;
    }
    
    // 左目の中心位置
    const leftEyeCenterX = this.dimensions.width / 2 - params.eyeSpacing + headMovement.x;
    const leftEyeCenterY = this.dimensions.height / 2 - params.eyeYOffset + eyeYOffset + headMovement.y;
    
    // 右目の中心位置
    const rightEyeCenterX = this.dimensions.width / 2 + params.eyeSpacing + headMovement.x;
    const rightEyeCenterY = this.dimensions.height / 2 - params.eyeYOffset + eyeYOffset + headMovement.y;
    
    return {
      left: { x: leftEyeCenterX, y: leftEyeCenterY },
      right: { x: rightEyeCenterX, y: rightEyeCenterY },
      eyeYOffset
    };
  }

  /**
   * 頭の動きを更新する関数
   */
  public updateHeadMovement(
    p5: any,
    headMovement: { x: number; y: number; targetX: number; targetY: number; timer: number },
    expressionAnim: { active: boolean; intensity: number; direction: number; jumpCount: number; maxJumps: number },
    expression: FacialExpression
  ) {
    // 表情変更のぴょんぴょんアニメーション処理
    if (expressionAnim.active) {
      if (expressionAnim.direction > 0) {
        expressionAnim.intensity += 0.08;
        if (expressionAnim.intensity > 1) {
          expressionAnim.direction = -1;
        }
      } else {
        expressionAnim.intensity -= 0.12;
        if (expressionAnim.intensity < 0) {
          expressionAnim.intensity = 0;
          expressionAnim.jumpCount++;
          
          if (expressionAnim.jumpCount >= expressionAnim.maxJumps) {
            expressionAnim.active = false;
          } else {
            expressionAnim.direction = 1;
          }
        }
      }
      
      // ジャンプの高さと横の動きを表情ごとに調整
      const { jumpHeight, jumpX } = this.calculateJumpMovement(expression, expressionAnim);
      
      p5.push();
      p5.translate(headMovement.x + jumpX, headMovement.y - jumpHeight);
      return;
    }
    
    // 通常の頭の動き処理
    this.updateNormalHeadMovement(p5, headMovement);
  }

  private calculateJumpMovement(
    expression: FacialExpression,
    expressionAnim: { intensity: number }
  ): { jumpHeight: number; jumpX: number } {
    let jumpHeight = 0;
    let jumpX = 0;
    
    switch (expression) {
      case 'happy':
        jumpHeight = this.scaleFactorRef.current * 
          (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 30;
        break;
      case 'surprised':
        jumpHeight = this.scaleFactorRef.current * 
          (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 25;
        jumpX = Math.sin(expressionAnim.intensity * Math.PI * 2) * 8 * this.scaleFactorRef.current;
        break;
      case 'angry':
        jumpHeight = this.scaleFactorRef.current * 
          (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 15;
        jumpX = Math.sin(expressionAnim.intensity * Math.PI * 5) * 6 * this.scaleFactorRef.current;
        break;
      case 'sad':
        jumpHeight = this.scaleFactorRef.current * 
          (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 10;
        break;
      case 'crying':
        jumpHeight = this.scaleFactorRef.current * 
          (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 12;
        jumpX = Math.sin(expressionAnim.intensity * Math.PI * 8) * 3 * this.scaleFactorRef.current;
        break;
      case 'hurt':
        jumpHeight = this.scaleFactorRef.current * 
          (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 18;
        jumpX = Math.sin(expressionAnim.intensity * Math.PI * 12) * 9 * this.scaleFactorRef.current;
        break;
      case 'wink':
        jumpHeight = this.scaleFactorRef.current * 
          (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 22;
        jumpX = Math.sin(expressionAnim.intensity * Math.PI * 3) * 4 * this.scaleFactorRef.current;
        break;
      default:
        jumpHeight = this.scaleFactorRef.current * 
          (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 15;
    }
    
    return { jumpHeight, jumpX };
  }

  private updateNormalHeadMovement(
    p5: any,
    headMovement: { x: number; y: number; targetX: number; targetY: number; timer: number }
  ) {
    headMovement.timer -= 1;
    if (headMovement.timer <= 0) {
      const moveRange = this.scaleFactorRef.current * 1.5;
      headMovement.targetX = (Math.random() * 2 - 1) * moveRange;
      headMovement.targetY = (Math.random() * 2 - 1) * moveRange;
      headMovement.timer = Math.floor(Math.random() * 240) + 180;
    }
    
    const easing = 0.01;
    headMovement.x += (headMovement.targetX - headMovement.x) * easing;
    headMovement.y += (headMovement.targetY - headMovement.y) * easing;
    
    const breathingEffect = Math.sin(p5.frameCount * 0.008) * this.scaleFactorRef.current * 0.2; // 0.5 → 0.2に減少
    headMovement.y += breathingEffect;

    p5.push();
    p5.translate(headMovement.x, headMovement.y);
  }
}
