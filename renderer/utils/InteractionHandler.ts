import { FacialExpression } from '../types/FaceAnimationTypes';
import { GeometryUtils } from './GeometryUtils';

export class InteractionHandler {
  private canvasRef: React.RefObject<HTMLCanvasElement>;
  private fullScreen: boolean;
  private dimensions: { width: number; height: number };

  // ドラッグ関連の状態
  private dragStartRef: React.MutableRefObject<{ x: number, y: number, time: number } | null>;
  private dragCurrentRef: React.MutableRefObject<{ x: number, y: number } | null>;
  private isDraggingRef: React.MutableRefObject<boolean>;
  private dragTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;

  // タップ関連の状態
  private tapTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  private noseTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  private cornerTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  private preHurtExpressionRef: React.MutableRefObject<FacialExpression>;

  // 瞳制御関連の状態
  private manualPupilTargetRef: React.MutableRefObject<{ x: number, y: number } | null>;
  private manualPupilTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;

  constructor(
    canvasRef: React.RefObject<HTMLCanvasElement>,
    fullScreen: boolean,
    dimensions: { width: number; height: number },
    refs: {
      dragStartRef: React.MutableRefObject<{ x: number, y: number, time: number } | null>;
      dragCurrentRef: React.MutableRefObject<{ x: number, y: number } | null>;
      isDraggingRef: React.MutableRefObject<boolean>;
      dragTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
      tapTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
      noseTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
      cornerTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
      preHurtExpressionRef: React.MutableRefObject<FacialExpression>;
      manualPupilTargetRef: React.MutableRefObject<{ x: number, y: number } | null>;
      manualPupilTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
    }
  ) {
    this.canvasRef = canvasRef;
    this.fullScreen = fullScreen;
    this.dimensions = dimensions;
    
    // refs を展開して代入
    this.dragStartRef = refs.dragStartRef;
    this.dragCurrentRef = refs.dragCurrentRef;
    this.isDraggingRef = refs.isDraggingRef;
    this.dragTimeoutRef = refs.dragTimeoutRef;
    this.tapTimeoutRef = refs.tapTimeoutRef;
    this.noseTimeoutRef = refs.noseTimeoutRef;
    this.cornerTimeoutRef = refs.cornerTimeoutRef;
    this.preHurtExpressionRef = refs.preHurtExpressionRef;
    this.manualPupilTargetRef = refs.manualPupilTargetRef;
    this.manualPupilTimeoutRef = refs.manualPupilTimeoutRef;
  }

  /**
   * タップイベントのハンドラ
   */
  public handleTap = (
    event: any,
    eyePositions: any,
    eyeHitRadius: number,
    eyeSize: number,
    setManualExpression: (expression: FacialExpression) => void,
    handleEyeTap: () => boolean | string
  ) => {
    // ドラッグ中の場合はタップ処理をスキップ
    if (this.isDraggingRef.current) {
      return;
    }
    
    const coordinates = this.extractEventCoordinates(event);
    if (!coordinates) return;

    const { x, y } = coordinates;

    // 目、鼻、四隅の当たり判定を実行
    const hitResult = this.detectHitAreas(x, y, eyePositions, eyeHitRadius, eyeSize);
    
    if (hitResult.type === 'nose') {
      this.handleNoseTap(setManualExpression);
    } else if (hitResult.type === 'eye') {
      this.handleEyeTapEvent(setManualExpression, handleEyeTap);
    } else if (hitResult.type === 'corner') {
      this.handleCornerTap(hitResult.corner!, setManualExpression);
    } else {
      // 瞳孔移動
      this.handlePupilMovement(x, y, eyeSize);
    }
  };

  /**
   * ドラッグ開始イベントのハンドラ
   */
  public handleDragStart = (event: any) => {
    const coordinates = this.extractEventCoordinates(event);
    if (!coordinates) return;
    
    const { x, y } = coordinates;
    
    this.dragStartRef.current = { x, y, time: Date.now() };
    this.dragCurrentRef.current = { x, y };
    this.isDraggingRef.current = false;
  };

  /**
   * ドラッグ中イベントのハンドラ
   */
  public handleDragMove = (event: any) => {
    if (!this.dragStartRef.current) return;
    
    const coordinates = this.extractEventCoordinates(event);
    if (!coordinates) return;
    
    const { x, y } = coordinates;
    this.dragCurrentRef.current = { x, y };
    
    // ドラッグ距離を計算
    const distance = GeometryUtils.calculateDistance(
      this.dragStartRef.current,
      { x, y }
    );
    
    const dragThreshold = 20;
    if (distance > dragThreshold && !this.isDraggingRef.current) {
      this.isDraggingRef.current = true;
      // ドラッグ開始処理をここに追加
    }
  };

