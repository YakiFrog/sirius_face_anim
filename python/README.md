# 🤖 SIRIUS Face Animation Python Backend

顔アニメーションシステムのPythonバックエンドプロジェクトです。HTTP APIサーバーを通じて表情制御、リアルタイム音声解析によるリップシンク、音声合成システムを提供します。

## 📋 プロジェクト構成

```
python/
├── main.py              # HTTPサーバー（表情・口パク制御API）
├── lipsync.py           # リアルタイム音声解析リップシンク
├── zundamon.py          # 音声合成 + リップシンク同期システム
├── requirements.txt     # Python依存関係
└── README.md           # このファイル
```

## 🎯 システム概要

本システムは3つの主要コンポーネントで構成されています：

1. **HTTPサーバー** (`main.py`) - 表情制御API
2. **リアルタイムリップシンク** (`lipsync.py`) - マイク音声監視
3. **音声合成システム** (`zundamon.py`) - セリフ再生 + 自動リップシンク

## 🔧 システムアーキテクチャ

```mermaid
graph TB
    subgraph "フロントエンド"
        FE[Next.js Frontend<br/>顔アニメーション表示]
    end
    
    subgraph "Pythonバックエンド"
        HTTP[main.py<br/>HTTPサーバー]
        LIPS[lipsync.py<br/>リアルタイム音声解析]
        VOICE[zundamon.py<br/>音声合成システム]
    end
    
    subgraph "外部システム"
        MIC[🎤 マイク入力]
        SPEAKER[🔊 スピーカー出力]
        SAY[macOS say コマンド]
    end
    
    FE --|HTTP API呼び出し| HTTP
    HTTP --|表情・口パク状態管理| FE
    
    MIC --|音声データ| LIPS
    LIPS --|HTTP POST| HTTP
    HTTP --|おしゃべりモード制御| FE
    
    VOICE --|HTTP POST| HTTP
    VOICE --|音声合成指示| SAY
    SAY --|音声出力| SPEAKER
    
    style HTTP fill:#e1f5fe
    style LIPS fill:#f3e5f5
    style VOICE fill:#e8f5e8
```

## 🚀 各システムの詳細ロジック

### 1. HTTPサーバー (main.py)

表情制御とおしゃべりモード管理を行うRESTful APIサーバーです。

```mermaid
flowchart TD
    START([HTTPサーバー起動]) --> INIT[初期化<br/>- ポート8080<br/>- 表情状態管理<br/>- CORS設定]
    INIT --> LISTEN[リクエスト待機]
    
    LISTEN --> REQ{リクエスト種別}
    
    REQ -->|GET /| STATUS[システム状態返却]
    REQ -->|POST /expression| EXPR[表情変更処理]
    REQ -->|POST /talking_mouth_mode| TALK[おしゃべりモード切替]
    REQ -->|GET /status| STAT[詳細状態取得]
    
    EXPR --> VALIDATE[リクエスト検証]
    VALIDATE -->|有効| UPDATE_EXPR[表情状態更新]
    VALIDATE -->|無効| ERROR[400エラー返却]
    
    TALK --> VALIDATE2[モード検証]
    VALIDATE2 -->|有効| UPDATE_TALK[おしゃべり状態更新]
    VALIDATE2 -->|無効| ERROR2[400エラー返却]
    
    UPDATE_EXPR --> RESPONSE[200レスポンス]
    UPDATE_TALK --> RESPONSE2[200レスポンス]
    STATUS --> RESPONSE3[ステータスJSON返却]
    STAT --> RESPONSE4[詳細状態JSON返却]
    
    RESPONSE --> LISTEN
    RESPONSE2 --> LISTEN
    RESPONSE3 --> LISTEN
    RESPONSE4 --> LISTEN
    ERROR --> LISTEN
    ERROR2 --> LISTEN
    
    style START fill:#81c784
    style LISTEN fill:#e3f2fd
    style UPDATE_EXPR fill:#fff3e0
    style UPDATE_TALK fill:#fce4ec
```

