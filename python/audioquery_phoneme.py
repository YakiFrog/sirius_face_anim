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
import os
import platform
import tempfile
import io
import wave
import subprocess
from typing import Optional, List, Tuple, Dict, Any
from pathlib import Path

# VOICEVOX Core関連のインポート
from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile

# ログ設定
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DialogueManager:
    """JSONファイルでセリフを管理するクラス"""
    
    def __init__(self, dialogue_file_path: str = "./dialogue_data.json"):
        self.dialogue_file_path = Path(dialogue_file_path)
        self.dialogues: Dict[str, Dict[str, Any]] = {}
        self.settings: Dict[str, Any] = {}
        self.vvm_models: Dict[str, Dict[str, Any]] = {}
        self.last_modified_time: float = 0.0  # ファイル最終変更時刻
        self.auto_reload_enabled: bool = True  # 自動再読み込み有効フラグ
        self.load_dialogues()
    
    def load_dialogues(self) -> bool:
        """JSONファイルからセリフデータを読み込み"""
        try:
            if not self.dialogue_file_path.exists():
                logger.warning(f"⚠️ セリフファイルが見つかりません: {self.dialogue_file_path}")
                self._create_default_dialogue_file()
                return False
            
            with open(self.dialogue_file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            self.dialogues = data.get('dialogues', {})
            self.settings = data.get('settings', {})
            self.vvm_models = data.get('vvm_models', {})
            
            # ファイル最終変更時刻を記録
            self._update_modification_time()
            
            # 有効なセリフのみをカウント
            enabled_count = sum(1 for dialogue in self.dialogues.values() if dialogue.get('enabled', True))
            total_count = len(self.dialogues)
            
            logger.info(f"📋 セリフファイル読み込み完了: {enabled_count}/{total_count}件有効")
            
            return True
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSONファイル解析エラー: {e}")
            return False
        except Exception as e:
            logger.error(f"❌ セリフファイル読み込みエラー: {e}")
            return False
    
    def _create_default_dialogue_file(self):
        """デフォルトのセリフファイルを作成"""
        default_data = {
            "dialogues": {
                "1": {
                    "text": "僕の名前はシリウスです",
                    "enabled": True,
                    "style_id": 54,
                    "speed": 1.0,
                    "pitch": 0.0,
                    "intonation": 0.9,
                    "description": "自己紹介"
                }
            },
            "settings": {
                "default_style_id": 54,
                "default_speed": 1.0,
                "default_pitch": 0.0,
                "default_intonation": 0.9,
                "dialogue_file_encoding": "utf-8"
            }
        }
        
        try:
            with open(self.dialogue_file_path, 'w', encoding='utf-8') as f:
                json.dump(default_data, f, ensure_ascii=False, indent=2)
            logger.info(f"📝 デフォルトセリフファイルを作成: {self.dialogue_file_path}")
        except Exception as e:
            logger.error(f"❌ デフォルトセリフファイル作成エラー: {e}")
    
    def get_dialogue(self, key: str) -> Optional[Dict[str, Any]]:
        """指定されたキーのセリフ情報を取得（自動再読み込み対応）"""
        # ファイル変更チェック＆自動再読み込み
        self.auto_reload_if_modified()
        
        dialogue = self.dialogues.get(key)
        if dialogue is None:
            logger.warning(f"⚠️ セリフが見つかりません: '{key}'")
            return None
        
        if not dialogue.get('enabled', True):
            logger.warning(f"⚠️ セリフが無効化されています: '{key}'")
            return None
        
        return dialogue
    
    def get_enabled_dialogues(self) -> Dict[str, Dict[str, Any]]:
        """有効なセリフのみを取得（自動再読み込み対応）"""
        # ファイル変更チェック＆自動再読み込み
        self.auto_reload_if_modified()
        
        return {
            key: dialogue for key, dialogue in self.dialogues.items()
            if dialogue.get('enabled', True)
        }
    
    def list_dialogues(self) -> None:
        """利用可能なセリフ一覧を表示（自動再読み込み対応）"""
        # ファイル変更チェック＆自動再読み込み
        self.auto_reload_if_modified()
        
        enabled_dialogues = self.get_enabled_dialogues()
        
        if not enabled_dialogues:
            logger.warning("⚠️ 有効なセリフがありません")
            return
        
        logger.info("📋 利用可能なセリフ一覧:")
        for key, dialogue in enabled_dialogues.items():
            text = dialogue.get('text', '')
            description = dialogue.get('description', '')
            style_id = dialogue.get('style_id', self.settings.get('default_style_id', 54))
            vvm_model = dialogue.get('vvm_model', self.settings.get('default_vvm_model', '13.vvm'))
            
            if description:
                logger.info(f"  {key}: '{text}' ({description}) [スタイル:{style_id}, VVM:{vvm_model}]")
            else:
                logger.info(f"  {key}: '{text}' [スタイル:{style_id}, VVM:{vvm_model}]")
    
    def reload_dialogues(self) -> bool:
        """セリフファイルを再読み込み"""
        logger.info("🔄 セリフファイル再読み込み中...")
        return self.load_dialogues()
    
    def get_default_settings(self) -> Dict[str, Any]:
        """デフォルト設定を取得"""
        return self.settings
    
    def get_vvm_model_path(self, vvm_name: str) -> Optional[str]:
        """VVMモデル名からパスを取得（自動再読み込み対応）"""
        # ファイル変更チェック＆自動再読み込み
        self.auto_reload_if_modified()
        
        model_info = self.vvm_models.get(vvm_name)
        if model_info:
            return model_info.get('path')
        
        # フォールバック: models_dirから直接パス構築
        models_dir = self.settings.get('vvm_models_dir', './voicevox_core/models/vvms')
        fallback_path = os.path.join(models_dir, vvm_name)
        if os.path.exists(fallback_path):
            return fallback_path
        
        return None
    
    def get_vvm_model_info(self, vvm_name: str) -> Optional[Dict[str, Any]]:
        """VVMモデルの詳細情報を取得（自動再読み込み対応）"""
        # ファイル変更チェック＆自動再読み込み
        self.auto_reload_if_modified()
        
        return self.vvm_models.get(vvm_name)
    
    def list_vvm_models(self) -> None:
        """利用可能なVVMモデル一覧を表示（自動再読み込み対応）"""
        # ファイル変更チェック＆自動再読み込み
        self.auto_reload_if_modified()
        
        if not self.vvm_models:
            logger.warning("⚠️ 登録されたVVMモデルがありません")
            return
        
        logger.info("🎤 利用可能なVVMモデル一覧:")
        for vvm_name, model_info in self.vvm_models.items():
            name = model_info.get('name', 'Unknown')
            path = model_info.get('path', '')
            styles = model_info.get('available_styles', [])
            exists = os.path.exists(path) if path else False
            status = "✅" if exists else "❌"
            
            logger.info(f"  {status} {vvm_name}: {name} (スタイル: {styles})")
    
    def get_default_vvm_model(self) -> str:
        """デフォルトVVMモデル名を取得"""
        return self.settings.get('default_vvm_model', '13.vvm')
    
    def _update_modification_time(self):
        """ファイル最終変更時刻を更新"""
        try:
            if self.dialogue_file_path.exists():
                self.last_modified_time = self.dialogue_file_path.stat().st_mtime
        except Exception as e:
            logger.warning(f"⚠️ ファイル変更時刻取得エラー: {e}")
    
    def check_file_modified(self) -> bool:
        """ファイルが変更されたかチェック"""
        if not self.auto_reload_enabled:
            return False
        
        try:
            if not self.dialogue_file_path.exists():
                return False
            
            current_time = self.dialogue_file_path.stat().st_mtime
            return current_time > self.last_modified_time
        except Exception as e:
            logger.warning(f"⚠️ ファイル変更チェックエラー: {e}")
            return False
    
    def auto_reload_if_modified(self) -> bool:
        """ファイルが変更されている場合に自動再読み込み"""
        if self.check_file_modified():
            logger.info("🔄 JSONファイルの変更を検知、自動再読み込み中...")
            success = self.load_dialogues()
            if success:
                logger.info("✅ JSONファイル自動再読み込み完了")
            else:
                logger.warning("⚠️ JSONファイル自動再読み込みに失敗")
            return success
        return True
    
    def set_auto_reload(self, enabled: bool):
        """自動再読み込み機能の有効/無効を設定"""
        self.auto_reload_enabled = enabled
        status = "有効" if enabled else "無効"
        logger.info(f"🔄 JSONファイル自動再読み込み機能: {status}")

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
    
    def set_mouth_pattern_fast(self, pattern: Optional[str]) -> bool:
        """高速口形状設定（冗長リクエスト排除）"""
        # 同じパターンの場合はスキップ
        if self.last_mouth_pattern == pattern:
            logger.debug(f"🔧 同じ口パターン ({pattern}) のためスキップ")
            return True
        
        try:
            logger.debug(f"🔧 口パターン設定リクエスト: {pattern}")
            response = self.session.post(
                f"{self.server_url}/mouth_pattern",
                json={'mouth_pattern': pattern},
                timeout=0.05  # 極短タイムアウト
            )
            
            if response.status_code == 200:
                self.last_mouth_pattern = pattern
                logger.debug(f"✅ 口パターン設定成功: {pattern}")
                return True
            else:
                logger.warning(f"❌ 口パターン設定失敗: HTTP {response.status_code}, {response.text}")
                return False
                
        except Exception as e:
            logger.warning(f"❌ 口パターン設定エラー: {e}")
            return False
    
    def reset_to_neutral(self):
        """main.pyのリセット機能を使用して全設定をリセット"""
        try:
            response = self.session.post(
                f"{self.server_url}/api/reset",
                json={},
                timeout=0.1
            )
            
            if response.status_code == 200:
                self.is_talking_mode_active = False
                self.last_mouth_pattern = None
                logger.info("🔄 main.pyリセット機能により全設定をリセットしました")
                return True
            else:
                logger.warning(f"❌ リセット失敗: HTTP {response.status_code}")
                return False
                
        except Exception as e:
            logger.warning(f"❌ リセット機能エラー: {e}")
            return False
    
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
    """音声再生クラス（macOS対応）"""
    
    def __init__(self):
        self.is_playing = False
    
    def play_wav_data(self, wav_data: bytes) -> float:
        """WAVデータを再生し、実際の再生時間を返す"""
        try:
            # 音声の長さを取得
            duration = self._get_wav_duration(wav_data)
            
            # システムコマンドで再生（macOS対応）
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
    
    def _play_with_system(self, wav_data: bytes) -> float:
        """システムコマンドで音声再生（プラットフォーム対応）"""
        try:
            start_time = time.time()
            
            # 一時ファイルに保存
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
                temp_file.write(wav_data)
                temp_path = temp_file.name
            
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
                    ]
                    
                    played_successfully = False
                    for cmd in commands_to_try:
                        try:
                            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                            played_successfully = True
                            break
                        except (subprocess.CalledProcessError, FileNotFoundError):
                            continue
                    
                    if not played_successfully:
                        logger.error("❌ 利用可能な音声再生コマンドが見つかりません")
                        return 0.0
                        
                elif system == "windows":
                    # Windowsの場合
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
            logger.info(f"🔊 音声再生完了 (時間: {actual_duration:.2f}秒)")
            return actual_duration
            
        except Exception as e:
            logger.error(f"❌ 音声再生エラー: {e}")
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
            if hasattr(audio_query, 'accent_phrases'):
                logger.info(f"🔧 accent_phrases数 = {len(audio_query.accent_phrases)}")
            
            phoneme_timeline = []
            total_duration = 0.0
            
            # accent_phrasesから音韻情報を抽出
            if hasattr(audio_query, 'accent_phrases'):
                
                # 前音韻長を追加
                if hasattr(audio_query, 'pre_phoneme_length') and audio_query.pre_phoneme_length > 0:
                    pre_length = float(audio_query.pre_phoneme_length)
                    phoneme_timeline.append(('sil', None, pre_length))
                    total_duration += pre_length
                
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
                        else:
                            # オブジェクトの場合
                            if hasattr(accent_phrase.pause_mora, 'vowel_length'):
                                pause_duration = float(accent_phrase.pause_mora.vowel_length)
                        
                        if pause_duration > 0:
                            phoneme_timeline.append(('pau', 'i', pause_duration))
                            total_duration += pause_duration
                
                # 後音韻長を追加
                if hasattr(audio_query, 'post_phoneme_length') and audio_query.post_phoneme_length > 0:
                    post_length = float(audio_query.post_phoneme_length)
                    phoneme_timeline.append(('sil', None, post_length))
                    total_duration += post_length
            
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
    """VOICEVOX音声合成クラス（AudioQuery対応・VVM動的切り替え対応）"""
    
    def __init__(self, voicevox_onnxruntime_path: str, open_jtalk_dict_dir: str, model_path: str):
        self.voicevox_onnxruntime_path = voicevox_onnxruntime_path
        self.open_jtalk_dict_dir = open_jtalk_dict_dir
        self.current_model_path = model_path
        self.synthesizer = None
        self.available_styles = []
        self.default_style_id = None
        self.loaded_models = {}  # モデルキャッシュ
        
        self._initialize_synthesizer()
    
    def _initialize_synthesizer(self):
        """シンセサイザーを初期化"""
        try:
            logger.info("🎤 VOICEVOX初期化中...")
            
            if not os.path.exists(self.voicevox_onnxruntime_path):
                raise FileNotFoundError(f"ONNX Runtime not found: {self.voicevox_onnxruntime_path}")
            
            if not os.path.exists(self.open_jtalk_dict_dir):
                raise FileNotFoundError(f"Open JTalk dict not found: {self.open_jtalk_dict_dir}")
            
            if not os.path.exists(self.current_model_path):
                raise FileNotFoundError(f"Voice model not found: {self.current_model_path}")
            
            self.synthesizer = Synthesizer(
                Onnxruntime.load_once(filename=self.voicevox_onnxruntime_path),
                OpenJtalk(self.open_jtalk_dict_dir)
            )
            
            # 初期モデルをロード
            self._load_model(self.current_model_path)
            
            logger.info("✅ VOICEVOX初期化完了")
            
        except Exception as e:
            logger.error(f"❌ VOICEVOX初期化エラー: {e}")
            raise
    
    def _load_model(self, model_path: str):
        """指定されたモデルをロード"""
        try:
            # 既にロード済みの場合はスキップ
            if model_path in self.loaded_models:
                logger.debug(f"🔧 モデル既にロード済み: {model_path}")
                self.current_model_path = model_path
                self._update_available_styles()
                return True
            
            logger.info(f"🎤 音声モデルロード中: {model_path}")
            
            with VoiceModelFile.open(model_path) as model:
                self.synthesizer.load_voice_model(model)
            
            # キャッシュに追加
            self.loaded_models[model_path] = True
            self.current_model_path = model_path
            
            self._update_available_styles()
            
            model_name = os.path.basename(model_path)
            logger.info(f"✅ 音声モデルロード完了: {model_name}")
            return True
            
        except Exception as e:
            logger.error(f"❌ 音声モデルロードエラー ({model_path}): {e}")
            return False
    
    def _update_available_styles(self):
        """利用可能なスタイルを更新"""
        self.available_styles = []
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
    
    def switch_model(self, model_path: str) -> bool:
        """音声モデルを切り替え"""
        if not os.path.exists(model_path):
            logger.error(f"❌ 音声モデルファイルが存在しません: {model_path}")
            return False
        
        if model_path == self.current_model_path:
            logger.debug(f"🔧 同じモデルのため切り替えスキップ: {model_path}")
            return True
        
        return self._load_model(model_path)
    
    def get_current_model(self) -> str:
        """現在のモデルパスを取得"""
        return self.current_model_path
    
    def get_loaded_models(self) -> List[str]:
        """ロード済みモデル一覧を取得"""
        return list(self.loaded_models.keys())

