#!/usr/bin/env python3
"""
AudioQuery詳細時間検証ツール
実際にAudioQueryから取得される時間情報を詳細調査
"""

import requests
import json

def verify_audioquery_timing():
    """AudioQueryの時間情報を詳細検証"""
    
    print("🔍 AudioQuery時間情報検証")
    print("=" * 50)
    
    test_texts = [
        "坂本先輩、お疲れ様です",
        "僕の名前はシリウスです"
    ]
    
    for text in test_texts:
        print(f"\n📝 テキスト: '{text}'")
        print("-" * 30)
        
        try:
            # AudioQuery取得
            response = requests.post(
                "http://localhost:50021/audio_query",
                params={"text": text, "speaker": 47}
            )
            
            if response.status_code == 200:
                audio_query = response.json()
                
                # 詳細時間分析
                total_vowel_time = 0
                total_consonant_time = 0  
                total_pause_time = 0
                phoneme_count = 0
                
                print("🎭 Accent Phrases詳細:")
                for phrase_idx, accent_phrase in enumerate(audio_query.get('accent_phrases', [])):
                    print(f"  Phrase {phrase_idx + 1}:")
                    
                    # Moraの処理
                    for mora_idx, mora in enumerate(accent_phrase.get('moras', [])):
                        phoneme_count += 1
                        
                        # 子音時間
                        consonant = getattr(mora, 'consonant', None) if hasattr(mora, 'consonant') else mora.get('consonant')
                        consonant_length = getattr(mora, 'consonant_length', None) if hasattr(mora, 'consonant_length') else mora.get('consonant_length')
                        
                        # 母音時間
                        vowel = getattr(mora, 'vowel', None) if hasattr(mora, 'vowel') else mora.get('vowel')
                        vowel_length = getattr(mora, 'vowel_length', None) if hasattr(mora, 'vowel_length') else mora.get('vowel_length')
                        
                        print(f"    Mora {mora_idx + 1}: ", end="")
                        
                        if consonant and consonant_length:
                            print(f"子音={consonant}({consonant_length:.3f}s) ", end="")
                            total_consonant_time += consonant_length
                        
                        if vowel and vowel_length:
                            print(f"母音={vowel}({vowel_length:.3f}s)", end="")
                            total_vowel_time += vowel_length
                        
                        print()
                    
                    # ポーズの処理
                    pause_mora = accent_phrase.get('pause_mora')
                    if pause_mora:
                        pause_length = pause_mora.get('pause_length')
                        if pause_length:
                            print(f"    ポーズ: {pause_length:.3f}s")
                            total_pause_time += pause_length
                        else:
                            print(f"    ポーズ: pause_lengthが見つかりません")
                            print(f"    ポーズデータ: {pause_mora}")
                
                # 合計時間計算
                calculated_total = total_vowel_time + total_consonant_time + total_pause_time
                
                print(f"\n📊 時間分析結果:")
                print(f"   母音時間合計: {total_vowel_time:.3f}秒")
                print(f"   子音時間合計: {total_consonant_time:.3f}秒") 
                print(f"   ポーズ時間合計: {total_pause_time:.3f}秒")
                print(f"   計算合計時間: {calculated_total:.3f}秒")
                print(f"   音韻数: {phoneme_count}個")
                
                # AudioQueryのprePhonemeLength, postPhonemeLength確認
                pre_phoneme_length = audio_query.get('prePhonemeLength', 0)
                post_phoneme_length = audio_query.get('postPhonemeLength', 0)
                
                print(f"\n🔧 前後音韻長:")
                print(f"   prePhonemeLength: {pre_phoneme_length:.3f}秒")
                print(f"   postPhonemeLength: {post_phoneme_length:.3f}秒")
                
                # 実際の合成音声の長さを測定
                synthesis_response = requests.post(
                    "http://localhost:50021/synthesis",
                    headers={"Content-Type": "application/json"},
                    data=json.dumps(audio_query),
                    params={"speaker": 47}
                )
                
                if synthesis_response.status_code == 200:
                    # 音声ファイルを一時保存して長さを測定
                    with open("temp_audio.wav", "wb") as f:
                        f.write(synthesis_response.content)
                    
                    # PyAudioで実際の長さを測定
                    import wave
                    with wave.open("temp_audio.wav", "rb") as wav_file:
                        frames = wav_file.getnframes()
                        sample_rate = wav_file.getframerate()
                        actual_duration = frames / sample_rate
                    
                    print(f"   実際の音声長: {actual_duration:.3f}秒")
                    print(f"   差分: {actual_duration - calculated_total:.3f}秒")
                    
                    import os
                    os.remove("temp_audio.wav")
                
        except Exception as e:
            print(f"❌ エラー: {e}")

if __name__ == "__main__":
    verify_audioquery_timing()