  /**
   * ドラッグ終了イベントのハンドラ
   */
  public handleDragEnd = (event: any, setManualExpression: (expression: FacialExpression) => void) => {
    if (!this.dragStartRef.current || !this.dragCurrentRef.current) {
      this.resetDragState();
      return;
    }
    
    // ドラッグ処理の実装
    if (this.isDraggingRef.current) {
      const distance = GeometryUtils.calculateDistance(
        this.dragStartRef.current,
        this.dragCurrentRef.current
      );
      
      const isOutsideEyes = this.checkIfDragOutsideEyes(
        this.dragStartRef.current,
        this.dragCurrentRef.current
      );
      
      if (isOutsideEyes && distance > 20) {
        // 撫で動作終了処理
        if (this.dragTimeoutRef.current) {
          clearTimeout(this.dragTimeoutRef.current);
        }
        
        this.dragTimeoutRef.current = setTimeout(() => {
          setManualExpression('neutral');
        }, 2000);
      }
    }
    
    this.resetDragState();
  };

  private extractEventCoordinates(event: any) {
    let touchEvent;
    if (event.touches && event.touches.length > 0) {
      touchEvent = event.touches[0];
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      touchEvent = event.changedTouches[0];
    } else {
      touchEvent = event;
    }
    
    return GeometryUtils.convertEventCoordinates(
      touchEvent,
      this.canvasRef,
      this.fullScreen,
      this.dimensions
    );
  }

  private detectHitAreas(
    x: number,
    y: number,
    eyePositions: any,
    eyeHitRadius: number,
    eyeSize: number
  ) {
    // 目の当たり判定
    const isLeftEye = GeometryUtils.isPointInCircle(
      { x, y },
      eyePositions.left,
      eyeHitRadius
    );
    const isRightEye = GeometryUtils.isPointInCircle(
      { x, y },
      eyePositions.right,
      eyeHitRadius
    );
    
    if (isLeftEye || isRightEye) {
      return { type: 'eye' };
    }
    
    // 鼻の当たり判定
    const noseCenterX = (eyePositions.left.x + eyePositions.right.x) / 2;
    const noseCenterY = eyePositions.left.y + eyeSize * 0.3;
    const noseHitRadius = eyeSize * 0.15;
    
    const isNose = GeometryUtils.isPointInCircle(
      { x, y },
      { x: noseCenterX, y: noseCenterY },
      noseHitRadius
    );
    
    if (isNose) {
      return { type: 'nose' };
    }
    
    // 四隅の当たり判定
    const cornerRadius = 200;
    
    if (x > this.dimensions.width - cornerRadius && y > this.dimensions.height - cornerRadius) {
      return { type: 'corner', corner: 'bottom-right' };
    }
    if (x < cornerRadius && y > this.dimensions.height - cornerRadius) {
      return { type: 'corner', corner: 'bottom-left' };
    }
    if (x > this.dimensions.width - cornerRadius && y < cornerRadius) {
      return { type: 'corner', corner: 'top-right' };
    }
    
    return { type: 'other' };
  }

  private handleNoseTap(setManualExpression: (expression: FacialExpression) => void) {
    setManualExpression('surprised');
    
    if (this.noseTimeoutRef.current) {
      clearTimeout(this.noseTimeoutRef.current);
    }
    this.noseTimeoutRef.current = setTimeout(() => {
      setManualExpression('neutral');
    }, 2000);
  }

  private handleEyeTapEvent(
    setManualExpression: (expression: FacialExpression) => void,
    handleEyeTap: () => boolean | string
  ) {
    const tapResult = handleEyeTap();
    
    if (tapResult === true || tapResult === 'in_reaction') {
      return;
    }
    
    // hurt表情でない場合のみ、現在の表情を記録
    if (this.preHurtExpressionRef.current !== 'hurt') {
      // 現在の表情を記録（実装は元のコードを参照）
    }
    
    setManualExpression('hurt');
    
    if (this.tapTimeoutRef.current) {
      clearTimeout(this.tapTimeoutRef.current);
    }
    this.tapTimeoutRef.current = setTimeout(() => {
      const restoreExpression = this.preHurtExpressionRef.current;
      setManualExpression(restoreExpression);
    }, 1000);
  }

