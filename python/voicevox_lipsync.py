#!/usr/bin/env python3
"""
VOICEVOX + リップシンク同期システム
VOICEVOXで音声合成を行い、再生時間に合わせて自動的にリップシンクを制御
"""

import asyncio
import threading
import time
import requests
import json
import logging
import tempfile
import os
import io
import wave
import platform
from typing import Optional, Dict, Any
from pathlib import Path
import argparse

# VOICEVOX Core関連のインポート
from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile

# 音声再生ライブラリ
try:
    import pygame
    PYGAME_AVAILABLE = True
except ImportError:
    PYGAME_AVAILABLE = False

try:
    import pyaudio
    PYAUDIO_AVAILABLE = True
except ImportError:
    PYAUDIO_AVAILABLE = False

# ログ設定
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_default_onnxruntime_path():
    """プラットフォームに応じてデフォルトのONNX Runtimeパスを取得"""
    system = platform.system().lower()
    if system == "darwin":  # macOS
        return "./voicevox_core/onnxruntime/lib/libvoicevox_onnxruntime.1.17.3.dylib"
    elif system == "linux":
        return "./voicevox_core/onnxruntime/lib/libvoicevox_onnxruntime.so.1.17.3"
    elif system == "windows":
        return "./voicevox_core/onnxruntime/lib/voicevox_onnxruntime.dll"
    else:
        return "./voicevox_core/onnxruntime/lib/libvoicevox_onnxruntime.so"

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
            return True
        
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

class VoiceVoxSynthesizer:
    """VOICEVOX音声合成クラス"""
    
    def __init__(self, voicevox_onnxruntime_path: str, open_jtalk_dict_dir: str, model_path: str):
        self.voicevox_onnxruntime_path = voicevox_onnxruntime_path
        self.open_jtalk_dict_dir = open_jtalk_dict_dir
        self.model_path = model_path
        self.synthesizer = None
        self.available_styles = []
        self.default_style_id = None
        
        self._initialize_synthesizer()
    
    def _initialize_synthesizer(self):
        """シンセサイザーを初期化"""
        try:
            logger.info("🎤 VOICEVOX初期化中...")
            logger.info(f"🖥️  実行プラットフォーム: {platform.system()} {platform.machine()}")
            logger.info(f"📁 ONNX Runtimeパス: {self.voicevox_onnxruntime_path}")
            
            # ファイルの存在確認
            if not os.path.exists(self.voicevox_onnxruntime_path):
                logger.error(f"❌ ONNX Runtimeファイルが見つかりません: {self.voicevox_onnxruntime_path}")
                raise FileNotFoundError(f"ONNX Runtime not found: {self.voicevox_onnxruntime_path}")
            
            if not os.path.exists(self.open_jtalk_dict_dir):
                logger.error(f"❌ Open JTalk辞書ディレクトリが見つかりません: {self.open_jtalk_dict_dir}")
                raise FileNotFoundError(f"Open JTalk dict not found: {self.open_jtalk_dict_dir}")
            
            if not os.path.exists(self.model_path):
                logger.error(f"❌ 音声モデルファイルが見つかりません: {self.model_path}")
                raise FileNotFoundError(f"Voice model not found: {self.model_path}")
            
            # Synthesizerの初期化
            self.synthesizer = Synthesizer(
                Onnxruntime.load_once(filename=self.voicevox_onnxruntime_path),
                OpenJtalk(self.open_jtalk_dict_dir)
            )
            
            # 音声モデルの読み込み
            logger.info(f"📦 音声モデル読み込み: {self.model_path}")
            with VoiceModelFile.open(self.model_path) as model:
                self.synthesizer.load_voice_model(model)
            
            # 利用可能なスタイルを取得
            metas = self.synthesizer.metas()
            for meta in metas:
                logger.info(f"🎭 キャラクター: {meta.name}")
                for style in meta.styles:
                    logger.info(f"   スタイル: {style.name} (ID: {style.id})")
                    self.available_styles.append({
                        'character': meta.name,
                        'style_name': style.name,
                        'style_id': style.id
                    })
            
            # デフォルトスタイルIDを設定
            if self.available_styles:
                self.default_style_id = self.available_styles[0]['style_id']
                logger.info(f"🎯 デフォルトスタイルID: {self.default_style_id}")
            
            logger.info("✅ VOICEVOX初期化完了")
            
        except Exception as e:
            logger.error(f"❌ VOICEVOX初期化エラー: {e}")
            raise
    
    def synthesize(self, text: str, style_id: Optional[int] = None, 
                   speed_scale: float = 1.0, pitch_scale: float = 0.08, 
                   intonation_scale: float = 0.0) -> bytes:
        """音声合成を実行"""
        try:
            if style_id is None:
                style_id = self.default_style_id
            
            # スタイルIDの有効性チェック
            valid_style_ids = [s['style_id'] for s in self.available_styles]
            if style_id not in valid_style_ids:
                logger.warning(f"⚠️ 無効なスタイルID {style_id}, デフォルト {self.default_style_id} を使用")
                style_id = self.default_style_id
            
            logger.info(f"🎵 音声合成開始: '{text}' (スタイルID: {style_id})")
            
            # 音声合成実行（正しい方法）
            start_time = time.time()
            
            # 1. AudioQueryを作成
            audio_query = self.synthesizer.create_audio_query(text, style_id)
            
            # 2. パラメータを設定
            audio_query.speed_scale = speed_scale
            audio_query.pitch_scale = pitch_scale  
            audio_query.intonation_scale = intonation_scale
            
            logger.info(f"🎵 パラメータ設定: 速度={speed_scale}, ピッチ={pitch_scale}, 抑揚={intonation_scale}")
            
            # 3. 音声合成実行
            wav_data = self.synthesizer.synthesis(audio_query, style_id)
            
            synthesis_time = time.time() - start_time
            logger.info(f"⚡ 音声合成完了 (処理時間: {synthesis_time:.2f}秒)")
            
            return wav_data
            
        except Exception as e:
            logger.error(f"❌ 音声合成エラー: {e}")
            return b""
    
    def estimate_duration(self, text: str) -> float:
        """テキストから音声の推定時間を計算"""
        # 日本語の場合：約3.5文字/秒
        char_count = len(text)
        base_duration = char_count / 3.5
        
        # 句読点による停止時間を考慮
        punctuation_count = text.count('。') + text.count('！') + text.count('？') + text.count('、')
        pause_time = punctuation_count * 0.3
        
        total_duration = base_duration + pause_time
        return max(total_duration, 0.5)  # 最小0.5秒