#### 🎭 表情モード一覧
- `neutral` - 通常表情
- `happy` - 喜び
- `sad` - 悲しみ  
- `angry` - 怒り
- `surprised` - 驚き
- `crying` - 泣き
- `hurt` - 痛み
- `wink` - ウィンク
- `mouth3` - 口3
- `pien` - ぴえん

#### 🔌 API エンドポイント

| メソッド | パス | 機能 | パラメータ |
|---------|------|------|-----------|
| GET | `/` | システム状態取得 | なし |
| POST | `/expression` | 表情変更 | `{"expression": "happy"}` |
| POST | `/talking_mouth_mode` | おしゃべりモード切替 | `{"talking_mouth_mode": true}` |
| GET | `/status` | 詳細状態取得 | なし |

### 2. リアルタイムリップシンク (lipsync.py)

マイク入力をリアルタイムで監視し、音声検出時に自動的におしゃべりモードをオン/オフします。

```mermaid
flowchart TD
    START([リップシンク開始]) --> INIT[初期化<br/>- サンプリングレート: 16kHz<br/>- チャンクサイズ: 128<br/>- 閾値: 0.003]
    
    INIT --> MIC_OPEN[マイクストリーム開始]
    MIC_OPEN --> LOOP[メインループ開始]
    
    LOOP --> READ[音声データ読み取り<br/>128バイトチャンク]
    READ --> CALC[音量計算<br/>RMS正規化]
    
    CALC --> ANALYSIS[音声解析処理]
    
    ANALYSIS --> INSTANT{瞬時検出?<br/>音量 > 閾値×1.2}
    INSTANT -->|Yes| IMMEDIATE[即座におしゃべりON<br/>HTTP POST]
    INSTANT -->|No| NORMAL[通常解析処理]
    
    NORMAL --> ADAPTIVE[適応的閾値計算<br/>ノイズレベル考慮]
    ADAPTIVE --> TREND[音量トレンド解析<br/>3サンプル履歴]
    
    TREND --> PREDICT{予測的検出?<br/>上昇傾向あり}
    PREDICT -->|Yes| FAST_ON[高速おしゃべりON]
    PREDICT -->|No| REGULAR[通常検出処理]
    
    REGULAR --> SPEAKING{話し中判定}
    SPEAKING -->|音声検出| START_TIMER[話し始めタイマー開始]
    SPEAKING -->|無音検出| STOP_CHECK[停止条件チェック]
    
    START_TIMER --> DURATION{最小継続時間<br/>0.01秒経過?}
    DURATION -->|Yes| TALK_ON[おしゃべりモードON<br/>HTTP POST]
    DURATION -->|No| CONTINUE[継続監視]
    
    STOP_CHECK --> SILENCE{無音継続時間<br/>0.03秒経過?}
    SILENCE -->|Yes| TALK_OFF[おしゃべりモードOFF<br/>HTTP POST]
    SILENCE -->|No| CONTINUE2[継続監視]
    
    IMMEDIATE --> SLEEP[1ms待機]
    FAST_ON --> SLEEP
    TALK_ON --> SLEEP
    TALK_OFF --> SLEEP
    CONTINUE --> SLEEP
    CONTINUE2 --> SLEEP
    
    SLEEP --> LOOP
    
    style START fill:#81c784
    style INSTANT fill:#ffcdd2
    style PREDICT fill:#f8bbd9
    style TALK_ON fill:#c8e6c9
    style TALK_OFF fill:#ffccc7
    style SLEEP fill:#e1f5fe
```

#### ⚡ 超高速化の仕組み

1. **瞬時検出**: 音量が閾値×1.2を超えたら即座に反応
2. **予測的検出**: 音量の上昇傾向を検出して先読み
3. **適応的閾値**: 環境ノイズに応じて動的調整
4. **最小遅延**: 1msサイクルでリアルタイム処理

