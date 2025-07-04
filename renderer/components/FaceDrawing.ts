// 顔の描画に関するユーティリティ関数とタイプ定義

// 表情の種類
export type FacialExpression = 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised' | 'crying' | 'hurt' | 'wink' | 'talking';

// 画像表示モードの描画処理
export const drawImageMode = (p5: any, loadedImageRef: any, imagePath: string, imageLoadError: string | null, scaleFactorRef: any, dimensions: any, imageScaleMode: string, imageOpacity: number) => {
  // p5.jsで画像を読み込む必要がある場合
  if (!loadedImageRef.current && imagePath) {
    // p5.jsで画像を読み込み中
    p5.fill(255);
    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.textSize(32 * scaleFactorRef.current);
    p5.text('画像を読み込み中...', p5.width / 2, p5.height / 2);
    
    // p5.loadImage()を使用して画像を非同期で読み込み
    p5.loadImage(imagePath, 
      (img: any) => {
        // 読み込み成功
        console.log('p5.jsで画像の読み込みが完了しました');
        loadedImageRef.current = img;
      },
      (err: any) => {
        // 読み込み失敗
        console.error('p5.jsで画像の読み込みに失敗しました:', err);
        loadedImageRef.current = null;
      }
    );
    return;
  }

  if (!loadedImageRef.current) {
    // 画像が読み込まれていない場合はエラーメッセージまたは読み込み中表示
    if (imageLoadError) {
      // エラーメッセージを表示
      p5.fill(255, 100, 100); // 赤っぽい色
      p5.textAlign(p5.CENTER, p5.CENTER);
      p5.textSize(32 * scaleFactorRef.current);
      p5.text('画像の読み込みに失敗しました', p5.width / 2, p5.height / 2 - 50);
      p5.textSize(24 * scaleFactorRef.current);
      p5.text(imagePath, p5.width / 2, p5.height / 2 + 50);
    } else if (imagePath) {
      // 読み込み中表示
      p5.fill(255);
      p5.textAlign(p5.CENTER, p5.CENTER);
      p5.textSize(32 * scaleFactorRef.current);
      p5.text('画像を読み込み中...', p5.width / 2, p5.height / 2);
    } else {
      // 画像パスが指定されていない場合
      p5.fill(128);
      p5.textAlign(p5.CENTER, p5.CENTER);
      p5.textSize(32 * scaleFactorRef.current);
      p5.text('画像パスが指定されていません', p5.width / 2, p5.height / 2);
    }
    return;
  }

  const img = loadedImageRef.current;
  
  // 画像のスケーリング計算
  let drawWidth, drawHeight, drawX, drawY;
  
  switch (imageScaleMode) {
    case 'fit':
      // アスペクト比を保持して画面に収まるようにスケーリング
      const scaleX = dimensions.width / img.width;
      const scaleY = dimensions.height / img.height;
      const scale = Math.min(scaleX, scaleY);
      drawWidth = img.width * scale;
      drawHeight = img.height * scale;
      drawX = (dimensions.width - drawWidth) / 2;
      drawY = (dimensions.height - drawHeight) / 2;
      break;
      
    case 'fill':
      // アスペクト比を保持して画面全体を埋めるようにスケーリング（一部切り取り）
      const scaleXFill = dimensions.width / img.width;
      const scaleYFill = dimensions.height / img.height;
      const scaleFill = Math.max(scaleXFill, scaleYFill);
      drawWidth = img.width * scaleFill;
      drawHeight = img.height * scaleFill;
      drawX = (dimensions.width - drawWidth) / 2;
      drawY = (dimensions.height - drawHeight) / 2;
      break;
      
    case 'stretch':
      // アスペクト比を無視して画面全体に引き伸ばし
      drawWidth = dimensions.width;
      drawHeight = dimensions.height;
      drawX = 0;
      drawY = 0;
      break;
      
    default:
      drawWidth = img.width;
      drawHeight = img.height;
      drawX = (dimensions.width - drawWidth) / 2;
      drawY = (dimensions.height - drawHeight) / 2;
  }
  
  // 透明度を設定
  p5.tint(255, imageOpacity * 255);
  
  // 画像を描画
  p5.image(img, drawX, drawY, drawWidth, drawHeight);
  
  // tintをリセット
  p5.noTint();
};