class AudioPlayer:
    """音声再生クラス"""
    
    def __init__(self):
        self.is_playing = False
        self.current_process = None
    
    def play_wav_data(self, wav_data: bytes) -> float:
        """WAVデータを再生し、実際の再生時間を返す"""
        try:
            # 音声の長さを取得
            duration = self._get_wav_duration(wav_data)
            
            # 再生方法を選択
            if PYGAME_AVAILABLE:
                actual_duration = self._play_with_pygame(wav_data)
            elif PYAUDIO_AVAILABLE:
                actual_duration = self._play_with_pyaudio(wav_data)
            else:
                actual_duration = self._play_with_system(wav_data)
            
            return actual_duration if actual_duration > 0 else duration
            
        except Exception as e:
            logger.error(f"❌ 音声再生エラー: {e}")
            return 0.0
    
    def _get_wav_duration(self, wav_data: bytes) -> float:
        """WAVデータから音声の長さを取得"""
        try:
            audio_buffer = io.BytesIO(wav_data)
            with wave.open(audio_buffer, 'rb') as wf:
                frames = wf.getnframes()
                sample_rate = wf.getframerate()
                duration = frames / sample_rate
                return duration
        except Exception:
            return 2.0  # デフォルト値
    
    def _play_with_pygame(self, wav_data: bytes) -> float:
        """pygame使用して音声を再生"""
        try:
            pygame.mixer.init()
            
            start_time = time.time()
            audio_buffer = io.BytesIO(wav_data)
            pygame.mixer.music.load(audio_buffer)
            pygame.mixer.music.play()
            
            # 再生完了まで待機
            while pygame.mixer.music.get_busy():
                time.sleep(0.01)
            
            actual_duration = time.time() - start_time
            pygame.mixer.quit()
            
            logger.info(f"🔊 pygame再生完了 (時間: {actual_duration:.2f}秒)")
            return actual_duration
            
        except Exception as e:
            logger.error(f"❌ pygame再生エラー: {e}")
            return 0.0
    
    def _play_with_pyaudio(self, wav_data: bytes) -> float:
        """PyAudio使用して音声を再生"""
        try:
            start_time = time.time()
            audio_buffer = io.BytesIO(wav_data)
            
            with wave.open(audio_buffer, 'rb') as wf:
                p = pyaudio.PyAudio()
                stream = p.open(
                    format=p.get_format_from_width(wf.getsampwidth()),
                    channels=wf.getnchannels(),
                    rate=wf.getframerate(),
                    output=True
                )
                
                chunk_size = 1024
                data = wf.readframes(chunk_size)
                while data:
                    stream.write(data)
                    data = wf.readframes(chunk_size)
                
                stream.stop_stream()
                stream.close()
                p.terminate()
            
            actual_duration = time.time() - start_time
            logger.info(f"🔊 PyAudio再生完了 (時間: {actual_duration:.2f}秒)")
            return actual_duration
            
        except Exception as e:
            logger.error(f"❌ PyAudio再生エラー: {e}")
            return 0.0
    
    def _play_with_system(self, wav_data: bytes) -> float:
        """システムコマンドで音声再生（プラットフォーム対応）"""
        try:
            start_time = time.time()
            
            # 一時ファイルに保存
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
                temp_file.write(wav_data)
                temp_path = temp_file.name
            
            import subprocess
            system = platform.system().lower()
            
            try:
                if system == "darwin":  # macOS
                    subprocess.run(['afplay', temp_path], check=True)
                elif system == "linux":
                    # Linuxでの音声再生コマンドを試行（優先順位順）
                    commands_to_try = [
                        ['aplay', temp_path],           # ALSA
                        ['paplay', temp_path],          # PulseAudio
                        ['play', temp_path],            # SoX
                        ['ffplay', '-nodisp', '-autoexit', temp_path],  # FFmpeg
                        ['mplayer', '-really-quiet', temp_path],        # MPlayer
                        ['mpv', '--no-video', '--really-quiet', temp_path]  # mpv
                    ]
                    
                    played_successfully = False
                    for cmd in commands_to_try:
                        try:
                            logger.info(f"🔊 音声再生試行: {cmd[0]}")
                            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                            played_successfully = True
                            logger.info(f"✅ {cmd[0]}で再生成功")
                            break
                        except (subprocess.CalledProcessError, FileNotFoundError):
                            continue
                    
                    if not played_successfully:
                        logger.error("❌ 利用可能な音声再生コマンドが見つかりません")
                        logger.error("以下のいずれかをインストールしてください: aplay, paplay, play, ffplay, mplayer, mpv")
                        return 0.0
                        
                elif system == "windows":
                    # Windowsの場合（参考）
                    import winsound
                    winsound.PlaySound(temp_path, winsound.SND_FILENAME)
                else:
                    logger.warning(f"⚠️ 不明なプラットフォーム: {system}")
                    return 0.0
                    
            finally:
                # 一時ファイル削除
                try:
                    os.unlink(temp_path)
                except:
                    pass
            
            actual_duration = time.time() - start_time
            logger.info(f"🔊 システム再生完了 (時間: {actual_duration:.2f}秒)")
            return actual_duration
            
        except Exception as e:
            logger.error(f"❌ システム再生エラー: {e}")
            return 0.0