### 3. 音声合成システム (zundamon.py)

テキストを音声合成で再生し、再生時間に合わせて自動的にリップシンクを制御します。

```mermaid
flowchart TD
    START([音声合成開始]) --> INIT[システム初期化<br/>- HTTPコントローラー<br/>- 音声設定選択]
    
    INIT --> VOICE_SELECT[音声選択処理]
    VOICE_SELECT --> CHECK_VOICES[利用可能音声チェック<br/>say -v ?]
    CHECK_VOICES --> SELECT[最適音声選択<br/>Kyoko, Otoya, Yuna...]
    
    SELECT --> READY[発話準備完了]
    
    subgraph "発話処理フロー"
        SPEAK_START([speak_async呼び出し]) --> VALIDATE[テキスト検証]
        VALIDATE --> MODE_ON[おしゃべりモードON<br/>HTTP POST]
        MODE_ON --> WAIT1[モード切替待機<br/>0.2秒]
        
        WAIT1 --> ESTIMATE[再生時間推定<br/>文字数 ÷ 2.5]
        ESTIMATE --> SAY_CMD[say コマンド実行<br/>-r 180 パラメータ]
        
        SAY_CMD --> TIMING[実行時間計測<br/>start_time → end_time]
        TIMING --> COMPLETE{再生完了?}
        
        COMPLETE -->|成功| WAIT2[余裕時間待機<br/>0.5秒]
        COMPLETE -->|失敗| ERROR_HANDLE[エラーハンドリング]
        
        WAIT2 --> MODE_OFF[おしゃべりモードOFF<br/>HTTP POST]
        MODE_OFF --> SUCCESS[発話完了]
        
        ERROR_HANDLE --> FORCE_OFF[強制モードOFF]
        FORCE_OFF --> FAIL[発話失敗]
    end
    
    READY --> INPUT{入力方式}
    INPUT -->|コマンドライン| SINGLE[単発発話]
    INPUT -->|対話モード| CONSOLE[コンソールモード]
    
    SINGLE --> SPEAK_START
    CONSOLE --> MENU[メニュー表示]
    
    MENU --> COMMAND{コマンド選択}
    COMMAND -->|1-5| PRESET[定型セリフ]
    COMMAND -->|C| CUSTOM[カスタムテキスト]
    COMMAND -->|D| DEMO[デモモード]
    COMMAND -->|V| VOICE_TEST[音声テスト]
    COMMAND -->|S| STATUS[状態表示]
    COMMAND -->|Q| EXIT[終了]
    
    PRESET --> SPEAK_START
    CUSTOM --> INPUT_TEXT[テキスト入力]
    INPUT_TEXT --> SPEAK_START
    
    DEMO --> MULTI[複数セリフ連続再生]
    MULTI --> SPEAK_START
    
    SUCCESS --> MENU
    FAIL --> MENU
    VOICE_TEST --> MENU
    STATUS --> MENU
    
    style START fill:#81c784
    style MODE_ON fill:#c8e6c9
    style SAY_CMD fill:#fff3e0
    style MODE_OFF fill:#ffccc7
    style SUCCESS fill:#a5d6a7
    style ERROR_HANDLE fill:#ef9a9a
```

#### 🎵 音声パラメータ

| パラメータ | 値 | 説明 |
|-----------|----|----- |
| 読み上げ速度 | 180 wpm | Words Per Minute |
| 推定レート | 2.5文字/秒 | 保守的な時間計算 |
| 最小再生時間 | 2.0秒 | 短いテキストの最低保証 |
| タイムアウト | 20秒 | 最大処理時間 |
| 待機時間 | 0.5秒 | モード切替後の余裕時間 |

## 🔄 システム間連携フロー

全体的なシステム連携の流れを示します：

