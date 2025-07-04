# ランダム表情機能の使用方法

## 概要

このプロジェクトには、プログラム上で表情をランダムに変更する機能が追加されました。キーボード操作とプログラム制御の両方でランダム表情機能を使用することができます。

## 基本的な使用方法

### 1. キーボード操作

- **`0`キー**: ランダム表情モードのオン/オフ切り替え
- **`1-8`キー**: 手動で特定の表情に変更（ランダムモードを無効化）
- **`9`キー**: 口ぱくぱくモードのオン/オフ切り替え

### 2. UI設定パネル

左上の「設定表示」ボタンをクリックすると、設定パネルが表示されます。顔モードの場合、以下の設定が可能です：

- **ランダム表情変更を有効化**: チェックボックスでオン/オフ
- **変更間隔（最小秒数）**: ランダム変更の最小間隔
- **変更間隔（最大秒数）**: ランダム変更の最大間隔
- **ランダム対象の表情**: どの表情を対象にするかを個別選択

## プログラム制御

### 基本的なプロパティ使用

```tsx
import { P5Sketch } from './components/P5Sketch';
import { FacialExpression } from './components/FaceDrawing';

function MyComponent() {
  const [enableRandomExpression, setEnableRandomExpression] = useState(false);
  const [randomExpressionList, setRandomExpressionList] = useState<FacialExpression[]>([
    'happy', 'wink', 'surprised'
  ]);
  const [randomIntervalMin, setRandomIntervalMin] = useState(1);
  const [randomIntervalMax, setRandomIntervalMax] = useState(3);

  return (
    <P5Sketch
      displayMode="face"
      enableRandomExpression={enableRandomExpression}
      randomExpressionList={randomExpressionList}
      randomIntervalMin={randomIntervalMin}
      randomIntervalMax={randomIntervalMax}
      onRandomExpressionChange={(isActive) => {
        console.log('ランダム表情状態:', isActive);
      }}
    />
  );
}
```

### ヘルパークラスを使用

```tsx
import { RandomExpressionController, RandomExpressionPresets } from './utils/randomExpressionUtils';

// コントローラーを作成
const controller = new RandomExpressionController((state) => {
  console.log('状態が変更されました:', state);
});

// 基本的な開始・停止
controller.start(); // 全表情でランダム変更開始
controller.stop();  // 停止

// カスタマイズした開始
controller.start(['happy', 'wink'], 1, 3); // ハッピー系のみ、1-3秒間隔

// プリセットを使用
controller.start(RandomExpressionPresets.HAPPY, 0.5, 2);

// 便利メソッド
controller.startHappyMode();     // ハッピーモード（0.5-3秒間隔）
controller.startEmotionalMode(); // 感情豊かモード（2-8秒間隔）
controller.startQuickMode();     // 高速モード（0.5-2秒間隔）
controller.startSlowMode();      // ゆっくりモード（5-15秒間隔）
```

### 簡単なユーティリティ関数

```tsx
import { randomExpressionUtils } from './utils/randomExpressionUtils';

// 初期化
randomExpressionUtils.init((state) => {
  console.log('状態変更:', state);
});

// プリセットでランダム表情開始
randomExpressionUtils.start('HAPPY', 1, 3);
randomExpressionUtils.start('ALL', 2, 6);

// 停止
randomExpressionUtils.stop();

// 状態取得
const state = randomExpressionUtils.getState();
```

## 利用可能な表情

- `neutral`: 普通
- `happy`: 笑顔
- `angry`: 怒り
- `sad`: 悲しみ
- `surprised`: 驚き
- `crying`: 泣き
- `hurt`: 痛がる
- `wink`: ウィンク
- `talking`: 口ぱくぱく（特別用途）

## プリセット

### RandomExpressionPresets

- **`HAPPY`**: `['happy', 'wink', 'surprised']` - ポジティブな表情のみ
- **`NEGATIVE`**: `['angry', 'sad', 'crying', 'hurt']` - ネガティブな表情のみ
- **`BASIC`**: `['neutral', 'happy', 'angry', 'sad']` - 基本的な4表情
- **`ACTIVE`**: `['happy', 'surprised', 'wink']` - アクティブな表情
- **`ALL`**: 全表情（`talking`以外）

## 実装例

### 完全なコンポーネント例

```tsx
import React, { useState } from 'react';
import { P5Sketch } from './components/P5Sketch';
import { RandomExpressionController, RandomExpressionPresets } from './utils/randomExpressionUtils';

export const ExpressionDemo: React.FC = () => {
  const [enableRandomExpression, setEnableRandomExpression] = useState(false);
  const [randomExpressionList, setRandomExpressionList] = useState(RandomExpressionPresets.ALL);
  const [randomIntervalMin, setRandomIntervalMin] = useState(1);
  const [randomIntervalMax, setRandomIntervalMax] = useState(5);

  const controller = new RandomExpressionController((state) => {
    setEnableRandomExpression(state.enableRandomExpression);
    setRandomExpressionList(state.randomExpressionList);
    setRandomIntervalMin(state.randomIntervalMin);
    setRandomIntervalMax(state.randomIntervalMax);
  });

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <P5Sketch
        fullScreen={true}
        displayMode="face"
        enableRandomExpression={enableRandomExpression}
        randomExpressionList={randomExpressionList}
        randomIntervalMin={randomIntervalMin}
        randomIntervalMax={randomIntervalMax}
        onRandomExpressionChange={(isActive) => {
          console.log('ランダム表情状態:', isActive);
        }}
      />
      
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        padding: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        borderRadius: '8px'
      }}>
        <h3>ランダム表情制御</h3>
        
        <button onClick={() => controller.startHappyMode()}>
          ハッピーモード開始
        </button>
        
        <button onClick={() => controller.startEmotionalMode()}>
          感情豊かモード開始
        </button>
        
        <button onClick={() => controller.startQuickMode()}>
          高速モード開始
        </button>
        
        <button onClick={() => controller.stop()}>
          停止
        </button>
        
        <div>
          状態: {enableRandomExpression ? 'ON' : 'OFF'}<br/>
          間隔: {randomIntervalMin}秒 〜 {randomIntervalMax}秒<br/>
          対象: {randomExpressionList.join(', ')}
        </div>
      </div>
    </div>
  );
};
```

## 注意事項

1. **最小・最大間隔**: 最小間隔は最大間隔以下である必要があります
2. **表情リスト**: 最低1つの表情は選択する必要があります
3. **talking表情**: 口ぱくぱく専用のため、通常のランダム対象からは除外されます
4. **他モードとの競合**: 口ぱくぱくモードと同時に有効にはできません
5. **手動表情変更**: 数字キーで手動変更するとランダムモードは一時停止されます

## デバッグ

コンソールに詳細なログが出力されるため、ブラウザの開発者ツールで動作を確認できます：

```
ランダム表情変更: happy
次の変更まで: 3.2秒
ランダム表情モード開始 - 最初の変更まで: 2.1秒
```

## トラブルシューティング

### ランダム変更が動作しない場合

1. 顔モード（`displayMode="face"`）になっているか確認
2. `enableRandomExpression={true}` が設定されているか確認
3. `randomExpressionList` に有効な表情が含まれているか確認
4. 他のモード（口ぱくぱくなど）と競合していないか確認

### 間隔が期待通りでない場合

1. `randomIntervalMin` ≤ `randomIntervalMax` になっているか確認
2. 値が正の数になっているか確認
3. フレームレート（通常60fps）の影響を考慮

プログラム上でランダム表情機能を使用することで、より動的で表現豊かな顔アニメーションを実現できます。