class VoiceVoxLipSyncSpeaker:
    """VOICEVOX + リップシンク発話システム"""
    
    def __init__(self, server_url="http://localhost:8080", 
                 voicevox_onnxruntime_path="./onnxruntime/lib/libvoicevox_onnxruntime.1.17.3.dylib",
                 open_jtalk_dict_dir="./dict/open_jtalk_dic_utf_8-1.11",
                 model_path="./models/vvms/1.vvm"):
        
        self.talking_controller = TalkingModeController(server_url)
        self.audio_player = AudioPlayer()
        self.voicevox = VoiceVoxSynthesizer(voicevox_onnxruntime_path, open_jtalk_dict_dir, model_path)
        
        self.is_speaking = False
        self._speech_lock = threading.Lock()
        
        # 音声パラメータ
        self.speed_scale = 1.0
        self.pitch_scale = 0.08
        self.intonation_scale = 0.0
        self.style_id = None
        
        logger.info("🤖 VOICEVOX + リップシンクシステム初期化完了")
    
    async def speak_async(self, text: str, style_id: Optional[int] = None) -> bool:
        """非同期でセリフを発話（リップシンク同期）"""
        
        if not self._speech_lock.acquire(blocking=False):
            logger.info("🛑 他の発話が進行中のため、この発話をスキップ")
            return False
        
        try:
            logger.info(f"📢 発話開始: '{text}'")
            self.is_speaking = True
            
            # 1. 音声合成
            logger.info("🎵 音声合成中...")
            synthesis_start = time.time()
            
            wav_data = self.voicevox.synthesize(
                text, 
                style_id or self.style_id,
                self.speed_scale,
                self.pitch_scale,
                self.intonation_scale
            )
            
            if not wav_data:
                logger.error("❌ 音声合成に失敗しました")
                return False
            
            synthesis_time = time.time() - synthesis_start
            logger.info(f"✅ 音声合成完了 (時間: {synthesis_time:.2f}秒)")
            
            # 2. 音声再生とリップシンクを並行実行
            audio_result = {'duration': 0.0, 'completed': False}
            
            # 音声再生スレッドを開始
            audio_thread = self._start_audio_playback(wav_data, audio_result)
            
            # 少し待ってからリップシンク開始
            await asyncio.sleep(0.2)
            
            if not self.is_speaking:
                logger.info("🛑 発話開始時に中断されました")
                return False
            
            # 3. おしゃべりモード有効化
            if not self.talking_controller.set_talking_mode(True):
                logger.error("❌ おしゃべりモード有効化失敗")
                self.is_speaking = False
                return False
            
            logger.info("🎭 リップシンク開始")
            
            # 4. 音声再生の完了を待機
            check_interval = 0.05
            max_wait_time = 15.0
            elapsed_time = 0.0
            
            while elapsed_time < max_wait_time and self.is_speaking:
                await asyncio.sleep(check_interval)
                elapsed_time += check_interval
                
                if audio_result['completed']:
                    logger.info(f"✅ 音声再生完了検出 (実時間: {audio_result['duration']:.2f}秒)")
                    break
            
            # 5. リップシンク終了
            self.talking_controller.set_talking_mode(False)
            self.is_speaking = False
            
            logger.info("✅ 発話完了")
            return True
            
        except Exception as e:
            logger.error(f"❌ 発話エラー: {e}")
            self.talking_controller.set_talking_mode(False)
            self.is_speaking = False
            return False
        finally:
            self._speech_lock.release()
    
    def _start_audio_playback(self, wav_data: bytes, result_dict: dict):
        """音声再生を非同期で開始"""
        def play_audio():
            if not self.is_speaking:
                result_dict['completed'] = True
                result_dict['duration'] = 0.0
                return
            
            start_time = time.time()
            try:
                # 音声再生実行
                duration = self.audio_player.play_wav_data(wav_data)
                actual_time = time.time() - start_time
                
                result_dict['duration'] = actual_time
                result_dict['completed'] = True
                
                if self.is_speaking:
                    logger.info(f"🔊 音声再生完了 (実時間: {actual_time:.2f}秒)")
                
            except Exception as e:
                logger.error(f"❌ 音声再生エラー: {e}")
                result_dict['completed'] = True
                result_dict['duration'] = time.time() - start_time
        
        thread = threading.Thread(target=play_audio, daemon=True)
        thread.start()
        return thread
    
    def speak_sync(self, text: str, style_id: Optional[int] = None) -> bool:
        """同期的にセリフを発話"""
        return asyncio.run(self.speak_async(text, style_id))
    
    def set_voice_parameters(self, speed_scale: float = 1.0, pitch_scale: float = 0.08, 
                           intonation_scale: float = 0.0, style_id: Optional[int] = None):
        """音声パラメータを設定"""
        self.speed_scale = speed_scale
        self.pitch_scale = pitch_scale
        self.intonation_scale = intonation_scale
        if style_id is not None:
            self.style_id = style_id
        
        logger.info(f"🎵 音声パラメータ更新: 速度={speed_scale}, ピッチ={pitch_scale}, 抑揚={intonation_scale}")
    
    def get_available_styles(self) -> list:
        """利用可能なスタイル一覧を取得"""
        return self.voicevox.available_styles
    
    def stop_speaking(self):
        """現在の発話を停止"""
        if self.is_speaking:
            logger.info("🛑 発話を中断します...")
            self.is_speaking = False
            self.talking_controller.set_talking_mode(False)
            time.sleep(0.2)
            logger.info("✅ 発話を中断しました")

