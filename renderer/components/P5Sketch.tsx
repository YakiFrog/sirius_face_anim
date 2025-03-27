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
}

export const P5Sketch: React.FC<P5SketchProps> = ({ fullScreen = false, width = 400, height = 400 }) => {
  const [dimensions, setDimensions] = useState({ width, height });
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 基準サイズを定義（16:9比率の基準解像度）
  const baseWidth = 1920;
  const baseHeight = 1080;
  
  // スケール係数を保持するためのref
  const scaleFactorRef = useRef(1);
  
  // 瞬きの状態を文字列型に変更（normal, blinking, enlarged）順序を変更
  const [blinkState, setBlinkState] = useState<'normal' | 'blinking' | 'enlarged'>('normal');
  // 瞬き用のrefをトップレベルで宣言
  const blinkRef = useRef(1); // 1: 完全に開いた状態、0.25: 最も閉じた状態
  
  // マウスポインタ非表示のための状態を追加
  const [cursorVisible, setCursorVisible] = useState(true);
  const mouseTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // p5のsetup関数 - キャンバスの作成をシンプルに
  const setup = (p5, canvasParentRef) => {
    // シンプルにキャンバスを作成するだけ
    p5.createCanvas(dimensions.width, dimensions.height).parent(canvasParentRef);
  };

  // p5のdraw関数 - 明示的に色指定
  const draw = (p5) => {
    // 背景を黒で塗りつぶす
    p5.background(0, 0, 0);
    
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
  };

  // 目のパラメータを計算する関数
  const calculateEyeParameters = (p5) => {
    // 基準値を設定（基準解像度での値）
    const baseEyeSize = baseWidth / 4.5;  // 基準解像度でのサイズ
    const baseEyeSpacing = baseEyeSize * 0.95;
    const basePupilSize = baseEyeSize / 2.3;
    const baseEyeYOffset = baseHeight / 2 - baseHeight / 2.3;
    
    // 現在のスケールに合わせて調整
    const scale = scaleFactorRef.current;
    const eyeSize = baseEyeSize * scale;
    const eyeSpacing = baseEyeSpacing * scale;
    const pupilSize = basePupilSize * scale;
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
        x: (Math.random() * 2 - 1) * params.eyeRadius,
        y: (Math.random() * 2 - 1) * params.eyeRadius
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
    const currentEyeWidth = params.eyeSize;
    const currentEyeHeight = params.eyeSize * p5.eyeVerticalFactor;
    const currentPupilSize = params.pupilSize;
    const blinkAmount = blinkRef.current;
    
    // 左目
    p5.fill(255);
    p5.ellipse(
      p5.width / 2 - params.eyeSpacing, 
      p5.height / 2 - params.eyeYOffset, 
      currentEyeWidth, 
      currentEyeHeight * blinkAmount
    ); 
    
    p5.fill(0);
    p5.ellipse(
      p5.width / 2 - params.eyeSpacing + p5.leftEyePos.x, 
      p5.height / 2 - params.eyeYOffset + p5.leftEyePos.y, 
      currentPupilSize * 1.5, 
      currentPupilSize * 1.5 * blinkAmount
    );

    // 右目
    p5.fill(255);
    p5.ellipse(
      p5.width / 2 + params.eyeSpacing, 
      p5.height / 2 - params.eyeYOffset, 
      currentEyeWidth, 
      currentEyeHeight * blinkAmount
    );
    
    p5.fill(0);
    p5.ellipse(
      p5.width / 2 + params.eyeSpacing + p5.rightEyePos.x, 
      p5.height / 2 - params.eyeYOffset + p5.rightEyePos.y, 
      currentPupilSize * 1.5, 
      currentPupilSize * 1.5 * blinkAmount
    );
  };

  // 口を描画する関数
  const drawMouth = (p5, params) => {
    const mouthWidth = params.eyeSize * 1.5;
    const mouthHeight = params.eyeSize * 0.4;
    const mouthY = p5.height / 2 + params.eyeYOffset * 2.5;

    // 線の太さもスケールに合わせる
    const strokeWeight = 30 * scaleFactorRef.current;
    
    // 白色に設定
    p5.stroke(255);
    p5.noFill();
    p5.strokeWeight(strokeWeight);

    p5.beginShape();
    p5.vertex(p5.width / 2 - mouthWidth / 2, mouthY);
    p5.bezierVertex(
      p5.width / 2 - mouthWidth / 4, 
      mouthY + mouthHeight, 
      p5.width / 2 + mouthWidth / 4, 
      mouthY + mouthHeight, 
      p5.width / 2 + mouthWidth / 2, 
      mouthY
    );
    p5.endShape();
    
    // ストロークの設定をリセット
    p5.strokeWeight(1);
  }

  // キャンバスがリサイズされたときにp5のキャンバスサイズも更新
  const windowResized = (p5) => {
    if (fullScreen && p5.canvas) {
      p5.resizeCanvas(dimensions.width, dimensions.height);
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
