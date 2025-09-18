import { FacialExpression } from '../types/FaceAnimationTypes';
import { TalkingMode } from './TalkingMode';
import { MouthPatternController } from './MouthPatternController';

export class KeyboardHandler {
  private displayMode: string;
  private onDisplayModeToggle?: () => void;
  private showHitBoxes: boolean;
  private showStrokingTime: boolean;
  private showTapCount: boolean;
  private setShowHitBoxes: (value: boolean) => void;
  private setShowStrokingTime: (value: boolean) => void;
  private setShowTapCount: (value: boolean) => void;
  private showHitBoxesRef: React.MutableRefObject<boolean>;
  private showStrokingTimeRef: React.MutableRefObject<boolean>;
  private showTapCountRef: React.MutableRefObject<boolean>;
  private setManualExpression: (expression: FacialExpression) => void;
  private savedMousePositionRef: React.MutableRefObject<{ x: number, y: number } | null>;
  private lastActionTimeRef: React.MutableRefObject<number>;
  private togglePictureInPicture?: () => void;
  private talkingMode: TalkingMode;
  private mouthPatternController: MouthPatternController;
  private sendMouthPatternToRos2?: (pattern: string) => Promise<void>;

  constructor(config: {
    displayMode: string;
    onDisplayModeToggle?: () => void;
    showHitBoxes: boolean;
    showStrokingTime: boolean;
    showTapCount: boolean;
    setShowHitBoxes: (value: boolean) => void;
    setShowStrokingTime: (value: boolean) => void;
    setShowTapCount: (value: boolean) => void;
    showHitBoxesRef: React.MutableRefObject<boolean>;
    showStrokingTimeRef: React.MutableRefObject<boolean>;
    showTapCountRef: React.MutableRefObject<boolean>;
    setManualExpression: (expression: FacialExpression) => void;
    savedMousePositionRef: React.MutableRefObject<{ x: number, y: number } | null>;
    lastActionTimeRef: React.MutableRefObject<number>;
    togglePictureInPicture?: () => void;
    sendMouthPatternToRos2?: (pattern: string) => Promise<void>;
  }) {
    this.displayMode = config.displayMode;
    this.onDisplayModeToggle = config.onDisplayModeToggle;
    this.showHitBoxes = config.showHitBoxes;
    this.showStrokingTime = config.showStrokingTime;
    this.showTapCount = config.showTapCount;
    this.setShowHitBoxes = config.setShowHitBoxes;
    this.setShowStrokingTime = config.setShowStrokingTime;
    this.setShowTapCount = config.setShowTapCount;
    this.showHitBoxesRef = config.showHitBoxesRef;
    this.showStrokingTimeRef = config.showStrokingTimeRef;
    this.showTapCountRef = config.showTapCountRef;
    this.setManualExpression = config.setManualExpression;
    this.savedMousePositionRef = config.savedMousePositionRef;
    this.lastActionTimeRef = config.lastActionTimeRef;
    this.togglePictureInPicture = config.togglePictureInPicture;
    this.sendMouthPatternToRos2 = config.sendMouthPatternToRos2;
    this.talkingMode = new TalkingMode();
    this.mouthPatternController = new MouthPatternController();
  }

  public handleKeyPress = (p5: any): boolean => {
    console.log(`キー ${p5.key} が押されました (現在のモード: ${this.displayMode})`);
    
    if (p5.key === 'i' || p5.key === 'I') {
      this.handleDisplayModeToggle();
    } else if (p5.key === 'h' || p5.key === 'H') {
      this.handleHitBoxToggle();
    } else if (p5.key === 't' || p5.key === 'T') {
      this.handleTapCountToggle();
    } else if (p5.key === 'p' || p5.key === 'P') {
      this.handlePictureInPicture();
    } else if (p5.key === 'q' || p5.key === 'Q') {
      this.handleSaveMousePosition();
    } else if (p5.key === 'w' || p5.key === 'W') {
      this.handleRestoreMousePosition();
    } else if (p5.key === 's' || p5.key === 'S') {
      this.handleTalkingModeToggle();
    } else if (p5.key === 'd' || p5.key === 'D') {
      this.handleRandomTalkingModeToggle();
    } else if (p5.key === 'z' || p5.key === 'Z') {
      this.handleMouthPatternChange('mouth_a');
    } else if (p5.key === 'x' || p5.key === 'X') {
      this.handleMouthPatternChange('mouth_i');
    } else if (p5.key === 'c' || p5.key === 'C') {
      this.handleMouthPatternChange('mouth_o');
    } else if (p5.key === '0') {
      this.setManualExpression('pien');
    } else if (this.displayMode === 'face' && p5.key >= '1' && p5.key <= '9') {
      this.handleExpressionChange(p5.key);
    }
    
    return false;
  };