class VoiceVoxConsole:
    """VOICEVOX + リップシンクコンソール"""
    
    def __init__(self, speaker: VoiceVoxLipSyncSpeaker):
        self.speaker = speaker
        self.is_running = False
        
        # プリセットセリフの設定（dialogue_data.jsonから読み込み）
        self.preset_speeches = self._load_preset_speeches()
    
    def _load_preset_speeches(self) -> dict:
        """プリセットセリフをdialogue_data.jsonから読み込み"""
        speech_file = "dialogue_data.json"
        
        # デフォルトのセリフ設定（フォールバック用）
        default_speeches = {
            "1": {
                "text": "こんにちは、僕の名前はシリウスです。",
                "description": "挨拶"
            },
            "2": {
                "text": "おはようございます！今日も良い一日を。",
                "description": "朝の挨拶"
            },
            "3": {
                "text": "お疲れ様でした！",
                "description": "お疲れ様"
            },
            "4": {
                "text": "ありがとうございます。",
                "description": "感謝"
            },
            "5": {
                "text": "また明日お会いしましょう。",
                "description": "別れの挨拶"
            }
        }
        
        try:
            if os.path.exists(speech_file):
                with open(speech_file, 'r', encoding='utf-8') as f:
                    dialogue_data = json.load(f)
                
                # dialogue_data.jsonの構造に対応
                if "dialogues" in dialogue_data:
                    loaded_speeches = {}
                    for key, dialogue in dialogue_data["dialogues"].items():
                        # enabledがTrueのもののみ読み込み
                        if dialogue.get("enabled", True):
                            loaded_speeches[key] = {
                                "text": dialogue["text"],
                                "description": dialogue.get("description", "プリセット"),
                                "style_id": dialogue.get("style_id"),
                                "speed": dialogue.get("speed", 1.0),
                                "pitch": dialogue.get("pitch", 0.0),
                                "intonation": dialogue.get("intonation", 0.9),
                                "vvm_model": dialogue.get("vvm_model")
                            }
                    
                    logger.info(f"📄 プリセットセリフファイル読み込み完了: {speech_file}")
                    logger.info(f"🎭 読み込んだセリフ数: {len(loaded_speeches)}")
                    return loaded_speeches
                else:
                    logger.warning(f"⚠️ dialogue_data.jsonに'dialogues'キーが見つかりません")
                    return default_speeches
            else:
                logger.info(f"📄 プリセットセリフファイルが見つかりません: {speech_file}")
                logger.info("🎭 デフォルトセリフを使用します")
                return default_speeches
        except Exception as e:
            logger.error(f"❌ プリセットセリフファイル読み込みエラー: {e}")
            logger.info("🎭 デフォルトセリフを使用します")
            return default_speeches
    
    def _save_preset_speeches(self, speeches: dict, filename: str):
        """プリセットセリフをファイルに保存"""
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(speeches, f, ensure_ascii=False, indent=4)
            logger.info(f"💾 プリセットセリフファイル保存完了: {filename}")
        except Exception as e:
            logger.error(f"❌ プリセットセリフファイル保存エラー: {e}")
    
    def show_help(self):
        """ヘルプ表示"""
        logger.info("🤖 VOICEVOX + リップシンクシステム")
        logger.info("利用可能なコマンド:")
        
        # プリセットセリフを動的に表示
        for key, speech in self.preset_speeches.items():
            logger.info(f"  {key}: {speech['description']} - '{speech['text']}'")
        
        logger.info("  C: カスタムテキスト入力")
        logger.info("  R: プリセットセリフ再読み込み")
        logger.info("  P: 音声パラメータ設定")
        logger.info("  L: 利用可能なスタイル一覧")
        logger.info("  S: 状態表示")
        logger.info("  I: 発話中断")
        logger.info("  H: ヘルプ表示")
        logger.info("  Q: 終了")
    
    def show_styles(self):
        """利用可能なスタイル一覧を表示"""
        styles = self.speaker.get_available_styles()
        logger.info("📋 利用可能なスタイル:")
        for i, style in enumerate(styles):
            logger.info(f"  {i+1}. {style['character']} - {style['style_name']} (ID: {style['style_id']})")
    
    def set_voice_parameters(self):
        """音声パラメータ設定"""
        try:
            print("\n🎵 音声パラメータ設定:")
            speed = float(input(f"話速 (現在: {self.speaker.speed_scale}, 標準: 1.0): ") or self.speaker.speed_scale)
            pitch = float(input(f"ピッチ (現在: {self.speaker.pitch_scale}, 標準: 0.0): ") or self.speaker.pitch_scale)
            intonation = float(input(f"抑揚 (現在: {self.speaker.intonation_scale}, 標準: 1.0): ") or self.speaker.intonation_scale)
            
            styles = self.speaker.get_available_styles()
            print("利用可能なスタイル:")
            for i, style in enumerate(styles):
                print(f"  {i+1}. {style['character']} - {style['style_name']} (ID: {style['style_id']})")
            
            style_choice = input("スタイル番号を選択 (Enterでスキップ): ").strip()
            style_id = None
            if style_choice:
                try:
                    style_index = int(style_choice) - 1
                    if 0 <= style_index < len(styles):
                        style_id = styles[style_index]['style_id']
                except ValueError:
                    pass
            
            self.speaker.set_voice_parameters(speed, pitch, intonation, style_id)
            
        except ValueError:
            logger.warning("❌ 無効な値が入力されました")
    
    def speak_preset(self, key: str):
        """プリセットセリフを発話"""
        if key in self.preset_speeches:
            speech = self.preset_speeches[key]
            logger.info(f"🎭 プリセット発話: {speech['description']}")
            
            # 個別設定がある場合は一時的に適用
            original_style = self.speaker.style_id
            original_speed = self.speaker.speed_scale
            original_pitch = self.speaker.pitch_scale
            original_intonation = self.speaker.intonation_scale
            
            # セリフ固有の設定を適用
            if speech.get("style_id"):
                self.speaker.set_voice_parameters(
                    speech.get("speed", original_speed),
                    speech.get("pitch", original_pitch),
                    speech.get("intonation", original_intonation),
                    speech.get("style_id")
                )
            
            def speak_and_restore():
                try:
                    self.speaker.speak_sync(speech['text'])
                finally:
                    # 元の設定に戻す
                    self.speaker.set_voice_parameters(
                        original_speed, original_pitch, original_intonation, original_style
                    )
            
            threading.Thread(target=speak_and_restore, daemon=True).start()
        else:
            logger.warning(f"❌ プリセット'{key}'は存在しません")
    
    def reload_preset_speeches(self):
        """プリセットセリフファイルを再読み込み"""
        logger.info("🔄 プリセットセリフファイルを再読み込み中...")
        old_count = len(self.preset_speeches)
        self.preset_speeches = self._load_preset_speeches()
        new_count = len(self.preset_speeches)
        logger.info(f"✅ 再読み込み完了: {old_count} → {new_count} セリフ")
    
    def show_status(self):
        """状態表示"""
        logger.info("📊 現在の状態:")
        logger.info(f"  おしゃべりモード: {'有効' if self.speaker.talking_controller.is_talking_mode_active else '無効'}")
        logger.info(f"  発話中: {'はい' if self.speaker.is_speaking else 'いいえ'}")
        logger.info(f"  プリセットセリフ数: {len(self.preset_speeches)}")
        logger.info(f"  話速: {self.speaker.speed_scale}")
        logger.info(f"  ピッチ: {self.speaker.pitch_scale}")
        logger.info(f"  抑揚: {self.speaker.intonation_scale}")
        logger.info(f"  スタイルID: {self.speaker.style_id}")
    
    def start(self):
        """コンソール開始"""
        self.is_running = True
        logger.info("🤖 VOICEVOX + リップシンクシステム起動")
        self.show_help()
        
        try:
            while self.is_running:
                try:
                    command = input("\n> ").strip().upper()
                    
                    # プリセットセリフをチェック
                    if command in self.preset_speeches:
                        self.speak_preset(command)
                    elif command == "C":
                        custom_text = input("発話させたいテキストを入力してください: ").strip()
                        if custom_text:
                            threading.Thread(target=lambda: self.speaker.speak_sync(custom_text), daemon=True).start()
                        else:
                            logger.warning("テキストが入力されませんでした")
                    elif command == "R":
                        self.reload_preset_speeches()
                    elif command == "P":
                        self.set_voice_parameters()
                    elif command == "L":
                        self.show_styles()
                    elif command == "S":
                        self.show_status()
                    elif command == "I":
                        self.speaker.stop_speaking()
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
            self.speaker.stop_speaking()

