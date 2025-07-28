import path from 'path'
import { app, ipcMain, screen } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers'
import * as robot from 'robotjs'

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

;(async () => {
  await app.whenReady()

  // macOSでのアクセシビリティ権限をチェック
  if (process.platform === 'darwin') {
    try {
      const pos = robot.getMousePos()
      console.log('✅ robotjs is working. Current mouse position:', pos)
    } catch (error) {
      console.error('❌ robotjs failed. This may indicate missing accessibility permissions:', error)
      console.log('🔧 On macOS, you need to grant accessibility permissions to this app.')
      console.log('Go to: System Preferences > Security & Privacy > Privacy > Accessibility')
      console.log('And add your terminal app or Electron app to the list.')
    }
  }

  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // セキュリティ設定
      nodeIntegration: false,
      contextIsolation: true,
      // タッチジェスチャーを無効化
      experimentalFeatures: false,
    },
  })

  if (isProd) {
    await mainWindow.loadURL('app://./home')
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/home`)
    // mainWindow.webContents.openDevTools()
  }
})()

app.on('window-all-closed', () => {
  app.quit()
})

ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})

// マウスポインタを指定座標に移動させるIPCハンドラー
ipcMain.handle('move-cursor', async (event, x: number, y: number) => {
  try {
    console.log(`🎯 Moving cursor to: (${x}, ${y})`)
    
    // robotjsの設定を調整（より確実な動作のため）
    robot.setMouseDelay(2)
    
    // マウスを移動
    robot.moveMouse(x, y)
    
    // 少し待ってから位置を確認
    await new Promise(resolve => setTimeout(resolve, 10))
    const newPos = robot.getMousePos()
    console.log(`✅ Cursor moved to: (${newPos.x}, ${newPos.y})`)
    
    return { success: true, newPosition: newPos }
  } catch (error) {
    console.error('❌ Failed to move cursor:', error)
    return { success: false, error: error.message }
  }
})

// マウスポインタを指定座標に移動してクリックするIPCハンドラー
ipcMain.handle('move-cursor-and-click', async (event, x: number, y: number) => {
  try {
    console.log(`🎯 Moving cursor to: (${x}, ${y}) and clicking`)
    
    // robotjsの設定を調整
    robot.setMouseDelay(2)
    
    // マウスを移動
    robot.moveMouse(x, y)
    
    // 移動完了を待つ
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // 位置を確認
    const newPos = robot.getMousePos()
    console.log(`✅ Cursor moved to: (${newPos.x}, ${newPos.y})`)
    
    // クリックを実行
    robot.mouseClick()
    console.log(`🖱️ Mouse clicked at: (${newPos.x}, ${newPos.y})`)
    
    return { success: true, newPosition: newPos }
  } catch (error) {
    console.error('❌ Failed to move cursor and click:', error)
    return { success: false, error: error.message }
  }
})

// 現在のマウスポインタ位置を取得するIPCハンドラー
ipcMain.handle('get-cursor-position', async (event) => {
  try {
    const cursorPosition = robot.getMousePos()
    console.log(`📍 Current cursor position: (${cursorPosition.x}, ${cursorPosition.y})`)
    return { success: true, position: cursorPosition }
  } catch (error) {
    console.error('❌ Failed to get cursor position:', error)
    return { success: false, error: error.message }
  }
})
