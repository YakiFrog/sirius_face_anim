# Sirius Face Animation

リアルタイムで表情が変化するアニメーション顔を表示するElectron + Next.jsアプリケーションです。キーボード操作やHTTPリクエストで表情を制御でき、ROS2システムとの双方向同期に対応しています。

## 📋 プロジェクト概要

- **プロジェクト名**: sirius-face
- **バージョン**: 1.0.0
- **開発者**: Ketan Patel
- **技術スタック**: Electron + Next.js + React + TypeScript + p5.js

## 🎭 主な機能

### 表情制御システム
- **7種類の表情**: neutral, happy, angry, sad, surprised, crying, hurt
- **リアルタイム切り替え**: キーボードまたはHTTP APIで即座に表情変更
- **アニメーション効果**: 表情変更時のジャンプエフェクト
- **自然な動作**: 自動瞬き、頭の微細な動き、呼吸のような揺れ

### 操作インターフェース
- **キーボードショートカット**: 数字キー1-7で表情切り替え
- **マウス/タッチ操作**: クリック/タップで一時的な痛がり反応
- **Picture-in-Picture**: Pキーでウィンドウ外表示
- **設定パネル**: HTTP接続設定の変更

### ROS2連携機能（🆕 重要機能）
- **双方向同期**: ROS2サーバーとクライアント間で表情状態を同期
- **自動ポーリング**: 1秒間隔でサーバーから表情状態を取得
- **手動変更の反映**: キーボード・タッチ操作時にサーバーへ自動送信
- **競合回避**: 手動変更時は5秒間ポーリングを停止
- **リアルタイム同期**: 複数システム間での表情同期

### 外部連携機能
- **HTTP REST API**: 外部システムからの表情制御
- **ROS2対応**: ロボットシステムとの連携
- **自動復旧**: 接続エラー時の自動リトライ機能

## 🔄 ROS2同期の仕組み

### 通常の動作フロー
```
1. アプリ起動時 → ROS2サーバーから初期表情を取得
2. 1秒間隔 → サーバーから表情状態をポーリング
3. サーバー側で表情変更 → 自動的にクライアントに反映
```

### 手動変更時の動作フロー
```
1. キーボード（1-7）/ タッチ操作
2. ローカルで即座に表情変更
3. 同時にROS2サーバーにPOST送信
4. 5秒間ポーリング停止（競合回避）
5. 5秒後にポーリング再開
```

この仕組みにより、**手動で変更した表情がサーバーの古い表情で上書きされることを防ぎ**、常に最新の表情状態が維持されます。

## 🚀 セットアップ・実行

### システム要件
- **Node.js**: 16.x以上
- **OS**: Windows, macOS, Linux
- **ブラウザ**: Chromium系（Electronに内蔵）

### インストール

```bash
# プロジェクトディレクトリに移動
cd sirius_face_anim

# 依存関係をインストール
npm install
# または
yarn install
```

### 開発モード実行

```bash
# 開発サーバー起動
npm run dev
# または
yarn dev
```

### プロダクションビルド

```bash
# アプリケーションをビルド
npm run build
# または
yarn build
```

## 🎮 操作方法

### キーボード操作
| キー | 表情 | 効果 |
|------|------|------|
| `1` | neutral | 通常の表情 |
| `2` | happy | 笑顔（上向きのカーブ） |
| `3` | angry | 怒り（下向きの眉、険しい目） |
| `4` | sad | 悲しみ（下向きの口） |
| `5` | surprised | 驚き（大きな目、丸い口） |
| `6` | crying | 泣き（涙のアニメーション付き） |
| `7` | hurt | 痛がる表情（波打つ口） |
| `P` | - | Picture-in-Picture切り替え |

### マウス/タッチ操作
- **クリック/タップ**: 一時的に`hurt`表情に変化（1秒後に元に戻る）

## 🌐 HTTP API仕様

### エンドポイント

#### 表情取得
```http
GET /expression
```

**レスポンス例:**
```json
{
  "expression": "happy"
}
```

#### 表情設定
```http
POST /expression
Content-Type: application/json

{
  "expression": "angry"
}
```

**HTTPステータス:**
- `200 OK`: 成功
- `400 Bad Request`: 無効な表情タイプ
- `500 Internal Server Error`: サーバーエラー

### 有効な表情タイプ
```json
["neutral", "happy", "angry", "sad", "surprised", "crying", "hurt"]
```

### curl使用例

```bash
# 現在の表情を取得
curl http://localhost:8080/expression

# 笑顔に変更
curl -X POST http://localhost:8080/expression \
  -H "Content-Type: application/json" \
  -d '{"expression": "happy"}'

# 怒り顔に変更
curl -X POST http://localhost:8080/expression \
  -H "Content-Type: application/json" \
  -d '{"expression": "angry"}'
```

## ⚙️ 設定

### HTTP接続設定
1. アプリケーション左上の「設定表示」をクリック
2. HTTP URLを設定（デフォルト: `http://localhost:8080`）
3. 「URLを適用」をクリック

### 設定の永続化
- 設定はブラウザのlocalStorageに自動保存
- アプリ再起動時に前回の設定を復元

