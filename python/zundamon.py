#!/usr/bin/env python3
"""
ずんだもん音声合成 + リップシンク同期システム
セリフを音声合成で再生し、再生時間に合わせて自動的にリップシンクを制御
"""

import asyncio
import threading
import time
import requests
import json
import logging
from typing import Optional, Dict, Any
import subprocess
import os
import tempfile
from pathlib import Path

# ログ設定
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class TalkingModeController:
    """おしゃべりモード制御クラス"""
    
    def __init__(self, server_url="http://localhost:8080"):
        self.server_url = server_url
        self.is_talking_mode_active = False
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
    
    def set_talking_mode(self, enabled: bool) -> bool:
        """おしゃべりモードを設定"""
        if self.is_talking_mode_active == enabled:
            logger.info(f"🎭 おしゃべりモード: 既に{'有効' if enabled else '無効'}です")
            return True  # 状態が同じ場合は何もしない
        
        try:
            logger.info(f"🎭 おしゃべりモード切り替え: {'有効' if enabled else '無効'}に変更中...")
            response = self.session.post(
                f"{self.server_url}/talking_mouth_mode",
                json={'talking_mouth_mode': enabled},
                timeout=3
            )
            
            if response.status_code == 200:
                self.is_talking_mode_active = enabled
                status = "有効" if enabled else "無効"
                logger.info(f"✅ おしゃべりモード: {status}")
                return True
            else:
                logger.error(f"❌ HTTP エラー: {response.status_code}, レスポンス: {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"❌ おしゃべりモード設定エラー: {e}")
            return False

class VoiceSynthesizer:
    """音声合成クラス（複数のエンジンに対応）"""
    
    def __init__(self, engine="voicevox"):
        self.engine = engine
        self.voicevox_url = "http://localhost:50021"  # VOICEVOX API
        
    def synthesize_voicevox(self, text: str, speaker_id: int = 3) -> Optional[bytes]:
        """VOICEVOX で音声合成"""
        try:
            # 音声クエリ作成
            query_response = requests.post(
                f"{self.voicevox_url}/audio_query",
                params={"text": text, "speaker": speaker_id},
                timeout=10
            )
            
            if query_response.status_code != 200:
                logger.error(f"音声クエリ作成失敗: {query_response.status_code}")
                return None
            
            # 音声合成
            synthesis_response = requests.post(
                f"{self.voicevox_url}/synthesis",
                params={"speaker": speaker_id},
                headers={"Content-Type": "application/json"},
                data=query_response.content,
                timeout=10
            )
            
            if synthesis_response.status_code == 200:
                return synthesis_response.content
            else:
                logger.error(f"音声合成失敗: {synthesis_response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"VOICEVOX 音声合成エラー: {e}")
            return None
    
    def synthesize_say(self, text: str, voice: str = "Kyoko") -> bool:
        """macOS の say コマンドで音声合成"""
        try:
            # say コマンドを使用（バックグラウンド実行）
            process = subprocess.Popen(
                ["say", "-v", voice, text],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            return process
        except Exception as e:
            logger.error(f"say コマンドエラー: {e}")
            return None
    
    def estimate_duration(self, text: str, speech_rate: float = 3.5) -> float:
        """テキストから推定発話時間を計算（秒）- より正確な計算"""
        # 日本語の場合：文字数 × 0.28秒程度（より正確）
        char_count = len(text)
        estimated_duration = char_count / speech_rate
        
        # 最小時間の設定
        min_duration = 0.5
        return max(estimated_duration, min_duration)

class AudioPlayer:
    """音声再生クラス"""
    
    def __init__(self):
        self.is_playing = False
        self.current_process = None  # 現在の音声再生プロセス
    
    def stop_audio(self):
        """現在の音声再生を停止"""
        try:
            stopped = False
            
            # 1. 現在のプロセスを停止
            if self.current_process and self.current_process.poll() is None:
                logger.info("🛑 音声再生を中断中...")
                self.current_process.terminate()
                
                # 少し待ってからkillする（必要に応じて）
                try:
                    self.current_process.wait(timeout=0.2)
                    stopped = True
                except subprocess.TimeoutExpired:
                    logger.info("🔨 強制終了中...")
                    self.current_process.kill()
                    try:
                        self.current_process.wait(timeout=0.2)
                        stopped = True
                    except subprocess.TimeoutExpired:
                        logger.warning("⚠️ プロセス強制終了に失敗")
            
            # 2. 全ての音声関連プロセスを強制停止（複数回実行）
            for attempt in range(3):  # 3回試行
                try:
                    # より強力な停止（SIGKILLを使用）
                    subprocess.run(["pkill", "-9", "-f", "say"], timeout=1, capture_output=True)
                    subprocess.run(["pkill", "-9", "-f", "afplay"], timeout=1, capture_output=True)
                    # killallも併用
                    subprocess.run(["killall", "-9", "say"], timeout=1, capture_output=True)
                    subprocess.run(["killall", "-9", "afplay"], timeout=1, capture_output=True)
                    
                    # 短い待機
                    import time
                    time.sleep(0.1)
                    
                    # プロセスが残っているかチェック
                    result = subprocess.run(["pgrep", "-f", "say"], capture_output=True)
                    if result.returncode != 0:  # プロセスが見つからない = 成功
                        logger.info(f"🧹 音声プロセス強制クリア (試行 {attempt + 1})")
                        break
                except Exception:
                    pass
            
            # 3. 追加で少し待機（音声ハードウェアのクリア）
            import time
            time.sleep(0.2)
            
            if stopped or self.current_process is None:
                logger.info("✅ 音声再生を中断しました")
                
            self.is_playing = False
            self.current_process = None
            return True
            
        except Exception as e:
            logger.error(f"音声停止エラー: {e}")
            self.is_playing = False
            self.current_process = None
            return False
    
    def play_audio_data(self, audio_data: bytes, file_format: str = "wav") -> float:
        """音声データを再生し、再生時間を返す"""
        try:
            # 一時ファイルに保存
            with tempfile.NamedTemporaryFile(suffix=f".{file_format}", delete=False) as temp_file:
                temp_file.write(audio_data)
                temp_path = temp_file.name
            
            # 音声ファイルの長さを取得
            duration = self._get_audio_duration(temp_path)
            
            # 音声再生
            self.is_playing = True
            if os.system(f"afplay '{temp_path}' &") == 0:
                logger.info(f"🔊 音声再生開始 (推定時間: {duration:.2f}秒)")
                return duration
            else:
                logger.error("音声再生失敗")
                return 0.0
                
        except Exception as e:
            logger.error(f"音声再生エラー: {e}")
            return 0.0
        finally:
            # 一時ファイルを削除
            try:
                os.unlink(temp_path)
            except:
                pass
    
    def play_say_command(self, text: str, voice: str = "Kyoko") -> float:
        """say コマンドで音声再生（改良版 - 音声途切れ対策 + 中断対応）"""
        try:
            # 推定再生時間を計算
            estimated_duration = len(text) / 4  # 2文字/秒（保守的）
            min_duration = max(estimated_duration, 1.5)  # 最低2秒
            
            # 複数の音声オプションを試す
            voice_options = [
                voice,  # 指定された音声
                "Kyoko",  # デフォルト
                "Eddy (日本語（日本）)",  # 代替1
                "Reed (日本語（日本）)",   # 代替2
            ]
            
            for attempt, current_voice in enumerate(voice_options):
                try:
                    logger.info(f"🔊 音声再生試行 {attempt + 1}: '{current_voice}'")
                    
                    # say コマンドの実行方法を改良
                    start_time = time.time()
                    
                    # より安定した実行方法：Popenを使用して完了を待機
                    self.current_process = subprocess.Popen(
                        ["say", "-v", current_voice, text],  # -rパラメータを削除（問題の原因の可能性）
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.PIPE,
                        text=True
                    )
                    
                    # プロセスの完了を待機（タイムアウト付き）
                    try:
                        stdout, stderr = self.current_process.communicate(timeout=max(min_duration * 2, 15))
                        actual_duration = time.time() - start_time
                        
                        if self.current_process.returncode == 0:
                            logger.info(f"✅ 音声再生成功 (時間: {actual_duration:.2f}秒, 推定: {min_duration:.2f}秒")
                            self.is_playing = False
                            self.current_process = None
                            return actual_duration
                        else:
                            logger.warning(f"⚠️ 音声 '{current_voice}' で失敗: return code {self.current_process.returncode}")
                            if stderr:
                                logger.warning(f"エラー詳細: {stderr}")
                            continue  # 次の音声を試す
                            
                    except subprocess.TimeoutExpired:
                        logger.warning(f"⚠️ 音声 '{current_voice}' でタイムアウト")
                        self.current_process.kill()
                        continue  # 次の音声を試す
                        
                except Exception as e:
                    logger.warning(f"⚠️ 音声 '{current_voice}' で例外: {e}")
                    continue  # 次の音声を試す
            
            # すべての音声で失敗した場合、ファイル経由を試す
            logger.warning("直接再生に失敗、音声ファイル経由を試行")
            file_duration = self.play_say_command_with_file(text, voice)
            if file_duration > 0:
                self.is_playing = False
                self.current_process = None
                return file_duration
            
            logger.error("❌ すべての音声再生方法で失敗しました")
            self.is_playing = False
            self.current_process = None
            return 0.0
            
        except Exception as e:
            logger.error(f"❌ 音声再生エラー: {e}")
            self.is_playing = False
            self.current_process = None
            return 0.0
            
    def play_say_command_with_file(self, text: str, voice: str = "Kyoko") -> float:
        """音声ファイル経由での再生（途切れ対策の代替手段）"""
        try:
            import tempfile
            import os
            
            # 一時音声ファイルを作成
            with tempfile.NamedTemporaryFile(suffix=".aiff", delete=False) as temp_file:
                temp_path = temp_file.name
            
            # 音声ファイルを生成
            start_time = time.time()
            generate_process = subprocess.Popen(
                ["say", "-v", voice, "-o", temp_path, text],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # プロセスを保存して中断可能にする
            self.current_process = generate_process
            
            try:
                stdout, stderr = generate_process.communicate(timeout=10)
                if generate_process.returncode != 0:
                    logger.error(f"音声ファイル生成失敗: {stderr}")
                    return 0.0
            except subprocess.TimeoutExpired:
                generate_process.kill()
                logger.error("音声ファイル生成タイムアウト")
                return 0.0
            
            # 音声ファイルを再生
            play_process = subprocess.Popen(
                ["afplay", temp_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # 再生プロセスを保存
            self.current_process = play_process
            
            try:
                stdout, stderr = play_process.communicate(timeout=15)
                actual_duration = time.time() - start_time
                
                if play_process.returncode == 0:
                    logger.info(f"✅ 音声ファイル経由で再生成功 (時間: {actual_duration:.2f}秒)")
                    self.current_process = None
                    return actual_duration
                else:
                    logger.error(f"音声ファイル再生失敗: {stderr}")
                    self.current_process = None
                    return 0.0
            except subprocess.TimeoutExpired:
                play_process.kill()
                logger.error("音声ファイル再生タイムアウト")
                self.current_process = None
                return 0.0
            
            # 一時ファイルを削除
            try:
                os.unlink(temp_path)
            except:
                pass
                
        except Exception as e:
            logger.error(f"音声ファイル再生エラー: {e}")
            self.current_process = None
            return 0.0
    
    def _get_audio_duration(self, file_path: str) -> float:
        """音声ファイルの長さを取得"""
        try:
            # ffprobe を使って音声の長さを取得
            result = subprocess.run(
                ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", 
                 "-of", "csv=p=0", file_path],
                capture_output=True, text=True, timeout=5
            )
            
            if result.returncode == 0:
                return float(result.stdout.strip())
            else:
                # fallback: 推定計算
                return 2.0
                
        except Exception:
            # ffprobe が使えない場合は推定値を返す
            return 2.0

class ZundamonSpeaker:
    """ずんだもん発話システム"""
    
    def __init__(self, server_url="http://localhost:8080"):
        self.talking_controller = TalkingModeController(server_url)
        self.audio_player = AudioPlayer()
        self.is_speaking = False  # 発話中フラグ
        self.current_audio_thread = None  # 現在の音声再生スレッド
        self._speech_lock = threading.Lock()  # 発話制御用ロック
        
        # 音声設定（日本語対応音声を優先的に試す）
        self.voice_candidates = ["Kyoko", "Eddy (日本語（日本）)", "Reed (日本語（日本）)", "Flo (日本語（日本）)"]
        self.voice_name = "Eddy (日本語（日本）)"  # 初期値
        
        logger.info(f"🎤 選択された音声: {self.voice_name}")
    
    def stop_speaking(self):
        """現在の発話を停止"""
        with self._speech_lock:  # ロックを取得して排他制御
            try:
                if self.is_speaking:
                    logger.info("🛑 発話を中断中...")
                    
                    # 1. フラグを即座にオフ（新しい音声開始を防ぐ）
                    self.is_speaking = False
                    
                    # 2. 音声再生を停止
                    self.audio_player.stop_audio()
                    
                    # 3. おしゃべりモードを無効化
                    self.talking_controller.set_talking_mode(False)
                    
                    # 4. スレッドをクリア
                    self.current_audio_thread = None
                    
                    # 5. 少し待機してプロセスが確実に終了するまで待つ
                    import time
                    time.sleep(0.3)  # 300ms待機（より長めに）
                    
                    logger.info("✅ 発話を中断しました")
                    return True
                return True
            except Exception as e:
                logger.error(f"発話停止エラー: {e}")
                self.is_speaking = False
                return False
    
    def select_best_voice(self) -> str:
        """利用可能な最適な日本語音声を選択（改良版）"""
        try:
            # 利用可能な音声一覧を取得
            result = subprocess.run(
                ["say", "-v", "?"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                available_voices = result.stdout
                logger.info("📋 利用可能な日本語音声をテスト中...")
                
                # 各音声をテストして動作するものを選択
                for candidate in self.voice_candidates:
                    if candidate in available_voices:
                        # 簡単なテストを実行
                        if self.test_voice(candidate):
                            logger.info(f"✅ 音声 '{candidate}' を選択（テスト成功）")
                            return candidate
                        else:
                            logger.warning(f"⚠️ 音声 '{candidate}' はテストに失敗")
                
                # すべてのテストに失敗した場合はデフォルトを使用
                logger.warning("すべての音声テストに失敗、デフォルト音声 'Kyoko' を使用")
                return "Kyoko"
            else:
                logger.warning("音声一覧の取得に失敗、デフォルト音声を使用")
                return "Kyoko"
                
        except Exception as e:
            logger.warning(f"音声選択エラー: {e}, デフォルト音声を使用")
            return "Kyoko"
    
    def test_voice(self, voice: str) -> bool:
        """音声が正常に動作するかテスト"""
        try:
            # 短いテストフレーズで試す
            test_process = subprocess.run(
                ["say", "-v", voice, "テスト"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=3
            )
            return test_process.returncode == 0
        except:
            return False
    
    async def speak_async(self, text: str) -> bool:
        """非同期でセリフを発話（実時間同期版）"""
        
        # 発話処理全体をロックで保護
        if not self._speech_lock.acquire(blocking=False):
            logger.info("🛑 他の発話が進行中のため、この発話をスキップ")
            return False
        
        try:
            # 前の発話を停止（ロック内で実行）
            if self.is_speaking:
                logger.info("🛑 前の発話を中断して新しい発話を開始")
                self._force_stop_speaking()  # ロック内専用メソッド
            
            logger.info(f"📢 発話開始: '{text}' (音声: {self.voice_name})")
            
            self.is_speaking = True
            
            # 実際の音声再生時間を追跡するための共有変数
            audio_duration_result = {'duration': 0.0, 'completed': False}
            
            # 1. 音声再生を並行で開始（完了時間を記録）
            logger.info("🔊 音声再生開始...")
            
            # 音声再生を真に非同期で開始（実時間を返すバージョン）
            audio_thread = self._start_audio_playback_with_callback(text, audio_duration_result)
            self.current_audio_thread = audio_thread
            
            # 2. 少し待ってから口パクを開始（音声に合わせる）
            await asyncio.sleep(0.2)  # 音声開始から0.20秒後に口パク開始
            
            # 中断チェック
            if not self.is_speaking:
                logger.info("🛑 発話開始時に中断されました")
                return False
            
            # 3. おしゃべりモード有効化
            if not self.talking_controller.set_talking_mode(True):
                logger.error("おしゃべりモード有効化失敗")
                self.is_speaking = False
                return False
            
            logger.info("🎭 口パク開始")
            
            # 4. 音声再生の実際の完了を待機（実時間ベース）
            check_interval = 0.05  # 50msごとにチェック（より細かく）
            max_wait_time = 10.0   # 最大10秒でタイムアウト
            elapsed_time = 0.0
            
            # 音声再生の実際の完了を監視
            while elapsed_time < max_wait_time and self.is_speaking:
                await asyncio.sleep(check_interval)
                elapsed_time += check_interval
                
                # 音声再生が実際に完了したかチェック
                if audio_duration_result['completed']:
                    actual_duration = audio_duration_result['duration']
                    logger.info(f"✅ 音声再生実時間完了検出 (実時間: {actual_duration:.2f}秒)")
                    break
            
            # 5. 音声再生完了確認
            was_speaking = self.is_speaking
            if was_speaking and audio_duration_result['completed']:
                actual_duration = audio_duration_result['duration']
                logger.info(f"✅ 音声再生完了 (実時間: {actual_duration:.2f}秒)")
            elif was_speaking:
                logger.warning(f"⚠️ 音声再生タイムアウト (経過時間: {elapsed_time:.2f}秒)")
            
            # 6. おしゃべりモードをオフ
            self.talking_controller.set_talking_mode(False)
            self.is_speaking = False
            
            if was_speaking:
                logger.info("✅ 発話完了")
            else:
                logger.info("🛑 発話が中断されました")
            return True
            
        except Exception as e:
            logger.error(f"発話エラー: {e}")
            # エラーが発生した場合は必ずおしゃべりモードをオフ
            self.talking_controller.set_talking_mode(False)
            self.is_speaking = False
            return False
        finally:
            # 必ずロックを解放
            self._speech_lock.release()
    
    def _force_stop_speaking(self):
        """ロック内での強制停止（ロック再取得なし）"""
        try:
            if self.is_speaking:
                # 1. フラグを即座にオフ
                self.is_speaking = False
                
                # 2. 音声再生を停止
                self.audio_player.stop_audio()
                
                # 3. おしゃべりモードを無効化
                self.talking_controller.set_talking_mode(False)
                
                # 4. スレッドをクリア
                self.current_audio_thread = None
                
                # 5. 待機
                import time
                time.sleep(0.3)
                
        except Exception as e:
            logger.error(f"強制停止エラー: {e}")
            self.is_speaking = False
    
    def _start_audio_playback_with_callback(self, text: str, result_dict: dict):
        """音声再生を真に非同期で開始（実時間コールバック付き）"""
        import threading
        
        def play_audio():
            # 発話中断チェック
            if not self.is_speaking:
                logger.info("🛑 音声スレッド: 開始前に中断")
                result_dict['completed'] = True
                result_dict['duration'] = 0.0
                return
                
            self.audio_player.is_playing = True
            start_time = time.time()
            try:
                # 音声再生開始前にもう一度中断チェック
                if not self.is_speaking:
                    logger.info("🛑 音声スレッド: 再生開始前に中断")
                    result_dict['completed'] = True
                    result_dict['duration'] = 0.0
                    return
                
                # 音声再生実行
                duration = self.audio_player.play_say_command(text, self.voice_name)
                actual_time = time.time() - start_time
                
                # 結果を記録
                result_dict['duration'] = actual_time
                result_dict['completed'] = True
                
                # 中断されていない場合のみログ出力
                if self.is_speaking:
                    logger.info(f"🔊 実際の音声再生時間: {actual_time:.2f}秒 (関数戻り値: {duration:.2f}秒)")
                    # 実測値を学習データとして保存（将来の改善用）
                    self._record_speech_timing(text, actual_time)
                else:
                    logger.info("🛑 音声再生が中断されました")
                
            except Exception as e:
                if self.is_speaking:
                    logger.error(f"音声再生エラー: {e}")
                else:
                    logger.info("🛑 音声再生が中断されました（例外）")
                # エラーでも完了をマーク
                result_dict['completed'] = True
                result_dict['duration'] = time.time() - start_time
            finally:
                self.audio_player.is_playing = False
        
        # 別スレッドで音声再生を開始
        thread = threading.Thread(target=play_audio, daemon=True)
        thread.start()
        return thread
    
    def _record_speech_timing(self, text: str, actual_duration: float):
        """音声再生時間の実測値を記録（学習用）"""
        char_count = len(text)
        if char_count > 0:
            chars_per_second = char_count / actual_duration
            logger.debug(f"📊 学習データ: '{text}' → {chars_per_second:.2f}文字/秒")
    
    def _estimate_speech_duration(self, text: str) -> float:
        """発話時間を推定（より正確な計算）"""
        char_count = len(text)
        
        # 日本語の音声合成における実測値ベースの計算
        # 基本速度：約5文字/秒（macOS say コマンド実測値）
        base_duration = char_count / 5.0
        
        # 句読点や感嘆符による一時停止を考慮
        punctuation_count = text.count('。') + text.count('！') + text.count('？') + text.count('、')
        pause_time = punctuation_count * 0.2  # 句読点あたり0.2秒の停止
        
        # 計算結果
        estimated_duration = base_duration + pause_time
        
        # 最小0.8秒、最大8秒に制限（より現実的な範囲）
        final_duration = max(0.8, min(estimated_duration, 8.0))
        
        logger.info(f"🎯 推定時間計算: '{text}' ({char_count}文字) → {final_duration:.2f}秒")
        return final_duration
    
    def speak_sync(self, text: str) -> bool:
        """同期的にセリフを発話"""
        return asyncio.run(self.speak_async(text))
    
    async def speak_multiple_async(self, texts: list, interval: float = 1.0):
        """複数のセリフを順次発話"""
        for i, text in enumerate(texts):
            logger.info(f"🎭 セリフ {i+1}/{len(texts)}")
            await self.speak_async(text)
            
            # 最後のセリフでなければ間隔を空ける
            if i < len(texts) - 1:
                logger.info(f"⏸️  間隔: {interval}秒")
                await asyncio.sleep(interval)

class ZundamonConsole:
    """ずんだもんコンソール操作"""
    
    def __init__(self, server_url="http://localhost:8080"):
        self.speaker = ZundamonSpeaker(server_url)
        self.is_running = False
    
    def show_help(self):
        """ヘルプ表示"""
        logger.info("🤖 ずんだもん音声合成システム")
        logger.info("利用可能なコマンド:")
        logger.info("  1: '今日もお疲れ様なのだ！'")
        logger.info("  2: 'ずんだもんだよ〜'")
        logger.info("  3: 'おはようございます！'")
        logger.info("  4: 'お疲れ様でした！'")
        logger.info("  5: 'また明日ね〜'")
        logger.info("  C: カスタムテキスト入力")
        logger.info("  D: デモ（複数セリフ連続再生）")
        logger.info("  V: 音声テスト（say コマンド直接実行）")
        logger.info("  S: 状態表示")
        logger.info("  I: 発話中断")
        logger.info("  H: ヘルプ表示")
        logger.info("  Q: 終了")
    
    def test_voice_command(self):
        """音声コマンドのテスト"""
        test_text = "これは音声テストです。"
        logger.info(f"🔧 音声コマンドテスト: '{test_text}'")
        logger.info(f"使用音声: {self.speaker.voice_name}")
        
        try:
            # 直接 say コマンドを実行してテスト
            result = subprocess.run(
                ["say", "-v", self.speaker.voice_name, "-r", "180", test_text],
                timeout=10,
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                logger.info("✅ 音声コマンドテスト成功")
            else:
                logger.error(f"❌ 音声コマンドテストエラー: return code {result.returncode}")
                if result.stderr:
                    logger.error(f"エラー詳細: {result.stderr}")
        except Exception as e:
            logger.error(f"音声テストエラー: {e}")
    
    def show_status(self):
        """状態表示"""
        logger.info("📊 現在の状態:")
        logger.info(f"  おしゃべりモード: {'有効' if self.speaker.talking_controller.is_talking_mode_active else '無効'}")
        logger.info(f"  音声再生中: {'はい' if self.speaker.audio_player.is_playing else 'いいえ'}")
        logger.info(f"  発話中: {'はい' if self.speaker.is_speaking else 'いいえ'}")
        logger.info(f"  音声: {self.speaker.voice_name}")
    
    def interrupt_current_speech(self):
        """現在の発話を中断"""
        if self.speaker.is_speaking:
            logger.info("🛑 現在の発話を中断します...")
            self.speaker.stop_speaking()
        else:
            logger.info("現在発話していません")
    
    async def demo_mode(self):
        """デモモード"""
        demo_texts = [
            "今日もお疲れ様なのだ！",
            "ずんだもんだよ〜",
            "みんなで一緒に頑張るのだ！",
            "また明日ね〜"
        ]
        
        logger.info("🎭 デモモード開始")
        await self.speaker.speak_multiple_async(demo_texts, interval=1.5)
        logger.info("🎭 デモモード終了")
    
    def start(self):
        """コンソール開始"""
        import threading
        
        self.is_running = True
        logger.info("🤖 ずんだもん音声合成システム起動")
        self.show_help()
        
        try:
            while self.is_running:
                try:
                    command = input("\n> ").strip().upper()
                    
                    if command == "1":
                        # 非ブロッキングで発話開始
                        threading.Thread(target=lambda: self.speaker.speak_sync("今日もお疲れ様なのだ！"), daemon=True).start()
                    elif command == "2":
                        threading.Thread(target=lambda: self.speaker.speak_sync("ずんだもんだよ〜"), daemon=True).start()
                    elif command == "3":
                        threading.Thread(target=lambda: self.speaker.speak_sync("おはようございます！"), daemon=True).start()
                    elif command == "4":
                        threading.Thread(target=lambda: self.speaker.speak_sync("お疲れ様でした！"), daemon=True).start()
                    elif command == "5":
                        threading.Thread(target=lambda: self.speaker.speak_sync("また明日ね〜"), daemon=True).start()
                    elif command == "C":
                        custom_text = input("発話させたいテキストを入力してください: ").strip()
                        if custom_text:
                            threading.Thread(target=lambda: self.speaker.speak_sync(custom_text), daemon=True).start()
                        else:
                            logger.warning("テキストが入力されませんでした")
                    elif command == "D":
                        threading.Thread(target=lambda: asyncio.run(self.demo_mode()), daemon=True).start()
                    elif command == "V":
                        self.test_voice_command()
                    elif command == "S":
                        self.show_status()
                    elif command == "I":
                        self.interrupt_current_speech()
                    elif command == "H":
                        self.show_help()
                    elif command == "Q":
                        self.is_running = False
                        logger.info("👋 システム終了")
                    else:
                        logger.warning("無効なコマンドです。'H'でヘルプを表示")
                        
                except KeyboardInterrupt:
                    self.is_running = False
                    logger.info("\n👋 システム終了")
                except Exception as e:
                    logger.error(f"コマンド実行エラー: {e}")
                    
        finally:
            # 終了時におしゃべりモードを確実にオフ
            self.speaker.stop_speaking()
            self.speaker.talking_controller.set_talking_mode(False)

def main():
    """メイン関数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='ずんだもん音声合成 + リップシンク同期システム')
    parser.add_argument('--server', default='http://localhost:8080',
                       help='HTTPサーバーのURL (デフォルト: http://localhost:8080)')
    parser.add_argument('--text', type=str,
                       help='発話させるテキスト（指定した場合はコンソールモードをスキップ）')
    
    args = parser.parse_args()
    
    if args.text:
        # テキスト指定がある場合は一回だけ発話
        speaker = ZundamonSpeaker(args.server)
        speaker.speak_sync(args.text)
    else:
        # コンソールモード
        console = ZundamonConsole(args.server)
        console.start()

if __name__ == "__main__":
    main()
