import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { 
  FacialExpression, 
  drawImageMode 
} from './FaceDrawing';

// p5はクライアントサイドでのみ実行されるため、dynamic importを使用
const Sketch = dynamic(() => import('react-p5').then((mod) => mod.default), {
  ssr: false,
});

interface P5SketchProps {
  fullScreen?: boolean;
  width?: number;
  height?: number;
  eyeSpacingFactor?: number; // 目の間隔を調整するためのプロパティを追加
  // ROS2接続のための追加プロパティ
  enableRos2Connection?: boolean;
  ros2HttpUrl?: string; // HTTPエンドポイントのURL
  // 画像表示モードのプロパティ
  displayMode?: 'face' | 'image'; // 表示モード: 顔 または 画像
  imagePath?: string; // 表示する画像のパス
  imageScaleMode?: 'fit' | 'fill' | 'stretch'; // 画像のスケーリングモード
  imageOpacity?: number; // 画像の透明度 (0-1)
  // 画像モード切り替えのコールバック
  onDisplayModeToggle?: () => void;
  onImagePathChange?: (path: string) => void; // 画像パス変更のコールバック
  // ランダム表情変更のための新しいプロパティ
  enableRandomExpression?: boolean; // ランダム表情変更を有効にするかどうか
  randomExpressionList?: FacialExpression[]; // ランダム対象の表情リスト
  randomIntervalMin?: number; // 最小間隔（秒）
  randomIntervalMax?: number; // 最大間隔（秒）
  onRandomExpressionChange?: (isActive: boolean) => void; // ランダムモード状態変更のコールバック
}

