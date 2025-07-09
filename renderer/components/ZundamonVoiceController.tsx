import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAudioAnalysis } from '../hooks/useAudioAnalysis';

export interface VoiceSettings {
  volume: number;
  speed: number;
  pitch: number;
  intonation: number;
}

export interface ZundamonVoiceControllerProps {
  onLipSyncData?: (data: { volume: number; vowel: string; openness: number; isPlaying: boolean }) => void;
  onSpeakingStateChange?: (isSpeaking: boolean) => void;
  voiceSettings?: VoiceSettings;
  externalVisible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

export const ZundamonVoiceController: React.FC<ZundamonVoiceControllerProps> = ({
  onLipSyncData,
  onSpeakingStateChange,
  voiceSettings = { volume: 0.8, speed: 1.0, pitch: 1.0, intonation: 1.0 },
  externalVisible,
  onVisibilityChange
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  const { audioData, setAudioSource, estimateVowel, calculateMouthOpenness } = useAudioAnalysis();

  // 外部の表示状態と同期
  useEffect(() => {
    if (externalVisible !== undefined) {
      setIsVisible(externalVisible);
    }
  }, [externalVisible]);

  // 内部の表示状態が変更された時に外部に通知
  useEffect(() => {
    if (onVisibilityChange) {
      onVisibilityChange(isVisible);
    }
  }, [isVisible, onVisibilityChange]);

  // 音声解析データが更新されたときの処理
  useEffect(() => {
    if (onLipSyncData && audioData) {
      const vowel = estimateVowel(audioData.formants);
      const openness = calculateMouthOpenness(audioData.volume, vowel);
      
      onLipSyncData({
        volume: audioData.volume,
        vowel,
        openness,
        isPlaying: audioData.isPlaying
      });
    }
  }, [audioData, onLipSyncData, estimateVowel, calculateMouthOpenness]);

  // 音声合成の初期化
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // 話している状態の変更を親に通知
  useEffect(() => {
    if (onSpeakingStateChange) {
      onSpeakingStateChange(isSpeaking);
    }
  }, [isSpeaking, onSpeakingStateChange]);

  // 音声合成でテキストを読み上げ
  const speakText = useCallback((text: string) => {
    if (!synthRef.current) {
      console.warn('音声合成がサポートされていません');
      return;
    }

    // 既存の音声を停止
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // 日本語の音声を探す
    const voices = synthRef.current.getVoices();
    const japaneseVoice = voices.find(voice => 
      voice.lang === 'ja-JP' || voice.lang.startsWith('ja')
    );
    
    if (japaneseVoice) {
      utterance.voice = japaneseVoice;
    }

    // 音声設定を適用
    utterance.volume = voiceSettings.volume;
    utterance.rate = voiceSettings.speed;
    utterance.pitch = voiceSettings.pitch;

    // リップシンク用のダミーデータ生成関数
    const generateLipSyncData = (char: string, volume: number = 0.7) => {
      // 日本語の文字から母音を推定
      const vowelMap: Record<string, string> = {
        'あ': 'a', 'か': 'a', 'が': 'a', 'さ': 'a', 'ざ': 'a', 'た': 'a', 'だ': 'a', 'な': 'a', 'は': 'a', 'ば': 'a', 'ぱ': 'a', 'ま': 'a', 'や': 'a', 'ら': 'a', 'わ': 'a',
        'い': 'i', 'き': 'i', 'ぎ': 'i', 'し': 'i', 'じ': 'i', 'ち': 'i', 'ぢ': 'i', 'に': 'i', 'ひ': 'i', 'び': 'i', 'ぴ': 'i', 'み': 'i', 'り': 'i',
        'う': 'u', 'く': 'u', 'ぐ': 'u', 'す': 'u', 'ず': 'u', 'つ': 'u', 'づ': 'u', 'ぬ': 'u', 'ふ': 'u', 'ぶ': 'u', 'ぷ': 'u', 'む': 'u', 'ゆ': 'u', 'る': 'u',
        'え': 'e', 'け': 'e', 'げ': 'e', 'せ': 'e', 'ぜ': 'e', 'て': 'e', 'で': 'e', 'ね': 'e', 'へ': 'e', 'べ': 'e', 'ぺ': 'e', 'め': 'e', 'れ': 'e',
        'お': 'o', 'こ': 'o', 'ご': 'o', 'そ': 'o', 'ぞ': 'o', 'と': 'o', 'ど': 'o', 'の': 'o', 'ほ': 'o', 'ぼ': 'o', 'ぽ': 'o', 'も': 'o', 'よ': 'o', 'ろ': 'o', 'を': 'o'
      };

      const vowel = vowelMap[char] || 'a'; // デフォルトは'a'
      let openness = 0.5;

      // 母音に応じて開口度を調整
      switch (vowel) {
        case 'a': openness = 0.8 + Math.random() * 0.2; break;
        case 'i': openness = 0.3 + Math.random() * 0.2; break;
        case 'u': openness = 0.4 + Math.random() * 0.2; break;
        case 'e': openness = 0.5 + Math.random() * 0.2; break;
        case 'o': openness = 0.7 + Math.random() * 0.2; break;
      }

      return { volume, vowel, openness, isPlaying: true };
    };

    // 音声合成のイベントリスナー
    let lipSyncInterval: NodeJS.Timeout | null = null;
    let textIndex = 0;

    utterance.onstart = () => {
      console.log('音声合成開始:', text);
      setCurrentText(text);
      setIsSpeaking(true);

      // リップシンクシミュレーション開始
      textIndex = 0;
      lipSyncInterval = setInterval(() => {
        if (textIndex < text.length && onLipSyncData) {
          const char = text[textIndex];
          
          // 音量をランダムに変動させて自然さを演出
          const baseVolume = 0.5 + Math.random() * 0.3;
          const lipSyncData = generateLipSyncData(char, baseVolume);
          
          onLipSyncData(lipSyncData);
          textIndex++;
        }
      }, 150 + Math.random() * 100); // 文字ごとの表示間隔を150-250msでランダム化
    };

    utterance.onend = () => {
      console.log('音声合成終了:', text);
      setCurrentText('');
      setIsSpeaking(false);
      
      // リップシンクを停止
      if (lipSyncInterval) {
        clearInterval(lipSyncInterval);
        lipSyncInterval = null;
      }
      
      // 最終的に口を閉じる
      if (onLipSyncData) {
        onLipSyncData({
          volume: 0,
          vowel: 'silent',
          openness: 0,
          isPlaying: false
        });
      }
    };

    utterance.onerror = (event) => {
      console.error('音声合成エラー:', event);
      setCurrentText('');
      setIsSpeaking(false);
      
      // エラー時もリップシンクを停止
      if (lipSyncInterval) {
        clearInterval(lipSyncInterval);
        lipSyncInterval = null;
      }
      
      if (onLipSyncData) {
        onLipSyncData({
          volume: 0,
          vowel: 'silent',
          openness: 0,
          isPlaying: false
        });
      }
    };

    currentUtteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  }, [voiceSettings, onLipSyncData]);

  // 音声ファイルを再生
  const playAudioFile = useCallback((audioSrc: string) => {
    if (!audioRef.current) return;

    // 音声解析のためにaudioElementを設定
    setAudioSource(audioRef.current);
    
    // 音声ファイルのソースを設定
    audioRef.current.src = audioSrc;
    audioRef.current.volume = voiceSettings.volume;

    // 再生開始
    audioRef.current.play()
      .then(() => {
        console.log('音声ファイル再生開始:', audioSrc);
        setIsSpeaking(true);
        
        // 音声ファイル再生時もダミーリップシンクを開始
        if (onLipSyncData) {
          // 基本的な口パクパターンを生成
          const lipSyncInterval = setInterval(() => {
            const randomVowels = ['a', 'i', 'u', 'e', 'o'];
            const vowel = randomVowels[Math.floor(Math.random() * randomVowels.length)];
            const volume = 0.4 + Math.random() * 0.4;
            let openness = 0.5;
            
            // 母音に応じて開口度を調整
            switch (vowel) {
              case 'a': openness = 0.8 + Math.random() * 0.2; break;
              case 'i': openness = 0.3 + Math.random() * 0.2; break;
              case 'u': openness = 0.4 + Math.random() * 0.2; break;
              case 'e': openness = 0.5 + Math.random() * 0.2; break;
              case 'o': openness = 0.7 + Math.random() * 0.2; break;
            }
            
            onLipSyncData({ volume, vowel, openness, isPlaying: true });
          }, 200 + Math.random() * 100);

          // 音声終了時にクリーンアップ
          const handleEnded = () => {
            clearInterval(lipSyncInterval);
            onLipSyncData({
              volume: 0,
              vowel: 'silent',
              openness: 0,
              isPlaying: false
            });
          };

          audioRef.current.addEventListener('ended', handleEnded, { once: true });
          audioRef.current.addEventListener('pause', handleEnded, { once: true });
        }
      })
      .catch((error) => {
        console.error('音声ファイル再生エラー:', error);
      });
  }, [voiceSettings.volume, setAudioSource, onLipSyncData]);

  // 再生停止
  const stopSpeaking = useCallback(() => {
    // 音声合成を停止
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    
    // 音声ファイル再生を停止
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    setIsSpeaking(false);
    setCurrentText('');
    
    // リップシンクを停止
    if (onLipSyncData) {
      onLipSyncData({
        volume: 0,
        vowel: 'silent',
        openness: 0,
        isPlaying: false
      });
    }
  }, [onLipSyncData]);

  // 定型文の読み上げ
  const speakPresetText = useCallback((presetKey: string) => {
    const presets: Record<string, string> = {
      greeting: 'こんにちは！ずんだもんなのだ！',
      thanks: 'ありがとうなのだ！',
      bye: 'またあとでなのだ〜',
      happy: 'とても嬉しいのだ！',
      surprise: 'えっ！びっくりしたのだ！',
      sad: 'ちょっと悲しいのだ...',
      angry: 'むむむ...怒ったのだ！',
      confused: '？？？なのだ',
      laugh: 'あはは！楽しいのだ！',
      sleepy: 'ちょっと眠いのだ...'
    };

    const text = presets[presetKey];
    if (text) {
      speakText(text);
    }
  }, [speakText]);

  // ランダムなずんだもんのセリフを話す
  const speakRandomPhrase = useCallback(() => {
    const phrases = [
      'ずんだ餅は美味しいのだ！',
      '今日もいい天気なのだ〜',
      'みんなで一緒に楽しもうなのだ！',
      'ずんだもんがお手伝いするのだ！',
      '何か面白いことはないかなのだ？',
      'お腹すいたのだ〜',
      'みんなは何してるのだ？',
      'ずんだパワー全開なのだ！'
    ];
    
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    speakText(randomPhrase);
  }, [speakText]);

  return (
    <React.Fragment>
      {/* 常に表示されるトグルボタン */}
      <button 
        onClick={() => setIsVisible(!isVisible)}
        style={{
          position: 'fixed',
          top: 10,
          right: 10,
          background: isVisible ? '#f44336' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          padding: '8px 12px',
          cursor: 'pointer',
          zIndex: 1001,
          fontSize: '16px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
        title="音声コントロールパネル (Vキー)"
      >
        🎤
      </button>

      {/* 音声コントロールパネル */}
      <div style={{ 
        position: 'fixed', 
        top: 10, 
        right: isVisible ? 10 : -320, // 右側からスライドイン
        zIndex: 1000,
        transition: 'right 0.3s ease',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none'
      }}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '15px',
          borderRadius: '8px',
          minWidth: '280px',
          marginRight: '60px', // トグルボタンとの間隔
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>ずんだもん音声制御 (V)</h3>
          <div style={{ 
            fontSize: '12px', 
            color: '#666', 
            marginBottom: '12px',
            fontStyle: 'italic'
          }}>
            Vキーで開閉 | 音声合成・音声ファイル再生・リップシンク連動
          </div>
          
          {/* 音声ファイル再生用 */}
          <audio 
            ref={audioRef}
            onPlay={() => setIsSpeaking(true)}
            onPause={() => setIsSpeaking(false)}
            onEnded={() => setIsSpeaking(false)}
            style={{ display: 'none' }}
          />

          {/* 現在の状態表示 */}
          <div style={{ marginBottom: '15px', fontSize: '12px' }}>
            <div>状態: <span style={{ color: isSpeaking ? '#4CAF50' : '#999' }}>
              {isSpeaking ? '話し中' : '待機中'}
            </span></div>
            {currentText && <div>テキスト: {currentText}</div>}
            <div>音量: {audioData.volume.toFixed(2)}</div>
            <div>周波数: {audioData.frequency.toFixed(0)}Hz</div>
          </div>

          {/* 制御ボタン */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
            <button 
              onClick={() => speakText('こんにちは！ずんだもんなのだ！')}
              style={{
                padding: '8px 12px',
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              挨拶
            </button>
            <button 
              onClick={speakRandomPhrase}
              style={{
                padding: '8px 12px',
                background: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ランダムセリフ
            </button>
            <button 
              onClick={stopSpeaking} 
              disabled={!isSpeaking}
              style={{
                padding: '8px 12px',
                background: isSpeaking ? '#f44336' : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isSpeaking ? 'pointer' : 'not-allowed',
                fontSize: '14px'
              }}
            >
              停止
            </button>
          </div>

          {/* 音声設定 */}
          <div style={{ fontSize: '12px' }}>
            <div style={{ marginBottom: '8px' }}>
              音量: {voiceSettings.volume.toFixed(1)}
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.1" 
                value={voiceSettings.volume}
                onChange={(e) => {
                  // voiceSettingsの更新は親コンポーネントで処理
                }}
                style={{ width: '100%', marginTop: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              速度: {voiceSettings.speed.toFixed(1)}
              <input 
                type="range" 
                min="0.5" 
                max="2" 
                step="0.1" 
                value={voiceSettings.speed}
                onChange={(e) => {
                  // voiceSettingsの更新は親コンポーネントで処理
                }}
                style={{ width: '100%', marginTop: '4px' }}
              />
            </div>

            <div style={{ fontSize: '10px', color: '#999', marginTop: '10px' }}>
              ショートカット: Vキーでパネル切り替え
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
};