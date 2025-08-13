export class GeometryUtils {
  /**
   * 座標変換ヘルパー関数
   */
  static convertEventCoordinates(
    touchEvent: any,
    canvasRef: React.RefObject<HTMLCanvasElement>,
    fullScreen: boolean,
    dimensions: { width: number; height: number }
  ) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    
    if (fullScreen) {
      // フルスクリーンモードでは、キャンバスが画面中央に配置されている
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const canvasWidth = dimensions.width;
      const canvasHeight = dimensions.height;
      
      // キャンバスが画面の中央に配置されている場合のオフセット
      const offsetX = (screenWidth - canvasWidth) / 2;
      const offsetY = (screenHeight - canvasHeight) / 2;
      
      // 実際のタップ座標からキャンバスの原点を基準とした座標に変換
      return {
        x: touchEvent.clientX - offsetX,
        y: touchEvent.clientY - offsetY
      };
    } else {
      // 通常モードでは従来通りの計算
      return {
        x: touchEvent.clientX - rect.left,
        y: touchEvent.clientY - rect.top
      };
    }
  }

  /**
   * 点が円の範囲内かチェックする関数
   */
  static isPointInCircle(
    point: { x: number; y: number },
    center: { x: number; y: number },
    radius: number
  ): boolean {
    const distance = Math.sqrt(
      Math.pow(point.x - center.x, 2) + Math.pow(point.y - center.y, 2)
    );
    return distance <= radius;
  }

  /**
   * 点が矩形の範囲内かチェックする関数
   */
  static isPointInRect(
    point: { x: number; y: number },
    rect: { x: number; y: number; width: number; height: number }
  ): boolean {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }

  /**
   * 二点間の距離を計算
   */
  static calculateDistance(
    point1: { x: number; y: number },
    point2: { x: number; y: number }
  ): number {
    return Math.sqrt(
      Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)
    );
  }

  /**
   * 正規化されたベクトルを計算
   */
  static normalizeVector(
    vector: { x: number; y: number },
    maxLength: number = 1
  ): { x: number; y: number } {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    if (length === 0) return { x: 0, y: 0 };
    
    const scale = Math.min(length, maxLength) / length;
    return {
      x: vector.x * scale,
      y: vector.y * scale
    };
  }
}
