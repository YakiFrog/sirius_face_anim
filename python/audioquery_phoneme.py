#!/usr/bin/env python3
"""
VOICEVOX AudioQuery音韻解析システム
AudioQueryの音韻情報を使用した高精度リップシンク
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
from typing import Optional, Dict, Any, List, Tuple
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
    """おしゃべりモード制御クラス（高速化・最適化版）"""
    
    def __init__(self, server_url="http://localhost:8080"):
        self.server_url = server_url
        self.is_talking_mode_active = False
        self.last_mouth_pattern = None  # 冗長リクエストを防ぐ
        
        # 高速化のためのHTTPセッション設定
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Connection': 'keep-alive'  # Keep-Aliveを有効にする
        })
        
        # コネクションプールの設定
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=1,  # プール内の接続数
            pool_maxsize=1,      # プールの最大サイズ
            max_retries=0        # リトライしない（高速化のため）
        )
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)
    
    def set_talking_mode(self, enabled: bool) -> bool:
        """おしゃべりモードを設定（高速化版）"""
        if self.is_talking_mode_active == enabled:
            return True  # ログ出力も省略して高速化
        
        try:
            response = self.session.post(
                f"{self.server_url}/talking_mouth_mode",
                json={'talking_mouth_mode': enabled},
                timeout=0.1  # タイムアウトを極短に
            )
            
            if response.status_code == 200:
                self.is_talking_mode_active = enabled
                return True
            else:
                logger.warning(f"❌ HTTP エラー: {response.status_code}")
                return False
                
        except Exception as e:
            logger.warning(f"❌ おしゃべりモード設定エラー: {e}")
            return False
    
    def set_mouth_pattern_fast(self, pattern: str) -> bool:
        """高速口形状設定（冗長リクエスト排除）"""
        # 同じパターンの場合はスキップ
        if self.last_mouth_pattern == pattern:
            return True
        
        try:
            response = self.session.post(
                f"{self.server_url}/mouth_pattern",
                json={'mouth_pattern': pattern},
                timeout=0.05  # 極短タイムアウト
            )
            
            if response.status_code == 200:
                self.last_mouth_pattern = pattern
                return True
            else:
                return False
                
        except Exception:
            return False  # エラーログも省略して高速化
    
    def cleanup_session(self):
        """セッションのクリーンアップ（メモリリーク防止）"""
        try:
            self.session.close()
            self.session = requests.Session()
            self.session.headers.update({
                'Content-Type': 'application/json',
                'Connection': 'keep-alive'
            })
            # アダプターも再設定
            adapter = requests.adapters.HTTPAdapter(
                pool_connections=1,
                pool_maxsize=1,
                max_retries=0
            )
            self.session.mount('http://', adapter)
            self.session.mount('https://', adapter)
            self.last_mouth_pattern = None
        except Exception as e:
            logger.warning(f"セッションクリーンアップエラー: {e}")

class AudioPlayer:
    """音声再生クラス（voicevox_lipsync.pyから移植）"""
    
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

class AudioQueryPhonemeAnalyzer:
    
    def __init__(self, synthesizer):
        self.synthesizer = synthesizer
        
        # 日本語音韻から口形状への詳細マッピング
        self.phoneme_to_mouth = {
            # 母音
            'a': 'a',    # あ
            'i': 'i',    # い
            'u': 'o',    # う（oに統合）
            'e': 'a',    # え（aに近い）
            'o': 'o',    # お
            
            # 子音＋母音の組み合わせ
            # あ系
            'ka': 'a', 'ga': 'a', 'sa': 'a', 'za': 'a', 'ta': 'a', 'da': 'a',
            'na': 'a', 'ha': 'a', 'ba': 'a', 'pa': 'a', 'ma': 'a', 'ya': 'a',
            'ra': 'a', 'wa': 'a', 'fa': 'a', 'va': 'a',
            
            # い系  
            'ki': 'i', 'gi': 'i', 'si': 'i', 'shi': 'i', 'zi': 'i', 'ji': 'i',
            'ti': 'i', 'chi': 'i', 'di': 'i', 'ni': 'i', 'hi': 'i', 'bi': 'i',
            'pi': 'i', 'mi': 'i', 'ri': 'i', 'wi': 'i', 'fi': 'i', 'vi': 'i',
            
            # う系（oに統合）
            'ku': 'o', 'gu': 'o', 'su': 'o', 'zu': 'o', 'tu': 'o', 'tsu': 'o',
            'du': 'o', 'nu': 'o', 'hu': 'o', 'fu': 'o', 'bu': 'o', 'pu': 'o',
            'mu': 'o', 'yu': 'o', 'ru': 'o', 'wu': 'o',
            
            # え系（aに近い）
            'ke': 'a', 'ge': 'a', 'se': 'a', 'ze': 'a', 'te': 'a', 'de': 'a',
            'ne': 'a', 'he': 'a', 'be': 'a', 'pe': 'a', 'me': 'a', 're': 'a',
            'we': 'a', 'fe': 'a', 've': 'a',
            
            # お系
            'ko': 'o', 'go': 'o', 'so': 'o', 'zo': 'o', 'to': 'o', 'do': 'o',
            'no': 'o', 'ho': 'o', 'bo': 'o', 'po': 'o', 'mo': 'o', 'yo': 'o',
            'ro': 'o', 'wo': 'o', 'fo': 'o', 'vo': 'o',
            
            # 特殊音韻
            'sil': None,    # 無音
            'pau': None,    # ポーズ
            'cl': None,     # 閉鎖音
            'q': None,      # 促音
            'N': 'o',       # ん
            
            # 長音・その他
            'ー': None,
            'っ': None,
        }
    
    def analyze_from_audio_query(self, text: str, style_id: int) -> List[Tuple[str, str, float]]:
        """
        AudioQueryから音韻情報を抽出してリップシンク用に変換
        
        Returns:
            List[Tuple[str, str, float]]: (音韻, 口形状, 継続時間) のリスト
        """
        try:
            logger.info(f"🔍 AudioQuery音韻解析開始: '{text}'")
            
            # AudioQueryを作成
            audio_query = self.synthesizer.create_audio_query(text, style_id)
            
            # デバッグ: AudioQueryの構造を確認
            logger.info(f"🔧 DEBUG: AudioQuery属性 = {[attr for attr in dir(audio_query) if not attr.startswith('_')]}")
            if hasattr(audio_query, 'accent_phrases'):
                logger.info(f"🔧 DEBUG: accent_phrases数 = {len(audio_query.accent_phrases)}")
            
            phoneme_timeline = []
            total_duration = 0.0
            
            # accent_phrasesから音韻情報を抽出
            if hasattr(audio_query, 'accent_phrases'):
                
                # 前音韻長を追加
                if hasattr(audio_query, 'pre_phoneme_length') and audio_query.pre_phoneme_length > 0:
                    pre_length = float(audio_query.pre_phoneme_length)
                    phoneme_timeline.append(('sil', None, pre_length))
                    total_duration += pre_length
                    logger.info(f"🔧 DEBUG: 前音韻長追加: {pre_length}秒")
                
                for accent_phrase in audio_query.accent_phrases:
                    if hasattr(accent_phrase, 'moras'):
                        for mora in accent_phrase.moras:
                            # 子音処理
                            if hasattr(mora, 'consonant') and mora.consonant:
                                consonant_phoneme = mora.consonant
                                # 正確な子音時間を取得
                                consonant_duration = 0.0
                                
                                if hasattr(mora, 'consonant_length') and mora.consonant_length is not None:
                                    consonant_duration = float(mora.consonant_length)
                                
                                if consonant_duration > 0:
                                    mouth_shape = self.phoneme_to_mouth.get(consonant_phoneme, None)
                                    if mouth_shape:
                                        phoneme_timeline.append((consonant_phoneme, mouth_shape, consonant_duration))
                                        total_duration += consonant_duration
                            
                            # 母音処理
                            if hasattr(mora, 'vowel') and mora.vowel:
                                vowel_phoneme = mora.vowel
                                # 正確な母音時間を取得
                                vowel_duration = 0.0
                                
                                if hasattr(mora, 'vowel_length') and mora.vowel_length is not None:
                                    vowel_duration = float(mora.vowel_length)
                                else:
                                    # デバッグ: moraの全属性をログ出力
                                    logger.warning(f"🔧 DEBUG: mora属性 = {[attr for attr in dir(mora) if not attr.startswith('_')]}")
                                    logger.warning(f"🔧 DEBUG: vowel_length = {getattr(mora, 'vowel_length', 'NOT_FOUND')}")
                                
                                if vowel_duration > 0:
                                    mouth_shape = self.phoneme_to_mouth.get(vowel_phoneme, 'a')
                                    phoneme_timeline.append((vowel_phoneme, mouth_shape, vowel_duration))
                                    total_duration += vowel_duration
                    
                                        # ポーズ処理
                    if hasattr(accent_phrase, 'pause_mora') and accent_phrase.pause_mora:
                        pause_duration = 0.0
                        
                        # pause_moraは辞書形式、vowel_lengthキーから時間を取得
                        if isinstance(accent_phrase.pause_mora, dict):
                            pause_duration = accent_phrase.pause_mora.get('vowel_length', 0.0)
                            logger.info(f"🔧 DEBUG: ポーズ辞書 = {accent_phrase.pause_mora}")
                            logger.info(f"🔧 DEBUG: ポーズ時間(vowel_length) = {pause_duration}")
                        else:
                            # オブジェクトの場合
                            if hasattr(accent_phrase.pause_mora, 'vowel_length'):
                                pause_duration = float(accent_phrase.pause_mora.vowel_length)
                                logger.info(f"🔧 DEBUG: ポーズ時間(属性) = {pause_duration}")
                        
                        if pause_duration > 0:
                            phoneme_timeline.append(('pau', 'i', pause_duration))
                            total_duration += pause_duration
                            logger.info(f"🔧 DEBUG: ポーズ追加: {pause_duration}秒")
                        else:
                            logger.warning(f"🔧 DEBUG: ポーズ時間が0秒のためスキップ")
                
                # 後音韻長を追加
                if hasattr(audio_query, 'post_phoneme_length') and audio_query.post_phoneme_length > 0:
                    post_length = float(audio_query.post_phoneme_length)
                    phoneme_timeline.append(('sil', None, post_length))
                    total_duration += post_length
                    logger.info(f"🔧 DEBUG: 後音韻長追加: {post_length}秒")
            
            logger.info(f"✅ AudioQuery音韻解析完了: {len(phoneme_timeline)}音韻, 総時間: {total_duration:.2f}秒")
            
            # 結果をログ出力
            logger.info("🎭 詳細音韻シーケンス:")
            for i, (phoneme, mouth_shape, duration) in enumerate(phoneme_timeline):
                if mouth_shape:
                    logger.info(f"  {i+1:2d}. '{phoneme}' → {mouth_shape} ({duration:.3f}秒)")
                else:
                    logger.info(f"  {i+1:2d}. '{phoneme}' → 無音 ({duration:.3f}秒)")
            
            return phoneme_timeline
            
        except Exception as e:
            logger.error(f"❌ AudioQuery音韻解析エラー: {e}")
            import traceback
            logger.error(f"❌ エラー詳細: {traceback.format_exc()}")
            return []
    
    def get_mouth_shape_sequence(self, text: str, style_id: int) -> List[Tuple[str, float]]:
        """
        テキストから口形状シーケンスを生成（AudioQuery版）
        
        Returns:
            List[Tuple[str, float]]: (口形状, 継続時間) のリスト
        """
        phoneme_timeline = self.analyze_from_audio_query(text, style_id)
        mouth_sequence = []
        
        for phoneme, mouth_shape, duration in phoneme_timeline:
            if mouth_shape:  # Noneでない場合のみ追加
                mouth_sequence.append((mouth_shape, duration))
        
        return mouth_sequence
    
    def print_analysis(self, text: str, style_id: int):
        """AudioQuery音韻解析結果を詳細表示"""
        logger.info(f"🔍 AudioQuery音韻解析: '{text}' (スタイルID: {style_id})")
        
        timeline = self.analyze_from_audio_query(text, style_id)
        
        if not timeline:
            logger.warning("⚠️ 音韻解析結果が空です")
            return
        
        # 統計情報
        total_duration = sum(item[2] for item in timeline)
        mouth_only = [(item[1], item[2]) for item in timeline if item[1]]
        
        logger.info(f"📊 総継続時間: {total_duration:.3f}秒")
        logger.info(f"📊 総音韻数: {len(timeline)}")
        logger.info(f"📊 口形状変化数: {len(mouth_only)}")
        
        # 口形状の統計
        shape_counts = {}
        shape_durations = {}
        
        for phoneme, mouth_shape, duration in timeline:
            if mouth_shape:
                shape_counts[mouth_shape] = shape_counts.get(mouth_shape, 0) + 1
                shape_durations[mouth_shape] = shape_durations.get(mouth_shape, 0) + duration
        
        logger.info("📊 口形状別統計:")
        for shape in sorted(shape_counts.keys()):
            count = shape_counts[shape]
            duration = shape_durations[shape]
            percentage = (duration / total_duration) * 100 if total_duration > 0 else 0
            logger.info(f"  {shape}: {count}回 ({duration:.3f}秒, {percentage:.1f}%)")

class VoiceVoxSynthesizer:
    """VOICEVOX音声合成クラス（AudioQuery対応）"""
    
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
            
            if not os.path.exists(self.voicevox_onnxruntime_path):
                raise FileNotFoundError(f"ONNX Runtime not found: {self.voicevox_onnxruntime_path}")
            
            if not os.path.exists(self.open_jtalk_dict_dir):
                raise FileNotFoundError(f"Open JTalk dict not found: {self.open_jtalk_dict_dir}")
            
            if not os.path.exists(self.model_path):
                raise FileNotFoundError(f"Voice model not found: {self.model_path}")
            
            self.synthesizer = Synthesizer(
                Onnxruntime.load_once(filename=self.voicevox_onnxruntime_path),
                OpenJtalk(self.open_jtalk_dict_dir)
            )
            
            with VoiceModelFile.open(self.model_path) as model:
                self.synthesizer.load_voice_model(model)
            
            metas = self.synthesizer.metas()
            for meta in metas:
                for style in meta.styles:
                    self.available_styles.append({
                        'character': meta.name,
                        'style_name': style.name,
                        'style_id': style.id
                    })
            
            if self.available_styles:
                self.default_style_id = self.available_styles[0]['style_id']
            
            logger.info("✅ VOICEVOX初期化完了")
            
        except Exception as e:
            logger.error(f"❌ VOICEVOX初期化エラー: {e}")
            raise

class AudioQueryLipSyncSpeaker:
    """AudioQuery音韻解析 + リップシンク発話システム（高速化版）"""
    
    def __init__(self, server_url="http://localhost:8080", 
                 voicevox_onnxruntime_path="./voicevox_core/onnxruntime/lib/libvoicevox_onnxruntime.1.17.3.dylib",
                 open_jtalk_dict_dir="./voicevox_core/dict/open_jtalk_dic_utf_8-1.11",
                 model_path="./voicevox_core/models/vvms/13.vvm"):
        
        self.talking_controller = TalkingModeController(server_url)
        self.audio_player = AudioPlayer()
        self.voicevox = VoiceVoxSynthesizer(voicevox_onnxruntime_path, open_jtalk_dict_dir, model_path)
        self.analyzer = AudioQueryPhonemeAnalyzer(self.voicevox.synthesizer)
        
        self.is_speaking = False
        self._speech_lock = threading.Lock()
        
        # 音声パラメータ
        self.speed_scale = 1.0
        self.pitch_scale = 0.08
        self.intonation_scale = 0.0
        self.style_id = self.voicevox.default_style_id
        
        # セッション管理用
        self._session_cleanup_counter = 0
        self._session_cleanup_interval = 50  # 50回に1回セッションをクリーンアップ
        
        logger.info("🤖 AudioQuery音韻解析 + リップシンクシステム初期化完了（高速化版）")
    
    def synthesize(self, text: str, style_id: Optional[int] = None) -> bytes:
        """音声合成"""
        try:
            if style_id is None:
                style_id = self.style_id
            
            audio_query = self.voicevox.synthesizer.create_audio_query(text, style_id)
            audio_query.speed_scale = self.speed_scale
            audio_query.pitch_scale = self.pitch_scale
            audio_query.intonation_scale = self.intonation_scale
            
            wav_data = self.voicevox.synthesizer.synthesis(audio_query, style_id)
            return wav_data
            
        except Exception as e:
            logger.error(f"❌ 音声合成エラー: {e}")
            return b""
    
    async def speak_with_audioquery_lipsync(self, text: str, style_id: Optional[int] = None) -> bool:
        """AudioQuery音韻解析を使用したリップシンク発話"""
        
        if not self._speech_lock.acquire(blocking=False):
            logger.info("🛑 他の発話が進行中のため、この発話をスキップ")
            return False
        
        try:
            logger.info(f"📢 AudioQuery音韻解析リップシンク発話開始: '{text}'")
            self.is_speaking = True
            
            # 1. AudioQuery音韻解析
            logger.info("🔤 AudioQuery音韻解析実行中...")
            mouth_sequence = self.analyzer.get_mouth_shape_sequence(text, style_id or self.style_id)
            
            if not mouth_sequence:
                logger.error("❌ 音韻解析結果が空です")
                return False
            
            # 2. 音声合成
            logger.info("🎵 音声合成中...")
            wav_data = self.synthesize(text, style_id)
            
            if not wav_data:
                logger.error("❌ 音声合成に失敗しました")
                return False
            
            # 3. 実際の音声長を取得
            actual_audio_duration = self.audio_player._get_wav_duration(wav_data)
            logger.info(f"🎵 実際の音声長: {actual_audio_duration:.2f}秒")
            
            # 4. 音韻シーケンスを実際の音声長に合わせて調整
            adjusted_sequence = self._adjust_sequence_to_audio_length(mouth_sequence, actual_audio_duration)
            
            # 5. 音声再生とリップシンクを並行実行
            audio_result = {'start_time': 0.0, 'completed': False}
            
            # 音声再生スレッドを開始
            audio_thread = self._start_audio_playback(wav_data, audio_result)
            
            if not self.is_speaking:
                logger.info("🛑 発話開始時に中断されました")
                return False
            
            # 6. おしゃべりモードを有効化するタスクを開始
            talking_mode_task = asyncio.create_task(self._delayed_talking_mode_activation())
            
            # 7. 調整された音韻に基づいたリップシンク実行
            logger.info("🎭 AudioQuery同期リップシンク開始")
            await self._execute_audioquery_lipsync(adjusted_sequence, audio_result)
            
            # おしゃべりモード有効化タスクの完了を待機（まだ完了していない場合）
            if not talking_mode_task.done():
                await talking_mode_task
            
            # 8. 音声再生の完了を待機
            while not audio_result['completed'] and self.is_speaking:
                await asyncio.sleep(0.05)
            
            # 9. リップシンク終了 - 口を「i」の形にして終了（高速化）
            self.talking_controller.set_mouth_pattern_fast('mouth_i')
            
            # おしゃべりモード無効化
            self.talking_controller.set_talking_mode(False)
            self.is_speaking = False
            
            logger.info("✅ AudioQuery音韻解析リップシンク発話完了")
            return True
            
        except Exception as e:
            logger.error(f"❌ AudioQuery音韻解析リップシンク発話エラー: {e}")
            
            # エラー時も口を「i」の形にして終了（高速化）
            self.talking_controller.set_mouth_pattern_fast('mouth_i')
            self.talking_controller.set_talking_mode(False)
            self.is_speaking = False
            return False
        finally:
            self._speech_lock.release()
    
    def _adjust_sequence_to_audio_length(self, mouth_sequence: List[Tuple[str, float]], actual_duration: float) -> List[Tuple[str, float]]:
        """音韻シーケンスを実際の音声長に合わせて調整"""
        if not mouth_sequence:
            return []
        
        # 現在の総時間を計算
        current_total = sum(duration for _, duration in mouth_sequence)
        
        if current_total == 0:
            return mouth_sequence
        
        # 調整比率を計算
        adjustment_ratio = actual_duration / current_total
        
        logger.info(f"🔧 時間調整: 計算時間 {current_total:.2f}秒 → 実際時間 {actual_duration:.2f}秒 (比率: {adjustment_ratio:.2f})")
        
        # 各音韻の時間を調整
        adjusted_sequence = []
        for mouth_shape, duration in mouth_sequence:
            adjusted_duration = duration * adjustment_ratio
            # 最小時間を保証（短すぎると認識しにくい）
            # 高速化のため最小時間をさらに短縮
            adjusted_duration = max(adjusted_duration, 0.03)
            adjusted_sequence.append((mouth_shape, adjusted_duration))
        
        return adjusted_sequence
    
    async def _delayed_talking_mode_activation(self):
        """0.5秒後におしゃべりモードを有効化"""
        try:
            logger.info("⏰ 0.5秒待機中（おしゃべりモード有効化まで）...")
            await asyncio.sleep(0.5)
            
            if self.is_speaking:
                logger.info("🎭 0.5秒経過 - おしゃべりモード有効化")
                if not self.talking_controller.set_talking_mode(True):
                    logger.warning("⚠️ おしゃべりモード有効化に失敗（サーバー接続エラー）")
                else:
                    logger.info("✅ おしゃべりモード有効化成功")
            else:
                logger.info("🛑 発話が停止済みのため、おしゃべりモード有効化をスキップ")
                
        except Exception as e:
            logger.error(f"❌ 遅延おしゃべりモード有効化エラー: {e}")
    
    async def _execute_audioquery_lipsync(self, mouth_sequence: List[Tuple[str, float]], audio_result: dict):
        """AudioQuery音韻に基づくリップシンクを実行（高速化版）"""
        try:
            elapsed_time = 0.0
            last_pattern = None  # 冗長リクエスト防止
            
            # セッションクリーンアップのカウンター更新
            self._session_cleanup_counter += 1
            if self._session_cleanup_counter >= self._session_cleanup_interval:
                self.talking_controller.cleanup_session()
                self._session_cleanup_counter = 0
                logger.debug("🧹 HTTPセッションクリーンアップ実行")
            
            for i, (mouth_shape, duration) in enumerate(mouth_sequence):
                if not self.is_speaking:
                    break
                
                # 音韻解析の口形状をサーバー形式に変換
                server_pattern = f"mouth_{mouth_shape}" if mouth_shape else "mouth_i"
                
                # 冗長リクエストを防ぐ（同じパターンの場合はスキップ）
                if server_pattern != last_pattern:
                    # 高速HTTPリクエスト（非ブロッキング風に処理）
                    success = self.talking_controller.set_mouth_pattern_fast(server_pattern)
                    if success:
                        last_pattern = server_pattern
                
                # 高精度タイミング制御
                loop_start = time.time()
                await asyncio.sleep(max(0.001, duration - 0.005))  # 少し早めに終了
                
                # 実際の経過時間を記録
                actual_duration = time.time() - loop_start
                elapsed_time += actual_duration
            
            logger.info(f"🎭 AudioQueryリップシンク完了 (総時間: {elapsed_time:.2f}秒)")
            
        except Exception as e:
            logger.error(f"❌ AudioQueryリップシンク実行エラー: {e}")
    
    def _start_audio_playback(self, wav_data: bytes, result_dict: dict):
        """音声再生を非同期で開始"""
        def play_audio():
            if not self.is_speaking:
                result_dict['completed'] = True
                result_dict['start_time'] = time.time()
                return
            
            start_time = time.time()
            result_dict['start_time'] = start_time
            
            try:
                duration = self.audio_player.play_wav_data(wav_data)
                actual_time = time.time() - start_time
                
                result_dict['completed'] = True
                
                if self.is_speaking:
                    logger.info(f"🔊 音声再生完了 (実時間: {actual_time:.2f}秒)")
                
            except Exception as e:
                logger.error(f"❌ 音声再生エラー: {e}")
                result_dict['completed'] = True
        
        thread = threading.Thread(target=play_audio, daemon=True)
        thread.start()
        return thread
    
    def speak_sync(self, text: str, style_id: Optional[int] = None) -> bool:
        """同期的にAudioQuery音韻解析リップシンク発話"""
        return asyncio.run(self.speak_with_audioquery_lipsync(text, style_id))
    
    def stop_speaking(self):
        """現在の発話を停止（高速化版）"""
        if self.is_speaking:
            logger.info("🛑 発話を中断します...")
            self.is_speaking = False
            
            # 高速終了処理
            self.talking_controller.set_mouth_pattern_fast('mouth_i')
            self.talking_controller.set_talking_mode(False)
            
            time.sleep(0.05)  # 短縮
            logger.info("✅ 発話を中断しました（口形状: i）")

class AudioQueryPhonemeConsole:
    """AudioQuery音韻解析コンソール"""
    
    def __init__(self, voicevox_synthesizer: VoiceVoxSynthesizer):
        self.voicevox = voicevox_synthesizer
        self.analyzer = AudioQueryPhonemeAnalyzer(voicevox_synthesizer.synthesizer)
        self.current_style_id = voicevox_synthesizer.default_style_id
        self.is_running = False
        
        # サンプルテキスト
        self.sample_texts = {
            "1": "坂本先輩",
            "2": "こんにちは、音韻解析のテストです",
            "3": "私の名前はシリウスです",
            "4": "今日はとても良い天気ですね",
            "5": "AudioQueryを使った音韻解析システム",
            "6": "あいうえお、かきくけこ、さしすせそ",
        }
    
    def show_help(self):
        """ヘルプ表示"""
        logger.info("🤖 AudioQuery音韻解析システム")
        logger.info("利用可能なコマンド:")
        
        for key, text in self.sample_texts.items():
            short_text = text[:20] + "..." if len(text) > 20 else text
            logger.info(f"  {key}: サンプル解析 - '{short_text}'")
        
        logger.info("  C: カスタムテキスト解析")
        logger.info("  L: 利用可能なスタイル一覧")
        logger.info("  S: スタイル変更")
        logger.info("  T: 現在の設定表示")
        logger.info("  H: ヘルプ表示")
        logger.info("  Q: 終了")
    
    def show_styles(self):
        """利用可能なスタイル一覧を表示"""
        styles = self.voicevox.available_styles
        logger.info("📋 利用可能なスタイル:")
        for i, style in enumerate(styles):
            current = " ← 現在選択中" if style['style_id'] == self.current_style_id else ""
            logger.info(f"  {i+1:2d}. {style['character']} - {style['style_name']} (ID: {style['style_id']}){current}")
    
    def set_style(self):
        """スタイル設定"""
        try:
            styles = self.voicevox.available_styles
            print("\n🎵 スタイル設定:")
            print("利用可能なスタイル:")
            for i, style in enumerate(styles):
                current = " ← 現在選択中" if style['style_id'] == self.current_style_id else ""
                print(f"  {i+1:2d}. {style['character']} - {style['style_name']} (ID: {style['style_id']}){current}")
            
            style_choice = input("スタイル番号を選択: ").strip()
            if style_choice:
                try:
                    style_index = int(style_choice) - 1
                    if 0 <= style_index < len(styles):
                        self.current_style_id = styles[style_index]['style_id']
                        selected_style = styles[style_index]
                        logger.info(f"✅ スタイル変更: {selected_style['character']} - {selected_style['style_name']} (ID: {self.current_style_id})")
                    else:
                        logger.warning("❌ 無効な番号です")
                except ValueError:
                    logger.warning("❌ 数値を入力してください")
            
        except Exception as e:
            logger.warning(f"❌ スタイル設定エラー: {e}")
    
    def analyze_sample(self, key: str):
        """サンプルテキストを解析"""
        if key in self.sample_texts:
            text = self.sample_texts[key]
            logger.info(f"🔍 サンプル解析開始: '{text}'")
            self.analyzer.print_analysis(text, self.current_style_id)
        else:
            logger.warning(f"❌ サンプル'{key}'は存在しません")
    
    def analyze_custom(self):
        """カスタムテキストを解析"""
        text = input("解析するテキストを入力してください: ").strip()
        if text:
            logger.info(f"🔍 カスタム解析開始: '{text}'")
            self.analyzer.print_analysis(text, self.current_style_id)
        else:
            logger.warning("テキストが入力されませんでした")
    
    def show_status(self):
        """現在の設定表示"""
        current_style = next((s for s in self.voicevox.available_styles if s['style_id'] == self.current_style_id), None)
        logger.info("📊 現在の設定:")
        if current_style:
            logger.info(f"  スタイル: {current_style['character']} - {current_style['style_name']} (ID: {self.current_style_id})")
        logger.info(f"  利用可能なスタイル数: {len(self.voicevox.available_styles)}")
    
    def start(self):
        """コンソール開始"""
        self.is_running = True
        logger.info("🤖 AudioQuery音韻解析システム起動")
        self.show_help()
        
        try:
            while self.is_running:
                try:
                    command = input("\n> ").strip().upper()
                    
                    if command in self.sample_texts:
                        self.analyze_sample(command)
                    elif command == "C":
                        self.analyze_custom()
                    elif command == "L":
                        self.show_styles()
                    elif command == "S":
                        self.set_style()
                    elif command == "T":
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
        
        except Exception as e:
            logger.error(f"システムエラー: {e}")

def main():
    """メイン関数"""
    parser = argparse.ArgumentParser(description='AudioQuery音韻解析 + リップシンクシステム')
    parser.add_argument('--server', default='http://localhost:8080',
                       help='HTTPサーバーのURL (デフォルト: http://localhost:8080)')
    parser.add_argument('--onnxruntime', default=get_default_onnxruntime_path(),
                       help='ONNX Runtimeライブラリのパス')
    parser.add_argument('--dict-dir', default='./voicevox_core/dict/open_jtalk_dic_utf_8-1.11',
                       help='Open JTalk辞書ディレクトリ')
    parser.add_argument('--model', default='./voicevox_core/models/vvms/13.vvm',
                       help='VOICEVOXモデルファイルのパス')
    parser.add_argument('--text', type=str,
                       help='音韻解析するテキスト（指定した場合は解析のみ実行）')
    parser.add_argument('--speak', type=str,
                       help='発話させるテキスト（指定した場合はリップシンク発話して終了）')
    parser.add_argument('--style-id', type=int, default=54,
                       help='スタイルID')
    parser.add_argument('--mode', choices=['analyze', 'speak', 'console'], default='console',
                       help='動作モード: analyze=解析のみ, speak=リップシンク発話, console=対話型')
    
    args = parser.parse_args()
    
    try:
        # ファイル存在チェック
        logger.info(f"🔍 ファイル存在チェック:")
        logger.info(f"  ONNX Runtime: {args.onnxruntime} - {'存在' if os.path.exists(args.onnxruntime) else '存在しない'}")
        logger.info(f"  辞書: {args.dict_dir} - {'存在' if os.path.exists(args.dict_dir) else '存在しない'}")
        logger.info(f"  モデル: {args.model} - {'存在' if os.path.exists(args.model) else '存在しない'}")
        
        if args.text:
            # テキスト解析のみ
            logger.info("📊 AudioQuery音韻解析モード")
            voicevox = VoiceVoxSynthesizer(args.onnxruntime, args.dict_dir, args.model)
            analyzer = AudioQueryPhonemeAnalyzer(voicevox.synthesizer)
            analyzer.print_analysis(args.text, args.style_id)
            
        elif args.speak:
            # リップシンク発話モード
            logger.info("🎭 AudioQueryリップシンク発話モード")
            speaker = AudioQueryLipSyncSpeaker(args.server, args.onnxruntime, args.dict_dir, args.model)
            speaker.style_id = args.style_id
            speaker.speak_sync(args.speak, args.style_id)
            
        else:
            # コンソールモード - AudioQueryリップシンク対応
            logger.info("🤖 AudioQueryリップシンクコンソールモード")
            
            # リップシンク機能付きスピーカーを初期化
            speaker = AudioQueryLipSyncSpeaker(args.server, args.onnxruntime, args.dict_dir, args.model)
            speaker.style_id = args.style_id
            
            # 簡易コンソール
            logger.info("🤖 AudioQuery音韻解析 + リップシンクシステム起動")
            logger.info("コマンド:")
            logger.info("  1: 'こんにちは、AudioQuery音韻解析のテストです' - リップシンク発話")
            logger.info("  2: '坂本先輩、お疲れ様です' - リップシンク発話（漢字テスト）")
            logger.info("  3: 'あいうえお、かきくけこ、さしすせそ' - リップシンク発話")
            logger.info("  C: カスタムテキストでリップシンク発話")
            logger.info("  A: カスタムテキストで音韻解析のみ")
            logger.info("  Q: 終了")
            
            sample_texts = {
                "1": "僕の名前はシリウスです",
                "2": "坂本先輩、お疲れ様です",
                "3": "あいうえお、かきくけこ、さしすせそ"
            }
            
            try:
                while True:
                    command = input("\n> ").strip().upper()
                    
                    if command in sample_texts:
                        text = sample_texts[command]
                        logger.info(f"🎭 サンプル発話: '{text}'")
                        threading.Thread(target=lambda: speaker.speak_sync(text), daemon=True).start()
                        
                    elif command == "C":
                        custom_text = input("発話させたいテキストを入力してください: ").strip()
                        if custom_text:
                            logger.info(f"🎭 カスタム発話: '{custom_text}'")
                            threading.Thread(target=lambda: speaker.speak_sync(custom_text), daemon=True).start()
                        else:
                            logger.warning("テキストが入力されませんでした")
                            
                    elif command == "A":
                        custom_text = input("解析するテキストを入力してください: ").strip()
                        if custom_text:
                            logger.info(f"🔍 カスタム音韻解析: '{custom_text}'")
                            speaker.analyzer.print_analysis(custom_text, speaker.style_id)
                        else:
                            logger.warning("テキストが入力されませんでした")
                            
                    elif command == "Q":
                        speaker.stop_speaking()
                        # 高速終了処理
                        speaker.talking_controller.set_mouth_pattern_fast('mouth_i')
                        logger.info("👋 システム終了")
                        break
                        
                    else:
                        logger.warning("無効なコマンドです")
                        
            except KeyboardInterrupt:
                speaker.stop_speaking()
                # Ctrl+C終了時も高速処理
                speaker.talking_controller.set_mouth_pattern_fast('mouth_i')
                logger.info("\n👋 システム終了")
            
    except Exception as e:
        logger.error(f"❌ システム初期化エラー: {e}")
        import traceback
        logger.error(f"❌ エラー詳細: {traceback.format_exc()}")

if __name__ == "__main__":
    main()

"""
使用例:

# コンソールモード（対話的）
python3 audioquery_phoneme.py

# 特定テキストの音韻解析
python3 audioquery_phoneme.py --text "坂本先輩" --style-id 54

# パラメータ指定
python3 audioquery_phoneme.py --model ./voicevox_core/models/vvms/13.vvm --style-id 54
"""
