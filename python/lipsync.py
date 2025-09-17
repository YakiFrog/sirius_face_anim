#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
音声リップシンク機能付きHTTPサーバー
マイク入力を監視して自動的におしゃべりモードを制御
"""

import numpy as np
import pyaudio
import threading
import time
import requests
import json
import logging
from collections import deque

# ログ設定
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class AudioAnalyzer:
    """音声解析クラス"""
    
    def __init__(self, 
                 sample_rate=16000,  # より低いサンプリングレートで超高速化
                 chunk_size=128,     # 最小チャンクサイズ
                 threshold=0.003,    # より低い閾値
                 min_speaking_duration=0.01,  # 最短話し続け時間
                 silence_timeout=0.03):  # 超短い無音タイムアウト
        """
        初期化
        
        Args:
            sample_rate: サンプリングレート (Hz)
            chunk_size: チャンクサイズ
            threshold: 音声検出の閾値 (0.0-1.0)
            min_speaking_duration: 最小話し続け時間 (秒)
            silence_timeout: 無音状態でのタイムアウト (秒)
        """
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.threshold = threshold
        self.min_speaking_duration = min_speaking_duration
        self.silence_timeout = silence_timeout
        
        # 高速化のためのプリコンパイル値
        self.threshold_x_0_7 = threshold * 0.7
        self.threshold_x_1_2 = threshold * 1.2
        self.threshold_x_0_8 = threshold * 0.8
        self.threshold_x_0_5 = threshold * 0.5
        
        # PyAudio初期化
        self.audio = pyaudio.PyAudio()
        self.stream = None
        
        # 音声解析用
        self.is_speaking = False
        self.speaking_start_time = None
        self.last_sound_time = None
        self.volume_history = deque(maxlen=3)  # 最小限の履歴で高速化
        self.noise_level = 0.0  # ノイズレベル
        self.adaptive_threshold = threshold  # 適応的閾値
        self.noise_samples = deque(maxlen=10)  # ノイズサンプル数を削減
        
        # コールバック関数
        self.on_speaking_start = None
        self.on_speaking_stop = None
        
        # 制御フラグ
        self.is_running = False
        self.analysis_thread = None
        
    def set_callbacks(self, on_speaking_start=None, on_speaking_stop=None):
        """コールバック関数を設定"""
        self.on_speaking_start = on_speaking_start
        self.on_speaking_stop = on_speaking_stop
    
    def calculate_volume(self, audio_data):
        """音量レベルを計算（超高速版）"""
        try:
            # numpy配列に変換
            audio_np = np.frombuffer(audio_data, dtype=np.int16)
            
            # データが空の場合は0を返す
            if len(audio_np) == 0:
                return 0.0
            
            # RMS (Root Mean Square) を計算（高速版）
            mean_square = np.mean(audio_np.astype(np.float32)**2)
            
            # 負の値やNaNをチェック
            if mean_square < 0 or np.isnan(mean_square):
                return 0.0
                
            rms = np.sqrt(mean_square)
            
            # 正規化 (0.0-1.0の範囲)
            normalized_volume = min(rms / 32767.0, 1.0)
            
            # NaNや無限大値をチェック
            if np.isnan(normalized_volume) or np.isinf(normalized_volume):
                return 0.0
                
            return normalized_volume
            if np.isnan(normalized_volume) or np.isinf(normalized_volume):
                return 0.0
                
            return max(0.0, normalized_volume)  # 負の値を防ぐ
            
        except Exception as e:
            logger.debug(f"音量計算エラー: {e}")
            return 0.0
    
    def analyze_audio_chunk(self, audio_data):
        """音声チャンクを解析"""
        current_time = time.time()
        volume = self.calculate_volume(audio_data)
        
        # 音量履歴に追加
        self.volume_history.append(volume)
        
        # 移動平均を計算（ノイズ除去）
        if len(self.volume_history) > 3:  # 最低3サンプルで計算開始
            avg_volume = sum(self.volume_history[-5:]) / min(5, len(self.volume_history))  # 直近5サンプルの平均
            
            # ノイズレベルを更新（低い音量の平均）
            low_volumes = [v for v in self.volume_history if v < self.threshold]
            if low_volumes:
                self.noise_level = sum(low_volumes) / len(low_volumes)
                # 適応的閾値を設定（ノイズレベルの1.5倍に下げて感度アップ）
                self.adaptive_threshold = max(self.threshold, self.noise_level * 1.5)
            else:
                # ノイズレベルが検出されない場合はより低い閾値を使用
                self.adaptive_threshold = self.threshold * 0.7
        else:
            avg_volume = volume
        
        # 音量の変化率を計算（予測的検出）
        volume_trend = 0
        if len(self.volume_history) >= 3:
            recent_volumes = list(self.volume_history)[-3:]
            volume_trend = (recent_volumes[-1] - recent_volumes[0]) / 2  # 変化率
        
        # 複数レベルの音声検出
        is_sound_detected = avg_volume > self.adaptive_threshold
        instant_sound_detected = volume > self.adaptive_threshold * 1.2
        trend_sound_detected = volume_trend > self.adaptive_threshold * 0.5  # 音量が急激に上昇
        
        # 予測的反応：音量が急上昇している場合は即座に反応
        predictive_detection = (volume > self.adaptive_threshold * 0.8 and volume_trend > 0.001)
        
        any_sound_detected = is_sound_detected or instant_sound_detected or trend_sound_detected or predictive_detection
        
        if any_sound_detected:
            self.last_sound_time = current_time
            
            # 話し始めの検出（超高速反応）
            if not self.is_speaking:
                # 予測的検出や瞬間検出の場合は待機時間なしで即座に反応
                if instant_sound_detected or predictive_detection or trend_sound_detected:
                    self.is_speaking = True
                    self.speaking_start_time = current_time
                    logger.info(f"🚀 即座音声検出 (音量: {volume:.3f}, 傾向: {volume_trend:.3f})")
                    if self.on_speaking_start:
                        self.on_speaking_start()
                else:
                    # 通常の検出の場合は最小待機時間を適用
                    if self.speaking_start_time is None:
                        self.speaking_start_time = current_time
                    elif current_time - self.speaking_start_time >= self.min_speaking_duration:
                        self.is_speaking = True
                        self.speaking_start_time = current_time
                        logger.info(f"🎤 音声検出開始 (音量: {avg_volume:.3f}, 閾値: {self.adaptive_threshold:.3f})")
                        if self.on_speaking_start:
                            self.on_speaking_start()
        else:
            # 無音の場合、話し始めタイマーをリセット
            self.speaking_start_time = None
            
            # 話し終わりの検出
            if self.is_speaking and self.last_sound_time:
                if current_time - self.last_sound_time >= 0.03:  # 0.03秒の無音で即座に停止（超高速化）
                    self.is_speaking = False
                    self.last_sound_time = None
                    logger.info("🔇 音声検出終了")
                    if self.on_speaking_stop:
                        self.on_speaking_stop()
        
        return {
            'volume': volume,
            'avg_volume': avg_volume,
            'is_speaking': self.is_speaking,
            'is_sound_detected': any_sound_detected,
            'predictive_detected': predictive_detection,
            'volume_trend': volume_trend,
            'adaptive_threshold': self.adaptive_threshold,
            'noise_level': self.noise_level
        }
    
    def start_monitoring(self):
        """音声監視を開始"""
        try:
            # マイクストリームを開く（低遅延設定）
            self.stream = self.audio.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=self.sample_rate,
                input=True,
                frames_per_buffer=self.chunk_size,
                input_device_index=None,  # デフォルトデバイス
                # 低遅延設定
                stream_callback=None,
                start=False
            )
            
            logger.info("🎧 超高速音声監視開始")
            logger.info(f"  サンプリングレート: {self.sample_rate} Hz")
            logger.info(f"  チャンクサイズ: {self.chunk_size} (遅延: ~{self.chunk_size/self.sample_rate*1000:.1f}ms)")
            logger.info(f"  音声検出閾値: {self.threshold}")
            logger.info(f"  最小話し続け時間: {self.min_speaking_duration}秒")
            logger.info(f"  無音タイムアウト: {self.silence_timeout}秒")
            
            # ストリーム開始
            self.stream.start_stream()
            self.is_running = True
            
            # 高速解析ループ
            while self.is_running:
                try:
                    # ノンブロッキング音声データ読み取り
                    if self.stream.get_read_available() >= self.chunk_size:
                        audio_data = self.stream.read(self.chunk_size, exception_on_overflow=False)
                        
                        # データの妥当性チェック
                        if len(audio_data) == 0:
                            continue
                        
                        # 解析実行
                        result = self.analyze_audio_chunk(audio_data)
                        
                        # デバッグ情報（予測検出時のみ表示）
                        if result.get('predictive_detected', False):
                            logger.debug(f"🚀 予測検出: 音量={result['volume']:.3f}, 傾向={result['volume_trend']:.3f}")
                        elif result['is_sound_detected'] and result['avg_volume'] > 0:
                            logger.debug(f"音量: {result['avg_volume']:.3f}, 話中: {result['is_speaking']}")
                    else:
                        # 利用可能なデータがない場合は短時間待機
                        time.sleep(0.001)  # 1ms待機
                    
                except OSError as e:
                    # 音声デバイス関連のエラー
                    logger.error(f"音声デバイスエラー: {e}")
                    break
                except Exception as e:
                    logger.debug(f"音声解析エラー: {e}")
                    time.sleep(0.1)
                    
        except Exception as e:
            logger.error(f"音声監視開始エラー: {e}")
        finally:
            self.stop_monitoring()
    
    def stop_monitoring(self):
        """音声監視を停止"""
        self.is_running = False
        
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
            self.stream = None
            
        logger.info("🔇 音声監視停止")
    
    def start_in_thread(self):
        """別スレッドで音声監視を開始"""
        if self.analysis_thread and self.analysis_thread.is_alive():
            logger.warning("音声監視は既に実行中です")
            return
            
        self.analysis_thread = threading.Thread(target=self.start_monitoring, daemon=True)
        self.analysis_thread.start()
    
    def cleanup(self):
        """リソースのクリーンアップ"""
        self.stop_monitoring()
        if self.audio:
            self.audio.terminate()

class TalkingModeController:
    """おしゃべりモード制御クラス"""
    
    def __init__(self, server_url="http://localhost:8080"):
        self.server_url = server_url
        self.is_talking_mode_active = False
        self.last_request_time = 0
        self.request_cooldown = 0.05  # リクエスト間隔制限をさらに短縮 (秒)
        # セッション再利用で高速化
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
    
    def set_talking_mode(self, enabled):
        """おしゃべりモードを設定（超高速版）"""
        current_time = time.time()
        
        # より緩いリクエスト頻度制限
        if current_time - self.last_request_time < self.request_cooldown:
            return
        
        if self.is_talking_mode_active == enabled:
            return  # 状態が同じ場合は何もしない
        
        try:
            # セッション再利用で高速化、タイムアウトを短縮
            response = self.session.post(
                f"{self.server_url}/talking_mouth_mode",
                json={'talking_mouth_mode': enabled},
                timeout=1  # タイムアウトを1秒に短縮
            )
            
            if response.status_code == 200:
                self.is_talking_mode_active = enabled
                self.last_request_time = current_time
                mode_str = "有効" if enabled else "無効"
                logger.info(f"💬 おしゃべりモードを{mode_str}に設定")
            else:
                logger.warning(f"おしゃべりモード設定失敗: HTTP {response.status_code}")
                
        except requests.exceptions.RequestException as e:
            logger.error(f"サーバー通信エラー: {e}")
    
    def start_talking(self):
        """おしゃべり開始"""
        self.set_talking_mode(True)
    
    def stop_talking(self):
        """おしゃべり停止"""
        self.set_talking_mode(False)

class LipSyncMonitor:
    """リップシンク監視メインクラス"""
    
    def __init__(self, 
                 server_url="http://localhost:8080",
                 threshold=0.005,  # より低い閾値
                 min_speaking_duration=0.1,  # より短い最小話し続け時間
                 silence_timeout=0.3):  # より短い無音タイムアウト
        """
        初期化
        
        Args:
            server_url: HTTPサーバーのURL
            threshold: 音声検出の閾値
            min_speaking_duration: 最小話し続け時間 (秒)
            silence_timeout: 無音状態でのタイムアウト (秒)
        """
        self.server_url = server_url
        
        # 音声解析器を初期化
        self.audio_analyzer = AudioAnalyzer(
            threshold=threshold,
            min_speaking_duration=min_speaking_duration,
            silence_timeout=silence_timeout
        )
        
        # おしゃべりモード制御器を初期化
        self.talking_controller = TalkingModeController(server_url)
        
        # コールバック設定
        self.audio_analyzer.set_callbacks(
            on_speaking_start=self.talking_controller.start_talking,
            on_speaking_stop=self.talking_controller.stop_talking
        )
        
        self.is_running = False
    
    def start(self):
        """監視開始"""
        logger.info("🚀 リップシンク監視を開始します")
        logger.info(f"📡 サーバーURL: {self.server_url}")
        
        # サーバー接続テスト
        if not self.test_server_connection():
            logger.error("❌ サーバーに接続できません。先にmain.pyを起動してください。")
            return False
        
        self.is_running = True
        
        try:
            # 音声監視を開始
            self.audio_analyzer.start_in_thread()
            
            # メインループ（手動制御用）
            self.run_control_loop()
            
        except KeyboardInterrupt:
            logger.info("\n🛑 ユーザーによる停止要求")
        except Exception as e:
            logger.error(f"❌ 予期しないエラー: {e}")
        finally:
            self.stop()
        
        return True
    
    def test_server_connection(self):
        """サーバー接続テスト"""
        try:
            response = requests.get(f"{self.server_url}/status", timeout=3)
            return response.status_code == 200
        except:
            return False
    
    def run_control_loop(self):
        """制御ループ（手動制御用）"""
        logger.info("\n📖 手動制御コマンド:")
        logger.info("  T + Enter: 閾値調整モード")
        logger.info("  S + Enter: 現在の状態表示")
        logger.info("  R + Enter: 設定リセット")
        logger.info("  Q + Enter: 終了")
        logger.info("  H + Enter: ヘルプ表示")
        logger.info("")
        
        while self.is_running:
            try:
                command = input().strip().upper()
                
                if command == 'T':
                    self.threshold_adjustment_mode()
                elif command == 'S':
                    self.show_status()
                elif command == 'R':
                    self.reset_settings()
                elif command == 'Q':
                    break
                elif command == 'H' or command == 'HELP':
                    self.show_help()
                else:
                    logger.info("❓ 不明なコマンド。'H' でヘルプを表示")
                    
            except (EOFError, KeyboardInterrupt):
                break
            except Exception as e:
                logger.error(f"❌ 制御ループエラー: {e}")
    
    def threshold_adjustment_mode(self):
        """閾値調整モード"""
        logger.info("🎚️  閾値調整モード開始 (Enterで終了)")
        logger.info("現在の音量レベルをリアルタイム表示します")
        
        start_time = time.time()
        
        while True:
            try:
                # 現在の音量を表示
                if hasattr(self.audio_analyzer, 'volume_history') and self.audio_analyzer.volume_history:
                    current_volume = self.audio_analyzer.volume_history[-1]
                    avg_volume = sum(self.audio_analyzer.volume_history) / len(self.audio_analyzer.volume_history)
                    
                    # バーグラフ表示
                    bar_length = 50
                    filled_length = int(bar_length * avg_volume)
                    bar = '█' * filled_length + '░' * (bar_length - filled_length)
                    
                    status = "🎤 話中" if self.audio_analyzer.is_speaking else "🔇 無音"
                    threshold_marker = int(bar_length * self.audio_analyzer.threshold)
                    
                    print(f"\r音量: {bar} {avg_volume:.3f} (閾値: {self.audio_analyzer.threshold:.3f}) {status}", end='')
                    
                # Enterキーチェック
                import select
                import sys
                if sys.stdin in select.select([sys.stdin], [], [], 0):
                    input()  # Enterキーで終了
                    break
                    
                time.sleep(0.1)
                
            except KeyboardInterrupt:
                break
        
        print()  # 改行
        logger.info("🎚️  閾値調整モード終了")
    
    def show_status(self):
        """現在の状態表示"""
        logger.info("📊 現在の状態:")
        logger.info(f"  音声監視: {'実行中' if self.is_running else '停止中'}")
        logger.info(f"  おしゃべりモード: {'有効' if self.talking_controller.is_talking_mode_active else '無効'}")
        logger.info(f"  話中状態: {'話中' if self.audio_analyzer.is_speaking else '無音'}")
        logger.info(f"  設定閾値: {self.audio_analyzer.threshold:.3f}")
        logger.info(f"  適応的閾値: {self.audio_analyzer.adaptive_threshold:.3f}")
        logger.info(f"  ノイズレベル: {self.audio_analyzer.noise_level:.3f}")
        logger.info(f"  最小話し続け時間: {self.audio_analyzer.min_speaking_duration}秒")
        logger.info(f"  無音タイムアウト: {self.audio_analyzer.silence_timeout}秒")
        
        if self.audio_analyzer.volume_history:
            current_volume = self.audio_analyzer.volume_history[-1]
            avg_volume = sum(self.audio_analyzer.volume_history) / len(self.audio_analyzer.volume_history)
            logger.info(f"  現在の音量: {current_volume:.3f}")
            logger.info(f"  平均音量: {avg_volume:.3f}")
    
    def reset_settings(self):
        """設定リセット"""
        self.talking_controller.stop_talking()
        logger.info("🔄 設定をリセットしました")
    
    def show_help(self):
        """ヘルプ表示"""
        logger.info("📖 利用可能なコマンド:")
        logger.info("  T: 閾値調整モード (音量レベルをリアルタイム表示)")
        logger.info("  S: 現在の状態表示")
        logger.info("  R: 設定リセット (おしゃべりモード停止)")
        logger.info("  H: ヘルプ表示")
        logger.info("  Q: 終了")
    
    def stop(self):
        """監視停止"""
        logger.info("🛑 リップシンク監視を停止しています...")
        self.is_running = False
        
        # おしゃべりモードを停止
        self.talking_controller.stop_talking()
        
        # 音声解析を停止
        self.audio_analyzer.cleanup()
        
        logger.info("✅ リップシンク監視が停止しました")

def main():
    """メイン関数"""
    # コマンドライン引数の処理
    import argparse
    
    parser = argparse.ArgumentParser(description='音声リップシンク監視システム')
    parser.add_argument('--server', default='http://localhost:8080', 
                       help='HTTPサーバーのURL (デフォルト: http://localhost:8080)')
    parser.add_argument('--threshold', type=float, default=0.003,
                       help='音声検出の閾値 (デフォルト: 0.003)')
    parser.add_argument('--min-duration', type=float, default=0.01,
                       help='最小話し続け時間 (秒, デフォルト: 0.01)')
    parser.add_argument('--silence-timeout', type=float, default=0.03,
                       help='無音状態でのタイムアウト (秒, デフォルト: 0.03)')
    
    args = parser.parse_args()
    
    # リップシンク監視を開始
    monitor = LipSyncMonitor(
        server_url=args.server,
        threshold=args.threshold,
        min_speaking_duration=args.min_duration,
        silence_timeout=args.silence_timeout
    )
    
    monitor.start()

if __name__ == "__main__":
    main()