class AudioQueryLipSyncSpeaker:
    """AudioQuery音韻解析 + リップシンク発話システム（高速化版）"""
    
    def __init__(self, server_url="http://localhost:8080", 
                 voicevox_onnxruntime_path="./voicevox_core/onnxruntime/lib/libvoicevox_onnxruntime.1.17.3.dylib",
                 open_jtalk_dict_dir="./voicevox_core/dict/open_jtalk_dic_utf_8-1.11",
                 model_path="./voicevox_core/models/vvms/13.vvm",
                 dialogue_file_path="./dialogue_data.json"):
        
        self.talking_controller = TalkingModeController(server_url)
        self.audio_player = AudioPlayer()
        self.voicevox = VoiceVoxSynthesizer(voicevox_onnxruntime_path, open_jtalk_dict_dir, model_path)
        self.analyzer = AudioQueryPhonemeAnalyzer(self.voicevox.synthesizer)
        
        # JSONセリフ管理機能
        self.dialogue_manager = DialogueManager(dialogue_file_path)
        
        self.is_speaking = False
        self._speech_lock = threading.Lock()
        
        # 音声パラメータ（JSONから読み込み）
        default_settings = self.dialogue_manager.get_default_settings()
        self.speed_scale = default_settings.get('default_speed', 1.0)
        self.pitch_scale = default_settings.get('default_pitch', 0.0)
        self.intonation_scale = default_settings.get('default_intonation', 0.9)
        self.style_id = default_settings.get('default_style_id', self.voicevox.default_style_id)
        self.current_vvm_model = default_settings.get('default_vvm_model', '13.vvm')
        
        # セッション管理用
        self._session_cleanup_counter = 0
        self._session_cleanup_interval = 50  # 50回に1回セッションをクリーンアップ
        
        logger.info("🤖 AudioQuery音韻解析 + リップシンクシステム初期化完了（高速化版・JSON対応・VVM切り替え対応）")
    
    def switch_vvm_model(self, vvm_name: str) -> bool:
        """VVMモデルを切り替え"""
        model_path = self.dialogue_manager.get_vvm_model_path(vvm_name)
        if not model_path:
            logger.error(f"❌ VVMモデルが見つかりません: {vvm_name}")
            return False
        
        success = self.voicevox.switch_model(model_path)
        if success:
            self.current_vvm_model = vvm_name
            model_info = self.dialogue_manager.get_vvm_model_info(vvm_name)
            model_name = model_info.get('name', vvm_name) if model_info else vvm_name
            logger.info(f"✅ VVMモデル切り替え完了: {model_name} ({vvm_name})")
        
        return success
    
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
            
            # 8. 音声再生の完了を待機（短いインターバルで監視）
            max_wait_time = actual_audio_duration + 2.0  # 最大待機時間（実際の音声長 + 2秒）
            waited_time = 0.0
            
            while not audio_result['completed'] and self.is_speaking and waited_time < max_wait_time:
                await asyncio.sleep(0.02)  # 20ms毎にチェック
                waited_time += 0.02
            
            # タイムアウトした場合の警告
            if waited_time >= max_wait_time:
                logger.warning(f"⚠️ 音声再生完了の待機がタイムアウト ({max_wait_time:.1f}秒)")
            
            # 7. リップシンク終了 - 口だけを通常の口に戻す（表情はそのまま）
            logger.info("🎭 リップシンク終了処理開始")
            
            # おしゃべりモード無効化
            self.talking_controller.set_talking_mode(False)
            
            # 少し待ってから口パターンをクリア（確実に処理されるように）
            time.sleep(0.1)
            
            # 口パターンをクリア（表情は維持）
            success = self.talking_controller.set_mouth_pattern_fast(None)
            if not success:
                logger.warning("⚠️ 口パターンのクリアに失敗しました")
            else:
                logger.info("✅ 口パターンを通常の口に戻しました")
            
            self.is_speaking = False
            
            # 最終的な状態確認
            if audio_result['completed']:
                logger.info(f"✅ AudioQuery音韻解析リップシンク発話完了 (口を通常状態に復帰、表情は維持)")
            else:
                logger.info(f"✅ AudioQuery音韻解析リップシンク発話完了 (口を通常状態に復帰、表情は維持)")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ AudioQuery音韻解析リップシンク発話エラー: {e}")
            
            # エラー時も口だけを通常の口に戻す（表情は維持）
            self.talking_controller.set_mouth_pattern_fast(None)
            self.talking_controller.set_talking_mode(False)
            self.is_speaking = False
            return False
        finally:
            self._speech_lock.release()
    
    def _adjust_sequence_to_audio_length(self, mouth_sequence: List[Tuple[str, float]], actual_duration: float) -> List[Tuple[str, float]]:
        """音韻シーケンスを実際の音声長に合わせて調整（口パク高速化版）"""
        if not mouth_sequence:
            return []
        
        # 現在の総時間を計算
        current_total = sum(duration for _, duration in mouth_sequence)
        
        if current_total == 0:
            return mouth_sequence
        
        # 調整比率を計算
        adjustment_ratio = actual_duration / current_total
        
        # 口パク高速化係数（0.8倍で20%高速化）
        speed_factor = 0.8
        adjustment_ratio *= speed_factor
        
        logger.info(f"🔧 時間調整: 計算時間 {current_total:.2f}秒 → 実際時間 {actual_duration:.2f}秒 (高速化係数: {speed_factor})")
        
        # 各音韻の時間を調整
        adjusted_sequence = []
        for mouth_shape, duration in mouth_sequence:
            adjusted_duration = duration * adjustment_ratio
            
            # より短い最小時間（20ms）と最大時間制限（150ms）
            adjusted_duration = max(adjusted_duration, 0.02)  # 最小20ms
            adjusted_duration = min(adjusted_duration, 0.15)  # 最大150ms
            
            # 長い音韻は分割してより活発な口パクにする
            if adjusted_duration > 0.1:  # 100ms以上の場合
                # 2つに分割
                split_duration = adjusted_duration / 2
                adjusted_sequence.append((mouth_shape, split_duration))
                adjusted_sequence.append((mouth_shape, split_duration))
            else:
                adjusted_sequence.append((mouth_shape, adjusted_duration))
        
        return adjusted_sequence
    
    async def _delayed_talking_mode_activation(self):
        try:
            if self.is_speaking:
                logger.info("🎭おしゃべりモード有効化")
                if not self.talking_controller.set_talking_mode(True):
                    logger.warning("⚠️ おしゃべりモード有効化に失敗（サーバー接続エラー）")
                else:
                    logger.info("✅ おしゃべりモード有効化成功")
            else:
                logger.info("🛑 発話が停止済みのため、おしゃべりモード有効化をスキップ")
                
        except Exception as e:
            logger.error(f"❌ 遅延おしゃべりモード有効化エラー: {e}")
    
    async def _execute_audioquery_lipsync(self, mouth_sequence: List[Tuple[str, float]], audio_result: dict):
        """AudioQuery音韻に基づくリップシンクを実行（音声再生同期版）"""
        try:
            elapsed_time = 0.0
            last_pattern = None  # 冗長リクエスト防止
            
            # セッションクリーンアップのカウンター更新
            self._session_cleanup_counter += 1
            if self._session_cleanup_counter >= self._session_cleanup_interval:
                self.talking_controller.cleanup_session()
                self._session_cleanup_counter = 0
            
            for i, (mouth_shape, duration) in enumerate(mouth_sequence):
                # 音声再生が完了したかチェック
                if audio_result['completed'] or not self.is_speaking:
                    logger.info(f"🛑 音声再生完了検出 - リップシンク早期終了 ({i+1}/{len(mouth_sequence)})")
                    break
                
                # 音韻解析の口形状をサーバー形式に変換
                server_pattern = f"mouth_{mouth_shape}" if mouth_shape else "mouth_i"
                
                # 冗長リクエストを防ぐ（同じパターンの場合はスキップ）
                if server_pattern != last_pattern:
                    # 高速HTTPリクエスト（非ブロッキング風に処理）
                    success = self.talking_controller.set_mouth_pattern_fast(server_pattern)
                    if success:
                        last_pattern = server_pattern
                
                # 高精度タイミング制御（音声再生状況を監視しながら）
                loop_start = time.time()
                remaining_duration = duration
                
                # より細かくチェック（30ms毎）して口パクを活発に
                while remaining_duration > 0 and not audio_result['completed'] and self.is_speaking:
                    sleep_duration = min(0.03, remaining_duration)  # 30ms毎にチェック
                    await asyncio.sleep(sleep_duration)
                    remaining_duration -= sleep_duration
                
                # 音声再生が完了していたら即座に終了
                if audio_result['completed']:
                    logger.info(f"🛑 音声再生完了により早期終了 - 音韻 {i+1}/{len(mouth_sequence)}")
                    break
                
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
    
    def speak_dialogue(self, dialogue_key: str) -> bool:
        """JSONで管理されたセリフを発話（VVM切り替え対応）"""
        dialogue = self.dialogue_manager.get_dialogue(dialogue_key)
        if dialogue is None:
            return False
        
        text = dialogue.get('text', '')
        if not text:
            logger.warning(f"⚠️ セリフテキストが空です: '{dialogue_key}'")
            return False
        
        # セリフ固有の設定を適用
        original_speed = self.speed_scale
        original_pitch = self.pitch_scale
        original_intonation = self.intonation_scale
        original_vvm_model = self.current_vvm_model
        
        try:
            # VVMモデル切り替え（必要な場合）
            required_vvm = dialogue.get('vvm_model', self.dialogue_manager.get_default_vvm_model())
            if required_vvm != self.current_vvm_model:
                logger.info(f"🎤 VVMモデル切り替え: {self.current_vvm_model} → {required_vvm}")
                if not self.switch_vvm_model(required_vvm):
                    logger.warning(f"⚠️ VVMモデル切り替えに失敗、デフォルトモデルで継続")
            
            # セリフ固有の設定を一時的に適用
            self.speed_scale = dialogue.get('speed', original_speed)
            self.pitch_scale = dialogue.get('pitch', original_pitch)
            self.intonation_scale = dialogue.get('intonation', original_intonation)
            style_id = dialogue.get('style_id', self.style_id)
            
            description = dialogue.get('description', '')
            model_info = self.dialogue_manager.get_vvm_model_info(self.current_vvm_model)
            model_name = model_info.get('name', self.current_vvm_model) if model_info else self.current_vvm_model
            
            if description:
                logger.info(f"🎭 JSONセリフ発話: '{text}' ({description}) [キー: {dialogue_key}, モデル: {model_name}]")
            else:
                logger.info(f"🎭 JSONセリフ発話: '{text}' [キー: {dialogue_key}, モデル: {model_name}]")
            
            # 発話実行
            result = self.speak_sync(text, style_id)
            
            return result
            
        finally:
            # 設定を元に戻す
            self.speed_scale = original_speed
            self.pitch_scale = original_pitch
            self.intonation_scale = original_intonation
    
    async def speak_dialogue_async(self, dialogue_key: str) -> bool:
        """JSONで管理されたセリフを非同期発話（VVM切り替え対応）"""
        dialogue = self.dialogue_manager.get_dialogue(dialogue_key)
        if dialogue is None:
            return False
        
        text = dialogue.get('text', '')
        if not text:
            logger.warning(f"⚠️ セリフテキストが空です: '{dialogue_key}'")
            return False
        
        # セリフ固有の設定を適用
        original_speed = self.speed_scale
        original_pitch = self.pitch_scale
        original_intonation = self.intonation_scale
        original_vvm_model = self.current_vvm_model
        
        try:
            # VVMモデル切り替え（必要な場合）
            required_vvm = dialogue.get('vvm_model', self.dialogue_manager.get_default_vvm_model())
            if required_vvm != self.current_vvm_model:
                logger.info(f"🎤 VVMモデル切り替え: {self.current_vvm_model} → {required_vvm}")
                if not self.switch_vvm_model(required_vvm):
                    logger.warning(f"⚠️ VVMモデル切り替えに失敗、デフォルトモデルで継続")
            
            # セリフ固有の設定を一時的に適用
            self.speed_scale = dialogue.get('speed', original_speed)
            self.pitch_scale = dialogue.get('pitch', original_pitch)
            self.intonation_scale = dialogue.get('intonation', original_intonation)
            style_id = dialogue.get('style_id', self.style_id)
            
            description = dialogue.get('description', '')
            model_info = self.dialogue_manager.get_vvm_model_info(self.current_vvm_model)
            model_name = model_info.get('name', self.current_vvm_model) if model_info else self.current_vvm_model
            
            if description:
                logger.info(f"🎭 JSONセリフ発話(非同期): '{text}' ({description}) [キー: {dialogue_key}, モデル: {model_name}]")
            else:
                logger.info(f"🎭 JSONセリフ発話(非同期): '{text}' [キー: {dialogue_key}, モデル: {model_name}]")
            
            # 非同期発話実行
            result = await self.speak_with_audioquery_lipsync(text, style_id)
            
            return result
            
        finally:
            # 設定を元に戻す
            self.speed_scale = original_speed
            self.pitch_scale = original_pitch
            self.intonation_scale = original_intonation
    
    def stop_speaking(self):
        """現在の発話を停止（口だけリセット版）"""
        if self.is_speaking:
            logger.info("🛑 発話を中断します...")
            self.is_speaking = False
            
            # 口だけを通常の口に戻す（表情は維持）
            self.talking_controller.set_mouth_pattern_fast(None)
            self.talking_controller.set_talking_mode(False)
            
            time.sleep(0.05)  # 短縮
            logger.info("✅ 発話を中断しました（口を通常状態に復帰、表情は維持）")