## 🎨 技術仕様

### アーキテクチャ
```
┌─────────────────┐    ┌─────────────────┐
│   Electron      │    │  External API   │
│  (Main Process) │    │    Server       │
└─────────────────┘    └─────────────────┘
         │                       │
         │ IPC                   │ HTTP
         │                       │
┌─────────────────┐              │
│    Next.js      │──────────────┘
│ (Renderer Proc) │
└─────────────────┘
         │
         │ React Components
         │
┌─────────────────┐
│     p5.js       │
│  (Animation)    │
└─────────────────┘
```

### 主要依存関係
- **Electron**: ^34.0.0 - デスクトップアプリ化
- **Next.js**: ^14.2.4 - Reactフレームワーク
- **React**: ^18.3.1 - UIフレームワーク
- **TypeScript**: ^5.7.3 - 型安全性
- **p5.js**: ^1.11.3 - グラフィック描画
- **react-p5**: ^1.4.1 - React用p5.jsラッパー

### ファイル構成
```
sirius_face_anim/
├── main/                           # Electronメインプロセス
│   ├── background.ts              # メインプロセスエントリーポイント
│   ├── preload.ts                 # プリロードスクリプト
│   └── helpers/                   # ヘルパー関数
├── renderer/                       # Next.jsレンダラープロセス
│   ├── components/
│   │   └── P5Sketch.tsx           # メインアニメーションコンポーネント
│   ├── pages/
│   │   ├── _app.tsx               # Next.jsアプリ設定
│   │   ├── _document.tsx          # HTML文書設定
│   │   └── home.tsx               # ホームページ
│   └── public/images/             # 静的リソース
├── app/                           # ビルド出力
├── resources/                     # アプリアイコン
├── package.json                   # プロジェクト設定
├── electron-builder.yml          # Electronビルド設定
└── README.md                      # このファイル
```

### アニメーション詳細

#### 表情システム
- **目の制御**: まぶたの開閉、角度、サイズ調整
- **口の制御**: ベジェ曲線による自然な形状変化
- **特殊エフェクト**: 涙アニメーション（crying表情時）

#### 自動アニメーション
- **瞬き**: 3-10秒間隔でランダム発生
- **頭の動き**: 微細なランダム移動（1.5px範囲）
- **呼吸効果**: サイン波による自然な上下動
- **表情変更エフェクト**: ジャンプアニメーション（高さ10-30px）

#### レスポンシブ対応
- **16:9アスペクト比**: 画面サイズに応じて自動スケーリング
- **基準解像度**: 1920x1080での最適化
- **フルスクリーン対応**: ウィンドウサイズに合わせて調整

## 🔧 開発・カスタマイズ

### 新しい表情の追加

1. **型定義を拡張**
```typescript
type FacialExpression = 'neutral' | 'happy' | '...' | 'new_expression';
```

2. **描画関数にケースを追加**
```typescript
// P5Sketch.tsx の drawEyes() と drawMouth() 内
case 'new_expression':
  // 新しい表情の描画ロジック
  break;
```

3. **キーマッピングを追加**
```typescript
// handleKeyPress() 内
const expressionMap = {
  '8': 'new_expression',
  // ...
};
```

### アニメーションパラメータ調整
```typescript
// 瞬き間隔
const blinkInterval = 3000 + Math.random() * 7000; // 3-10秒

// 頭の動き範囲
const moveRange = scaleFactorRef.current * 1.5; // 1.5px

// ジャンプの高さ係数
const jumpHeight = scaleFactorRef.current * 30; // 30px
```

## 🐛 トラブルシューティング

### よくある問題

#### 1. アプリが起動しない
```bash
# Node.jsバージョン確認
node --version  # 16.x以上が必要

# 依存関係を再インストール
rm -rf node_modules package-lock.json
npm install
```

#### 2. 表情が変わらない
- アプリケーションにキーボードフォーカスがあるか確認
- F12で開発者ツールを開いてエラーを確認
- HTTP接続設定が正しいか確認

#### 3. HTTP接続エラー
```bash
# サーバー起動確認
curl http://localhost:8080/expression

# ポート使用状況確認
netstat -tlnp | grep :8080
```

#### 4. パフォーマンス問題
- ハードウェアアクセラレーションを有効化
- 他のアプリケーションを終了
- 開発者ツールを閉じる

### ログ確認
開発者ツール（F12）のコンソールで以下のログを確認：
- `HTTP経由で表情を{expression}に変更しました`
- `キー {key} が押されました。表情を {expression} に変更します。`
- HTTP接続エラー

## 📄 ライセンス

このプロジェクトはMITライセンスのもとで公開されています。

## 🤝 貢献

バグ報告、機能要求、プルリクエストを歓迎します。
- Issue: バグ報告や機能要求
- Pull Request: コード改善や新機能追加

## 📞 サポート

質問や問題がある場合は、GitHubのIssueまたは開発者へ直接連絡してください。

---

**作成者**: Ketan Patel (ktan.p.patel@gmail.com)  
**最終更新**: 2025年6月1日
