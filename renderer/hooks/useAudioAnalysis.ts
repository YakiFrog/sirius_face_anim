import { useState, useEffect, useRef, useCallback } from 'react';

export interface AudioAnalysisData {
  volume: number;
  frequency: number;
  isPlaying: boolean;
  formants: number[];
}

export const useAudioAnalysis = () => {
  const [audioData, setAudioData] = useState<AudioAnalysisData>({
    volume: 0,
    frequency: 0,
    isPlaying: false,
    formants: []
  });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // 音声ファイルを解析対象として設定
  const setAudioSource = useCallback((audioElement: HTMLAudioElement) => {
    try {
      // 既存の接続をクリーンアップ
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      
      audioElementRef.current = audioElement;
      
      // AudioContextを作成（まだ作成されていない場合）
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      // 新しいAnalyserNodeを作成
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 1024;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      // 音声要素からソースを作成
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      sourceRef.current = audioContextRef.current.createMediaElementSource(audioElement);
      
      // 接続: source -> analyser -> destination
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
      
      // 分析を開始
      startAnalysis();
      
      console.log('音声解析セットアップ完了');
    } catch (error) {
      console.error('音声解析セットアップエラー:', error);
    }
  }, []);

  // 音声解析を開始
  const startAnalysis = useCallback(() => {
    if (!analyserRef.current || !audioElementRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const frequencyArray = new Uint8Array(bufferLength);

    const analyze = () => {
      if (!audioElementRef.current || audioElementRef.current.paused) {
        setAudioData(prev => ({ ...prev, isPlaying: false, volume: 0 }));
        rafIdRef.current = requestAnimationFrame(analyze);
        return;
      }

      // 時間領域データ（音量解析用）
      analyser.getByteTimeDomainData(dataArray);
      
      // 周波数領域データ（周波数解析用）
      analyser.getByteFrequencyData(frequencyArray);

      // 音量を計算（RMS）
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const value = (dataArray[i] - 128) / 128;
        sum += value * value;
      }
      const volume = Math.sqrt(sum / bufferLength);

      // 主要な周波数を検出
      let maxValue = 0;
      let maxIndex = 0;
      for (let i = 1; i < bufferLength / 4; i++) { // 低周波数帯域をチェック
        if (frequencyArray[i] > maxValue) {
          maxValue = frequencyArray[i];
          maxIndex = i;
        }
      }
      
      const sampleRate = audioContextRef.current?.sampleRate || 44100;
      const frequency = (maxIndex * sampleRate) / (analyser.fftSize * 2);

      // フォルマント検出（簡易版）
      const formants = detectFormants(frequencyArray, sampleRate, analyser.fftSize);

      setAudioData({
        volume: volume * 2, // 感度を上げる
        frequency,
        isPlaying: !audioElementRef.current.paused,
        formants
      });

      rafIdRef.current = requestAnimationFrame(analyze);
    };

    analyze();
  }, []);

  // フォルマント検出（母音判定用）
  const detectFormants = (frequencyData: Uint8Array, sampleRate: number, fftSize: number): number[] => {
    const formants = [];
    const binWidth = sampleRate / fftSize;
    
    // F1 (第1フォルマント): 300-1000Hz
    const f1Start = Math.floor(300 / binWidth);
    const f1End = Math.floor(1000 / binWidth);
    let f1Max = 0;
    let f1Index = f1Start;
    
    for (let i = f1Start; i < f1End && i < frequencyData.length; i++) {
      if (frequencyData[i] > f1Max) {
        f1Max = frequencyData[i];
        f1Index = i;
      }
    }
    
    // F2 (第2フォルマント): 1000-3000Hz
    const f2Start = Math.floor(1000 / binWidth);
    const f2End = Math.floor(3000 / binWidth);
    let f2Max = 0;
    let f2Index = f2Start;
    
    for (let i = f2Start; i < f2End && i < frequencyData.length; i++) {
      if (frequencyData[i] > f2Max) {
        f2Max = frequencyData[i];
        f2Index = i;
      }
    }
    
    formants.push(f1Index * binWidth);
    formants.push(f2Index * binWidth);
    
    return formants;
  };

  // 母音を推定
  const estimateVowel = useCallback((formants: number[]): string => {
    if (formants.length < 2) return 'silent';
    
    const f1 = formants[0];
    const f2 = formants[1];
    
    // 簡易的な母音判定
    if (f1 < 400 && f2 > 2000) return 'i'; // イ
    if (f1 < 500 && f2 < 1500) return 'u'; // ウ
    if (f1 > 600 && f2 > 1500) return 'a'; // ア
    if (f1 > 500 && f2 < 1500) return 'o'; // オ
    if (f1 < 600 && f2 > 1500) return 'e'; // エ
    
    return 'neutral';
  }, []);

  // 口の開口度を計算
  const calculateMouthOpenness = useCallback((volume: number, vowel: string): number => {
    // 基本の開口度（音量ベース）
    let openness = Math.min(volume * 3, 1.0);
    
    // 母音による調整
    switch (vowel) {
      case 'a': // ア - 最も大きく開く
        openness *= 1.0;
        break;
      case 'e': // エ - やや開く
        openness *= 0.8;
        break;
      case 'i': // イ - 横に広く、縦は狭く
        openness *= 0.4;
        break;
      case 'o': // オ - 丸く開く
        openness *= 0.7;
        break;
      case 'u': // ウ - 小さく丸く
        openness *= 0.5;
        break;
      case 'silent':
        openness = 0;
        break;
      default:
        openness *= 0.6;
    }
    
    return openness;
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    audioData,
    setAudioSource,
    estimateVowel: (formants: number[]) => estimateVowel(formants),
    calculateMouthOpenness: (volume: number, vowel: string) => calculateMouthOpenness(volume, vowel)
  };
};
