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
}

export const P5Sketch: React.FC<P5SketchProps> = ({ 
  fullScreen = false, 
  width = 400, 
  height = 400,
  eyeSpacingFactor = 1.0 // デフォルト値として1.0を設定
}) => {
  const [dimensions, setDimensions] = useState({ width, height });
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorVisible, setCursorVisible] = useState(true);
  const mouseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPipMode, setIsPipMode] = useState(false);
  const [currentEyeSpacingFactor, setCurrentEyeSpacingFactor] = useState(eyeSpacingFactor); // 目の間隔係数をステートで管理
  
  // 基準サイズを定義（16:9比率の基準解像度）
  const baseWidth = 1920;
  const baseHeight = 1080;
  
  // スケール係数を保持するためのref
  const scaleFactorRef = useRef(1);
  
  // 瞬きの状態を文字列型に変更（normal, blinking, enlarged）順序を変更
  const [blinkState, setBlinkState] = useState<'normal' | 'blinking' | 'enlarged'>('normal');
  // 瞬き用のrefをトップレベルで宣言
  const blinkRef = useRef(1); // 1: 完全に開いた状態、0.25: 最も閉じた状態
  
  // 表情の種類
  type FacialExpression = 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised' | 'crying';
  // 表情を状態で保持
  const [expression, setExpression] = useState<FacialExpression>('neutral');
  
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

  // p5のsetup関数 - キャンバスの作成をシンプルに
  const setup = (p5, canvasParentRef) => {
    // シンプルにキャンバスを作成するだけ
    const canvas = p5.createCanvas(dimensions.width, dimensions.height).parent(canvasParentRef);
    canvasRef.current = canvas.elt; // canvasの参照を保存
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

    // 鼻を描画 (新規追加)
    drawNose(p5, eyeParams);

    // 口を描画
    drawMouth(p5, eyeParams);
  };

  // 目のパラメータを計算する関数
  const calculateEyeParameters = (p5) => {
    // 基準値を設定（基準解像度での値）
    const baseEyeSize = baseWidth / 4.5;  // 基準解像度でのサイズ
    const baseEyeSpacing = baseEyeSize * 0.95;
    const basePupilSize = baseEyeSize / 2.3;
    const baseEyeYOffset = baseHeight / 8;
    
    // 目の間隔と大きさの調整係数
    const eyeSizeFactor = 1.2;     // 目の大きさ調整係数: 1.0が標準、大きくするなら>1.0、小さくするなら<1.0
    const eyeSpacingFactor = 1.1;  // 目の間隔調整係数
    
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
    }
    
    // 調整されたサイズを適用
    currentEyeWidth *= eyeWidthFactor;
    currentEyeHeight *= eyeHeightFactor * blinkAmount;
    currentPupilSize *= pupilSizeFactor;
    
    // 左目の描画
    p5.push(); // 現在の描画設定を保存
    p5.translate(p5.width / 2 - params.eyeSpacing, p5.height / 2 - params.eyeYOffset + eyeYOffset);
    p5.rotate(eyeAngle);
    
    // まぶたの効果を適用して目を描画
    drawEyeWithLids(p5, currentEyeWidth, currentEyeHeight, upperEyelid, lowerEyelid, p5.leftEyePos, pupilYOffset, currentPupilSize, blinkAmount);
    
    p5.pop(); // 描画設定を元に戻す
    
    // 右目の描画
    p5.push();
    p5.translate(p5.width / 2 + params.eyeSpacing, p5.height / 2 - params.eyeYOffset + eyeYOffset);
    p5.rotate(-eyeAngle); // 左右対称になるよう符号を反転
    
    // まぶたの効果を適用して目を描画
    drawEyeWithLids(p5, currentEyeWidth, currentEyeHeight, upperEyelid, lowerEyelid, p5.rightEyePos, pupilYOffset, currentPupilSize, blinkAmount);
    
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
    const visibleEyeHeight = eyeHeight * Math.max(0.1, Math.min(upperLidOpenness, lowerLidOpenness));
    
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
    
    // 5. まぶたの白い縁を描画（単純化して自然に）
    p5.stroke(255);
    p5.strokeWeight(outlineWeight * 1.5); // わずかに太めに
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
    // 目の外側に黒い縁を描画
    p5.noFill();
    p5.stroke(0);
    p5.strokeWeight(outlineWeight * 5.0);
    p5.ellipse(0, eyeCenterShift, eyeWidth + outlineWeight * 3, (visibleEyeHeight + outlineWeight * 3) * 1.0);
    
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
    
    // キーボード入力処理を更新
    p5.keyPressed = () => {
      handleKeyPress(p5);
    };

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

  // キャンバスがリサイズされたときにp5のキャンバスサイズも更新
  const windowResized = (p5) => {
    if (fullScreen && p5.canvas) {
      p5.resizeCanvas(dimensions.width, dimensions.height);
    }
  };

  // キーボード入力処理を追加
  const handleKeyPress = (p5) => {
    if (p5.key >= '1' && p5.key <= '6') {
      const expressionMap: Record<string, FacialExpression> = {
        '1': 'neutral',
        '2': 'happy',
        '3': 'angry',
        '4': 'sad',
        '5': 'surprised',
        '6': 'crying'
      };
      setExpression(expressionMap[p5.key]);
    } else if (p5.key === 'p' || p5.key === 'P') {
      // Pキーでピクチャーインピクチャーモードの切り替え
      togglePictureInPicture();
    }
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
      
      {/* PiP切り替えボタン */}
      <button 
        onClick={togglePictureInPicture}
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          padding: '8px 12px',
          background: 'rgba(0, 0, 0, 0.5)',
          color: 'white',
          border: '1px solid white',
          borderRadius: '4px',
          cursor: 'pointer',
          zIndex: 10,
          opacity: cursorVisible ? 0.7 : 0,
          transition: 'opacity 0.3s ease'
        }}
      >
        {isPipMode ? 'PiP終了' : 'PiP開始'}
      </button>

      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          padding: '8px 12px',
          background: 'rgba(0, 0, 0, 0.5)',
          color: 'white',
          borderRadius: '4px',
          zIndex: 10,
          opacity: cursorVisible ? 0.7 : 0,
          transition: 'opacity 0.3s ease'
        }}
      >
        <div>目の間隔: {Math.round(currentEyeSpacingFactor * 100)}%</div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '8px' }}>
          <button
            onClick={() => setCurrentEyeSpacingFactor(prev => Math.max(0.5, prev - 0.1))}
            style={{ padding: '4px 8px', marginRight: '8px', cursor: 'pointer' }}
          >
            -
          </button>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={currentEyeSpacingFactor}
            onChange={(e) => setCurrentEyeSpacingFactor(parseFloat(e.target.value))}
            style={{ width: '100px' }}
          />
          <button
            onClick={() => setCurrentEyeSpacingFactor(prev => Math.min(2.0, prev + 0.1))}
            style={{ padding: '4px 8px', marginLeft: '8px', cursor: 'pointer' }}
          >
            +
          </button>
          <button
            onClick={() => setCurrentEyeSpacingFactor(1.0)}
            style={{ padding: '4px 8px', marginLeft: '8px', cursor: 'pointer' }}
          >
            リセット
          </button>
        </div>
      </div>
    </div>
  );
};
