import React, { useState, useEffect } from 'react'
import Head from 'next/head'

import { P5Sketch } from '../components/P5Sketch'
import { ZundamonVoiceController } from '../components/ZundamonVoiceController'
import { FacialExpression } from '../components/FaceDrawing'

// 型定義
type DisplayMode = 'face' | 'image';
type ImageScaleMode = 'fit' | 'fill' | 'stretch';
type VoiceSettings = { volume: number; speed: number; pitch: number; intonation: number };
type RandomExpressionItem = { expression: string; enabled: boolean };
type LipSyncData = { volume: number; vowel: string; openness: number; isPlaying: boolean } | null;

export default function HomePage() {
  const [enableRos2Connection, setEnableRos2Connection] = useState(false); // デフォルトでfalseに変更（開発時）
  const [ros2HttpUrl, setRos2HttpUrl] = useState('http://localhost:8080'); // HTTPエンドポイント
  
  // 画像表示モードの状態を追加
  const [displayMode, setDisplayMode] = useState<'face' | 'image'>('face');
  const [imagePath, setImagePath] = useState('');
  const [imageScaleMode, setImageScaleMode] = useState<'fit' | 'fill' | 'stretch'>('fit');
  const [imageOpacity, setImageOpacity] = useState(1.0);

  // ランダム表情変更の状態を追加
  const [enableRandomExpression, setEnableRandomExpression] = useState(false);
  const [randomExpressionList, setRandomExpressionList] = useState<FacialExpression[]>(['neutral', 'happy', 'angry', 'sad', 'surprised', 'crying', 'hurt', 'wink']);
  const [randomIntervalMin, setRandomIntervalMin] = useState(1);
  const [randomIntervalMax, setRandomIntervalMax] = useState(5);

  // 音声連携の状態を追加
  const [enableVoiceSync, setEnableVoiceSync] = useState(true); // デフォルトで有効に変更
  const [lipSyncData, setLipSyncData] = useState<{ volume: number; vowel: string; openness: number; isPlaying: boolean } | null>(null);
  const [voiceSettings, setVoiceSettings] = useState({ volume: 0.8, speed: 1.0, pitch: 1.0, intonation: 1.0 });

  // UIコントロールの状態を追加
  const [showSettings, setShowSettings] = useState(false);
  const [voiceControllerVisible, setVoiceControllerVisible] = useState(false);

  // 設定の保存と読み込み
  useEffect(() => {
    // ROS2接続の設定を読み込み（開発時はfalseがデフォルト）
    const savedConnection = localStorage.getItem('enableRos2Connection');
    const savedUrl = localStorage.getItem('ros2HttpUrl');
    
    // 画像表示モードの設定を読み込み
    const savedDisplayMode = localStorage.getItem('displayMode') as 'face' | 'image';
    const savedImagePath = localStorage.getItem('imagePath');
    const savedImageScaleMode = localStorage.getItem('imageScaleMode') as 'fit' | 'fill' | 'stretch';
    const savedImageOpacity = localStorage.getItem('imageOpacity');
    
    // ランダム表情の設定を読み込み
    const savedEnableRandomExpression = localStorage.getItem('enableRandomExpression');
    const savedRandomExpressionList = localStorage.getItem('randomExpressionList');
    const savedRandomIntervalMin = localStorage.getItem('randomIntervalMin');
    const savedRandomIntervalMax = localStorage.getItem('randomIntervalMax');
    
    // 音声連携の設定を読み込み
    const savedEnableVoiceSync = localStorage.getItem('enableVoiceSync');
    const savedVoiceSettings = localStorage.getItem('voiceSettings');
    
    // ROS2接続の設定を適用
    if (savedConnection) {
      setEnableRos2Connection(savedConnection === 'true');
    }
    
    if (savedUrl) {
      setRos2HttpUrl(savedUrl);
    }
    
    if (savedDisplayMode) {
      setDisplayMode(savedDisplayMode);
    }
    
    if (savedImagePath) {
      setImagePath(savedImagePath);
    }
    
    if (savedImageScaleMode) {
      setImageScaleMode(savedImageScaleMode);
    }
    
    if (savedImageOpacity) {
      setImageOpacity(parseFloat(savedImageOpacity));
    }
    
    // ランダム表情設定の読み込み
    if (savedEnableRandomExpression) {
      setEnableRandomExpression(savedEnableRandomExpression === 'true');
    }
    
    if (savedRandomExpressionList) {
      try {
        const parsedList = JSON.parse(savedRandomExpressionList) as FacialExpression[];
        setRandomExpressionList(parsedList);
      } catch (error) {
        console.warn('ランダム表情リストの読み込みに失敗しました:', error);
      }
    }
    
    if (savedRandomIntervalMin) {
      setRandomIntervalMin(parseFloat(savedRandomIntervalMin));
    }
    
    if (savedRandomIntervalMax) {
      setRandomIntervalMax(parseFloat(savedRandomIntervalMax));
    }
    
    // 音声連携設定の読み込み
    if (savedEnableVoiceSync) {
      setEnableVoiceSync(savedEnableVoiceSync === 'true');
    }
    
    if (savedVoiceSettings) {
      try {
        const parsedSettings = JSON.parse(savedVoiceSettings);
        setVoiceSettings(parsedSettings);
      } catch (error) {
        console.warn('音声設定の読み込みに失敗しました:', error);
      }
    }
  }, []);

  // 設定が変更されたら保存
  useEffect(() => {
    localStorage.setItem('enableRos2Connection', enableRos2Connection.toString());
    localStorage.setItem('ros2HttpUrl', ros2HttpUrl);
    localStorage.setItem('displayMode', displayMode);
    localStorage.setItem('imagePath', imagePath);
    localStorage.setItem('imageScaleMode', imageScaleMode);
    localStorage.setItem('imageOpacity', imageOpacity.toString());
    
    // ランダム表情設定の保存
    localStorage.setItem('enableRandomExpression', enableRandomExpression.toString());
    localStorage.setItem('randomExpressionList', JSON.stringify(randomExpressionList));
    localStorage.setItem('randomIntervalMin', randomIntervalMin.toString());
    localStorage.setItem('randomIntervalMax', randomIntervalMax.toString());
    
    // 音声連携設定の保存
    localStorage.setItem('enableVoiceSync', enableVoiceSync.toString());
    localStorage.setItem('voiceSettings', JSON.stringify(voiceSettings));
  }, [ros2HttpUrl, displayMode, imagePath, imageScaleMode, imageOpacity, enableRandomExpression, randomExpressionList, randomIntervalMin, randomIntervalMax, enableVoiceSync, voiceSettings, enableRos2Connection]); // enableRos2Connectionも依存関係に追加

  // グローバルキーボードイベントハンドラーを追加（最上位レベルで処理）
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      console.log('グローバルキーイベント:', event.key, '現在のモード:', displayMode);
      
      if (event.key.toLowerCase() === 'i') {
        console.log('グローバル経由でiキーが検出されました - 現在のモード:', displayMode);
        const newMode = displayMode === 'face' ? 'image' : 'face';
        console.log('新しいモードに切り替え:', newMode);
        setDisplayMode(newMode);
        
        // 画像モードに切り替わる時は、常に1.pngを設定
        if (newMode === 'image') {
          setImagePath('/screen/1.png');
          console.log('1.pngを設定しました');
        }
        
        event.preventDefault();
        event.stopPropagation();
      } 
      // 数字キーでの画像切り替えを無効化（コメントアウト）
      // else if (displayMode === 'image' && event.key >= '1' && event.key <= '9') {
      //   // 画像モードで数字キーが押された場合、対応する画像に切り替え
      //   const imageNumber = event.key;
      //   const newImagePath = `/screen/${imageNumber}.png`;
      //   console.log(`グローバル経由で数字キー ${imageNumber}: 画像を ${newImagePath} に変更`);
      //   setImagePath(newImagePath);
      //   event.preventDefault();
      //   event.stopPropagation();
      // }
    };

    // グローバルイベントリスナーを追加
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [displayMode, imagePath]); // displayModeとimagePathを依存関係に追加

  // キーボードショートカット（V: 音声コントローラー、S: 設定パネル）
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Ctrl、Cmd、Altキーが押されている場合は無視
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      
      // 入力フィールドにフォーカスがある場合は無視
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }
      
      if (event.key.toLowerCase() === 'v') {
        console.log('Vキーが押されました - 音声コントローラーを切り替え');
        setVoiceControllerVisible(prev => !prev);
        event.preventDefault();
      } else if (event.key.toLowerCase() === 's') {
        console.log('Sキーが押されました - 設定パネルを切り替え');
        setShowSettings(prev => !prev);
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  // ランダム表情変更のコールバック関数
  const handleRandomExpressionChange = (isActive: boolean) => {
    console.log(`ランダム表情モード変更: ${isActive ? 'ON' : 'OFF'}`);
    setEnableRandomExpression(isActive);
  };

  // 音声連携のコールバック関数
  const handleLipSyncData = (data: { volume: number; vowel: string; openness: number; isPlaying: boolean }) => {
    setLipSyncData(data);
  };

  const handleVoiceSyncStateChange = (isActive: boolean) => {
    console.log(`音声連携モード変更: ${isActive ? 'ON' : 'OFF'}`);
    setEnableVoiceSync(isActive);
  };

  const handleSpeakingStateChange = (isSpeaking: boolean) => {
    console.log(`音声再生状態変更: ${isSpeaking ? '再生中' : '停止'}`);
    // 必要に応じて追加のロジックを実装
  };

  // 表情リストの個別トグル関数
  const toggleExpressionInList = (expression: FacialExpression) => {
    setRandomExpressionList(prev => {
      if (prev.includes(expression)) {
        // 既に含まれている場合は削除（ただし、最低1つは残す）
        if (prev.length > 1) {
          return prev.filter(expr => expr !== expression);
        }
        return prev; // 最後の1つの場合は削除しない
      } else {
        // 含まれていない場合は追加
        return [...prev, expression];
      }
    });
  };

  return (
    <React.Fragment>
      <Head>
        <title>Sirius Face Animation</title>
        <style jsx global>{`
          /* リセット */
          html, body, #__next {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100vh;
            overflow: hidden;
            background-color: #000;
          }
          
          /* コンテナのセンタリング */
          .sketch-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: grid;
            place-items: center;
            background-color: #000;
            overflow: hidden;
          }
          
          /* キャンバス用の特定スタイル */
          canvas {
            position: relative !important;
            margin: auto !important;
          }
          
          /* 設定パネル */
          .settings-panel {
            position: fixed;
            top: 60px;
            left: 20px;
            padding: 12px;
            background-color: rgba(0, 0, 0, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            color: white;
            z-index: 999;
            font-family: 'Arial', sans-serif;
            transition: opacity 0.3s ease;
            max-width: 400px;
            max-height: 80vh;
            overflow-y: auto;
          }
          
          .settings-panel.hidden {
            opacity: 0;
            pointer-events: none;
          }
          
          .settings-panel h3 {
            margin-top: 0;
            margin-bottom: 12px;
            font-size: 16px;
            font-weight: normal;
          }
          
          .settings-panel label {
            display: block;
            margin-bottom: 8px;
          }
          
          .settings-panel input[type="text"] {
            width: 200px;
            padding: 6px;
            background-color: rgba(30, 30, 30, 0.8);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: white;
            border-radius: 4px;
          }
          
          .settings-panel button {
            padding: 6px 12px;
            background-color: rgba(60, 60, 60, 0.8);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            cursor: pointer;
            margin-right: 8px;
            margin-top: 8px;
          }
          
          .settings-panel button:hover {
            background-color: rgba(80, 80, 80, 0.8);
          }
          
          .toggle-settings {
            position: fixed;
            top: 20px;
            left: 20px;
            padding: 12px 20px;
            background: linear-gradient(135deg, #007acc, #0066cc);
            color: white;
            border: 3px solid rgba(255, 255, 255, 0.9);
            border-radius: 12px;
            cursor: pointer;
            z-index: 99999;
            opacity: 1;
            transition: all 0.3s ease;
            font-size: 18px;
            font-weight: 700;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6), 0 0 30px rgba(0, 122, 204, 0.4);
            backdrop-filter: blur(10px);
            user-select: none;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
            animation: glow 2s ease-in-out infinite alternate;
          }
          
          @keyframes glow {
            from { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6), 0 0 30px rgba(0, 122, 204, 0.4); }
            to { box-shadow: 0 8px 25px rgba(0, 0, 0, 0.8), 0 0 40px rgba(0, 122, 204, 0.6); }
          }
          
          .toggle-settings:hover {
            background: linear-gradient(135deg, #0088ff, #0077dd);
            border-color: rgba(255, 255, 255, 1);
            transform: scale(1.1);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 50px rgba(0, 122, 204, 0.8);
            animation: none;
          }
          
          .toggle-settings:active {
            transform: scale(1.05);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.6), 0 0 25px rgba(0, 122, 204, 0.5);
          }
        `}</style>
      </Head>
      <div className="sketch-container">
        <P5Sketch 
          fullScreen={true} 
          enableRos2Connection={enableRos2Connection}
          ros2HttpUrl={ros2HttpUrl}
          displayMode={displayMode}
          imagePath={imagePath}
          imageScaleMode={imageScaleMode}
          imageOpacity={imageOpacity}
          enableRandomExpression={enableRandomExpression}
          randomExpressionList={randomExpressionList}
          randomIntervalMin={randomIntervalMin}
          randomIntervalMax={randomIntervalMax}
          enableVoiceSync={enableVoiceSync}
          lipSyncData={lipSyncData}
          onDisplayModeToggle={() => {
            console.log('画像モード切り替え:', displayMode === 'face' ? 'image' : 'face');
            const newMode = displayMode === 'face' ? 'image' : 'face';
            setDisplayMode(newMode);
            
            // 画像モードに切り替わる時に、画像パスが空の場合はデフォルト画像を設定
            if (newMode === 'image' && !imagePath) {
              setImagePath('/screen/1.png');
              console.log('デフォルト画像を設定しました: /screen/1.png');
            }
          }}
          onImagePathChange={(path: string) => {
            // P5Sketchコンポーネントから画像パスの変更を受け取る
            console.log('画像パスが変更されました:', path);
            setImagePath(path);
          }}
          onRandomExpressionChange={handleRandomExpressionChange}
          onVoiceSyncStateChange={handleVoiceSyncStateChange}
        />
        
        {/* ZundamonVoiceControllerを追加 */}
        <ZundamonVoiceController
          onLipSyncData={handleLipSyncData}
          onSpeakingStateChange={handleSpeakingStateChange}
          voiceSettings={voiceSettings}
          externalVisible={voiceControllerVisible}
          onVisibilityChange={setVoiceControllerVisible}
        />
        
        <SettingsPanel 
          enableRos2Connection={enableRos2Connection}
          setEnableRos2Connection={setEnableRos2Connection}
          ros2HttpUrl={ros2HttpUrl}
          setRos2HttpUrl={setRos2HttpUrl}
          displayMode={displayMode}
          setDisplayMode={setDisplayMode}
          imagePath={imagePath}
          setImagePath={setImagePath}
          imageScaleMode={imageScaleMode}
          setImageScaleMode={setImageScaleMode}
          imageOpacity={imageOpacity}
          setImageOpacity={setImageOpacity}
          enableRandomExpression={enableRandomExpression}
          setEnableRandomExpression={setEnableRandomExpression}
          randomExpressionList={randomExpressionList}
          setRandomExpressionList={setRandomExpressionList}
          randomIntervalMin={randomIntervalMin}
          setRandomIntervalMin={setRandomIntervalMin}
          randomIntervalMax={randomIntervalMax}
          setRandomIntervalMax={setRandomIntervalMax}
          toggleExpressionInList={toggleExpressionInList}
          enableVoiceSync={enableVoiceSync}
          setEnableVoiceSync={setEnableVoiceSync}
          voiceSettings={voiceSettings}
          setVoiceSettings={setVoiceSettings}
          setLipSyncData={setLipSyncData}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
        />
      </div>
    </React.Fragment>
  )
}