  private handleDisplayModeToggle() {
    console.log('Iキー: 画像モード切り替え開始');
    if (this.onDisplayModeToggle) {
      this.onDisplayModeToggle();
    }
  }

  private handleHitBoxToggle() {
    const newShowHitBoxes = !this.showHitBoxesRef.current;
    const newShowStrokingTime = !this.showStrokingTimeRef.current;
    
    this.setShowHitBoxes(newShowHitBoxes);
    this.showHitBoxesRef.current = newShowHitBoxes;
    
    this.setShowStrokingTime(newShowStrokingTime);
    this.showStrokingTimeRef.current = newShowStrokingTime;
    
    console.log('Hキー: 当たり判定表示切り替え ->', newShowHitBoxes);
    console.log('Hキー: 撫で時間表示切り替え ->', newShowStrokingTime);
  }

  private handleTapCountToggle() {
    const newShowTapCount = !this.showTapCountRef.current;
    
    this.setShowTapCount(newShowTapCount);
    this.showTapCountRef.current = newShowTapCount;
    
    console.log('Tキー: タップ数表示切り替え ->', newShowTapCount);
  }

  private handlePictureInPicture() {
    // Picture-in-Picture機能の実装
    console.log('Pキー: Picture-in-Picture切り替え');
  }

  private handleSaveMousePosition() {
    console.log('Qキー: マウス位置を記録');
    this.saveMousePosition();
  }

  private handleRestoreMousePosition() {
    console.log('Wキー: 記録位置に移動');
    this.restoreMousePosition();
  }

  private handleTalkingModeToggle() {
    console.log('Sキー: おしゃべりモード切り替え');
    this.talkingMode.toggle();
  }

  private handleRandomTalkingModeToggle() {
    console.log('Dキー: ランダムおしゃべりモード切り替え');
    this.talkingMode.toggle(true);
  }

  private handleMouthPatternChange(pattern: 'mouth_a' | 'mouth_i' | 'mouth_o') {
    console.log(`${pattern}キー: 口パターンを${pattern}に変更`);
    
    // 口パターンコントローラーで口だけを制御
    this.mouthPatternController.setMouthPattern(pattern);
    
    // HTTPサーバーにも口パターンを送信
    if (this.sendMouthPatternToRos2) {
      this.sendMouthPatternToRos2(pattern).catch(error => {
        console.warn('口パターン送信失敗:', error);
      });
    }
  }

  public getTalkingMode(): TalkingMode {
    return this.talkingMode;
  }

  public getMouthPatternController(): MouthPatternController {
    return this.mouthPatternController;
  }

  private handleExpressionChange(key: string) {
    const expressionMap: Record<string, FacialExpression> = {
      '1': 'neutral',
      '2': 'happy',
      '3': 'angry',
      '4': 'sad',
      '5': 'surprised',
      '6': 'crying',
      '7': 'hurt',
      '8': 'wink',
      '9': 'mouth3'
    };
    
    const newExpression = expressionMap[key];
    if (newExpression) {
      console.log(`キー ${key} が押されました。表情を ${newExpression} に変更します。`);
      this.setManualExpression(newExpression);
    }
  }

  private async saveMousePosition() {
    const now = Date.now();
    if (now - this.lastActionTimeRef.current < 200) {
      return;
    }
    this.lastActionTimeRef.current = now;
    
    try {
      if (typeof window !== 'undefined' && window.ipc) {
        const result = await window.ipc.getCursorPosition();
        if (result.success) {
          this.savedMousePositionRef.current = result.position;
          console.log('マウス位置を記録しました:', result.position);
        }
      }
    } catch (error) {
      console.error('マウス位置記録中にエラー:', error);
    }
  }

  private async restoreMousePosition() {
    const now = Date.now();
    if (now - this.lastActionTimeRef.current < 200) {
      return;
    }
    this.lastActionTimeRef.current = now;
    
    const position = this.savedMousePositionRef.current;
    if (!position) return;
    
    try {
      if (typeof window !== 'undefined' && window.ipc) {
        const result = await window.ipc.moveCursorAndClick(position.x, position.y);
        if (result.success) {
          console.log('マウスを記録位置に移動してクリックしました');
        }
      }
    } catch (error) {
      console.error('マウス移動中にエラー:', error);
    }
  }
}
