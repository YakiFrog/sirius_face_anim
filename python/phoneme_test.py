#!/usr/bin/env python3
"""
音韻解析テスト - 簡易版
VOICEVOX不要で音韻解析のみをテスト
"""

import time
import logging
from typing import List, Tuple

# ログ設定
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SimplePhonemeAnalyzer:
    """簡易音韻解析クラス"""
    
    def __init__(self):
        pass
    
    def analyze_text(self, text: str) -> List[Tuple[str, str, float]]:
        """
        テキストから音韻解析を行い、口形状のタイムラインを生成
        
        Returns:
            List[Tuple[str, str, float]]: (文字, 口形状, 継続時間) のリスト
        """
        try:
            phoneme_timeline = []
            char_duration = 0.15  # 文字あたりの基本時間（秒）
            
            # ひらがなマッピング
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
            
            # カタカナマッピング
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
                elif char in '。！？、':
                    # 句読点の場合は少し長めの無音
                    phoneme_timeline.append((char, None, 0.3))
                    continue
                elif char == ' ' or char == '　':
                    # スペースの場合は短い無音
                    phoneme_timeline.append((char, None, 0.1))
                    continue
                else:
                    # その他の文字（漢字など）は'a'として扱う
                    mouth_shape = 'a'
                
                # 有効な口形状がある場合のみ追加
                if mouth_shape:
                    phoneme_timeline.append((char, mouth_shape, char_duration))
            
            return phoneme_timeline
            
        except Exception as e:
            logger.error(f"❌ 音韻解析エラー: {e}")
            return []
    
    def print_analysis(self, text: str):
        """音韻解析結果を表示"""
        logger.info(f"🔤 音韻解析対象: '{text}'")
        
        timeline = self.analyze_text(text)
        
        if not timeline:
            logger.warning("⚠️ 音韻解析結果が空です")
            return
        
        # 結果表示
        logger.info("🎭 口形状シーケンス:")
        total_duration = 0.0
        
        for i, (char, mouth_shape, duration) in enumerate(timeline):
            if mouth_shape:
                logger.info(f"  {i+1:2d}. '{char}' → {mouth_shape} ({duration:.2f}秒)")
                total_duration += duration
            else:
                logger.info(f"  {i+1:2d}. '{char}' → 無音 ({duration:.2f}秒)")
                total_duration += duration
        
        # 統計情報
        logger.info(f"📊 総継続時間: {total_duration:.2f}秒")
        logger.info(f"📊 口形状変化数: {len([t for t in timeline if t[1]])}")
        
        # 口形状の統計
        shape_counts = {}
        shape_durations = {}
        
        for char, mouth_shape, duration in timeline:
            if mouth_shape:
                shape_counts[mouth_shape] = shape_counts.get(mouth_shape, 0) + 1
                shape_durations[mouth_shape] = shape_durations.get(mouth_shape, 0) + duration
        
        logger.info("📊 口形状別統計:")
        for shape in sorted(shape_counts.keys()):
            count = shape_counts[shape]
            duration = shape_durations[shape]
            percentage = (duration / total_duration) * 100 if total_duration > 0 else 0
            logger.info(f"  {shape}: {count}回 ({duration:.2f}秒, {percentage:.1f}%)")

def main():
    """メイン関数"""
    analyzer = SimplePhonemeAnalyzer()
    
    # テストケース
    test_texts = [
        "あいうえお",
        "かきくけこ",
        "さしすせそ",
        "あいうえお、かきくけこ、さしすせそ。",
        "こんにちは",
        "私の名前はシリウスです",
        "今日はとても良い天気ですね",
    ]
    
    print("🤖 音韻解析テストシステム")
    print("=" * 50)
    
    for i, text in enumerate(test_texts, 1):
        print(f"\n【テスト {i}】")
        analyzer.print_analysis(text)
        print("-" * 50)
    
    # インタラクティブモード
    print("\n🎮 インタラクティブモード")
    print("テキストを入力してください（'q'で終了）:")
    
    while True:
        try:
            user_input = input("\n> ").strip()
            if user_input.lower() == 'q':
                break
            if user_input:
                print()
                analyzer.print_analysis(user_input)
        except KeyboardInterrupt:
            break
    
    print("\n👋 テスト終了")

if __name__ == "__main__":
    main()