def main():
    """メイン関数（JSON対応版）"""
    try:
        # ファイル存在チェック
        onnxruntime_path = get_default_onnxruntime_path()
        dict_dir = './voicevox_core/dict/open_jtalk_dic_utf_8-1.11'
        model_path = './voicevox_core/models/vvms/13.vvm'
        server_url = 'http://localhost:8080'
        dialogue_file = './dialogue_data.json'
        
        logger.info(f"🔍 ファイル存在チェック:")
        logger.info(f"  ONNX Runtime: {onnxruntime_path} - {'存在' if os.path.exists(onnxruntime_path) else '存在しない'}")
        logger.info(f"  辞書: {dict_dir} - {'存在' if os.path.exists(dict_dir) else '存在しない'}")
        logger.info(f"  モデル: {model_path} - {'存在' if os.path.exists(model_path) else '存在しない'}")
        logger.info(f"  セリフファイル: {dialogue_file} - {'存在' if os.path.exists(dialogue_file) else '存在しない'}")
        
        # リップシンク機能付きスピーカーを初期化（JSON対応）
        speaker = AudioQueryLipSyncSpeaker(server_url, onnxruntime_path, dict_dir, model_path, dialogue_file)
        
        # 簡易コンソール
        logger.info("🤖 AudioQuery音韻解析 + リップシンクシステム起動（JSON対応版・VVM切り替え対応・自動再読み込み対応）")
        logger.info("コマンド:")
        logger.info("  [セリフキー]: JSONに登録されたセリフを発話")
        logger.info("  L: JSONセリフ一覧表示")
        logger.info("  V: VVMモデル一覧表示")
        logger.info("  VM [モデル名]: VVMモデル切り替え (例: VM 0.vvm)")
        logger.info("  C: カスタムテキストでリップシンク発話")
        logger.info("  A: カスタムテキストで音韻解析のみ")
        logger.info("  RL: セリフファイル手動再読み込み")
        logger.info("  AUTO: 自動再読み込み機能の有効/無効切り替え")
        logger.info("  R: 設定リセット（全設定をニュートラルに戻す）")
        logger.info("  T: 口パターンテスト（通常口への復帰をテスト）")
        logger.info("  Q: 終了")
        logger.info("  💡 JSONファイルを外部で編集すると自動で変更を検知・反映します")
        
        # 初期状態でセリフ一覧を表示
        logger.info("\n--- 初期セリフ一覧 ---")
        speaker.dialogue_manager.list_dialogues()
        logger.info("\n--- VVMモデル一覧 ---")
        speaker.dialogue_manager.list_vvm_models()
        logger.info("------------------------\n")
        
        try:
            while True:
                command = input("\n> ").strip()
                logger.debug(f"🔧 入力されたコマンド: '{command}' (len={len(command)})")
                
                if command.upper() == "L":
                    # セリフ一覧表示
                    logger.info("📋 JSONセリフ一覧:")
                    speaker.dialogue_manager.list_dialogues()
                
                elif command.upper() == "V":
                    # VVMモデル一覧表示
                    logger.info("🎤 VVMモデル一覧:")
                    speaker.dialogue_manager.list_vvm_models()
                    current_model = speaker.current_vvm_model
                    model_info = speaker.dialogue_manager.get_vvm_model_info(current_model)
                    model_name = model_info.get('name', current_model) if model_info else current_model
                    logger.info(f"📍 現在のモデル: {model_name} ({current_model})")
                
                elif command.upper().startswith("VM "):
                    # VVMモデル切り替え
                    vvm_name = command[3:].strip()  # "VM " 以降を取得
                    if vvm_name:
                        logger.info(f"🎤 VVMモデル切り替え要求: {vvm_name}")
                        if speaker.switch_vvm_model(vvm_name):
                            logger.info(f"✅ VVMモデル切り替え成功: {vvm_name}")
                        else:
                            logger.warning(f"⚠️ VVMモデル切り替えに失敗: {vvm_name}")
                    else:
                        logger.warning("VVMモデル名を指定してください (例: VM 0.vvm)")
                    
                elif command.upper() == "C":
                    custom_text = input("発話させたいテキストを入力してください: ").strip()
                    if custom_text:
                        logger.info(f"🎭 カスタム発話: '{custom_text}'")
                        threading.Thread(target=lambda: speaker.speak_sync(custom_text), daemon=True).start()
                    else:
                        logger.warning("テキストが入力されませんでした")
                        
                elif command.upper() == "A":
                    custom_text = input("解析するテキストを入力してください: ").strip()
                    if custom_text:
                        logger.info(f"🔍 カスタム音韻解析: '{custom_text}'")
                        speaker.analyzer.print_analysis(custom_text, speaker.style_id)
                    else:
                        logger.warning("テキストが入力されませんでした")
                
                elif command.upper() == "RL":
                    # セリフファイル手動再読み込み
                    if speaker.dialogue_manager.reload_dialogues():
                        logger.info("✅ セリフファイル手動再読み込み完了")
                        speaker.dialogue_manager.list_dialogues()
                    else:
                        logger.warning("⚠️ セリフファイル手動再読み込みに失敗しました")
                
                elif command.upper() == "AUTO":
                    # 自動再読み込み機能の有効/無効切り替え
                    current_status = speaker.dialogue_manager.auto_reload_enabled
                    new_status = not current_status
                    speaker.dialogue_manager.set_auto_reload(new_status)
                    status_text = "有効" if new_status else "無効"
                    logger.info(f"🔄 自動再読み込み機能を{status_text}にしました")
                        
                elif command.upper() == "R":
                    # 全設定をニュートラルにリセット（main.pyのRボタンと同じ機能）
                    logger.info("🔄 全設定をリセット中...")
                    if speaker.talking_controller.reset_to_neutral():
                        logger.info("✅ 全設定リセット完了（表情もニュートラルに戻ります）")
                    else:
                        logger.warning("⚠️ 設定リセットに失敗しました")
                        
                elif command.upper() == "T":
                    # 口パターンテスト
                    logger.info("🧪 口パターンテスト開始")
                    logger.info("  1. おしゃべりモード有効化")
                    speaker.talking_controller.set_talking_mode(True)
                    time.sleep(1)
                    
                    logger.info("  2. mouth_a パターン設定")
                    speaker.talking_controller.set_mouth_pattern_fast("mouth_a")
                    time.sleep(2)
                    
                    logger.info("  3. mouth_i パターン設定") 
                    speaker.talking_controller.set_mouth_pattern_fast("mouth_i")
                    time.sleep(2)
                    
                    logger.info("  4. 通常の口に戻す (None)")
                    success = speaker.talking_controller.set_mouth_pattern_fast(None)
                    if success:
                        logger.info("✅ 口パターンテスト成功")
                    else:
                        logger.warning("❌ 口パターンテスト失敗")
                    
                    logger.info("  5. おしゃべりモード無効化")
                    speaker.talking_controller.set_talking_mode(False)
                    logger.info("🧪 口パターンテスト完了")
                        
                elif command.upper() == "Q":
                    speaker.stop_speaking()
                    # 口だけを通常の口に戻す（表情は維持）
                    speaker.talking_controller.set_mouth_pattern_fast(None)
                    logger.info("👋 システム終了")
                    break
                
                else:
                    # JSONセリフキーとして処理を試行
                    if command:
                        dialogue = speaker.dialogue_manager.get_dialogue(command)
                        if dialogue:
                            # JSONセリフを発話
                            threading.Thread(target=lambda: speaker.speak_dialogue(command), daemon=True).start()
                        else:
                            logger.warning(f"無効なコマンドまたはセリフキーです: '{command}'")
                            logger.info("利用可能なコマンド: L, V, VM [モデル], C, A, RL, AUTO, R, T, Q または登録済みセリフキー")
                    else:
                        logger.warning("コマンドを入力してください")
                    
        except KeyboardInterrupt:
            speaker.stop_speaking()
            # Ctrl+C終了時も口だけを通常の口に戻す（表情は維持）
            speaker.talking_controller.set_mouth_pattern_fast(None)
            logger.info("\n👋 システム終了")
        
    except Exception as e:
        logger.error(f"❌ システム初期化エラー: {e}")
        import traceback
        logger.error(f"❌ エラー詳細: {traceback.format_exc()}")

