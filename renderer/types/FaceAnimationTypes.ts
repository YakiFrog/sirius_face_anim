// 顔アニメーションに関する型定義
export type FacialExpression = 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised' | 'crying' | 'hurt' | 'wink' | 'mouth3' | 'pien';

export type BlinkState = 'normal' | 'blinking' | 'enlarged';

export type DisplayMode = 'face' | 'image';

export type ImageScaleMode = 'fit' | 'fill' | 'stretch';

export interface P5SketchProps {
  fullScreen?: boolean;
  width?: number;
  height?: number;
  eyeSpacingFactor?: number;
  // ROS2接続のための追加プロパティ
  enableRos2Connection?: boolean;
  ros2HttpUrl?: string;
  // 画像表示モードのプロパティ
  displayMode?: DisplayMode;
  imagePath?: string;
  imageScaleMode?: ImageScaleMode;
  imageOpacity?: number;
  // 画像モード切り替えのコールバック
  onDisplayModeToggle?: () => void;
  onImagePathChange?: (path: string) => void;
}

export interface EyeParameters {
  eyeSize: number;
  eyeSpacing: number;
  pupilSize: number;
  eyeYOffset: number;
  easeFactor: number;
  eyeRadius: number;
}

export interface HeadMovement {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  timer: number;
}

export interface ExpressionAnimation {
  active: boolean;
  timer: number;
  intensity: number;
  direction: number;
  jumpCount: number;
  maxJumps: number;
}

export interface ManualExpressionRef {
  isManual: boolean;
  timeout: NodeJS.Timeout | null;
}

export interface TearState {
  active: boolean;
  offset: number;
  speed: number;
  acceleration: number;
  maxSpeed: number;
  size: number;
}

export interface TearSystem {
  left: TearState[];
  right: TearState[];
}

export interface EyePosition {
  x: number;
  y: number;
}

export interface EyePositions {
  left: EyePosition;
  right: EyePosition;
  hitRadius?: number;
}
