// ランダム表情機能の使用例

/**
 * ランダム表情機能をプログラム上で制御する方法
 * 
 * P5Sketchコンポーネントに以下のプロパティを渡すことで、
 * ランダム表情変更機能をカスタマイズできます。
 */

import React, { useState } from 'react';
import { P5Sketch } from '../components/P5Sketch';
import { FacialExpression } from '../components/FaceDrawing';

export const RandomExpressionExample: React.FC = () => {
  // ランダム表情の状態管理
  const [enableRandomExpression, setEnableRandomExpression] = useState(false);
  const [randomExpressionList, setRandomExpressionList] = useState<FacialExpression[]>([
    'happy', 'surprised', 'wink' // 特定の表情のみを対象にする例
  ]);
  const [randomIntervalMin, setRandomIntervalMin] = useState(2); // 2秒
  const [randomIntervalMax, setRandomIntervalMax] = useState(6); // 6秒

  // プログラム上でランダム表情を開始する関数
  const startRandomExpression = () => {
    console.log('ランダム表情変更を開始します');
    setEnableRandomExpression(true);
  };

  // プログラム上でランダム表情を停止する関数
  const stopRandomExpression = () => {
    console.log('ランダム表情変更を停止します');
    setEnableRandomExpression(false);
  };

  // 特定の表情のみを対象にしたランダム表情を開始
  const startHappyRandomExpression = () => {
    console.log('ハッピーな表情のランダム変更を開始します');
    setRandomExpressionList(['happy', 'wink']);
    setRandomIntervalMin(1);
    setRandomIntervalMax(3);
    setEnableRandomExpression(true);
  };

  // 全表情を対象にしたランダム表情を開始
  const startAllRandomExpression = () => {
    console.log('全表情のランダム変更を開始します');
    setRandomExpressionList(['neutral', 'happy', 'angry', 'sad', 'surprised', 'crying', 'hurt', 'wink']);
    setRandomIntervalMin(2);
    setRandomIntervalMax(8);
    setEnableRandomExpression(true);
  };

  // 間隔を変更する関数
  const setQuickRandomExpression = () => {
    console.log('高速ランダム表情変更に切り替えます');
    setRandomIntervalMin(0.5);
    setRandomIntervalMax(2);
  };

  const setSlowRandomExpression = () => {
    console.log('ゆっくりランダム表情変更に切り替えます');
    setRandomIntervalMin(5);
    setRandomIntervalMax(15);
  };

  // ランダム表情状態変更のコールバック
  const handleRandomExpressionChange = (isActive: boolean) => {
    console.log(`ランダム表情状態が変更されました: ${isActive ? 'ON' : 'OFF'}`);
    // 必要に応じて追加の処理を実行
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <P5Sketch
        fullScreen={true}
        displayMode="face"
        enableRandomExpression={enableRandomExpression}
        randomExpressionList={randomExpressionList}
        randomIntervalMin={randomIntervalMin}
        randomIntervalMax={randomIntervalMax}
        onRandomExpressionChange={handleRandomExpressionChange}
      />
      
      {/* コントロールパネル */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        padding: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '300px'
      }}>
        <h3>ランダム表情制御</h3>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={startRandomExpression} disabled={enableRandomExpression}>
            開始
          </button>
          <button onClick={stopRandomExpression} disabled={!enableRandomExpression}>
            停止
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={startHappyRandomExpression}>
            ハッピー系のみ
          </button>
          <button onClick={startAllRandomExpression}>
            全表情
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={setQuickRandomExpression} disabled={!enableRandomExpression}>
            高速
          </button>
          <button onClick={setSlowRandomExpression} disabled={!enableRandomExpression}>
            ゆっくり
          </button>
        </div>
        
        <div>
          状態: {enableRandomExpression ? 'ON' : 'OFF'}<br/>
          対象表情: {randomExpressionList.join(', ')}<br/>
          間隔: {randomIntervalMin}秒 〜 {randomIntervalMax}秒
        </div>
      </div>
    </div>
  );
};

/**
 * プログラム制御の使用方法の例:
 * 
 * 1. 基本的な開始・停止
 *    setEnableRandomExpression(true);  // 開始
 *    setEnableRandomExpression(false); // 停止
 * 
 * 2. 特定の表情のみを対象にする
 *    setRandomExpressionList(['happy', 'wink', 'surprised']);
 * 
 * 3. 変更間隔の調整
 *    setRandomIntervalMin(1);  // 最小1秒
 *    setRandomIntervalMax(5);  // 最大5秒
 * 
 * 4. キーボードショートカット
 *    0キー: ランダム表情のオン/オフ切り替え
 * 
 * 5. イベントハンドリング
 *    onRandomExpressionChange コールバックで状態変化を監視
 */

export default RandomExpressionExample;