export const P5Sketch: React.FC<P5SketchProps> = ({ 
  fullScreen = true, 
  width = 400, 
  height = 400,
  eyeSpacingFactor = 1.0, // デフォルト値として1.0を設定
  enableRos2Connection = true, // ROS2接続を有効にするかどうか
  ros2HttpUrl = 'http://localhost:9090', // HTTPエンドポイントのURL
  // 画像表示モードのプロパティにデフォルト値を設定
  displayMode = 'face', // デフォルトは顔モード
  imagePath = '', // デフォルトは空文字
  imageScaleMode = 'fit', // デフォルトはfitモード
  imageOpacity = 1.0, // デフォルトは完全不透明
  onDisplayModeToggle, // コールバック関数を追加
  onImagePathChange, // 画像パス変更のコールバック
  // ランダム表情変更のためのプロパティ
  enableRandomExpression = false, // デフォルトでは無効
  randomExpressionList = ['neutral', 'happy', 'angry', 'sad', 'surprised', 'crying', 'wink'], // デフォルトの表情リスト
  randomIntervalMin = 1, // 最小間隔1秒
  randomIntervalMax = 5, // 最大間隔5秒
  onRandomExpressionChange // ランダムモード状態変更のコールバック
}) => {
  const [dimensions, setDimensions] = useState({ width, height });
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorVisible, setCursorVisible] = useState(true);
  const mouseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPipMode, setIsPipMode] = useState(false);
  const [currentEyeSpacingFactor, setCurrentEyeSpacingFactor] = useState(eyeSpacingFactor); // 目の間隔係数をステートで管理
  
  // HTTP接続のための状態
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('切断');
  
  // 手動表情変更の管理
  const manualExpressionRef = useRef({ isManual: false, timeout: null });
  
  // 画像表示モードのための状態
  const [loadedImage, setLoadedImage] = useState<any>(null);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);
  const loadedImageRef = useRef<any>(null); // p5で使用するための画像ref
  
  // 基準サイズを定義（16:9比率の基準解像度）
  const baseWidth = 1920;
  const baseHeight = 1080;
  
  // スケール係数を保持するためのref
  const scaleFactorRef = useRef(1);
  
  // 瞬きの状態を文字列型に変更（normal, blinking, enlarged）順序を変更
  const [blinkState, setBlinkState] = useState<'normal' | 'blinking' | 'enlarged'>('normal');
  // 瞬き用のrefをトップレベルで宣言
  const blinkRef = useRef(1); // 1: 完全に開いた状態、0.25: 最も閉じた状態
  
  // 頭の動きのための状態
  const headMovementRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, timer: 0 });
  
  // 表情変更アニメーションのための状態
  const expressionAnimRef = useRef({ 
    active: false, 
    timer: 0,
    intensity: 0, 
    direction: 1, 
    jumpCount: 0,
    maxJumps: 0
  });
  
  // 表情の種類は外部ファイルからインポート
  // 表情を状態で保持
  const [expression, setExpression] = useState<FacialExpression>('neutral');
  const prevExpressionRef = useRef<FacialExpression>('neutral');
  
  // タップ/クリック反応のための状態
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tapPositionRef = useRef({ x: 0, y: 0 });
  // タップ前の表情を記録するためのref
  const preHurtExpressionRef = useRef<FacialExpression>('neutral');
  
  // 口ぱくぱく機能のための状態
  const [isTalking, setIsTalking] = useState(false);
  const talkingAnimRef = useRef({
    isActive: false,
    phase: 'idle', // 'idle', 'talking', 'ending'
    timer: 0, // フェーズタイマー
    mouthState: 'closed', // 'closed', 'medium', 'large'
    stateTimer: 0, // 状態の持続時間
    stateDuration: 0, // 現在の状態の目標持続時間
    endingIntensity: 0 // 終了動作の強度
  });

  // ランダム表情変更のための状態
  const [isRandomExpressionMode, setIsRandomExpressionMode] = useState(enableRandomExpression);
  const randomExpressionRef = useRef({
    isActive: enableRandomExpression,
    nextChangeTime: 0,
    currentTime: 0
  });

  // enableRandomExpressionプロパティの変更を監視して状態を同期
  useEffect(() => {
    setIsRandomExpressionMode(enableRandomExpression);
    randomExpressionRef.current.isActive = enableRandomExpression;
    
    if (enableRandomExpression) {
      // ランダムモードが有効になった場合、初期の変更時間を設定
      const minFrames = randomIntervalMin * 60; // 秒をフレームに変換（60fps想定）
      const maxFrames = randomIntervalMax * 60;
      randomExpressionRef.current.nextChangeTime = randomExpressionRef.current.currentTime + 
        minFrames + Math.random() * (maxFrames - minFrames);
      console.log(`プロパティからランダム表情モード開始 - 最初の変更まで: ${Math.round((randomExpressionRef.current.nextChangeTime - randomExpressionRef.current.currentTime) / 60 * 10) / 10}秒`);
    } else {
      // ランダムモードが無効になった場合、リセット
      randomExpressionRef.current.currentTime = 0;
      randomExpressionRef.current.nextChangeTime = 0;
      console.log('プロパティからランダム表情モード無効');
    }
    
    // 親コンポーネントに状態変更を通知
    if (onRandomExpressionChange) {
      onRandomExpressionChange(enableRandomExpression);
    }
  }, [enableRandomExpression, randomIntervalMin, randomIntervalMax, onRandomExpressionChange]);

  // HTTP接続による表情取得とポーリング
  useEffect(() => {
    // ROS2接続が有効でない場合は何もしない
    if (!enableRos2Connection) {
      setConnectionStatus('切断');
      console.log('ROS2接続が無効のため、ポーリングを停止します');
      return;
    }

    console.log(`ROS2接続開始: ${ros2HttpUrl}`);
    console.log('現在の表情状態:', expression);
    let pollingInterval: NodeJS.Timeout;
    let isPollingActive = true; // ポーリングが有効かどうかのフラグ
    
    // HTTPエンドポイントから表情を取得する関数
    const fetchExpression = async () => {
      if (!isPollingActive) return; // ポーリングが無効化されていたら何もしない
      
      // 手動表情変更中はポーリングをスキップ
      if (manualExpressionRef.current.isManual) {
        console.log('手動表情変更中のため、ポーリングをスキップします');
        return;
      }
      
      try {
        const startTime = Date.now();
        console.log(`[${new Date().toLocaleTimeString()}] 表情を取得中: ${ros2HttpUrl}/expression`);
        const response = await fetch(`${ros2HttpUrl}/expression`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          // タイムアウトを短縮
          signal: AbortSignal.timeout(2000)
        });

        if (response.ok) {
          const data = await response.json();
          const endTime = Date.now();
          console.log(`[${new Date().toLocaleTimeString()}] 受信データ:`, data, `(${endTime - startTime}ms)`);
          
          // 有効な表情タイプであれば設定
          if (data.expression && isValidExpression(data.expression)) {
            const newExpression = data.expression as FacialExpression;
            console.log(`比較: 受信=${newExpression}, 現在の表情=${newExpression}`);
            
            // 表情を更新（常に新しい値をセット）
            setExpression(newExpression);
            console.log(`✅ 表情更新: ${newExpression}`);
          }
          
          // 接続状態を更新
          setIsConnected(true);
          setConnectionStatus('接続中');
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.log('HTTP接続エラー:', error.message);
        setIsConnected(false);
        setConnectionStatus('切断');
      }
    };

    // HTTPエンドポイントから表示モードを取得する関数
    const fetchDisplayMode = async () => {
      if (!isPollingActive) return;
      
      try {
        const response = await fetch(`${ros2HttpUrl}/display_mode`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(2000)
        });

        if (response.ok) {
          const data = await response.json();
          if (data.display_mode && (data.display_mode === 'face' || data.display_mode === 'image')) {
            // HTTPサーバーからの表示モードが現在の状態と異なる場合のみ更新
            if (data.display_mode !== displayMode) {
              console.log(`表示モード更新: ${displayMode} -> ${data.display_mode}`);
              // 親コンポーネント（home.tsx）の状態を更新
              if (onDisplayModeToggle && data.display_mode !== displayMode) {
                // 直接状態を更新するのではなく、コールバックを使用
                console.log('HTTPサーバーからの表示モード変更を適用');
                onDisplayModeToggle();
              }
            }
          }
        }
      } catch (error) {
        console.log('表示モード取得エラー:', error.message);
      }
    };

    // 表情が有効かどうかをチェックする関数
    const isValidExpression = (exp: string): boolean => {
      return ['neutral', 'happy', 'angry', 'sad', 'surprised', 'crying', 'hurt', 'wink'].includes(exp);
    };

    // 表情をROS2サーバーに送信する関数
    const sendExpressionToRos2 = async (newExpression: FacialExpression) => {
      if (!enableRos2Connection) return;

      try {
        console.log(`ROS2サーバーに表情を送信中: ${newExpression}`);
        const response = await fetch(`${ros2HttpUrl}/expression`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ expression: newExpression }),
          signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        console.log(`✅ ROS2サーバーに表情 ${newExpression} を送信完了`);
      } catch (error) {
        console.warn('表情の送信に失敗しました:', error.message);
      }
    };

    // 初回取得
    console.log('初回表情取得を開始');
    fetchExpression();
    fetchDisplayMode();
    
    // ポーリング間隔を調整（1000ms = 1秒間隔）
    console.log('ポーリング開始（1000ms間隔）');
    pollingInterval = setInterval(() => {
      fetchExpression();
      fetchDisplayMode();
    }, 1000);
    
    // クリーンアップ
    return () => {
      isPollingActive = false; // ポーリングを無効化
      if (pollingInterval) {
        console.log('ポーリング停止');
        clearInterval(pollingInterval);
      }
    };
  }, [enableRos2Connection, ros2HttpUrl, displayMode, onDisplayModeToggle]); // displayModeとonDisplayModeToggleを依存関係に追加

  // 表情をHTTPで送信する関数
  const sendExpressionToRos2 = async (newExpression: FacialExpression) => {
    if (!enableRos2Connection) return;

    try {
      const response = await fetch(`${ros2HttpUrl}/expression`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expression: newExpression }),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      console.log(`HTTP経由で表情 ${newExpression} を送信しました`);
    } catch (error) {
      console.warn('表情の送信に失敗しました:', error.message);
    }
  };

  // 手動表情変更を管理する関数
  const setManualExpression = (newExpression: FacialExpression) => {
    console.log(`手動表情変更: ${newExpression}`);
    
    // 手動変更フラグをセット
    manualExpressionRef.current.isManual = true;
    
    // 既存のタイムアウトをクリア
    if (manualExpressionRef.current.timeout) {
      clearTimeout(manualExpressionRef.current.timeout);
    }
    
    // 表情を変更
    setExpression(newExpression);
    
    // ROS2サーバーにも新しい表情を送信（重要！）
    sendExpressionToRos2(newExpression);
    
    // 5秒後に手動変更フラグを解除（ポーリング再開）
    manualExpressionRef.current.timeout = setTimeout(() => {
      console.log('手動表情変更の一時停止を解除します');
      manualExpressionRef.current.isManual = false;
    }, 5000); // 5秒間ポーリングを停止
  };

  // 画像読み込み処理
  useEffect(() => {
    if (displayMode === 'image' && imagePath) {
      setImageLoadError(null);
      console.log(`画像を読み込み中: ${imagePath}`);
      
      // 既存の画像をクリアせず、新しい画像が読み込まれるまで保持
      // setLoadedImage(null);
      // loadedImageRef.current = null;
      
      // p5.jsで使用するための画像読み込みは、draw関数内で行う
      // ここでは読み込み状態の管理のみ行う
    } else if (displayMode === 'face') {
      // 顔モードに切り替わった場合のみ画像をクリア
      setLoadedImage(null);
      loadedImageRef.current = null;
      setImageLoadError(null);
    }
  }, [displayMode, imagePath]);

  // リサイズ関連の処理
  useEffect(() => {
    if (fullScreen) {
      const updateDimensions = () => {
        // 16:9のアスペクト比を維持する
        const targetRatio = 16 / 9;
        const screenRatio = window.innerWidth / window.innerHeight;
        
        let newWidth, newHeight;
        
        if (screenRatio > targetRatio) {
          // 画面が横長の場合は高さに合わせる
          newHeight = window.innerHeight;
          newWidth = newHeight * targetRatio;
        } else {
          // 画面が縦長の場合は幅に合わせる
          newWidth = window.innerWidth;
          newHeight = newWidth / targetRatio;
        }
        
        // スケール係数を計算（幅基準）
        scaleFactorRef.current = newWidth / baseWidth;
        
        setDimensions({
          width: newWidth,
          height: newHeight
        });
      };

      updateDimensions();
      window.addEventListener('resize', updateDimensions);

      return () => {
        window.removeEventListener('resize', updateDimensions);
      };
    }
  }, [fullScreen]);

  useEffect(() => {
    setCurrentEyeSpacingFactor(eyeSpacingFactor); // 親コンポーネントから変更を反映
  }, [eyeSpacingFactor]);

  // マウスの動きを監視して一定時間後にポインタを非表示にする
  useEffect(() => {
    const hideCursorDelay = 3000; // 3秒間動きがなければマウスを非表示

    // マウスが動いたときの処理
    const handleMouseMove = () => {
      // カーソルを表示
      setCursorVisible(true);
      
      // 既存のタイマーをクリア
      if (mouseTimerRef.current) {
        clearTimeout(mouseTimerRef.current);
      }
      
      // 新しいタイマーをセット
      mouseTimerRef.current = setTimeout(() => {
        setCursorVisible(false);
      }, hideCursorDelay);
    };
    
    // イベントリスナーを追加
    window.addEventListener('mousemove', handleMouseMove);
    
    // 初期タイマーをセット
    handleMouseMove();
    
    // クリーンアップ
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (mouseTimerRef.current) {
        clearTimeout(mouseTimerRef.current);
      }
    };
  }, []);

  // 瞬きの処理を設定
  useEffect(() => {
    const blinkDuration = 130; // 瞬きの持続時間（ミリ秒）
    const enlargeDuration = 160; // 目が大きくなる時間（ミリ秒）
    let stateTimeout: NodeJS.Timeout;

    // 一定時間ごとに瞬きシーケンスを開始
    const timer = setInterval(() => {
      // 1. まず目を閉じる（瞬き）
      setBlinkState('blinking');

      // 2. blinkDuration後に目を大きく開く
      stateTimeout = setTimeout(() => {
        setBlinkState('enlarged');
        
        // 3. enlargeDuration後に通常状態に戻す
        stateTimeout = setTimeout(() => {
          setBlinkState('normal');
        }, enlargeDuration);
      }, blinkDuration);
    }, 3000 + Math.random() * 7000); // 3-5秒ごとに瞬き

    return () => {
      clearInterval(timer);
      clearTimeout(stateTimeout);
    };
  }, []);

  // 表情が変更されたときのエフェクトを追加
  useEffect(() => {
    // 表情が変わったら、前の表情を保存し、アニメーションを開始
    if (expression !== prevExpressionRef.current) {
      // 前回の表情を記録
      prevExpressionRef.current = expression;
      
      // ぴょんぴょん効果のアニメーション開始
      const expressionAnim = expressionAnimRef.current;
      expressionAnim.active = true;
      expressionAnim.intensity = 0;
      expressionAnim.direction = 1;
      expressionAnim.jumpCount = 0;
      
      // すべての表情でジャンプ回数を1回に統一
      expressionAnim.maxJumps = 1;
    }
  }, [expression]);
  
  // p5のsetup関数 - キャンバスの作成をシンプルに
  const setup = (p5, canvasParentRef) => {
    // シンプルにキャンバスを作成するだけ
    const canvas = p5.createCanvas(dimensions.width, dimensions.height).parent(canvasParentRef);
    canvasRef.current = canvas.elt; // canvasの参照を保存
    
    // キャンバスにtabindexを設定してフォーカス可能にする
    canvas.elt.setAttribute('tabindex', '0');
    canvas.elt.style.outline = 'none'; // フォーカス時の枠線を非表示
    
    // キャンバスがクリックされたときにフォーカスを設定
    canvas.elt.addEventListener('click', () => {
      canvas.elt.focus();
      console.log('キャンバスにフォーカスが設定されました');
    });
    
    // 初期フォーカスを設定
    setTimeout(() => {
      canvas.elt.focus();
      console.log('初期フォーカスが設定されました');
    }, 100);
    
    // タップ（クリック）イベントの追加
    canvas.elt.addEventListener('click', handleTap);
    canvas.elt.addEventListener('touchend', handleTap);
    
    // 通常のDOM keydownイベントも追加（デバッグ用）
    canvas.elt.addEventListener('keydown', (event) => {
      console.log('DOM keydown イベント:', event.key, 'displayMode:', displayMode);
      if (event.key.toLowerCase() === 'i') {
        console.log('DOM経由でIキーが検出されました - 現在のモード:', displayMode);
        if (onDisplayModeToggle) {
          console.log('onDisplayModeToggleを実行します');
          onDisplayModeToggle();
        }
        event.preventDefault();
        event.stopPropagation();
      }
    });
    
    // グローバルなキーボードイベントも追加（フォーカス問題対策）
    window.addEventListener('keydown', (event) => {
      console.log('Window keydown イベント:', event.key, 'displayMode:', displayMode);
      if (event.key.toLowerCase() === 'i') {
        console.log('Window経由でIキーが検出されました - 現在のモード:', displayMode);
        if (onDisplayModeToggle) {
          console.log('onDisplayModeToggleを実行します');
          onDisplayModeToggle();
        }
        event.preventDefault();
        event.stopPropagation();
      }
    });
    
    // キーボード入力処理をsetupで設定
    p5.keyPressed = () => {
      console.log('p5.keyPressed:', p5.key, 'displayMode:', displayMode);
      return handleKeyPress(p5);
    };
  };

  // タップ（クリック）イベントのハンドラ
  const handleTap = (event) => {
    // タップ位置を記録（タッチイベントとクリックイベントの両方に対応）
    const touchEvent = event.touches ? event.touches[0] : event;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Canvas内での相対座標を計算
    const x = touchEvent.clientX - rect.left;
    const y = touchEvent.clientY - rect.top;
    
    tapPositionRef.current = { x, y };
    
    // 目のタッチ判定を行う
    if (isInEyeArea(x, y)) {
      console.log('=== 目の領域タップ検出 ===');
      console.log('タップ位置:', { x, y });
      console.log('React state expression:', expression);
      console.log('prevExpressionRef.current:', prevExpressionRef.current);
      console.log('preHurtExpressionRef.current (タップ前):', preHurtExpressionRef.current);
      
      // hurt表情でない場合のみ、現在の表情を記録
      if (prevExpressionRef.current !== 'hurt') {
        preHurtExpressionRef.current = prevExpressionRef.current;
      }
      // hurt表情の場合は既存の記録をそのまま保持
      
      console.log('記録した表情:', preHurtExpressionRef.current);
      console.log('========================');
      
      // 痛がる表情に変更（手動表情変更として）
      setManualExpression('hurt');
      
      // 1秒後に元の表情に戻す
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      tapTimeoutRef.current = setTimeout(() => {
        const restoreExpression = preHurtExpressionRef.current;
        console.log('戻す表情:', restoreExpression);
        // 元の表情に戻すときも手動表情変更として扱う
        setManualExpression(restoreExpression);
      }, 1000);
    } else {
      console.log('目の領域外タップ - 無視');
    }
  };

  // タップ位置が目の領域内かどうかを判定する関数
  const isInEyeArea = (tapX, tapY) => {
    // 現在の目のパラメータを取得（簡易版）
    const scaleX = dimensions.width / baseWidth;
    const scaleY = dimensions.height / baseHeight;
    const scaleFactor = Math.min(scaleX, scaleY);
    
    const baseEyeSize = baseWidth / 4.5;
    const eyeSize = baseEyeSize * scaleFactor;
    const eyeSpacing = eyeSize * 2.5 * currentEyeSpacingFactor;
    
    const leftEyeX = dimensions.width / 2 - eyeSpacing / 2;
    const rightEyeX = dimensions.width / 2 + eyeSpacing / 2;
    const eyeY = dimensions.height / 2;
    
    // 左目の判定領域
    const leftEyeTouchArea = {
      x: leftEyeX - eyeSize * 0.8,
      y: eyeY - eyeSize * 0.6,
      width: eyeSize * 1.6,
      height: eyeSize * 1.2
    };
    
    // 右目の判定領域
    const rightEyeTouchArea = {
      x: rightEyeX - eyeSize * 0.8,
      y: eyeY - eyeSize * 0.6,
      width: eyeSize * 1.6,
      height: eyeSize * 1.2
    };
    
    // 左目または右目の領域内かどうかを判定
    const inLeftEye = (tapX >= leftEyeTouchArea.x && tapX <= leftEyeTouchArea.x + leftEyeTouchArea.width &&
                       tapY >= leftEyeTouchArea.y && tapY <= leftEyeTouchArea.y + leftEyeTouchArea.height);
    
    const inRightEye = (tapX >= rightEyeTouchArea.x && tapX <= rightEyeTouchArea.x + rightEyeTouchArea.width &&
                        tapY >= rightEyeTouchArea.y && tapY <= rightEyeTouchArea.y + rightEyeTouchArea.height);
    
    return inLeftEye || inRightEye;
  };

  // p5のdraw関数 - 表示モードに応じて顔または画像を描画
  const draw = (p5) => {
    // ランダム表情変更の処理
    if (randomExpressionRef.current.isActive) {
      randomExpressionRef.current.currentTime++;
      
      // 次の変更時間に達したら表情を変更
      if (randomExpressionRef.current.currentTime >= randomExpressionRef.current.nextChangeTime) {
        // カスタマイズされた表情リストからランダムに選択
        const availableExpressions = randomExpressionList.filter(expr => expr !== 'talking'); // talkingは除外
        const randomExpression = availableExpressions[Math.floor(Math.random() * availableExpressions.length)];
        
        console.log(`ランダム表情変更: ${randomExpression}`);
        setManualExpression(randomExpression);
        
        // 次の変更時間をカスタマイズされた間隔でランダムに設定
        const minFrames = randomIntervalMin * 60; // 秒をフレームに変換（60fps想定）
        const maxFrames = randomIntervalMax * 60;
        randomExpressionRef.current.nextChangeTime = randomExpressionRef.current.currentTime + 
          minFrames + Math.random() * (maxFrames - minFrames);
        
        console.log(`次の変更まで: ${Math.round((randomExpressionRef.current.nextChangeTime - randomExpressionRef.current.currentTime) / 60 * 10) / 10}秒`);
      }
    }
    
    // 状態の同期チェック（isRandomExpressionModeとrefの不整合を防ぐ）
    if (isRandomExpressionMode !== randomExpressionRef.current.isActive) {
      console.log(`状態の不整合を検出: isRandomExpressionMode=${isRandomExpressionMode}, ref.isActive=${randomExpressionRef.current.isActive}`);
      if (!randomExpressionRef.current.isActive) {
        setIsRandomExpressionMode(false);
      }
    }

    // 背景を黒で塗りつぶす
    p5.background(0, 0, 0);
    
    // 目のパラメータを事前に計算（判定領域描画用）
    let eyeParams = null;
    
    if (displayMode === 'image') {
      // 画像表示モード
      drawImageMode(p5, loadedImageRef, imagePath, imageLoadError, scaleFactorRef, dimensions, imageScaleMode, imageOpacity);
    } else {
      // 顔表示モード（既存の処理）
      drawFaceMode(p5);
      // 顔モードの場合は目のパラメータを取得
      eyeParams = calculateEyeParameters(p5);
    }
    
    // ★ 一番最後に判定領域を描画（他の全ての要素の上に表示）
    if (displayMode === 'face' && eyeParams) {
      drawEyeTouchAreas(p5, eyeParams);
    }
  };

  // 顔表示モードの描画処理（既存のdraw関数の内容）
  const drawFaceMode = (p5) => {
    // 頭の動きを更新
    updateHeadMovement(p5);
    
    // 目を描画するための各種パラメータを計算
    const eyeParams = calculateEyeParameters(p5);
    
    // 瞬きの状態を更新
    updateBlinkState(p5, eyeParams);
    
    // 瞳の位置を更新
    updatePupilPositions(p5, eyeParams);
    
    // 口ぱくぱくアニメーションを更新
    updateTalkingAnimation(p5);
    
    // 両目を描画
    drawEyes(p5, eyeParams);

    // 口を描画
    drawMouth(p5, eyeParams);
    
    // 頭の動きをリセット（重要：pushを使用したら、必ずpopでリセットする）
    p5.pop();
  };

  // 頭の動きを更新する関数
  const updateHeadMovement = (p5) => {
    const headMovement = headMovementRef.current;
    const expressionAnim = expressionAnimRef.current;
    
    // 表情変更のぴょんぴょんアニメーション処理
    if (expressionAnim.active) {
      // ジャンプのパターンを作成（上下に動く）
      if (expressionAnim.direction > 0) {
        // 上に動く
        expressionAnim.intensity += 0.08;
        if (expressionAnim.intensity > 1) {
          expressionAnim.direction = -1; // 下に方向転換
        }
      } else {
        // 下に動く
        expressionAnim.intensity -= 0.12;
        if (expressionAnim.intensity < 0) {
          expressionAnim.intensity = 0;
          expressionAnim.jumpCount++;
          
          // 設定された回数ジャンプしたらアニメーションを終了
          if (expressionAnim.jumpCount >= expressionAnim.maxJumps) {
            expressionAnim.active = false;
          } else {
            // 次のジャンプを開始
            expressionAnim.direction = 1;
          }
        }
      }
      
      // ジャンプの高さと横の動きを表情ごとに調整
      let jumpHeight = 0;
      let jumpX = 0;
      
      switch (expression) {
        case 'happy':
          // 喜びは高く大きく跳ねる
          jumpHeight = scaleFactorRef.current * 
            (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 
            30; // 高さ係数30（大きい）
          break;
        
        case 'surprised':
          // 驚きは中くらいの高さで左右にも揺れる
          jumpHeight = scaleFactorRef.current * 
            (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 
            25; // 高さ係数25（中くらい）
          jumpX = Math.sin(expressionAnim.intensity * Math.PI * 2) * 8 * scaleFactorRef.current;
          break;
        
        case 'angry':
          // 怒りは低めだが素早く左右に振動
          jumpHeight = scaleFactorRef.current * 
            (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 
            15; // 高さ係数15（低め）
          jumpX = Math.sin(expressionAnim.intensity * Math.PI * 5) * 6 * scaleFactorRef.current;
          break;
          
        case 'sad':
          // 悲しみは小さく沈むような動き
          jumpHeight = scaleFactorRef.current * 
            (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 
            10; // 高さ係数10（低い）
          break;
          
        case 'crying':
          // 泣きはさらに小さく震えるような動き
          jumpHeight = scaleFactorRef.current * 
            (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 
            12; // 高さ係数12（やや低い）
          jumpX = Math.sin(expressionAnim.intensity * Math.PI * 8) * 3 * scaleFactorRef.current;
          break;
          
        case 'hurt':
          // 痛がる表情は激しく震える
          jumpHeight = scaleFactorRef.current * 
            (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 
            18; // 高さ係数18
          jumpX = Math.sin(expressionAnim.intensity * Math.PI * 12) * 9 * scaleFactorRef.current;
          break;
          
        case 'wink':
          // ウィンクは軽やかで楽しげなジャンプ
          jumpHeight = scaleFactorRef.current * 
            (-4 * Math.pow(expressionAnim.intensity - 0.5, 2) + 1) * 
            22; // 高さ係数22（happyより少し控えめ）
          jumpX = Math.sin(expressionAnim.intensity * Math.PI * 3) * 4 * scaleFactorRef.current;
          break;
      }
      
      // 通常の頭の動きに表情アニメーションの効果を加える
      p5.push();
      p5.translate(headMovement.x + jumpX, headMovement.y - jumpHeight);
      return;
    }
    
    // 以下、通常の頭の動き処理
    headMovement.timer -= 1;
    if (headMovement.timer <= 0) {
      // 新しい目標位置を設定（適度な範囲内でランダム）- 可動範囲をさらに狭める
      const moveRange = scaleFactorRef.current * 1.5; // 元は3、1.5に縮小
      headMovement.targetX = (Math.random() * 2 - 1) * moveRange;
      headMovement.targetY = (Math.random() * 2 - 1) * moveRange;
      
      // 次の動きまでの時間をランダムに設定 - さらに長めに設定
      headMovement.timer = Math.floor(Math.random() * 240) + 180; // 180〜420フレーム（約3〜7秒）
    }
    
    // イージングで現在位置を目標位置に近づける - より緩やかに
    const easing = 0.01; // 元は0.02、0.01に縮小
    headMovement.x += (headMovement.targetX - headMovement.x) * easing;
    headMovement.y += (headMovement.targetY - headMovement.y) * easing;
    
    // わずかなランダムな揺れを加える（呼吸のような効果）- さらに効果を小さく
    const breathingEffect = Math.sin(p5.frameCount * 0.008) * scaleFactorRef.current * 0.5; // 振幅をさらに半分に
    headMovement.y += breathingEffect;

    // キャンバス全体をシフト（頭の動きを表現）
    p5.push();
    p5.translate(headMovement.x, headMovement.y);
  };

  // 口ぱくぱくアニメーションを更新する関数（3パターン：中・大・閉じる）
  const updateTalkingAnimation = (p5) => {
    const talkingAnim = talkingAnimRef.current;
    
    // デバッグ情報を定期的に出力
    if (p5.frameCount % 60 === 0 && talkingAnim.isActive) { // 1秒ごと
      console.log('口ぱくぱく状態:', {
        isActive: talkingAnim.isActive,
        phase: talkingAnim.phase,
        mouthState: talkingAnim.mouthState,
        stateTimer: talkingAnim.stateTimer,
        stateDuration: talkingAnim.stateDuration
      });
    }
    
    if (talkingAnim.isActive) {
      talkingAnim.timer++;
      
      switch (talkingAnim.phase) {
        case 'talking':
          // 口ぱくぱくフェーズ（3パターン切り替え）
          talkingAnim.stateTimer++;
          
          if (talkingAnim.stateTimer >= talkingAnim.stateDuration) {
            // 次の状態に遷移
            talkingAnim.stateTimer = 0;
            
            // ランダムに次の状態を決定（より自然な口ぱくぱく）
            const currentState = talkingAnim.mouthState;
            const random = Math.random();
            
            if (currentState === 'closed') {
              // 閉じた状態から中または大へ
              talkingAnim.mouthState = random < 0.6 ? 'medium' : 'large';
              talkingAnim.stateDuration = 8 + Math.random() * 12; // 8-20フレーム
            } else if (currentState === 'medium') {
              // 中から閉じる、大きく開く、または維持
              if (random < 0.4) {
                talkingAnim.mouthState = 'closed';
                talkingAnim.stateDuration = 5 + Math.random() * 10; // 5-15フレーム
              } else if (random < 0.7) {
                talkingAnim.mouthState = 'large';
                talkingAnim.stateDuration = 6 + Math.random() * 8; // 6-14フレーム
              } else {
                // 中を維持
                talkingAnim.stateDuration = 8 + Math.random() * 12;
              }
            } else { // 'large'
              // 大から中または閉じるへ
              talkingAnim.mouthState = random < 0.6 ? 'medium' : 'closed';
              talkingAnim.stateDuration = random < 0.6 ? 
                (8 + Math.random() * 12) : // medium: 8-20フレーム
                (5 + Math.random() * 10);  // closed: 5-15フレーム
            }
          }
          break;
          
        case 'ending':
          // 終了動作フェーズ（約30フレーム = 0.5秒）
          talkingAnim.endingIntensity = Math.sin(((30 - talkingAnim.timer) / 30) * Math.PI);
          // 徐々に閉じた状態に移行
          if (talkingAnim.timer > 15) {
            talkingAnim.mouthState = 'closed';
          }
          
          if (talkingAnim.timer >= 30) {
            // 終了動作完了
            talkingAnim.phase = 'idle';
            talkingAnim.isActive = false;
            talkingAnim.timer = 0;
            talkingAnim.mouthState = 'closed';
            talkingAnim.stateTimer = 0;
            talkingAnim.stateDuration = 0;
            talkingAnim.endingIntensity = 0;
            setIsTalking(false); // React状態も更新
            setManualExpression('neutral'); // neutral表情に戻す
            console.log('口ぱくぱく終了');
          }
          break;
      }
    }
  };

  // 目のパラメータを計算する関数
  const calculateEyeParameters = (p5) => {
    // 基準値を設定（基準解像度での値）
    const baseEyeSize = baseWidth / 4.5;  // 基準解像度でのサイズ
    const baseEyeSpacing = baseEyeSize * 1;
    const basePupilSize = baseEyeSize / 2.3;
    const baseEyeYOffset = baseHeight / 8;
    
    // 目の間隔と大きさの調整係数
    const eyeSizeFactor = 1.2;     // 目の大きさ調整係数: 1.0が標準、大きくするなら>1.0、小さくするなら<1.0
    const eyeSpacingFactor = currentEyeSpacingFactor;  // 目の間隔調整係数（ステートから取得）
    
    // 現在のスケールに合わせて調整
    const scale = scaleFactorRef.current;
    const eyeSize = baseEyeSize * scale * eyeSizeFactor;  // 目の大きさに係数を適用
    const eyeSpacing = baseEyeSpacing * scale * eyeSpacingFactor;  // 目の間隔に係数を適用
    const pupilSize = basePupilSize * scale * eyeSizeFactor;  // 瞳のサイズも目の大きさに合わせて調整
    const eyeYOffset = baseEyeYOffset * scale;
    const eyeRadius = (baseEyeSize / 10) * scale; // 瞳が動ける範囲
    
    return {
      eyeSize,
      eyeSpacing,
      pupilSize,
      eyeYOffset,
      easeFactor: 0.75,
      eyeRadius
    };
  };

  // 瞬きの状態を更新する関数
  const updateBlinkState = (p5, params) => {
    // 瞬きの状態に応じた係数を計算
    let targetEyeOpen = 1;
    let verticalSizeFactor = 1; // 縦方向の目の大きさの係数
    
    if (blinkState === 'blinking') {
      targetEyeOpen = 0.15; // 瞬きで目を閉じる
      verticalSizeFactor = 1.1;
    } else if (blinkState === 'enlarged') {
      targetEyeOpen = 1; 
      verticalSizeFactor = 1.05; // 目を縦に大きくする
    } else {
      targetEyeOpen = 1;
      verticalSizeFactor = 1.0;
    }
    
    // blinkRefを更新
    blinkRef.current += (targetEyeOpen - blinkRef.current) * params.easeFactor;
    
    // 縦方向のサイズに対するイージングを適用
    p5.eyeVerticalFactor = p5.eyeVerticalFactor || 1.0;
    p5.eyeVerticalFactor += (verticalSizeFactor - p5.eyeVerticalFactor) * params.easeFactor;
  };
  
  // 瞳の位置を更新する関数
  const updatePupilPositions = (p5, params) => {
    const eyeMovementEase = 0.1;
    
    // 左右の瞳のターゲット位置を初期化
    p5.leftEyeTarget = p5.leftEyeTarget || { x: 0, y: 0 };
    p5.rightEyeTarget = p5.rightEyeTarget || { x: 0, y: 0 };
    
    // 次の瞳の動きまでのフレーム数を管理
    p5.nextEyeMovement = p5.nextEyeMovement || 0;
    
    // 初回実行時または設定された次回のタイミングになったら瞳の位置を更新
    if (!p5.frameCount || p5.frameCount >= p5.nextEyeMovement) {
      // 新しい位置へ移動
      p5.leftEyeTarget = {
        x: (Math.random() * 2 - 1) * params.eyeRadius,
        y: (Math.random() * 2 - 1) * params.eyeRadius
      };
      p5.rightEyeTarget = {
        x: p5.leftEyeTarget.x,
        y: p5.leftEyeTarget.y
      };
      
      // 次に瞳を動かすタイミングを設定
      const minFrames = 60 * 3; // 3秒
      const maxFrames = 600; // 10秒
      p5.nextEyeMovement = p5.frameCount + Math.floor(Math.random() * (maxFrames - minFrames + 1)) + minFrames;
    }
    
    // 現在の瞳の位置を保存
    p5.leftEyePos = p5.leftEyePos || { x: 0, y: 0 };
    p5.rightEyePos = p5.rightEyePos || { x: 0, y: 0 };
    
    // イージングで滑らかに移動
    p5.leftEyePos.x += (p5.leftEyeTarget.x - p5.leftEyePos.x) * eyeMovementEase;
    p5.leftEyePos.y += (p5.leftEyeTarget.y - p5.leftEyePos.y) * eyeMovementEase;
    p5.rightEyePos.x += (p5.leftEyeTarget.x - p5.rightEyePos.x) * eyeMovementEase;
    p5.rightEyePos.y += (p5.leftEyeTarget.y - p5.rightEyePos.y) * eyeMovementEase;
  };
  
  // 両目を描画する関数
  const drawEyes = (p5, params) => {
    // サイズ係数を適用して目を描画
    let currentEyeWidth = params.eyeSize;
    let currentEyeHeight = params.eyeSize * p5.eyeVerticalFactor;
    let currentPupilSize = params.pupilSize;
    const blinkAmount = blinkRef.current;
    
    // 表情に応じて目の形状や位置を調整するパラメータ
    let eyeAngle = 0; // 目の角度（ラジアン）
    let eyeWidthFactor = 1.0; // 目の横幅調整係数
    let eyeHeightFactor = 1.0; // 目の縦幅調整係数
    let pupilSizeFactor = 1.0; // 瞳のサイズ調整係数
    let eyeYOffset = 0; // 目のY位置オフセット
    let pupilYOffset = 0; // 瞳のY位置オフセット
    
    // まぶたの制御パラメータ（0: 完全に閉じている、1: 完全に開いている）
    let upperEyelid = 1.0;  // 上まぶた
    let lowerEyelid = 1.0;  // 下まぶた
    
    // 表情に応じたパラメータの設定
    switch (expression) {
      case 'neutral': // 通常
        eyeAngle = 0;
        eyeWidthFactor = 1.0;
        eyeHeightFactor = 1.0;
        pupilSizeFactor = 1.0;
        upperEyelid = 1.0;
        lowerEyelid = 1.0;
        break;
        
      case 'happy': // 笑顔
        eyeAngle = -0.07; // 少し上向きの目
        // eyeHeightFactor = 1.15; // 少し細める
        // eyeWidthFactor = 1.05; // 少し広げる
        // eyeYOffset = -params.eyeSize * 0.05; // 少し上にシフト
        // upperEyelid = 0.7; // 上まぶたを少し閉じる（笑顔の効果）
        lowerEyelid = 0.9; 
        break;
        
      case 'angry': // 怒り
        eyeAngle = 0.20; // 目尻が下がった怒った目
        // eyeWidthFactor = 0.90; // 少し幅を狭める
        // eyeHeightFactor = 0.90; // 少し縦に狭める
        // pupilSizeFactor = 0.9; // 瞳を少し小さく
        // eyeYOffset = params.eyeSize * 0.1; // 少し下にシフト
        // pupilYOffset = params.eyeSize * 0.05; // 瞳を少し下にずらす
        upperEyelid = 0.75; // 上まぶたを少し下げる
        // lowerEyelid = 0.95; // 下まぶたを少し上げる
        break;
        
      case 'sad': // 悲しみ
        eyeAngle = -0.15; // 目尻が上がった悲しい目
        eyeYOffset = params.eyeSize * 0.15; // 下にシフト
        upperEyelid = 0.9; // 上まぶたを少し下げる
        lowerEyelid = 0.9; // 下まぶたを少し上げる
        break;
        
      case 'surprised': // 驚き
        eyeWidthFactor = 1.2; // 目を大きく
        eyeHeightFactor = 1.3; // 目を大きく
        pupilSizeFactor = 0.9; // 瞳を小さく
        eyeYOffset = -params.eyeSize * 0.1; // 少し上にシフト
        upperEyelid = 1.0; // 完全に開く
        lowerEyelid = 1.0; // 完全に開く
        break;
        
      case 'crying': // 泣き
        eyeAngle = -0.25; // 目尻が上がった悲しい目
        pupilSizeFactor = 0.9; // 瞳を少し小さく
        eyeYOffset = params.eyeSize * 0.1; // 下にシフト
        upperEyelid = 0.7; // 上まぶたを少し下げる
        lowerEyelid = 0.9; // 下まぶたをより上げる（泣きの表現）
        break;
        
      case 'hurt': // 痛がる表情
        eyeAngle = 0.25; // 目尻が下がった痛がる目
        eyeWidthFactor = 0.85; // 目を少し小さく
        eyeYOffset = params.eyeSize * 0.10; // 下にシフト
        upperEyelid = 0.55; // 上まぶたをかなり下げる
        lowerEyelid = 0.5; // 下まぶたを上げる
        pupilSizeFactor = 0.8; // 瞳を小さく
        break;
        
      case 'wink': // ウィンク
        eyeAngle = -0.05; // 軽い笑顔の角度
        eyeWidthFactor = 1.0; // 通常サイズ
        eyeHeightFactor = 1.0; // 通常サイズ
        pupilSizeFactor = 1.0; // 通常の瞳サイズ
        upperEyelid = 1.0; // 左目は開いたまま
        lowerEyelid = 1.0; // 左目は開いたまま
        break;
    }
    
    // 調整されたサイズを適用
    currentEyeWidth *= eyeWidthFactor;
    currentEyeHeight *= eyeHeightFactor * blinkAmount;
    currentPupilSize *= pupilSizeFactor;
    
    // winkの場合は左右の目で異なるまぶたの設定を使用
    let leftUpperEyelid = upperEyelid;
    let leftLowerEyelid = lowerEyelid;
    let rightUpperEyelid = upperEyelid;
    let rightLowerEyelid = lowerEyelid;
    
    if (expression === 'wink') {
      // 左目を半目に、右目は開いたまま
      leftUpperEyelid = 1.0; // 左目を半目にする
      leftLowerEyelid = 1.0; // 左目の下まぶたも少し上げる
      rightUpperEyelid = 0.0; // 右目は開いたまま
      rightLowerEyelid = 0.0; // 右目は開いたまま
    }
    
    // 左目の描画
    p5.push(); // 現在の描画設定を保存
    p5.translate(p5.width / 2 - params.eyeSpacing, p5.height / 2 - params.eyeYOffset + eyeYOffset);
    p5.rotate(eyeAngle);
    
    // まぶたの効果を適用して目を描画
    drawEyeWithLids(p5, currentEyeWidth, currentEyeHeight, leftUpperEyelid, leftLowerEyelid, p5.leftEyePos, pupilYOffset, currentPupilSize, blinkAmount);
    
    p5.pop(); // 描画設定を元に戻す
    
    // 右目の描画
    p5.push();
    p5.translate(p5.width / 2 + params.eyeSpacing, p5.height / 2 - params.eyeYOffset + eyeYOffset);
    p5.rotate(-eyeAngle); // 左右対称になるよう符号を反転
    
    // まぶたの効果を適用して目を描画
    drawEyeWithLids(p5, currentEyeWidth, currentEyeHeight, rightUpperEyelid, rightLowerEyelid, p5.rightEyePos, pupilYOffset, currentPupilSize, blinkAmount);
    
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
      // p5.stroke(255, 0, 0, 100);
      // p5.strokeWeight(outlineWeight);
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
      // p5.stroke(255, 0, 0, 100);
      p5.strokeWeight(outlineWeight * 1.5);
      p5.ellipse(0, eyeCenterShift, eyeWidth * 0.87 + outlineWeight, (visibleEyeHeight * 0.87 + outlineWeight));
    }
    
    // 3. 上まぶたを描画
    let upperLidPosition = 0;
    if (upperLidOpenness < 1.0) {
      upperLidPosition = eyeCenterShift + upperLidY * 0.7;
      
      // 黒い上まぶたを描画
      p5.fill(0);
      // p5.fill(255,0,0,100);
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
      // p5.fill(255,0,0,100);
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
      
      p5.endShape(p5.CLOSE);
    }
    
    // 完全に閉じている場合は目全体を黒で覆う
    if (upperLidOpenness <= 0.0 && lowerLidOpenness <= 0.0) {
      p5.fill(0);
      p5.noStroke();
      p5.ellipse(0, eyeCenterShift, eyeWidth * 2.0, eyeHeight * 2.2);
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

  // 鼻を描画する関数 (新規追加)
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
        noseY += params.eyeSize * 0.0; // happyより少し控えめ
        break;
    }
    
    // 鼻の描画
    p5.fill(255); // 白色で塗りつぶす
    p5.noStroke();
    
    // 楕円形の鼻を描画
    p5.ellipse(
      p5.width / 2, // 中心のX座標
      noseY,        // 中心のY座標
      noseWidth,    // 横幅
      noseHeight    // 縦幅
    );
    
    // 人中（鼻から口までの溝）を描画
    const philtrumLength = params.eyeYOffset * 1.3; // 人中の長さ
    const philtrumWidth = params.eyeSize * 0.05; // 人中の幅
    const mouthY = p5.height / 2 + params.eyeYOffset * 1.1; // 口のY位置
    
    // 表情に応じて人中の長さや位置を調整
    let adjustedPhiltrumLength = philtrumLength;
    switch (expression) {
      case 'happy':
        adjustedPhiltrumLength *= 1.2;
        break;
      case 'angry':
        adjustedPhiltrumLength *= 0.8;
        break;
      case 'sad':
        adjustedPhiltrumLength *= 0.8;
        break;
      case 'surprised':
        adjustedPhiltrumLength *= 1.5;
        break;
      case 'crying':
        adjustedPhiltrumLength *= 0.8;
        break;
      case 'wink':
        adjustedPhiltrumLength *= 1.1; // 軽い笑みなので少し長め
        break;
    }
    
    // // 人中を白い線で描画
    // p5.stroke(255);
    // p5.strokeWeight(philtrumWidth * scaleFactorRef.current);
    // p5.noFill();
    // p5.line(
    //   p5.width / 2,                  // 鼻の下のX座標
    //   noseY + noseHeight/2,          // 鼻の下のY座標
    //   p5.width / 2,                  // 口の上のX座標
    //   noseY + adjustedPhiltrumLength // 口の上のY座標
    // );
    
    // 描画設定をリセット
    p5.noStroke();
  };

  // 口を描画する関数
  const drawMouth = (p5: any, params: any) => {
    const mouthWidth = params.eyeSize * 1.5;
    const mouthHeight = params.eyeSize * 0.4;
    
    // 口の基本位置 - 目の大きさに比例するように調整
    let mouthY = p5.height / 2 + params.eyeYOffset * 1.1 + params.eyeSize * 0.1;
    
    // 線の太さもスケールに合わせる
    const strokeWeight = 40 * scaleFactorRef.current;
    
    // 白色に設定
    p5.stroke(255);
    p5.noFill();
    p5.strokeWeight(strokeWeight);

    // 表情によって口の位置を調整
    switch (expression) {
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
        mouthY -= params.eyeSize * 0.3; // 口をもう少し下に配置
        break;
      case 'talking':
        mouthY -= params.eyeSize * 0.06; // 中性的な位置
        break;
    }
    
    switch (expression) {
      case 'neutral': // なんでもない口
        // 通常の口
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
        
      case 'happy': // 笑顔
        // 笑顔の場合は口の横幅を約20%小さくする
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
        
      case 'angry': // 怒り
        // 口の横幅を約25%小さくする
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
        
      case 'sad': // 悲しみ
        p5.beginShape();
        // 口の横幅を約25%小さくする
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
        break;
        
      case 'surprised': // 驚き
        // 縦長の丸い口（驚きを表現）
        p5.beginShape();
        const surprisedMouthWidth = mouthWidth * 0.35;
        const surprisedMouthHeight = mouthHeight * 2.5;
        
        // 口の中を白で塗りつぶす
        p5.noStroke();
        p5.fill(255);
        
        // 上半分の曲線
        p5.vertex(p5.width / 2 - surprisedMouthWidth / 2, mouthY);
        p5.bezierVertex(
          p5.width / 2 - surprisedMouthWidth / 2, mouthY - surprisedMouthHeight / 2,
          p5.width / 2 + surprisedMouthWidth / 2, mouthY - surprisedMouthHeight / 2,
          p5.width / 2 + surprisedMouthWidth / 2, mouthY
        );
        
        // 下半分の曲線
        p5.bezierVertex(
          p5.width / 2 + surprisedMouthWidth / 2, mouthY + surprisedMouthHeight / 2,
          p5.width / 2 - surprisedMouthWidth / 2, mouthY + surprisedMouthHeight / 2,
          p5.width / 2 - surprisedMouthWidth / 2, mouthY
        );
        
        p5.endShape(p5.CLOSE);
        
        // 描画設定をリセット
        p5.stroke(255);
        p5.noFill();
        p5.strokeWeight(strokeWeight);
        break;
        
      case 'crying': // 泣き
        // 悲しい口
        p5.beginShape();
        // 口の横幅を約25%小さくする
        const cryingMouthWidth = mouthWidth * 0.75;
        p5.vertex(p5.width / 2 - cryingMouthWidth / 2, mouthY - mouthHeight * 0.3);
        p5.bezierVertex(
          p5.width / 2 - cryingMouthWidth / 4, 
          mouthY - mouthHeight * 0.8, 
          p5.width / 2 + cryingMouthWidth / 4, 
          mouthY - mouthHeight * 0.8, 
          p5.width / 2 + cryingMouthWidth / 2, 
          mouthY - mouthHeight * 0.3
        );
        p5.endShape();
        // 涙を描画
        // 複数の涙を描画（左右それぞれ最大3つ）
        if (!p5.tears) {
          // 涙のパラメータを初期化
          const maxTearSize = params.eyeSize * 0.25; // 最大の涙サイズを設定
          const createTear = () => {
            // 0.5から1.0の範囲でランダムなサイズ係数を生成
            const sizeFactor = 0.5 + Math.random() * 0.5;
            // サイズに比例した速度（大きい涙ほど速く落ちる）
            const size = maxTearSize * sizeFactor;
            const baseSpeed = 0.2;
            const maxSpeedBonus = 0.3;
            // サイズに比例して速度を調整（大きい涙ほど速く）
            const speed = baseSpeed + (maxSpeedBonus * sizeFactor);
            
            return {
              active: Math.random() < 0.7, // ランダムに有効化
              offset: Math.random() * params.eyeSize * 0.8,
              speed: speed,
              acceleration: 0.01 + Math.random() * 0.02, // 加速度を追加
              maxSpeed: 1.5 + Math.random() * 1.0, // 最大速度を制限
              size: size
            };
          };
          
          p5.tears = {
            left: Array(3).fill(0).map(() => createTear()),
            right: Array(3).fill(0).map(() => createTear())
          };
        }
        // 左側の涙を描画
        p5.tears.left.forEach((tear, index) => {
          if (tear.active) {
            // 涙の位置を少しずつずらす - より上側に配置
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
            
            // 涙に加速度を適用
            tear.speed += tear.acceleration;
            // 最大速度を制限
            if (tear.speed > tear.maxSpeed) {
              tear.speed = tear.maxSpeed;
            }
            // 涙を下に移動
            tear.offset += tear.speed;
            
            // 涙が一定距離を超えたらリセット
            if (tear.offset > params.eyeSize * 1.5) {
              tear.offset = 0;
              tear.speed = 0.2 + Math.random() * 0.3;
              tear.acceleration = 0.01 + Math.random() * 0.02;
              tear.maxSpeed = 1.5 + Math.random() * 1.0;
              tear.size = params.eyeSize * (0.15 + Math.random() * 0.1);
              // まれに涙を無効化して変化をつける
              tear.active = Math.random() < 0.9;
            }
          } else if (Math.random() < 0.01) {
            // 無効な涙が再び有効になる確率
            tear.active = true;
            tear.offset = 0;
          }
        });
        
        // 右側の涙を描画
        p5.tears.right.forEach((tear, index) => {
          if (tear.active) {
            // 涙の位置を少しずつずらす
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
            
            // 涙に加速度を適用
            tear.speed += tear.acceleration;
            // 最大速度を制限
            if (tear.speed > tear.maxSpeed) {
              tear.speed = tear.maxSpeed;
            }
            // 涙を下に移動
            tear.offset += tear.speed;
            
            // 涙が一定距離を超えたらリセット
            if (tear.offset > params.eyeSize * 1.5) {
              tear.offset = 0;
              tear.speed = 0.2 + Math.random() * 0.3;
              tear.acceleration = 0.01 + Math.random() * 0.02;
              tear.maxSpeed = 1.5 + Math.random() * 1.0;
              tear.size = params.eyeSize * (0.15 + Math.random() * 0.1);
              // まれに涙を無効化して変化をつける
              tear.active = Math.random() < 0.9;
            }
          } else if (Math.random() < 0.01) {
            // 無効な涙が再び有効になる確率
            tear.active = true;
            tear.offset = 0;
          }
        });

        p5.stroke(255);
        break;
        
      case 'hurt': // 痛がる表情
        // 痛がるような形の口（より多くの波形）
        const hurtMouthWidth = mouthWidth * 0.6; // より小さい口
        
        // より複雑な波形の口を描画
        p5.beginShape();
        p5.noFill();
        
        // 開始点
        p5.vertex(p5.width / 2 - hurtMouthWidth / 2, mouthY);
        
        // より多くの波を作成（5つの波形）
        const waveCount = 5;
        const segmentWidth = hurtMouthWidth / waveCount;
        
        for (let i = 0; i < waveCount; i++) {
          const startX = p5.width / 2 - hurtMouthWidth / 2 + i * segmentWidth;
          const endX = startX + segmentWidth;
          const centerX = startX + segmentWidth / 2;
          
          // 波の高さを交互に変える（高さを小さく調整）
          const waveHeight = (i % 2 === 0) ? mouthHeight * 0.15 : -mouthHeight * 0.1;
          const controlHeight = (i % 2 === 0) ? mouthHeight * 0.25 : -mouthHeight * 0.2;
          
          // ベジェ曲線で滑らかな波を作成
          p5.bezierVertex(
            startX + segmentWidth * 0.35, mouthY + controlHeight,
            startX + segmentWidth * 0.7, mouthY + controlHeight,
            endX, mouthY + (i === waveCount - 1 ? 0 : waveHeight)
          );
        }
        
        p5.endShape();
        break;
        
      case 'wink': // ウィンク
        // 左右非対称の軽やかな笑み（右の口角が上がり、左側が少し下がる）
        p5.beginShape();
        const winkMouthWidth = mouthWidth * 0.55; // 全体的な長さを短くする
        
        // 左端（少し下がった位置から開始）
        const leftY = mouthY + mouthHeight * 0.45; // 左側を少し下げる
        p5.vertex(p5.width / 2 - winkMouthWidth / 2, leftY);
        
        // 中央の制御点（中央やや右寄りを高めに）
        const centerControlX1 = p5.width / 2.1 - winkMouthWidth / 6;
        const centerControlX2 = p5.width / 2.0 + winkMouthWidth / 5;
        const centerControlY = mouthY + mouthHeight * 1.0; // 中央を高めに
        
        // 右端（上がった位置で終了）
        const rightY = mouthY + mouthHeight * 0.1; // 右側を上げる
        
        p5.bezierVertex(
          centerControlX1, centerControlY, // 左寄り制御点
          centerControlX2, centerControlY, // 右寄り制御点  
          p5.width / 2.0 + winkMouthWidth / 2.0, rightY // 右端
        );
        p5.endShape();
        break;
        
      case 'talking': // 口ぱくぱく（予備動作込み）
        // 口ぱくぱくアニメーションを適用
        const talkingAnim = talkingAnimRef.current;
        const talkingMouthWidth = mouthWidth * 0.5;
        
        switch (talkingAnim.phase) {
          case 'talking':
            // 3パターンの口ぱくぱく（閉じる・中・大）
            switch (talkingAnim.mouthState) {
              case 'closed':
                // 閉じた状態 - 線
                p5.beginShape();
                p5.vertex(p5.width / 2 - talkingMouthWidth / 2, mouthY);
                p5.bezierVertex(
                  p5.width / 2 - talkingMouthWidth / 4,
                  mouthY + mouthHeight * 0.2, 
                  p5.width / 2 + talkingMouthWidth / 4, 
                  mouthY + mouthHeight * 0.2, 
                  p5.width / 2 + talkingMouthWidth / 2, 
                  mouthY
                );
                p5.endShape();
                break;
                
              case 'medium':
                // 中サイズの開口 - 小さめの楕円
                p5.noStroke();
                p5.fill(255); // 白で塗りつぶし
                
                const mediumWidth = talkingMouthWidth * 0.8;
                const mediumHeight = mouthHeight * 0.6;
                
                p5.ellipse(p5.width / 2, mouthY, mediumWidth, mediumHeight);
                
                // 描画設定をリセット
                p5.stroke(255);
                p5.noFill();
                break;
                
              case 'large':
                // 大きな開口 - 横幅を短く、縦を長く
                p5.noStroke();
                p5.fill(255); // 白で塗りつぶし
                
                const largeWidth = talkingMouthWidth * 0.6; // 1.0から0.7に縮小
                const largeHeight = mouthHeight * 1.3; // 2.0から2.5に拡大
                
                p5.ellipse(p5.width / 2, mouthY, largeWidth, largeHeight);
                
                // 描画設定をリセット
                p5.stroke(255);
                p5.noFill();
                break;
            }
            break;
            
          case 'ending':
            // 終了動作：口を徐々に閉じながら軽く微笑む
            const endIntensity = talkingAnim.endingIntensity;
            const endMouthWidth = talkingMouthWidth * (1 + endIntensity * 0.3);
            
            p5.beginShape();
            p5.vertex(p5.width / 2 - endMouthWidth / 2, mouthY);
            p5.bezierVertex(
              p5.width / 2 - endMouthWidth / 4,
              mouthY + mouthHeight * (0.3 + endIntensity * 0.4), 
              p5.width / 2 + endMouthWidth / 4, 
              mouthY + mouthHeight * (0.3 + endIntensity * 0.4), 
              p5.width / 2 + endMouthWidth / 2, 
              mouthY
            );
            p5.endShape();
            break;
            
          default:
            // アイドル状態または不明な状態
            p5.beginShape();
            p5.vertex(p5.width / 2 - talkingMouthWidth / 2, mouthY);
            p5.bezierVertex(
              p5.width / 2 - talkingMouthWidth / 4,
              mouthY + mouthHeight * 0.3, 
              p5.width / 2 + talkingMouthWidth / 4, 
              mouthY + mouthHeight * 0.3, 
              p5.width / 2 + talkingMouthWidth / 2, 
              mouthY
            );
            p5.endShape();
        }
        break;
    }
    
    // ストロークの設定をリセット
    p5.strokeWeight(1);
  };

  // 目のタッチ判定領域を描画する関数（デバッグ用）
  const drawEyeTouchAreas = (p5, params) => {
    // 描画モードをリセットしてから設定
    p5.push(); // 描画状態を保存
    
    // 明確な赤色で判定領域を表示
    p5.stroke(255, 0, 0); // 赤色、完全不透明
    p5.fill(255, 0, 0, 80); // 赤色、半透明の塗りつぶし
    p5.strokeWeight(3);
    
    // 左目の判定領域
    const leftEyeTouchArea = {
      x: params.leftEyeX - params.eyeSize * 0.8,
      y: params.leftEyeY - params.eyeSize * 0.6,
      width: params.eyeSize * 1.6,
      height: params.eyeSize * 1.2
    };
    
    // 右目の判定領域
    const rightEyeTouchArea = {
      x: params.rightEyeX - params.eyeSize * 0.8,
      y: params.rightEyeY - params.eyeSize * 0.6,
      width: params.eyeSize * 1.6,
      height: params.eyeSize * 1.2
    };
    
    // 判定領域を矩形で描画
    p5.rect(leftEyeTouchArea.x, leftEyeTouchArea.y, leftEyeTouchArea.width, leftEyeTouchArea.height);
    p5.rect(rightEyeTouchArea.x, rightEyeTouchArea.y, rightEyeTouchArea.width, rightEyeTouchArea.height);
    
    // デバッグ用のラベルも追加
    p5.fill(255); // 白色のテキスト
    p5.noStroke();
    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.textSize(16 * scaleFactorRef.current);
    p5.text('L', params.leftEyeX, params.leftEyeY + params.eyeSize * 0.8);
    p5.text('R', params.rightEyeX, params.rightEyeY + params.eyeSize * 0.8);
    
    p5.pop(); // 描画状態を復元
  };

  // 流れる涙を描画する関数
  const drawAnimatedTears = (p5, params) => {
    // 涙のサイズを設定
    const tearSize = params.eyeSize * 0.2;
    const tearHeight = tearSize * 1.5;
    
    // 涙のアニメーション用のパラメータを初期化
    p5.tearOffsets = p5.tearOffsets || [0, 0]; // 左右の涙のオフセット
    p5.tearSpeeds = p5.tearSpeeds || [0.5, 0.7]; // 左右の涙の速度
    p5.tearMaxOffsets = p5.tearMaxOffsets || [params.eyeSize * 1, params.eyeSize * 1]; // 最大の流れる距離
    
    // 涙のオフセットを更新
    p5.tearOffsets[0] += p5.tearSpeeds[0];
    p5.tearOffsets[1] += p5.tearSpeeds[1];
    
    // 涙が最大距離に達したらリセット
    if (p5.tearOffsets[0] > p5.tearMaxOffsets[0]) {
      p5.tearOffsets[0] = 0;
      // 速度をわずかにランダム化
      p5.tearSpeeds[0] = 0.4 + Math.random() * 0.3;
    }
    
    if (p5.tearOffsets[1] > p5.tearMaxOffsets[1]) {
      p5.tearOffsets[1] = 0;
      // 速度をわずかにランダム化
      p5.tearSpeeds[1] = 0.4 + Math.random() * 0.3;
    }
    
    // 左側の涙
    drawTear(
      p5,
      p5.width / 2 - params.eyeSpacing - params.eyeSize * 0.3,
      p5.height / 2 - params.eyeYOffset + params.eyeSize * 0.7,
      tearSize,
      tearHeight,
      p5.tearOffsets[0]
    );
    
    // 右側の涙
    drawTear(
      p5,
      p5.width / 2 + params.eyeSpacing + params.eyeSize * 0.3,
      p5.height / 2 - params.eyeYOffset + params.eyeSize * 0.7,
      tearSize,
      tearHeight,
      p5.tearOffsets[1]
    );
  };

  // 個々の涙を描画する関数
  const drawTear = (p5, x, y, size, height, offset) => {
    p5.fill(255);
    p5.noStroke();
    
    // 涙の本体を描画
    p5.beginShape();
    // 涙の左側の曲線
    p5.vertex(x - size/3, y + offset);
    p5.bezierVertex(
      x - size/2, y + height/2 + offset,
      x + size/2, y + height/2 + offset,
      x + size/3, y + offset
    );
    // 涙の先端（鋭利な上部）
    p5.vertex(x, y - height/1.5 + offset);
    p5.endShape(p5.CLOSE);
    
    // 涙の周りに薄いグロー効果（オプション）
    p5.stroke(255, 255, 255, 0);
    p5.strokeWeight(2);
    p5.noFill();
    p5.ellipse(x, y + offset, size * 1.1, height * 0.7);
    
    // 描画設定をリセット
    p5.noStroke();
  };

  // キャンバスがリサイズされたときにp5のキャンバスサイズも更新
  const windowResized = (p5) => {
    if (fullScreen && p5.canvas) {
      p5.resizeCanvas(dimensions.width, dimensions.height);
    }
  };

  // キーボード入力処理を追加
  const handleKeyPress = (p5) => {
    console.log(`キー ${p5.key} が押されました (現在のモード: ${displayMode})`);
    
    if (p5.key === 'i' || p5.key === 'I') {
      // Iキーで画像モードと顔モードの切り替え（最優先で処理）
      console.log('Iキー: 画像モード切り替え開始');
      if (onDisplayModeToggle) {
        onDisplayModeToggle();
      }
    } else if (p5.key === 'p' || p5.key === 'P') {
      // Pキーでピクチャーインピクチャーモードの切り替え
      togglePictureInPicture();
    } 
    // 画像モードでの数字キー処理を無効化（コメントアウト）
    // else if (displayMode === 'image' && p5.key >= '1' && p5.key <= '9') {
    //   // 画像モードで数字キーが押された場合、対応する画像に切り替え
    //   const imageNumber = p5.key;
    //   const newImagePath = `/screen/${imageNumber}.png`;
    //   console.log(`数字キー ${imageNumber}: 画像を ${newImagePath} に変更`);
    //   
    //   // 画像をクリアしてから新しい画像をセット
    //   setLoadedImage(null);
    //   loadedImageRef.current = null;
    //   setImageLoadError(null);
    //   
    //   // 親コンポーネントに画像パス変更を通知
    //   if (onImagePathChange) {
    //     onImagePathChange(newImagePath);
    //   }
    //    } 
    else if (displayMode === 'face' && p5.key >= '1' && p5.key <= '9') {
      // 顔モードで数字キーが押された場合、表情を変更
      if (p5.key === '9') {
        // 9キーで口ぱくぱくモードのトグル
        const newTalkingState = !isTalking;
        console.log(`9キー押下: 現在のisTalking=${isTalking}, 新しい状態=${newTalkingState}`);
        console.log('現在のtalkingAnimRef状態:', talkingAnimRef.current);
        
        setIsTalking(newTalkingState);
        
        if (newTalkingState) {
          console.log('口ぱくぱくモード開始 - 即座に開始');
          // talking表情に変更
          setManualExpression('talking');
          // 話すフェーズから開始
          talkingAnimRef.current.isActive = true;
          talkingAnimRef.current.phase = 'talking';
          talkingAnimRef.current.timer = 0;
          talkingAnimRef.current.mouthState = 'closed';
          talkingAnimRef.current.stateTimer = 0;
          talkingAnimRef.current.stateDuration = 10 + Math.random() * 20; // 10-30フレーム
          talkingAnimRef.current.endingIntensity = 0;
          console.log('口ぱくぱく初期化完了:', talkingAnimRef.current);
          
          // ランダム表情変更モードを無効化
          if (randomExpressionRef.current.isActive) {
            setIsRandomExpressionMode(false);
            randomExpressionRef.current.isActive = false;
            randomExpressionRef.current.currentTime = 0;
            randomExpressionRef.current.nextChangeTime = 0;
            console.log('口ぱくぱくモード開始によりランダムモードを無効化');
          }
        } else {
          console.log('口ぱくぱくモード終了 - 終了動作開始');
          // 終了動作フェーズに移行
          if (talkingAnimRef.current.phase === 'talking') {
            talkingAnimRef.current.phase = 'ending';
            talkingAnimRef.current.timer = 0;
            console.log('終了フェーズに移行');
          } else {
            // 即座に終了
            console.log('即座に終了');
            setManualExpression('neutral');
            talkingAnimRef.current.isActive = false;
            talkingAnimRef.current.phase = 'idle';
            talkingAnimRef.current.timer = 0;
            talkingAnimRef.current.mouthState = 'closed';
            talkingAnimRef.current.stateTimer = 0;
            talkingAnimRef.current.stateDuration = 0;
            talkingAnimRef.current.endingIntensity = 0;
          }
        }
      } else {
        const expressionMap: Record<string, FacialExpression> = {
          '1': 'neutral',
          '2': 'happy',
          '3': 'angry',
          '4': 'sad',
          '5': 'surprised',
          '6': 'crying',
          '7': 'hurt',
          '8': 'wink'
        };
        const newExpression = expressionMap[p5.key];
        console.log(`キー ${p5.key} が押されました。表情を ${newExpression} に変更します。`);
        // 通常のsetExpressionではなく、手動表情変更関数を使用
        setManualExpression(newExpression);
        
        // 他の表情に変更された場合は口ぱくぱくモードを無効化
        if (isTalking) {
          setIsTalking(false);
          talkingAnimRef.current.isActive = false;
          talkingAnimRef.current.phase = 'idle';
          talkingAnimRef.current.timer = 0;
          talkingAnimRef.current.mouthState = 'closed';
          talkingAnimRef.current.stateTimer = 0;
          talkingAnimRef.current.stateDuration = 0;
          talkingAnimRef.current.endingIntensity = 0;
        }
        
        // ランダム表情変更モードを無効化
        if (randomExpressionRef.current.isActive) {
          setIsRandomExpressionMode(false);
          randomExpressionRef.current.isActive = false;
          randomExpressionRef.current.currentTime = 0;
          randomExpressionRef.current.nextChangeTime = 0;
          console.log('手動表情変更によりランダムモードを無効化');
        }
        
        // 他の表情に変更された場合は口ぱくぱくモードを無効化
        if (isTalking) {
          setIsTalking(false);
          talkingAnimRef.current.isActive = false;
          talkingAnimRef.current.phase = 'idle';
          talkingAnimRef.current.timer = 0;
          talkingAnimRef.current.mouthState = 'closed';
          talkingAnimRef.current.stateTimer = 0;
          talkingAnimRef.current.stateDuration = 0;
          talkingAnimRef.current.endingIntensity = 0;
        }
      }
    } else if (displayMode === 'face' && p5.key === '0') {
      // 0キーでランダム表情変更モードのトグル
      const newRandomMode = !randomExpressionRef.current.isActive;
      console.log(`0キー押下: ランダム表情変更モード ${newRandomMode ? 'ON' : 'OFF'}`);
      console.log(`現在のisRandomExpressionMode: ${isRandomExpressionMode}`);
      console.log(`現在のrandomExpressionRef.current.isActive: ${randomExpressionRef.current.isActive}`);
      
      setIsRandomExpressionMode(newRandomMode);
      
      if (newRandomMode) {
        // ランダムモード開始
        randomExpressionRef.current.isActive = true;
        randomExpressionRef.current.currentTime = 0;
        // カスタマイズされた間隔で最初の変更時間を設定
        const minFrames = randomIntervalMin * 60; // 秒をフレームに変換
        const maxFrames = randomIntervalMax * 60;
        randomExpressionRef.current.nextChangeTime = minFrames + Math.random() * (maxFrames - minFrames);
        console.log(`ランダム表情変更モード開始 - 最初の変更まで: ${Math.round(randomExpressionRef.current.nextChangeTime / 60 * 10) / 10}秒`);
        
        // 親コンポーネントに状態変更を通知
        if (onRandomExpressionChange) {
          onRandomExpressionChange(true);
        }
      } else {
        // ランダムモード終了
        randomExpressionRef.current.isActive = false;
        randomExpressionRef.current.currentTime = 0;
        randomExpressionRef.current.nextChangeTime = 0;
        console.log('ランダム表情変更モード終了');
        // neutralに戻す
        setManualExpression('neutral');
        
        // 親コンポーネントに状態変更を通知
        if (onRandomExpressionChange) {
          onRandomExpressionChange(false);
        }
      }
      
      // 他のモードを無効化
      if (isTalking) {
        setIsTalking(false);
        talkingAnimRef.current.isActive = false;
        talkingAnimRef.current.phase = 'idle';
        talkingAnimRef.current.timer = 0;
        talkingAnimRef.current.mouthState = 'closed';
        talkingAnimRef.current.stateTimer = 0;
        talkingAnimRef.current.stateDuration = 0;
        talkingAnimRef.current.endingIntensity = 0;
      }
    }
    
    // イベントの伝播を防ぐ
    return false;
  };

  // ピクチャーインピクチャーモード切り替え
  const togglePictureInPicture = async () => {
    if (!canvasRef.current) return;
    
    try {
      // ブラウザがPiPをサポートしているか確認
      if (!document.pictureInPictureEnabled) {
        console.error('Picture-in-Picture is not supported in this browser');
        return;
      }
      
      // まだビデオ要素がない場合は作成
      if (!videoRef.current) {
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.width = dimensions.width;
        video.height = dimensions.height;
        video.style.display = 'none';
        document.body.appendChild(video);
        videoRef.current = video;
        
        // キャンバスからストリームを取得
        const stream = canvasRef.current.captureStream(30);
        video.srcObject = stream;
        await video.play();
      }
      
      // PiPのトグル
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPipMode(false);
      } else {
        await videoRef.current.requestPictureInPicture();
        setIsPipMode(true);
        
        // PiPが終了したときの処理
        videoRef.current.addEventListener('leavepictureinpicture', () => {
          setIsPipMode(false);
        }, { once: true });
      }
    } catch (error) {
      console.error('Error toggling Picture-in-Picture mode:', error);
    }
  };

  // コンテナのスタイルを修正 - シンプルに
  const sketchStyle = {
    width: '100%',
    height: '100%',
    position: 'absolute' as const,
    top: 0,
    left: 0,
    cursor: cursorVisible ? 'auto' : 'none',
    backgroundColor: '#000',
  };

  return (
    <div ref={containerRef} style={sketchStyle}>
      <Sketch setup={setup} draw={draw} windowResized={windowResized} />
    </div>
  );
};
