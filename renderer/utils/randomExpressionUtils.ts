// ランダム表情機能のヘルパー関数

import { FacialExpression } from '../components/FaceDrawing';

/**
 * ランダム表情機能のヘルパークラス
 * プログラム上で簡単にランダム表情を制御するためのユーティリティ
 */
export class RandomExpressionController {
  private enableRandomExpression: boolean = false;
  private randomExpressionList: FacialExpression[] = ['neutral', 'happy', 'angry', 'sad', 'surprised', 'crying', 'hurt', 'wink'];
  private randomIntervalMin: number = 1;
  private randomIntervalMax: number = 5;
  private onStateChange?: (state: RandomExpressionState) => void;

  constructor(onStateChange?: (state: RandomExpressionState) => void) {
    this.onStateChange = onStateChange;
  }

  /**
   * ランダム表情変更を開始
   * @param expressions 対象とする表情のリスト（省略時は全表情）
   * @param minInterval 最小間隔（秒）
   * @param maxInterval 最大間隔（秒）
   */
  start(expressions?: FacialExpression[], minInterval: number = 1, maxInterval: number = 5): void {
    if (expressions) {
      this.randomExpressionList = expressions;
    }
    this.randomIntervalMin = minInterval;
    this.randomIntervalMax = maxInterval;
    this.enableRandomExpression = true;
    
    console.log('ランダム表情変更を開始しました', {
      expressions: this.randomExpressionList,
      interval: `${minInterval}秒 〜 ${maxInterval}秒`
    });
    
    this.notifyStateChange();
  }

  /**
   * ランダム表情変更を停止
   */
  stop(): void {
    this.enableRandomExpression = false;
    console.log('ランダム表情変更を停止しました');
    this.notifyStateChange();
  }

  /**
   * 現在の状態を取得
   */
  getState(): RandomExpressionState {
    return {
      enableRandomExpression: this.enableRandomExpression,
      randomExpressionList: [...this.randomExpressionList],
      randomIntervalMin: this.randomIntervalMin,
      randomIntervalMax: this.randomIntervalMax
    };
  }

  /**
   * 表情リストを設定
   */
  setExpressions(expressions: FacialExpression[]): void {
    this.randomExpressionList = expressions;
    console.log('ランダム対象表情を更新しました:', expressions);
    this.notifyStateChange();
  }

  /**
   * 間隔を設定
   */
  setInterval(minInterval: number, maxInterval: number): void {
    this.randomIntervalMin = minInterval;
    this.randomIntervalMax = maxInterval;
    console.log('ランダム間隔を更新しました:', `${minInterval}秒 〜 ${maxInterval}秒`);
    this.notifyStateChange();
  }

  /**
   * ハッピー系表情のみでランダム変更を開始
   */
  startHappyMode(minInterval: number = 0.5, maxInterval: number = 3): void {
    this.start(['happy', 'wink', 'surprised'], minInterval, maxInterval);
    console.log('ハッピーモードでランダム表情変更を開始しました');
  }

  /**
   * 感情豊かなランダム変更を開始（全表情）
   */
  startEmotionalMode(minInterval: number = 2, maxInterval: number = 8): void {
    this.start(['neutral', 'happy', 'angry', 'sad', 'surprised', 'crying', 'hurt', 'wink'], minInterval, maxInterval);
    console.log('感情豊かモードでランダム表情変更を開始しました');
  }

  /**
   * 高速ランダム変更を開始
   */
  startQuickMode(expressions?: FacialExpression[]): void {
    this.start(expressions || this.randomExpressionList, 0.5, 2);
    console.log('高速モードでランダム表情変更を開始しました');
  }

  /**
   * ゆっくりランダム変更を開始
   */
  startSlowMode(expressions?: FacialExpression[]): void {
    this.start(expressions || this.randomExpressionList, 5, 15);
    console.log('ゆっくりモードでランダム表情変更を開始しました');
  }

  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }
}

/**
 * ランダム表情の状態インターフェース
 */
export interface RandomExpressionState {
  enableRandomExpression: boolean;
  randomExpressionList: FacialExpression[];
  randomIntervalMin: number;
  randomIntervalMax: number;
}

/**
 * 事前定義されたランダム表情パターン
 */
export const RandomExpressionPresets = {
  // ハッピー系のみ
  HAPPY: ['happy', 'wink', 'surprised'] as FacialExpression[],
  
  // ネガティブ系のみ
  NEGATIVE: ['angry', 'sad', 'crying', 'hurt'] as FacialExpression[],
  
  // 基本表情のみ
  BASIC: ['neutral', 'happy', 'angry', 'sad'] as FacialExpression[],
  
  // アクティブな表情
  ACTIVE: ['happy', 'surprised', 'wink'] as FacialExpression[],
  
  // 全表情
  ALL: ['neutral', 'happy', 'angry', 'sad', 'surprised', 'crying', 'hurt', 'wink'] as FacialExpression[]
};

/**
 * 簡単な関数形式のインターフェース
 */
export const randomExpressionUtils = {
  /**
   * グローバルコントローラーインスタンス
   */
  controller: null as RandomExpressionController | null,

  /**
   * 初期化
   */
  init(onStateChange?: (state: RandomExpressionState) => void): RandomExpressionController {
    this.controller = new RandomExpressionController(onStateChange);
    return this.controller;
  },

  /**
   * 簡単な開始関数
   */
  start(preset?: keyof typeof RandomExpressionPresets, minInterval?: number, maxInterval?: number): void {
    if (!this.controller) {
      throw new Error('randomExpressionUtils.init() を先に呼び出してください');
    }
    
    const expressions = preset ? RandomExpressionPresets[preset] : undefined;
    this.controller.start(expressions, minInterval, maxInterval);
  },

  /**
   * 停止
   */
  stop(): void {
    if (!this.controller) {
      throw new Error('randomExpressionUtils.init() を先に呼び出してください');
    }
    this.controller.stop();
  },

  /**
   * 状態取得
   */
  getState(): RandomExpressionState | null {
    return this.controller ? this.controller.getState() : null;
  }
};

/**
 * 使用例:
 * 
 * // 1. 基本的な使用方法
 * const controller = new RandomExpressionController();
 * controller.start(); // 全表情でランダム変更開始
 * controller.stop();  // 停止
 * 
 * // 2. カスタマイズした使用方法
 * controller.start(['happy', 'wink'], 1, 3); // ハッピー系のみ、1-3秒間隔
 * 
 * // 3. プリセットを使用
 * controller.start(RandomExpressionPresets.HAPPY, 0.5, 2);
 * 
 * // 4. 便利メソッドを使用
 * controller.startHappyMode();     // ハッピーモード
 * controller.startEmotionalMode(); // 感情豊かモード
 * controller.startQuickMode();     // 高速モード
 * 
 * // 5. ユーティリティ関数を使用
 * randomExpressionUtils.init();
 * randomExpressionUtils.start('HAPPY', 1, 3);
 * randomExpressionUtils.stop();
 */
