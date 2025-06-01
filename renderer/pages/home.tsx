import React, { useState, useEffect } from 'react'
import Head from 'next/head'

import { P5Sketch } from '../components/P5Sketch'

export default function HomePage() {
  const [enableRos2Connection, setEnableRos2Connection] = useState(true); // 常にtrueに変更
  const [ros2HttpUrl, setRos2HttpUrl] = useState('http://localhost:8080'); // HTTPエンドポイント

  // 設定の保存と読み込み
  useEffect(() => {
    // ROS2接続は常に有効にする - ローカルストレージからの読み込みをスキップ
    // const savedConnection = localStorage.getItem('enableRos2Connection');
    const savedUrl = localStorage.getItem('ros2HttpUrl');
    
    // ROS2接続は常にtrueに固定
    setEnableRos2Connection(true);
    
    if (savedUrl) {
      setRos2HttpUrl(savedUrl);
    }
  }, []);

  // 設定が変更されたら保存（ROS2接続の状態は常にtrueで保存）
  useEffect(() => {
    localStorage.setItem('enableRos2Connection', 'true'); // 常にtrueで保存
    localStorage.setItem('ros2HttpUrl', ros2HttpUrl);
  }, [ros2HttpUrl]); // enableRos2Connectionを依存関係から削除

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
            position: absolute;
            top: 20px;
            left: 20px;
            padding: 12px;
            background-color: rgba(0, 0, 0, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            color: white;
            z-index: 100;
            font-family: 'Arial', sans-serif;
            transition: opacity 0.3s ease;
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
            position: absolute;
            top: 20px;
            left: 20px;
            padding: 6px 12px;
            background-color: rgba(0, 0, 0, 0.5);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            cursor: pointer;
            z-index: 99;
            opacity: 0.7;
            transition: opacity 0.3s ease;
          }
          
          .toggle-settings:hover {
            opacity: 1;
          }
        `}</style>
      </Head>
      <div className="sketch-container">
        <P5Sketch 
          fullScreen={true} 
          enableRos2Connection={enableRos2Connection}
          ros2HttpUrl={ros2HttpUrl}
        />
        
        <SettingsPanel 
          enableRos2Connection={enableRos2Connection}
          setEnableRos2Connection={setEnableRos2Connection}
          ros2HttpUrl={ros2HttpUrl}
          setRos2HttpUrl={setRos2HttpUrl}
        />
      </div>
    </React.Fragment>
  )
}

// 設定パネルコンポーネント
function SettingsPanel({ enableRos2Connection, setEnableRos2Connection, ros2HttpUrl, setRos2HttpUrl }) {
  const [showSettings, setShowSettings] = useState(false);
  const [tempRos2HttpUrl, setTempRos2HttpUrl] = useState(ros2HttpUrl);
  
  // URLが変更されたときに一時的な状態を更新
  useEffect(() => {
    setTempRos2HttpUrl(ros2HttpUrl);
  }, [ros2HttpUrl]);
  
  // URLの適用
  const applyHttpUrl = () => {
    setRos2HttpUrl(tempRos2HttpUrl);
  };
  
  return (
    <>
      {!showSettings && (
        <button 
          className="toggle-settings" 
          onClick={() => setShowSettings(true)}
        >
          設定表示
        </button>
      )}
      
      <div className={`settings-panel ${showSettings ? '' : 'hidden'}`}>
        <h3>ROS2接続設定</h3>
        
        <label>
          <input 
            type="checkbox" 
            checked={enableRos2Connection}
            onChange={(e) => setEnableRos2Connection(e.target.checked)} 
            disabled={true} // 常に無効化してユーザーが変更できないようにする
          />
          ROS2接続を有効化 (常に有効)
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
        
        <div>
          <button onClick={applyHttpUrl} disabled={!enableRos2Connection}>
            URLを適用
          </button>
          
          <button onClick={() => setShowSettings(false)}>
            閉じる
          </button>
        </div>
      </div>
    </>
  );
}