```mermaid
sequenceDiagram
    participant FE as Frontend<br/>(Next.js)
    participant HTTP as main.py<br/>(HTTPサーバー)
    participant LIPS as lipsync.py<br/>(音声解析)
    participant VOICE as zundamon.py<br/>(音声合成)
    participant MIC as マイク
    participant SPEAKER as スピーカー
    
    Note over FE,SPEAKER: システム起動フェーズ
    HTTP->>HTTP: サーバー起動 (8080ポート)
    FE->>HTTP: GET / (接続確認)
    HTTP-->>FE: 200 OK
    
    Note over FE,SPEAKER: リアルタイムリップシンク
    LIPS->>MIC: 音声監視開始
    MIC-->>LIPS: 音声データ (16kHz, 128bytes)
    LIPS->>LIPS: 音量解析・閾値判定
    LIPS->>HTTP: POST /talking_mouth_mode (true)
    HTTP-->>LIPS: 200 OK
    HTTP->>FE: (ポーリング) おしゃべりモード更新
    
    Note over FE,SPEAKER: 音声合成フロー
    VOICE->>HTTP: POST /talking_mouth_mode (true)
    HTTP-->>VOICE: 200 OK
    VOICE->>SPEAKER: say コマンド実行
    SPEAKER-->>VOICE: 音声再生完了
    VOICE->>HTTP: POST /talking_mouth_mode (false)
    HTTP-->>VOICE: 200 OK
    
    Note over FE,SPEAKER: 表情制御
    FE->>HTTP: POST /expression {"expression": "happy"}
    HTTP-->>FE: 200 OK
    HTTP->>FE: 表情状態更新
```

## 🛠️ インストールと実行

### 依存関係のインストール

```bash
cd python
pip install -r requirements.txt
```

### 各システムの起動

#### 1. HTTPサーバー起動
```bash
python main.py
```
- ポート: 8080
- 機能: 表情・おしゃべりモード制御API

#### 2. リアルタイムリップシンク起動
```bash
python lipsync.py
```
- マイク音声を監視
- 自動的におしゃべりモード制御

#### 3. 音声合成システム
```bash
# 対話モード
python zundamon.py

# 直接発話
python zundamon.py --text "こんにちは！"
```

## ⚙️ 設定パラメータ

### リップシンク設定 (lipsync.py)
```python
AudioAnalyzer(
    sample_rate=16000,      # サンプリングレート
    chunk_size=128,         # チャンクサイズ
    threshold=0.003,        # 音声検出閾値
    min_speaking_duration=0.01,  # 最小話し続け時間
    silence_timeout=0.03    # 無音タイムアウト
)
```

### 音声合成設定 (zundamon.py)
```python
# say コマンドパラメータ
["say", "-v", "Kyoko", "-r", "180", text]
```

## 🎯 パフォーマンス特性

| システム | 応答時間 | CPU使用率 | メモリ使用量 |
|---------|---------|----------|------------|
| HTTPサーバー | < 10ms | 低 | ~20MB |
| リップシンク | 1-3ms | 中 | ~50MB |
| 音声合成 | 再生時間依存 | 低 | ~30MB |

## 🔧 トラブルシューティング

### よくある問題

1. **マイクが認識されない**
   ```bash
   # マイクデバイス確認
   python -c "import pyaudio; p=pyaudio.PyAudio(); [print(f'{i}: {p.get_device_info_by_index(i)[\"name\"]}') for i in range(p.get_device_count())]"
   ```

2. **音声合成が動かない**
   ```bash
   # say コマンド確認
   say -v ? | grep 日本語
   say -v Kyoko "テスト"
   ```

3. **HTTPサーバーに接続できない**
   ```bash
   # ポート確認
   lsof -i :8080
   curl http://localhost:8080/
   ```

## 📈 今後の拡張予定

- [ ] VOICEVOX APIとの統合
- [ ] 複数音声エンジンの対応
- [ ] リアルタイム感情認識
- [ ] WebSocket通信での低遅延化
- [ ] 音声品質の向上

---

🤖 **SIRIUS Face Animation System** - Python Backend v1.0