// 設定パネルコンポーネント
function SettingsPanel({ 
  enableRos2Connection, 
  setEnableRos2Connection, 
  ros2HttpUrl, 
  setRos2HttpUrl,
  displayMode,
  setDisplayMode,
  imagePath,
  setImagePath,
  imageScaleMode,
  setImageScaleMode,
  imageOpacity,
  setImageOpacity,
  enableRandomExpression,
  setEnableRandomExpression,
  randomExpressionList,
  setRandomExpressionList,
  randomIntervalMin,
  setRandomIntervalMin,
  randomIntervalMax,
  setRandomIntervalMax,
  toggleExpressionInList,
  enableVoiceSync,
  setEnableVoiceSync,
  voiceSettings,
  setVoiceSettings,
  setLipSyncData,
  showSettings,
  setShowSettings
}: {
  enableRos2Connection: boolean;
  setEnableRos2Connection: (value: boolean) => void;
  ros2HttpUrl: string;
  setRos2HttpUrl: (value: string) => void;
  displayMode: DisplayMode;
  setDisplayMode: (value: DisplayMode) => void;
  imagePath: string;
  setImagePath: (value: string) => void;
  imageScaleMode: ImageScaleMode;
  setImageScaleMode: (value: ImageScaleMode) => void;
  imageOpacity: number;
  setImageOpacity: (value: number) => void;
  enableRandomExpression: boolean;
  setEnableRandomExpression: (value: boolean) => void;
  randomExpressionList: FacialExpression[];
  setRandomExpressionList: (value: FacialExpression[]) => void;
  randomIntervalMin: number;
  setRandomIntervalMin: (value: number) => void;
  randomIntervalMax: number;
  setRandomIntervalMax: (value: number) => void;
  toggleExpressionInList: (expression: string) => void;
  enableVoiceSync: boolean;
  setEnableVoiceSync: (value: boolean) => void;
  voiceSettings: VoiceSettings;
  setVoiceSettings: (value: VoiceSettings) => void;
  setLipSyncData: (data: LipSyncData) => void;
  showSettings: boolean;
  setShowSettings: (value: boolean) => void;
}) {
  const [tempRos2HttpUrl, setTempRos2HttpUrl] = useState(ros2HttpUrl);
  const [tempImagePath, setTempImagePath] = useState(imagePath);
  const [tempImageScaleMode, setTempImageScaleMode] = useState(imageScaleMode);
  const [tempImageOpacity, setTempImageOpacity] = useState(imageOpacity);
  const [availableImages, setAvailableImages] = useState<string[]>([]);
  
  // screenフォルダの画像一覧を取得
  useEffect(() => {
    const loadScreenImages = async () => {
      try {
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
        const availableList: string[] = [];
        
        // 数字のファイル名をチェック (1.jpg, 2.png, 3.gif など)
        for (let i = 1; i <= 20; i++) {
          for (const ext of imageExtensions) {
            const imagePath = `/screen/${i}.${ext}`;
            try {
              const response = await fetch(imagePath, { method: 'HEAD' });
              if (response.ok) {
                availableList.push(imagePath);
              }
            } catch (error) {
              // ファイルが存在しない場合は無視
            }
          }
        }
        
        setAvailableImages(availableList);
        console.log('screenフォルダで見つかった画像:', availableList);
      } catch (error) {
        console.log('画像一覧の取得中にエラーが発生しました:', error);
      }
    };
    
    if (displayMode === 'image') {
      loadScreenImages();
    }
  }, [displayMode]);

  // URLが変更されたときに一時的な状態を更新
  useEffect(() => {
    setTempRos2HttpUrl(ros2HttpUrl);
  }, [ros2HttpUrl]);
  
  // 画像パスが変更されたときに一時的な状態を更新
  useEffect(() => {
    setTempImagePath(imagePath);
  }, [imagePath]);
  
  // 画像スケールモードが変更されたときに一時的な状態を更新
  useEffect(() => {
    setTempImageScaleMode(imageScaleMode);
  }, [imageScaleMode]);
  
  // 画像不透明度が変更されたときに一時的な状態を更新
  useEffect(() => {
    setTempImageOpacity(imageOpacity);
  }, [imageOpacity]);
  
  // URLの適用
  const applyHttpUrl = () => {
    setRos2HttpUrl(tempRos2HttpUrl);
  };
  
  // 画像パスの適用
  const applyImagePath = () => {
    setImagePath(tempImagePath);
  };
  
  // 画像スケールモードの適用
  const applyImageScaleMode = () => {
    setImageScaleMode(tempImageScaleMode);
  };
  
  // 画像不透明度の適用
  const applyImageOpacity = () => {
    setImageOpacity(tempImageOpacity);
  };
  
  // 画像ファイル選択の処理
  const handleImageFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      // ファイルをData URLに変換
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result as string;
        setTempImagePath(dataUrl);
        setImagePath(dataUrl); // 即座に適用
        console.log('画像ファイルが選択されました:', file.name);
      };
      reader.readAsDataURL(file);
    } else {
      alert('画像ファイルを選択してください（jpg, png, gif など）');
    }
  };

  // ドラッグ&ドロップの処理
  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target.result as string;
          setTempImagePath(dataUrl);
          setImagePath(dataUrl); // 即座に適用
          console.log('画像ファイルがドロップされました:', file.name);
        };
        reader.readAsDataURL(file);
      } else {
        alert('画像ファイルをドロップしてください（jpg, png, gif など）');
      }
    }
  };

  // screenフォルダの画像を選択
  const selectScreenImage = (imagePath: string) => {
    setTempImagePath(imagePath);
    setImagePath(imagePath); // 即座に適用
    console.log('screenフォルダの画像が選択されました:', imagePath);
  };
  
  return (
    <>
      {!showSettings && (
        <button 
          className="toggle-settings" 
          onClick={() => setShowSettings(true)}
          title="設定パネルを開く"
        >
          ⚙️ 設定 (S)
        </button>
      )}
      
      <div className={`settings-panel ${showSettings ? '' : 'hidden'}`}>
        <div style={{ 
          background: 'rgba(0, 122, 204, 0.1)', 
          border: '1px solid rgba(0, 122, 204, 0.3)', 
          borderRadius: '6px', 
          padding: '8px 12px', 
          marginBottom: '15px',
          fontSize: '14px',
          color: '#007acc'
        }}>
          💡 <strong>キーボードショートカット:</strong> S = 設定パネル開閉, V = 音声コントローラー開閉
        </div>
        
        <h3>ROS2接続設定</h3>
        
        <label>
          <input 
            type="checkbox" 
            checked={enableRos2Connection}
            onChange={(e) => setEnableRos2Connection(e.target.checked)} 
          />
          ROS2接続を有効化
        </label>
        
        <label>
          HTTP URL:
          <input 
            type="text" 
            value={tempRos2HttpUrl}
            onChange={(e) => setTempRos2HttpUrl(e.target.value)} 
            disabled={!enableRos2Connection}
          />
        </label>
        
        <label>
          画像表示モード:
          <select 
            value={displayMode} 
            onChange={(e) => setDisplayMode(e.target.value as 'face' | 'image')}
          >
            <option value="face">顔アニメーション</option>
            <option value="image">画像表示</option>
          </select>
        </label>
        
        {displayMode === 'image' && (
          <>
            <label>
              画像パス:
              <input 
                type="text" 
                value={tempImagePath}
                onChange={(e) => setTempImagePath(e.target.value)} 
              />
            </label>
            
            <label>
              画像スケールモード:
              <select 
                value={tempImageScaleMode} 
                onChange={(e) => setTempImageScaleMode(e.target.value as 'fit' | 'fill' | 'stretch')}
              >
                <option value="fit">フィット</option>
                <option value="fill">塗りつぶし</option>
                <option value="stretch">ストレッチ</option>
              </select>
            </label>
            
            <label>
              画像不透明度:
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={tempImageOpacity}
                onChange={(e) => setTempImageOpacity(parseFloat(e.target.value))} 
              />
            </label>
            
            <label>
              利用可能な画像:
              <select 
                value={tempImagePath}
                onChange={(e) => setTempImagePath(e.target.value)} 
              >
                <option value="">手動入力または選択</option>
                {availableImages.map((image) => (
                  <option key={image} value={image}>
                    {image}
                  </option>
                ))}
              </select>
            </label>
            
            <label>
              画像ファイル選択:
              <input 
                type="file" 
                accept="image/*"
                onChange={handleImageFileSelect}
              />
            </label>
          </>
        )}
        
        {displayMode === 'face' && (
          <>
            <h3>ランダム表情設定</h3>
            
            <label>
              <input 
                type="checkbox" 
                checked={enableRandomExpression}
                onChange={(e) => setEnableRandomExpression(e.target.checked)} 
              />
              ランダム表情変更を有効化
            </label>
            
            {enableRandomExpression && (
              <>
                <label>
                  変更間隔（最小秒数）:
                  <input 
                    type="number" 
                    min="0.5" 
                    max="60" 
                    step="0.5"
                    value={randomIntervalMin}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val <= randomIntervalMax) {
                        setRandomIntervalMin(val);
                      }
                    }} 
                  />
                </label>
                
                <label>
                  変更間隔（最大秒数）:
                  <input 
                    type="number" 
                    min="0.5" 
                    max="60" 
                    step="0.5"
                    value={randomIntervalMax}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val >= randomIntervalMin) {
                        setRandomIntervalMax(val);
                      }
                    }} 
                  />
                </label>
                
                <div>
                  ランダム対象の表情:
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    {(['neutral', 'happy', 'angry', 'sad', 'surprised', 'crying', 'hurt', 'wink'] as FacialExpression[]).map((expr) => (
                      <label key={expr} style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
                        <input 
                          type="checkbox"
                          checked={randomExpressionList.includes(expr)}
                          onChange={() => toggleExpressionInList(expr)}
                          style={{ marginRight: '4px' }}
                        />
                        {expr}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
        
        {/* 音声連携設定 */}
        <h3>音声連携設定</h3>
        
        <label>
          <input 
            type="checkbox"
            checked={enableVoiceSync}
            onChange={(e) => setEnableVoiceSync(e.target.checked)}
          />
          音声連携を有効化
        </label>
        
        <div style={{ marginBottom: '10px', fontSize: '12px', color: '#999' }}>
          音声連携を有効にすると、右上に🎤ボタンが表示されます。
          <br />
          ボタンをクリックまたは「Vキー」で音声コントローラーを開き、「挨拶」や「ランダムセリフ」を試してください。
          <br />
          音声再生中は日本語の母音（あいうえお）に応じて口の形が自動的に変化します。
        </div>
        
        {enableVoiceSync && (
          <>
            <label>
              音量:
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.1"
                value={voiceSettings.volume}
                onChange={(e) => setVoiceSettings({...voiceSettings, volume: parseFloat(e.target.value)})}
              />
              {voiceSettings.volume}
            </label>
            
            <label>
              速度:
              <input 
                type="range" 
                min="0.5" 
                max="2" 
                step="0.1"
                value={voiceSettings.speed}
                onChange={(e) => setVoiceSettings({...voiceSettings, speed: parseFloat(e.target.value)})}
              />
              {voiceSettings.speed}
            </label>
            
            <label>
              ピッチ:
              <input 
                type="range" 
                min="0.5" 
                max="2" 
                step="0.1"
                value={voiceSettings.pitch}
                onChange={(e) => setVoiceSettings({...voiceSettings, pitch: parseFloat(e.target.value)})}
              />
              {voiceSettings.pitch}
            </label>
            
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
              ※ 音声連携モードでは、他の自動動作（ランダム表情変更等）は無効になります
            </div>
            
            <div style={{ marginTop: '10px' }}>
              <button 
                onClick={() => {
                  // より自然なリップシンクテストパターンを実行
                  const testSequence = [
                    { volume: 0.7, vowel: 'a', openness: 0.8, isPlaying: true },
                    { volume: 0.5, vowel: 'i', openness: 0.3, isPlaying: true },
                    { volume: 0.6, vowel: 'u', openness: 0.4, isPlaying: true },
                    { volume: 0.8, vowel: 'e', openness: 0.5, isPlaying: true },
                    { volume: 0.7, vowel: 'o', openness: 0.7, isPlaying: true },
                    { volume: 0, vowel: 'silent', openness: 0, isPlaying: false }
                  ];
                  
                  let index = 0;
                  const testInterval = setInterval(() => {
                    if (index < testSequence.length) {
                      setLipSyncData(testSequence[index]);
                      index++;
                    } else {
                      clearInterval(testInterval);
                    }
                  }, 500); // 各パターンを500msずつ表示
                }}
                style={{
                  fontSize: '12px',
                  padding: '4px 8px',
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                リップシンクテスト (あいうえお)
              </button>
            </div>
          </>
        )}
        
        <div>
          <button onClick={applyHttpUrl} disabled={!enableRos2Connection}>
            URLを適用
          </button>
          
          {displayMode === 'image' && (
            <>
              <button onClick={applyImagePath}>
                画像パスを適用
              </button>
              
              <button onClick={applyImageScaleMode}>
                スケールモードを適用
              </button>
              
              <button onClick={applyImageOpacity}>
                不透明度を適用
              </button>
            </>
          )}
          
          <button onClick={() => setShowSettings(false)}>
            閉じる
          </button>
        </div>
      </div>
    </>
  );
}
