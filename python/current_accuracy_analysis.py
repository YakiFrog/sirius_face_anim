#!/usr/bin/env python3
"""
現在のリップシンク精度分析ツール
ログから実際の時間データを抽出して精度を評価
"""

def analyze_current_accuracy():
    """現在の精度を分析"""
    
    print("🎯 現在のリップシンク精度分析")
    print("=" * 50)
    
    # ログから抽出したデータ
    test_cases = [
        {
            "text": "坂本先輩、お疲れ様です",
            "calculated_time": 1.75,  # AudioQuery計算時間
            "actual_audio": 2.71,     # 実際の音声長
            "lipsync_time": 2.71,     # リップシンク時間 
            "audio_playback": 3.59,   # 音声再生時間
            "phonemes": 17
        },
        {
            "text": "僕の名前はシリウスです", 
            "calculated_time": 1.04,  # AudioQuery計算時間
            "actual_audio": 1.94,     # 実際の音声長
            "lipsync_time": 1.94,     # リップシンク時間
            "audio_playback": 2.81,   # 音声再生時間
            "phonemes": 13
        }
    ]
    
    print("\n📊 各テストケースの詳細分析:")
    print("-" * 50)
    
    total_audio_error = 0
    total_playback_error = 0
    
    for i, case in enumerate(test_cases, 1):
        print(f"\n{i}. 【{case['text']}】")
        print(f"   音韻数: {case['phonemes']}個")
        
        # AudioQuery計算時間 vs 実際音声長
        audio_error = abs(case['calculated_time'] - case['actual_audio'])
        audio_error_percent = (audio_error / case['actual_audio']) * 100
        
        # リップシンク時間 vs 音声再生時間  
        playback_error = abs(case['lipsync_time'] - case['audio_playback'])
        playback_error_percent = (playback_error / case['audio_playback']) * 100
        
        # 時間調整比率
        adjustment_ratio = case['actual_audio'] / case['calculated_time']
        
        print(f"   📐 AudioQuery計算: {case['calculated_time']:.2f}秒")
        print(f"   🎵 実際音声長: {case['actual_audio']:.2f}秒")
        print(f"   🎭 リップシンク: {case['lipsync_time']:.2f}秒")  
        print(f"   🔊 音声再生: {case['audio_playback']:.2f}秒")
        print(f"   📊 調整比率: {adjustment_ratio:.2f}倍")
        print(f"   ❌ 音声長誤差: {audio_error:.2f}秒 ({audio_error_percent:.1f}%)")
        print(f"   ❌ 再生時間誤差: {playback_error:.2f}秒 ({playback_error_percent:.1f}%)")
        
        total_audio_error += audio_error_percent
        total_playback_error += playback_error_percent
    
    # 平均誤差
    avg_audio_error = total_audio_error / len(test_cases)
    avg_playback_error = total_playback_error / len(test_cases)
    
    print(f"\n🎯 全体精度サマリー:")
    print("=" * 50)
    print(f"📊 平均音声長誤差: {avg_audio_error:.1f}%")
    print(f"📊 平均再生時間誤差: {avg_playback_error:.1f}%")
    
    # 改善度評価
    print(f"\n🔍 改善度評価:")
    print("-" * 50)
    if avg_audio_error < 20:
        print("✅ AudioQuery時間計算: 良好 (20%未満)")
    elif avg_audio_error < 40:
        print("⚠️  AudioQuery時間計算: 改善の余地あり (20-40%)")
    else:
        print("❌ AudioQuery時間計算: 要改善 (40%以上)")
        
    if avg_playback_error < 10:
        print("✅ 音声・リップシンク同期: 良好 (10%未満)")
    elif avg_playback_error < 25:
        print("⚠️  音声・リップシンク同期: 改善の余地あり (10-25%)")
    else:
        print("❌ 音声・リップシンク同期: 要改善 (25%以上)")
    
    # 具体的な問題点
    print(f"\n🔧 発見された問題:")
    print("-" * 50)
    print("1. AudioQuery計算時間が実際より短い (1.87倍の調整が必要)")
    print("2. 音声再生時間がリップシンクより長い (PyAudio遅延?)")
    print("3. ポーズ時間が固定値 (0.3秒) になっている可能性")
    
    # 推奨改善策
    print(f"\n💡 推奨改善策:")
    print("-" * 50)
    print("1. ポーズ時間の正確な取得 (pause_length使用)")
    print("2. 音声再生とリップシンクの同期改善")
    print("3. AudioQuery時間計算の精度向上")
    print("4. 前後無音部分の除去")

if __name__ == "__main__":
    analyze_current_accuracy()
