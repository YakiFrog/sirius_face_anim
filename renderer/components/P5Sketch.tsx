import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { P5SketchProps, FacialExpression, BlinkState } from '../types/FaceAnimationTypes';
import { ROS2Connection } from '../utils/ROS2Connection';
import { ExpressionManager } from '../utils/ExpressionManager';
import { EyeTapManager } from '../utils/EyeTapManager';
import { FaceRenderer } from '../utils/FaceRenderer';
import { InteractionHandler } from '../utils/InteractionHandler';
import { KeyboardHandler } from '../utils/KeyboardHandler';

// p5はクライアントサイドでのみ実行されるため、dynamic importを使用
const Sketch = dynamic(() => import('react-p5').then((mod) => mod.default), {
  ssr: false,
});

export const P5Sketch: React.FC<P5SketchProps> = ({ 
  fullScreen = true, 
  width = 400, 
  height = 400,
  eyeSpacingFactor = 1.0,
  enableRos2Connection = true,
  ros2HttpUrl = 'http://localhost:9090',
  displayMode = 'face',
  imagePath = '',
  imageScaleMode = 'fit',
  imageOpacity = 1.0,
  onDisplayModeToggle,
  onImagePathChange
}) => {
  // 基本状態
  const [dimensions, setDimensions] = useState({ width, height });
  const [expression, setExpression] = useState<FacialExpression>('neutral');
  const [blinkState, setBlinkState] = useState<BlinkState>('normal');
  const [cursorVisible, setCursorVisible] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('切断');
  const [showHitBoxes, setShowHitBoxes] = useState(false);
  const [showTapCount, setShowTapCount] = useState(false); // デフォルトで非表示
  const [showStrokingTime, setShowStrokingTime] = useState(false); // デフォルトで非表示に変更
  const [isDragging, setIsDragging] = useState(false);
  const [strokingTime, setStrokingTime] = useState<number>(0);
  const [notification, setNotification] = useState<string | null>(null);
  const [savedMousePosition, setSavedMousePosition] = useState<{ x: number, y: number } | null>(null);
  const [loadedImage, setLoadedImage] = useState<any>(null);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scaleFactorRef = useRef(1);
  const blinkRef = useRef(1);
  const prevExpressionRef = useRef<FacialExpression>('neutral');
  const showHitBoxesRef = useRef(false);
  const showStrokingTimeRef = useRef(false); // デフォルトで非表示に変更
  const showTapCountRef = useRef(false); // タップ数表示用Ref
  const savedMousePositionRef = useRef<{ x: number, y: number } | null>(null);
  const loadedImageRef = useRef<any>(null);
  const lastActionTimeRef = useRef<number>(0);
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const strokingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // 複雑な状態のrefs
  const manualExpressionRef = useRef({ isManual: false, timeout: null });
  const headMovementRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, timer: 0 });
  const expressionAnimRef = useRef({ 
    active: false, timer: 0, intensity: 0, direction: 1, jumpCount: 0, maxJumps: 0 
  });
  const eyeTapTimestampsRef = useRef<number[]>([]);
  const eyeOverTapReactionRef = useRef(false);
  const eyeOverTapReactionStartTime = useRef<number>(0);
  const preHurtExpressionRef = useRef<FacialExpression>('neutral');

  // Picture-in-Picture functionality
  const togglePictureInPicture = () => {
    if (document.pictureInPictureEnabled && canvasRef.current) {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(console.error);
      } else {
        // Type assertion for canvas element with PiP support
        const canvas = canvasRef.current as any;
        if (canvas.requestPictureInPicture) {
          canvas.requestPictureInPicture().catch(console.error);
        }
      }
    }
  };
  
  // インタラクション関連のrefs
  const dragStartRef = useRef<{ x: number, y: number, time: number } | null>(null);
  const dragCurrentRef = useRef<{ x: number, y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const noseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cornerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const manualPupilTargetRef = useRef<{ x: number, y: number } | null>(null);
  const manualPupilTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const strokingExpressionTimerSet = useRef(false); // 撫で表情タイマーが設定済みかの追跡

  // 撫で時間に応じて表情を段階的に変更する関数
  const updateExpressionByStrokingTime = (strokingTimeSeconds: number) => {
    // 撫でている間のみ表情を変更
    if (!isDraggingRef.current) return;
    
    // 2秒以上撫でている場合、2秒ごとに表情をランダムに変更
    if (strokingTimeSeconds >= 2.0) {
      const intervalSeconds = 2;
      const intervalCount = Math.floor(strokingTimeSeconds / intervalSeconds);
      const currentInterval = intervalCount * intervalSeconds;

      // 2秒ごとに新しい表情に変更（小数点以下0.2秒以内の時にのみ実行）
      if (Math.abs(strokingTimeSeconds - currentInterval) < 0.2) {
        const expressions: FacialExpression[] = ['happy', 'wink'];
        const randomExpression = expressions[Math.floor(Math.random() * expressions.length)];

        // 現在の表情と異なる場合のみ変更（連続して同じ表情を避ける）
        if (randomExpression !== expression) {
          console.log(`💫 撫で時間 ${strokingTimeSeconds.toFixed(1)}秒 - 表情を${randomExpression}に変更`);
          expressionManager.current?.setManualExpression(
            randomExpression,
            setExpression,
            eyeOverTapReactionRef,
            eyeOverTapReactionStartTime
          );
        } else {
          // 同じ表情の場合は反対の表情に変更
          const alternateExpression = randomExpression === 'happy' ? 'wink' : 'happy';
          console.log(`💫 撫で時間 ${strokingTimeSeconds.toFixed(1)}秒 - 表情を${alternateExpression}に変更（重複回避）`);
          expressionManager.current?.setManualExpression(
            alternateExpression,
            setExpression,
            eyeOverTapReactionRef,
            eyeOverTapReactionStartTime
          );
        }
      }
    }
  };
  
  // ユーティリティクラスのインスタンス
  const ros2Connection = useRef<ROS2Connection | null>(null);
  const expressionManager = useRef<ExpressionManager | null>(null);
  const eyeTapManager = useRef<EyeTapManager | null>(null);
  const faceRenderer = useRef<FaceRenderer | null>(null);
  const interactionHandler = useRef<InteractionHandler | null>(null);
  const keyboardHandler = useRef<KeyboardHandler | null>(null);

  // 基準サイズ（16:9比率）
  const baseWidth = 1920;
  const baseHeight = 1080;

  // カスタムドラッグイベントハンドラー
  const handleCustomDragStart = (event) => {
    let touchEvent;
    if (event.touches && event.touches.length > 0) {
      touchEvent = event.touches[0];
    } else {
      touchEvent = event;
    }
    
    const coordinates = convertEventCoordinates(touchEvent);
    if (!coordinates) return;
    
    const { x, y } = coordinates;
    
    dragStartRef.current = { x, y, time: Date.now() };
    dragCurrentRef.current = { x, y };
    setIsDragging(false);
    isDraggingRef.current = false;
    strokingExpressionTimerSet.current = false;
    
    console.log('ドラッグ開始候補:', { x, y });
  };

  const handleCustomDragMove = (event) => {
    if (!dragStartRef.current) return;
    
    let touchEvent;
    if (event.touches && event.touches.length > 0) {
      touchEvent = event.touches[0];
    } else {
      touchEvent = event;
    }
    
    const coordinates = convertEventCoordinates(touchEvent);
    if (!coordinates) return;
    
    const { x, y } = coordinates;
    dragCurrentRef.current = { x, y };
    
    // ドラッグ距離を計算
    const deltaX = x - dragStartRef.current.x;
    const deltaY = y - dragStartRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    const dragThreshold = 20;
    if (distance > dragThreshold && !isDraggingRef.current) {
      setIsDragging(true);
      isDraggingRef.current = true;
      console.log('ドラッグ開始検出:', { distance, start: dragStartRef.current, current: { x, y } });
      
      // ドラッグ開始時に撫で動作の条件をチェック
      const duration = Date.now() - dragStartRef.current.time;
      const isOutsideEyes = checkIfDragOutsideEyes(dragStartRef.current, { x, y });
      
      console.log('撫で動作チェック:', { distance, duration, isOutsideEyes });
      
      if (isOutsideEyes && distance > 20 && !strokingExpressionTimerSet.current) {
        console.log('✅ 撫で動作条件満たしました！（初回のみ）');
        strokingExpressionTimerSet.current = true;
        
        // 撫で時間の計測を開始
        setStrokingTime(0);
        
        if (strokingTimerRef.current) {
          clearInterval(strokingTimerRef.current);
        }
        
        strokingTimerRef.current = setInterval(() => {
          setStrokingTime(prev => {
            const newTime = prev + 0.1;
            // 撫で時間に応じて表情を段階的に変更
            updateExpressionByStrokingTime(newTime);
            return newTime;
          });
        }, 100);
        
        console.log('🎨 撫で動作開始 - 連続的な表情変更システム開始');
      }
    }
  };

  const handleCustomDragEnd = (event) => {
    if (!dragStartRef.current || !dragCurrentRef.current) {
      resetDragState();
      return;
    }
    
    if (isDraggingRef.current) {
      const distance = Math.sqrt(
        Math.pow(dragCurrentRef.current.x - dragStartRef.current.x, 2) +
        Math.pow(dragCurrentRef.current.y - dragStartRef.current.y, 2)
      );
      
      const isOutsideEyes = checkIfDragOutsideEyes(dragStartRef.current, dragCurrentRef.current);
      
      // 撫で動作だった場合、ドラッグ終了から2秒後に元の表情に戻す
      if (isOutsideEyes && distance > 20) {
        setTimeout(() => {
          console.log('撫で動作終了 - 2秒後にneutralに戻します');
          expressionManager.current?.setManualExpression(
            'neutral',
            setExpression,
            eyeOverTapReactionRef,
            eyeOverTapReactionStartTime
          );
        }, 2000);
      }
    }
    
    resetDragState();
  };

  // 座標変換関数
  const convertEventCoordinates = (event) => {
    if (!canvasRef.current) return null;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    return { x, y };
  };

  // 目の外側でのドラッグかどうかをチェック
  const checkIfDragOutsideEyes = (start, end) => {
    if (!faceRenderer.current) return true;
    
    const eyeParams = faceRenderer.current.calculateEyeParameters(eyeSpacingFactor);
    const eyeRadius = eyeParams.eyeSize * 0.5;
    
    const leftEyeX = dimensions.width / 2 - eyeParams.eyeSpacing;
    const leftEyeY = dimensions.height / 2 - eyeParams.eyeYOffset;
    const rightEyeX = dimensions.width / 2 + eyeParams.eyeSpacing;
    const rightEyeY = dimensions.height / 2 - eyeParams.eyeYOffset;
    
    // 開始位置と終了位置の両方が目の外側にあるかチェック
    const isStartOutside = 
      Math.sqrt((start.x - leftEyeX) ** 2 + (start.y - leftEyeY) ** 2) > eyeRadius &&
      Math.sqrt((start.x - rightEyeX) ** 2 + (start.y - rightEyeY) ** 2) > eyeRadius;
    
    const isEndOutside = 
      Math.sqrt((end.x - leftEyeX) ** 2 + (end.y - leftEyeY) ** 2) > eyeRadius &&
      Math.sqrt((end.x - rightEyeX) ** 2 + (end.y - rightEyeY) ** 2) > eyeRadius;
    
    return isStartOutside && isEndOutside;
  };

  // ドラッグ状態をリセット
  const resetDragState = () => {
    dragStartRef.current = null;
    dragCurrentRef.current = null;
    setIsDragging(false);
    isDraggingRef.current = false;
    strokingExpressionTimerSet.current = false;
    
    // 撫で時間タイマーを停止
    if (strokingTimerRef.current) {
      clearInterval(strokingTimerRef.current);
      strokingTimerRef.current = null;
    }
    
    setStrokingTime(0);
  };

  // ユーティリティクラスの初期化
  useEffect(() => {
    ros2Connection.current = new ROS2Connection(enableRos2Connection, ros2HttpUrl);
    
    expressionManager.current = new ExpressionManager(
      manualExpressionRef,
      (expr) => ros2Connection.current?.sendExpressionToRos2(expr) || Promise.resolve()
    );
    
    eyeTapManager.current = new EyeTapManager(
      eyeTapTimestampsRef,
      eyeOverTapReactionRef,
      eyeOverTapReactionStartTime
    );
    
    faceRenderer.current = new FaceRenderer(scaleFactorRef, dimensions);
    
    interactionHandler.current = new InteractionHandler(
      canvasRef,
      fullScreen,
      dimensions,
      {
        dragStartRef,
        dragCurrentRef,
        isDraggingRef,
        dragTimeoutRef,
        tapTimeoutRef,
        noseTimeoutRef,
        cornerTimeoutRef,
        preHurtExpressionRef,
        manualPupilTargetRef,
        manualPupilTimeoutRef
      }
    );

    keyboardHandler.current = new KeyboardHandler({
      displayMode,
      onDisplayModeToggle,
      showHitBoxes,
      showStrokingTime,
      showTapCount,
      setShowHitBoxes,
      setShowStrokingTime,
      setShowTapCount,
      showHitBoxesRef,
      showStrokingTimeRef,
      showTapCountRef,
      setManualExpression: (expr) => expressionManager.current?.setManualExpression(
        expr,
        setExpression,
        eyeOverTapReactionRef,
        eyeOverTapReactionStartTime
      ),
      savedMousePositionRef,
      lastActionTimeRef,
      togglePictureInPicture
    });
  }, []);

  // ROS2接続の開始
  useEffect(() => {
    if (ros2Connection.current) {
      ros2Connection.current.startConnection(
        manualExpressionRef,
        eyeOverTapReactionRef,
        eyeOverTapReactionStartTime,
        setExpression,
        setIsConnected,
        setConnectionStatus,
        displayMode,
        onDisplayModeToggle
      );
    }
    
    return () => {
      ros2Connection.current?.stopConnection();
    };
  }, [enableRos2Connection, ros2HttpUrl, displayMode, onDisplayModeToggle]);

  // 画像読み込み処理
  useEffect(() => {
    if (displayMode === 'image' && imagePath) {
      setImageLoadError(null);
      console.log(`画像を読み込み中: ${imagePath}`);
    } else if (displayMode === 'face') {
      setLoadedImage(null);
      loadedImageRef.current = null;
      setImageLoadError(null);
    }
  }, [displayMode, imagePath]);

  // リサイズ処理
  useEffect(() => {
    if (fullScreen) {
      const updateDimensions = () => {
        const targetRatio = 16 / 9;
        const screenRatio = window.innerWidth / window.innerHeight;
        
        let newWidth, newHeight;
        
        if (screenRatio > targetRatio) {
          newHeight = window.innerHeight;
          newWidth = newHeight * targetRatio;
        } else {
          newWidth = window.innerWidth;
          newHeight = newWidth / targetRatio;
        }
        
        scaleFactorRef.current = newWidth / baseWidth;
        setDimensions({ width: newWidth, height: newHeight });
      };

      updateDimensions();
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    }
  }, [fullScreen]);

  // カーソル非表示処理
  useEffect(() => {
    const hideCursorDelay = 3000;
    let mouseTimer: NodeJS.Timeout;

    const handleMouseMove = () => {
      setCursorVisible(true);
      clearTimeout(mouseTimer);
      mouseTimer = setTimeout(() => setCursorVisible(false), hideCursorDelay);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    handleMouseMove();
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(mouseTimer);
    };
  }, []);

  // 瞬き処理
  useEffect(() => {
    const blinkDuration = 130;
    const enlargeDuration = 160;
    let stateTimeout: NodeJS.Timeout;

    const timer = setInterval(() => {
      setBlinkState('blinking');

      stateTimeout = setTimeout(() => {
        setBlinkState('enlarged');
        
        stateTimeout = setTimeout(() => {
          setBlinkState('normal');
        }, enlargeDuration);
      }, blinkDuration);
    }, 3000 + Math.random() * 7000);

    return () => {
      clearInterval(timer);
      clearTimeout(stateTimeout);
    };
  }, []);

  // 表情変更アニメーション
  useEffect(() => {
    if (expression !== prevExpressionRef.current) {
      prevExpressionRef.current = expression;
      
      const expressionAnim = expressionAnimRef.current;
      expressionAnim.active = true;
      expressionAnim.intensity = 0;
      expressionAnim.direction = 1;
      expressionAnim.jumpCount = 0;
      expressionAnim.maxJumps = 1;
    }
  }, [expression]);

  // showTapCountの変更をRefに反映
  useEffect(() => {
    showTapCountRef.current = showTapCount;
  }, [showTapCount]);

  // p5 setup関数
  const setup = (p5, canvasParentRef) => {
    const canvas = p5.createCanvas(dimensions.width, dimensions.height).parent(canvasParentRef);
    canvasRef.current = canvas.elt;
    
    canvas.elt.setAttribute('tabindex', '0');
    canvas.elt.style.outline = 'none';
    
    // イベントリスナーの設定
    const handleTap = (event) => {
      if (!interactionHandler.current) return;
      
      const eyeParams = faceRenderer.current?.calculateEyeParameters(eyeSpacingFactor);
      if (!eyeParams) return;
      
      const eyePositions = faceRenderer.current?.calculateEyePositions(
        eyeParams,
        expression,
        headMovementRef.current
      );
      
      interactionHandler.current.handleTap(
        event,
        eyePositions,
        eyeParams.eyeSize * 0.5,
        eyeParams.eyeSize,
        (expr) => expressionManager.current?.setManualExpression(
          expr,
          setExpression,
          eyeOverTapReactionRef,
          eyeOverTapReactionStartTime
        ),
        () => eyeTapManager.current?.handleEyeTap(
          (expr) => expressionManager.current?.setManualExpression(
            expr,
            setExpression,
            eyeOverTapReactionRef,
            eyeOverTapReactionStartTime
          )
        ) || false
      );
    };
    
    canvas.elt.addEventListener('click', handleTap);
    canvas.elt.addEventListener('touchend', handleTap);
    
    // ドラッグイベント
    canvas.elt.addEventListener('mousedown', handleCustomDragStart);
    canvas.elt.addEventListener('mousemove', handleCustomDragMove);
    canvas.elt.addEventListener('mouseup', handleCustomDragEnd);
    canvas.elt.addEventListener('touchstart', handleCustomDragStart);
    canvas.elt.addEventListener('touchmove', handleCustomDragMove);
    canvas.elt.addEventListener('touchend', handleCustomDragEnd);

    // キーボードイベント
    p5.keyPressed = () => keyboardHandler.current?.handleKeyPress(p5) || false;
  };

  // p5 draw関数
  const draw = (p5) => {
    p5.background(0, 0, 0);
    
    if (displayMode === 'image') {
      drawImageMode(p5);
    } else {
      drawFaceMode(p5);
    }
    
    drawNotification(p5);
    drawStrokingTime(p5);
    drawEyeTapCount(p5);
  };

  // 画像表示モードの描画
  const drawImageMode = (p5) => {
    if (!loadedImageRef.current && imagePath) {
      p5.fill(255);
      p5.textAlign(p5.CENTER, p5.CENTER);
      p5.textSize(32 * scaleFactorRef.current);
      p5.text('画像を読み込み中...', p5.width / 2, p5.height / 2);
      
      p5.loadImage(imagePath, 
        (img) => {
          loadedImageRef.current = img;
          setLoadedImage(img);
          setImageLoadError(null);
        },
        (err) => {
          setImageLoadError(`画像の読み込みに失敗しました: ${imagePath}`);
          loadedImageRef.current = null;
          setLoadedImage(null);
        }
      );
      return;
    }

    if (!loadedImageRef.current) {
      if (imageLoadError) {
        p5.fill(255, 100, 100);
        p5.textAlign(p5.CENTER, p5.CENTER);
        p5.textSize(32 * scaleFactorRef.current);
        p5.text('画像の読み込みに失敗しました', p5.width / 2, p5.height / 2);
      }
      return;
    }

    const img = loadedImageRef.current;
    let drawWidth, drawHeight, drawX, drawY;
    
    switch (imageScaleMode) {
      case 'fit':
        const scaleX = dimensions.width / img.width;
        const scaleY = dimensions.height / img.height;
        const scale = Math.min(scaleX, scaleY);
        drawWidth = img.width * scale;
        drawHeight = img.height * scale;
        drawX = (dimensions.width - drawWidth) / 2;
        drawY = (dimensions.height - drawHeight) / 2;
        break;
      // 他のケースも実装...
      default:
        drawWidth = img.width;
        drawHeight = img.height;
        drawX = (dimensions.width - drawWidth) / 2;
        drawY = (dimensions.height - drawHeight) / 2;
    }
    
    p5.tint(255, imageOpacity * 255);
    p5.image(img, drawX, drawY, drawWidth, drawHeight);
    p5.noTint();
  };

  // 顔表示モードの描画
  const drawFaceMode = (p5) => {
    if (!faceRenderer.current) return;
    
    // 頭の動きを更新
    faceRenderer.current.updateHeadMovement(
      p5,
      headMovementRef.current,
      expressionAnimRef.current,
      expression
    );
    
    // 目のパラメータを計算
    const eyeParams = faceRenderer.current.calculateEyeParameters(eyeSpacingFactor);
    
    // 瞬きの状態を更新
    updateBlinkState(p5, eyeParams);
    
    // 瞳の位置を更新
    updatePupilPositions(p5, eyeParams);
    
    // 頭の位置を適用
    p5.push();
    p5.translate(headMovementRef.current.x, headMovementRef.current.y);
    
    // 顔の各パーツを描画
    drawEyes(p5, eyeParams);
    drawMouth(p5, eyeParams);
    
    p5.pop();
    
    // 当たり判定の可視化
    if (showHitBoxesRef.current) {
      drawHitBoxes(p5, eyeParams);
    }
  };

  // 瞬きの状態を更新
  const updateBlinkState = (p5, params) => {
    let targetEyeOpen = 1;
    let verticalSizeFactor = 1;
    
    if (blinkState === 'blinking') {
      targetEyeOpen = 0.15;
      verticalSizeFactor = 1.1;
    } else if (blinkState === 'enlarged') {
      targetEyeOpen = 1;
      verticalSizeFactor = 1.05;
    }
    
    blinkRef.current += (targetEyeOpen - blinkRef.current) * params.easeFactor;
    p5.eyeVerticalFactor = p5.eyeVerticalFactor || 1.0;
    p5.eyeVerticalFactor += (verticalSizeFactor - p5.eyeVerticalFactor) * params.easeFactor;
  };

  // 瞳の位置を更新
  const updatePupilPositions = (p5, params) => {
    const eyeMovementEase = 0.1;
    
    p5.leftEyeTarget = p5.leftEyeTarget || { x: 0, y: 0 };
    p5.rightEyeTarget = p5.rightEyeTarget || { x: 0, y: 0 };
    p5.nextEyeMovement = p5.nextEyeMovement || 0;
    
    // 手動制御が有効な場合
    if (manualPupilTargetRef.current) {
      p5.leftEyeTarget = { ...manualPupilTargetRef.current };
      p5.rightEyeTarget = { ...manualPupilTargetRef.current };
    } else {
      // 自動瞳移動
      if (!p5.frameCount || p5.frameCount >= p5.nextEyeMovement) {
        const eyeRadius = params.eyeRadius || params.eyeSize * 0.4;
        p5.leftEyeTarget = {
          x: (Math.random() * 2 - 1) * eyeRadius,
          y: (Math.random() * 2 - 1) * eyeRadius
        };
        p5.rightEyeTarget = { ...p5.leftEyeTarget };
        
        const minFrames = 60 * 3;
        const maxFrames = 600;
        p5.nextEyeMovement = p5.frameCount + Math.floor(Math.random() * (maxFrames - minFrames + 1)) + minFrames;
      }
    }
    
    p5.leftEyePos = p5.leftEyePos || { x: 0, y: 0 };
    p5.rightEyePos = p5.rightEyePos || { x: 0, y: 0 };
    
    p5.leftEyePos.x += (p5.leftEyeTarget.x - p5.leftEyePos.x) * eyeMovementEase;
    p5.leftEyePos.y += (p5.leftEyeTarget.y - p5.leftEyePos.y) * eyeMovementEase;
    p5.rightEyePos.x += (p5.leftEyeTarget.x - p5.rightEyePos.x) * eyeMovementEase;
    p5.rightEyePos.y += (p5.leftEyeTarget.y - p5.rightEyePos.y) * eyeMovementEase;
  };

  // 通知表示
  const drawNotification = (p5) => {
    if (!notification) return;
    
    const boxWidth = 400;
    const boxHeight = 100;
    const boxX = (p5.width - boxWidth) / 2;
    const boxY = (p5.height - boxHeight) / 2;
    
    p5.fill(0, 0, 0, 150);
    p5.rect(boxX, boxY, boxWidth, boxHeight, 10);
    
    p5.stroke(255);
    p5.strokeWeight(2);
    p5.noFill();
    p5.rect(boxX, boxY, boxWidth, boxHeight, 10);
    
    p5.fill(255);
    p5.noStroke();
    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.textSize(18);
    p5.text(notification, boxX + boxWidth / 2, boxY + boxHeight / 2);
  };

  // 撫で時間表示
  const drawStrokingTime = (p5) => {
    if (!isDragging || strokingTime <= 0 || !showStrokingTimeRef.current) return;
    
    const boxWidth = 200;
    const boxHeight = 60;
    const margin = 20;
    
    p5.fill(0, 0, 0, 120);
    p5.rect(margin, margin, boxWidth, boxHeight, 8);
    
    p5.stroke(255, 255, 0);
    p5.strokeWeight(2);
    p5.noFill();
    p5.rect(margin, margin, boxWidth, boxHeight, 8);
    
    p5.fill(255, 255, 0);
    p5.noStroke();
    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.textSize(16);
    
    const timeText = `撫で時間: ${strokingTime.toFixed(1)}秒`;
    p5.text(timeText, margin + boxWidth / 2, margin + boxHeight / 2);
  };

  // 目タップ回数表示
  const drawEyeTapCount = (p5) => {
    if (!showStrokingTimeRef.current || !showTapCountRef.current) return; // showTapCountRefを使用
    
    const tapCount = eyeTapManager.current?.getRecentTapCount() || 0;
    if (tapCount === 0) return;
    
    const boxWidth = 220;
    const boxHeight = 60;
    const margin = 20;
    const rightMargin = p5.width - boxWidth - margin;
    
    // タップ回数に応じて色を変更
    let backgroundColor, borderColor;
    if (tapCount >= 10) {
      backgroundColor = [255, 0, 0, 120];
      borderColor = [255, 100, 100];
    } else if (tapCount >= 7) {
      backgroundColor = [255, 165, 0, 120];
      borderColor = [255, 200, 0];
    } else {
      backgroundColor = [0, 100, 255, 120];
      borderColor = [100, 150, 255];
    }
    
    p5.fill(...backgroundColor);
    p5.rect(rightMargin, margin, boxWidth, boxHeight, 8);
    
    p5.stroke(...borderColor);
    p5.strokeWeight(2);
    p5.noFill();
    p5.rect(rightMargin, margin, boxWidth, boxHeight, 8);
    
    p5.fill(255);
    p5.noStroke();
    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.textSize(14);
    
    const tapText = `目タップ数: ${tapCount}/10 (10秒)`;
    p5.text(tapText, rightMargin + boxWidth / 2, margin + boxHeight / 2);
  };

  // ぴえん目のハイライトを描画する関数
  const drawPienHighlight = (p5, eyeWidth, eyeHeight, upperEyelid, lowerEyelid, highlightPos, pupilYOffset) => {
    // サイズの有効性をチェック
    if (!eyeWidth || !eyeHeight || eyeWidth <= 0 || eyeHeight <= 0) {
      console.warn('Invalid eye dimensions for highlight:', { eyeWidth, eyeHeight });
      return;
    }
    
    // まぶたの影響を計算した中心位置
    const upperLidY = -eyeHeight/2 + eyeHeight * (1 - upperEyelid);
    const lowerLidY = eyeHeight/2 - eyeHeight * (1 - lowerEyelid);
    const eyeCenterShift = (upperLidY + lowerLidY) / 2 * 0.3;
    
    // ハイライト描画位置を計算（制限なし）
    const px = highlightPos.x;
    const py = highlightPos.y + pupilYOffset + eyeCenterShift;
    
    // 白目のマスク領域を設定
    p5.push();
    
    // 1. クリッピングマスクを設定（白目の楕円形状）
    p5.drawingContext.save();
    p5.drawingContext.beginPath();
    p5.drawingContext.ellipse(0, eyeCenterShift, eyeWidth * 0.87 / 2, eyeHeight * 0.87 / 2, 0, 0, Math.PI * 2);
    p5.drawingContext.clip();
    
    // 2. マスクされた領域内でハイライトを描画
    p5.fill(255, 255, 255, 255); // 完全不透明の白色
    p5.noStroke();
    
    // メインハイライト（大きめ、左上）
    p5.ellipse(px - eyeWidth * 0.22, py - eyeHeight * 0.22, eyeWidth * 0.45, eyeHeight * 0.36);
    
    // サブハイライト（小さめ、右下）
    p5.ellipse(px + eyeWidth * 0.16, py + eyeHeight * 0.16, eyeWidth * 0.28, eyeHeight * 0.22);
    
    // 3. クリッピングマスクを解除
    p5.drawingContext.restore();
    
    p5.pop();
  };

  // 両目を描画する関数
  const drawEyes = (p5, params) => {
    // ハイライト遅延追従用のグローバル座標（初期化）
    if (!p5.highlightPosLeft) {
      p5.highlightPosLeft = { x: 0, y: 0 };
    }
    if (!p5.highlightPosRight) {
      p5.highlightPosRight = { x: 0, y: 0 };
    }
    const highlightEasing = 0.05; // イージング係数（遅延追従）
    
    // ハイライト座標を瞳座標に遅れて追従させる
    p5.highlightPosLeft.x += (p5.leftEyePos.x - p5.highlightPosLeft.x) * highlightEasing;
    p5.highlightPosLeft.y += (p5.leftEyePos.y - p5.highlightPosLeft.y) * highlightEasing;
    p5.highlightPosRight.x += (p5.rightEyePos.x - p5.highlightPosRight.x) * highlightEasing;
    p5.highlightPosRight.y += (p5.rightEyePos.y - p5.highlightPosRight.y) * highlightEasing;
    
    // --- きゅるきゅる微振動追加 ---
    const vibrateAmp = params.eyeSize * 0.0015; // 振幅: 目サイズの0.15%
    const vibrateFreq = 0.3; // 周波数
    p5.highlightPosLeft.x += Math.sin(p5.frameCount * vibrateFreq) * vibrateAmp;
    p5.highlightPosLeft.y += Math.cos(p5.frameCount * vibrateFreq * 1.2) * vibrateAmp;
    p5.highlightPosRight.x += Math.sin((p5.frameCount + 100) * vibrateFreq) * vibrateAmp;
    p5.highlightPosRight.y += Math.cos((p5.frameCount + 100) * vibrateFreq * 1.2) * vibrateAmp;

    // 調整されたサイズを適用
    let currentEyeWidth = params.eyeSize;
    let currentEyeHeight = params.eyeSize * (p5.eyeVerticalFactor || 1.0);
    let currentPupilSize = params.pupilSize;
    const blinkAmount = blinkRef.current;
    
    // 表情に応じた目の調整
    let eyeAngle = 0;
    let eyeWidthFactor = 1.0;
    let eyeHeightFactor = 1.0;
    let pupilSizeFactor = 1.0;
    let eyeYOffset = 0;
    let pupilYOffset = 0;
    let upperEyelid = 1.0;
    let lowerEyelid = 1.0;
    
    switch (expression) {
      case 'happy':
        eyeAngle = -0.07;
        eyeYOffset = -params.eyeSize * 0.05;
        lowerEyelid = 0.9;
        break;
      case 'angry':
        eyeAngle = 0.20;
        eyeYOffset = params.eyeSize * 0.1;
        upperEyelid = 0.75;
        break;
      case 'sad':
        eyeAngle = -0.15;
        eyeYOffset = params.eyeSize * 0.15;
        upperEyelid = 0.9;
        lowerEyelid = 0.9;
        break;
      case 'surprised':
        eyeWidthFactor = 1.2;
        eyeHeightFactor = 1.3;
        pupilSizeFactor = 0.9;
        eyeYOffset = -params.eyeSize * 0.1;
        break;
      case 'crying':
        eyeAngle = -0.25;
        pupilSizeFactor = 0.9;
        eyeYOffset = params.eyeSize * 0.1;
        upperEyelid = 0.7;
        lowerEyelid = 0.9;
        break;
      case 'hurt':
        eyeAngle = 0.25;
        eyeWidthFactor = 0.85;
        eyeYOffset = params.eyeSize * 0.10;
        upperEyelid = 0.55;
        lowerEyelid = 0.5;
        pupilSizeFactor = 0.8;
        break;
      case 'wink':
        eyeAngle = -0.05;
        break;
      case 'mouth3':
        pupilSizeFactor = 0.55;
        break;
      case 'pien':
        eyeWidthFactor = 1.1;
        eyeHeightFactor = 1.08;
        pupilSizeFactor = 1.2;
        eyeYOffset = params.eyeSize * 0.05;
        break;
    }
    
    currentEyeWidth *= eyeWidthFactor;
    currentEyeHeight *= eyeHeightFactor * blinkAmount;
    currentPupilSize *= pupilSizeFactor;
    
    // winkの場合は左右の目で異なる設定
    let leftUpperEyelid = upperEyelid;
    let leftLowerEyelid = lowerEyelid;
    let rightUpperEyelid = upperEyelid;
    let rightLowerEyelid = lowerEyelid;
    
    if (expression === 'wink') {
      leftUpperEyelid = 1.0;
      leftLowerEyelid = 1.0;
      rightUpperEyelid = 0.0;
      rightLowerEyelid = 0.0;
    }
    
    // 実際の目の位置
    const leftEyeX = p5.width / 2 - params.eyeSpacing;
    const leftEyeY = p5.height / 2 - params.eyeYOffset + eyeYOffset;
    const rightEyeX = p5.width / 2 + params.eyeSpacing;
    const rightEyeY = p5.height / 2 - params.eyeYOffset + eyeYOffset;
    
    // グローバルに目の位置を保存（当たり判定で使用）
    p5.actualEyePositions = {
      left: { x: leftEyeX, y: leftEyeY },
      right: { x: rightEyeX, y: rightEyeY },
      hitRadius: params.eyeSize * 0.5
    };
    
    // 左目の描画
    p5.push();
    p5.translate(leftEyeX, leftEyeY);
    p5.rotate(eyeAngle);
    drawEyeWithLids(p5, currentEyeWidth, currentEyeHeight, leftUpperEyelid, leftLowerEyelid, 
                   p5.leftEyePos || {x: 0, y: 0}, pupilYOffset, currentPupilSize, blinkAmount);

    // ぴえん目のハイライト（左目）
    if (expression === 'pien') {
      drawPienHighlight(p5, currentEyeWidth, currentEyeHeight, leftUpperEyelid, leftLowerEyelid, 
                       p5.highlightPosLeft, pupilYOffset);
    }
    p5.pop();

    // 右目の描画
    p5.push();
    p5.translate(rightEyeX, rightEyeY);
    p5.rotate(-eyeAngle);
    drawEyeWithLids(p5, currentEyeWidth, currentEyeHeight, rightUpperEyelid, rightLowerEyelid, 
                   p5.rightEyePos || {x: 0, y: 0}, pupilYOffset, currentPupilSize, blinkAmount);

    // ぴえん目のハイライト（右目）
    if (expression === 'pien') {
      drawPienHighlight(p5, currentEyeWidth, currentEyeHeight, rightUpperEyelid, rightLowerEyelid, 
                       p5.highlightPosRight, pupilYOffset);
    }
    p5.pop();
  };

  // まぶたの効果を適用して目を描画する関数
  const drawEyeWithLids = (p5, eyeWidth, eyeHeight, upperLidOpenness, lowerLidOpenness, pupilPos, pupilYOffset, pupilSize, blinkAmount) => {
    // 目の中心位置の調整（まぶたの影響）
    const upperLidY = -eyeHeight/2 + eyeHeight * (1 - upperLidOpenness);
    const lowerLidY = eyeHeight/2 - eyeHeight * (1 - lowerLidOpenness);
    
    // 目の中心が移動した分を計算
    const eyeCenterShift = (upperLidY + lowerLidY) / 2 * 0.4;
    
    // 輪郭線の太さを調整
    const outlineWeight = eyeWidth * 0.03;
    
    // まぶたが閉じている効果を反映した目の高さ
    const visibleEyeHeight = eyeHeight * Math.max(0.0, Math.min(upperLidOpenness, lowerLidOpenness));
    
    // まぶたが完全に閉じている場合は白目と瞳を描画しない
    if (Math.min(upperLidOpenness, lowerLidOpenness) > 0.0) {
      // 1. 白目を描画
      p5.fill(255);
      p5.ellipse(0, eyeCenterShift, eyeWidth + outlineWeight, (visibleEyeHeight + outlineWeight) * 0.92);
      
      // 2. 瞳を描画
      p5.fill(0);
      p5.noStroke();
      const pupilScale = Math.min(upperLidOpenness, lowerLidOpenness) * blinkAmount;
      p5.ellipse(
        pupilPos.x,
        pupilPos.y + pupilYOffset + eyeCenterShift, 
        pupilSize * 1.5,
        pupilSize * 1.5 * Math.min(1, pupilScale)
      );

      // 白目を描画する一回り小さい円
      p5.noFill();
      p5.stroke(255, 255, 255, 255);
      p5.strokeWeight(outlineWeight * 1.5);
      p5.ellipse(0, eyeCenterShift, eyeWidth * 0.87 + outlineWeight, (visibleEyeHeight * 0.87 + outlineWeight));
    }
    
    // 3. 上まぶたを描画
    let upperLidPosition = 0;
    if (upperLidOpenness < 1.0) {
      upperLidPosition = eyeCenterShift + upperLidY * 0.7;
      
      // 黒い上まぶたを描画
      p5.fill(0);
      p5.noStroke();
      p5.beginShape();
      p5.vertex(-eyeWidth * 0.7, -eyeHeight);
      p5.vertex(eyeWidth * 0.7, -eyeHeight);
      p5.vertex(eyeWidth * 0.7, upperLidPosition);
      
      // まぶたの曲線部分 - 滑らかな曲線に
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const x = eyeWidth * 0.7 - (eyeWidth * 1.4 * i / steps);
        // 自然な曲線のためのY座標（中央がやや下にカーブ）
        const curveY = upperLidPosition;
        p5.vertex(x, curveY);
      }
      
      p5.endShape(p5.CLOSE);
    }
    
    // 4. 下まぶたを描画
    let lowerLidPosition = 0;
    if (lowerLidOpenness < 1.0) {
      lowerLidPosition = eyeCenterShift + lowerLidY * 0.4;
      
      // 黒い下まぶたを描画
      p5.fill(0);
      p5.noStroke();
      p5.beginShape();
      p5.vertex(-eyeWidth * 0.7, eyeHeight);
      p5.vertex(eyeWidth * 0.7, eyeHeight);
      p5.vertex(eyeWidth * 0.7, lowerLidPosition);
      
      // まぶたの曲線部分 - 滑らかな曲線に
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const x = eyeWidth * 0.7 - (eyeWidth * 1.4 * i / steps);
        // 自然な曲線のためのY座標（中央がやや上にカーブ）
        const curveY = lowerLidPosition;
        p5.vertex(x, curveY);
      }
      
      p5.endShape();
    }
    
    // 5. まぶたの白い縁を描画（単純化して自然に）
    p5.stroke(255);
    p5.strokeWeight(outlineWeight * 1.6); // わずかに太めに
    p5.strokeCap(p5.ROUND); // 線の端を丸く
    
    // 上まぶたの白い縁
    if (upperLidOpenness < 1.0) {
      // 白目と重なる部分だけに単純な曲線を描画
      p5.beginShape();
      p5.noFill();
      p5.vertex(-eyeWidth * 0.3, upperLidPosition);
      
      // この曲線は横方向に真っ直ぐでOK - シンプルさが効果的
      for (let x = -eyeWidth * 0.5; x <= eyeWidth * 0.5; x += eyeWidth / 10) {
        p5.vertex(x, upperLidPosition);
      }
      
      p5.vertex(eyeWidth * 0.5, upperLidPosition);
      p5.endShape();
    }
    
    // 下まぶたの白い縁
    if (lowerLidOpenness < 1.0) {
      // 白目と重なる部分だけに単純な曲線を描画
      p5.beginShape();
      p5.noFill();
      p5.vertex(-eyeWidth * 0.5, lowerLidPosition);
      
      // この曲線は横方向に真っ直ぐでOK - シンプルさが効果的
      for (let x = -eyeWidth * 0.5; x <= eyeWidth * 0.5; x += eyeWidth / 10) {
        p5.vertex(x, lowerLidPosition);
      }
      
      p5.vertex(eyeWidth * 0.5, lowerLidPosition);
      p5.endShape();
    }
    
    // 完全に閉じている場合は目全体を黒で覆った後、ウインクの目を描画
    if (upperLidOpenness <= 0.0 && lowerLidOpenness <= 0.0) {
      p5.fill(0);
      p5.noStroke();
      p5.ellipse(0, eyeCenterShift, eyeWidth * 1.5, eyeHeight * 1.3);
      
      // ウインクした目（閉じた目）の形状を描画
      p5.stroke(255);
      p5.strokeWeight(outlineWeight * 3.5);
      p5.strokeCap(p5.ROUND);
      p5.noFill();
      
      // ウインクした目の曲線を描画（角度をつけたウインクらしい形状）
      // 上側の曲線（既存）
      p5.beginShape();
      p5.vertex(-eyeWidth * 0.5, eyeCenterShift + eyeHeight * 0.13); // 左端を少し下に
      
      // ベジェ曲線でウインクの形状を作成（角度をつける）
      p5.bezierVertex(
        -eyeWidth * 0.25, eyeCenterShift - eyeHeight * 0.25,  // 制御点1（左側）
        eyeWidth * 0.25, eyeCenterShift - eyeHeight * 0.25,   // 制御点2（右側をより上に）
        eyeWidth * 0.25, eyeCenterShift - eyeHeight * 0.25     // 終点（右端の長さを短く）
      );
      p5.endShape();
      
      // 下側の曲線（上側を反転させた形状）
      p5.beginShape();
      p5.vertex(-eyeWidth * 0.5, eyeCenterShift + eyeHeight * 0.13); // 左端を少し上に
      
      // ベジェ曲線で下向きの形状を作成（上側を反転）
      p5.bezierVertex(
        -eyeWidth * 0.25, eyeCenterShift + eyeHeight * 0.25,  // 制御点1（左側・下向き）
        eyeWidth * 0.25, eyeCenterShift + eyeHeight * 0.25,   // 制御点2（右側・下向き）
        eyeWidth * 0.15, eyeCenterShift + eyeHeight * 0.25     // 終点（右端・下向き）
      );
      p5.endShape();
      
    } else {
      // 目の外側に黒い縁を描画（目が開いている場合のみ）
      p5.noFill();
      p5.stroke(0);
      p5.strokeWeight(outlineWeight * 5.0);
      p5.ellipse(0, eyeCenterShift, eyeWidth + outlineWeight * 3, (visibleEyeHeight + outlineWeight * 3) * 1.0);
    }
    
    // 描画設定をリセット
    p5.strokeWeight(1);
    p5.noStroke();
  };

  // 鼻を描画する関数
  const drawNose = (p5, params) => {
    // 鼻のサイズをスケールに合わせて計算
    const noseWidth = params.eyeSize * 0.35;
    const noseHeight = params.eyeSize * 0.2;
    
    // 鼻の基本位置 (目と口の間) - 目の大きさに比例するように調整
    let noseY = p5.height / 2 + params.eyeYOffset * 0.15 + params.eyeSize * 0.1;
    
    // 表情に応じて鼻の位置を調整
    switch (expression) {
      case 'happy':
        noseY -= params.eyeSize * 0.1;
        break;
      case 'angry':
        noseY -= params.eyeSize * 0.20;
        break;
      case 'sad':
        noseY -= params.eyeSize * 0.20;
        break;
      case 'surprised':
        noseY -= params.eyeSize * 0.25;
        break;
      case 'crying':
        noseY -= params.eyeSize * 0.15;
        break;
      case 'wink':
        noseY += params.eyeSize * 0.0;
        break;
    }
    
    // 鼻の描画
    p5.fill(255);
    p5.noStroke();
    
    // 楕円形の鼻を描画
    p5.ellipse(
      p5.width / 2,
      noseY,
      noseWidth,
      noseHeight
    );
    
    // 描画設定をリセット
    p5.noStroke();
  };

  // 口を描画する関数
  const drawMouth = (p5, params) => {
    const mouthWidth = params.eyeSize * 1.5;
    const mouthHeight = params.eyeSize * 0.4;
    
    let mouthY = p5.height / 2 + params.eyeYOffset * 1.1 + params.eyeSize * 0.1;
    const strokeWeight = 40 * scaleFactorRef.current;
    
    p5.stroke(255);
    p5.noFill();
    p5.strokeWeight(strokeWeight);

    // おしゃべり口の表情別Y座標調整設定
    const talkingMouthSettings = {
      // 基本表情での調整値（params.eyeSize に対する倍数）
      neutral: { mouth_a: 0.0, mouth_i: 0.0, mouth_o: 0.0 },
      happy: { mouth_a: -0.2, mouth_i: -0.2, mouth_o: -0.2 },
      angry: { mouth_a: 0.1, mouth_i: 0.1, mouth_o: 0.1 },
      sad: { mouth_a: -0.03, mouth_i: -0.03, mouth_o: -0.03 },
      surprised: { mouth_a: -0.02, mouth_i: -0.05, mouth_o: -0.08 },
      crying: { mouth_a: -0.03, mouth_i: -0.03, mouth_o: -0.03 },
      hurt: { mouth_a: -0.05, mouth_i: -0.05, mouth_o: -0.05 },
      wink: { mouth_a: -0.05, mouth_i: -0.08, mouth_o: -0.1 },
      mouth3: { mouth_a: 0.02, mouth_i: 0.0, mouth_o: -0.02 },
      pien: { mouth_a: 0.1, mouth_i: 0.1, mouth_o: 0.1 }
    };

    // おしゃべりモードの場合は特別処理
    const talkingMode = keyboardHandler.current?.getTalkingMode();
    let currentExpression = expression;
    
    if (talkingMode?.getIsActive()) {
      const mouthPattern = talkingMode.getCurrentMouthPattern();
      currentExpression = mouthPattern as any; // 一時的にキャスト
    }

    // 表情による口の位置調整
    switch (currentExpression) {
      case 'neutral':
        mouthY -= params.eyeSize * 0.06;
        break;
      case 'happy':
        mouthY -= params.eyeSize * 0.27;
        break;
      case 'angry':
        mouthY -= params.eyeSize * 0.1;
        break;
      case 'sad':
        mouthY += params.eyeSize * 0.15;
        break;
      case 'surprised':
        mouthY += params.eyeSize * 0.15;
        break;
      case 'crying':
        mouthY += params.eyeSize * 0.15;
        break;
      case 'hurt':
        mouthY -= params.eyeSize * 0.06;
        break;
      case 'wink':
        mouthY -= params.eyeSize * 0.3;
        break;
      case 'mouth3':
        mouthY -= params.eyeSize * 0.05;
        break;
      case 'pien':
        mouthY += params.eyeSize * 0.05;  // 元の0.2から0.05に変更して上に移動
        break;
      case 'mouth_a':
        mouthY += params.eyeSize * 0.02;
        break;
      case 'mouth_i':
        mouthY += params.eyeSize * 0.02;
        break;
      case 'mouth_o':
        mouthY += params.eyeSize * 0.02;
        break;
    }
    
    // 表情に応じた口の描画
    switch (currentExpression) {
      case 'neutral':
        const naturalMouthWidth = mouthWidth * 0.8;
        p5.beginShape();
        p5.vertex(p5.width / 2 - naturalMouthWidth / 2, mouthY);
        p5.bezierVertex(
          p5.width / 2 - naturalMouthWidth / 4,
          mouthY + mouthHeight * 0.6, 
          p5.width / 2 + naturalMouthWidth / 4, 
          mouthY + mouthHeight * 0.6, 
          p5.width / 2 + naturalMouthWidth / 2, 
          mouthY
        );
        p5.endShape();
        break;
        
      case 'happy':
        const happyMouthWidth = mouthWidth * 0.8;
        p5.beginShape();
        p5.vertex(p5.width / 2 - happyMouthWidth / 2, mouthY);
        p5.bezierVertex(
          p5.width / 2 - happyMouthWidth / 4, 
          mouthY + mouthHeight * 1.2, 
          p5.width / 2 + happyMouthWidth / 4, 
          mouthY + mouthHeight * 1.2, 
          p5.width / 2 + happyMouthWidth / 2, 
          mouthY
        );
        p5.endShape();
        break;
        
      case 'angry':
        const angryMouthWidth = mouthWidth * 0.75;
        p5.beginShape();
        p5.vertex(p5.width / 2 - angryMouthWidth / 2, mouthY + mouthHeight * 0.5);
        p5.bezierVertex(
          p5.width / 2 - angryMouthWidth / 4, 
          mouthY - mouthHeight * 0.3, 
          p5.width / 2 + angryMouthWidth / 4, 
          mouthY - mouthHeight * 0.3, 
          p5.width / 2 + angryMouthWidth / 2, 
          mouthY + mouthHeight * 0.5
        );
        p5.endShape();
        break;
        
      case 'sad':
      case 'crying':
        p5.beginShape();
        const sadMouthWidth = mouthWidth * 0.75;
        p5.vertex(p5.width / 2 - sadMouthWidth / 2, mouthY - mouthHeight * 0.3);
        p5.bezierVertex(
          p5.width / 2 - sadMouthWidth / 4, 
          mouthY - mouthHeight * 0.8, 
          p5.width / 2 + sadMouthWidth / 4, 
          mouthY - mouthHeight * 0.8, 
          p5.width / 2 + sadMouthWidth / 2, 
          mouthY - mouthHeight * 0.3
        );
        p5.endShape();
        
        // 泣きの場合は涙も描画
        if (currentExpression === 'crying') {
          drawTears(p5, params);
        }
        break;
        
      case 'surprised':
        p5.beginShape();
        const surprisedMouthWidth = mouthWidth * 0.35;
        const surprisedMouthHeight = mouthHeight * 2.5;
        
        p5.noStroke();
        p5.fill(255);
        
        p5.vertex(p5.width / 2 - surprisedMouthWidth / 2, mouthY);
        p5.bezierVertex(
          p5.width / 2 - surprisedMouthWidth / 2, mouthY - surprisedMouthHeight / 2,
          p5.width / 2 + surprisedMouthWidth / 2, mouthY - surprisedMouthHeight / 2,
          p5.width / 2 + surprisedMouthWidth / 2, mouthY
        );
        
        p5.bezierVertex(
          p5.width / 2 + surprisedMouthWidth / 2, mouthY + surprisedMouthHeight / 2,
          p5.width / 2 - surprisedMouthWidth / 2, mouthY + surprisedMouthHeight / 2,
          p5.width / 2 - surprisedMouthWidth / 2, mouthY
        );
        
        p5.endShape(p5.CLOSE);
        p5.stroke(255);
        p5.noFill();
        p5.strokeWeight(strokeWeight);
        break;
        
      case 'wink':
        p5.beginShape();
        const winkMouthWidth = mouthWidth * 0.55;
        const leftY = mouthY + mouthHeight * 0.45;
        p5.vertex(p5.width / 2 - winkMouthWidth / 2, leftY);
        
        const centerControlX1 = p5.width / 2.1 - winkMouthWidth / 6;
        const centerControlX2 = p5.width / 2.0 + winkMouthWidth / 5;
        const centerControlY = mouthY + mouthHeight * 1.0;
        const rightY = mouthY + mouthHeight * 0.1;
        
        p5.bezierVertex(
          centerControlX1, centerControlY,
          centerControlX2, centerControlY,
          p5.width / 2.0 + winkMouthWidth / 2.0, rightY
        );
        p5.endShape();
        break;
        
      case 'mouth3':
        const mouth3Width = mouthWidth * 0.6;
        const mouth3Height = mouthHeight * 1.15;
        
        p5.beginShape();
        p5.noFill();
        
        const topCenterY = mouthY + mouth3Height * 0.2;
        p5.vertex(p5.width / 1.85 - mouth3Width / 2.9, topCenterY - mouth3Height * 0.40);
        p5.bezierVertex(
          p5.width / 2 + mouth3Width * 0.2, topCenterY - mouth3Height * 0.9,
          p5.width / 2 + mouth3Width * 0.4, topCenterY - mouth3Height * 0.1,
          p5.width / 2, topCenterY
        );
        p5.endShape();
        
        p5.beginShape();
        const bottomCenterY = mouthY + mouth3Height * 0.2;
        p5.vertex(p5.width / 2, bottomCenterY);
        p5.bezierVertex(
          p5.width / 2 + mouth3Width * 0.4, bottomCenterY + mouth3Height * 0.0,
          p5.width / 2 + mouth3Width * 0.2, bottomCenterY + mouth3Height * 0.8,
          p5.width / 1.7 - mouth3Width / 1.9, bottomCenterY + mouth3Height * 0.4
        );
        p5.endShape();
        break;
        
      case 'pien':
        p5.beginShape();
        const pienMouthWidth = mouthWidth * 0.55;
        const pienMouthY = mouthY + mouthHeight * 0.2;
        // 口の両端の丸みを保つため、正確な中心位置を計算
        const pienCenterX = p5.width / 2;
        p5.vertex(pienCenterX - pienMouthWidth / 2, pienMouthY);
        p5.bezierVertex(
          pienCenterX - pienMouthWidth / 4, 
          pienMouthY - mouthHeight * 0.65,
          pienCenterX + pienMouthWidth / 4, 
          pienMouthY - mouthHeight * 0.65, 
          pienCenterX + pienMouthWidth / 2, 
          pienMouthY
        );
        p5.endShape();
        break;
        
      case 'hurt':
        const hurtMouthWidth = mouthWidth * 0.6;
        
        p5.beginShape();
        p5.noFill();
        
        p5.vertex(p5.width / 2 - hurtMouthWidth / 2, mouthY);
        
        const waveCount = 5;
        const segmentWidth = hurtMouthWidth / waveCount;
        
        for (let i = 0; i < waveCount; i++) {
          const startX = p5.width / 2 - hurtMouthWidth / 2 + i * segmentWidth;
          const endX = startX + segmentWidth;
          
          const waveHeight = (i % 2 === 0) ? mouthHeight * 0.15 : -mouthHeight * 0.1;
          const controlHeight = (i % 2 === 0) ? mouthHeight * 0.25 : -mouthHeight * 0.2;
          
          p5.bezierVertex(
            startX + segmentWidth * 0.35, mouthY + controlHeight,
            startX + segmentWidth * 0.7, mouthY + controlHeight,
            endX, mouthY + (i === waveCount - 1 ? 0 : waveHeight)
          );
        }
        
        p5.endShape();
        break;
        
      // おしゃべりモード用の新しい口のパターン
      case 'mouth_a':
        // 「あ」の口 - 三日月風（お椀を逆様にした形）
        const aMouthWidth = mouthWidth * 0.6;
        const aMouthHeight = mouthHeight * 0.9;
        // 現在の表情に応じたY座標調整を取得
        const aMouthYOffset = params.eyeSize * (talkingMouthSettings[expression]?.mouth_a || 0.02);

        const a = 2.5; // 口の横開き具合（でかいほど小さくなる）
        const b = 0.4; // 口の縦
        const c = 0.8; // 口の縦
        
        // 内側を白で埋める
        p5.fill(255);
        p5.noStroke();
        p5.beginShape();
        p5.vertex(p5.width / 2 - aMouthWidth / a, mouthY + aMouthYOffset - aMouthHeight * b);
        p5.bezierVertex(
          p5.width / 2 - aMouthWidth / 2, 
          mouthY + aMouthYOffset + aMouthHeight * c,
          p5.width / 2 + aMouthWidth / 2, 
          mouthY + aMouthYOffset + aMouthHeight * c,
          p5.width / 2 + aMouthWidth / a, 
          mouthY + aMouthYOffset - aMouthHeight * b
        );
        p5.endShape(p5.CLOSE);
        
        // 縁を描画
        p5.stroke(255);
        p5.strokeWeight(strokeWeight * 0.8);
        p5.noFill();
        p5.beginShape();
        p5.vertex(p5.width / 2 - aMouthWidth / a, mouthY + aMouthYOffset - aMouthHeight * b);
        p5.bezierVertex(
          p5.width / 2 - aMouthWidth / 2, 
          mouthY + aMouthYOffset + aMouthHeight * c,
          p5.width / 2 + aMouthWidth / 2, 
          mouthY + aMouthYOffset + aMouthHeight * c,
          p5.width / 2 + aMouthWidth / a, 
          mouthY + aMouthYOffset - aMouthHeight * b
        );
        p5.endShape();

        // 上側にも横線を描画
        p5.stroke(255);
        p5.strokeWeight(strokeWeight * 0.8);
        p5.line(
          p5.width / 2 - aMouthWidth / a,
          mouthY + aMouthYOffset - aMouthHeight * b,
          p5.width / 2 + aMouthWidth / a,
          mouthY + aMouthYOffset - aMouthHeight * b
        );
        break;
        
      case 'mouth_i':
        // 「い」の口 - 横に開いた線
        // 現在の表情に応じたY座標調整を取得
        const iMouthYOffset = params.eyeSize * (talkingMouthSettings[expression]?.mouth_i || 0.0);
        p5.stroke(255);
        p5.strokeWeight(strokeWeight * 0.9);
        p5.line(
          p5.width / 2 - mouthWidth * 0.3,
          mouthY + iMouthYOffset,
          p5.width / 2 + mouthWidth * 0.3,
          mouthY + iMouthYOffset
        );
        break;
        
      case 'mouth_o':
        // 「お」の口 - 小さな丸
        // 現在の表情に応じたY座標調整を取得
        const oMouthYOffset = params.eyeSize * (talkingMouthSettings[expression]?.mouth_o || -0.02);
        p5.noStroke();
        p5.fill(255);
        p5.ellipse(p5.width / 2, mouthY + oMouthYOffset, mouthWidth * 0.35, mouthHeight * 1.5);
        
        // 白い縁を描画
        p5.stroke(255);
        p5.strokeWeight(strokeWeight * 0.8);
        p5.noFill();
        p5.ellipse(p5.width / 2, mouthY + oMouthYOffset, mouthWidth * 0.35, mouthHeight * 1.5);
        break;
    }
    
    p5.strokeWeight(1);
  };

  // 涙を描画する関数
  const drawTears = (p5, params) => {
    if (!p5.tears) {
      const maxTearSize = params.eyeSize * 0.25;
      const createTear = () => {
        const sizeFactor = 0.5 + Math.random() * 0.5;
        const size = maxTearSize * sizeFactor;
        const baseSpeed = 0.2;
        const maxSpeedBonus = 0.3;
        const speed = baseSpeed + (maxSpeedBonus * sizeFactor);
        
        return {
          active: Math.random() < 0.7,
          offset: Math.random() * params.eyeSize * 0.8,
          speed: speed,
          acceleration: 0.01 + Math.random() * 0.02,
          maxSpeed: 1.5 + Math.random() * 1.0,
          size: size
        };
      };
      
      p5.tears = {
        left: Array(3).fill(0).map(() => createTear()),
        right: Array(3).fill(0).map(() => createTear())
      };
    }
    
    // 左側の涙
    p5.tears.left.forEach((tear, index) => {
      if (tear.active) {
        const xOffset = params.eyeSize * 0.2 * (index - 1) - params.eyeSize * 0.3;
        const yOffset = -params.eyeSize * 0.1;
        drawTear(
          p5,
          p5.width / 2 - params.eyeSpacing + xOffset,
          p5.height / 2 - params.eyeYOffset + params.eyeSize * 0.7 + yOffset,
          tear.size,
          tear.size * 1.5,
          tear.offset
        );
        
        tear.speed += tear.acceleration;
        if (tear.speed > tear.maxSpeed) {
          tear.speed = tear.maxSpeed;
        }
        tear.offset += tear.speed;
        
        if (tear.offset > params.eyeSize * 1.5) {
          tear.offset = 0;
          tear.speed = 0.2 + Math.random() * 0.3;
          tear.acceleration = 0.01 + Math.random() * 0.02;
          tear.maxSpeed = 1.5 + Math.random() * 1.0;
          tear.size = params.eyeSize * (0.15 + Math.random() * 0.1);
          tear.active = Math.random() < 0.9;
        }
      } else if (Math.random() < 0.01) {
        tear.active = true;
        tear.offset = 0;
      }
    });
    
    // 右側の涙
    p5.tears.right.forEach((tear, index) => {
      if (tear.active) {
        const xOffset = params.eyeSize * 0.2 * (index - 1) + params.eyeSize * 0.3;
        const yOffset = -params.eyeSize * 0.1;
        drawTear(
          p5,
          p5.width / 2 + params.eyeSpacing + xOffset,
          p5.height / 2 - params.eyeYOffset + params.eyeSize * 0.7 + yOffset,
          tear.size,
          tear.size * 1.5,
          tear.offset
        );
        
        tear.speed += tear.acceleration;
        if (tear.speed > tear.maxSpeed) {
          tear.speed = tear.maxSpeed;
        }
        tear.offset += tear.speed;
        
        if (tear.offset > params.eyeSize * 1.5) {
          tear.offset = 0;
          tear.speed = 0.2 + Math.random() * 0.3;
          tear.acceleration = 0.01 + Math.random() * 0.02;
          tear.maxSpeed = 1.5 + Math.random() * 1.0;
          tear.size = params.eyeSize * (0.15 + Math.random() * 0.1);
          tear.active = Math.random() < 0.9;
        }
      } else if (Math.random() < 0.01) {
        tear.active = true;
        tear.offset = 0;
      }
    });
  };

  // 個々の涙を描画する関数
  const drawTear = (p5, x, y, size, height, offset) => {
    p5.fill(255);
    p5.noStroke();
    
    p5.beginShape();
    p5.vertex(x - size/3, y + offset);
    p5.bezierVertex(
      x - size/2, y + height/2 + offset,
      x + size/2, y + height/2 + offset,
      x + size/3, y + offset
    );
    p5.vertex(x, y - height/1.5 + offset);
    p5.endShape(p5.CLOSE);
    
    p5.stroke(255, 255, 255, 0);
    p5.strokeWeight(2);
    p5.noFill();
    p5.ellipse(x, y + offset, size * 1.1, height * 0.7);
    
    p5.noStroke();
  };

  // 当たり判定を可視化する関数
  const drawHitBoxes = (p5, params) => {
    const headMovement = headMovementRef.current;
    
    p5.push();
    p5.translate(headMovement.x, headMovement.y);
    
    p5.fill(255, 0, 0, 100);
    p5.stroke(255, 0, 0, 200);
    p5.strokeWeight(3);
    
    const eyeHitRadius = params.eyeSize * 0.5;
    
    // 左目の当たり判定
    p5.ellipse(p5.width / 2 - params.eyeSpacing, p5.height / 2 - params.eyeYOffset, eyeHitRadius * 2, eyeHitRadius * 2);
    
    // 右目の当たり判定
    p5.ellipse(p5.width / 2 + params.eyeSpacing, p5.height / 2 - params.eyeYOffset, eyeHitRadius * 2, eyeHitRadius * 2);
    
    // 鼻の当たり判定
    const noseCenterX = p5.width / 2;
    const noseCenterY = p5.height / 2 - params.eyeYOffset + params.eyeSize * 0.3;
    const noseHitRadius = params.eyeSize * 0.15;
    
    p5.fill(0, 255, 0, 100);
    p5.stroke(0, 255, 0, 200);
    p5.ellipse(noseCenterX, noseCenterY, noseHitRadius * 2, noseHitRadius * 2);
    
    p5.pop();
    
    // 画面四隅の当たり判定
    p5.push();
    const cornerRadius = 200;
    
    // 右下角
    p5.fill(0, 0, 255, 100);
    p5.stroke(0, 0, 255, 200);
    p5.rect(p5.width - cornerRadius, p5.height - cornerRadius, cornerRadius, cornerRadius);
    
    // 左下角
    p5.fill(255, 0, 255, 100);
    p5.stroke(255, 0, 255, 200);
    p5.rect(0, p5.height - cornerRadius, cornerRadius, cornerRadius);
    
    // 右上角
    p5.fill(255, 255, 0, 100);
    p5.stroke(255, 255, 0, 200);
    p5.rect(p5.width - cornerRadius, 0, cornerRadius, cornerRadius);
    
    p5.pop();
    
    // 説明テキスト
    p5.push();
    p5.fill(255, 255, 255);
    p5.textSize(16 * scaleFactorRef.current);
    p5.textAlign(p5.CENTER, p5.TOP);
    p5.text('赤い円: 目の当たり判定（hurt表情）', p5.width / 2, 20 * scaleFactorRef.current);
    p5.text('緑い円: 鼻の当たり判定（驚き表情）', p5.width / 2, 45 * scaleFactorRef.current);
    p5.text('青い四角: 右下角（口の表情）', p5.width / 2, 70 * scaleFactorRef.current);
    p5.text('マゼンタ四角: 左下角（ウインク）', p5.width / 2, 95 * scaleFactorRef.current);
    p5.text('黄色四角: 右上角（泣く表情）', p5.width / 2, 120 * scaleFactorRef.current);
    p5.text('その他: 瞳孔移動（タップ）/ 笑顔・ウインク（撫で）', p5.width / 2, 145 * scaleFactorRef.current);
    p5.text('Hキー: 当たり判定表示切り替え', p5.width / 2, 170 * scaleFactorRef.current);
    p5.pop();
  };

  // ウィンドウリサイズ処理
  const windowResized = (p5) => {
    if (fullScreen && p5.canvas) {
      p5.resizeCanvas(dimensions.width, dimensions.height);
    }
  };

  // コンポーネントのクリーンアップ
  useEffect(() => {
    return () => {
      ros2Connection.current?.stopConnection();
      expressionManager.current?.cleanup();
      eyeTapManager.current?.cleanup();
      interactionHandler.current?.cleanup();
      
      if (strokingTimerRef.current) clearInterval(strokingTimerRef.current);
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    };
  }, []);

  // スタイル設定
  const sketchStyle = {
    width: '100%',
    height: '100%',
    position: 'absolute' as const,
    top: 0,
    left: 0,
    cursor: cursorVisible ? 'auto' : 'none',
    backgroundColor: '#000',
    touchAction: fullScreen ? 'none' : 'auto',
    userSelect: fullScreen ? 'none' : 'auto',
    WebkitUserSelect: fullScreen ? 'none' : 'auto',
    WebkitTouchCallout: fullScreen ? 'none' : 'auto',
  } as React.CSSProperties;

  return (
    <div ref={containerRef} style={sketchStyle}>
      <Sketch setup={setup} draw={draw} windowResized={windowResized} />
    </div>
  );
};