if __name__ == "__main__":
    main()

"""
使用例:

# コンソールモード（対話的・JSON対応・VVM切り替え対応・自動再読み込み対応）
python3 audioquery_phoneme.py

# JSONセリフファイルの編集（リアルタイム反映）
dialogue_data.jsonを編集すると自動で変更を検知・反映
- "enabled": true/false でセリフの有効/無効を制御
- "vvm_model": "13.vvm" でセリフ個別にVVMモデル指定
- 数値キー（"1", "2", "3"）や文字キー（"hello", "thanks"）に対応
- 各セリフに個別の音声パラメータ設定可能
- プログラムを落とさずに変更点がリアルタイムで反映される

# 基本コマンド:
#   L: セリフ一覧表示（自動で最新JSONを読み込み）
#   V: VVMモデル一覧表示  
#   VM [モデル名]: VVMモデル切り替え (例: VM 0.vvm)
#   [キー]: 指定されたキーのセリフを発話（自動でVVM切り替え・JSON再読み込み）
#   C: カスタムテキスト発話
#   RL: 手動セリフファイル再読み込み
#   AUTO: 自動再読み込み機能の有効/無効切り替え
#   Q: 終了

# リアルタイム編集ワークフロー:
# 1. プログラム起動: python3 audioquery_phoneme.py
# 2. 別エディタでdialogue_data.jsonを編集
# 3. 任意のコマンドを実行（自動でJSONの変更を検知・反映）
# 4. すぐに変更されたセリフが利用可能

# VVMモデル切り替え例:
#   VM 0.vvm  # 四国めたんに切り替え
#   VM 3.vvm  # 春日部つむぎに切り替え
#   voice_test_0  # 四国めたんでテスト発話
#   voice_test_3  # 春日部つむぎでテスト発話

# 従来の音韻解析コマンドも利用可能
python3 voicevox_lipsync.py --model ./voicevox_core/models/vvms/13.vvm --style-id 54 --speed 1.0 --pitch 0.0 --intonation 0.9

"""
