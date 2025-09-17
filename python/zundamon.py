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
        """say コマンドで音声再生（改良版 - 音声途切れ対策）"""
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
                    process = subprocess.Popen(
                        ["say", "-v", current_voice, text],  # -rパラメータを削除（問題の原因の可能性）
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.PIPE,
                        text=True
                    )
                    
                    # プロセスの完了を待機（タイムアウト付き）
                    try:
                        stdout, stderr = process.communicate(timeout=max(min_duration * 2, 15))
                        actual_duration = time.time() - start_time
                        
                        if process.returncode == 0:
                            logger.info(f"✅ 音声再生成功 (時間: {actual_duration:.2f}秒, 推定: {min_duration:.2f}秒")
                            self.is_playing = False
                            return actual_duration
                        else:
                            logger.warning(f"⚠️ 音声 '{current_voice}' で失敗: return code {process.returncode}")
                            if stderr:
                                logger.warning(f"エラー詳細: {stderr}")
                            continue  # 次の音声を試す
                            
                    except subprocess.TimeoutExpired:
                        logger.warning(f"⚠️ 音声 '{current_voice}' でタイムアウト")
                        process.kill()
                        continue  # 次の音声を試す
                        
                except Exception as e:
                    logger.warning(f"⚠️ 音声 '{current_voice}' で例外: {e}")
                    continue  # 次の音声を試す
            
            # すべての音声で失敗した場合、ファイル経由を試す
            logger.warning("直接再生に失敗、音声ファイル経由を試行")
            file_duration = self.play_say_command_with_file(text, voice)
            if file_duration > 0:
                self.is_playing = False
                return file_duration
            
            logger.error("❌ すべての音声再生方法で失敗しました")
            self.is_playing = False
            return 0.0
            
        except Exception as e:
            logger.error(f"❌ 音声再生エラー: {e}")
            self.is_playing = False
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
            generate_result = subprocess.run(
                ["say", "-v", voice, "-o", temp_path, text],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=10,
                text=True
            )
            
            if generate_result.returncode != 0:
                logger.error(f"音声ファイル生成失敗: {generate_result.stderr}")
                return 0.0
            
            # 音声ファイルを再生
            play_result = subprocess.run(
                ["afplay", temp_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=15,
                text=True
            )
            
            actual_duration = time.time() - start_time
            
            # 一時ファイルを削除
            try:
                os.unlink(temp_path)
            except:
                pass
            
            if play_result.returncode == 0:
                logger.info(f"✅ 音声ファイル経由で再生成功 (時間: {actual_duration:.2f}秒)")
                return actual_duration
            else:
                logger.error(f"音声ファイル再生失敗: {play_result.stderr}")
                return 0.0
                
        except Exception as e:
            logger.error(f"音声ファイル再生エラー: {e}")
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
        
        # 音声設定（日本語対応音声を優先的に試す）
        self.voice_candidates = ["Kyoko", "Eddy (日本語（日本）)", "Reed (日本語（日本）)", "Flo (日本語（日本）)"]
        self.voice_name = "Eddy (日本語（日本）)"  # 初期値
        
        logger.info(f"🎤 選択された音声: {self.voice_name}")
    
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
        """非同期でセリフを発話（改良版 - 口パクと音声の同期）"""
        logger.info(f"📢 発話開始: '{text}' (音声: {self.voice_name})")
        
        try:
            # 1. 音声再生を並行で開始（完了を待たない）
            logger.info("🔊 音声再生開始...")
            
            # 音声再生を真に非同期で開始
            audio_process = self._start_audio_playback(text)
            
            # 2. 少し待ってから口パクを開始（音声に合わせる）
            await asyncio.sleep(0.5)  # 音声開始から0.35秒後に口パク開始
            
            # 3. おしゃべりモード有効化
            if not self.talking_controller.set_talking_mode(True):
                logger.error("おしゃべりモード有効化失敗")
                return False
            
            logger.info("🎭 口パク開始")
            
            # 4. 音声再生の完了を待機（推定時間ベース）
            estimated_duration = self._estimate_speech_duration(text)
            
            # 音声再生時間だけ待機
            await asyncio.sleep(estimated_duration)
            
            # 5. 再生完了の確認
            logger.info(f"✅ 音声再生完了 (推定時間: {estimated_duration:.2f}秒)")
            
            # 6. おしゃべりモードをオフ
            self.talking_controller.set_talking_mode(False)
            
            logger.info("✅ 発話完了")
            return True
            
        except Exception as e:
            logger.error(f"発話エラー: {e}")
            # エラーが発生した場合は必ずおしゃべりモードをオフ
            self.talking_controller.set_talking_mode(False)
            return False
    
    def _start_audio_playback(self, text: str):
        """音声再生を真に非同期で開始"""
        import threading
        
        def play_audio():
            self.audio_player.is_playing = True
            start_time = time.time()
            try:
                duration = self.audio_player.play_say_command(text, self.voice_name)
                actual_time = time.time() - start_time
                logger.info(f"🔊 実際の音声再生時間: {actual_time:.2f}秒 (関数戻り値: {duration:.2f}秒)")
                
                # 実測値を学習データとして保存（将来の改善用）
                self._record_speech_timing(text, actual_time)
                
            except Exception as e:
                logger.error(f"音声再生エラー: {e}")
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
        logger.info(f"  音声: {self.speaker.voice_name}")
    
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
        self.is_running = True
        logger.info("🤖 ずんだもん音声合成システム起動")
        self.show_help()
        
        try:
            while self.is_running:
                try:
                    command = input("\n> ").strip().upper()
                    
                    if command == "1":
                        self.speaker.speak_sync("今日もお疲れ様なのだ！")
                    elif command == "2":
                        self.speaker.speak_sync("ずんだもんだよ〜")
                    elif command == "3":
                        self.speaker.speak_sync("おはようございます！")
                    elif command == "4":
                        self.speaker.speak_sync("お疲れ様でした！")
                    elif command == "5":
                        self.speaker.speak_sync("また明日ね〜")
                    elif command == "C":
                        custom_text = input("発話させたいテキストを入力してください: ").strip()
                        if custom_text:
                            self.speaker.speak_sync(custom_text)
                        else:
                            logger.warning("テキストが入力されませんでした")
                    elif command == "D":
                        asyncio.run(self.demo_mode())
                    elif command == "V":
                        self.test_voice_command()
                    elif command == "S":
                        self.show_status()
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