  private handleCornerTap(
    corner: string,
    setManualExpression: (expression: FacialExpression) => void
  ) {
    let expression: FacialExpression = 'neutral';
    
    switch (corner) {
      case 'bottom-right':
        expression = 'mouth3';
        break;
      case 'bottom-left':
        expression = 'wink';
        break;
      case 'top-right':
        expression = 'crying';
        break;
    }
    
    setManualExpression(expression);
    
    if (this.cornerTimeoutRef.current) {
      clearTimeout(this.cornerTimeoutRef.current);
    }
    this.cornerTimeoutRef.current = setTimeout(() => {
      setManualExpression('neutral');
    }, 3000);
  }

  private handlePupilMovement(x: number, y: number, eyeSize: number) {
    const centerX = this.dimensions.width / 2;
    const centerY = this.dimensions.height / 2;
    
    const deltaX = x - centerX;
    const deltaY = y - centerY;
    
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxRadius = eyeSize / 10;
    
    let targetX, targetY;
    if (distance > 0) {
      const scale = Math.min(distance, maxRadius * 3) / distance;
      targetX = deltaX * scale * 0.15;
      targetY = deltaY * scale * 0.15;
    } else {
      targetX = 0;
      targetY = 0;
    }
    
    this.manualPupilTargetRef.current = { x: targetX, y: targetY };
    
    if (this.manualPupilTimeoutRef.current) {
      clearTimeout(this.manualPupilTimeoutRef.current);
    }
    
    this.manualPupilTimeoutRef.current = setTimeout(() => {
      this.manualPupilTargetRef.current = null;
    }, 3000);
  }

  private checkIfDragOutsideEyes(
    start: { x: number, y: number },
    end: { x: number, y: number }
  ): boolean {
    // 基本的な計算で位置を推定（簡略化版）
    const scale = 1; // scaleFactorRef.currentの代替値
    const baseEyeSize = 1920 / 4.5;
    const baseEyeSpacing = baseEyeSize * 1;
    const baseEyeYOffset = 1080 / 8;
    
    const eyeSize = baseEyeSize * scale * 1.2;
    const eyeSpacing = baseEyeSpacing * scale * 1.0; // eyeSpacingFactor
    const eyeYOffset = baseEyeYOffset * scale;
    
    const eyePositions = {
      left: { 
        x: this.dimensions.width / 2 - eyeSpacing, 
        y: this.dimensions.height / 2 - eyeYOffset 
      },
      right: { 
        x: this.dimensions.width / 2 + eyeSpacing, 
        y: this.dimensions.height / 2 - eyeYOffset 
      }
    };
    const eyeHitRadius = eyeSize * 0.5;
    
    // ドラッグの開始点と終了点の両方が目の外かチェック
    const startOutside = !this.isPointInEye(start, eyePositions, eyeHitRadius);
    const endOutside = !this.isPointInEye(end, eyePositions, eyeHitRadius);
    
    return startOutside && endOutside;
  }

  private isPointInEye(
    point: { x: number, y: number }, 
    eyePositions: any, 
    radius: number
  ): boolean {
    const distanceToLeftEye = Math.sqrt(
      Math.pow(point.x - eyePositions.left.x, 2) + Math.pow(point.y - eyePositions.left.y, 2)
    );
    const distanceToRightEye = Math.sqrt(
      Math.pow(point.x - eyePositions.right.x, 2) + Math.pow(point.y - eyePositions.right.y, 2)
    );
    
    return distanceToLeftEye <= radius || distanceToRightEye <= radius;
  }

  private resetDragState() {
    this.dragStartRef.current = null;
    this.dragCurrentRef.current = null;
    this.isDraggingRef.current = false;
  }

  public cleanup() {
    if (this.dragTimeoutRef.current) clearTimeout(this.dragTimeoutRef.current);
    if (this.tapTimeoutRef.current) clearTimeout(this.tapTimeoutRef.current);
    if (this.noseTimeoutRef.current) clearTimeout(this.noseTimeoutRef.current);
    if (this.cornerTimeoutRef.current) clearTimeout(this.cornerTimeoutRef.current);
    if (this.manualPupilTimeoutRef.current) clearTimeout(this.manualPupilTimeoutRef.current);
  }
}
