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
  
  // 瞬きの状態を文字列型に変更（normal, blinking, enlarged）順序を変更
  const [blinkState, setBlinkState] = useState<'normal' | 'blinking' | 'enlarged'>('normal');
  // 瞬き用のrefをトップレベルで宣言
  const blinkRef = useRef(1); // 1: 完全に開いた状態、0.25: 最も閉じた状態

  // リサイズ関連の処理
  useEffect(() => {
    if (fullScreen) {
      const updateDimensions = () => {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight
        });
      };

      updateDimensions();
      window.addEventListener('resize', updateDimensions);

      return () => {
        window.removeEventListener('resize', updateDimensions);
      };
    }
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

  // p5のsetup関数
  const setup = (p5, canvasParentRef) => {
    const canvas = p5.createCanvas(dimensions.width, dimensions.height);
    canvas.parent(canvasParentRef);
    
    const canvasElt = canvas.elt;
    canvasElt.style.width = '100%';
    canvasElt.style.height = '100%';
  };

  // p5のdraw関数
  const draw = (p5) => {
    p5.background(0);
    
    // 目を描画
    const eyeSize = p5.width / 4.5;
    const eyeSpacing = eyeSize * 0.95;
    const pupilSize = eyeSize / 2.3;
    const eyeYOffset = p5.height / 2 - p5.height / 2.3;
    
    // 瞬きの状態に応じた係数を計算
    const easeFactor = 0.75;
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
    blinkRef.current += (targetEyeOpen - blinkRef.current) * easeFactor;
    const blinkAmount = blinkRef.current;
    
    // 縦方向のサイズに対するイージングを適用
    p5.eyeVerticalFactor = p5.eyeVerticalFactor || 1.0;
    p5.eyeVerticalFactor += (verticalSizeFactor - p5.eyeVerticalFactor) * easeFactor;

    // 瞳の動きを管理する
    const eyeMovementEase = 0.1;
    const eyeRadius = eyeSize / 10; // 瞳が動ける範囲の半径
    
    // 左右の瞳のターゲット位置を初期化
    p5.leftEyeTarget = p5.leftEyeTarget || { x: 0, y: 0 };
    p5.rightEyeTarget = p5.rightEyeTarget || { x: 0, y: 0 };
    
    // 次の瞳の動きまでのフレーム数を管理
    p5.nextEyeMovement = p5.nextEyeMovement || 0;
    
    // 初回実行時または設定された次回のタイミングになったら瞳の位置を更新
    if (!p5.frameCount || p5.frameCount >= p5.nextEyeMovement) {
      // 新しい位置へ移動
      p5.leftEyeTarget = {
        x: (Math.random() * 2 - 1) * eyeRadius,
        y: (Math.random() * 2 - 1) * eyeRadius
      };
      p5.rightEyeTarget = {
        x: (Math.random() * 2 - 1) * eyeRadius,
        y: (Math.random() * 2 - 1) * eyeRadius
      };
      
      // 次に瞳を動かすタイミングを2秒から10秒のランダムな値で設定
      // p5.jsのデフォルトフレームレートは60FPSなので、2秒=120フレーム、10秒=600フレーム
      const minFrames = 60 * 3; // 2秒
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

    // サイズ係数を適用して目を描画 - 横幅は通常、縦幅のみ係数を適用
    const currentEyeWidth = eyeSize;
    const currentEyeHeight = eyeSize * p5.eyeVerticalFactor;
    const currentPupilSize = pupilSize;

    // 左目
    p5.fill(255);
    p5.ellipse(p5.width / 2 - eyeSpacing, p5.height / 2 - eyeYOffset, currentEyeWidth, currentEyeHeight * blinkAmount); 
    p5.fill(0);
    p5.ellipse(
      p5.width / 2 - eyeSpacing + p5.leftEyePos.x, 
      p5.height / 2 - eyeYOffset + p5.leftEyePos.y, 
      currentPupilSize * 1.5, 
      currentPupilSize * 1.5 * blinkAmount
    );

    // 右目
    p5.fill(255);
    p5.ellipse(p5.width / 2 + eyeSpacing, p5.height / 2 - eyeYOffset, currentEyeWidth, currentEyeHeight * blinkAmount);
    p5.fill(0);
    p5.ellipse(
      p5.width / 2 + eyeSpacing + p5.rightEyePos.x, 
      p5.height / 2 - eyeYOffset + p5.rightEyePos.y, 
      currentPupilSize * 1.5, 
      currentPupilSize * 1.5 * blinkAmount
    );
  };

  // キャンバスがリサイズされたときにp5のキャンバスサイズも更新
  const windowResized = (p5) => {
    if (fullScreen) {
      p5.resizeCanvas(window.innerWidth, window.innerHeight);
    }
  };

  const sketchStyle = {
    width: '100%',
    height: '100%',
    position: 'absolute' as const,
    top: 0,
    left: 0
  };

  return (
    <div ref={containerRef} style={sketchStyle}>
      <Sketch setup={setup} draw={draw} windowResized={windowResized} />
    </div>
  );
};
