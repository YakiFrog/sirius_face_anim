import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

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
  onImagePathChange // 画像パス変更のコールバック
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
  
  // 表情の種類
type FacialExpression = 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised' | 'crying' | 'hurt' | 'wink' | 'mouth3' | 'pien';
  // 表情を状態で保持
  const [expression, setExpression] = useState<FacialExpression>('neutral');
  const prevExpressionRef = useRef<FacialExpression>('neutral');
  
  // タップ/クリック反応のための状態
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const noseTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 鼻タップ専用のタイムアウト
  const cornerTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 四隅タップ専用のタイムアウト
  const tapPositionRef = useRef({ x: 0, y: 0 });
  // タップ前の表情を記録するためのref
  const preHurtExpressionRef = useRef<FacialExpression>('neutral');
  
  // 当たり判定の可視化用状態
  const [showHitBoxes, setShowHitBoxes] = useState(false); // デフォルトは非表示
  const showHitBoxesRef = useRef(true); // refでも管理して即座にアクセス
  
  // 撫で時間表示の可視化用状態
  const [showStrokingTime, setShowStrokingTime] = useState(true); // デフォルトで表示
  const showStrokingTimeRef = useRef(true); // refでも管理して即座にアクセス
  
  // 瞳の手動制御用状態
  const manualPupilTargetRef = useRef<{ x: number, y: number } | null>(null);
  const manualPupilTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // ドラッグ検出用状態
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false); // refでも管理して即座にアクセス
  const dragStartRef = useRef<{ x: number, y: number, time: number } | null>(null);
  const dragCurrentRef = useRef<{ x: number, y: number } | null>(null);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 撫で時間表示用状態
  const [strokingTime, setStrokingTime] = useState<number>(0);
  const strokingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const strokingExpressionTimerSet = useRef(false); // 撫で表情タイマーが設定済みかの追跡

  // 目のタップ回数追跡用状態
  const eyeTapCountRef = useRef(0); // 10秒間のタップ回数
  const eyeTapTimestampsRef = useRef<number[]>([]); // タップの時刻を記録
  const eyeOverTapReactionRef = useRef(false); // 過度なタップ反応済みフラグ
  const eyeOverTapReactionStartTime = useRef<number>(0); // 過度なタップ反応開始時刻

  // マウス位置記録のための状態
  const [savedMousePosition, setSavedMousePosition] = useState<{ x: number, y: number } | null>(null);
  // refを使って即座にアクセスできるようにする
  const savedMousePositionRef = useRef<{ x: number, y: number } | null>(null);
  
  // 通知表示のstate
  const [notification, setNotification] = useState<string | null>(null);
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // デバウンス用のref
  const mouseActionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActionTimeRef = useRef<number>(0);

  // savedMousePositionの変更を監視（デバッグ用）
  useEffect(() => {
    console.log('🔄 savedMousePosition state changed:', savedMousePosition);
  }, [savedMousePosition]);

  // showHitBoxesの変更を監視してrefも同期
  useEffect(() => {
    showHitBoxesRef.current = showHitBoxes;
    console.log('🔄 showHitBoxes state changed:', showHitBoxes);
  }, [showHitBoxes]);

  // showStrokingTimeの変更を監視してrefも同期
  useEffect(() => {
    showStrokingTimeRef.current = showStrokingTime;
    console.log('🔄 showStrokingTime state changed:', showStrokingTime);
  }, [showStrokingTime]);

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
      
      // 手動表情変更中または過度なタップ反応中はポーリングをスキップ
      const now = Date.now();
      const isInOverTapReaction = eyeOverTapReactionRef.current && 
        (now - eyeOverTapReactionStartTime.current) < 12000; // 12秒間保護
      
      if (manualExpressionRef.current.isManual || isInOverTapReaction) {
        if (manualExpressionRef.current.isManual) {
          console.log('手動表情変更中のため、ポーリングをスキップします');
        }
        if (isInOverTapReaction) {
          console.log('過度なタップ反応中のため、ポーリングをスキップします');
        }
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
            
            // 過度なタップ反応中は外部からの表情変更を無視
            const now = Date.now();
            const isInOverTapReaction = eyeOverTapReactionRef.current && 
              (now - eyeOverTapReactionStartTime.current) < 10000;
            
            if (isInOverTapReaction) {
              console.log(`⛔ 過度なタップ反応中のため、ROS2表情変更を無視: ${newExpression}`);
            } else {
              // 表情を更新（常に新しい値をセット）
              setExpression(newExpression);
              console.log(`✅ 表情更新: ${newExpression}`);
            }
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
      return ['neutral', 'happy', 'angry', 'sad', 'surprised', 'crying', 'hurt', 'wink', 'mouth3', 'pien'].includes(exp);
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
    
    // 過度なタップ反応中かチェック
    const now = Date.now();
    const isInOverTapReaction = eyeOverTapReactionRef.current && 
      (now - eyeOverTapReactionStartTime.current) < 10000;
    
    // 手動変更フラグの解除タイミングを調整
    if (isInOverTapReaction) {
      // 過度なタップ反応中は15秒後まで手動フラグを維持（表情を確実に保護）
      console.log('過度なタップ反応中のため、手動フラグを15秒間維持');
      manualExpressionRef.current.timeout = setTimeout(() => {
        console.log('過度なタップ反応中の手動表情変更を解除');
        manualExpressionRef.current.isManual = false;
      }, 15000);
    } else {
      // 通常時は5秒後に手動変更フラグを解除（ポーリング再開）
      manualExpressionRef.current.timeout = setTimeout(() => {
        console.log('手動表情変更の一時停止を解除します');
        manualExpressionRef.current.isManual = false;
      }, 5000); // 5秒間ポーリングを停止
    }
  };

  // 目のタップ回数を管理し、過度なタップに反応する関数
  const handleEyeTap = () => {
    const now = Date.now();
    
    // 現在時刻を記録（過度なタップ反応中でもカウントは継続）
    eyeTapTimestampsRef.current.push(now);
    
    // 10秒より古いタップ記録を削除
    eyeTapTimestampsRef.current = eyeTapTimestampsRef.current.filter(
      timestamp => now - timestamp <= 10000 // 10秒 = 10000ms
    );
    
    const recentTapCount = eyeTapTimestampsRef.current.length;
    console.log(`👁️ 目タップ回数（過去10秒）: ${recentTapCount}/10`);
    
    // 過度なタップ反応中かチェック（表情変更のブロックのみ、カウントは継続）
    const isInOverTapReaction = eyeOverTapReactionRef.current && 
      (now - eyeOverTapReactionStartTime.current) < 10000;
    
    if (isInOverTapReaction) {
      console.log(`⛔ 過度なタップ反応中だが、カウントは継続 (${recentTapCount}回)`);
      return 'in_reaction'; // 反応中だが、カウントは有効
    }
    
    // タップ回数が7回以上になったら警告ログ
    if (recentTapCount >= 7 && recentTapCount < 10) {
      console.log(`⚠️ 警告: 目タップ回数が多くなっています (${recentTapCount}/10)`);
    }
    
    // 10回以上タップされた場合の反応（まだ反応していない場合のみ）
    if (recentTapCount >= 10 && !eyeOverTapReactionRef.current) {
      eyeOverTapReactionRef.current = true; // 反応済みフラグを設定
      eyeOverTapReactionStartTime.current = now; // 反応開始時刻を記録
      
      // 怒りか泣きをランダムに選択
      const overTapExpressions: FacialExpression[] = ['angry', 'crying'];
      const randomExpression = overTapExpressions[Math.floor(Math.random() * overTapExpressions.length)];
      
      console.log(`🔥 過度なタップ検出！${recentTapCount}回 - 表情: ${randomExpression}`);
      setManualExpression(randomExpression);
      
      // 過度なタップ反応の表情を7-10秒間維持（ランダム要素でより自然に）
      const expressionDuration = 7000 + Math.random() * 3000; // 7-10秒
      console.log(`😠 ${randomExpression}表情を${Math.round(expressionDuration/1000)}秒間維持します`);
      
      setTimeout(() => {
        console.log('過度なタップ反応表情から復帰処理開始');
        
        // 復帰時点での最近のタップ状況をチェック
        const currentTime = Date.now();
        const recentTapsAtRecovery = eyeTapTimestampsRef.current.filter(
          timestamp => currentTime - timestamp <= 10000
        );
        
        // 最後のタップからの経過時間もチェック
        const lastTapTime = eyeTapTimestampsRef.current.length > 0 ? 
          Math.max(...eyeTapTimestampsRef.current) : 0;
        const timeSinceLastTap = currentTime - lastTapTime;
        
        // 最近のタップがあり、かつ最後のタップから3秒以内の場合はhurt表情
        if (recentTapsAtRecovery.length > 0 && timeSinceLastTap < 3000) {
          console.log(`復帰時にタップ継続中 (${recentTapsAtRecovery.length}回, 最後のタップから${Math.round(timeSinceLastTap/1000)}秒) - hurt表情に設定`);
          setManualExpression('hurt');
          
          // hurt表情も1.5秒後にneutralに戻す
          setTimeout(() => {
            console.log('hurt表情からneutralに復帰');
            setManualExpression('neutral');
          }, 1500);
        } else {
          console.log(`復帰時にタップ停止済み (最後のタップから${Math.round(timeSinceLastTap/1000)}秒) - neutral表情に設定`);
          setManualExpression('neutral');
        }
      }, expressionDuration);
      
      // 12秒後にフラグをリセット（再度反応できるようにする）
      setTimeout(() => {
        eyeOverTapReactionRef.current = false;
        eyeOverTapReactionStartTime.current = 0;
        
        // 手動表情フラグも確実にリセット（ポーリング再開を保証）
        if (manualExpressionRef.current.timeout) {
          clearTimeout(manualExpressionRef.current.timeout);
        }
        manualExpressionRef.current.isManual = false;
        
        console.log('過度なタップ反応フラグをリセット + 手動表情フラグもリセット');
      }, 12000);
      
      return true; // 過度なタップ反応したことを示す
    }
    
    return false; // 通常のタップ
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

  // 全画面モードでの複数指操作を無効化
  useEffect(() => {
    if (!fullScreen) return;

    const preventMultiTouch = (event: TouchEvent) => {
      // 複数指操作を検出して無効化
      if (event.touches.length > 1) {
        event.preventDefault();
        event.stopPropagation();
        console.log('🚫 Multi-touch gesture blocked in fullscreen mode');
        return false;
      }
    };

    const preventGestures = (event: Event) => {
      // ピンチやその他のジェスチャーを無効化
      event.preventDefault();
      event.stopPropagation();
      return false;
    };

    // タッチイベントリスナーを追加
    document.addEventListener('touchstart', preventMultiTouch, { passive: false });
    document.addEventListener('touchmove', preventMultiTouch, { passive: false });
    document.addEventListener('touchend', preventMultiTouch, { passive: false });
    
    // ジェスチャーイベントを無効化（iOS Safari用）
    document.addEventListener('gesturestart', preventGestures, { passive: false });
    document.addEventListener('gesturechange', preventGestures, { passive: false });
    document.addEventListener('gestureend', preventGestures, { passive: false });

    // クリーンアップ
    return () => {
      document.removeEventListener('touchstart', preventMultiTouch);
      document.removeEventListener('touchmove', preventMultiTouch);
      document.removeEventListener('touchend', preventMultiTouch);
      document.removeEventListener('gesturestart', preventGestures);
      document.removeEventListener('gesturechange', preventGestures);
      document.removeEventListener('gestureend', preventGestures);
    };
  }, [fullScreen]);

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
  
  // クリーンアップ処理
  useEffect(() => {
    return () => {
      // 撫で時間タイマーのクリーンアップ
      if (strokingTimerRef.current) {
        clearInterval(strokingTimerRef.current);
      }
      // ドラッグタイムアウトのクリーンアップ
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
      // 目のタップ記録のクリーンアップ
      eyeTapTimestampsRef.current = [];
      eyeOverTapReactionRef.current = false;
      eyeOverTapReactionStartTime.current = 0;
    };
  }, []);
  
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
    
    // ドラッグイベントの追加
    canvas.elt.addEventListener('mousedown', handleDragStart);
    canvas.elt.addEventListener('mousemove', handleDragMove);
    canvas.elt.addEventListener('mouseup', handleDragEnd);
    canvas.elt.addEventListener('touchstart', handleDragStart);
    canvas.elt.addEventListener('touchmove', handleDragMove);
    canvas.elt.addEventListener('touchend', handleDragEnd);
    
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
      if (event.key === '0') {
        setManualExpression('pien');
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key.toLowerCase() === 'i') {
        console.log('Window経由でIキーが検出されました - 現在のモード:', displayMode);
        if (onDisplayModeToggle) {
          console.log('onDisplayModeToggleを実行します');
          onDisplayModeToggle();
        }
        event.preventDefault();
        event.stopPropagation();
      }
      // QとWキーの処理はp5のhandleKeyPressに集約して重複を避ける
    });
    
    // キーボード入力処理をsetupで設定
    p5.keyPressed = () => {
      console.log('p5.keyPressed:', p5.key, 'displayMode:', displayMode);
      return handleKeyPress(p5);
    };
  };

  // 正確な目の位置を計算する関数
  const calculateEyePositions = (params) => {
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
        eyeYOffset = 0;
        break;
      case 'mouth3':
        eyeYOffset = 0;
        break;
    }
    
    // 頭の動きを考慮した実際の目の位置
    const headMovement = headMovementRef.current;
    
    // 左目の中心位置
    const leftEyeCenterX = dimensions.width / 2 - params.eyeSpacing + headMovement.x;
    const leftEyeCenterY = dimensions.height / 2 - params.eyeYOffset + eyeYOffset + headMovement.y;
    
    // 右目の中心位置
    const rightEyeCenterX = dimensions.width / 2 + params.eyeSpacing + headMovement.x;
    const rightEyeCenterY = dimensions.height / 2 - params.eyeYOffset + eyeYOffset + headMovement.y;
    
    return {
      left: { x: leftEyeCenterX, y: leftEyeCenterY },
      right: { x: rightEyeCenterX, y: rightEyeCenterY },
      eyeYOffset
    };
  };

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
        setManualExpression(randomExpression);
      } else {
        // 同じ表情の場合は反対の表情に変更
        const alternateExpression = randomExpression === 'happy' ? 'wink' : 'happy';
        console.log(`💫 撫で時間 ${strokingTimeSeconds.toFixed(1)}秒 - 表情を${alternateExpression}に変更（重複回避）`);
        setManualExpression(alternateExpression);
      }
      }
    }
  };

  // ドラッグ開始を検出するハンドラ
  const handleDragStart = (event) => {
    let touchEvent;
    if (event.touches && event.touches.length > 0) {
      // touchstart イベントの場合
      touchEvent = event.touches[0];
    } else {
      // マウスイベントの場合
      touchEvent = event;
    }
    
    // 座標変換を実行
    const coordinates = convertEventCoordinates(touchEvent);
    if (!coordinates) return;
    
    const { x, y } = coordinates;
    
    dragStartRef.current = { x, y, time: Date.now() };
    dragCurrentRef.current = { x, y };
    setIsDragging(false);
    isDraggingRef.current = false; // refも同期
    strokingExpressionTimerSet.current = false; // 撫でタイマーフラグをリセット
    
    console.log('ドラッグ開始候補:', { x, y });
  };

  // ドラッグ中を検出するハンドラ
  const handleDragMove = (event) => {
    if (!dragStartRef.current) return;
    
    let touchEvent;
    if (event.touches && event.touches.length > 0) {
      // touchmove イベントの場合
      touchEvent = event.touches[0];
    } else {
      // マウスイベントの場合
      touchEvent = event;
    }
    
    // 座標変換を実行
    const coordinates = convertEventCoordinates(touchEvent);
    if (!coordinates) return;
    
    const { x, y } = coordinates;
    
    dragCurrentRef.current = { x, y };
    
    // ドラッグ距離を計算
    const deltaX = x - dragStartRef.current.x;
    const deltaY = y - dragStartRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // 一定距離以上移動したらドラッグとして認識（一度だけログ出力）
    const dragThreshold = 20; // ピクセル
    if (distance > dragThreshold && !isDraggingRef.current) {
      setIsDragging(true);
      isDraggingRef.current = true; // refも即座に更新
      console.log('ドラッグ開始検出:', { distance, start: dragStartRef.current, current: { x, y } });
      
      // ドラッグ開始時に撫で動作の条件をチェック
      const duration = Date.now() - dragStartRef.current.time;
      const isOutsideEyes = checkIfDragOutsideEyes(dragStartRef.current, { x, y });
      
      console.log('撫で動作チェック:', { distance, duration, isOutsideEyes });
      
      if (isOutsideEyes && distance > 20 && !strokingExpressionTimerSet.current) {
        console.log('✅ 撫で動作条件満たしました！（初回のみ）');
        strokingExpressionTimerSet.current = true; // タイマー設定済みをマーク
        
        // 撫で時間の計測を開始
        setStrokingTime(0);
        if (strokingTimerRef.current) {
          clearInterval(strokingTimerRef.current);
        }
        strokingTimerRef.current = setInterval(() => {
          if (isDraggingRef.current) {
            setStrokingTime(prev => {
              const newTime = prev + 0.1;
              
              // 撫で時間に応じて表情を段階的に変更
              updateExpressionByStrokingTime(newTime);
              
              return newTime;
            });
          }
        }, 100); // 0.1秒ごとに更新
        
        // 従来の単発タイマーは使用しない（連続的な表情変更に変更）
        console.log(`🎨 撫で動作開始 - 連続的な表情変更システム開始`);
        
        // 既存のタイムアウトをクリア（もし設定されていた場合）
        if (dragTimeoutRef.current) {
          clearTimeout(dragTimeoutRef.current);
          dragTimeoutRef.current = null;
          console.log('⚠️ 既存の単発タイマーをクリアしました');
        }
      }
    }
  };

  // ドラッグ終了を検出するハンドラ
  const handleDragEnd = (event) => {
    console.log('=== ドラッグ終了処理開始 ===');
    console.log('isDragging state:', isDragging);
    console.log('isDraggingRef.current:', isDraggingRef.current);
    console.log('dragStartRef.current:', dragStartRef.current);
    console.log('dragCurrentRef.current:', dragCurrentRef.current);
    
    if (!dragStartRef.current || !dragCurrentRef.current) {
      console.log('ドラッグデータ不完全 - リセット');
      dragStartRef.current = null;
      dragCurrentRef.current = null;
      setIsDragging(false);
      isDraggingRef.current = false;
      return;
    }
    
    // ドラッグだった場合の処理（refを使用）
    if (isDraggingRef.current) {
      const deltaX = dragCurrentRef.current.x - dragStartRef.current.x;
      const deltaY = dragCurrentRef.current.y - dragStartRef.current.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const duration = Date.now() - dragStartRef.current.time;
      
      console.log('ドラッグ終了:', { distance, duration, isDragging: isDraggingRef.current });
      
      // 撫で動作だった場合、ドラッグ終了から2秒後に元の表情に戻す
      const isOutsideEyes = checkIfDragOutsideEyes(dragStartRef.current, dragCurrentRef.current);
      
      if (isOutsideEyes && distance > 20) {
        console.log('撫で動作終了 - 2秒後にneutralに戻します');
        
        // 既存のタイムアウトをクリア
        if (dragTimeoutRef.current) {
          clearTimeout(dragTimeoutRef.current);
        }
        
        // 2秒後に元の表情に戻す
        dragTimeoutRef.current = setTimeout(() => {
          console.log('撫で効果終了 - neutralに戻す');
          setManualExpression('neutral');
        }, 2000);
      }
    } else {
      // 短いタップの場合は既存のタップ処理を実行
      console.log('短いタップとして処理');
    }
    
    // ドラッグ状態をリセット
    console.log('ドラッグ状態リセット');
    dragStartRef.current = null;
    dragCurrentRef.current = null;
    setIsDragging(false);
    isDraggingRef.current = false;
    strokingExpressionTimerSet.current = false; // 撫でタイマーフラグもリセット
    
    // 撫で時間タイマーを停止
    if (strokingTimerRef.current) {
      clearInterval(strokingTimerRef.current);
      strokingTimerRef.current = null;
    }
    // 撫で時間表示をリセット（少し遅延させて結果を見せる）
    setTimeout(() => {
      setStrokingTime(0);
    }, 1000);
    
    console.log('=== ドラッグ終了処理完了 ===');
  };

  // ドラッグが目以外の場所で行われたかチェックする関数
  const checkIfDragOutsideEyes = (start: { x: number, y: number }, end: { x: number, y: number }) => {
    // 基本的な計算で位置を推定
    const scale = scaleFactorRef.current;
    const baseEyeSize = baseWidth / 4.5;
    const baseEyeSpacing = baseEyeSize * 1;
    const baseEyeYOffset = baseHeight / 8;
    
    const eyeSize = baseEyeSize * scale * 1.2;
    const eyeSpacing = baseEyeSpacing * scale * currentEyeSpacingFactor;
    const eyeYOffset = baseEyeYOffset * scale;
    
    const headMovement = headMovementRef.current;
    
    const eyePositions = {
      left: { 
        x: dimensions.width / 2 - eyeSpacing + headMovement.x, 
        y: dimensions.height / 2 - eyeYOffset + headMovement.y 
      },
      right: { 
        x: dimensions.width / 2 + eyeSpacing + headMovement.x, 
        y: dimensions.height / 2 - eyeYOffset + headMovement.y 
      }
    };
    const eyeHitRadius = eyeSize * 0.5; // 0.3から0.5に拡大してタップしやすくする
    
    console.log('目の位置チェック:');
    console.log('  左目:', eyePositions.left);
    console.log('  右目:', eyePositions.right);
    console.log('  判定半径:', eyeHitRadius);
    console.log('  ドラッグ開始:', start);
    console.log('  ドラッグ終了:', end);
    
    // ドラッグの開始点と終了点の両方が目の外かチェック
    const startOutside = !isPointInEye(start, eyePositions, eyeHitRadius);
    const endOutside = !isPointInEye(end, eyePositions, eyeHitRadius);
    
    console.log('  開始点が目の外:', startOutside);
    console.log('  終了点が目の外:', endOutside);
    
    return startOutside && endOutside;
  };

  // 点が目の範囲内かチェックする関数
  const isPointInEye = (point: { x: number, y: number }, eyePositions: any, radius: number) => {
    const distanceToLeftEye = Math.sqrt(
      Math.pow(point.x - eyePositions.left.x, 2) + Math.pow(point.y - eyePositions.left.y, 2)
    );
    const distanceToRightEye = Math.sqrt(
      Math.pow(point.x - eyePositions.right.x, 2) + Math.pow(point.y - eyePositions.right.y, 2)
    );
    
    return distanceToLeftEye <= radius || distanceToRightEye <= radius;
  };

  // 座標変換ヘルパー関数
  const convertEventCoordinates = (touchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    
    if (fullScreen) {
      // フルスクリーンモードでは、キャンバスが画面中央に配置されている
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const canvasWidth = dimensions.width;
      const canvasHeight = dimensions.height;
      
      // キャンバスが画面の中央に配置されている場合のオフセット
      const offsetX = (screenWidth - canvasWidth) / 2;
      const offsetY = (screenHeight - canvasHeight) / 2;
      
      // 実際のタップ座標からキャンバスの原点を基準とした座標に変換
      return {
        x: touchEvent.clientX - offsetX,
        y: touchEvent.clientY - offsetY
      };
    } else {
      // 通常モードでは従来通りの計算
      return {
        x: touchEvent.clientX - rect.left,
        y: touchEvent.clientY - rect.top
      };
    }
  };

  // タップ（クリック）イベントのハンドラ
  const handleTap = (event) => {
    // ドラッグ中の場合はタップ処理をスキップ
    if (isDraggingRef.current) {
      console.log('ドラッグ中のためタップ処理をスキップ');
      return;
    }
    
    // タップ位置を記録（タッチイベントとクリックイベントの両方に対応）
    let touchEvent;
    let eventType = '';
    
    if (event.touches && event.touches.length > 0) {
      // touchstart, touchmove イベントの場合
      touchEvent = event.touches[0];
      eventType = 'touches';
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      // touchend イベントの場合
      touchEvent = event.changedTouches[0];
      eventType = 'changedTouches';
    } else {
      // マウスイベントの場合
      touchEvent = event;
      eventType = 'mouse';
    }
    
    console.log('イベントタイプ:', eventType, 'event.type:', event.type);
    
    // 座標変換を実行
    const coordinates = convertEventCoordinates(touchEvent);
    if (!coordinates) return;
    
    const { x, y } = coordinates;
    
    console.log('変換後座標:', { x, y });
    
    tapPositionRef.current = { x, y };
    
    // p5のdraw関数で設定された実際の目の位置を取得
    // refを使って現在のp5インスタンスから位置情報を取得
    let eyePositions = null;
    let eyeHitRadius = 50; // デフォルト値
    
    // 基本的な計算で位置を推定（フォールバック）
    const scale = scaleFactorRef.current;
    const baseEyeSize = baseWidth / 4.5;
    const baseEyeSpacing = baseEyeSize * 1;
    const baseEyeYOffset = baseHeight / 8;
    
    const eyeSize = baseEyeSize * scale * 1.2;
    const eyeSpacing = baseEyeSpacing * scale * currentEyeSpacingFactor;
    const eyeYOffset = baseEyeYOffset * scale;
    
    const headMovement = headMovementRef.current;
    
    eyePositions = {
      left: { 
        x: dimensions.width / 2 - eyeSpacing + headMovement.x, 
        y: dimensions.height / 2 - eyeYOffset + headMovement.y 
      },
      right: { 
        x: dimensions.width / 2 + eyeSpacing + headMovement.x, 
        y: dimensions.height / 2 - eyeYOffset + headMovement.y 
      }
    };
    eyeHitRadius = eyeSize * 0.5; // 0.3から0.5に拡大してタップしやすくする
    
    // タップが目の範囲内かどうかをチェック
    const distanceToLeftEye = Math.sqrt(
      Math.pow(x - eyePositions.left.x, 2) + Math.pow(y - eyePositions.left.y, 2)
    );
    const distanceToRightEye = Math.sqrt(
      Math.pow(x - eyePositions.right.x, 2) + Math.pow(y - eyePositions.right.y, 2)
    );
    
    const isEyeTouch = distanceToLeftEye <= eyeHitRadius || distanceToRightEye <= eyeHitRadius;
    
    // 目頭の間（鼻の位置）の当たり判定を追加
    const noseCenterX = (eyePositions.left.x + eyePositions.right.x) / 2; // 左右の目の中間点
    const noseCenterY = eyePositions.left.y + eyeSize * 0.3; // 目の少し下
    const noseHitRadius = eyeSize * 0.15; // 目の当たり判定の半分程度
    
    const distanceToNose = Math.sqrt(
      Math.pow(x - noseCenterX, 2) + Math.pow(y - noseCenterY, 2)
    );
    
    const isNoseTouch = distanceToNose <= noseHitRadius;
    
    console.log('=== タップイベント詳細 ===');
    console.log('タップ位置:', { x, y });
    console.log('左目中心:', eyePositions.left);
    console.log('右目中心:', eyePositions.right);
    console.log('鼻中心:', { x: noseCenterX, y: noseCenterY });
    console.log('左目距離:', distanceToLeftEye);
    console.log('右目距離:', distanceToRightEye);
    console.log('鼻距離:', distanceToNose);
    console.log('当たり判定半径:', eyeHitRadius);
    console.log('鼻当たり判定半径:', noseHitRadius);
    console.log('目への接触:', isEyeTouch);
    console.log('鼻への接触:', isNoseTouch);
    console.log('========================');
    
    if (isNoseTouch) {
      // 鼻（目頭の間）をタップした場合：驚き表情
      console.log('鼻をタップ - 驚き表情に変更');
      setManualExpression('surprised');
      
      // 2秒後に元の表情に戻す（鼻専用のタイムアウトを使用）
      if (noseTimeoutRef.current) {
        clearTimeout(noseTimeoutRef.current);
      }
      noseTimeoutRef.current = setTimeout(() => {
        console.log('驚き表情から元に戻す');
        setManualExpression('neutral');
      }, 2000);
      
    } else if (isEyeTouch) {
      // 目の範囲内をタップした場合：表情を変える
      console.log('目をタップ - 表情変更');
      
      // 目のタップ回数を記録・チェック
      const tapResult = handleEyeTap();
      
      // 過度なタップ反応が発生した場合、または反応中の場合はhurt表情をスキップ
      if (tapResult === true || tapResult === 'in_reaction') {
        if (tapResult === true) {
          console.log('過度なタップ反応のためhurt表情をスキップ');
        } else {
          console.log('過度なタップ反応中だが、タップカウントは継続');
        }
        return;
      }
      
      // より詳細なデバッグ情報を出力
      console.log('React state expression:', expression);
      console.log('prevExpressionRef.current:', prevExpressionRef.current);
      console.log('preHurtExpressionRef.current (タップ前):', preHurtExpressionRef.current);
      
      // hurt表情でない場合のみ、現在の表情を記録
      if (prevExpressionRef.current !== 'hurt') {
        preHurtExpressionRef.current = prevExpressionRef.current;
      }
      // hurt表情の場合は既存の記録をそのまま保持
      
      console.log('記録した表情:', preHurtExpressionRef.current);
      
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
      // 目以外の場所をタップした場合：画面の四隅判定または瞳孔移動
      console.log('目以外をタップ - 画面位置判定');
      
      // 画面の四隅の当たり判定（角から一定範囲内）
      // 注意: 呼吸による頭の動きに影響されない画面固定座標を使用
      const cornerRadius = 200; // 四隅の当たり判定範囲（150から200に拡大）
      
      // 右下角の判定（画面固定座標）
      const isBottomRight = (x > dimensions.width - cornerRadius) && (y > dimensions.height - cornerRadius);
      
      // 左下角の判定（画面固定座標）
      const isBottomLeft = (x < cornerRadius) && (y > dimensions.height - cornerRadius);
      
      // 右上角の判定（画面固定座標）
      const isTopRight = (x > dimensions.width - cornerRadius) && (y < cornerRadius);
      
      console.log('四隅判定:', {
        position: { x, y },
        dimensions: dimensions,
        isBottomRight,
        isBottomLeft,
        isTopRight,
        cornerRadius
      });
      
      if (isBottomRight) {
        // 右下を押した場合：口の顔（mouth3）に変更
        console.log('右下をタップ - 口の顔（mouth3）に変更');
        setManualExpression('mouth3');
        
        // 3秒後に元の表情に戻す（四隅専用のタイムアウトを使用）
        if (cornerTimeoutRef.current) {
          clearTimeout(cornerTimeoutRef.current);
        }
        cornerTimeoutRef.current = setTimeout(() => {
          console.log('口の顔から元に戻す');
          setManualExpression('neutral');
        }, 3000);
        
      } else if (isBottomLeft) {
        // 左下を押した場合：ウインクに変更
        console.log('左下をタップ - ウインクに変更');
        setManualExpression('wink');

        // 3秒後に元の表情に戻す（四隅専用のタイムアウトを使用）
        if (cornerTimeoutRef.current) {
          clearTimeout(cornerTimeoutRef.current);
        }
        cornerTimeoutRef.current = setTimeout(() => {
          console.log('ウインクから元に戻す');
          setManualExpression('neutral');
        }, 3000);
        
      } else if (isTopRight) {
        // 右上を押した場合：泣く表情に変更
        console.log('右上をタップ - 泣く表情に変更');
        setManualExpression('crying');
        
        // 3秒後に元の表情に戻す（四隅専用のタイムアウトを使用）
        if (cornerTimeoutRef.current) {
          clearTimeout(cornerTimeoutRef.current);
        }
        cornerTimeoutRef.current = setTimeout(() => {
          console.log('泣く表情から元に戻す');
          setManualExpression('neutral');
        }, 3000);
        
      } else {
        // 四隅以外の場所をタップした場合：瞳孔をその方向に動かす
        console.log('四隅以外をタップ - 瞳孔移動');
        
        // 画面中央を基準とした相対位置を計算
        const centerX = dimensions.width / 2;
        const centerY = dimensions.height / 2;
        
        // タップ位置への方向ベクトルを計算
        const deltaX = x - centerX;
        const deltaY = y - centerY;
        
        // 正規化して瞳の可動範囲内に収める
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const maxRadius = eyeSize / 10; // 瞳が動ける最大範囲（eyeSizeは上で定義済み）
        
        let targetX, targetY;
        if (distance > 0) {
          const scale = Math.min(distance, maxRadius * 3) / distance;
          targetX = deltaX * scale * 0.15; // スケールを調整
          targetY = deltaY * scale * 0.15;
        } else {
          targetX = 0;
          targetY = 0;
        }
        
        // 手動瞳孔制御の設定
        manualPupilTargetRef.current = { x: targetX, y: targetY };
        
        // 既存のタイムアウトをクリア
        if (manualPupilTimeoutRef.current) {
          clearTimeout(manualPupilTimeoutRef.current);
        }
        
        // 3秒後に手動制御を解除
        manualPupilTimeoutRef.current = setTimeout(() => {
          manualPupilTargetRef.current = null;
          console.log('瞳孔の手動制御を解除');
        }, 3000);
        
        console.log('瞳孔ターゲット設定:', { targetX, targetY });
      }
    }
  };

  // p5のdraw関数 - 表示モードに応じて顔または画像を描画
  const draw = (p5) => {
    // 背景を黒で塗りつぶす
    p5.background(0, 0, 0);
    
    if (displayMode === 'image') {
      // 画像表示モード
      drawImageMode(p5);
    } else {
      // 顔表示モード（既存の処理）
      drawFaceMode(p5);
    }
    
    // 通知を画面中央に表示
    drawNotification(p5);
    
    // 撫で時間を左上に表示
    drawStrokingTime(p5);
    
    // 目のタップ回数を右上に表示
    drawEyeTapCount(p5);
  };

  // 通知を画面中央に表示する関数
  const drawNotification = (p5) => {
    if (!notification) return;
    
    // 背景の設定
    p5.push();
    
    // 通知ボックスのスタイル設定
    const boxWidth = 400;
    const boxHeight = 100;
    const boxX = (p5.width - boxWidth) / 2;
    const boxY = (p5.height - boxHeight) / 2;
    
    // 半透明の背景
    p5.fill(0, 0, 0, 150);
    p5.rect(boxX, boxY, boxWidth, boxHeight, 10);
    
    // 枠線
    p5.stroke(255);
    p5.strokeWeight(2);
    p5.noFill();
    p5.rect(boxX, boxY, boxWidth, boxHeight, 10);
    
    // テキストの設定
    p5.fill(255);
    p5.noStroke();
    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.textSize(18);
    
    // 複数行テキストに対応
    const lines = notification.split('\n');
    const lineHeight = 25;
    const totalTextHeight = lines.length * lineHeight;
    const startY = boxY + (boxHeight - totalTextHeight) / 2 + lineHeight / 2;
    
    lines.forEach((line, index) => {
      p5.text(line, boxX + boxWidth / 2, startY + index * lineHeight);
    });
    
    p5.pop();
  };

  // 撫で時間を左上に表示する関数
  const drawStrokingTime = (p5) => {
    if (!isDragging || strokingTime <= 0 || showStrokingTimeRef.current) return; // showStrokingTimeがtrueの時は表示しない（H表示状態では非表示）
    
    p5.push();
    
    // 背景設定
    const boxWidth = 200;
    const boxHeight = 60;
    const margin = 20;
    
    // 半透明の背景
    p5.fill(0, 0, 0, 120);
    p5.rect(margin, margin, boxWidth, boxHeight, 8);
    
    // 枠線
    p5.stroke(255, 255, 0); // 黄色の枠線
    p5.strokeWeight(2);
    p5.noFill();
    p5.rect(margin, margin, boxWidth, boxHeight, 8);
    
    // テキスト設定
    p5.fill(255, 255, 0); // 黄色のテキスト
    p5.noStroke();
    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.textSize(16);
    
    // 撫で時間を秒単位で表示
    const timeText = `撫で時間: ${strokingTime.toFixed(1)}秒`;
    p5.text(timeText, margin + boxWidth / 2, margin + boxHeight / 2);
    
    p5.pop();
  };

  // 目のタップ回数を右上に表示する関数
  const drawEyeTapCount = (p5) => {
    if (showStrokingTimeRef.current) return; // showStrokingTimeがtrueの時は表示しない（H表示状態では非表示）
    
    // 現在時刻から10秒以内のタップ回数を計算
    const now = Date.now();
    const recentTaps = eyeTapTimestampsRef.current.filter(
      timestamp => now - timestamp <= 10000
    );
    const tapCount = recentTaps.length;
    
    if (tapCount === 0) return; // タップ回数が0の場合は表示しない
    
    p5.push();
    
    // 背景設定
    const boxWidth = 220;
    const boxHeight = 60;
    const margin = 20;
    const rightMargin = p5.width - boxWidth - margin;
    
    // タップ回数に応じて色を変更
    let backgroundColor, borderColor, textColor;
    if (tapCount >= 10) {
      // 10回以上は危険色（赤）
      backgroundColor = [255, 0, 0, 120];
      borderColor = [255, 100, 100];
      textColor = [255, 255, 255];
    } else if (tapCount >= 7) {
      // 7-9回は警告色（オレンジ）
      backgroundColor = [255, 165, 0, 120];
      borderColor = [255, 200, 0];
      textColor = [255, 255, 255];
    } else {
      // 6回以下は通常色（青）
      backgroundColor = [0, 100, 255, 120];
      borderColor = [100, 150, 255];
      textColor = [255, 255, 255];
    }
    
    // 半透明の背景
    p5.fill(...backgroundColor);
    p5.rect(rightMargin, margin, boxWidth, boxHeight, 8);
    
    // 枠線
    p5.stroke(...borderColor);
    p5.strokeWeight(2);
    p5.noFill();
    p5.rect(rightMargin, margin, boxWidth, boxHeight, 8);
    
    // テキスト設定
    p5.fill(...textColor);
    p5.noStroke();
    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.textSize(14);
    
    // タップ回数を表示
    const tapText = `目タップ数: ${tapCount}/10 (10秒)`;
    p5.text(tapText, rightMargin + boxWidth / 2, margin + boxHeight / 2);
    
    p5.pop();
  };

  // 画像表示モードの描画処理
  const drawImageMode = (p5) => {
    // p5.jsで画像を読み込む必要がある場合
    if (!loadedImageRef.current && imagePath) {
      // p5.jsで画像を読み込み中
      p5.fill(255);
      p5.textAlign(p5.CENTER, p5.CENTER);
      p5.textSize(32 * scaleFactorRef.current);
      p5.text('画像を読み込み中...', p5.width / 2, p5.height / 2);
      
      // p5.loadImage()を使用して画像を非同期で読み込み
      p5.loadImage(imagePath, 
        (img) => {
          // 読み込み成功
          console.log('p5.jsで画像の読み込みが完了しました');
          loadedImageRef.current = img;
          setLoadedImage(img);
          setImageLoadError(null);
        },
        (err) => {
          // 読み込み失敗
          console.error('p5.jsで画像の読み込みに失敗しました:', err);
          setImageLoadError(`画像の読み込みに失敗しました: ${imagePath}`);
          loadedImageRef.current = null;
          setLoadedImage(null);
        }
      );
      return;
    }

    if (!loadedImageRef.current) {
      // 画像が読み込まれていない場合はエラーメッセージまたは読み込み中表示
      if (imageLoadError) {
        // エラーメッセージを表示
        p5.fill(255, 100, 100); // 赤っぽい色
        p5.textAlign(p5.CENTER, p5.CENTER);
        p5.textSize(32 * scaleFactorRef.current);
        p5.text('画像の読み込みに失敗しました', p5.width / 2, p5.height / 2 - 50);
        p5.textSize(24 * scaleFactorRef.current);
        p5.text(imagePath, p5.width / 2, p5.height / 2 + 50);
      } else if (imagePath) {
        // 読み込み中表示
        p5.fill(255);
        p5.textAlign(p5.CENTER, p5.CENTER);
        p5.textSize(32 * scaleFactorRef.current);
        p5.text('画像を読み込み中...', p5.width / 2, p5.height / 2);
      } else {
        // 画像パスが指定されていない場合
        p5.fill(128);
        p5.textAlign(p5.CENTER, p5.CENTER);
        p5.textSize(32 * scaleFactorRef.current);
        p5.text('画像パスが指定されていません', p5.width / 2, p5.height / 2);
      }
      return;
    }

    const img = loadedImageRef.current;
    
    // 画像のスケーリング計算
    let drawWidth, drawHeight, drawX, drawY;
    
    switch (imageScaleMode) {
      case 'fit':
        // アスペクト比を保持して画面に収まるようにスケーリング
        const scaleX = dimensions.width / img.width;
        const scaleY = dimensions.height / img.height;
        const scale = Math.min(scaleX, scaleY);
        drawWidth = img.width * scale;
        drawHeight = img.height * scale;
        drawX = (dimensions.width - drawWidth) / 2;
        drawY = (dimensions.height - drawHeight) / 2;
        break;
        
      case 'fill':
        // アスペクト比を保持して画面全体を埋めるようにスケーリング（一部切り取り）
        const scaleXFill = dimensions.width / img.width;
        const scaleYFill = dimensions.height / img.height;
        const scaleFill = Math.max(scaleXFill, scaleYFill);
        drawWidth = img.width * scaleFill;
        drawHeight = img.height * scaleFill;
        drawX = (dimensions.width - drawWidth) / 2;
        drawY = (dimensions.height - drawHeight) / 2;
        break;
        
      case 'stretch':
        // アスペクト比を無視して画面全体に引き伸ばし
        drawWidth = dimensions.width;
        drawHeight = dimensions.height;
        drawX = 0;
        drawY = 0;
        break;
        
      default:
        drawWidth = img.width;
        drawHeight = img.height;
        drawX = (dimensions.width - drawWidth) / 2;
        drawY = (dimensions.height - drawHeight) / 2;
    }
    
    // 透明度を設定
    p5.tint(255, imageOpacity * 255);
    
    // 画像を描画
    p5.image(img, drawX, drawY, drawWidth, drawHeight);
    
    // tintをリセット
    p5.noTint();
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
    
    // 両目を描画
    drawEyes(p5, eyeParams);

    // 口を描画
    drawMouth(p5, eyeParams);
    
    // 頭の動きをリセット（重要：pushを使用したら、必ずpopでリセットする）
    p5.pop();
    
    // 当たり判定を可視化（デバッグ用） - 頭の動きの影響を受けないように独立して描画
    if (showHitBoxesRef.current) {
      drawHitBoxes(p5, eyeParams);
    }
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
    
    // 手動制御が有効な場合は手動ターゲットを使用
    if (manualPupilTargetRef.current) {
      p5.leftEyeTarget = { ...manualPupilTargetRef.current };
      p5.rightEyeTarget = { ...manualPupilTargetRef.current };
    } else {
      // 通常の自動瞳移動
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
        eyeYOffset = -params.eyeSize * 0.05; // 少し上にシフト
        // upperEyelid = 0.7; // 上まぶたを少し閉じる（笑顔の効果）
        lowerEyelid = 0.9; 
        break;
        
      case 'angry': // 怒り
        eyeAngle = 0.20; // 目尻が下がった怒った目
        // eyeWidthFactor = 0.90; // 少し幅を狭める
        // eyeHeightFactor = 0.90; // 少し縦に狭める
        // pupilSizeFactor = 0.9; // 瞳を少し小さく
        eyeYOffset = params.eyeSize * 0.1; // 少し下にシフト
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
        
      case 'mouth3': // 口が3の形
        eyeAngle = 0; // 通常の角度
        eyeWidthFactor = 1.0; // 通常サイズ
        eyeHeightFactor = 1.0; // 通常サイズ
        pupilSizeFactor = 0.55; // 瞳のサイズを半分に
        upperEyelid = 1.0; // 完全に開く
        lowerEyelid = 1.0; // 完全に開く
        break;

      case 'pien': // ぴえん目
        eyeAngle = -0.0; // 通常の角度
        eyeWidthFactor = 1.1; // 通常サイズ
        eyeHeightFactor = 1.08; // 通常サイズ
        pupilSizeFactor = 1.2; // 瞳のサイズを半分
        upperEyelid = 1.0; // 完全に開く
        lowerEyelid = 1.0; // 完全に開く
        eyeYOffset = params.eyeSize * 0.05; // 少し上にシ
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
    
    // 実際の目の位置を記録（当たり判定用）
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
    p5.push(); // 現在の描画設定を保存
    p5.translate(leftEyeX, leftEyeY);
    p5.rotate(eyeAngle);
    
    // まぶたの効果を適用して目を描画
    drawEyeWithLids(p5, currentEyeWidth, currentEyeHeight, leftUpperEyelid, leftLowerEyelid, p5.leftEyePos, pupilYOffset, currentPupilSize, blinkAmount);
    
    // ぴえん目のハイライト（左目）
    if (expression === 'pien') {
      p5.noStroke();
      p5.fill(255, 255, 255, 180);
      p5.ellipse(-currentEyeWidth * 0.18, -currentEyeHeight * 0.18, currentEyeWidth * 0.18, currentEyeHeight * 0.13);
      p5.ellipse(currentEyeWidth * 0.12, currentEyeHeight * 0.12, currentEyeWidth * 0.09, currentEyeHeight * 0.07);
    }
    p5.pop(); // 描画設定を元に戻す
    
    // 右目の描画
    p5.push();
    p5.translate(rightEyeX, rightEyeY);
    p5.rotate(-eyeAngle); // 左右対称になるよう符号を反転
    
    // まぶたの効果を適用して目を描画
    drawEyeWithLids(p5, currentEyeWidth, currentEyeHeight, rightUpperEyelid, rightLowerEyelid, p5.rightEyePos, pupilYOffset, currentPupilSize, blinkAmount);
    
    // ぴえん目のハイライト（右目）
    if (expression === 'pien') {
      p5.noStroke();
      p5.fill(255, 255, 255, 180);
      p5.ellipse(-currentEyeWidth * 0.18, -currentEyeHeight * 0.18, currentEyeWidth * 0.18, currentEyeHeight * 0.13);
      p5.ellipse(currentEyeWidth * 0.12, currentEyeHeight * 0.12, currentEyeWidth * 0.09, currentEyeHeight * 0.07);
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
      case 'mouth3':
        mouthY -= params.eyeSize * 0.05; // 口の位置を調整
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
      case 'pien': // ぴえん顔
        // きゅっとしたぴえん口（さらに下に、横幅も短く）
        p5.beginShape();
        const pienMouthWidth = mouthWidth * 0.55; // 横幅を短く
        const pienMouthY = mouthY + mouthHeight * 0.2; // さらに下に
        p5.vertex(p5.width / 1.95 - pienMouthWidth / 2, pienMouthY);
        p5.bezierVertex(
          p5.width / 2 - pienMouthWidth / 4, 
          pienMouthY - mouthHeight * 0.65, // きゅっとしたカーブ
          p5.width / 2 + pienMouthWidth / 4, 
          pienMouthY - mouthHeight * 0.65, 
          p5.width / 2.05 + pienMouthWidth / 2, 
          pienMouthY
        );
        p5.endShape();
        // 涙を描画（cryingと同じロジックを流用）
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
        // 涙の描画処理（cryingと同じ描画ロジックを流用）
        // ...涙描画処理...
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
        
      case 'mouth3': // 口が数字の3の形
        // 数字の3の形を模した口を描画
        const mouth3Width = mouthWidth * 0.6; // 横幅を調整
        const mouth3Height = mouthHeight * 1.15; // 縦幅を調整
        
        p5.beginShape();
        p5.noFill();
        
        // 3の上部分の曲線（右向きの半円）
        const topCenterY = mouthY + mouth3Height * 0.2;
        p5.vertex(p5.width / 1.85 - mouth3Width / 2.9, topCenterY - mouth3Height * 0.40);
        p5.bezierVertex(
          p5.width / 2 + mouth3Width * 0.2, topCenterY - mouth3Height * 0.9,
          p5.width / 2 + mouth3Width * 0.4, topCenterY - mouth3Height * 0.1,
          p5.width / 2, topCenterY
        ); // 引数の説明：(x1, y1, x2, y2, x3, y3),
        p5.endShape();
        
        // 3の下部分の曲線（右向きの半円）
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
    }
    
    // ストロークの設定をリセット
    p5.strokeWeight(1);
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

  // 当たり判定を可視化する関数
  const drawHitBoxes = (p5, params) => {
    // 頭の動きを取得
    const headMovement = headMovementRef.current;
    
    // p5から実際の目の位置を取得（描画関数で設定されたもの）
    let eyePositions = p5.actualEyePositions;
    let eyeHitRadius = params.eyeSize * 0.5; // 0.3から0.5に拡大してタップしやすくする
    
    if (eyePositions) {
      eyeHitRadius = eyePositions.hitRadius;
    } else {
      // フォールバック：基本的な計算で位置を推定
      eyePositions = {
        left: { 
          x: p5.width / 2 - params.eyeSpacing + headMovement.x, 
          y: p5.height / 2 - params.eyeYOffset + headMovement.y 
        },
        right: { 
          x: p5.width / 2 + params.eyeSpacing + headMovement.x, 
          y: p5.height / 2 - params.eyeYOffset + headMovement.y 
        }
      };
    }
    
    // 目と鼻の当たり判定を描画（頭の動きに追従）
    p5.push();
    
    // 頭の動きを適用
    p5.translate(headMovement.x, headMovement.y);
    
    p5.fill(255, 0, 0, 100); // 半透明の赤
    p5.stroke(255, 0, 0, 200); // 赤い枠線
    p5.strokeWeight(3);
    
    // 左目の当たり判定（頭の動きに追従）
    p5.ellipse(p5.width / 2 - params.eyeSpacing, p5.height / 2 - params.eyeYOffset, eyeHitRadius * 2, eyeHitRadius * 2);
    
    // 右目の当たり判定（頭の動きに追従）
    p5.ellipse(p5.width / 2 + params.eyeSpacing, p5.height / 2 - params.eyeYOffset, eyeHitRadius * 2, eyeHitRadius * 2);
    
    // 鼻（目頭の間）の当たり判定（頭の動きに追従）
    const noseCenterX = p5.width / 2; // 左右の目の中間点
    const noseCenterY = p5.height / 2 - params.eyeYOffset + params.eyeSize * 0.3;
    const noseHitRadius = params.eyeSize * 0.15;
    
    p5.fill(0, 255, 0, 100); // 半透明の緑
    p5.stroke(0, 255, 0, 200); // 緑い枠線
    p5.ellipse(noseCenterX, noseCenterY, noseHitRadius * 2, noseHitRadius * 2);
    
    p5.pop();
    
    // 画面四隅の当たり判定（角から一定範囲内）
    // 注意: 呼吸による頭の動きに影響されない画面固定座標を使用
    // 独立したコンテキストで描画して、変形の影響を完全に排除
    p5.push();
    const cornerRadius = 200; // 四隅の当たり判定範囲（150から200に拡大）
    
    // 右下角の当たり判定（口の表情用） - 画面固定
    p5.fill(0, 0, 255, 100); // 半透明の青
    p5.stroke(0, 0, 255, 200); // 青い枠線
    p5.rect(p5.width - cornerRadius, p5.height - cornerRadius, cornerRadius, cornerRadius);
    
    // 左下角の当たり判定（ウインク用） - 画面固定
    p5.fill(255, 0, 255, 100); // 半透明のマゼンタ
    p5.stroke(255, 0, 255, 200); // マゼンタの枠線
    p5.rect(0, p5.height - cornerRadius, cornerRadius, cornerRadius);
    
    // 右上角の当たり判定（泣く表情用） - 画面固定
    p5.fill(255, 255, 0, 100); // 半透明の黄色
    p5.stroke(255, 255, 0, 200); // 黄色の枠線
    p5.rect(p5.width - cornerRadius, 0, cornerRadius, cornerRadius);
    
    p5.pop();
    
    // 説明テキストを表示
    p5.push();
    p5.fill(255, 255, 255); // 白いテキスト（黄色の四角と区別）
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

  // キャンバスがリサイズされたときにp5のキャンバスサイズも更新
  const windowResized = (p5) => {
    if (fullScreen && p5.canvas) {
      p5.resizeCanvas(dimensions.width, dimensions.height);
    }
  };

  // 通知を表示する関数
  const showNotification = (message: string, duration: number = 2000) => {
    // 既存のタイマーをクリア
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    
    // 通知を表示
    setNotification(message);
    
    // 指定時間後に通知を消す
    notificationTimeoutRef.current = setTimeout(() => {
      setNotification(null);
    }, duration);
  };

  // マウス位置を記録する関数（デバウンス付き）
  const saveMousePosition = async () => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < 200) {
      console.log('デバウンス: saveMousePosition呼び出しをスキップ');
      return;
    }
    lastActionTimeRef.current = now;
    
    console.log('saveMousePosition関数が呼び出されました');
    console.log('現在のsavedMousePosition state:', savedMousePosition);
    
    try {
      if (typeof window !== 'undefined' && window.ipc) {
        console.log('IPC通信でマウス位置を取得中...');
        const result = await window.ipc.getCursorPosition();
        console.log('IPC通信の結果:', result);
        
        if (result.success) {
          console.log('setStateを実行します:', result.position);
          setSavedMousePosition(result.position);
          savedMousePositionRef.current = result.position; // refも同時に更新
          console.log('マウス位置を記録しました:', result.position);
          
          // 通知を表示
            showNotification(`マウス位置を記録しました：(${result.position.x}, ${result.position.y})\nWキーで移動＋クリック`, 2000);
        } else {
          console.error('マウス位置の取得に失敗しました:', result.error);
        }
      } else {
        console.error('IPCが利用できません');
      }
    } catch (error) {
      console.error('マウス位置記録中にエラーが発生しました:', error);
    }
  };

  // 記録したマウス位置に移動する関数（デバウンス付き）
  const restoreMousePosition = async () => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < 200) {
      console.log('デバウンス: restoreMousePosition呼び出しをスキップ');
      return;
    }
    lastActionTimeRef.current = now;
    
    console.log('restoreMousePosition関数が呼び出されました');
    console.log('現在のsavedMousePosition state:', savedMousePosition);
    console.log('現在のsavedMousePositionRef:', savedMousePositionRef.current);
    
    // refを優先的に使用
    const positionToUse = savedMousePositionRef.current || savedMousePosition;
    
    if (!positionToUse) {
      console.log('記録されたマウス位置がありません');
      return;
    }
    
    console.log('マウス移動を開始:', positionToUse);
    
    try {
      if (typeof window !== 'undefined' && window.ipc) {
        console.log('IPC通信でマウス移動+クリックを要求中...');
        const result = await window.ipc.moveCursorAndClick(positionToUse.x, positionToUse.y);
        console.log('IPC通信の結果:', result);
        
        if (result.success) {
          console.log('✅ マウスを記録位置に移動してクリックしました:', positionToUse);
          if (result.newPosition) {
            console.log('移動後の位置:', result.newPosition);
          }
        } else {
          console.error('❌ マウス移動+クリックに失敗しました:', result.error);
        }
      } else {
        console.error('❌ IPCが利用できません');
      }
    } catch (error) {
      console.error('❌ マウス移動中にエラーが発生しました:', error);
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
    } else if (p5.key === 'h' || p5.key === 'H') {
      // Hキーで当たり判定と撫で時間表示の切り替え
      const newShowHitBoxes = !showHitBoxesRef.current; // refの現在値を使用
      const newShowStrokingTime = !showStrokingTimeRef.current;
      
      setShowHitBoxes(newShowHitBoxes);
      showHitBoxesRef.current = newShowHitBoxes; // refも即座に更新
      
      setShowStrokingTime(newShowStrokingTime);
      showStrokingTimeRef.current = newShowStrokingTime; // refも即座に更新
      
      console.log('Hキー: 当たり判定表示切り替え ->', newShowHitBoxes);
      console.log('Hキー: 撫で時間表示切り替え ->', newShowStrokingTime);
    } else if (p5.key === 'p' || p5.key === 'P') {
      // Pキーでピクチャーインピクチャーモードの切り替え
      togglePictureInPicture();
    } else if (p5.key === 'q' || p5.key === 'Q') {
      // Qキーでマウス位置を記録（デバウンス処理付き）
      console.log('Qキー: マウス位置を記録');
      saveMousePosition();
    } else if (p5.key === 'w' || p5.key === 'W') {
      // Wキーで記録したマウス位置に移動（デバウンス処理付き）
      console.log('Wキー: 記録位置に移動');
      restoreMousePosition();
    } else if (displayMode === 'face' && p5.key >= '1' && p5.key <= '9') {
      // 顔モードで数字キーが押された場合、表情を変更
      const expressionMap: Record<string, FacialExpression> = {
        '1': 'neutral',
        '2': 'happy',
        '3': 'angry',
        '4': 'sad',
        '5': 'surprised',
        '6': 'crying',
        '7': 'hurt',
        '8': 'wink',
        '9': 'mouth3'
      };
      const newExpression = expressionMap[p5.key];
      console.log(`キー ${p5.key} が押されました。表情を ${newExpression} に変更します。`);
      // 通常のsetExpressionではなく、手動表情変更関数を使用
      setManualExpression(newExpression);
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
    // 全画面モードの時は複数指操作を無効化
    touchAction: fullScreen ? 'none' : 'auto',
    // ユーザー選択を無効化（追加のセキュリティ）
    userSelect: fullScreen ? 'none' : 'auto',
    // テキスト選択を無効化
    WebkitUserSelect: fullScreen ? 'none' : 'auto',
    // ドラッグを無効化
    WebkitTouchCallout: fullScreen ? 'none' : 'auto',
  } as React.CSSProperties;

  return (
    <div ref={containerRef} style={sketchStyle}>
      <Sketch setup={setup} draw={draw} windowResized={windowResized} />
    </div>
  );
};
