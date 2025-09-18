#!/usr/bin/env python3
"""
音韻解析リップシンクシステム
日本語テキストを音韻解析し、a,i,o,uの口形状に自動マッピング
VOICEVOXの音韻情報を活用して精密なリップシンクを実現
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
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
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

class PhonemeAnalyzer:
    """音韻解析クラス - 日本語音韻をa,i,o,uの口形状にマッピング"""
    
    def __init__(self):
        # 日本語音韻から口形状への詳細マッピング
        self.phoneme_to_mouth = {
            # あ行 - 口を大きく開く
            'a': 'a', 'あ': 'a',
            
            # い行 - 口を横に広げる
            'i': 'i', 'い': 'i',
            'y': 'i',  # やゆよの前半
            
            # う行 - 口をすぼめる
            'u': 'u', 'う': 'u',
            'w': 'u',  # わをんの前半
            
            # え行 - 中間的な開き
            'e': 'a', 'え': 'a',  # aに近い開き方
            
            # お行 - 丸い口の形
            'o': 'o', 'お': 'o',
            
            # 子音 + 母音の組み合わせ
            # か行
            'ka': 'a', 'ki': 'i', 'ku': 'u', 'ke': 'a', 'ko': 'o',
            'ga': 'a', 'gi': 'i', 'gu': 'u', 'ge': 'a', 'go': 'o',
            
            # さ行
            'sa': 'a', 'si': 'i', 'su': 'u', 'se': 'a', 'so': 'o',
            'za': 'a', 'zi': 'i', 'zu': 'u', 'ze': 'a', 'zo': 'o',
            'sha': 'a', 'shi': 'i', 'shu': 'u', 'she': 'a', 'sho': 'o',
            'ja': 'a', 'ji': 'i', 'ju': 'u', 'je': 'a', 'jo': 'o',
            
            # た行
            'ta': 'a', 'ti': 'i', 'tu': 'u', 'te': 'a', 'to': 'o',
            'da': 'a', 'di': 'i', 'du': 'u', 'de': 'a', 'do': 'o',
            'cha': 'a', 'chi': 'i', 'chu': 'u', 'che': 'a', 'cho': 'o',
            'tsu': 'u',
            
            # な行
            'na': 'a', 'ni': 'i', 'nu': 'u', 'ne': 'a', 'no': 'o',
            'nya': 'a', 'nyi': 'i', 'nyu': 'u', 'nye': 'a', 'nyo': 'o',
            
            # は行
            'ha': 'a', 'hi': 'i', 'hu': 'u', 'he': 'a', 'ho': 'o',
            'ba': 'a', 'bi': 'i', 'bu': 'u', 'be': 'a', 'bo': 'o',
            'pa': 'a', 'pi': 'i', 'pu': 'u', 'pe': 'a', 'po': 'o',
            'hya': 'a', 'hyi': 'i', 'hyu': 'u', 'hye': 'a', 'hyo': 'o',
            'bya': 'a', 'byi': 'i', 'byu': 'u', 'bye': 'a', 'byo': 'o',
            'pya': 'a', 'pyi': 'i', 'pyu': 'u', 'pye': 'a', 'pyo': 'o',
            
            # ま行
            'ma': 'a', 'mi': 'i', 'mu': 'u', 'me': 'a', 'mo': 'o',
            'mya': 'a', 'myi': 'i', 'myu': 'u', 'mye': 'a', 'myo': 'o',
            
            # や行
            'ya': 'a', 'yu': 'u', 'yo': 'o',
            
            # ら行
            'ra': 'a', 'ri': 'i', 'ru': 'u', 're': 'a', 'ro': 'o',
            'rya': 'a', 'ryi': 'i', 'ryu': 'u', 'rye': 'a', 'ryo': 'o',
            
            # わ行
            'wa': 'a', 'wi': 'i', 'we': 'a', 'wo': 'o',
            
            # ん
            'n': 'i', 'ん': 'i',
            
            # 長音・促音
            'ー': None,  # 前の音韻を継続
            'っ': None,  # 口を閉じる（無音）
            
            # 無音・ポーズ
            'sil': None,  # 無音
            'pau': None,  # ポーズ
            '': None,
        }
        
        # 3つの基本口形状に簡略化
        self.mouth_shape_mapping = {
            'a': 'a',  # 大きく開く（あえお系）
            'i': 'i',  # 横に広げる（い系）
            'o': 'o',  # 丸くすぼめる（うお系）
            'u': 'o',  # うもoに統合
        }
    
    def analyze_phonemes_from_text(self, text: str) -> List[Tuple[str, str, float]]:
        """
        テキストから音韻解析を行い、口形状のタイムラインを生成
        
        Returns:
            List[Tuple[str, str, float]]: (音韻, 口形状, 継続時間) のリスト
        """
        try:
            phoneme_timeline = []
            char_duration = 0.25  # より短く調整（秒）
            current_time = 0.0
            
            # ひらがな・カタカナマッピング
            hiragana_to_mouth = {
                'あ': 'a', 'い': 'i', 'う': 'o', 'え': 'a', 'お': 'o',
                'か': 'a', 'き': 'i', 'く': 'o', 'け': 'a', 'こ': 'o',
                'が': 'a', 'ぎ': 'i', 'ぐ': 'o', 'げ': 'a', 'ご': 'o',
                'さ': 'a', 'し': 'i', 'す': 'o', 'せ': 'a', 'そ': 'o',
                'ざ': 'a', 'じ': 'i', 'ず': 'o', 'ぜ': 'a', 'ぞ': 'o',
                'た': 'a', 'ち': 'i', 'つ': 'o', 'て': 'a', 'と': 'o',
                'だ': 'a', 'ぢ': 'i', 'づ': 'o', 'で': 'a', 'ど': 'o',
                'な': 'a', 'に': 'i', 'ぬ': 'o', 'ね': 'a', 'の': 'o',
                'は': 'a', 'ひ': 'i', 'ふ': 'o', 'へ': 'a', 'ほ': 'o',
                'ば': 'a', 'び': 'i', 'ぶ': 'o', 'べ': 'a', 'ぼ': 'o',
                'ぱ': 'a', 'ぴ': 'i', 'ぷ': 'o', 'ぺ': 'a', 'ぽ': 'o',
                'ま': 'a', 'み': 'i', 'む': 'o', 'め': 'a', 'も': 'o',
                'や': 'a', 'ゆ': 'o', 'よ': 'o',
                'ら': 'a', 'り': 'i', 'る': 'o', 'れ': 'a', 'ろ': 'o',
                'わ': 'a', 'ゐ': 'i', 'ゑ': 'a', 'を': 'o', 'ん': 'o',
                'ー': None, 'っ': None,
            }
            
            # カタカナも同様にマッピング
            katakana_to_mouth = {
                'ア': 'a', 'イ': 'i', 'ウ': 'o', 'エ': 'a', 'オ': 'o',
                'カ': 'a', 'キ': 'i', 'ク': 'o', 'ケ': 'a', 'コ': 'o',
                'ガ': 'a', 'ギ': 'i', 'グ': 'o', 'ゲ': 'a', 'ゴ': 'o',
                'サ': 'a', 'シ': 'i', 'ス': 'o', 'セ': 'a', 'ソ': 'o',
                'ザ': 'a', 'ジ': 'i', 'ズ': 'o', 'ゼ': 'a', 'ゾ': 'o',
                'タ': 'a', 'チ': 'i', 'ツ': 'o', 'テ': 'a', 'ト': 'o',
                'ダ': 'a', 'ヂ': 'i', 'ヅ': 'o', 'デ': 'a', 'ド': 'o',
                'ナ': 'a', 'ニ': 'i', 'ヌ': 'o', 'ネ': 'a', 'ノ': 'o',
                'ハ': 'a', 'ヒ': 'i', 'フ': 'o', 'ヘ': 'a', 'ホ': 'o',
                'バ': 'a', 'ビ': 'i', 'ブ': 'o', 'ベ': 'a', 'ボ': 'o',
                'パ': 'a', 'ピ': 'i', 'プ': 'o', 'ペ': 'a', 'ポ': 'o',
                'マ': 'a', 'ミ': 'i', 'ム': 'o', 'メ': 'a', 'モ': 'o',
                'ヤ': 'a', 'ユ': 'o', 'ヨ': 'o',
                'ラ': 'a', 'リ': 'i', 'ル': 'o', 'レ': 'a', 'ロ': 'o',
                'ワ': 'a', 'ヰ': 'i', 'ヱ': 'a', 'ヲ': 'o', 'ン': 'o',
                'ー': None, 'ッ': None,
            }
            
            for char in text:
                mouth_shape = None
                
                if char in hiragana_to_mouth:
                    mouth_shape = hiragana_to_mouth[char]
                elif char in katakana_to_mouth:
                    mouth_shape = katakana_to_mouth[char]
                elif char in '。！？':
                    # 句読点の場合は長めの無音
                    phoneme_timeline.append((char, None, 0.6))
                    current_time += 0.6
                    continue
                elif char in '、':
                    # 読点の場合は短い無音
                    phoneme_timeline.append((char, None, 0.2))
                    current_time += 0.2
                    continue
                elif char == ' ' or char == '　':
                    # スペースの場合は短い無音
                    phoneme_timeline.append((char, None, 0.2))
                    current_time += 0.2
                    continue
                else:
                    # その他の文字（漢字など）は'a'として扱う
                    mouth_shape = 'a'
                
                # 有効な口形状がある場合のみ追加
                if mouth_shape:
                    phoneme_timeline.append((char, mouth_shape, char_duration))
                    current_time += char_duration
            
            logger.info(f"🔤 音韻解析完了: {len(phoneme_timeline)}音韻, 総時間: {current_time:.2f}秒")
            return phoneme_timeline
            
        except Exception as e:
            logger.error(f"❌ 音韻解析エラー: {e}")
            return []
    
    def get_mouth_shape_sequence(self, text: str) -> List[Tuple[str, float]]:
        """
        テキストから口形状シーケンスを生成
        
        Returns:
            List[Tuple[str, float]]: (口形状, 継続時間) のリスト
        """
        phoneme_timeline = self.analyze_phonemes_from_text(text)
        mouth_sequence = []
        
        for phoneme, mouth_shape, duration in phoneme_timeline:
            if mouth_shape:  # Noneでない場合のみ追加
                mouth_sequence.append((mouth_shape, duration))
        
        return mouth_sequence

class MouthPatternController:
    """口形状パターン制御クラス"""
    
    def __init__(self, server_url="http://localhost:8080"):
        self.server_url = server_url
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        # 音韻解析の口形状からサーバーの口パターンへのマッピング
        self.mouth_mapping = {
            'a': 'mouth_a',
            'i': 'mouth_i', 
            'o': 'mouth_o',
            'neutral': None
        }
    
    def set_mouth_pattern(self, mouth_shape: str) -> bool:
        """口形状を設定"""
        try:
            # 音韻解析の形状をサーバー形式に変換
            server_pattern = self.mouth_mapping.get(mouth_shape, mouth_shape)
            
            logger.debug(f"口形状変換: {mouth_shape} → {server_pattern}")
            
            response = self.session.post(
                f"{self.server_url}/mouth_pattern",
                json={'mouth_pattern': server_pattern},
                timeout=1
            )
            
            if response.status_code == 200:
                logger.debug(f"✅ 口形状設定成功: {server_pattern}")
                return True
            else:
                logger.debug(f"❌ 口形状設定失敗: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.debug(f"口形状設定エラー: {e}")
            return False
    
    def clear_mouth_pattern(self) -> bool:
        """口形状をクリア"""
        try:
            response = self.session.post(
                f"{self.server_url}/mouth_pattern",
                json={'mouth_pattern': None},
                timeout=1
            )
            return response.status_code == 200
        except Exception as e:
            logger.debug(f"口形状クリアエラー: {e}")
            return False

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
            return True
        
        try:
            response = self.session.post(
                f"{self.server_url}/talking_mouth_mode",
                json={'talking_mouth_mode': enabled},
                timeout=3
            )
            
            if response.status_code == 200:
                self.is_talking_mode_active = enabled
                return True
            else:
                return False
                
        except Exception as e:
            logger.error(f"❌ おしゃべりモード設定エラー: {e}")
            return False

class AudioPlayer:
    """音声再生クラス（voicevox_lipsync.pyから移植）"""
    
    def __init__(self):
        self.is_playing = False
        self.current_process = None
    
    def play_wav_data(self, wav_data: bytes) -> float:
        """WAVデータを再生し、実際の再生時間を返す"""
        try:
            duration = self._get_wav_duration(wav_data)
            
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
            return 2.0
    
    def _play_with_pygame(self, wav_data: bytes) -> float:
        """pygame使用して音声を再生"""
        try:
            pygame.mixer.init()
            
            start_time = time.time()
            audio_buffer = io.BytesIO(wav_data)
            pygame.mixer.music.load(audio_buffer)
            pygame.mixer.music.play()
            
            while pygame.mixer.music.get_busy():
                time.sleep(0.01)
            
            actual_duration = time.time() - start_time
            pygame.mixer.quit()
            
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
        """システムコマンドで音声再生"""
        try:
            start_time = time.time()
            
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
                temp_file.write(wav_data)
                temp_path = temp_file.name
            
            import subprocess
            system = platform.system().lower()
            
            try:
                if system == "darwin":  # macOS
                    subprocess.run(['afplay', temp_path], check=True)
                elif system == "linux":
                    commands_to_try = [
                        ['aplay', temp_path],
                        ['paplay', temp_path],
                        ['play', temp_path],
                    ]
                    
                    for cmd in commands_to_try:
                        try:
                            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                            break
                        except (subprocess.CalledProcessError, FileNotFoundError):
                            continue
                        
            finally:
                try:
                    os.unlink(temp_path)
                except:
                    pass
            
            actual_duration = time.time() - start_time
            return actual_duration
            
        except Exception as e:
            logger.error(f"❌ システム再生エラー: {e}")
            return 0.0

class VoiceVoxSynthesizer:
    """VOICEVOX音声合成クラス（voicevox_lipsync.pyから移植）"""
    
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
    
    def synthesize(self, text: str, style_id: Optional[int] = None, 
                   speed_scale: float = 1.0, pitch_scale: float = 0.08, 
                   intonation_scale: float = 0.0) -> bytes:
        """音声合成を実行"""
        try:
            if style_id is None:
                style_id = self.default_style_id
            
            valid_style_ids = [s['style_id'] for s in self.available_styles]
            if style_id not in valid_style_ids:
                style_id = self.default_style_id
            
            audio_query = self.synthesizer.create_audio_query(text, style_id)
            audio_query.speed_scale = speed_scale
            audio_query.pitch_scale = pitch_scale  
            audio_query.intonation_scale = intonation_scale
            
            wav_data = self.synthesizer.synthesis(audio_query, style_id)
            return wav_data
            
        except Exception as e:
            logger.error(f"❌ 音声合成エラー: {e}")
            return b""

class PhonemeLipSyncSpeaker:
    """音韻解析リップシンク発話システム"""
    
    def __init__(self, server_url="http://localhost:8080", 
                 voicevox_onnxruntime_path="./voicevox_core/onnxruntime/lib/libvoicevox_onnxruntime.1.17.3.dylib",
                 open_jtalk_dict_dir="./voicevox_core/dict/open_jtalk_dic_utf_8-1.11",
                 model_path="./voicevox_core/models/vvms/1.vvm"):
        
        self.phoneme_analyzer = PhonemeAnalyzer()
        self.mouth_controller = MouthPatternController(server_url)
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
        
        logger.info("🤖 音韻解析リップシンクシステム初期化完了")
    
    async def speak_with_phoneme_lipsync(self, text: str, style_id: Optional[int] = None) -> bool:
        """音韻解析を使用したリップシンク発話（改良版 - 音声長に合わせて動的調整）"""
        
        if not self._speech_lock.acquire(blocking=False):
            logger.info("🛑 他の発話が進行中のため、この発話をスキップ")
            return False
        
        try:
            logger.info(f"📢 音韻解析リップシンク発話開始: '{text}'")
            self.is_speaking = True
            
            # 1. 音韻解析
            logger.info("🔤 音韻解析実行中...")
            mouth_sequence = self.phoneme_analyzer.get_mouth_shape_sequence(text)
            
            if not mouth_sequence:
                logger.warning("⚠️ 音韻解析結果が空です")
                return False
            
            # 2. 音声合成
            logger.info("🎵 音声合成中...")
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
            
            # 3. 実際の音声長を取得
            actual_audio_duration = self.audio_player._get_wav_duration(wav_data)
            logger.info(f"🎵 実際の音声長: {actual_audio_duration:.2f}秒")
            
            # 4. 音韻シーケンスを実際の音声長に合わせて調整
            adjusted_sequence = self._adjust_sequence_to_audio_length(mouth_sequence, actual_audio_duration)
            
            logger.info("🎭 調整後の口形状シーケンス:")
            for i, (mouth_shape, duration) in enumerate(adjusted_sequence):
                logger.info(f"  {i+1}. {mouth_shape} ({duration:.2f}秒)")
            
            # 5. 音声再生とリップシンクを並行実行
            audio_result = {'start_time': 0.0, 'completed': False}
            
            # 音声再生スレッドを開始
            audio_thread = self._start_audio_playback(wav_data, audio_result)
            
            # 少し待ってからリップシンク開始
            await asyncio.sleep(0.1)
            
            if not self.is_speaking:
                logger.info("🛑 発話開始時に中断されました")
                return False
            
            # 6. 調整された音韻に基づいたリップシンク実行
            logger.info("🎭 同期リップシンク開始")
            await self._execute_synced_phoneme_lipsync(adjusted_sequence, audio_result)
            
            # 7. 音声再生の完了を待機
            while not audio_result['completed'] and self.is_speaking:
                await asyncio.sleep(0.05)
            
            # 8. リップシンク終了
            self.mouth_controller.clear_mouth_pattern()
            self.is_speaking = False
            
            logger.info("✅ 音韻解析リップシンク発話完了")
            return True
            
        except Exception as e:
            logger.error(f"❌ 音韻解析リップシンク発話エラー: {e}")
            self.mouth_controller.clear_mouth_pattern()
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
            adjusted_duration = max(adjusted_duration, 0.1)
            adjusted_sequence.append((mouth_shape, adjusted_duration))
        
        return adjusted_sequence
    
    async def _execute_synced_phoneme_lipsync(self, mouth_sequence: List[Tuple[str, float]], audio_result: dict):
        """音声再生と同期したリップシンクを実行"""
        try:
            # 音声再生開始時刻を記録
            start_time = time.time()
            audio_result['start_time'] = start_time
            
            elapsed_time = 0.0
            
            for i, (mouth_shape, duration) in enumerate(mouth_sequence):
                if not self.is_speaking:
                    break
                
                # 音声再生が完了していたら終了
                if audio_result['completed']:
                    logger.info("🔊 音声再生完了を検出、リップシンク終了")
                    break
                
                # 口形状を設定
                self.mouth_controller.set_mouth_pattern(mouth_shape)
                logger.debug(f"🎭 口形状: {mouth_shape} ({duration:.2f}秒) - 経過時間: {elapsed_time:.2f}秒")
                
                # 指定時間待機（但し音声再生の進行をチェック）
                sleep_interval = 0.05  # 細かい間隔でチェック
                segment_elapsed = 0.0
                
                while segment_elapsed < duration and self.is_speaking:
                    await asyncio.sleep(sleep_interval)
                    segment_elapsed += sleep_interval
                    
                    # 音声再生が完了していたら終了
                    if audio_result['completed']:
                        logger.info("🔊 音声再生完了を検出、リップシンク終了")
                        return
                
                elapsed_time += duration
            
            logger.info(f"🎭 リップシンク完了 (総時間: {elapsed_time:.2f}秒)")
            
        except Exception as e:
            logger.error(f"❌ リップシンク実行エラー: {e}")

    async def _execute_phoneme_lipsync(self, mouth_sequence: List[Tuple[str, float]]):
        """音韻シーケンスに基づいてリップシンクを実行（旧版）"""
        try:
            for mouth_shape, duration in mouth_sequence:
                if not self.is_speaking:
                    break
                
                # 口形状を設定
                self.mouth_controller.set_mouth_pattern(mouth_shape)
                logger.debug(f"🎭 口形状: {mouth_shape} ({duration:.2f}秒)")
                
                # 指定時間待機（より粗い間隔でチェック）
                sleep_interval = 0.1  # 100ms間隔でチェック
                elapsed = 0.0
                
                while elapsed < duration and self.is_speaking:
                    await asyncio.sleep(sleep_interval)
                    elapsed += sleep_interval
            
        except Exception as e:
            logger.error(f"❌ リップシンク実行エラー: {e}")
    
    def _start_audio_playback(self, wav_data: bytes, result_dict: dict):
        """音声再生を非同期で開始（改良版）"""
        def play_audio():
            if not self.is_speaking:
                result_dict['completed'] = True
                result_dict['start_time'] = 0.0
                return
            
            # 音声再生開始時刻を記録
            start_time = time.time()
            result_dict['start_time'] = start_time
            
            try:
                logger.info("🔊 音声再生開始")
                duration = self.audio_player.play_wav_data(wav_data)
                actual_time = time.time() - start_time
                
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
    
    def speak_phoneme_sync(self, text: str, style_id: Optional[int] = None) -> bool:
        """同期的に音韻解析リップシンク発話"""
        return asyncio.run(self.speak_with_phoneme_lipsync(text, style_id))
    
    def analyze_text_only(self, text: str):
        """テキストの音韻解析のみ実行（発話なし）"""
        logger.info(f"🔤 音韻解析のみ実行: '{text}'")
        mouth_sequence = self.phoneme_analyzer.get_mouth_shape_sequence(text)
        
        logger.info("🎭 解析された口形状シーケンス:")
        total_duration = 0.0
        for i, (mouth_shape, duration) in enumerate(mouth_sequence):
            logger.info(f"  {i+1:2d}. {mouth_shape} ({duration:.2f}秒)")
            total_duration += duration
        
        logger.info(f"📊 総継続時間: {total_duration:.2f}秒")
        logger.info(f"📊 口形状変化数: {len(mouth_sequence)}")
        
        # 口形状の統計
        shape_counts = {}
        for mouth_shape, duration in mouth_sequence:
            shape_counts[mouth_shape] = shape_counts.get(mouth_shape, 0) + duration
        
        logger.info("📊 口形状別継続時間:")
        for shape, total_time in sorted(shape_counts.items()):
            percentage = (total_time / total_duration) * 100 if total_duration > 0 else 0
            logger.info(f"  {shape}: {total_time:.2f}秒 ({percentage:.1f}%)")
    
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
            logger.info("🛑 音韻解析リップシンク発話を中断します...")
            self.is_speaking = False
            self.mouth_controller.clear_mouth_pattern()
            time.sleep(0.2)
            logger.info("✅ 音韻解析リップシンク発話を中断しました")

class PhonemeLipSyncConsole:
    """音韻解析リップシンクコンソール"""
    
    def __init__(self, speaker: PhonemeLipSyncSpeaker):
        self.speaker = speaker
        self.is_running = False
        
        # サンプルテキスト
        self.sample_texts = {
            "1": "こんにちは、音韻解析リップシンクのテストです。",
            "2": "あいうえお、かきくけこ、さしすせそ。",
            "3": "私の名前はシリウスです。よろしくお願いします。",
            "4": "今日はとても良い天気ですね。散歩でもしませんか？",
            "5": "音韻解析によって、より自然なリップシンクが可能になります。",
        }
    
    def show_help(self):
        """ヘルプ表示"""
        logger.info("🤖 音韻解析リップシンクシステム")
        logger.info("利用可能なコマンド:")
        
        for key, text in self.sample_texts.items():
            short_text = text[:20] + "..." if len(text) > 20 else text
            logger.info(f"  {key}: サンプル発話 - '{short_text}'")
        
        logger.info("  C: カスタムテキスト発話")
        logger.info("  A: 音韻解析のみ（発話なし）")
        logger.info("  P: 音声パラメータ設定")
        logger.info("  L: 利用可能なスタイル一覧")
        logger.info("  S: システム状態表示")
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
    
    def speak_sample(self, key: str):
        """サンプルテキストを発話"""
        if key in self.sample_texts:
            text = self.sample_texts[key]
            logger.info(f"🎭 サンプル発話開始: '{text}'")
            threading.Thread(
                target=lambda: self.speaker.speak_phoneme_sync(text), 
                daemon=True
            ).start()
        else:
            logger.warning(f"❌ サンプル'{key}'は存在しません")
    
    def analyze_text_only(self):
        """音韻解析のみ実行"""
        text = input("音韻解析するテキストを入力してください: ").strip()
        if text:
            self.speaker.analyze_text_only(text)
        else:
            logger.warning("テキストが入力されませんでした")
    
    def speak_custom(self):
        """カスタムテキストを発話"""
        text = input("発話させたいテキストを入力してください: ").strip()
        if text:
            logger.info(f"🎭 カスタム発話開始: '{text}'")
            threading.Thread(
                target=lambda: self.speaker.speak_phoneme_sync(text), 
                daemon=True
            ).start()
        else:
            logger.warning("テキストが入力されませんでした")
    
    def show_status(self):
        """状態表示"""
        logger.info("📊 現在の状態:")
        logger.info(f"  発話中: {'はい' if self.speaker.is_speaking else 'いいえ'}")
        logger.info(f"  話速: {self.speaker.speed_scale}")
        logger.info(f"  ピッチ: {self.speaker.pitch_scale}")
        logger.info(f"  抑揚: {self.speaker.intonation_scale}")
        logger.info(f"  スタイルID: {self.speaker.style_id}")
        logger.info(f"  利用可能なスタイル数: {len(self.speaker.get_available_styles())}")
    
    def start(self):
        """コンソール開始"""
        self.is_running = True
        logger.info("🤖 音韻解析リップシンクシステム起動")
        self.show_help()
        
        try:
            while self.is_running:
                try:
                    command = input("\n> ").strip().upper()
                    
                    if command in self.sample_texts:
                        self.speak_sample(command)
                    elif command == "C":
                        self.speak_custom()
                    elif command == "A":
                        self.analyze_text_only()
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
    parser = argparse.ArgumentParser(description='音韻解析リップシンクシステム')
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
                       help='発話させるテキスト（指定した場合は発話して終了）')
    parser.add_argument('--style-id', type=int, default=54,
                       help='スタイルID')
    parser.add_argument('--speed', type=float, default=1.0,
                       help='話速 (1.0が標準)')
    parser.add_argument('--pitch', type=float, default=0.0,
                       help='ピッチ (0.0が標準)')
    parser.add_argument('--intonation', type=float, default=0.85,
                       help='抑揚 (1.0が標準)')
    
    args = parser.parse_args()
    
    try:
        # ファイル存在チェック
        logger.info(f"🔍 ファイル存在チェック:")
        logger.info(f"  ONNX Runtime: {args.onnxruntime} - {'存在' if os.path.exists(args.onnxruntime) else '存在しない'}")
        logger.info(f"  辞書: {args.dict_dir} - {'存在' if os.path.exists(args.dict_dir) else '存在しない'}")
        logger.info(f"  モデル: {args.model} - {'存在' if os.path.exists(args.model) else '存在しない'}")
        
        # スピーカー初期化
        speaker = PhonemeLipSyncSpeaker(
            args.server,
            args.onnxruntime,
            args.dict_dir,
            args.model
        )
        
        # 音声パラメータ設定
        speaker.set_voice_parameters(args.speed, args.pitch, args.intonation, args.style_id)
        
        if args.text:
            # テキスト解析のみ
            speaker.analyze_text_only(args.text)
        elif args.speak:
            # 発話実行
            speaker.speak_phoneme_sync(args.speak)
        else:
            # コンソールモード
            console = PhonemeLipSyncConsole(speaker)
            console.start()
            
    except Exception as e:
        logger.error(f"❌ システム初期化エラー: {e}")

if __name__ == "__main__":
    main()

"""
使用例:

# コンソールモード（対話的）
python3 phoneme_lipsync.py

# 音韻解析のみ実行
python3 phoneme_lipsync.py --text "こんにちは、音韻解析のテストです"

# 発話実行
python3 phoneme_lipsync.py --speak "私の名前はシリウスです" --style-id 54

# パラメータ指定
python3 phoneme_lipsync.py --model ./voicevox_core/models/vvms/13.vvm --style-id 54 --speed 1.0 --pitch 0.0 --intonation 0.85
"""
