#!/usr/bin/env python3
"""
リップシンク精度・タイミング分析ツール
現在のシステムの精度とタイミング同期の問題を詳細分析
"""

import time
import logging
from audioquery_phoneme import AudioQueryLipSyncSpeaker, AudioQueryPhonemeAnalyzer, VoiceVoxSynthesizer

# ログ設定
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def analyze_lipsync_accuracy():
    """リップシンクの精度を分析"""
    
    # テストテキスト
    test_texts = [
        "あいうえお",  # 基本母音
        "かきくけこ",  # か行
        "坂本先輩",    # 漢字（音韻解析の精度テスト）
        "こんにちは、音韻解析のテストです",  # 長文
    ]
    
    try:
        # VOICEVOX初期化
        logger.info("🔍 リップシンク精度分析開始")
        voicevox = VoiceVoxSynthesizer(
            "./voicevox_core/onnxruntime/lib/libvoicevox_onnxruntime.1.17.3.dylib",
            "./voicevox_core/dict/open_jtalk_dic_utf_8-1.11",
            "./voicevox_core/models/vvms/13.vvm"
        )
        
        analyzer = AudioQueryPhonemeAnalyzer(voicevox.synthesizer)
        
        for i, text in enumerate(test_texts, 1):
            logger.info(f"\n{'='*50}")
            logger.info(f"📊 テスト {i}: '{text}'")
            logger.info(f"{'='*50}")
            
            # 1. AudioQuery音韻解析
            phoneme_timeline = analyzer.analyze_from_audio_query(text, 54)
            
            if phoneme_timeline:
                # 音韻解析結果の詳細
                logger.info(f"🔤 音韻数: {len(phoneme_timeline)}")
                
                # 口形状の統計
                mouth_shapes = {}
                total_duration = 0.0
                
                for phoneme, mouth_shape, duration in phoneme_timeline:
                    if mouth_shape:
                        mouth_shapes[mouth_shape] = mouth_shapes.get(mouth_shape, 0) + duration
                    total_duration += duration
                
                logger.info(f"⏱️ 推定総時間: {total_duration:.2f}秒")
                logger.info(f"👄 使用される口形状:")
                for shape, duration in sorted(mouth_shapes.items()):
                    percentage = (duration / total_duration * 100) if total_duration > 0 else 0
                    logger.info(f"  {shape}: {duration:.2f}秒 ({percentage:.1f}%)")
                
                # 音声の実際の長さと比較
                try:
                    audio_query = voicevox.synthesizer.create_audio_query(text, 54)
                    wav_data = voicevox.synthesizer.synthesis(audio_query, 54)
                    
                    # WAVファイルから実際の時間を取得
                    import io
                    import wave
                    audio_buffer = io.BytesIO(wav_data)
                    with wave.open(audio_buffer, 'rb') as wf:
                        frames = wf.getnframes()
                        sample_rate = wf.getframerate()
                        actual_duration = frames / sample_rate
                    
                    logger.info(f"🎵 実際の音声長: {actual_duration:.2f}秒")
                    
                    # タイミング誤差の計算
                    timing_error = abs(total_duration - actual_duration)
                    error_percentage = (timing_error / actual_duration * 100) if actual_duration > 0 else 0
                    
                    logger.info(f"⚠️ タイミング誤差: {timing_error:.2f}秒 ({error_percentage:.1f}%)")
                    
                    if error_percentage > 10:
                        logger.warning("⚠️ タイミング誤差が10%を超えています！")
                    elif error_percentage > 5:
                        logger.warning("⚠️ タイミング誤差が5%を超えています")
                    else:
                        logger.info("✅ タイミング誤差は許容範囲内です")
                        
                except Exception as e:
                    logger.error(f"❌ 音声合成エラー: {e}")
                    
            else:
                logger.error("❌ 音韻解析に失敗しました")
                
    except Exception as e:
        logger.error(f"❌ 分析エラー: {e}")
        import traceback
        logger.error(f"❌ エラー詳細: {traceback.format_exc()}")

def analyze_timing_sync():
    """タイミング同期の問題を分析"""
    logger.info("\n🔍 タイミング同期分析")
    
    # 現在のシステムの問題点
    issues = [
        "1. 音韻解析の時間情報が不正確な可能性",
        "2. AudioQueryの時間属性（vowel_length等）が取得できていない",
        "3. 音声再生開始とリップシンク開始の遅延（0.1秒の待機）",
        "4. HTTPリクエストの遅延によるタイミングずれ",
        "5. asyncio.sleep()の精度の問題"
    ]
    
    for issue in issues:
        logger.info(f"⚠️ {issue}")
    
    # 改善案
    improvements = [
        "1. AudioQueryの正確な時間情報を取得する",
        "2. 音声再生とリップシンクの同期開始を実装する", 
        "3. HTTPリクエストを非同期化してレスポンス遅延を軽減する",
        "4. より精密なタイミング制御を実装する",
        "5. 実際の音声長に基づく動的時間調整を改善する"
    ]
    
    logger.info("\n💡 改善案:")
    for improvement in improvements:
        logger.info(f"✨ {improvement}")

def main():
    """メイン分析実行"""
    logger.info("🔬 リップシンクシステム分析開始")
    
    try:
        # 1. 精度分析
        analyze_lipsync_accuracy()
        
        # 2. タイミング同期分析
        analyze_timing_sync()
        
        logger.info("\n📊 分析完了")
        
    except Exception as e:
        logger.error(f"❌ 分析実行エラー: {e}")

if __name__ == "__main__":
    main()
