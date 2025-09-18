#!/usr/bin/env python3
"""
AudioQuery時間情報デバッグツール
AudioQueryの実際の構造と時間情報を詳細調査
"""

import logging
from audioquery_phoneme import VoiceVoxSynthesizer

# ログ設定
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def debug_audioquery_structure():
    """AudioQueryの構造を詳細調査"""
    
    try:
        # VOICEVOX初期化
        voicevox = VoiceVoxSynthesizer(
            "./voicevox_core/onnxruntime/lib/libvoicevox_onnxruntime.1.17.3.dylib",
            "./voicevox_core/dict/open_jtalk_dic_utf_8-1.11",
            "./voicevox_core/models/vvms/13.vvm"
        )
        
        test_text = "あいうえお"
        logger.info(f"🔍 AudioQuery構造調査: '{test_text}'")
        
        # AudioQueryを作成
        audio_query = voicevox.synthesizer.create_audio_query(test_text, 54)
        
        logger.info(f"📊 AudioQuery型: {type(audio_query)}")
        logger.info(f"📊 AudioQuery属性: {[attr for attr in dir(audio_query) if not attr.startswith('_')]}")
        
        # トップレベル属性を調査
        for attr in ['speed_scale', 'pitch_scale', 'intonation_scale', 'volume_scale', 
                     'pre_phoneme_length', 'post_phoneme_length']:
            if hasattr(audio_query, attr):
                value = getattr(audio_query, attr)
                logger.info(f"  {attr}: {value}")
        
        # accent_phrasesを詳細調査
        if hasattr(audio_query, 'accent_phrases'):
            logger.info(f"📊 accent_phrases数: {len(audio_query.accent_phrases)}")
            
            for i, accent_phrase in enumerate(audio_query.accent_phrases):
                logger.info(f"\n--- accent_phrase[{i}] ---")
                logger.info(f"型: {type(accent_phrase)}")
                logger.info(f"属性: {[attr for attr in dir(accent_phrase) if not attr.startswith('_')]}")
                
                # morasを詳細調査
                if hasattr(accent_phrase, 'moras'):
                    logger.info(f"moras数: {len(accent_phrase.moras)}")
                    
                    for j, mora in enumerate(accent_phrase.moras):
                        logger.info(f"\n  --- mora[{j}] ---")
                        logger.info(f"  型: {type(mora)}")
                        
                        # 全属性をダンプ
                        all_attrs = [attr for attr in dir(mora) if not attr.startswith('_')]
                        logger.info(f"  全属性: {all_attrs}")
                        
                        # 重要な属性の値を取得
                        for attr in ['text', 'consonant', 'consonant_length', 'vowel', 'vowel_length', 'pitch']:
                            if hasattr(mora, attr):
                                try:
                                    value = getattr(mora, attr)
                                    logger.info(f"    {attr}: {value} (型: {type(value)})")
                                except Exception as e:
                                    logger.info(f"    {attr}: エラー - {e}")
                        
                        # その他の時間関連属性
                        time_attrs = [attr for attr in all_attrs if 'length' in attr.lower() or 'duration' in attr.lower() or 'time' in attr.lower()]
                        if time_attrs:
                            logger.info(f"    時間関連属性: {time_attrs}")
                            for attr in time_attrs:
                                try:
                                    value = getattr(mora, attr)
                                    logger.info(f"      {attr}: {value}")
                                except:
                                    pass
                
                # pause_moraを調査
                if hasattr(accent_phrase, 'pause_mora') and accent_phrase.pause_mora:
                    pause_mora = accent_phrase.pause_mora
                    logger.info(f"\n  --- pause_mora ---")
                    logger.info(f"  型: {type(pause_mora)}")
                    logger.info(f"  属性: {[attr for attr in dir(pause_mora) if not attr.startswith('_')]}")
                    
                    for attr in ['text', 'vowel', 'vowel_length', 'pitch']:
                        if hasattr(pause_mora, attr):
                            try:
                                value = getattr(pause_mora, attr)
                                logger.info(f"    {attr}: {value}")
                            except Exception as e:
                                logger.info(f"    {attr}: エラー - {e}")
        
        # 音声合成して実際の時間と比較
        wav_data = voicevox.synthesizer.synthesis(audio_query, 54)
        
        import io
        import wave
        audio_buffer = io.BytesIO(wav_data)
        with wave.open(audio_buffer, 'rb') as wf:
            frames = wf.getnframes()
            sample_rate = wf.getframerate()
            actual_duration = frames / sample_rate
        
        logger.info(f"\n🎵 実際の音声長: {actual_duration:.3f}秒")
        logger.info(f"🎵 サンプルレート: {sample_rate}Hz")
        logger.info(f"🎵 フレーム数: {frames}")
        
    except Exception as e:
        logger.error(f"❌ 調査エラー: {e}")
        import traceback
        logger.error(f"❌ エラー詳細: {traceback.format_exc()}")

if __name__ == "__main__":
    debug_audioquery_structure()
