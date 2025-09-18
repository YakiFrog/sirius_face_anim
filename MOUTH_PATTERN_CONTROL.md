# 口パターン制御機能 (a, i, o) - 目の表情保持版

HTTP経由およびキーボード操作でa、i、oの口のパターンを制御する機能を実装しました。
**重要**: この実装では、口のパターンを変更しても目の表情は保持されます。

## 🎯 機能概要

### キーボード操作
- **Zキー**: `mouth_a` (あ) の口パターンに変更（目の表情はそのまま）
- **Xキー**: `mouth_i` (い) の口パターンに変更（目の表情はそのまま） 
- **Cキー**: `mouth_o` (お) の口パターンに変更（目の表情はそのまま）

### HTTP API
- **GET  `/mouth_pattern`**: 現在の口パターンを取得
- **POST `/mouth_pattern`**: 口パターンを設定

### 目と口の独立制御
- 口パターン制御中でも、目の表情（happy、angry、sad等）は維持されます
- 例: happy表情でZキーを押すと、笑った目 + あの口になります
- 例: sad表情でXキーを押すと、悲しい目 + いの口になります

## 🚀 使用方法

### 1. フロントエンド側
Electronアプリケーションを起動して、以下のキーで口パターンを制御：

```bash
cd /Users/kotaniryota/NLAB/sirius_face_anim
npm run dev
```

- `Z`: あ (mouth_a)
- `X`: い (mouth_i)  
- `C`: お (mouth_o)

### 2. HTTPサーバー側

#### 既存サーバーを使用 (ポート8080)
```bash
cd /Users/kotaniryota/NLAB/sirius_face_anim/python
python3 main.py
```

#### 専用サーバーを使用 (ポート9090) 
```bash
cd /Users/kotaniryota/NLAB/sirius_face_anim/python
python3 mouth_pattern_server_example.py
```

### 3. API使用例

### 使用例（目と口の独立制御）

```bash
# 1. 表情をhappyに設定
curl -X POST http://localhost:8080/expression \
     -H 'Content-Type: application/json' \
     -d '{"expression": "happy"}'

# 2. 口だけをmouth_aに変更（笑った目 + あの口）
curl -X POST http://localhost:8080/mouth_pattern \
     -H 'Content-Type: application/json' \
     -d '{"mouth_pattern": "mouth_a"}'

# 3. 表情をsadに変更（口はそのまま mouth_a）
curl -X POST http://localhost:8080/expression \
     -H 'Content-Type: application/json' \
     -d '{"expression": "sad"}'

# 結果: 悲しい目 + あの口の組み合わせ
```

#### 現在の口パターンを取得
```bash
curl http://localhost:9090/mouth_pattern
```

レスポンス例:
```json
{
  "mouth_pattern": "mouth_a",
  "timestamp": 1695123456.789
}
```

## 🔧 実装詳細

### フロントエンド (TypeScript/React)

1. **MouthPatternController.ts**: 新しい口パターン専用制御クラス
2. **KeyboardHandler.ts**: z、x、cキーで口パターンコントローラーを操作
3. **ROS2Connection.ts**: HTTP経由での口パターン制御機能追加  
4. **P5Sketch.tsx**: 目と口を独立して描画する機能
5. **FaceAnimationTypes.ts**: `mouth_a`, `mouth_i`, `mouth_o`型定義（既存）

### 制御の優先順位

1. **おしゃべりモード (S/Dキー)**: 最優先 - 口パターンを自動切り替え
2. **口パターンコントローラー (Z/X/Cキー)**: 2番目 - 手動で個別の口パターンに固定
3. **通常の表情**: 最低優先 - デフォルトの表情システム

### 目と口の分離

- **目の描画**: 常に元の表情（`expression`）を使用
- **口の描画**: 口パターンコントローラーがアクティブな場合は指定されたパターンを使用
- **バウンスアニメーション**: 口パターン変更時に適用

### バックエンド (Python)

1. **main.py**: 既存HTTPサーバーに口パターン制御エンドポイント追加
2. **mouth_pattern_server_example.py**: 独立した口パターン制御サーバー

### 口パターンの描画

各口パターンは既存のおしゃべりモード機能を活用：

- **mouth_a**: 楕円形の開いた口（あ）
- **mouth_i**: 横線の口（い）  
- **mouth_o**: 小さな丸い口（お）

## 🎮 デモ・テスト

### 手動テスト
1. サーバーを起動: `python3 main.py`
2. フロントエンドを起動: `npm run dev`  
3. Z、X、Cキーで口パターンをテスト

### コンソールからの手動制御
サーバー起動後、コンソールで以下のコマンドが利用可能：

- `Z` + Enter: mouth_a パターン
- `X` + Enter: mouth_i パターン  
- `C` + Enter: mouth_o パターン
- `S` + Enter: 現在の状態表示
- `H` + Enter: ヘルプ表示

### API テスト
```bash
# すべての口パターンをテスト
curl -X POST http://localhost:9090/mouth_pattern -H 'Content-Type: application/json' -d '{"mouth_pattern": "mouth_a"}'
sleep 2
curl -X POST http://localhost:9090/mouth_pattern -H 'Content-Type: application/json' -d '{"mouth_pattern": "mouth_i"}'  
sleep 2
curl -X POST http://localhost:9090/mouth_pattern -H 'Content-Type: application/json' -d '{"mouth_pattern": "mouth_o"}'
```

## 📝 注意事項

- HTTPサーバーとフロントエンドの両方が起動している必要があります
- デフォルトのHTTPサーバーURLは `http://localhost:8080` です
- **キーボード操作は目の表情を保持したまま口だけを変更します**
- **従来の表情変更（1-9キー）とは独立して動作します**
- 口パターン制御は通常の表情システムより優先されます
- おしゃべりモード（S/Dキー）は口パターン制御より優先されます

## 🔗 関連ファイル

- `/renderer/utils/MouthPatternController.ts` - 新しい口パターン制御クラス
- `/renderer/utils/KeyboardHandler.ts` - キーボード制御（修正）
- `/renderer/utils/ROS2Connection.ts` - HTTP通信（修正）
- `/renderer/components/P5Sketch.tsx` - 描画処理（修正）
- `/python/main.py` - HTTPサーバー（統合版）
- `/python/mouth_pattern_server_example.py` - HTTPサーバー（独立版）