def main():
    """メイン関数"""
    parser = argparse.ArgumentParser(description='VOICEVOX + リップシンク同期システム')
    parser.add_argument('--server', default='http://localhost:8080',
                       help='HTTPサーバーのURL (デフォルト: http://localhost:8080)')
    parser.add_argument('--onnxruntime', default=get_default_onnxruntime_path(),
                       help='ONNX Runtimeライブラリのパス')
    parser.add_argument('--dict-dir', default='./voicevox_core/dict/open_jtalk_dic_utf_8-1.11',
                       help='Open JTalk辞書ディレクトリ')
    parser.add_argument('--model', default='./voicevox_core/models/vvms/14.vvm',
                       help='VOICEVOXモデルファイルのパス')
    parser.add_argument('--text', type=str,
                       help='発話させるテキスト（指定した場合はコンソールモードをスキップ）')
    parser.add_argument('--style-id', type=int, default=69,
                       help='スタイルID')
    parser.add_argument('--speed', type=float, default=1.0,
                       help='話速 (1.0が標準)')
    parser.add_argument('--pitch', type=float, default=0.08,
                       help='ピッチ (0.0が標準)')
    parser.add_argument('--intonation', type=float, default=0.0,
                       help='抑揚 (1.0が標準)')
    
    args = parser.parse_args()
    
    try:
        # ファイル存在チェック
        logger.info(f"🔍 ファイル存在チェック:")
        logger.info(f"  プラットフォーム: {platform.system()} {platform.machine()}")
        logger.info(f"  ONNX Runtime: {args.onnxruntime} - {'存在' if os.path.exists(args.onnxruntime) else '存在しない'}")
        logger.info(f"  辞書: {args.dict_dir} - {'存在' if os.path.exists(args.dict_dir) else '存在しない'}")
        logger.info(f"  モデル: {args.model} - {'存在' if os.path.exists(args.model) else '存在しない'}")
        
        # 音声再生環境チェック（Linux用）
        if platform.system().lower() == "linux":
            logger.info("🐧 Linux音声再生環境チェック:")
            import subprocess
            audio_commands = ['aplay', 'paplay', 'play', 'ffplay', 'mplayer', 'mpv']
            available_commands = []
            
            for cmd in audio_commands:
                try:
                    subprocess.run([cmd, '--version'], check=True, 
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    available_commands.append(cmd)
                except (subprocess.CalledProcessError, FileNotFoundError):
                    pass
            
            if available_commands:
                logger.info(f"  利用可能な音声コマンド: {', '.join(available_commands)}")
            else:
                logger.warning("⚠️ 音声再生コマンドが見つかりません")
                logger.warning("以下のコマンドをインストールすることを推奨:")
                logger.warning("  sudo apt-get install alsa-utils pulseaudio-utils sox ffmpeg")
        
        # スピーカー初期化
        speaker = VoiceVoxLipSyncSpeaker(
            args.server,
            args.onnxruntime,
            args.dict_dir,
            args.model
        )
        
        # 音声パラメータ設定
        speaker.set_voice_parameters(args.speed, args.pitch, args.intonation, args.style_id)
        
        if args.text:
            # テキスト指定がある場合は一回だけ発話
            speaker.speak_sync(args.text, args.style_id)
        else:
            # コンソールモード
            console = VoiceVoxConsole(speaker)
            console.start()
            
    except Exception as e:
        logger.error(f"❌ システム初期化エラー: {e}")
        logger.error("必要なファイルが存在するか確認してください:")
        logger.error(f"  - プラットフォーム: {platform.system()} {platform.machine()}")
        logger.error(f"  - ONNX Runtime: {args.onnxruntime}")
        logger.error(f"  - 辞書: {args.dict_dir}")
        logger.error(f"  - モデル: {args.model}")
        
        # Linuxの場合の追加ヒント
        if platform.system().lower() == "linux":
            logger.error("🐧 Linuxでの追加確認事項:")
            logger.error("  - .soファイルが正しく配置されているか")
            logger.error("  - 必要な依存ライブラリがインストールされているか")
            logger.error("  - ファイルの実行権限があるか")
            logger.error("  - 音声再生コマンドがインストールされているか:")
            logger.error("    sudo apt-get install alsa-utils pulseaudio-utils sox ffmpeg")

if __name__ == "__main__":
    main()

"""
python3 voicevox_lipsync.py --model ./voicevox_core/models/vvms/10.vvm --style-id 42 --speed 1.0 --pitch 0.0 --intonation 1.0

python3 voicevox_lipsync.py --model ./voicevox_core/models/vvms/13.vvm --style-id 54 --speed 1.0 --pitch 0.0 --intonation 0.9

"""