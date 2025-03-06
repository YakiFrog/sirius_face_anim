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
  
  // 瞬きの状態管理をコンポーネントのトップレベルに移動
  const [blink, setBlink] = useState(false);
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
    const blinkDuration = 150; // 瞬きの持続時間（ミリ秒）
    let blinkTimeout: NodeJS.Timeout;

    // 一定時間ごとに瞬きを開始
    const timer = setInterval(() => {
      setBlink(true); // 瞬きを開始

      // 一定時間後に瞬きを閉じる
      blinkTimeout = setTimeout(() => {
        setBlink(false); // 瞬きを閉じる
      }, blinkDuration);
    }, 3000 + Math.random() * 2000); // 3-5秒ごとに瞬き

    return () => {
      clearInterval(timer);
      clearTimeout(blinkTimeout);
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
    
    // イージングを適用して瞬きを滑らかに - useRefの代わりにrefオブジェクトを直接参照
    const easeFactor = 0.75;
    const targetEyeOpen = blink ? 0.20 : 1;
    
    // blinkRefを更新
    blinkRef.current += (targetEyeOpen - blinkRef.current) * easeFactor;
    const blinkAmount = blinkRef.current;

    // 左目
    p5.fill(255);
    p5.ellipse(p5.width / 2 - eyeSpacing, p5.height / 2 - eyeYOffset, eyeSize, eyeSize * blinkAmount);
    p5.fill(0);
    p5.ellipse(p5.width / 2 - eyeSpacing, p5.height / 2 - eyeYOffset, pupilSize * 1.5, pupilSize * 1.5 * blinkAmount);

    // 右目
    p5.fill(255);
    p5.ellipse(p5.width / 2 + eyeSpacing, p5.height / 2 - eyeYOffset, eyeSize, eyeSize * blinkAmount);
    p5.fill(0);
    p5.ellipse(p5.width / 2 + eyeSpacing, p5.height / 2 - eyeYOffset, pupilSize * 1.5, pupilSize * 1.5 * blinkAmount);
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
